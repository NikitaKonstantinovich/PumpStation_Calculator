"""Build the server's native-part index from measured CAD. All lengths are mm.

The optional hardware audit records SOLIDWORKS configurations, body extrema and
cylinders from InspectHardware.cs. Geometry is never inferred from DN alone.
"""
import argparse
import hashlib
import json
import math
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "frontend/data"
UNIT = [[1,0,0],[0,1,0],[0,0,1]]
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path): return json.loads(path.read_text(encoding="utf-8-sig"))
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def pose(rows=UNIT,shift=(0,0,0)): return [v for row in rows for v in row]+[v/1000 for v in shift]+[1,0,0,0]
def record(path,**kwargs):
    return dict(source=path.relative_to(ROOT).as_posix(),sourceHash=sha(path),**kwargs)

def flange(path):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopAbs import TopAbs_SOLID,TopAbs_FACE,TopAbs_EDGE
    from OCP.GeomAbs import GeomAbs_Cylinder,GeomAbs_Plane,GeomAbs_Circle
    r=STEPControl_Reader()
    if int(r.ReadFile(str(path)))!=1:return
    r.SetSystemLengthUnit(1.0)
    if not r.TransferRoots():return
    shape=r.OneShape(); solids=TopExp_Explorer(shape,TopAbs_SOLID)
    if not solids.More():return
    solids.Next()
    if solids.More():return
    cylinders=[]; planes=[]; ex=TopExp_Explorer(shape,TopAbs_FACE)
    while ex.More():
        face=TopoDS.Face(ex.Current()); s=BRepAdaptor_Surface(face);ex.Next()
        if s.GetType()==GeomAbs_Cylinder:
            cyl=s.Cylinder()
            cylinders.append((cyl.Radius(),list(cyl.Location().Coord()),list(cyl.Axis().Direction().Coord())))
        elif s.GetType()==GeomAbs_Plane:
            planes.append((list(s.Plane().Location().Coord()),list(s.Plane().Axis().Direction().Coord()),face))
    if not cylinders:return
    outer,center,axis=max(cylinders,key=lambda c:c[0]); k=max(range(3),key=lambda i:abs(axis[i]))
    if abs(axis[k])<.999999:return
    axis=UNIT[k][:]
    levels=sorted({round(p[k],4) for p,n,_ in planes if abs(n[k])>.999999})
    if len(levels) not in (2,3):return
    start=levels[0]; extra={}
    if len(levels)==3:
        low,high=levels[1]-levels[0],levels[2]-levels[1]
        if min(low,high)>6 or abs(low-high)<1:return
        if high<low:start=levels[-1];axis[k]=-1
        extra["faceHeightMm"]=min(low,high)
    center[k]=start; holes=set(); central=set()
    for radius,p,n in cylinders:
        if abs(n[k])<.999999:return
        v=[0 if i==k else p[i]-center[i] for i in range(3)]
        if math.hypot(*v)<.005: central.add(round(2*radius,3))
        else: holes.add(tuple(round(x,3) for x in [*v,2*radius]))
    holes=sorted(holes)
    if len(holes)<4 or len(central)<2:return
    if extra:
        # A bevel on the raised face can eliminate its cylindrical land.
        rim=[]
        for point,normal,face in planes:
            if abs(normal[k])<.999999 or abs(start-point[k])>.01:continue
            edges=TopExp_Explorer(face,TopAbs_EDGE)
            while edges.More():
                curve=BRepAdaptor_Curve(TopoDS.Edge(edges.Current()));edges.Next()
                if curve.GetType()!=GeomAbs_Circle:continue
                circle=curve.Circle(); origin=circle.Location().Coord()
                if math.hypot(*(origin[i]-center[i] for i in range(3) if i!=k))<.01:rim.append(2*circle.Radius())
        if not rim:return
        extra["faceDiameterMm"]=max(rim)
    radii=[math.hypot(*h[:3]) for h in holes]; rad=radii[0]
    if max(radii)-min(radii)>.01 or len({h[3] for h in holes})!=1:return
    u=[v/rad for v in holes[0][:3]]; v=cross(axis,u)
    angles=sorted(math.atan2(dot(h[:3],v),dot(h[:3],u)) for h in holes)
    if any(abs((angles[(i+1)%len(angles)]-a)%(2*math.pi)-2*math.pi/len(angles))>.001 for i,a in enumerate(angles)):return
    a=math.pi/len(holes); target=[0,math.sin(a),-math.cos(a)]
    src=[axis,u,v]; dst=[UNIT[0],target,cross(UNIT[0],target)]
    rows=[[sum(src[b][i]*dst[b][j] for b in range(3)) for j in range(3)] for i in range(3)]
    shift=[-sum(center[i]*rows[i][j] for i in range(3)) for j in range(3)]
    dims=dict(lengthMm=levels[-1]-levels[0],outerMm=2*outer,innerMm=min(central),boltHoles=len(holes),boltCircleMm=2*rad,boltHoleMm=holes[0][3],**extra)
    return {k:round(v,2) for k,v in dims.items()},pose(rows,shift)

