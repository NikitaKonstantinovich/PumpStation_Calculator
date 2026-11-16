"""Measure collar dimensions from STEP analytic surfaces in mm, never STL/DN."""
import argparse, hashlib, json, math
from pathlib import Path

def measure(path):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRep import BRep_Tool
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopAbs import TopAbs_FACE, TopAbs_VERTEX, TopAbs_SOLID
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Torus
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    def shapes(s, kind, cast):
        ex=TopExp_Explorer(s,kind)
        while ex.More(): yield cast(ex.Current()); ex.Next()
    r=STEPControl_Reader()
    if int(r.ReadFile(str(path)))!=1: raise ValueError('STEP read failed')
    r.SetSystemLengthUnit(1.0)
    if not r.TransferRoots(): raise ValueError('No STEP roots')
    s=r.OneShape()
    if not BRepCheck_Analyzer(s).IsValid(): raise ValueError('Invalid STEP')
    result=[]
    for solid in shapes(s,TopAbs_SOLID,TopoDS.Solid):
        planes=[]; cylinders=[]
        for face in shapes(solid,TopAbs_FACE,TopoDS.Face):
            a=BRepAdaptor_Surface(face)
            if a.GetType() not in (GeomAbs_Plane,GeomAbs_Cylinder,GeomAbs_Torus): raise ValueError('Non-analytic collar')
            if a.GetType()==GeomAbs_Plane:
                p=a.Plane()
                if abs(abs(p.Axis().Direction().X())-1)>1e-6: raise ValueError('Non-normal plane')
                planes.append(p.Location().X())
            elif a.GetType()==GeomAbs_Cylinder:
                c=a.Cylinder()
                if abs(abs(c.Axis().Direction().X())-1)>1e-6 or math.hypot(c.Location().Y(),c.Location().Z())>1e-6: raise ValueError('Off-axis cylinder')
                xs=[BRep_Tool.Pnt_s(v).X() for v in shapes(face,TopAbs_VERTEX,TopoDS.Vertex)]
                cylinders.append((round(2*c.Radius(),6),min(xs),max(xs)))
        diameters=sorted(set(c[0] for c in cylinders))
        if len(diameters)!=3 or len(set(round(p,6) for p in planes))!=3: raise ValueError('Unexpected collar profile')
        lip=[c for c in cylinders if c[0]==diameters[-1]]
        props=GProp_GProps(); BRepGProp.VolumeProperties_s(solid,props)
        if props.Mass()<=0: raise ValueError('Nonpositive solid volume')
        result.append({'lengthMm':round(max(planes)-min(planes),6),'outerDiameterMm':diameters[1],
            'innerDiameterMm':diameters[0],'wallThicknessMm':round((diameters[1]-diameters[0])/2,6),
            'lipOuterDiameterMm':diameters[2],'lipThicknessMm':round(max(c[2] for c in lip)-min(c[1] for c in lip),6),
            'volumeMm3':round(props.Mass(),6)})
    if not result: raise ValueError('No solids')
    return result

def verify_manifest(manifest, root):
    root=root.resolve(); data=json.loads(manifest.read_text(encoding='utf-8')); bodies=0
    for model in data['models']:
        for name,sha in [('modelPath','modelSha256'),('nativePath','nativeSha256')]:
            path=(root/model[name]).resolve()
            if not path.is_relative_to(root): raise ValueError('Model outside root')
            if hashlib.sha256(path.read_bytes()).hexdigest()!=model[sha]: raise ValueError(f'Model changed: {model[name]}')
        actual=measure(root/model['modelPath']); expected=model['dimensions']
        if len(actual)!=len(expected): raise ValueError('Solid count changed')
        for a,e in zip(actual,expected):
            for key in e:
                tolerance=1e-4 if key=='volumeMm3' else 1e-6
                if abs(a[key]-e[key])>tolerance: raise ValueError(f'Measurement changed: {model["modelPath"]}: {key}')
        bodies+=len(actual)
    return {'modelsVerified':len(data['models']),'solidsVerified':bodies}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('step',type=Path,nargs='?')
    parser.add_argument('--manifest',type=Path); parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    args=parser.parse_args()
    if bool(args.step)==bool(args.manifest): parser.error('Specify a STEP file or --manifest')
    print(json.dumps(verify_manifest(args.manifest,args.root) if args.manifest else measure(args.step),ensure_ascii=False,indent=2))
