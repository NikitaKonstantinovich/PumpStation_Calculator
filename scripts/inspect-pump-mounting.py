"""Read mounting bores from STEP without editing it. Outputs candidates, never approvals.

Each task declares the vertical axis. Accept internal cylindrical through-bores at
the lowest bearing plane only; merge split half-walls. Coordinates remain in CAD
space so a separate reviewed transform is required before publication.
"""
import argparse
import hashlib
import json
import math
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path


def inspect(task):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib

    def xyz(p): return [p.X(), p.Y(), p.Z()]
    path = Path(task['path'])
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise ValueError('Cannot read STEP')
    reader.TransferRoots()
    shape = reader.OneShape()
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, box, False, False)
    bounds = xyz(box.CornerMin()) + xyz(box.CornerMax())
    axis = task['verticalAxis']
    floor = bounds[axis + (3 if task.get('floorSide') == 'max' else 0)]
    walls = {}
    planes = []
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    while exp.More():
        face = (getattr(TopoDS, 'Face_s', None) or TopoDS.Face)(exp.Current())
        s = BRepAdaptor_Surface(face)
        if s.GetType() == GeomAbs_Plane:
            plane = s.Plane()
            if abs(xyz(plane.Axis().Direction())[axis]) > .999999:
                planes.append(xyz(plane.Location())[axis])
        elif s.GetType() == GeomAbs_Cylinder and face.Orientation() == TopAbs_REVERSED:
            c = s.Cylinder()
            if abs(xyz(c.Axis().Direction())[axis]) > .999999 and 2 <= c.Radius() <= 25:
                b = Bnd_Box()
                BRepBndLib.AddOptimal_s(face, b, False, False)
                bb = xyz(b.CornerMin()) + xyz(b.CornerMax())
                lo, hi = bb[axis], bb[axis + 3]
                center = xyz(c.Location())
                key = tuple(round(center[k], 4) for k in range(3) if k != axis) + (round(c.Radius()*2, 4), round(lo, 4), round(hi, 4))
                row = walls.setdefault(key, {'center': center, 'diameterMm': c.Radius()*2, 'lo': lo, 'hi': hi, 'angle': 0})
                row['angle'] += s.LastUParameter()-s.FirstUParameter()
        exp.Next()
    candidates = []
    raised = []
    for w in walls.values():
        if abs(w['angle']-2*math.pi) > .001 or w['hi']-w['lo'] < .5:
            continue
        offset = abs((w['hi'] if task.get('floorSide') == 'max' else w['lo'])-floor)
        if offset > 50:
            continue
        lower = [p for p in planes if abs(p-w['lo']) <= 2]
        upper = [p for p in planes if abs(p-w['hi']) <= 2]
        if not lower or not upper:
            continue
        lo, hi = min(lower), max(upper)
        if hi-lo > 100:
            continue
        center = [round(x, 4) for x in w['center']]
        center[axis] = round(floor, 4)
        row = {'center': center, 'diameterMm': round(w['diameterMm'], 4), 'footThicknessMm': round(hi-lo, 4), 'bearingOffsetMm': round(offset, 4)}
        (candidates if offset <= 2 else raised).append(row)
    unique = {tuple(c['center'])+(c['diameterMm'],): c for c in candidates}
    return {**task, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bounds': [round(v, 4) for v in bounds], 'floor': round(floor, 4), 'holes': list(unique.values()), 'raisedBoreCandidates': raised, 'status': 'measured_requires_binding_review'}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('tasks')
    p.add_argument('output')
    p.add_argument('--workers', type=int, default=2)
    args = p.parse_args()
    tasks = json.loads(Path(args.tasks).read_text(encoding='utf-8-sig'))
    out = Path(args.output)
    done = {r['id'] for r in map(json.loads, out.read_text(encoding='utf-8').splitlines()) if not r.get('error')} if out.exists() else set()
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        pending = {pool.submit(inspect, t): t for t in tasks if t['id'] not in done}
        for future in as_completed(pending):
            task = pending[future]
            try:
                result = future.result()
            except Exception as e:
                result = {**task, 'error': str(e)}
            with out.open('a', encoding='utf-8') as f:
                f.write(json.dumps(result, ensure_ascii=False)+'\n')
            print(result['id'], len(result.get('holes', [])), result.get('error', ''), flush=True)
