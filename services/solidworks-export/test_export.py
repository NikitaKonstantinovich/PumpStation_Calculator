import json
import hashlib
import zipfile
import importlib.util
from pathlib import Path
import tempfile
import shutil
import subprocess
import sys
import threading
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location("cad_" + name, HERE / (name + ".py"))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


server, prepare = module("server"), module("prepare")


def payload():
    return dict(requestId="request-1", snapshotKey="a"*64, manifest=dict(version=1, projectId="p", projectName="Test",
        coordinates="right-handed-z-up-mm", transformConvention="solidworks-row-axes-metres", warnings=[],
        instances=[dict(id="part", name="Fixture", hidden=False, transform=[1,0,0,0,1,0,0,0,1,1,.2,.3,1,0,0,0], geometry={"kind":"tube","outerMm":60,"innerMm":54,"lengthMm":100})]))


class ContractTests(unittest.TestCase):
    def test_prepare_runs_from_staged_worker_using_only_configured_root(self):
        root = HERE.parents[2]
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            script = work / "release" / "service" / "prepare.py"
            script.parent.mkdir(parents=True)
            shutil.copyfile(HERE / "prepare.py", script)
            job = work / "job"
            job.mkdir()
            data = payload()
            # A real library flange exercises both registry loading and the source hash check.
            stock = json.loads((root / "frontend/data/stamped-loose-flanges.json").read_bytes())["parts"]["100"]
            data["manifest"]["instances"][0].update(equipmentId="фланцы-006-r0118",
                geometry=dict(kind="flange", stampedHash=stock["sourceHash"], **stock["dimensions"]))
            (job / "request.json").write_text(json.dumps(data), encoding="utf-8")
            result = subprocess.run([sys.executable, "-I", str(script), "--root", str(root), "--job", str(job)],
                                    cwd=work, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            resolved = json.loads((job / "resolved.json").read_bytes())
            self.assertEqual(resolved["omissions"], [])
            self.assertEqual(resolved["instances"][0]["sourceHash"], stock["sourceHash"])

    def test_stamp_requires_the_reviewed_file_and_exact_mount_never_a_generated_plate(self):
        root = HERE.parents[2]
        index = json.loads((root/"frontend/data/stamped-loose-flanges.json").read_bytes())
        sku = "фланцы-006-r0118"
        source = index["parts"]["100"]
        original = payload()["manifest"]["instances"][0]
        good = {"kind":"flange", **source["dimensions"], "stampedHash":source["sourceHash"]}
        cases = [good, dict(good,innerMm=130), {"kind":"flange",**index["catalog"][sku]["previous"]},
                 {"kind":"unavailable","shape":dict(good),"reason":"Посадка не подтверждена"}]
        with tempfile.TemporaryDirectory() as temp, patch.object(prepare,"library",return_value=[]):
            folder = Path(temp)
            request = {"manifest":{"instances":[dict(original,id=str(i),geometry=g,equipmentId=sku) for i,g in enumerate(cases)]}}
            (folder/"request.json").write_text(json.dumps(request),encoding="utf8")
            prepare.prepare(root,folder)
            result = json.loads((folder/"resolved.json").read_bytes())
            part, = result["instances"]
            self.assertEqual((part["id"],part["sourceFile"],part["origin"]),("0",source["source"],"library"))
            self.assertEqual([(w["id"],w["code"]) for w in result["omissions"]],[(str(i),"unsupported_geometry") for i in (1,2,3)])

    @unittest.skipUnless(server.os.name=="nt","Windows eDrawings acceptance")
    def test_viewer_mismatch_rejects_only_easm_and_can_retry(self):
        class ViewerJobs(server.Jobs):
            reject=True
            def command(self, cmd, folder, stage):
                if stage=="edrawings": (folder/"assembly.easm").write_bytes(b"fixture")
                elif stage=="check-edrawings":
                    self.expected=(folder/"verified-tree.txt").read_text(encoding="utf-8-sig").splitlines()
                    if self.reject:raise RuntimeError("missing occurrence in eDrawings")
                else:raise AssertionError("format export attempted to rebuild")
        with tempfile.TemporaryDirectory() as temporary:
            data=Path(temporary); jobs=ViewerJobs(data,HERE,"runner","template")
            try:
                folder=data/"fixture";folder.mkdir()
                (folder/"sources.json").write_text("{}")
                (folder/"verification.json").write_text(json.dumps(dict(instances=[dict(component="Труба-1",file="pipe.sldprt")])))
                ready=dict(id="fixture",projectId="p",status="partial",artifacts={"solidworks":"ready"},snapshotKey="a"*64)
                jobs.db.execute("insert into jobs values (?,?,?,?,?,?)",("fixture","owner","p","req","digest",json.dumps(ready)));jobs.db.commit()
                for status in ("failed","ready"):
                    jobs.export("owner","fixture","edrawings",ready["snapshotKey"])
                    jobs.executor.submit(lambda:None).result()
                    j=jobs.get("fixture","owner")
                    self.assertEqual(j["artifacts"],{"solidworks":"ready","edrawings":status})
                    self.assertEqual(j["status"],"partial")
                    self.assertEqual(jobs.expected,["Труба-1"])
                    jobs.reject=False
            finally:jobs.close()

    @unittest.skipUnless(server.os.name=="nt","Windows eDrawings publisher")
    def test_exe_first_reuses_checked_easm_and_a_failed_exe_does_not_remove_it(self):
        class ViewerJobs(server.Jobs):
            stages=[]
            invalid=True
            def command(self, cmd, folder, stage):
                self.stages.append(stage)
                if stage=="edrawings": (folder/"assembly.easm").write_bytes(b"station")
                elif stage=="publish-exe":
                    self.assert_names=Path(cmd[cmd.index("-ExpectedNames")+1]).read_text(encoding="utf-8-sig")
                    Path(cmd[-1]).write_bytes(b"not an exe" if self.invalid else b"MZ"+bytes(58)+bytes([64,0,0,0])+b"PE\0\0\x64\x86")
                elif stage!="check-edrawings": raise AssertionError("Unexpected rebuild")
        with tempfile.TemporaryDirectory() as tmp:
            jobs=ViewerJobs(Path(tmp),HERE,"runner","template")
            try:
                folder=Path(tmp)/"j";folder.mkdir()
                (folder/"sources.json").write_text("{}")
                (folder/"verification.json").write_text(json.dumps({"instances":[{"component":"Pipe-1","file":"pipe.sldprt"}]}))
                key="b"*64
                ready=dict(id="j",projectId="p",status="partial",artifacts={"solidworks":"ready"},snapshotKey=key)
                jobs.db.execute("insert into jobs values (?,?,?,?,?,?)",("j","owner","p","req","digest",json.dumps(ready)));jobs.db.commit()
                with self.assertRaises(LookupError): jobs.export("other","j","edrawings-exe",key)
                with self.assertRaises(ValueError): jobs.export("owner","j","edrawings-exe","c"*64)
                for expected in ["failed","ready"]:
                    jobs.export("owner","j","edrawings-exe",key)
                    jobs.executor.submit(lambda: None).result()
                    self.assertEqual(jobs.get("j","owner")["artifacts"], {"solidworks":"ready","edrawings":"ready","edrawings-exe":expected})
                    self.assertEqual((folder/"assembly.exe").exists(),expected=="ready")
                    self.assertEqual(list(folder.glob("*.pending.exe")),[])
                    jobs.invalid=False
                jobs.export("owner","j","edrawings",key)
                jobs.export("owner","j","edrawings-exe",key)
                jobs.executor.submit(lambda: None).result()
                self.assertEqual(jobs.stages,["edrawings","check-edrawings","publish-exe","publish-exe"])
                self.assertEqual(jobs.assert_names,"Pipe-1")
            finally:jobs.close()

    def test_catalog_configs_and_bearing_datum(self):
        rows=json.loads((HERE.parents[1]/"data/solidworks-parts.json").read_text(encoding="utf8"))
        part={"name":"Болт М16×130 DIN 933 Ц", "geometry":dict(kind="rod",hardware="bolt",nominalMm=16,lengthMm=130,flatsMm=24,headMm=10)}
        entry,t=prepare.library_part(part,rows)
        self.assertIn("130",entry["configuration"])
        # Native bolt shank runs towards -Z, head bears at Z=0. CAD placement
        # must send its tip to X=130 mm in the fastener's local coordinates.
        self.assertAlmostEqual(-.13*t[6]+t[9],.13)
        nut={"name":"Гайка М16 DIN934 Ц", "geometry":dict(kind="hex",hardware="nut",nominalMm=16,lengthMm=13,flatsMm=24,seatAtEnd=True,maxNutMm=16)}
        original,t=prepare.library_part(nut,rows)
        self.assertAlmostEqual(t[9]+original["dimensions"]["lengthMm"]/1000,.013)
        nut["geometry"]["maxNutMm"]=13
        self.assertIsNone(prepare.library_part(nut,rows))
        flange={"name":"Фланец свободный","equipmentId":"фланцы-006-r0118","geometry":dict(kind="flange",lengthMm=22,outerMm=220,innerMm=120,boltCircleMm=180,boltHoles=8,boltHoleMm=18)}
        self.assertIn("HECO",prepare.library_part(flange,rows)[0]["source"])
        flange["geometry"]["innerMm"]=118
        self.assertIsNone(prepare.library_part(flange,rows))
        gaskets=json.loads((HERE.parents[1]/"data/solidworks-gaskets.json").read_text(encoding="utf8"))
        gasket=dict(name="Прокладка DN100",componentId="line-test-gasket",equipmentId="прокладки-001-r0012",geometry=dict(kind="catalogue",parameters={"length":2}))
        chosen,t=prepare.library_part(gasket,gaskets)
        self.assertEqual(chosen["dimensions"],{"innerMm":105,"outerMm":160,"lengthMm":2})
        self.assertEqual(t[3:6],[1,0,0])  # native Y becomes the pipe axis
        gasket["geometry"]["parameters"]["length"]=3
        self.assertIsNone(prepare.library_part(gasket,gaskets))

    def test_watchdog_observes_only_forward_progress_and_keeps_absolute_limit(self):
        def simulate(ticks, *, stage="solidworks", cap=100):
            class Process:
                now = 0
                def poll(self): return None
                def wait(self, timeout):
                    self.now += timeout
                    if not ticks: return 0
                    phase, done = ticks.pop(0)
                    (folder / "progress.json").write_text(json.dumps(dict(phase=phase, done=done, total=10)))
                    raise server.subprocess.TimeoutExpired("runner", timeout)
            proc = Process()
            with tempfile.TemporaryDirectory() as temp:
                folder = Path(temp)
                try: result = server.wait_stage(proc, folder, stage, 10, cap, lambda:proc.now)
                except TimeoutError: result = "timeout"
            return result, proc.now
        forward = [("import", 5), ("import", 10), ("insert", 0), ("insert", 2), ("rebuild", 0)]
        self.assertEqual(simulate(forward[:]), (0, 30))
        self.assertEqual(simulate(forward[:], cap=16), ("timeout", 16))
        self.assertEqual(simulate([("insert", 4), ("insert", 4), ("import", 10)]), ("timeout", 15))
        self.assertEqual(simulate(forward[:], stage="edrawings"), ("timeout", 10))

    def test_prepare_timeout_keeps_queue_available_but_stuck_com_is_quarantined(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); jobs = server.Jobs(folder, HERE, "runner", "template")
            try:
                for stage, quarantine in (("prepare", False), ("solidworks", True)):
                    proc = Mock()
                    with patch.object(server.subprocess, "Popen", return_value=proc), patch.object(server, "wait_stage", side_effect=TimeoutError("Нет прогресса")):
                        with self.assertRaisesRegex(RuntimeError, "Нет прогресса"):
                            jobs.command(["test"], folder, stage)
                    proc.kill.assert_called_once(); proc.wait.assert_called_once()
                    self.assertEqual(jobs.halted, quarantine)
            finally: jobs.close()

    def test_active_snapshot_progress_cannot_make_a_job_downloadable(self):
        with tempfile.TemporaryDirectory() as temp:
            jobs = server.Jobs(temp, HERE, "runner.exe", "assembly.asmdot")
            try:
                folder = Path(temp) / "job"; folder.mkdir()
                job = dict(id="job", status="building", stage="Подготовка", completed=0)
                path = folder / "progress.json"
                path.write_text(json.dumps(dict(phase="insert", done=20, total=50)))
                current = jobs.checked(job)
                self.assertEqual(current["stage"], "Размещение элементов: 20 из 50")
                self.assertEqual((current["status"], current["completed"]), ("building", 0))
                path.write_text("{")
                self.assertEqual(jobs.checked(job), job)
                path.write_text(json.dumps(dict(phase="verify", done=0, total=0)))
                failed = {**job, "status":"failed", "stage":"Ошибка"}
                self.assertEqual(jobs.checked(failed), failed)
            finally: jobs.close()

    def test_reject_scaled_mirrored_and_duplicate_placements(self):
        for patch in ([2,0,0,0,1,0,0,0,1], [-1,0,0,0,1,0,0,0,1]):
            p = payload(); p["manifest"]["instances"][0]["transform"][:9] = patch
            with self.assertRaises(ValueError): server.validate(p)
        p = payload(); p["manifest"]["instances"] *= 2
        with self.assertRaises(ValueError): server.validate(p)

    def test_partial_snapshot_recovery_lazy_formats_and_ownership(self):
        class FixtureJobs(server.Jobs):
            def command(self, cmd, folder, stage):
                if stage == "prepare":
                    parts = server.read_json(folder / "request.json")["manifest"]["instances"]
                    resolved = [p for p in parts if p["geometry"]["kind"] != "unavailable"]
                    omitted = [dict(id=p["id"], code="unsupported_geometry", reason="Нет геометрии") for p in parts if p not in resolved]
                    (folder / "resolved.json").write_text(json.dumps(dict(instances=resolved, omissions=omitted)))
                    (folder / "sources.json").write_text("{}")
                elif stage == "solidworks":
                    if server.read_json(folder / "request.json")["requestId"] == "technical":
                        raise RuntimeError("Ошибка перестроения сборки")
                    resolved = server.read_json(folder / "resolved.json")["instances"]
                    (folder / "snapshot").mkdir()
                    (folder / "snapshot/PumpStation.SLDASM").write_bytes(b"assembly fixture")
                    (folder / "verification.json").write_text(json.dumps(dict(instances=resolved)))
                elif stage == "edrawings":
                    (folder / "assembly.easm").write_bytes(b"viewer fixture")
        with tempfile.TemporaryDirectory() as temp:
            def open_jobs(): return FixtureJobs(temp, HERE, "runner.exe", "assembly.asmdot")
            jobs = open_jobs()
            p = payload()
            missing = dict(id="missing", componentId="c2", specPosition="42", group="Контур 2", name="Кран", hidden=True,
                           transform=p["manifest"]["instances"][0]["transform"], geometry={"kind":"unavailable"})
            p["manifest"]["instances"].append(missing)
            job_id = jobs.submit("owner", p)["id"]
            jobs.close()
            jobs = open_jobs()
            try:
                ready = jobs.latest("owner","p")
                self.assertEqual((ready["status"],ready["completed"],ready["total"]), ("partial",1,2))
                self.assertEqual(ready["omissions"][0]["specPosition"], "42")
                self.assertEqual(jobs.submit("owner",p)["id"],job_id)
                self.assertIsNone(jobs.get(job_id,"other"))
                with self.assertRaises(LookupError): jobs.export("other",job_id,"solidworks","a"*64)
                with self.assertRaises(ValueError): jobs.export("owner",job_id,"solidworks","b"*64)
                self.assertEqual(ready["artifacts"],{})
                jobs.export("owner",job_id,"solidworks","a"*64)
                jobs.export("owner",job_id,"edrawings","a"*64)
                jobs.executor.submit(lambda: None).result()
                with zipfile.ZipFile(Path(temp)/job_id/"project.zip") as archive:
                    report=json.loads(archive.read("export/report.json"))
                    self.assertEqual(report["omissions"],ready["omissions"])
                self.assertEqual(jobs.export("owner",job_id,"edrawings","a"*64)["artifacts"]["edrawings"],"ready")
                # A failing new attempt cannot overwrite either artifact from the old one.
                p["requestId"]="empty"
                p["manifest"]["instances"]=[missing]
                jobs.submit("owner",p)
                jobs.executor.submit(lambda: None).result()
                self.assertEqual(jobs.latest("owner","p")["status"],"failed")
                self.assertEqual(jobs.get(job_id,"owner")["status"],"partial")
                for request_id, status in [("complete","completed"), ("technical","failed")]:
                    attempt = payload()
                    attempt["requestId"] = request_id
                    attempt_id = jobs.submit("owner",attempt)["id"]
                    jobs.executor.submit(lambda: None).result()
                    result = jobs.get(attempt_id,"owner")
                    self.assertEqual(result["status"], status)
                    if status == "failed":
                        with self.assertRaises(ValueError): jobs.export("owner",attempt_id,"solidworks","a"*64)
                    else:
                        self.assertEqual(result["completed"],1)
                        jobs.export("owner",attempt_id,"solidworks","a"*64)
                        jobs.executor.submit(lambda: None).result()
                        self.assertEqual(jobs.get(attempt_id,"owner")["artifacts"]["solidworks"],"ready")
                http = ThreadingHTTPServer(("127.0.0.1",0),server.handler(jobs,"test-token"))
                thread=threading.Thread(target=http.serve_forever,daemon=True); thread.start()
                try:
                    url=f"http://127.0.0.1:{http.server_port}/v1/jobs/{job_id}/download?format=report&snapshotKey="+"a"*64
                    for owner, status in [("other",404),("owner",200)]:
                        req=Request(url,headers={"Authorization":"Bearer test-token","X-Cad-Owner":owner})
                        if status==200:
                            with urlopen(req) as response: self.assertEqual(json.load(response), report)
                        else:
                            with self.assertRaises(HTTPError) as e: urlopen(req)
                            self.assertEqual(e.exception.code,status)
                finally:
                    http.shutdown(); http.server_close(); thread.join()
            finally: jobs.close()

    def test_external_source_change_invalidates_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp); cad=folder/"source.step"; cad.write_bytes(b"v1")
            (folder/"sources.json").write_text(json.dumps({str(cad):hashlib.sha256(b"v1").hexdigest()}))
            self.assertIsNone(server.stale_source(folder))
            cad.write_bytes(b"revision2")
            self.assertIn("source.step",server.stale_source(folder))
    def test_source_path_cannot_escape_library(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for path in ["../secret.step", "C:/secret.sldprt", "frontend/source.step"]:
                with self.assertRaises(ValueError): prepare.source(root, dict(source=path, sourceHash="a"*64))


try:
    import OCP  # noqa: F401
    HAS_OCP = True
except ImportError: HAS_OCP = False


@unittest.skipUnless(HAS_OCP, "OCP Python required")
class GeometryTests(unittest.TestCase):
    @staticmethod
    def volume(shape):
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        props = GProp_GProps(); BRepGProp.VolumeProperties_s(shape, props)
        return props.Mass()

    def test_exact_tube_volume_and_flange_holes(self):
        import math
        tube = dict(kind="tube", lengthMm=100, outerMm=60, innerMm=54)
        self.assertAlmostEqual(self.volume(prepare.generate(tube)), math.pi*(30**2-27**2)*100, places=5)
        flange = dict(kind="flange", lengthMm=20, outerMm=165, innerMm=60, boltCircleMm=125, boltHoles=4, boltHoleMm=18)
        self.assertAlmostEqual(self.volume(prepare.generate(flange)), math.pi*((165/2)**2-30**2-4*9**2)*20, places=5)

    def test_saddle_branch_and_collector_bore_reduce_metal_volume(self):
        main = dict(lengthMm=500, outerMm=114.3, innerMm=108.3)
        branch = dict(origin=[0,0,0], axis=[0,1,0], endMm=120, outerMm=60.3, innerMm=56.3)
        plain = prepare.generate(dict(kind="tube", **main))
        drilled = prepare.generate(dict(kind="collector-main", **main, branches=[branch]))
        saddle = prepare.generate(dict(kind="collector-branch", main=main, branch=branch))
        self.assertGreater(self.volume(drilled), 0); self.assertLess(self.volume(drilled), self.volume(plain))
        self.assertGreater(self.volume(saddle), 0)
        # The branch cannot extend inside the closed outer collector cylinder.
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
        outer = prepare.generate(dict(kind="tube", lengthMm=main["lengthMm"], outerMm=main["outerMm"], innerMm=0))
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
        from OCP.gp import gp_Trsf, gp_Vec
        move = gp_Trsf(); move.SetTranslation(gp_Vec(-250,0,0))
        outer = BRepBuilderAPI_Transform(outer, move, True).Shape()
        self.assertAlmostEqual(self.volume(BRepAlgoAPI_Common(outer, saddle).Shape()), 0, places=5)

    def test_unknown_geometry_and_invalid_wall_fail(self):
        for g in [dict(kind="frame-envelope"), dict(kind="tube", lengthMm=100, outerMm=50, innerMm=55)]:
            with self.assertRaises(ValueError): prepare.generate(g)

    def test_cap_is_closed_and_hardware_has_positive_volume(self):
        for g in [dict(kind="hex-cap", lengthMm=20, outerMm=40, innerMm=25),
                  dict(kind="rod", lengthMm=80, outerMm=12, headMm=8, flatsMm=19),
                  dict(kind="hex", lengthMm=10, flatsMm=19, innerMm=12),
                  dict(kind="collar", lengthMm=40, outerMm=60, innerMm=54, lipOuterMm=80, lipThicknessMm=5)]:
            self.assertGreater(self.volume(prepare.generate(g)), 0)


if __name__ == "__main__": unittest.main()
