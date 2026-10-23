"""Prepare browser copies of the existing normalized STEP library; never edits source CAD.

Index only: python scripts/prepare-model-assets.py
Meshes:    python scripts/prepare-model-assets.py --pump-id 9 90 318
Use an environment with cadquery-ocp installed for mesh generation (--all is optional).
The generated manifest/assets are committed so production needs neither Python nor STEP files.
"""
import argparse
import hashlib
import json
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
LIBRARY = ROOT / "Equipment/Pumps/3D_Normalized"
OUTPUT = FRONTEND / "public/model-assets"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pump-id", nargs="*", default=[])
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    index = json.loads((LIBRARY / "normalization-index.json").read_text(encoding="utf-8"))
    priority = {"catalog_execution_match": 0, "catalog_model_match": 1, "execution_review": 2}
    selected = {}
    for item in sorted(index["models"], key=lambda m: (priority.get(m.get("catalogueMappingClassification"), 9), m["source"])):
        pump_id = item.get("pumpId")
        if pump_id and pump_id not in selected:
            selected[pump_id] = item
    unknown = set(args.pump_id) - set(selected)
    if unknown:
        raise SystemExit("No normalized model for pump IDs: " + ", ".join(sorted(unknown)))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    profiles = {}
    for pump_id, item in sorted(selected.items()):
        bounds = item["normalizedBboxMm"]
        warnings = ["Монтажная пригодность модели не подтверждена"]
        mapping = item.get("catalogueMappingClassification", "unknown")
        if mapping == "execution_review":
            warnings.append("Исполнение STEP требует проверки соответствия каталогу")
        if item.get("previousCdmAudit", {}).get("geometryAssessment") not in (None, "valid_solids"):
            warnings.append("В исходной CAD-геометрии отмечены дефекты или отдельные поверхности")
        review = item["status"] != "normalized_verified"
        if review:
            warnings.append("Направление потока не подтверждено: PORT_A/PORT_B не назначены входом и выходом")
        ports = [{"id": "port-a" if review else "inlet", "point": [0, 0, 0], "axis": [-1, 0, 0], "provisional": True}]
        if item.get("outletNormalizedMm"):
            ports.append({"id": "port-b" if review else "outlet", "point": item["outletNormalizedMm"], "provisional": True})
        profile = {"pumpId": pump_id, "bounds": bounds, "ports": ports, "source": item["outputFile"], "sourceHash": item["outputSha256"], "mapping": mapping, "warnings": warnings}
        filename = "pump-" + pump_id + "-" + item["outputSha256"][:12] + ".stl"
        target = OUTPUT / filename
        if (args.all or pump_id in args.pump_id) and not target.exists():
            from OCP.STEPControl import STEPControl_Reader
            from OCP.BRepMesh import BRepMesh_IncrementalMesh
            from OCP.StlAPI import StlAPI_Writer
            source = (ROOT / item["outputFile"]).resolve()
            if not source.is_relative_to(LIBRARY.resolve()):
                raise ValueError("CAD source outside normalized library")
            if hashlib.sha256(source.read_bytes()).hexdigest() != item["outputSha256"]:
                raise ValueError("Source hash changed: " + str(source))
            reader = STEPControl_Reader()
            if int(reader.ReadFile(str(source))) != 1:
                raise ValueError("STEP read failed: " + str(source))
            reader.TransferRoots()
            shape = reader.OneShape()
            BRepMesh_IncrementalMesh(shape, .6, False, .45, True)
            writer = StlAPI_Writer()
            writer.ASCIIMode = False
            if not writer.Write(shape, str(target)):
                raise ValueError("STL write failed")
            print("Prepared", pump_id, target.name, target.stat().st_size, "bytes", flush=True)
        if target.exists():
            profile["meshUrl"] = "/model-assets/" + filename
        profiles[pump_id] = profile
    (OUTPUT / "manifest.json").write_text(json.dumps({"version": 1, "profiles": profiles}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Profiles:", len(profiles), "meshes:", sum("meshUrl" in p for p in profiles.values()), flush=True)


if __name__ == "__main__":
    main()
