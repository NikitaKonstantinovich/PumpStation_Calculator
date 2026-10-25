"""Queue, persistence, cache and failure-isolation tests; OCP is tested separately."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch

SERVER = Path(__file__).resolve().parents[1] / "services/model-converter/server.py"
spec = importlib.util.spec_from_file_location("model_converter", SERVER)
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class ConverterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="model-queue-")
        self.root = Path(self.temp.name)
        (self.root / "Equipment").mkdir()
        self.registry = self.root / "Equipment/model-library.json"
        self.models, self.calls = [], []
        self.failures = set()
        for key, source in [("pump:a", "a.step"), ("equipment:valve-a", "v.step"), ("equipment:valve-b", "v.step"), ("equipment:bad", "bad.step")]:
            (self.root / source).write_text(source)
            self.models.append({"key": key, "source": source, "units": "mm", "ports": [{"id": "inlet", "point": [3, 4, 5], "axis": [-1, 0, 0]}], "warnings": ["Проверить каталог"]})
        self.registry.write_text(json.dumps({"version": 1, "models": self.models}))
        self.jobs = service.Jobs(self.root, self.root / "state", converter=self.convert)

    def tearDown(self):
        self.jobs.close()
        self.temp.cleanup()

    def convert(self, source, digest):
        self.calls.append(source.name)
        if source.name in self.failures:
            raise ValueError("Повреждён STEP")
        filename = f"model-{digest}-v1.stl"
        (self.jobs.assets / filename).write_bytes(bytes(80) + struct.pack("<I", 1) + bytes(50))
        info = {"filename": filename, "bounds": [0, 0, 0, 10, 20, 30], "converterVersion": "v1", "units": "mm"}
        self.jobs.register(digest, info)
        return info

    def submit(self, keys, **extra):
        return self.jobs.submit("owner", {"projectId": "station", "requestId": str(uuid.uuid4()), "items": [
            {"key": key, "equipmentId": key, "position": str(i), "name": key, "quantity": 3} for i, key in enumerate(keys)
        ], **extra})

    def finished(self, job):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            result = self.jobs.get(job["id"])
            if result["status"] not in service.ACTIVE:
                return result
            time.sleep(.01)
        self.fail("Background job did not finish")

    def test_all_equipment_types_deduplicate_source_hash_and_reuse(self):
        first = self.finished(self.submit(["pump:a", "pump:a", "equipment:valve-a", "equipment:valve-b", "equipment:missing"]))
        self.assertEqual((first["total"], first["completed"], first["converted"], len(first["missing"])), (2, 2, 2, 1))
        self.assertEqual(self.calls, ["a.step", "v.step"])
        a, b = (first["profiles"]["equipment"][key] for key in ["equipment:valve-a", "equipment:valve-b"])
        self.assertEqual(a["meshUrl"], b["meshUrl"])
        self.assertEqual(a["ports"][0]["point"], [3, 4, 5])
        again = self.finished(self.submit(["pump:a", "equipment:valve-a", "equipment:valve-b"]))
        self.assertEqual((again["total"], again["ready"], again["converted"]), (0, 2, 0))
        self.assertEqual(len(self.calls), 2)

    def test_actual_hash_invalidation_even_with_same_size_and_timestamp(self):
        first = self.finished(self.submit(["pump:a"]))
        source = self.root / "a.step"
        stamp = source.stat().st_mtime
        source.write_text("b.step")
        import os
        os.utime(source, (stamp, stamp))
        second = self.finished(self.submit(["pump:a"]))
        self.assertEqual(second["converted"], 1)
        self.assertNotEqual(first["profiles"]["profiles"]["a"]["sourceHash"], second["profiles"]["profiles"]["a"]["sourceHash"])

    def test_failed_file_does_not_stop_queue_and_retry_only_failed(self):
        self.failures.add("bad.step")
        first = self.finished(self.submit(["pump:a", "equipment:bad", "equipment:valve-a"]))
        self.assertEqual((first["completed"], first["total"], first["converted"], len(first["errors"]), first["progress"]), (3, 3, 2, 1, 100))
        self.assertEqual(first["status"], "completed_with_errors")
        self.assertEqual(first["errors"][0]["name"], "equipment:bad")
        self.failures.clear()
        retry = self.finished(self.submit([], retryJobId=first["id"]))
        self.assertEqual((retry["total"], retry["converted"], len(retry["items"])), (1, 1, 1))
        self.assertEqual(self.calls, ["a.step", "bad.step", "v.step", "bad.step"])

    def test_active_job_is_singleton_and_progress_does_not_advance_inside_file(self):
        entered, release = threading.Event(), threading.Event()
        def slow(source, digest):
            entered.set()
            release.wait(5)
            return self.convert(source, digest)
        self.jobs.converter = slow
        first = self.submit(["pump:a", "equipment:valve-a"])
        try:
            self.assertTrue(entered.wait(5))
            second = self.submit(["pump:a"])
            self.assertEqual(first["id"], second["id"])
            live = self.jobs.latest("owner", "station")
            self.assertEqual((live["progress"], live["completed"], live["total"]), (0, 0, 2))
            self.assertEqual(live["current"], "pump:a")
            self.assertIsNone(self.jobs.latest("other-owner", "station"))
            self.assertIsNone(self.jobs.latest("owner", "other-project"))
        finally:
            release.set()
        self.assertEqual(self.finished(first)["converted"], 2)

    def test_persistence_and_recovery_of_interrupted_job(self):
        first = self.finished(self.submit(["pump:a", "equipment:valve-a"]))
        first["status"] = "converting"  # persisted interrupted snapshot
        self.jobs.save(first)
        self.jobs.close()
        self.jobs = service.Jobs(self.root, self.root / "state", converter=self.convert)
        resumed = self.finished(first)
        self.assertEqual((resumed["ready"], resumed["converted"]), (2, 0))
        self.assertEqual(len(self.calls), 2)

    def test_missing_library_source_and_invalid_path_are_explained(self):
        absent = self.finished(self.submit(["equipment:missing"]))
        self.assertEqual((absent["total"], len(absent["missing"])), (0, 1))
        (self.root / "a.step").unlink()
        broken = self.finished(self.submit(["pump:a", "equipment:valve-a"]))
        self.assertEqual((broken["converted"], len(broken["missing"])), (1, 1))
        self.assertIn("не найден", broken["missing"][0]["reason"])
        with self.assertRaises(ValueError):
            service.source_path(self.root, "../outside.step")

    def test_corrupted_cached_stl_is_reconverted(self):
        first = self.finished(self.submit(["pump:a"]))
        name = first["profiles"]["profiles"]["a"]["meshUrl"].split("/")[-1]
        (self.jobs.assets / name).write_bytes(b"broken")
        second = self.finished(self.submit(["pump:a"]))
        self.assertEqual(second["converted"], 1)

    def test_prepared_equipment_manifest_reuses_mesh_and_keeps_reviewed_ports(self):
        frontend = self.root / "frontend"
        assets = frontend / "public/model-assets"
        assets.mkdir(parents=True)
        mesh = assets / "equipment-test.stl"
        mesh.write_bytes(bytes(80) + struct.pack("<I", 1) + bytes(50))
        digest = service.file_hash(self.root / "v.step")
        profile = {"sourceHash": digest, "meshUrl": "/model-assets/equipment-test.stl", "meshHash": service.file_hash(mesh), "bounds": [0, 0, 0, 10, 20, 30]}
        (assets / "manifest.json").write_text(json.dumps({"version": 1, "profiles": {}, "equipment": {"equipment:valve-a": profile}}))
        with patch.object(service, "FRONTEND", frontend):
            result = self.finished(self.submit(["equipment:valve-a"]))
        self.assertEqual((result["ready"], result["converted"], result["total"]), (1, 0, 0))
        self.assertEqual(self.calls, [])
        self.assertEqual(result["profiles"]["equipment"]["equipment:valve-a"]["ports"][0]["point"], [3, 4, 5])

    def test_request_idempotency_and_retry_ownership(self):
        first = self.finished(self.submit(["pump:a"]))
        same = self.submit(["equipment:valve-a"], requestId=first["requestId"])
        self.assertEqual(same["id"], first["id"])
        with self.assertRaises(ValueError):
            self.jobs.submit("other-owner", {"projectId": "station", "requestId": "retry", "items": [], "retryJobId": first["id"]})

    def test_invalid_registry_is_a_retryable_error(self):
        self.registry.write_text("broken json")
        first = self.finished(self.submit(["pump:a"]))
        self.assertEqual(first["status"], "completed_with_errors")
        self.assertIn("fatalError", first)
        self.registry.write_text(json.dumps({"version": 1, "models": self.models}))
        retry = self.finished(self.submit([], retryJobId=first["id"]))
        self.assertEqual(retry["converted"], 1)


if __name__ == "__main__":
    unittest.main()
