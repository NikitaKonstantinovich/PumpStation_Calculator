"""Private, persistent single-worker CAD export queue. No CAD runs in HTTP handlers."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import threading
from urllib.parse import parse_qs, urlparse
import uuid
import zipfile
from functools import lru_cache

MAX_BYTES = 16_000_000
ACTIVE = {"queued", "building"}
HERE = Path(__file__).resolve().parent


READY = {"completed", "partial"}
FORMATS = {"solidworks": "project.zip", "edrawings": "assembly.easm"}
REMEDIES = {
    "source_missing": "Привяжите детализированную модель нужного исполнения в библиотеке.",
    "source_changed": "Обновите привязку к проверенной версии CAD и повторите сборку.",
    "unsupported_geometry": "Задайте точную CAD-модель или поддерживаемую параметрическую геометрию.",
    "import_error": "Проверьте открытие исходника и его зависимости в установленной версии SOLIDWORKS.",
    "part_creation": "Проверьте геометрические параметры, монтажные базы и возможность создания детали.",
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


@lru_cache(maxsize=8192)
def source_hash(path, size, modified, changed):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def stale_source(folder):
    try:
        sources = read_json(folder / "sources.json")
    except (OSError, ValueError):
        return "Данные о версиях исходных файлов недоступны. Повторите сборку."
    for path, expected in sources.items():
        try:
            stat = os.stat(path)
            if source_hash(path, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns) == expected:
                continue
        except OSError:
            pass
        return f"Изменился или отсутствует исходный CAD-файл {Path(path).name}. Повторите сборку."
    return None


def validate(payload):
    if not isinstance(payload, dict) or not re.fullmatch("[0-9a-f]{64}", str(payload.get("snapshotKey", ""))):
        raise ValueError("Не задан идентификатор снимка")
    if not isinstance(payload.get("requestId"), str) or not re.fullmatch(r"[\w-]{1,100}", payload["requestId"]):
        raise ValueError("Некорректный ID запроса")
    m = payload.get("manifest")
    if not isinstance(m, dict) or m.get("version") != 1 or m.get("coordinates") != "right-handed-z-up-mm" or m.get("transformConvention") != "solidworks-row-axes-metres":
        raise ValueError("Неизвестный формат компоновки")
    if not isinstance(m.get("projectId"), str) or not 1 <= len(m["projectId"]) <= 240:
        raise ValueError("Не указан проект")
    parts = m.get("instances")
    if not isinstance(parts, list) or not 1 <= len(parts) <= 30000:
        raise ValueError("Допускается от 1 до 30000 физических деталей")
    ids = set()
    for p in parts:
        if not isinstance(p, dict) or not isinstance(p.get("id"), str) or not 1 <= len(p["id"]) <= 1000 or p["id"] in ids:
            raise ValueError("Повторный или некорректный ID детали")
        ids.add(p["id"])
        if not isinstance(p.get("name"), str) or len(p["name"]) > 1000 or not isinstance(p.get("geometry"), dict) or not isinstance(p.get("hidden"), bool):
            raise ValueError("Некорректное описание детали")
        t = p.get("transform")
        if not isinstance(t, list) or len(t) != 16 or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 10000 for x in t):
            raise ValueError("Некорректная матрица детали")
        rows = [t[i:i+3] for i in (0, 3, 6)]
        dot = lambda a, b: sum(x*y for x, y in zip(a, b))
        if any(abs(dot(a, b) - (1 if i == j else 0)) > 1e-7 for i, a in enumerate(rows) for j, b in enumerate(rows)) or t[12:] != [1, 0, 0, 0]:
            raise ValueError("Масштабирование и деформированные системы координат запрещены")
        a, b, c = rows
        determinant = a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0])
        if abs(determinant-1) > 1e-7:
            raise ValueError("Зеркальная система координат не поддерживается")
    if not isinstance(m.get("warnings"), list) or len(m["warnings"]) > 10000 or any(not isinstance(w, str) or len(w) > 20000 for w in m["warnings"]):
        raise ValueError("Некорректные примечания")
    return payload


class Jobs:
    def __init__(self, state, root, runner, template, python=sys.executable, timeout=1800, part_template=None):
        self.state, self.root = Path(state).resolve(), Path(root).resolve()
        self.state.mkdir(parents=True, exist_ok=True)
        # OS lock is released on crash; do not run two COM queues on this state.
        self.lockfile = (self.state / "worker.lock").open("a+b")
        if os.name == "nt":
            import msvcrt
            self.lockfile.seek(0); self.lockfile.write(b"0"); self.lockfile.flush(); self.lockfile.seek(0)
            msvcrt.locking(self.lockfile.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(self.lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.runner, self.template, self.python, self.timeout = str(Path(runner).resolve()), str(Path(template).resolve()), python, timeout
        self.part_template = str(Path(part_template).resolve()) if part_template else None
        self.lock, self.halted = threading.RLock(), False
        self.db = sqlite3.connect(self.state / "jobs.sqlite", check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, owner TEXT, project TEXT, request TEXT, digest TEXT, body TEXT, UNIQUE(owner,request))")
        for job_id, raw in self.db.execute("SELECT id,body FROM jobs").fetchall():
            job = json.loads(raw)
            interrupted = False
            for fmt, status in job.get("artifacts", {}).items():
                if status == "queued":
                    job["artifacts"][fmt] = "failed"
                    job["exportError"] = "Экспорт прерван. Выберите формат повторно."
                    interrupted = True
            if job["status"] in ACTIVE:
                interrupted = True
                job.update(status="failed", stage="Сборка прервана", error="Исполнитель перезапущен. Проверьте SOLIDWORKS и сформируйте файл повторно.")
            if interrupted:
                self.db.execute("UPDATE jobs SET body=? WHERE id=?", (json.dumps(job, ensure_ascii=False), job_id))
        self.db.commit()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="solidworks")

    def close(self):
        self.executor.shutdown(wait=True)
        self.db.close(); self.lockfile.close()

    def get(self, job_id, owner):
        with self.lock:
            row = self.db.execute("SELECT body FROM jobs WHERE id=? AND owner=?", (job_id, owner)).fetchone()
        return json.loads(row[0]) if row else None

    def latest(self, owner, project):
        with self.lock:
            row = self.db.execute("SELECT body FROM jobs WHERE owner=? AND project=? ORDER BY rowid DESC LIMIT 1", (owner, project)).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, job):
        with self.lock:
            self.db.execute("UPDATE jobs SET body=? WHERE id=?", (json.dumps(job, ensure_ascii=False), job["id"]))
            self.db.commit()

    def submit(self, owner, payload):
        validate(payload)
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        with self.lock:
            previous = self.db.execute("SELECT digest,body FROM jobs WHERE owner=? AND request=?", (owner, payload["requestId"])).fetchone()
            if previous:
                if previous[0] != digest:
                    raise ValueError("ID запроса уже использован для другой компоновки")
                return json.loads(previous[1])
            active = self.latest(owner, payload["manifest"]["projectId"])
            if active and (active["status"] in ACTIVE or "queued" in active.get("artifacts", {}).values()):
                raise ValueError("Для этого проекта уже формируется 3D-файл. Дождитесь завершения.")
            if self.halted:
                raise ValueError("Исполнитель остановлен после тайм-аута. Требуется проверка SOLIDWORKS администратором.")
            queued = [json.loads(r[0]) for r in self.db.execute("SELECT body FROM jobs").fetchall()]
            if sum(j["status"] in ACTIVE for j in queued) >= 20:
                raise ValueError("Очередь заполнена. Повторите позже.")
            job = dict(id=str(uuid.uuid4()), projectId=payload["manifest"]["projectId"], snapshotKey=payload["snapshotKey"], status="queued",
                       artifacts={}, omissions=[],
                       stage="Ожидание сборки", completed=0, total=len(payload["manifest"]["instances"]), warnings=payload["manifest"]["warnings"],
                       createdAt=datetime.now(timezone.utc).isoformat())
            folder = self.state / job["id"]
            folder.mkdir()
            (folder / "request.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            self.db.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?)", (job["id"], owner, job["projectId"], payload["requestId"], digest, json.dumps(job, ensure_ascii=False)))
            self.db.commit()
            self.executor.submit(self.run, job, folder)
            return job.copy()

    def command(self, command, folder, name):
        with (folder / f"{name}.log").open("wb") as log:
            process = subprocess.Popen(command, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            try:
                code = process.wait(timeout=self.timeout)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()
                # COM can outlive its caller; never send the next job to that session.
                self.halted = True
                raise RuntimeError("Превышено время сборки. Исполнитель остановлен до проверки SOLIDWORKS.")
        if code:
            result = folder / "error.json"
            message = json.loads(result.read_text(encoding="utf-8-sig")).get("error") if result.exists() else None
            raise RuntimeError(message or f"Ошибка этапа {name}; подробности в журнале сервера.")

    def run(self, job, folder):
        try:
            if self.halted:
                raise RuntimeError("Очередь остановлена после тайм-аута SOLIDWORKS.")
            job.update(status="building", stage="Проверка исходных моделей и подготовка деталей")
            self.save(job)
            self.command([self.python, str(HERE / "prepare.py"), "--root", str(self.root), "--job", str(folder)], folder, "prepare")
            resolved = read_json(folder / "resolved.json")
            request = read_json(folder / "request.json")["manifest"]
            instances = {part["id"]: part for part in request["instances"]}
            self.record_omissions(job, resolved["omissions"], instances)
            if not resolved["instances"]:
                raise ValueError("Ни одного физического элемента собрать не удалось.")
            job.update(stage="Сборка в SOLIDWORKS и проверка положений")
            self.save(job)
            try:
                self.command([self.runner, str(folder), self.template] + ([self.part_template] if self.part_template else []), folder, "solidworks")
            finally:
                runner_report = folder / "runner-omissions.json"
                if runner_report.exists():
                    self.record_omissions(job, read_json(runner_report), instances)
            included = [p["id"] for p in read_json(folder / "verification.json")["instances"]]
            omitted = [p["id"] for p in job["omissions"]]
            if not included or sorted(included + omitted) != sorted(instances):
                raise RuntimeError("Состав готовой сборки не совпадает со снимком и отчётом.")
            job.update(completed=len(included), status="partial" if omitted else "completed",
                       stage="Сборка готова с предупреждениями" if omitted else "Сборка готова")
            report = {key: job[key] for key in ("id", "projectId", "snapshotKey", "createdAt", "total", "completed", "omissions", "warnings")}
            report["excluded"] = len(omitted)
            (folder / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as error:
            job.update(status="failed", stage="Не удалось сформировать 3D", error=str(error))
        self.save(job)

    @staticmethod
    def record_omissions(job, omissions, instances):
        for omitted in omissions:
            p = instances[omitted["id"]]
            job["omissions"].append({**{k: p[k] for k in ("componentId", "pieceId", "name", "specPosition", "group") if k in p},
                                     **omitted, "remedy": REMEDIES[omitted["code"]]})

    def checked(self, job):
        if job and job.get("snapshotKey") and job["status"] in READY:
            reason = stale_source(self.state / job["id"])
            if reason:
                return {**job, "staleReason": reason}
        return job

    def export(self, owner, job_id, fmt, key):
        if fmt not in FORMATS:
            raise ValueError("Неизвестный формат")
        with self.lock:
            job = self.checked(self.get(job_id, owner))
            if not job:
                raise LookupError("Задание не найдено")
            if job["status"] not in READY or not key or key != job.get("snapshotKey") or job.get("staleReason"):
                raise ValueError("Нужна актуальная готовая сборка")
            if job["artifacts"].get(fmt) == "ready" and (self.state / job_id / FORMATS[fmt]).is_file():
                return job
            if job["artifacts"].get(fmt) == "queued":
                return job
            job["artifacts"][fmt] = "queued"
            job.pop("exportError", None)
            self.save(job)
            self.executor.submit(self.write_format, owner, job_id, fmt)
            return job

    def write_format(self, owner, job_id, fmt):
        folder = self.state / job_id
        error = None
        try:
            if fmt == "edrawings":
                if self.halted:
                    raise RuntimeError("Исполнитель SOLIDWORKS остановлен после тайм-аута.")
                self.command([self.runner, "--edrawings", str(folder)], folder, "edrawings")
            else:
                snapshot = folder / "snapshot"
                if not any(snapshot.rglob("PumpStation.SLDASM")):
                    raise RuntimeError("Файл проверенной сборки отсутствует.")
                temp = folder / "project.pending.zip"
                with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED) as archive:
                    for file in snapshot.rglob("*"):
                        if file.is_file():
                            archive.write(file, file.relative_to(snapshot))
                    for name in ("report.json", "request.json", "verification.json"):
                        archive.write(folder / name, "export/" + name)
                temp.replace(folder / "project.zip")
            if not (folder / FORMATS[fmt]).stat().st_size:
                raise ValueError("Пустой файл экспорта")
        except Exception as exc:
            error = str(exc)
        with self.lock:
            job = self.get(job_id, owner)
            job["artifacts"][fmt] = "failed" if error else "ready"
            if error:
                job["exportError"] = error
            self.save(job)


def handler(jobs, token):
    class Handler(BaseHTTPRequestHandler):
        def json(self, value, status=200):
            body = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(body)

        def owner(self):
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                self.json({"error": "Unauthorized"}, 401); return None
            owner = self.headers.get("X-Cad-Owner", "")
            if not owner or len(owner) > 240:
                self.json({"error": "Unauthorized"}, 401); return None
            return owner

        def do_POST(self):
            owner = self.owner()
            if owner is None: return
            export = re.fullmatch(r"/v1/jobs/([a-f0-9-]{36})/export/(solidworks|edrawings)", self.path)
            if self.path != "/v1/jobs" and not export: self.json({"error": "Not found"}, 404); return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BYTES:
                    self.json({"error": "Недопустимый размер компоновки"}, 413); return
                self.connection.settimeout(20)
                payload = json.loads(self.rfile.read(length))
                job = jobs.export(owner, export[1], export[2], payload.get("snapshotKey")) if export else jobs.submit(owner, payload)
                self.json({"job": job}, 202)
            except LookupError:
                self.json({"error": "Задание не найдено"}, 404)
            except (ValueError, TypeError, KeyError):
                # Validation messages contain no paths or secrets.
                error = sys.exception()
                self.json({"error": str(error)}, 400)
            except Exception:
                self.json({"error": "Ошибка очереди сборки"}, 500)

        def do_GET(self):
            owner = self.owner()
            if owner is None: return
            url = urlparse(self.path)
            if url.path == "/v1/jobs":
                project = parse_qs(url.query).get("projectId", [""])[0]
                if not project or len(project) > 240: self.json({"error": "Не указан проект"}, 400); return
                self.json({"job": jobs.checked(jobs.latest(owner, project))}); return
            match = re.fullmatch(r"/v1/jobs/([a-f0-9-]{36})/download", url.path)
            job = jobs.get(match[1], owner) if match else None
            if not job: self.json({"error": "Задание не найдено"}, 404); return
            query = parse_qs(url.query)
            fmt = query.get("format", [job.get("format")])[0]
            if job.get("snapshotKey"):
                if job["status"] not in READY or query.get("snapshotKey", [""])[0] != job["snapshotKey"] or jobs.checked(job).get("staleReason"):
                    self.json({"error": "Требуется актуальная сборка"}, 409); return
                if fmt != "report" and job["artifacts"].get(fmt) != "ready":
                    self.json({"error": "Файл ещё не готов"}, 409); return
            elif job["status"] != "completed" or fmt != job.get("format"):
                self.json({"error": "Файл ещё не готов"}, 409); return
            filenames = {**FORMATS, "report": "report.json"}
            if fmt not in filenames:
                self.json({"error": "Неизвестный формат"}, 400); return
            path = jobs.state / job["id"] / filenames[fmt]
            if not path.is_file(): self.json({"error": "Файл результата отсутствует"}, 404); return
            self.send_response(200)
            mime = {"solidworks": "application/zip", "edrawings": "application/octet-stream", "report": "application/json"}
            self.send_header("Content-Type", mime[fmt])
            self.send_header("Content-Length", str(path.stat().st_size)); self.end_headers()
            try:
                with path.open("rb") as stream:
                    while chunk := stream.read(1024 * 1024): self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError): pass
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1"); parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--root", type=Path, required=True); parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--runner", type=Path, required=True); parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--part-template", type=Path)
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()
    token = os.environ.get("CAD_EXPORT_TOKEN", "")
    if len(token) < 24: parser.error("Задайте CAD_EXPORT_TOKEN длиной не менее 24 символов")
    if not args.runner.is_file() or not args.template.is_file(): parser.error("Не найден исполнитель или шаблон сборки")
    if args.part_template and not args.part_template.is_file(): parser.error("Не найден шаблон детали")
    jobs = Jobs(args.state, args.root, args.runner, args.template, timeout=args.timeout, part_template=args.part_template)
    server = ThreadingHTTPServer((args.host, args.port), handler(jobs, token))
    try: server.serve_forever()
    finally: server.server_close(); jobs.close()


if __name__ == "__main__": main()
