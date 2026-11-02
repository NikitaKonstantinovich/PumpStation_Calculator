"""Real mixed-source build and all three downloads through the private service API."""
import argparse
import hashlib
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
import time
from urllib.request import Request, urlopen
from uuid import uuid4
import zipfile

from server import Jobs, handler


def main():
    parser = argparse.ArgumentParser()
    for arg in ("runner", "state", "root", "template", "part-template"):
        parser.add_argument("--" + arg, type=Path, required=True)
    args = parser.parse_args()
    native = json.loads((args.root / "frontend/data/instrument-mounts.json").read_text(encoding="utf-8"))["assets"]["valve"]
    instances = []
    def part(name, x, geometry):
        labels={"tube":"Труба Ø60,3×3 мм L=200 мм", "flange":"Фланец DN65 PN16", "valve":"Кран LD Pride DN15"}
        instances.append(dict(id=name, componentId=name, name=labels.get(name,name), detailName=labels.get(name,name),
            appearance={"tube":"red","flange":"metal"}.get(name), specPosition=str(len(instances)+1), group="Тестовая ветвь",
            hidden=name == "flange", transform=[0,1,0,-1,0,0,0,0,1,x,.25,.5,1,0,0,0], geometry=geometry))
    part("tube", 1, dict(kind="tube", lengthMm=200, outerMm=60.3, innerMm=54.3))
    part("valve", 2, dict(kind="native", hash=native["sourceHash"]))
    part("missing", 3, dict(kind="native", hash="0"*64))
    part("flange", 4, dict(kind="flange", lengthMm=20, outerMm=165, innerMm=60, boltCircleMm=125, boltHoles=4, boltHoleMm=18))
    key = hashlib.sha256(json.dumps(instances).encode()).hexdigest()
    project = str(uuid4())
    manifest = dict(projectId=project, version=1, coordinates="right-handed-z-up-mm",
                    transformConvention="solidworks-row-axes-metres", warnings=[], instances=instances)
    token = secrets.token_hex(32)
    jobs = Jobs(args.state, args.root, args.runner, args.template, part_template=args.part_template, timeout=180)
    http = ThreadingHTTPServer(("127.0.0.1", 0), handler(jobs, token))
    threading.Thread(target=http.serve_forever, daemon=True).start()
    def request(path, data=None, binary=False):
        req = Request(f"http://127.0.0.1:{http.server_port}/v1/jobs" + path,
                      data=json.dumps(data).encode() if data is not None else None,
                      headers={"Authorization":"Bearer " + token, "X-Cad-Owner":"test", "Content-Type":"application/json"})
        with urlopen(req, timeout=30) as response:
            return response.read() if binary else json.load(response)["job"]
    def wait(until):
        deadline = time.monotonic() + 390
        while time.monotonic() < deadline:
            job = request("?projectId=" + project)
            if job["status"] == "failed" or job.get("exportError"): raise RuntimeError(job)
            if until(job): return job
            time.sleep(1)
        raise TimeoutError("Test timed out")
    try:
        request("", dict(requestId=str(uuid4()), snapshotKey=key, manifest=manifest))
        job = wait(lambda j: j["status"] == "partial")
        assert job["completed"] == 3 and job["total"] == 4 and [o["id"] for o in job["omissions"]] == ["missing"]
        folder = args.state / job["id"]
        check = folder / "verification.json"
        stamp = check.stat().st_mtime_ns
        verified = json.loads(check.read_text(encoding="utf-8-sig"))["instances"]
        assert {p["id"] for p in verified} == {"tube", "valve", "flange"}
        tube=next(p for p in verified if p["id"]=="tube")
        assert tube["component"].startswith("Труба Ø60.3×3 мм") and tube["file"].lower().endswith(".sldprt")
        assert tube["solids"]>0 and tube["rgb"][0]>.7 and tube["rgb"][2]<.1
        for fmt, filename in (("solidworks", "project.zip"), ("edrawings-exe", "assembly.exe"), ("edrawings", "assembly.easm")):
            prefix = "/" + job["id"]
            request(prefix + "/export/" + fmt, {"snapshotKey":key})
            wait(lambda j: j["artifacts"].get(fmt) == "ready")
            body = request(prefix + "/download?format=" + fmt + "&snapshotKey=" + key, binary=True)
            assert body and body == (folder / filename).read_bytes()
        report = json.loads(request(prefix + "/download?format=report&snapshotKey=" + key, binary=True))
        with zipfile.ZipFile(folder / "project.zip") as archive:
            assert archive.testzip() is None and json.loads(archive.read("export/report.json")) == report
            assert any(p.lower().endswith("pumpstation.sldasm") for p in archive.namelist())
        assert check.stat().st_mtime_ns == stamp
        print(f"PASS 3/4, ZIP + EASM + EXE, {folder}", flush=True)
    finally:
        http.shutdown()
        http.server_close()
        jobs.close()

if __name__ == "__main__":
    main()
