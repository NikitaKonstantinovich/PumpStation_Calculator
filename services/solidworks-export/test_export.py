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
LIBRARY_ROOT = next((p for p in HERE.parents if (p / "Equipment").is_dir() and (p / "frontend/scripts/model_assets.py").is_file()), HERE.parents[2])


def module(name):
    spec = importlib.util.spec_from_file_location("cad_" + name, HERE / (name + ".py"))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


server, prepare = module("server"), module("prepare")


def payload():
    return dict(requestId="request-1", snapshotKey="a"*64, manifest=dict(version=1, projectId="p", projectName="Test",
        coordinates="right-handed-z-up-mm", transformConvention="solidworks-row-axes-metres", warnings=[],
        instances=[dict(id="part", name="Fixture", hidden=False, transform=[1,0,0,0,1,0,0,0,1,1,.2,.3,1,0,0,0], geometry={"kind":"tube","outerMm":60,"innerMm":54,"lengthMm":100})]))


class FrameRegistryTests(unittest.TestCase):
    def test_native_frame_uses_verified_registry_and_rechecks_source_hash(self):
        assets = Mock(load_library=Mock(return_value={}), file_hash=lambda path: hashlib.sha256(path.read_bytes()).hexdigest())
        with tempfile.TemporaryDirectory() as temp, patch.object(prepare, "model_assets", return_value=assets):
            root = Path(temp)
            frame_dir = root / "Equipment/Frames/Generated/bent-410-v1"
            frame_dir.mkdir(parents=True)
            rows = []
            for name, verified in [("frame-410-900-5-red.SLDPRT", True), ("unverified.SLDPRT", False), ("changed.SLDPRT", True)]:
                part_file = frame_dir / name
                part_file.write_bytes(name.encode())
                rows.append(dict(native=name, nativeHash=assets.file_hash(part_file), verified=verified))
            (frame_dir / "manifest.json").write_text(json.dumps(rows), encoding="utf8")
            (frame_dir / "changed.SLDPRT").write_bytes(b"different source version")
            job = root / "job"
            job.mkdir()
            instance = payload()["manifest"]["instances"][0]
            request = {"manifest": {"instances": [dict(instance, id=str(i), geometry={"kind": "native", "hash": row["nativeHash"],
                "source": str(frame_dir / row["native"])}) for i, row in enumerate(rows)]}}
            (job / "request.json").write_text(json.dumps(request), encoding="utf8")
            prepare.prepare(root, job)
            result = json.loads((job / "resolved.json").read_bytes())
            part, = result["instances"]
            self.assertEqual(part["sourceFile"], "Equipment/Frames/Generated/bent-410-v1/frame-410-900-5-red.SLDPRT")
            self.assertEqual(part["sourceHash"], rows[0]["nativeHash"])
            self.assertEqual(part["transform"], instance["transform"])
            self.assertEqual([(item["id"], item["code"]) for item in result["omissions"]], [("1", "source_missing"), ("2", "source_changed")])


