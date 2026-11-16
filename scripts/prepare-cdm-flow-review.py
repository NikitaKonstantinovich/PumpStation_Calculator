"""Prepare reviewed CDM STEP/STL copies and draft registries; never edit originals.

The draft manifest is activated separately, after STEP reimport verification.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct

from rigid_step_instance import wrap_step


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def write_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f"Existing file differs; preserved: {path}")
    else:
        path.write_bytes(data)


def turn_stl(raw, length):
    """Proper rigid rotation: x'=L-x, y'=-y, z'=z. Preserve triangle winding."""
    count = struct.unpack_from("<I", raw, 80)[0]
    if len(raw) != 84 + 50 * count or not count:
        raise ValueError("Invalid binary STL")
    result = bytearray(raw)
    for i in range(count):
        offset = 84 + 50 * i
        values = list(struct.unpack_from("<12f", raw, offset))
        values[0], values[1] = -values[0], -values[1]
        for j in (3, 6, 9):
            values[j], values[j + 1] = length - values[j], -values[j + 1]
        struct.pack_into("<12f", result, offset, *values)
    return bytes(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    root, output = args.root, args.audit.parent
    report = json.loads(args.audit.read_text(encoding="utf8"))
    if report["algorithm"] != "cdm-casing-arrow-v1" or report["summary"].get("error") or report["summary"].get("conflicting_markers"):
        raise ValueError("Audit is incomplete or contains errors/conflicting markers")
    index_path = root / "Equipment/Pumps/3D_Normalized/normalization-index.json"
    if sha(index_path.read_bytes()) != report["indexHash"]:
        raise ValueError("Normalization index changed after the audit")
    items = json.loads(index_path.read_text(encoding="utf8"))["models"]
    by_hash = {m["outputSha256"]: m for m in items if m["series"] == "CDM"}
    if set(by_hash) != {m["normalizedHash"] for m in report["models"]}:
        raise ValueError("Audit does not cover every CDM source")
    manifest_path = root / "frontend/public/model-assets/manifest.json"
    before = output / "manifest-before.json"
    if not before.exists():
        write_new(before, manifest_path.read_bytes())
    manifest = json.loads(before.read_text(encoding="utf8"))
    reviewed, corrections = {}, []
    for audit in report["models"]:
        item = by_hash[audit["normalizedHash"]]
        if sha((root / item["sourceFile"]).read_bytes()) != audit["sourceHash"]:
            raise ValueError(f"Original STEP changed: {item['sourceFile']}")
        previous = root / item["outputFile"]
        raw = previous.read_bytes()
        if sha(raw) != audit["normalizedHash"]:
            raise ValueError(f"Normalized STEP changed: {previous}")
        review = {"status": audit["status"], "originalSourceHash": audit["sourceHash"],
                  "previousNormalizedHash": audit["normalizedHash"], "markerFaces": [m["faceIndex"] for m in audit["markers"]],
                  "sourceFlowX": audit.get("flowSourceX"), "audit": "cdm-casing-arrow-v1"}
        if audit["status"] == "confirmed_reversed":
            length = item["outletNormalizedMm"][0]
            raw_new, metadata = wrap_step(raw, [[-1,0,0],[0,-1,0],[0,0,1]], [length,0,0], "CDM casing flow verified | INLET ZERO | Z UP")
            relative = Path(item["outputFile"]).relative_to("Equipment/Pumps/3D_Normalized/models")
            destination = Path("Equipment/Pumps/3D_FlowVerified") / relative.parent / (relative.stem + "__FLOW_VERIFIED.step")
            write_new(root / destination, raw_new)
            b = item["normalizedBboxMm"]
            bounds = [length-b[3], -b[4], b[2], length-b[0], -b[1], b[5]]
            correction = {"pumpId": item["pumpId"], "previousSource": item["outputFile"],
                "source": destination.as_posix(), "sourceHash": sha(raw_new), "bounds": bounds,
                "length": length, "expectedFaceCount": item["topologyAfter"]["faces"],
                "expectedSolidCount": item["topologyAfter"]["solids"], "stepWrapper": metadata,
                "flowReview": {**review, "status": "confirmed_corrected", "flowNormalized": [1,0,0]}}
            corrections.append(correction)
            review = correction["flowReview"]
        elif audit["status"] == "confirmed_matches":
            review["flowNormalized"] = [1,0,0]
        reviewed[audit["normalizedHash"]] = review
    by_previous = {c["flowReview"]["previousNormalizedHash"]: c for c in corrections}
    registry = []
    for pid, profile in manifest["profiles"].items():
        old_hash = profile.get("sourceHash")
        if old_hash not in reviewed:
            continue
        review = reviewed[old_hash]
        if old_hash in by_previous:
            correction = by_previous[old_hash]
            mesh = root / "frontend/public" / profile["meshUrl"].lstrip("/")
            raw_mesh = mesh.read_bytes()
            if sha(raw_mesh) != profile["meshHash"]:
                raise ValueError(f"Browser mesh changed: {mesh}")
            mesh_new = turn_stl(raw_mesh, correction["length"])
            filename = f"model-{correction['sourceHash']}-v1.stl"
            write_new(root / "frontend/public/model-assets" / filename, mesh_new)
            profile.update({k: correction[k] for k in ("source", "sourceHash", "bounds")})
            profile.update(meshUrl="/model-assets/" + filename, meshHash=sha(mesh_new))
        profile["flowReview"] = review
        profile["ports"] = [{**p, "axis": [-1,0,0] if p["id"] == "inlet" else [1,0,0]} for p in profile["ports"]]
        if review["status"] == "unconfirmed_no_recognized_marker":
            profile["warnings"].append("Направление потока CDM не подтверждено по этому STEP: распознаваемая стрелка не найдена; вход и выход назначены предварительно")
        else:
            profile["warnings"].append("Направление потока проверено по геометрии стрелок на корпусе CDM" + ("; ориентация браузерной и CAD-копии исправлена" if review["status"] == "confirmed_corrected" else ""))
        entry = deepcopy(profile)
        entry.pop("meshUrl", None)
        entry.pop("meshHash", None)
        # load_library appends this existing warning once for explicit registry rows.
        entry["warnings"] = [w for w in entry["warnings"] if w != "Монтажная пригодность модели не подтверждена"]
        registry.append(entry)
    for name, value in [("corrections.json", corrections), ("registry-draft.json", {"version": 1, "models": registry}), ("manifest-draft.json", manifest)]:
        (output / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"Prepared {len(corrections)} corrected STEP copies; {len(registry)} reviewed browser profiles. Drafts not activated.")


if __name__ == "__main__":
    main()
