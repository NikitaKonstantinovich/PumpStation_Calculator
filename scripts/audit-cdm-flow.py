"""Read-only CDM flow audit. Inspect each STEP, never infer flow from its name.

Run with the repository's OCP Python environment. Reports do not approve mounting,
catalogue execution, or hydraulic performance. An absent marker is inconclusive.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
import hashlib
import json
import math
from pathlib import Path
import time

ALGORITHM = "cdm-casing-arrow-v1"


def arrow_direction(vertices, tolerance=0.002):
    """Recognize a seven-vertex shaft-and-head outline projected on source XY.

    The head has one tip, two outer shoulders and two inner shoulders. The tail
    has two vertices. All five height levels and all three X stations must agree;
    a hexagonal bolt, rectangle, triangle, or an arbitrary pointed face won't pass.
    Cylindrical faces split at their seam may contain the head plus half the shaft.
    """
    points = sorted(set((round(v[0], 5), round(v[1], 5)) for v in vertices))
    if len(points) != 7:
        return None
    stations = []
    for x, y in points:
        if not stations or abs(x - stations[-1][0]) > tolerance:
            stations.append([x, [y]])
        else:
            stations[-1][1].append(y)
    if len(stations) != 3:
        return None
    for direction in (1, -1):
        tail, shoulder, tip = stations if direction == 1 else list(reversed(stations))
        if [len(s[1]) for s in (tail, shoulder, tip)] != [2, 4, 1]:
            continue
        center = tip[1][0]
        inner = sorted(tail[1])
        outer = sorted(shoulder[1])
        if not (outer[0] < inner[0] < center < inner[1] < outer[3]):
            continue
        if max(abs(outer[1] - inner[0]), abs(outer[2] - inner[1]),
               abs(sum(inner) / 2 - center), abs((outer[0] + outer[3]) / 2 - center)) > tolerance:
            continue
        length = abs(tip[0] - tail[0])
        height = outer[3] - outer[0]
        if not (10 <= length <= 200 and 2 <= height <= 60 and length > height):
            continue
        return direction
    return None


def unique_shapes(shape, kind):
    from OCP.TopExp import TopExp
    from OCP.collections import IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher
    result = IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher()
    TopExp.MapShapes_s(shape, kind, result)
    return [result.FindKey(i) for i in range(1, result.Extent() + 1)]


def xyz(point):
    return [point.X(), point.Y(), point.Z()]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inspect_model(root_string, item):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopAbs import TopAbs_FACE, TopAbs_VERTEX, TopAbs_WIRE
    from OCP.TopoDS import TopoDS
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane

    started = time.monotonic()
    root = Path(root_string)
    result = {"model": item.get("catalogueModel"), "pumpId": item.get("pumpId"),
              "source": item["sourceFile"], "normalizedSource": item["outputFile"],
              "sourceHash": item["sourceSha256"], "normalizedHash": item["outputSha256"],
              "status": "error", "markers": []}
    try:
        source = root / item["sourceFile"]
        normalized = root / item["outputFile"]
        result["sourceHashMatches"] = digest(source) == item["sourceSha256"]
        result["normalizedHashMatches"] = digest(normalized) == item["outputSha256"]
        if not result["sourceHashMatches"] or not result["normalizedHashMatches"]:
            raise ValueError("File checksum differs from normalization index")
        reader = STEPControl_Reader()
        if int(reader.ReadFile(str(source))) != 1:
            raise ValueError("Cannot read STEP")
        reader.SetSystemLengthUnit(1.0)
        if not reader.TransferRoots():
            raise ValueError("No transferred geometry")
        shape = reader.OneShape()
        if shape.IsNull():
            raise ValueError("Empty STEP")
        faces = unique_shapes(shape, TopAbs_FACE)
        result["faceCount"] = len(faces)
        port_height = item["sourceInletPointMm"][1]
        for i, original in enumerate(faces):
            face = TopoDS.Face(original)
            surface = BRepAdaptor_Surface(face, True)
            kind = surface.GetType()
            if kind == GeomAbs_Cylinder:
                if abs(surface.Cylinder().Axis().Direction().Y()) < .999:
                    continue
            elif kind == GeomAbs_Plane:
                if abs(surface.Plane().Axis().Direction().Z()) < .999:
                    continue
            else:
                continue
            vertices = [xyz(BRep_Tool.Pnt_s(TopoDS.Vertex(v))) for v in unique_shapes(face, TopAbs_VERTEX)]
            if len(vertices) != 7 or len(unique_shapes(face, TopAbs_WIRE)) != 1:
                continue
            # Only the lateral lower hydraulic casing, never the motor rotation mark.
            lo = [min(p[k] for p in vertices) for k in range(3)]
            hi = [max(p[k] for p in vertices) for k in range(3)]
            if not (lo[1] > 0 and hi[1] < port_height + max(80, .75 * port_height)
                    and abs((lo[0] + hi[0]) / 2) < 100
                    and abs((lo[2] + hi[2]) / 2) > 30 and hi[2] - lo[2] < 25):
                continue
            direction = arrow_direction(vertices)
            if direction is None:
                continue
            result["markers"].append({"faceIndex": i + 1, "directionSourceX": direction,
                "sideSourceZ": 1 if lo[2] > 0 else -1, "surface": str(kind).split(".")[-1],
                "verticesMm": [[round(v, 6) for v in p] for p in vertices]})
        directions = set(m["directionSourceX"] for m in result["markers"])
        matrix = item["matrixSourceToNormalized"]
        result["rigidTransform"] = all(abs(sum(matrix[i][k] * matrix[j][k] for k in range(3)) - (i == j)) < 1e-6 for i in range(3) for j in range(3))
        result["inletAtOrigin"] = math.dist([sum(matrix[i][j] * item["sourceInletPointMm"][j] for j in range(3)) + matrix[i][3] for i in range(3)], [0, 0, 0]) < .01
        outlet = item.get("outletNormalizedMm")
        result["portsCollinear"] = bool(outlet and outlet[0] > 0 and abs(outlet[1]) < .01 and abs(outlet[2]) < .01)
        if not all(result[k] for k in ("rigidTransform", "inletAtOrigin", "portsCollinear")):
            raise ValueError("Invalid normalization transform or port positions")
        if len(directions) > 1:
            result["status"] = "conflicting_markers"
        elif not directions:
            result["status"] = "unconfirmed_no_recognized_marker"
        else:
            direction = next(iter(directions))
            result["flowSourceX"] = direction
            result["flowNormalized"] = [round(matrix[i][0] * direction, 6) for i in range(3)]
            result["status"] = "confirmed_matches" if math.dist(result["flowNormalized"], [1, 0, 0]) < 1e-6 else "confirmed_reversed"
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    result["seconds"] = round(time.monotonic() - started, 2)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    index_path = args.root / "Equipment/Pumps/3D_Normalized/normalization-index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    models = [m for m in index["models"] if m.get("series") == "CDM"]
    models = models[:args.limit] if args.limit else models
    args.output.mkdir(parents=True, exist_ok=True)
    cache = args.output / "results.jsonl"
    cached = [json.loads(line) for line in cache.read_text(encoding="utf-8").splitlines()] if cache.exists() else []
    by_hash = {r["sourceHash"]: r for r in cached if r.get("algorithm") == ALGORITHM and r["status"] != "error"}
    # A cached audit is accepted only after checking both current files again.
    results, pending = [], []
    for item in models:
        previous = by_hash.get(item["sourceSha256"])
        if previous and previous["normalizedHash"] == item["outputSha256"] and digest(args.root / item["sourceFile"]) == item["sourceSha256"] and digest(args.root / item["outputFile"]) == item["outputSha256"]:
            results.append(previous)
        else:
            pending.append(item)
    print(f"CDM files: {len(models)}; pending: {len(pending)}; cached: {len(results)}", flush=True)
    with ProcessPoolExecutor(max_workers=args.workers, max_tasks_per_child=1) as pool, cache.open("a", encoding="utf-8") as log:
        futures = [pool.submit(inspect_model, str(args.root), item) for item in pending]
        for future in as_completed(futures):
            record = future.result()
            record["algorithm"] = ALGORITHM
            results.append(record)
            log.write(json.dumps(record, ensure_ascii=False) + "\n")
            log.flush()
            print(f"{len(results)}/{len(models)} {record['model']}: {record['status']} ({len(record['markers'])} markers)", flush=True)
    results.sort(key=lambda r: r["source"])
    summary = dict(Counter(r["status"] for r in results))
    report = {"algorithm": ALGORITHM, "scope": "Every indexed CDM STEP, including execution variants; separate CDMF series excluded",
              "indexHash": digest(index_path), "fileCount": len(results),
              "catalogueModelCount": len(set(r["pumpId"] for r in results)), "summary": summary, "models": results}
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
