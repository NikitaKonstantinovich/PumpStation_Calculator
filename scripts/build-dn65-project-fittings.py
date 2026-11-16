"""Generate the two DN65 layout solids. All coordinates are in mm, X=0 is the mating face."""
import argparse
import hashlib
import json
import math
import runpy
from pathlib import Path

from OCP.BRepAlgoAPI import BRepAlgoAPI_Common, BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon, BRepBuilderAPI_MakeWire, BRepBuilderAPI_Transform
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeRevol
from OCP.GC import GC_MakeArcOfCircle
from OCP.GProp import GProp_GProps
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.StlAPI import StlAPI_Writer
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec

SCRIPTS = Path(__file__).resolve().parent
FRONT = SCRIPTS.parent
ROOT = FRONT.parent
stamp = runpy.run_path(str(SCRIPTS / "index-stamped-flanges.py"))
axis = gp_Ax1(gp_Pnt(), gp_Dir(1, 0, 0))


def volume(shape):
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, props)
    return props.Mass()


def save_step(shape, path):
    solid, = stamp["shapes"](shape, TopAbs_SOLID)
    assert BRepCheck_Analyzer(solid).IsValid()
    if volume(solid) < 0:
        solid.Reverse()
    assert volume(solid) > 0
    writer = STEPControl_Writer()
    assert int(writer.Transfer(solid, STEPControl_AsIs)) == 1
    assert int(writer.Write(str(path))) == 1


def collar():
    rows = json.loads((FRONT / "data/collar-cad-models.json").read_text("utf-8"))["models"]
    source = next(row for row in rows if row["nativeSha256"] == "6716a4b95f1f158cf0a24529daade41a05b1ff40fb3e67a734f18316f89c5dd2")
    assert hashlib.sha256((ROOT / source["nativePath"]).read_bytes()).hexdigest() == source["nativeSha256"]
    profile = source["conversion"]["bodies"][0]["profile"]
    # Preserve OD, lip and outer bend. Make the returning inner bend concentric
    # with the outer R3 fillet (R6), tangent to the new 70.1 mm bore and face.
    assert profile[0]["a"] == [5, 36.05] and profile[-1]["a"] == [0, 41.05]
    profile[0].update(a=[6, 35.05], b=[25, 35.05])
    profile[1]["a"] = [25, 35.05]
    diagonal = 6 / math.sqrt(2)
    profile[-1].update(b=[6, 35.05], mid=[6-diagonal, 41.05-diagonal])
    wire = BRepBuilderAPI_MakeWire()
    for s in profile:
        a, b = (gp_Pnt(*s[k], 0) for k in ("a", "b"))
        edge = BRepBuilderAPI_MakeEdge(a, b) if s["kind"] == "line" else BRepBuilderAPI_MakeEdge(
            GC_MakeArcOfCircle(a, gp_Pnt(*s["mid"], 0), b).Value())
        wire.Add(edge.Edge())
    return BRepPrimAPI_MakeRevol(BRepBuilderAPI_MakeFace(wire.Wire()).Face(), axis).Shape()


def flange():
    # Project layout profile. Italvalvole 14474 confirms the product type, grade, PN and eight holes.
    # Use the library's pressed LF-076 profile for the folds, not as a manufacturer drawing of 14474.
    src = ROOT / "Equipment/Piping/3D/HECO/Pressed/heco_LF-076-GPR-1.step"
    assert hashlib.sha256(src.read_bytes()).hexdigest() == "d6a22eea5f299ee52420d1b663d39376fe88551428fa2257ae029dcfdd4cc90c"
    original, dims, _ = stamp["measure"](src)
    assert dims["boltHoles"] == 4 and dims["innerMm"] == 81
    section = BRepBuilderAPI_MakePolygon()
    for x, r in [(-1, 0), (20, 0), (20, 100), (-1, 100)]:
        section.Add(gp_Pnt(x, r, 0))
    section.Close()
    cut = BRepAlgoAPI_Common(original, BRepBuilderAPI_MakeFace(section.Wire()).Face()).Shape()
    face, = stamp["shapes"](cut, TopAbs_FACE)
    ring = BRepPrimAPI_MakeRevol(face, axis).Shape()
    if volume(ring) < 0:
        ring.Reverse()
    for i in range(8):
        angle = (i + .5) * math.tau / 8
        center = gp_Pnt(-1, 72.5 * math.cos(angle), 72.5 * math.sin(angle))
        hole = BRepPrimAPI_MakeCylinder(gp_Ax2(center, axis.Direction()), 9, 23).Shape()
        ring = BRepAlgoAPI_Cut(ring, hole).Shape()
    # Entry relief clears the measured external R3 at the back of the collar lip.
    relief = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(), axis.Direction()), 41.2, 40.5, .7).Shape()
    return BRepAlgoAPI_Cut(ring, relief).Shape()


def main(output):
    output.mkdir(parents=True, exist_ok=False)
    neck, ring = collar(), flange()
    neck_path, ring_path = output / "DN65-76.1x3-collar.step", output / "DN65-PN16-8x18-pressed-layout.step"
    save_step(neck, neck_path)
    save_step(ring, ring_path)
    neck_dims, = runpy.run_path(str(SCRIPTS / "measure-collar-step.py"))["measure"](neck_path)
    measured, dims, _ = stamp["measure"](ring_path)
    assert [neck_dims[k] for k in ("outerDiameterMm","wallThicknessMm","lengthMm","lipOuterDiameterMm","lipThicknessMm")] == [76.1,3,25,122,3]
    assert dims == dict(lengthMm=20,outerMm=185,innerMm=81,boltCircleMm=145,boltHoles=8,boltHoleMm=18)
    tr = gp_Trsf()
    tr.SetTranslation(gp_Vec(3, 0, 0))
    seated = BRepBuilderAPI_Transform(measured, tr, True).Shape()
    assert abs(volume(BRepAlgoAPI_Common(neck, seated).Shape())) < .001
    for shape, path in [(neck, "DN65-76.1x3-collar"), (measured, "DN65-PN16-8x18-pressed-layout")]:
        BRepMesh_IncrementalMesh(shape, .06, False, .10, False)
        writer = StlAPI_Writer()
        writer.ASCIIMode = False
        assert writer.Write(shape, str(output / (path + ".stl")))
    print(neck_dims, dims)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for the derived STEP and STL files")
    main(parser.parse_args().output)
