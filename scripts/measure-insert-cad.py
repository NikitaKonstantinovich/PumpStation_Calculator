"""Reproduce reviewed insert dimensions from original STEP B-Rep (millimetres).

Requires the project's cadquery-ocp runtime. Does not modify models or catalogue.
Only the reviewed concentric, Z-axis-aligned execution is accepted; other shapes
need a separate review rather than a bounding-box or nominal-DN approximation.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def measure_reducer(path, expected):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRep import BRep_Tool
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopAbs import TopAbs_FACE, TopAbs_VERTEX, TopAbs_SOLID
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib

    def shapes(shape, kind, cast):
        explorer = TopExp_Explorer(shape, kind)
        while explorer.More():
            yield cast(explorer.Current())
            explorer.Next()

    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(path))) != 1:
        raise ValueError("STEP read failed")
    reader.SetSystemLengthUnit(1.0)  # OCCT reads STEP units and converts to mm.
    if not reader.TransferRoots():
        raise ValueError("STEP has no transferable roots")
    shape = reader.OneShape()
    if shape.IsNull() or not BRepCheck_Analyzer(shape).IsValid():
        raise ValueError("Invalid B-Rep")
    if sum(1 for _ in shapes(shape, TopAbs_SOLID, TopoDS.Solid)) != 1:
        raise ValueError("Expected one solid")
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, box, False, False)
    z_min, z_max = box.CornerMin().Z(), box.CornerMax().Z()
    cylinders, ends = [], []
    for face in shapes(shape, TopAbs_FACE, TopoDS.Face):
        surface = BRepAdaptor_Surface(face)
        if surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            direction, origin = cylinder.Axis().Direction(), cylinder.Location()
            if abs(abs(direction.Z()) - 1) > 1e-8 or math.hypot(origin.X(), origin.Y()) > 1e-6:
                raise ValueError("Cylinder is not on the reviewed common Z axis")
            zz = [BRep_Tool.Pnt_s(v).Z() for v in shapes(face, TopAbs_VERTEX, TopoDS.Vertex)]
            cylinders.append((2 * cylinder.Radius(), min(zz), max(zz)))
        elif surface.GetType() == GeomAbs_Plane:
            plane = surface.Plane()
            if abs(abs(plane.Axis().Direction().Z()) - 1) < 1e-8:
                ends.append(plane.Location().Z())
    if len(cylinders) != 4 or len(ends) != 2:
        raise ValueError("Expected four cylindrical faces and two normal end planes")
    lo, hi = sorted(ends)
    if abs(z_min - lo) > 1e-5 or abs(z_max - hi) > 1e-5:
        raise ValueError("End planes do not bound the full model")
    outer = expected["outerDiameter"], expected["outerDiameterSmall"]
    inner = outer[0] - 2 * expected["wallThickness"], outer[1] - 2 * expected["wallThicknessSmall"]
    found = []
    for diameter in (*outer, *inner):
        candidates = [c for c in cylinders if abs(c[0] - diameter) < 1e-6]
        if len(candidates) != 1:
            raise ValueError("Model diameters/walls do not match the catalogue execution")
        found.append(candidates[0])
    if any(abs(c[1] - lo) > 1e-6 for c in [found[0], found[2]]) or any(abs(c[2] - hi) > 1e-6 for c in [found[1], found[3]]):
        raise ValueError("The cylindrical surfaces do not reach the appropriate end planes")
    return {
        "lengthMm": round(hi - lo, 6),
        "cylindricalLengthLargeMm": math.floor((found[0][2] - lo) * 10000) / 10000,
        "cylindricalLengthSmallMm": math.floor((hi - found[1][1]) * 10000) / 10000,
    }


def verify(reference, root):
    results = []
    for row in reference["rows"]:
        path = (root / row["modelPath"]).resolve()
        if not path.is_relative_to(root.resolve()) or path.suffix.lower() not in (".stp", ".step"):
            raise ValueError("Model path is outside the project")
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["modelSha256"]:
            raise ValueError(f"Model changed: {row['modelPath']}")
        measured = measure_reducer(path, row)
        if measured != row["dimensions"]:
            raise ValueError(f"Measured geometry changed: {row['componentId']}: {measured}")
        results.append({"componentId": row["componentId"], "dimensions": measured, "verified": True})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--reference", type=Path, default=Path(__file__).resolve().parents[1] / "data/component-cad-dimensions.json")
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(args.reference.read_text(encoding="utf-8")), args.root), ensure_ascii=False, indent=2))
