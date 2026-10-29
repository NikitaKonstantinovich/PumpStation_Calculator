"""Audit the downloaded Zelentech reference models, not catalogue SKU geometry.

Requires cadquery-ocp. The reviewed files use a Z axis and three axial planes.
Any change of source hash or topology fails instead of silently accepting a model.
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
        raise ValueError("Empty STEP")
    shape = reader.OneShape()
    if not BRepCheck_Analyzer(shape).IsValid() or sum(1 for _ in shapes(shape, TopAbs_SOLID)) != 1:
        raise ValueError("Expected one valid solid")
    planes, diameters, holes = set(), set(), set()
    for face in shapes(shape, TopAbs_FACE):
        surface = BRepAdaptor_Surface(TopoDS.Face(face))
        if surface.GetType() == GeomAbs_Plane:
            plane = surface.Plane()
            if abs(abs(plane.Axis().Direction().Z()) - 1) < 1e-8:
                planes.add(round(plane.Location().Z(), 6))
        elif surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            if abs(abs(cylinder.Axis().Direction().Z()) - 1) > 1e-8:
                raise ValueError("Unexpected cylinder axis")
            centre = cylinder.Location()
            diameter = round(2 * cylinder.Radius(), 6)
            if math.hypot(centre.X(), centre.Y()) < 1e-6:
                diameters.add(diameter)
            else:
                holes.add((round(centre.X(), 6), round(centre.Y(), 6), diameter))
    circles = {round(2 * math.hypot(x, y), 4) for x, y, _ in holes}
    hole_diameters = {d for _, _, d in holes}
    if len(planes) != 3 or len(diameters) != 3 or len(circles) != 1 or len(hole_diameters) != 1:
        raise ValueError("Unexpected plate / raised-face topology")
    z = sorted(planes)
    return dict(thicknessMm=z[-1]-z[0], plateThicknessMm=z[1]-z[0], raisedFaceHeightMm=z[2]-z[1],
                boreDiameterMm=min(diameters), outerDiameterMm=max(diameters),
                raisedFaceDiameterMm=sorted(diameters)[1], boltCircleMm=circles.pop(),
                boltHoleDiameterMm=hole_diameters.pop(), holes=len(holes))


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "data/supplier-flange-cad-research.json").read_text(encoding="utf-8"))
    for row in manifest["models"]:
        path = (root / row["path"]).resolve()
        if not path.is_relative_to(root) or path.suffix != ".step":
            raise ValueError("Unexpected model path")
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            raise ValueError(f"Changed source: {path}")
        actual = measure(path)
        if actual != row["measuredDimensions"]:
            raise ValueError(f"Geometry mismatch: {path}: {actual}")
        print(f"PN{row['pn']} DN{row['dn']}: {actual}; reference only")
    print(f"Verified {len(manifest['models'])} reference solids; no catalogue mapping approved")
