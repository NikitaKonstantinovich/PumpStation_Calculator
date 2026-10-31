"""Extract mounting holes from normalized STEP; never infer clocking from DN.

OCP environment only. Does not change CAD/meshes. Uses full inner cylindrical
walls, planar bearing faces and empty centreline points at both ends and mid-span. Unsupported or
ambiguous holes are omitted; this is not a general collision/strength audit.
Run --pump-id ID for a bounded audit, --kms for confirmed KMS models, or omit
both to inspect every CDM profile. Metadata remains in native STEP coordinates.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

def inspect(task):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED, TopAbs_SOLID, TopAbs_IN, TopAbs_ON
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.BRepClass import BRepClass_FaceClassifier
    from OCP.gp import gp_Pnt
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.TopExp import TopExp
    from OCP.collections import IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher
    def unique_shapes(shape, kind):
        mapped = IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher()
        TopExp.MapShapes_s(shape, kind, mapped)
        return [mapped.FindKey(i) for i in range(1, mapped.Extent()+1)]
    root, pump_id, profile = task
    path = Path(root) / profile['source']
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != profile['sourceHash']:
        return pump_id, None, 'source hash changed'
    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(path))) != 1:
        return pump_id, None, 'STEP read failed'
    reader.SetSystemLengthUnit(1.0)
    reader.TransferRoots()
    solids=[]
    for raw in unique_shapes(reader.OneShape(),TopAbs_SOLID):
        s=TopoDS.Solid(raw);box=Bnd_Box();BRepBndLib.Add_s(s,box,False)
        lo,hi=box.CornerMin(),box.CornerMax()
        solids.append(([lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z()],s,None))
    def empty_point(x,y,z):
        for i,(b,s,classifier) in enumerate(solids):
            if not all(b[k]-1e-5<=v<=b[k+3]+1e-5 for k,v in enumerate((x,y,z))):continue
            if classifier is None: classifier=BRepClass3d_SolidClassifier(s);solids[i]=(b,s,classifier)
            classifier.Perform(gp_Pnt(x,y,z),1e-6)
            if classifier.State() in (TopAbs_IN,TopAbs_ON): return False
        return True
    cylinders = []; planes = {}
    for raw in unique_shapes(reader.OneShape(), TopAbs_FACE):
        face = TopoDS.Face(raw)
        surface = BRepAdaptor_Surface(face)
        if surface.GetType() == GeomAbs_Plane and abs(surface.Plane().Axis().Direction().X()) > .999999:
            coordinate=round(surface.Plane().Location().X(),5)
            planes.setdefault(coordinate,[]).append(face)
        if surface.GetType() != GeomAbs_Cylinder or face.Orientation() != TopAbs_REVERSED:
            continue
        cyl = surface.Cylinder()
        if abs(cyl.Axis().Direction().X()) < .999999:
            continue
        box = Bnd_Box()
        BRepBndLib.AddOptimal_s(face, box, False, False)
        lo, hi = box.CornerMin().X(), box.CornerMax().X()
        cylinders.append(dict(y=cyl.Location().Y(), z=cyl.Location().Z(), diameter=2*cyl.Radius(), lo=lo, hi=hi, angle=surface.LastUParameter()-surface.FirstUParameter()))
    # STEP often splits the periodic wall at its seam into two half cylinders.
    merged = {}
    for c in cylinders:
        key=tuple(round(c[k],4) for k in ('y','z','diameter','lo','hi'))
        if key in merged: merged[key]['angle']+=c['angle']
        else: merged[key]=dict(c)
    cylinders=[c for c in merged.values() if abs(c['angle']-2*math.pi)<1e-4]
    def bearing_plane(holes, end, direction):
        # A chamfer shortens a cylindrical wall. The head/washer must bear on
        # the actual annular plane beyond it, never on the wall's trimmed end.
        nearby=sorted((x for x in planes if -1e-4 <= (x-end)*direction <= 3),key=lambda x:abs(x-end))
        for x in nearby:
            found=True
            for h in holes:
                radius=h['diameter']/2+2
                for i in range(8):
                    a=i*math.pi/4;p=gp_Pnt(x,h['y']+radius*math.cos(a),h['z']+radius*math.sin(a))
                    if not any(BRepClass_FaceClassifier(face,p,1e-5,True).State() in (TopAbs_IN,TopAbs_ON) for face in planes[x]):
                        found=False;break
                if not found:break
            if found:return x
        return None
    mounts = {}
    for port in profile['ports']:
        if port['id'] not in ('inlet', 'outlet', 'left', 'right') or abs(port.get('axis',[0])[0]) < .9999:
            continue
        x,y,z=port['point']; sign=port['axis'][0]
        candidates=[]
        for c in cylinders:
            radius=math.hypot(c['y']-y,c['z']-z)
            outer=c['lo'] if sign<0 else c['hi']
            # KMS steel rings are recessed behind the outer elastomer faces.
            # Search the end quarter, but record measured cylinder ends, not L.
            search_depth=profile.get('mountingSearchDepth',4)
            if 8 <= c['diameter'] <= 50 and 30 <= radius <= 250 and 8 <= c['hi']-c['lo'] <= 70 and abs(outer-x)<=search_depth and solids and all(empty_point(t,c['y'],c['z']) for t in (c['lo']-.1,(c['lo']+c['hi'])/2,c['hi']+.1)):
                candidates.append(c)
        if len(candidates)<4 or len(candidates)>24:
            continue
        first=candidates[0]
        radius=math.hypot(first['y']-y,first['z']-z)
        if any(abs(c[k]-first[k])>.02 for c in candidates for k in ('lo','hi','diameter')) or any(abs(math.hypot(c['y']-y,c['z']-z)-radius)>.02 for c in candidates):
            continue
        angles=sorted(math.atan2(c['z']-z,c['y']-y) for c in candidates)
        if any(abs(((angles[(i+1)%len(angles)]-a)%(2*math.pi))-2*math.pi/len(angles))>.001 for i,a in enumerate(angles)):
            continue
        # Only the back carries a head/washer. A recessed or non-planar front
        # around the holes need not be a bearing face: the sealing port remains
        # the existing mating datum. Front cancels from the grip calculation.
        outer=first['lo'] if sign<0 else first['hi']
        back=bearing_plane(candidates,first['hi'] if sign<0 else first['lo'],-sign)
        if back is None:continue
        mounts[port['id']]={'source':f"STEP {profile['source']}; SHA256 {digest}; cylindrical through walls and planar back bearing lands around every hole", 'face':[outer,y,z], 'axis':port['axis'],
                            'holes':[[outer,c['y'],c['z']] for c in candidates], 'holeDiameter':first['diameter'], 'thickness':abs(back-outer), 'holeKind':'through'}
    return pump_id, {'hash':digest,'ports':mounts}, None

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]); parser.add_argument('--pump-id'); parser.add_argument('--kms',action='store_true'); parser.add_argument('--registered-only',action='store_true'); parser.add_argument('--workers',type=int,default=2)
    args=parser.parse_args(); front=args.root/'frontend'
    profiles=json.loads((front/'public/model-assets/manifest.json').read_text(encoding='utf8'))['profiles']
    tasks=[(str(args.root),key,p) for key,p in profiles.items() if ('/CDM/' in p['source'] and (not args.pump_id or key==args.pump_id))]
    if args.kms:
        rows=json.loads((front/'data/vibration-dimensions.json').read_text(encoding='utf8'))['rows']
        seen=set();tasks=[]
        for row in rows:
            for execution in row['executions']:
                model=execution.get('cad')
                if execution['status']!='confirmed' or not model or model['sourceHash'] in seen:continue
                seen.add(model['sourceHash'])
                profile={**model,'mountingSearchDepth':model['lengthMm']/4,'ports':[{'id':name,'axis':[sign,0,0],'point':[model['planesMm'][i],0,0]} for i,(name,sign) in enumerate([('left',-1),('right',1)])]}
                tasks.append((str(args.root),f"KMS-DN{row['dn']}",profile))
    output=front/'data/flange-cad-mounts.json'
    data=json.loads(output.read_text(encoding='utf8'))
    if args.registered_only:tasks=[t for t in tasks if t[2]['sourceHash'] in data['models']]
    report=[]
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures={pool.submit(inspect,t):t for t in tasks}
        for f in as_completed(futures):
            task=futures[f]
            try:
                pump, result, error=f.result()
                if result and result['ports']: data['models'][result['hash']]=result['ports']
                else: data['models'].pop(task[2]['sourceHash'],None)
                checked=list(result['ports']) if result else []
                missing=[p['id'] for p in task[2]['ports'] if p['id'] not in checked]
                report.append({'pumpId':pump,'hash':task[2]['sourceHash'],'ports':checked,'issue':error or (f"Unconfirmed mounting ports: {', '.join(missing)}" if missing else None)})
                print(pump, len(result['ports']) if result else 0, error or '',flush=True)
            except Exception as e:
                data['models'].pop(task[2]['sourceHash'],None)
                report.append({'pumpId':task[1],'hash':task[2]['sourceHash'],'ports':[],'issue':f'{type(e).__name__}: {e}'})
                print(task[1],type(e).__name__,str(e),flush=True)
    temporary=output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    temporary.replace(output)
    report_path=front/'work/flange-mount-audit.json';report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(sorted(report,key=lambda r:r['pumpId']),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f"Checked {len(tasks)} profiles; supported {sum(bool(r['ports']) for r in report)}; report: {report_path}")

if __name__=='__main__': main()
