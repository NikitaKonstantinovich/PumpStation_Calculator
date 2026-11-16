"""Extract only the pressed AISI 304 backing ring from Kohler's joined R-358 PN16 STEP.

The weld-in sleeve (1.4404) is already a separate project component. Split on the
two contact planes in the supplier B-rep; keep its bolt pad, outer return and inner
fold. No scaling, redrilling or substitute PN10 part. All dimensions below are mm.
"""
import hashlib
import math
import re
import runpy
from pathlib import Path

from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Splitter
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_Transform
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.STEPControl import STEPControl_Reader, STEPControl_Writer, STEPControl_AsIs
from OCP.TopAbs import TopAbs_SOLID
from OCP.collections import List_TopoDS_Shape
from OCP.gp import gp_Ax1, gp_Dir, gp_Pln, gp_Pnt, gp_Trsf

directory = Path(__file__).resolve().parents[2] / "Equipment/Piping/3D/Kohler"
index = runpy.run_path(str(Path(__file__).with_name("index-stamped-flanges.py")))
for dn, sku, sha, od, pad, fold, bore, pcd, holes in [
    (150, 176761110, "a27399609c34b6521cf36025b15143d918033721ad3a7090a611e6a4f5f85d56", 285, 24.5, 99, 173, 240, 8),
    (200, 176761120, "e935b44f11cb1c143c3a64f548766367ee516d949896a5166da953ef4d4d803e", 340, 28.5, 125.5, 225, 295, 12),
]:
    source = directory / f"3D_R358_PN16_DN{dn}_{sku}.STEP"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == sha
    reader = STEPControl_Reader()
    assert int(reader.ReadFile(str(source))) == 1 and reader.TransferRoots()
    args, planes = List_TopoDS_Shape(), List_TopoDS_Shape()
    args.Append(reader.OneShape())
    for y in (0, pad):
        planes.Append(BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0,y,0),gp_Dir(0,1,0)),-400.,400.,-400.,400.).Face())
    split = BRepAlgoAPI_Splitter()
    split.SetArguments(args); split.SetTools(planes); split.Build()
    assert split.IsDone()
    solids = list(index["shapes"](split.Shape(), TopAbs_SOLID))
    assert len(solids) == 7
    def region(radius, start, end):
        expected = [-radius, start, -radius, radius, end, radius]
        result, = [s for s in solids if index["bounds"](s) == expected]
        return result
    ring = region(od/2, pad, pad+3)
    for radius in (fold, od/2):
        fused = BRepAlgoAPI_Fuse(ring, region(radius, 0, pad))
        fused.Build(); assert fused.IsDone()
        fused.SimplifyResult()
        ring, = index["shapes"](fused.Shape(), TopAbs_SOLID)
    assert BRepCheck_Analyzer(ring).IsValid()
    turn = gp_Trsf()
    turn.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(0,0,1)), -math.pi/2)
    file = directory / f"R358-PN16-DN{dn}-ring.step"
    writer = STEPControl_Writer()
    assert int(writer.Transfer(BRepBuilderAPI_Transform(ring,turn,True).Shape(),STEPControl_AsIs)) == 1
    assert int(writer.Write(str(file))) == 1
    # A conversion timestamp is not part geometry. Keep the checked-in CAD hashes stable.
    file.write_bytes(re.sub(rb"'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d'", b"'2000-01-01T00:00:00'", file.read_bytes()))
    _, dims, _ = index["measure"](file)
    assert dims == dict(lengthMm=pad+3,outerMm=od,innerMm=bore,boltCircleMm=pcd,boltHoles=holes,boltHoleMm=21.5)
