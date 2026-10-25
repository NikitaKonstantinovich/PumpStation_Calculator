"""Persistent single-worker STEP conversion service. Run behind HTTPS in production.

The HTTP process never imports OCP: each file is converted in an isolated child
process with a timeout. A broken/native-crashing STEP cannot terminate the queue.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlparse
import uuid

FRONTEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(FRONTEND / "scripts"))
from model_assets import CONVERTER_VERSION, convert_step, file_hash, load_library, source_path, valid_stl  # noqa: E402

ACTIVE = {"queued", "searching", "converting"}
ASSET_RE = re.compile(r"model-([a-f0-9]{64})-v1\.stl")


def atomic_json(path, value):
    temporary = path.with_suffix(".pending.json")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


class Jobs:
    def __init__(self, root, state, registry=None, timeout=600, converter=None):
        self.root, self.state, self.registry, self.timeout = root.resolve(), state.resolve(), registry, timeout
        self.assets = self.state / "assets"
        self.assets.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.state / "jobs.sqlite", check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT, project TEXT, request TEXT, created REAL, body TEXT, UNIQUE(owner,request))")
        self.db.execute("CREATE TABLE IF NOT EXISTS assets (hash TEXT PRIMARY KEY, body TEXT)")
        self.db.commit()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="step-queue")
        self.converter = converter or self.convert
        # Jobs retain completed files; interrupted conversion/search is safely repeated.
        for (body,) in self.db.execute("SELECT body FROM jobs ORDER BY created").fetchall():
            job = json.loads(body)
            if job["status"] in ACTIVE:
                self.executor.submit(self.run, job["id"])

    def close(self):
        self.executor.shutdown(wait=True)
        self.db.close()

    def save(self, job):
        job["updatedAt"] = time.time()
        with self.lock:
            self.db.execute("UPDATE jobs SET body=? WHERE id=?", (json.dumps(job, ensure_ascii=False), job["id"]))
            self.db.commit()

    def get(self, job_id, owner=None):
        with self.lock:
            row = self.db.execute("SELECT owner,body FROM jobs WHERE id=?", (job_id,)).fetchone()
        return json.loads(row[1]) if row and (owner is None or row[0] == owner) else None

    def latest(self, owner, project):
        with self.lock:
            rows = self.db.execute("SELECT body FROM jobs WHERE owner=? AND project=? ORDER BY created DESC", (owner, project)).fetchall()
        jobs = [json.loads(row[0]) for row in rows]
        return next((job for job in jobs if job["status"] in ACTIVE), jobs[0] if jobs else None)

    def submit(self, owner, payload):
        project, request_id, items = payload.get("projectId"), payload.get("requestId"), payload.get("items")
        if not isinstance(project, str) or not 1 <= len(project) <= 240 or not isinstance(request_id, str) or not 1 <= len(request_id) <= 100:
            raise ValueError("Не указан проект или идентификатор запроса")
        if not isinstance(items, list) or len(items) > 1000:
            raise ValueError("В спецификации допускается не более 1000 позиций")
        for item in items:
            if not isinstance(item, dict) or any(not isinstance(item.get(k), str) or len(item[k]) > 500 for k in ("key", "name", "position", "equipmentId")):
                raise ValueError("Некорректная позиция спецификации")
        with self.lock:
            existing = self.db.execute("SELECT body FROM jobs WHERE owner=? AND request=?", (owner, request_id)).fetchone()
            if existing:
                return json.loads(existing[0])
            active = self.latest(owner, project)
            if active and active["status"] in ACTIVE:
                return active
            retry_id = payload.get("retryJobId")
            inherited = {"version": 1, "profiles": {}, "equipment": {}}
            if retry_id:
                previous = self.get(retry_id, owner)
                if not previous or previous["projectId"] != project or previous["status"] in ACTIVE:
                    raise ValueError("Задание для повторной попытки не найдено или ещё выполняется")
                failed = {key for task in previous["tasks"] if task["status"] == "error" for key in task["keys"]}
                # A fatal library error has no per-file tasks yet.
                items = previous["items"] if previous.get("fatalError") else [item for item in previous["items"] if item["key"] in failed]
                if not items:
                    raise ValueError("В этом задании нет неудачных конвертаций")
                inherited = previous["profiles"]
            job = {"id": str(uuid.uuid4()), "projectId": project, "requestId": request_id, "status": "queued",
                   "stage": "searching", "items": items, "tasks": [], "total": 0, "completed": 0,
                   "converted": 0, "ready": 0, "missing": [], "errors": [], "current": "", "progress": None,
                   "profiles": deepcopy(inherited), "inheritedProfiles": inherited, "retryOf": retry_id}
            self.db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?)", (job["id"], owner, project, request_id, time.time(), json.dumps(job, ensure_ascii=False)))
            self.db.commit()
            self.executor.submit(self.run, job["id"])
            return deepcopy(job)

    def cached(self, digest, profile):
        with self.lock:
            row = self.db.execute("SELECT body FROM assets WHERE hash=?", (digest,)).fetchone()
        if row:
            info = json.loads(row[0])
            target = self.assets / info["filename"]
            if info.get("converterVersion") == CONVERTER_VERSION and valid_stl(target) and file_hash(target) == info.get("assetHash"):
                return info
        # Reuse committed browser copies when the actual STEP hash still matches.
        manifest_path = FRONTEND / "public/model-assets/manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            old = manifest.get("profiles", {}).get(profile["pumpId"], {}) if profile.get("pumpId") else manifest.get("equipment", {}).get(profile.get("key"), {})
            url = old.get("meshUrl", "")
            if old.get("sourceHash") == digest and re.fullmatch(r"/model-assets/[a-zA-Z0-9_-]+\.stl", url):
                source = FRONTEND / "public" / url.lstrip("/")
                if valid_stl(source) and (not old.get("meshHash") or file_hash(source) == old["meshHash"]):
                    name = f"model-{digest}-{CONVERTER_VERSION}.stl"
                    shutil.copyfile(source, self.assets / name)
                    info = {"filename": name, "bounds": old["bounds"], "units": "mm", "converterVersion": CONVERTER_VERSION}
                    self.register(digest, info)
                    return info
        return None

    def register(self, digest, info):
        info["assetHash"] = file_hash(self.assets / info["filename"])
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO assets VALUES (?,?)", (digest, json.dumps(info)))
            self.db.commit()

    def convert(self, source, digest):
        filename = f"model-{digest}-{CONVERTER_VERSION}.stl"
        with tempfile.TemporaryDirectory(prefix="step-", dir=self.state) as directory:
            temporary = Path(directory)
            # Snapshot also avoids non-ASCII native filesystem paths on Windows.
            cad, stl, metadata = temporary / "source.step", temporary / "mesh.stl", temporary / "metadata.json"
            shutil.copyfile(source, cad)
            if file_hash(cad) != digest:
                raise ValueError("Исходный файл изменился после поиска; повторите подготовку")
            with (temporary / "converter.log").open("wb") as log:
                try:
                    process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--convert-file", str(cad), str(stl), str(metadata)],
                                             stdout=log, stderr=log, timeout=self.timeout, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                except subprocess.TimeoutExpired as error:
                    raise ValueError(f"Превышено время конвертации ({self.timeout} с); остальные модели продолжат обработку") from error
            if process.returncode or not valid_stl(stl):
                reason = json.loads(metadata.read_text(encoding="utf-8")).get("error") if metadata.exists() else None
                raise ValueError(reason or "Конвертер завершился с ошибкой: повреждённый STEP или нехватка памяти")
            if file_hash(source) != digest:
                raise ValueError("Исходный файл изменился во время конвертации; повторите подготовку")
            info = {**json.loads(metadata.read_text(encoding="utf-8")), "filename": filename}
            stl.replace(self.assets / filename)
            self.register(digest, info)
            return info

    @staticmethod
    def add_profile(job, key, profile, digest, info):
        result = {**profile, "key": key, "sourceHash": digest, "bounds": info["bounds"],
                  "meshUrl": "/api/model-preparation/assets/" + info["filename"]}
        if profile.get("sourceHash") and profile["sourceHash"] != digest:
            result["warnings"] = profile["warnings"] + ["Исходный STEP изменён; точки подключения и соответствие каталогу требуют повторной проверки"]
            result["ports"] = [{**p, "provisional": True} for p in profile["ports"]]
        job["profiles"]["equipment"][key] = result
        if key.startswith("pump:"):
            job["profiles"]["profiles"][key[5:]] = result

    def run(self, job_id):
        job = self.get(job_id)
        try:
            # Re-search on restart: actual source hashes and durable cached outputs are authoritative.
            job.update(status="searching", stage="searching", tasks=[], missing=[], errors=[], ready=0, converted=0, completed=0, total=0, progress=None,
                       profiles=deepcopy(job.get("inheritedProfiles", {"version": 1, "profiles": {}, "equipment": {}})))
            job.pop("fatalError", None)
            self.save(job)
            library, grouped, ready_hashes = load_library(self.root, self.registry), {}, set()
            for item in job["items"]:
                key = item["key"]
                job["current"] = item["name"]
                self.save(job)
                profile = library.get(key)
                if not profile:
                    job["missing"].append({"name": item["name"], "position": item["position"], "reason": "В библиотеке нет связи с исходной 3D-моделью"})
                    continue
                try:
                    source = source_path(self.root, profile["source"])
                    digest = file_hash(source)
                    info = self.cached(digest, profile)
                    if info:
                        ready_hashes.add(digest)
                        self.add_profile(job, key, profile, digest, info)
                        continue
                    task_id = digest
                    reason = None
                except FileNotFoundError as error:
                    job["missing"].append({"name": item["name"], "position": item["position"], "reason": str(error)})
                    continue
                except (OSError, ValueError) as error:
                    digest, reason, task_id = "", str(error), "invalid:" + profile["source"]
                task = grouped.setdefault(task_id, {"keys": [], "names": [], "status": "queued", "hash": digest, "reason": reason})
                if key not in task["keys"]:
                    task["keys"].append(key)
                if item["name"] not in task["names"]:
                    task["names"].append(item["name"])
            job.update(tasks=list(grouped.values()), total=len(grouped), ready=len(ready_hashes), status="converting", stage="converting", progress=0)
            self.save(job)
            for task in job["tasks"]:
                task["status"] = "running"
                job["current"] = ", ".join(task["names"])
                self.save(job)
                try:
                    if task["reason"]:
                        raise ValueError(task["reason"])
                    profile = library[task["keys"][0]]
                    source = source_path(self.root, profile["source"])
                    if file_hash(source) != task["hash"]:
                        raise ValueError("Исходный файл изменился после поиска; повторите подготовку")
                    # Other completed jobs may have already converted the same hash.
                    info = self.cached(task["hash"], profile)
                    reused = info is not None
                    if not info:
                        info = self.converter(source, task["hash"])
                    for key in task["keys"]:
                        self.add_profile(job, key, library[key], task["hash"], info)
                    task["status"] = "ready" if reused else "success"
                    job["ready" if reused else "converted"] += 1
                except Exception as error:
                    task["status"], task["reason"] = "error", str(error)
                    job["errors"].append({"name": ", ".join(task["names"]), "reason": str(error)})
                job["completed"] += 1
                job["progress"] = 100 * job["completed"] / job["total"]
                self.save(job)
            job.update(status="completed_with_errors" if job["errors"] else "completed", stage="finished", progress=100, current="")
        except Exception as error:
            job.update(status="completed_with_errors", stage="finished", current="", fatalError=str(error))
            job["errors"].append({"name": "Поиск моделей", "reason": str(error)})
        self.save(job)


class Handler(BaseHTTPRequestHandler):
    server_version = "PumpModelConverter/1"

    def response(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def authorized(self):
        return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.token) and bool(self.headers.get("X-Model-Owner"))

    def do_GET(self):
        if not self.authorized():
            return self.response({"error": "Доступ к сервису конвертации не разрешён"}, 401)
        parsed, owner, jobs = urlparse(self.path), self.headers["X-Model-Owner"], self.server.jobs
        if parsed.path == "/v1/jobs":
            project = parse_qs(parsed.query).get("projectId", [""])[0]
            return self.response({"job": jobs.latest(owner, project)})
        if parsed.path.startswith("/v1/assets/"):
            filename = parsed.path.removeprefix("/v1/assets/")
            match = ASSET_RE.fullmatch(filename)
            if match:
                with jobs.lock:
                    row = jobs.db.execute("SELECT body FROM assets WHERE hash=?", (match[1],)).fetchone()
                path = jobs.assets / filename
                if row and json.loads(row[0])["filename"] == filename and path.is_file():
                    self.send_response(200)
                    self.send_header("Content-Type", "model/stl")
                    self.send_header("Content-Length", str(path.stat().st_size))
                    self.end_headers()
                    with path.open("rb") as stream:
                        shutil.copyfileobj(stream, self.wfile)
                    return
        return self.response({"error": "Модель или задание не найдены"}, 404)

    def do_POST(self):
        if not self.authorized():
            return self.response({"error": "Доступ к сервису конвертации не разрешён"}, 401)
        if self.path != "/v1/jobs":
            return self.response({"error": "Маршрут не найден"}, 404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 500_000:
                return self.response({"error": "Слишком большой запрос"}, 413)
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Некорректный запрос")
            return self.response({"job": self.server.jobs.submit(self.headers["X-Model-Owner"], payload)}, 202)
        except (ValueError, TypeError) as error:
            return self.response({"error": str(error)}, 400)

    def log_message(self, format, *args):
        # Do not log authorization headers, project IDs, or full request bodies.
        print(time.strftime("%Y-%m-%d %H:%M:%S"), self.command, args[1] if len(args) > 1 else "", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=FRONTEND.parent)
    parser.add_argument("--state", type=Path, default=FRONTEND / ".model-converter")
    parser.add_argument("--registry", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--convert-file", nargs=3, metavar=("SOURCE", "STL", "METADATA"))
    args = parser.parse_args()
    if args.convert_file:
        source, target, metadata = map(Path, args.convert_file)
        try:
            atomic_json(metadata, convert_step(source, target))
        except Exception as error:
            atomic_json(metadata, {"error": str(error)})
            raise SystemExit(1)
        return
    token = os.environ.get("MODEL_CONVERTER_TOKEN", "")
    if len(token) < 24:
        parser.error("Задайте MODEL_CONVERTER_TOKEN длиной не менее 24 символов")
    jobs = Jobs(args.root, args.state, args.registry, args.timeout)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.jobs, server.token = jobs, token
    print(f"Model converter listening on {args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        jobs.close()


if __name__ == "__main__":
    main()