def hardware(audit):
    result=[]; files={p.name:p for p in (ROOT/'Equipment/Fasteners').rglob('*') if p.is_file()}
    for block in re.split(r'^FILE ',audit.read_text(encoding='utf-8-sig'),flags=re.M)[1:]:
        filename,rest=block.split(' configs=',1)
        if filename not in files:continue
        path=files[filename]
        for m in re.finditer(r'^(.+) EXT ([\d.,-]+)\r?\n((?:CYL [^\n]+\n?)*)',rest,re.M):
            cfg,box,cyl=m.groups(); x,y,z,X,Y,Z=map(float,box.split(',')); label=cfg.replace('М','M').replace('х','x')
            if 'DIN933' in filename:
                size=re.search(r'M(\d+)\s*x\s*(\d+)',label,re.I)
                if not size:continue
                d,L=map(int,size.groups()); H=Z
                if abs(-z-L)>.05 or H<=0:continue
                kind='bolt'; dims=dict(lengthMm=L,headMm=H,flatsMm=round(X-x,2)); t=pose([[0,0,1],[0,1,0],[-1,0,0]])
            elif 'DIN 125' in filename:
                rings=[round(abs(float(line.split(',')[-1]))*2000,2) for line in cyl.splitlines()]
                if len(set(rings))<2:continue
                match=re.search(r'[- ](?:A )?(\d+(?:\.\d+)?)$',label)
                if not match:continue
                d=int(float(match[1]));kind='washer';dims=dict(lengthMm=round(X-x,2),outerMm=max(rings),innerMm=min(rings));t=pose(shift=[-x,0,0])
            elif 'DIN 934' in filename:
                size=re.search(r'M(\d+) ',label)
                if not size:continue
                d=int(size[1]);kind='nut';dims=dict(lengthMm=round(Z-z,2),flatsMm=round(X-x,2));t=pose([[0,0,-1],[0,1,0],[1,0,0]],[-z,0,0])
            elif 'Шпилька' in filename:
                size=re.search(r'М(\d+) L=(\d+)',filename)
                if not size:continue
                d,L=map(int,size.groups())
                if max(abs(Y-y-L),abs(X-x-d),abs(Z-z-d))>.05:continue
                kind='stud';dims=dict(lengthMm=L);t=pose([[0,-1,0],[1,0,0],[0,0,1]],[-y,0,0])
            else:continue
            result.append(record(path,hardware=kind,nominalMm=d,dimensions=dims,configuration=cfg,placement=t))
    return result

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--hardware-audit',type=Path,required=True)
    args=parser.parse_args(); rows=hardware(args.hardware_audit)
    for c in load(DATA/'collar-cad-models.json')['models']:
        if len(c['dimensions'])!=1:continue
        f=ROOT/c['nativePath'];d=c['dimensions'][0]
        if sha(f)!=c['nativeSha256']:raise ValueError(f)
        # The measured STEP meridian uses the original SLDPRT coordinates.
        rows.append(record(f,alias=c['modelSha256'],placement=pose()))
        if c['modelSha256'] in {r['hash'] for r in load(DATA/'insertion-model-bindings.json')['rows'] if r['kind']=='collar'}:
            rows.append(record(f,kind='collar',dimensions=dict(lengthMm=d['lengthMm'],outerMm=d['outerDiameterMm'],innerMm=d['innerDiameterMm'],lipOuterMm=d['lipOuterDiameterMm'],lipThicknessMm=d['lipThicknessMm']),placement=pose([[-1,0,0],[0,-1,0],[0,0,1]],[d['lengthMm'],0,0])))
    for row in load(DATA/'loose-flange-pn16-research.json')['rows']:
        src=ROOT/'frontend'/row['modelPath']
        if sha(src)!=row['modelSha256']:raise ValueError(src)
        dst=ROOT/'Equipment/Piping/3D/HECO'/src.name;dst.parent.mkdir(exist_ok=True)
        if not dst.exists():shutil.copyfile(src,dst)
        if sha(dst)!=row['modelSha256']:raise ValueError(dst)
        dims,t=flange(dst)
        rows.append(record(dst,kind='flange',equipmentId=row['candidateComponentId'],dimensions=dims,placement=t))
    standard=load(DATA/'flange-dimensions.json')['rows']
    for path in sorted((ROOT/'Equipment/Piping').rglob('*.stp')):
        if not any('ГОСТ33259-2015' in directory for directory in path.parts):continue
        name=path.stem
        match=re.search(r'Фланец (\d+)-(\d+)-01-(\d+)-[BВ]-(Ст\.? ?20|AISI304)',name,re.I)
        if not match:continue
        measured=flange(path)
        if not measured:continue
        dims,t=measured; dn,pn,series,grade=match.groups()
        for r in standard:
            if r['dn']!=int(dn) or r['pn']!=int(pn) or not re.search(rf'-01-{series}-[BВ]',r['name'],re.I):continue
            if ('aisi' in grade.lower())!=('aisi304' in (r['family']+r['name']).lower()):continue
            if 'aisi' not in grade.lower() and not re.search(r'Ст(?:аль)?\.?\s*20',r['family']+r['name'],re.I):continue
            rows.append(record(path,kind='flange',equipmentId=r['componentId'],dimensions=dims,placement=t))
    project=load(DATA/'dn65-project-fittings.json')['collar']
    assert sha(ROOT/project['source'])==project['sourceHash']
    rows.append(record(ROOT/project['source'],kind='collar',equipmentId=project['componentId'],
                       alias=project['sourceHash'],dimensions=project['dimensions'],placement=pose()))
    (DATA/'solidworks-parts.json').write_text(json.dumps(rows,ensure_ascii=False,indent=1)+'\n',encoding='utf8')
    from collections import Counter
    print(dict(Counter(r.get('hardware') or r.get('kind') or 'nativeAlias' for r in rows)))
if __name__=='__main__':main()
