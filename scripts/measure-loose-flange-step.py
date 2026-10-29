"""Verify the reviewed HECO loose-plate STEP models against the research manifest.

Read-only OCCT audit; requires cadquery-ocp. Units are converted by OCCT to mm.
The reviewed models have their common axis along X. Thickness is measured between
planar faces, and bore diameter from its cylindrical surface, never nominal DN.
This verifies geometry, not material certification or the catalogue mapping.
"""
import hashlib
import json
import math
from pathlib import Path


def measure(path):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane

    def shapes(shape, kind):
        explorer = TopExp_Explorer(shape, kind)
        while explorer.More():
            yield explorer.Current()
            explorer.Next()

    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(path))) != 1:
        raise ValueError("STEP read failed")
    reader.SetSystemLengthUnit(1.0)
    if not reader.TransferRoots():
        raise ValueError("STEP has no transferable roots")
    shape = reader.OneShape()
    if shape.IsNull() or not BRepCheck_Analyzer(shape).IsValid():
        raise ValueError("Invalid B-Rep")
    if sum(1 for _ in shapes(shape, TopAbs_SOLID)) != 1:
        raise ValueError("Expected one solid")
    planes, diameters, holes = set(), set(), set()
    for face in shapes(shape, TopAbs_FACE):
        surface = BRepAdaptor_Surface(TopoDS.Face(face))
        if surface.GetType() == GeomAbs_Plane:
            plane = surface.Plane()
            if abs(abs(plane.Axis().Direction().X()) - 1) < 1e-8:
                planes.add(round(plane.Location().X(), 6))
        elif surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            if abs(abs(cylinder.Axis().Direction().X()) - 1) > 1e-8:
                raise ValueError("Cylinder not parallel to the reviewed axis")
            centre = cylinder.Location()
            diameter = round(2 * cylinder.Radius(), 6)
            if math.hypot(centre.Y(), centre.Z()) < 1e-6:
                diameters.add(diameter)
            else:
                holes.add((round(centre.Y(), 6), round(centre.Z(), 6), diameter))
    hole_diameters = {hole[2] for hole in holes}
    bolt_circles = {round(2 * math.hypot(hole[0], hole[1]), 4) for hole in holes}
    if len(planes) != 2 or len(diameters) != 2 or len(hole_diameters) != 1 or len(bolt_circles) != 1:
        raise ValueError("Shape differs from the reviewed loose-plate geometry")
    return {
        "thicknessMm": round(max(planes) - min(planes), 6),
        "boreDiameterMm": min(diameters),
        "outerDiameterMm": max(diameters),
        "boltCircleMm": next(iter(bolt_circles)),
        "boltHoleDiameterMm": next(iter(hole_diameters)),
        "holes": len(holes),
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "data/loose-flange-pn16-research.json").read_text(encoding="utf-8"))
    for row in manifest["rows"]:
        path = (root / row["modelPath"]).resolve()
        if not path.is_relative_to(root) or path.suffix.lower() != ".step":
            raise ValueError("Unexpected model path")
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["modelSha256"]:
            raise ValueError(f"Changed source: {path}")
        result = measure(path)
        if result != row["dimensions"]:
            raise ValueError(f"Geometry mismatch DN{row['dn']}: {result}")
        print(f"DN{row['dn']}: thickness={result['thicknessMm']:g}, bore={result['boreDiameterMm']:g} mm; verified")
    print(f"Verified {len(manifest['rows'])} models; catalogue and database unchanged")
