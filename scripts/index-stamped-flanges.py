"""Measure approved loose-flange CAD and tessellate the very same solid for the browser.

Run with cadquery-ocp, passing --cadmpeg for the original SLDPRT library files.
Native X=0 is the collar seat. Rotate only about X to align the actual bolt circle.
"""
import argparse, hashlib, json, math, subprocess, tempfile
from pathlib import Path
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
from OCP.gp import gp_Ax1, gp_Dir, gp_Pnt, gp_Trsf
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT/'frontend/data'
HECO = ROOT/'Equipment/Piping/3D/HECO/Pressed'
LOCAL = ROOT/'Equipment/Piping/3D/Элементы трубопроводов/Фланцы/Штампованные'
def shapes(shape, kind):
    ex=TopExp_Explorer(shape,kind)
    while ex.More():
        yield ex.Current()
        ex.Next()
def bounds(shape):
    b=Bnd_Box(); BRepBndLib.AddOptimal_s(shape,b,False,False)
    return [round(v,4) for v in (*b.CornerMin().Coord(),*b.CornerMax().Coord())]

def measure(path):
    r=STEPControl_Reader(); assert int(r.ReadFile(str(path)))==1
    r.SetSystemLengthUnit(1); assert r.TransferRoots()
    solid,=shapes(r.OneShape(),TopAbs_SOLID)
    if not BRepCheck_Analyzer(solid).IsValid(): raise ValueError(f'Invalid B-rep: {path}')
    x,y,z,X,Y,Z=bounds(solid)
    assert x==0 and -y==Y==Z==-z and X>0
    holes=set(); central=set(); levels=set()
    for f in shapes(solid,TopAbs_FACE):
        a=BRepAdaptor_Surface(TopoDS.Face(f))
        if a.GetType()==GeomAbs_Plane and abs(a.Plane().Axis().Direction().X())>.999999:
            levels.add(round(a.Plane().Location().X(),4))
        if a.GetType()!=GeomAbs_Cylinder:continue
        c=a.Cylinder()
        if abs(c.Axis().Direction().X())<.999999:continue
        _,hy,hz=c.Location().Coord(); d=round(2*c.Radius(),4)
        if math.hypot(hy,hz)<.001: central.add(d)
        else: holes.add((round(hy,4),round(hz,4),d))
    holeD,={h[2] for h in holes}; pcd,={round(2*math.hypot(h[0],h[1]),2) for h in holes}
    assert {0,X}.issubset(levels) and len(levels)>=3 and len(holes) in (4,8,12)
    a=math.pi/len(holes)-math.pi/2-math.atan2(next(iter(holes))[1],next(iter(holes))[0])
    # Clocking modulo one hole spacing. All holes must land on browser axes.
    step=2*math.pi/len(holes); a=(a+step/2)%step-step/2
    for hy,hz,_ in holes:
        residual=(math.atan2(hz,hy)+a+math.pi/2-step/2+step/2)%step-step/2
        assert abs(residual)<1e-5
    return solid, dict(lengthMm=X,outerMm=2*Y,innerMm=min(central),boltCircleMm=pcd,boltHoles=len(holes),boltHoleMm=holeD),a

def main():
    p=argparse.ArgumentParser();p.add_argument('--cadmpeg',required=True,type=Path);args=p.parse_args()
    parts={};catalog={}
    # DN40 and DN80 have original AISI PN16 solids. DN50 local bore is 60.5
    # for a 60.3 neck; use the supplier's 65 mm collar seat. DN100/125 local
    # files are carbon steel, and the local DN125 cannot pass a 139.7 mm neck.
    candidates={40:LOCAL/'Фланец_1_040х16_AISI_штампованный.SLDPRT',80:LOCAL/'Фланец_1_080х16_AISI_штампованный.SLDPRT',
                **{dn:HECO/f'heco_LF-{code}-GPR-1.step' for dn,code in [(50,'060'),(65,'076'),(100,'114'),(125,'139')]},
                **{dn:ROOT/f'Equipment/Piping/3D/Kohler/R358-PN16-DN{dn}-ring.step' for dn in (150,200)}}
    for dn,src in candidates.items():
        with tempfile.TemporaryDirectory() as tmp:
            path=src
            if src.suffix.lower()=='.sldprt':
                path=Path(tmp)/'native.step'
                subprocess.run([str(args.cadmpeg.resolve()),'convert',str(src),'-o',str(path)],check=True,capture_output=True)
            solid,dims,angle=measure(path)
        h=hashlib.sha256(src.read_bytes()).hexdigest()
        tr=gp_Trsf();tr.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,0,0)),angle)
        mesh=BRepBuilderAPI_Transform(solid,tr,True).Shape()
        BRepMesh_IncrementalMesh(mesh,.12,False,.16,False)
        writer=StlAPI_Writer();writer.ASCIIMode=False
        assert writer.Write(mesh,str(ROOT/f'frontend/public/model-assets/stamped-{h}.stl'))
        c,s=math.cos(angle),math.sin(angle)
        parts[str(dn)]=dict(source=src.relative_to(ROOT).as_posix(),sourceHash=h,dimensions=dims,
            placement=[1,0,0,0,c,s,0,-s,c,0,0,0,1,0,0,0],name=f'Фланец свободный штампованный DN{dn} '+('Kohler R-358 AISI 304' if src.parent.name=='Kohler' else 'HECO '+src.stem.removeprefix('heco_') if src.suffix=='.step' else 'AISI (библиотека)'))
    fields=dict(lengthMm='thicknessMm',outerMm='outerDiameterMm',innerMm='boreDiameterMm',boltCircleMm='boltCircleMm',boltHoles='holes',boltHoleMm='boltHoleDiameterMm')
    for r in json.loads((DATA/'flange-dimensions.json').read_text(encoding='utf8'))['rows']:
        if r['family']!='Фланец свободный AISI304':continue
        old={key:r['dimensions'][field] for key,field in fields.items() if field in r['dimensions']}
        dn=str(r['dn']); model=parts.get(dn)
        compatible=model and len(old)==6 and all(old[k]==model['dimensions'][k] for k in ('boltHoles','boltCircleMm','outerMm'))
        catalog[r['componentId']]=dict(previous=old,model=dn if compatible else None)
    (DATA/'stamped-loose-flanges.json').write_text(json.dumps(dict(parts=parts,catalog=catalog),ensure_ascii=False,indent=1)+'\n',encoding='utf8')
    print('Verified',len(parts),'solids;',sum(bool(v['model']) for v in catalog.values()),'catalogue bindings.')
if __name__=='__main__':main()
