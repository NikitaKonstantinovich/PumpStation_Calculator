"""Read reviewed native display meshes alongside the STEP equipment library."""
import json
import math
from pathlib import Path
import struct

from model_assets import file_hash, valid_stl


def display_stl(data, target):
    """Preserve SolidWorks shaded triangle strips in mm, including winding."""
    if data.get("units", {}).get("length") != "millimeter":
        raise ValueError("Native display coordinates must be millimetres")
    triangles = []
    for tess in data["model"]["tessellations"]:
        mesh = tess["mesh"]
        if mesh["kind"] != "shaded_strips":
            raise ValueError("Unsupported native display mesh")
        for strip in mesh["strips"]:
            for i in range(2, len(strip)):
                vertices = [strip[j] for j in ((i-2, i-1, i) if i % 2 == 0 else (i-1, i-2, i))]
                points = [tuple(v["position"][axis] for axis in "xyz") for v in vertices]
                if not all(math.isfinite(n) and abs(n) < 1e7 for p in points for n in p):
                    raise ValueError("Invalid native display coordinates")
                a, b, c = points
                u, v = [b[j]-a[j] for j in range(3)], [c[j]-a[j] for j in range(3)]
                normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
                length = math.hypot(*normal)
                if length < 1e-10:
                    continue  # Degenerate connectors between native strips.
                normal = [n/length for n in normal]
                reference = [sum(p.get("normal", {}).get(axis, 0) for p in vertices) for axis in "xyz"]
                if sum(normal[j]*reference[j] for j in range(3)) < 0:
                    points[1], points[2] = points[2], points[1]
                    normal = [-n for n in normal]
                triangles.append((normal, points))
    if not triangles:
        raise ValueError("Native display mesh is empty")
    points = [p for _, triangle in triangles for p in triangle]
    bounds = [min(p[i] for p in points) for i in range(3)] + [max(p[i] for p in points) for i in range(3)]
    if any(bounds[i+3] <= bounds[i] for i in range(3)):
        raise ValueError("Native display mesh has no volume")
    with Path(target).open("wb") as stream:
        stream.write(b"SolidWorks native display mesh; millimetres".ljust(80, b"\0"))
        stream.write(struct.pack("<I", len(triangles)))
        for normal, triangle in triangles:
            stream.write(struct.pack("<12fH", *normal, *(n for p in triangle for n in p), 0))
    return bounds


def native_library_models(root, output):
    """Fail closed if the reviewed source or mesh changed; never publish stale CAD."""
    registry = root / "Equipment/native-display-library.json"
    if not registry.exists():
        return []
    data = json.loads(registry.read_text(encoding="utf-8"))
    if data.get("version") != 1 or not isinstance(data.get("models"), list):
        raise ValueError("Invalid native display library")
    models = []
    for entry in data["models"]:
        model = dict(entry)
        source = (root / model["source"]).resolve()
        if not source.is_relative_to((root / "Equipment").resolve()):
            raise ValueError("Native source outside Equipment")
        digest = model["id"]
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest) or model["sourceHash"] != digest:
            raise ValueError("Invalid native source hash")
        mesh = output / f"model-{digest}-v1.stl"
        bounds = model.get("bounds", [])
        valid_bounds = (len(bounds) == 6 and all(isinstance(v, (int, float)) and math.isfinite(v) and abs(v) < 1e7 for v in bounds)
                        and all(bounds[i+3] > bounds[i] for i in range(3)))
        if (model.get("units") != "mm" or not valid_bounds or not source.is_file() or file_hash(source) != digest
                or not valid_stl(mesh) or file_hash(mesh) != model.get("meshHash")):
            model.update(status="error", error="Исходник или сетка SolidWorks изменены; повторите подготовку модели")
            model.pop("meshUrl", None)
        else:
            model.update(status="ready", meshUrl=f"/model-assets/model-{digest}-v1.stl", bytes=mesh.stat().st_size)
        model["ports"] = []
        models.append(model)
    return models