class ContractTests(unittest.TestCase):
    def test_release_catalogue_resolves_new_four_hole_pump_flange(self):
        with tempfile.TemporaryDirectory() as temp:
            work=Path(temp); script=work/"release/prepare.py";script.parent.mkdir()
            shutil.copyfile(HERE/"prepare.py",script)
            data_dir=script.parent/"data";data_dir.mkdir()
            catalogue=json.loads((HERE.parents[1]/"data/stamped-loose-flanges.json").read_bytes())
            (data_dir/"stamped-loose-flanges.json").write_text(json.dumps(catalogue),encoding="utf8")
            row=catalogue["catalog"]["фланцы-006-r0116:4-hole"];stock=catalogue["parts"][row["model"]]
            data=payload();data["manifest"]["instances"][0].update(equipmentId="фланцы-006-r0116:4-hole",geometry=dict(kind="flange",stampedHash=stock["sourceHash"],**stock["dimensions"]))
            job=work/"job";job.mkdir();(job/"request.json").write_text(json.dumps(data),encoding="utf8")
            result=subprocess.run([sys.executable,"-I",str(script),"--root",str(LIBRARY_ROOT),"--job",str(job)],capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            resolved=json.loads((job/"resolved.json").read_bytes())
            self.assertEqual(resolved["omissions"],[])
            self.assertEqual(resolved["instances"][0]["sourceHash"],stock["sourceHash"])

    def test_purchased_cad_quality_warning_is_visible_without_losing_the_instance(self):
        class FixtureJobs(server.Jobs):
            def command(self,cmd,folder,stage):
                parts=server.read_json(folder/"request.json")["manifest"]["instances"]
                if stage=="prepare":
                    (folder/"resolved.json").write_text(json.dumps(dict(instances=parts,omissions=[])))
                    (folder/"sources.json").write_text("{}")
                elif stage=="solidworks":
                    (folder/"verification.json").write_text(json.dumps(dict(instances=parts)))
                    (folder/"import-diagnostics.json").write_text(json.dumps([dict(name="Затвор",warning="Поверхностное тело сохранено")]))
        with tempfile.TemporaryDirectory() as temp:
            jobs=FixtureJobs(temp,HERE,"runner","template")
            try:
                submitted=jobs.submit("owner",payload());jobs.executor.submit(lambda:None).result()
                job=jobs.get(submitted["id"],"owner")
                self.assertEqual((job["status"],job["completed"],job["omissions"]),("completed",1,[]))
                self.assertIn("Затвор: Поверхностное тело сохранено",job["warnings"])
                self.assertIn("замечания",job["stage"])
                self.assertEqual(server.read_json(Path(temp)/job["id"]/"report.json")["warnings"],job["warnings"])
            finally:jobs.close()

    def test_document_identity_ignores_location_but_preserves_execution(self):
        part=dict(path="shared.step",sourceHash="a"*64,configuration="M16x80",name="Болт M16x80 DIN933 Ц 8,8 для левой стойки")
        key=prepare.document_key(part)
        self.assertEqual(key,prepare.document_key({**part,"name":"Болт M16x80 DIN 933 Ц 8.8 для правой стойки"}))
        for patch in [dict(name="Болт M16x80 DIN933 Ц 10,9"),dict(material="aisi304"),dict(configuration="M16x90"),dict(coating="black"),dict(sourceHash="b"*64),dict(name="Болт M16x80 DIN931 Ц 8.8")]:
            self.assertNotEqual(key,prepare.document_key({**part,**patch}))
        label=prepare.canonical_label(part,dict(kind="rod",hardware="bolt",nominalMm=16,lengthMm=80))
        self.assertEqual(label,"Болт DIN 933 M16×80 · 8.8 · Ц")
        rivet={**part,"name":"Гайка-заклёпка RIVKLE 34355080130 M8 для левой стойки"}
        self.assertEqual(prepare.document_key(rivet),prepare.document_key({**rivet,"name":rivet["name"].replace("левой","правой")}))
        self.assertNotEqual(prepare.document_key(rivet),prepare.document_key({**rivet,"name":rivet["name"].replace("34355080130","34355080131")}))

    def test_subassembly_pose_is_validated_and_cannot_disagree_between_children(self):
        data=payload();part=data["manifest"]["instances"][0]
        part["subassembly"]=dict(id="collector",name="Коллектор",transform=list(prepare.IDENTITY))
        server.validate(data)
        part["subassembly"]["transform"][0]=2
        with self.assertRaises(ValueError):server.validate(data)
        part["subassembly"]["transform"][0]=1
        clone=json.loads(json.dumps(part));clone["id"]="another";clone["subassembly"]["transform"][9]=1
        data["manifest"]["instances"].append(clone)
        with self.assertRaises(ValueError):server.validate(data)

    def test_saddles_share_local_geometry_but_not_different_radius_or_thread(self):
        main=dict(lengthMm=900,outerMm=114.3,innerMm=108.3)
        branch=dict(id="one",name="Патрубок 1",origin=[100,0,0],axis=[0,1,0],endMm=120,outerMm=60.3,innerMm=54.3)
        a,ta=prepare.canonical_geometry(dict(kind="collector-branch",main=main,branch=branch))
        b,tb=prepare.canonical_geometry(dict(kind="collector-branch",main={**main,"lengthMm":1200},branch={**branch,"id":"two","name":"Патрубок 2","origin":[-100,0,0],"axis":[0,0,-1]}))
        self.assertEqual(a,b);self.assertNotEqual(ta,tb)
        for change in [dict(outerMm=76),dict(thread=dict(designation="G2",lengthMm=20)),dict(origin=[100,0,10])]:
            c,_=prepare.canonical_geometry(dict(kind="collector-branch",main=main,branch={**branch,**change}))
            self.assertNotEqual(a,c)

    def test_prepare_runs_from_staged_worker_using_only_configured_root(self):
        root = LIBRARY_ROOT
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
        root = LIBRARY_ROOT
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
                path.write_text(json.dumps(dict(phase="session", done=0, total=0)))
                self.assertEqual(jobs.checked(job)["stage"], "Закрытие текущего сеанса SOLIDWORKS")
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
    def test_channel_drilling_survives_prepare_canonicalization(self):
        profile=dict(width=40,height=80,flange=7.4,web=4.5,rootRadius=6.5,toeRadius=3.5)
        g=dict(kind="channel-member",profile=profile,member=dict(id="rear",axis="x",opening=1,start=0,end=600,cross=100),
               section=[[0,0],[40,0],[40,7.4],[4.5,7.4],[4.5,72.6],[40,72.6],[40,80],[0,80]],
               holes=[dict(id="h",memberId="rear",valid=True,x=300,y=120,diameterMm=9,face="top")])
        normalized,_=prepare.canonical_geometry(g)
        self.assertAlmostEqual(self.volume(prepare.generate(g)),self.volume(prepare.generate(normalized)),places=6)
        g["holes"][0]["memberId"]="another"
        with self.assertRaises(ValueError):prepare.canonical_geometry(g)

    def test_concentric_and_eccentric_reducers_have_open_bores_and_expected_volume(self):
        import math
        from OCP.BRepClass3d import BRepClass3d_SolidClassifier
        from OCP.TopAbs import TopAbs_OUT, TopAbs_SOLID
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopoDS import TopoDS
        from OCP.gp import gp_Pnt
        for offset in ([0,0,0],[0,0,25.4]):
            g=dict(kind="reducer",lengthMm=127,outerMm=139.7,innerMm=127.1,smallOuterMm=88.9,smallInnerMm=77.7,offset=offset)
            body=prepare.generate(g)
            expected=math.pi*127/12*(139.7**2+139.7*88.9+88.9**2-127.1**2-127.1*77.7-77.7**2)
            self.assertAlmostEqual(self.volume(body),expected,delta=.001)
            cast=getattr(TopoDS,"Solid_s",None) or TopoDS.Solid
            solid=cast(TopExp_Explorer(body,TopAbs_SOLID).Current())
            for fraction in (.01,.5,.99):
                point=gp_Pnt(127*fraction,offset[1]*fraction,offset[2]*fraction)
                self.assertEqual(BRepClass3d_SolidClassifier(solid,point,1e-6).State(),TopAbs_OUT)

    def test_wav8_layout_preserves_browser_bounds(self):
        from OCP.Bnd import Bnd_Box
        from OCP.BRepBndLib import BRepBndLib
        body=prepare.generate(dict(kind="tank-envelope",diameterMm=200,heightMm=311))
        bounds=Bnd_Box();BRepBndLib.AddOptimal_s(body,bounds)
        for actual,expected in zip((*bounds.CornerMin().Coord(),*bounds.CornerMax().Coord()),(-100,-100,0,100,100,311)):
            self.assertAlmostEqual(actual,expected,places=5)

    def test_channel_member_drills_only_selected_flange_and_rejects_edge_breakout(self):
        import math
        profile=dict(width=52,height=120,flange=7.8,web=4.8,rootRadius=7.5,toeRadius=4.5)
        # Straight-corner control section isolates the prism and bore volume checks.
        section=[[0,0],[52,0],[52,7.8],[4.8,7.8],[4.8,112.2],[52,112.2],[52,120],[0,120]]
        for axis in ("x","y"):
            for opening in (-1,1):
                m=dict(id="rail",axis=axis,opening=opening,start=0,end=1000,cross=0)
                offset=30 if opening==1 else 22
                x,y=(500,offset) if axis=="x" else (offset,500)
                base=dict(kind="channel-member",profile=profile,member=m,section=section,holes=[])
                plain=prepare.generate(base)
                for face in ("top","bottom"):
                    hole=dict(memberId="rail",valid=True,x=x,y=y,diameterMm=17,face=face)
                    drilled=prepare.generate({**base,"holes":[hole]})
                    self.assertAlmostEqual(self.volume(plain)-self.volume(drilled),math.pi*8.5**2*7.8,places=5)
                    with self.assertRaises(ValueError):prepare.generate({**base,"holes":[{**hole,"diameterMm":100}]})

    def test_rivet_nut_is_one_solid_with_a_through_bore(self):
        import math
        from OCP.TopAbs import TopAbs_SOLID
        from OCP.TopExp import TopExp_Explorer
        shape=prepare.generate(dict(kind="rivet-nut",headLengthMm=1.5,headOuterMm=16,bodyLengthMm=16,bodyOuterMm=11,innerMm=8))
        solids=TopExp_Explorer(shape,TopAbs_SOLID)
        self.assertTrue(solids.More());solids.Next();self.assertFalse(solids.More())
        self.assertAlmostEqual(self.volume(shape),math.pi*((8**2-4**2)*1.5+(5.5**2-4**2)*16),places=5)

    @staticmethod
    def volume(shape):
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        props = GProp_GProps(); BRepGProp.VolumeProperties_s(shape, props)
        return props.Mass()

    def test_profile_has_rounded_section_and_drilled_web_in_the_editor_axes(self):
        import math
        from OCP.Bnd import Bnd_Box
        from OCP.BRepBndLib import BRepBndLib
        from OCP.TopAbs import TopAbs_SOLID
        from OCP.TopExp import TopExp_Explorer

        section_area = 2 * (32 + 2 * 12 + 2 * 6) + 4 * math.pi * (4**2 - 2**2) / 4
        for length in (600, 800):
            slots = [[20, 55], [75, 75], [length - 20, length - 5.51]]
            shape = prepare.generate(dict(kind="frame-profile", lengthMm=length, slots=slots))
            solids = TopExp_Explorer(shape, TopAbs_SOLID)
            self.assertTrue(solids.More())
            solids.Next()
            self.assertFalse(solids.More())
            bounds = Bnd_Box()
            BRepBndLib.AddOptimal_s(shape, bounds)
            for actual, expected in zip((*bounds.CornerMin().Coord(), *bounds.CornerMax().Coord()), (0, -20, 0, 20, 20, length)):
                self.assertAlmostEqual(actual, expected, places=5)
            removed = sum(2 * (11 * (hi - lo) + math.pi * 5.5**2) for lo, hi in slots)
            self.assertAlmostEqual(self.volume(shape), section_area * length - removed, places=4)

    def test_profile_rejects_overlapping_slots_and_invalid_lengths(self):
        for length, slots in ((700, []), (600, [[5.5, 60]]), (800, [[20, 60], [65, 85]])):
            with self.assertRaises(ValueError):
                prepare.generate(dict(kind="frame-profile", lengthMm=length, slots=slots))

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
