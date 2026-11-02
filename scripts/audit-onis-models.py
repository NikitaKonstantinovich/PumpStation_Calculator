"""Audit each archived ONIS source, STEP mounting faces, STL and casing flow marks.

The reviewed ports use exactly the library's frame and sealing faces. The loose
pump flange's back bearing plane and hole clock are measured separately.
"""
import hashlib
import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import json
import math
import runpy
from pathlib import Path

from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID, TopAbs_VERTEX, TopAbs_WIRE
from OCP.TopoDS import TopoDS
from onis_model_geometry import annular_faces

HERE = Path(__file__).resolve().parent
FRONT = HERE.parent
ROOT = FRONT.parent
arrows = runpy.run_path(str(HERE / 'audit-cdm-flow.py'))
unique_shapes = arrows['unique_shapes']
inspect_mounts = runpy.run_path(str(HERE / 'inspect-flange-mounts.py'))['inspect']

def casing_arrows(shape, profile):
    span = profile['ports'][1]['point'][0]
    # Both seven-vertex shafts must be on the same lower body, on opposite
    # lateral feet. A mark on a motor, or a pair on separate bodies, is insufficient.
    pairs = []
    for solid in unique_shapes(shape,TopAbs_SOLID):
        marks = []
        for raw in unique_shapes(solid,TopAbs_FACE):
            face = TopoDS.Face(raw)
            surf = BRepAdaptor_Surface(face)
            if surf.GetType() not in (GeomAbs_Plane,GeomAbs_Cylinder) or len(unique_shapes(face,TopAbs_WIRE))!=1:
                continue
            corners=unique_shapes(face,TopAbs_VERTEX)
            if len(corners)!=7: continue
            vertices = [BRep_Tool.Pnt_s(TopoDS.Vertex(v)).Coord() for v in corners]
            x,y,z = zip(*vertices)
            if min(x)<0 or max(x)>span or max(z)>abs(profile['bounds'][2]) or min(map(abs,y))<20 or min(y)*max(y)<=0: continue
            if max(z)-min(z)<.01 and max(z)<0:
                sign=arrows['arrow_direction'](vertices)
            elif max(y)-min(y)<25:
                sign=arrows['arrow_direction']([(px,pz,py) for px,py,pz in vertices])
            else: continue
            if not sign: continue
            marks.append(dict(sign=sign,outline=sorted([round(v,4) for v in p] for p in vertices)))
        if marks:
            if len(marks)!=2 or marks[0]['sign']!=marks[1]['sign']: return
            mirror = sorted([x,-y,z] for x,y,z in marks[0]['outline'])
            if any(math.dist(a,b)>.01 for a,b in zip(mirror,marks[1]['outline'])): return
            pairs.append(marks)
    return pairs[0] if len(pairs)==1 else []

def audit(profile):
    path = ROOT / profile.get('archivedSource',profile['source'])
    key=profile.get('originalHash',profile['sourceHash'])
    if hashlib.sha256(path.read_bytes()).hexdigest()!=key: raise ValueError(f'Archive checksum: {path}')
    if profile['format']=='.dwg':return dict(status='drawing_only')
    path=ROOT/profile['source']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=profile['sourceHash']:raise ValueError(f'STEP checksum: {path}')
    mesh=(FRONT/'public'/profile['meshUrl'].lstrip('/')).read_bytes()
    if hashlib.sha256(mesh).hexdigest()!=profile['meshHash'] or len(mesh)!=84+50*int.from_bytes(mesh[80:84],'little'):raise ValueError('STL checksum/length')
    del mesh
    reader=STEPControl_Reader()
    if int(reader.ReadFile(str(path)))!=1:raise ValueError('STEP read failed')
    reader.SetSystemLengthUnit(1)
    if not reader.TransferRoots(): raise ValueError('Empty STEP')
    shape=reader.OneShape()
    faces=annular_faces(shape)
    for p,original in zip(profile['ports'],profile['frame']['sourceFaces'],strict=True):
        if not any(math.dist(p['point'],f['center'])<.01 and math.dist(p['axis'],f['normal'])<.001 and
                   all(any(abs(rad-c)<.01 for c in f['radii']) for rad in original['radii']) for f in faces):raise ValueError('Port does not coincide with its source annular face')
    ports={p['id']:p for p in profile['ports']}
    if profile['series']=='MH':
        if math.dist(ports['inlet']['axis'],[-1,0,0])>.001 or math.dist(ports['outlet']['axis'],[0,0,1])>.001: raise ValueError('MH axial inlet / radial outlet mismatch')
        return dict(status='axial_inlet_radial_outlet')
    if math.dist(ports['port-a']['axis'],[-1,0,0])>.001 or math.dist(ports['port-b']['axis'],[1,0,0])>.001:raise ValueError('Non-collinear MV ports')
    marks=casing_arrows(shape,profile)
    if not marks:return dict(status='flow_unconfirmed')
    inlet='port-a' if marks[0]['sign']>0 else 'port-b'
    reviewed_ports=[{**p,'id':'inlet' if p['id']==inlet else 'outlet'} for p in profile['ports']]
    _, measured,error=inspect_mounts((str(ROOT),profile.get('pumpId'),{**profile,'ports':reviewed_ports}))
    if error:raise ValueError(error)
    return dict(status='casing_arrows',review=dict(pumpId=profile.get('pumpId'),source=profile['source'],inlet=inlet,originalPorts=ports,arrows=marks,mounts=measured['ports'] if measured else {}))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--workers',type=int,default=4)
    parser.add_argument('--publish-index',action='store_true',help='Build the runtime index from completed audit results; original model hashes must still match.')
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    files=json.loads((FRONT/'data/onis-model-import.json').read_bytes())['files']
    if args.publish_index:
        approved={}
        for p in files:
            result=json.loads((args.output/(p['sourceHash']+'.json')).read_bytes())
            if result['status']=='error': raise ValueError(f"{p['model']}: {result['error']}")
            if result['status'] not in ('casing_arrows','axial_inlet_radial_outlet'): continue
            if hashlib.sha256((ROOT/p['source']).read_bytes()).hexdigest()!=p['sourceHash']: raise ValueError(p['source'])
            review=result.get('review',dict(pumpId=p.get('pumpId'),source=p['source'],inlet='inlet',
                        originalPorts={port['id']:port for port in p['ports']},mounts={}))
            approved[p['sourceHash']]={**review,'bounds':p['bounds'],'method':result['status']}
        (FRONT/'data/onis-flow-reviews.json').write_text(json.dumps(approved,ensure_ascii=False,indent=1)+'\n',encoding='utf8')
        print('Verified profiles:',len(approved))
        raise SystemExit(0)
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        tasks={pool.submit(audit,p):p for p in files}
        for task in as_completed(tasks):
            p=tasks[task]
            try: result=task.result()
            except Exception as e: result=dict(status='error',error=str(e))
            (args.output/(p['sourceHash']+'.json')).write_text(json.dumps(result,ensure_ascii=False),encoding='utf8')
            print(p['model'],result['status'],result.get('error',''),flush=True)
