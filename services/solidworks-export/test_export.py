import json
import hashlib
import zipfile
import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest
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
