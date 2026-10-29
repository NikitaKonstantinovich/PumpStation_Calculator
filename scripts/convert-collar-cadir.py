"""Export coaxial collar B-Rep from cadmpeg CADIR to STEP using OCCT.

The cadmpeg 0.6.6 STEP writer selects complementary torus patches for these
parts. Rebuild the *exact meridian* from native face boundary vertices and
analytic plane/cylinder/torus carriers instead. No dimensions come from meshes.
Only full surfaces of revolution about X are supported; fail closed otherwise.
Native display points independently validate trim selection, never supply sizes.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

EPS = 1e-6
# SolidWorks cached display strips include interpolated chord points. This is
# a trim-selection cross-check, not the tolerance of measured CAD dimensions.
DISPLAY_CHECK_MM = 0.3

def xy(point):
    return (round(point['x'], 8), round(math.hypot(point['y'], point['z']), 8))

def close(a, b): return math.dist(a, b) < EPS

def segments_from_body(model, body):
    maps = {key: {v['id']: v for v in model[key]} for key in
            ('regions', 'shells', 'faces', 'surfaces', 'loops', 'coedges', 'edges', 'vertices', 'points')}
    face_ids = []
    for rid in body['regions']:
        for sid in maps['regions'][rid]['shells']:
            for member in maps['shells'][sid]['members']:
                if member['kind'] != 'face': raise ValueError('Non-face shell member')
                face_ids.append(member['id'])
    segments = []
    for fid in face_ids:
        face = maps['faces'][fid]; surface = maps['surfaces'][face['surface']]['geometry']
        kind = surface['kind']; axis = surface.get('axis', surface.get('normal'))
        if kind not in ('plane', 'cylinder', 'torus') or not axis or abs(abs(axis['x'])-1) > EPS:
            raise ValueError('Only coaxial X-axis analytic collars are supported')
        if kind != 'plane':
            origin = surface.get('center', surface.get('origin'))
            if not origin or math.hypot(origin['y'], origin['z']) > EPS: raise ValueError('Off-axis carrier')
        points = []
        for lid in face['loops']['loops']:
            loop = maps['loops'][lid]['boundary']
            if loop['kind'] != 'ring': raise ValueError('Unsupported loop')
            for cid in loop['coedges']:
                edge = maps['edges'][maps['coedges'][cid]['edge']]
                for vid in (edge['start'], edge['end']):
                    point = xy(maps['points'][maps['vertices'][vid]['point']]['position'])
                    if not any(close(point, p) for p in points): points.append(point)
        if len(points) != 2: raise ValueError(f'Non-meridional boundary: {fid}: {points}')
        points.sort(); a,b=points
        seg={'kind': 'arc' if kind=='torus' else 'line', 'a':a,'b':b}
        if kind=='plane' and abs(a[0]-b[0])>EPS: raise ValueError('Non-normal plane')
        if kind=='cylinder' and (abs(a[1]-b[1])>EPS or abs(a[1]-surface['radius'])>EPS): raise ValueError('Cylinder mismatch')
        if kind=='torus':
            center=(surface['center']['x'],surface['major_radius']); radius=surface['minor_radius']
            if any(abs(math.dist(p,center)-radius)>EPS for p in points): raise ValueError('Torus boundary mismatch')
            t0=math.atan2(a[1]-center[1],a[0]-center[0]); t1=math.atan2(b[1]-center[1],b[0]-center[0])
            delta=(t1-t0+math.pi)%(2*math.pi)-math.pi
            # These collars have quarter-circle fillets. Reject other trim types.
            if abs(abs(delta)-math.pi/2)>EPS: raise ValueError('Unsupported torus trim')
            mid=(center[0]+radius*math.cos(t0+delta/2),center[1]+radius*math.sin(t0+delta/2))
            seg.update(center=center,radius=radius,mid=mid,t0=t0,delta=delta)
        if not any(s['kind']==seg['kind'] and close(s['a'],a) and close(s['b'],b)
                   and (kind!='torus' or close(s['mid'],seg['mid'])) for s in segments): segments.append(seg)
    if not segments: raise ValueError('No profile')
    # One connected simple cycle: no guessed missing edges or closure segments.
    remaining=list(segments); ordered=[remaining.pop(0)]
    while remaining:
        end=ordered[-1]['b']; candidates=[(i,s) for i,s in enumerate(remaining) if close(s['a'],end) or close(s['b'],end)]
        if len(candidates)!=1: raise ValueError('Ambiguous/open profile')
        i,s=candidates[0]; s=dict(s)
        if close(s['b'],end): s['a'],s['b']=s['b'],s['a']
        ordered.append(s); remaining.pop(i)
    if not close(ordered[-1]['b'],ordered[0]['a']): raise ValueError('Open profile')
    return ordered

def distance(p,s):
    a,b=s['a'],s['b']
    if s['kind']=='line':
        dx,dy=b[0]-a[0],b[1]-a[1]; t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)))
        return math.dist(p,(a[0]+t*dx,a[1]+t*dy))
    c=s['center']; theta=math.atan2(p[1]-c[1],p[0]-c[0]); diff=(theta-s['t0']+math.pi)%(2*math.pi)-math.pi
    if min(0,s['delta'])-EPS<=diff<=max(0,s['delta'])+EPS: return abs(math.dist(p,c)-s['radius'])
    return min(math.dist(p,a),math.dist(p,b))

def profile_key(profile):
    return sorted((s['kind'], tuple(sorted((tuple(round(v,6) for v in s['a']),tuple(round(v,6) for v in s['b'])))),
                   tuple(round(v,6) for v in s.get('mid',()))) for s in profile)

def export(cadir, output, verified_report=None):
    from OCP.gp import gp_Pnt, gp_Ax1, gp_Dir
    from OCP.GC import GC_MakeArcOfCircle
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeRevol
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.BRep import BRep_Builder
    from OCP.TopoDS import TopoDS_Compound
    from OCP.STEPControl import STEPControl_Writer, STEPControl_Reader, STEPControl_AsIs
    data=json.loads(cadir.read_text(encoding='utf-8')); model=data['model']
    if data['units']['length']!='millimeter': raise ValueError('Expected mm')
    profiles=[segments_from_body(model,b) for b in model['bodies']]
    checks=[]; shapes=[]
    for body,profile in zip(model['bodies'],profiles):
        native_points=[]
        for tess in model['tessellations']:
            # Unowned display channels are checked against every source body below.
            if tess.get('body') not in (None,body['id']): continue
            for strip in tess['mesh'].get('strips',[]):
                native_points.extend(xy(p['position']) for p in strip)
        deviations=[min(distance(p,s) for pr in profiles for s in pr) for p in native_points]
        corroboration=None
        if not deviations and verified_report:
            previous=json.loads(verified_report.read_text(encoding='utf-8'))
            if any(b['nativePointCount']>0 and profile_key(b['profile'])==profile_key(profile) for b in previous['bodies']):
                corroboration={'reportSha256':hashlib.sha256(verified_report.read_bytes()).hexdigest(),'cadirSha256':previous['cadirSha256']}
        if (not deviations and not corroboration) or max(deviations,default=0)>DISPLAY_CHECK_MM: raise ValueError(f'Native trim validation failed: {max(deviations,default=-1)}')
        wire=BRepBuilderAPI_MakeWire()
        def point(p): return gp_Pnt(p[0],p[1],0)
        for s in profile:
            if s['kind']=='line': edge=BRepBuilderAPI_MakeEdge(point(s['a']),point(s['b'])).Edge()
            else: edge=BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(point(s['a']),point(s['mid']),point(s['b'])).Value()).Edge()
            wire.Add(edge)
        if not wire.IsDone(): raise ValueError('OCCT wire failed')
        face=BRepBuilderAPI_MakeFace(wire.Wire()).Face()
        shape=BRepPrimAPI_MakeRevol(face,gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,0,0)),2*math.pi,True).Shape()
        if not BRepCheck_Analyzer(shape).IsValid(): raise ValueError('Invalid revolved B-Rep')
        props=GProp_GProps(); BRepGProp.VolumeProperties_s(shape,props)
        if props.Mass()<0: shape.Reverse(); BRepGProp.VolumeProperties_s(shape,props)
        if props.Mass()<=0: raise ValueError('Nonpositive volume')
        shapes.append(shape); checks.append({'body':body['id'],'volumeMm3':props.Mass(),'profile':profile,'nativePointCount':len(native_points),'nativeMaxDeviationMm':max(deviations,default=None),'corroboration':corroboration})
    compound=TopoDS_Compound(); builder=BRep_Builder(); builder.MakeCompound(compound)
    for shape in shapes: builder.Add(compound,shape)
    writer=STEPControl_Writer(); writer.Transfer(compound,STEPControl_AsIs)
    if int(writer.Write(str(output)))!=1: raise ValueError('STEP write failed')
    reader=STEPControl_Reader(); assert int(reader.ReadFile(str(output)))==1
    reader.SetSystemLengthUnit(1.0); assert reader.TransferRoots()
    if not BRepCheck_Analyzer(reader.OneShape()).IsValid(): raise ValueError('STEP roundtrip invalid')
    return {'cadirSha256':hashlib.sha256(cadir.read_bytes()).hexdigest(),'stepSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'method':'native analytic meridian B-Rep; OCCT revolution; native display trim verification; STEP roundtrip', 'bodies':checks}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('cadir',type=Path); parser.add_argument('output',type=Path); parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--verified-profile-report',type=Path)
    args=parser.parse_args(); result=export(args.cadir,args.output,args.verified_profile_report); args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'step':str(args.output),'bodies':len(result['bodies'])}))
