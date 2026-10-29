"""Reimport every corrected STEP and verify topology, bounds and casing arrows."""
import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("cdm_audit", Path(__file__).with_name("audit-cdm-flow.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def verify(root_string, item):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID, TopAbs_VERTEX, TopAbs_WIRE
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.BRep import BRep_Tool
    from OCP.TopoDS import TopoDS
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    result = {"pumpId": item["pumpId"], "source": item["source"], "sourceHash": item["sourceHash"], "status": "error"}
    try:
        path = Path(root_string) / item["source"]
        if audit.digest(path) != item["sourceHash"]:
            raise ValueError("Corrected source checksum mismatch")
        reader = STEPControl_Reader()
        if int(reader.ReadFile(str(path))) != 1 or not reader.TransferRoots():
            raise ValueError("Corrected STEP cannot be reimported")
        shape = reader.OneShape()
        faces = audit.unique_shapes(shape, TopAbs_FACE)
        if len(faces) != item["expectedFaceCount"] or len(audit.unique_shapes(shape, TopAbs_SOLID)) != item["expectedSolidCount"]:
            raise ValueError("Topology changed")
        box = Bnd_Box(); BRepBndLib.AddOptimal_s(shape, box, False, False)
        bounds = audit.xyz(box.CornerMin()) + audit.xyz(box.CornerMax())
        error = max(abs(a-b) for a,b in zip(bounds, item["bounds"]))
        if error > .025:
            raise ValueError(f"Bounds changed: {error}")
        markers = []
        for i, original in enumerate(faces):
            face = TopoDS.Face(original); surface = BRepAdaptor_Surface(face, True)
            if surface.GetType() == GeomAbs_Cylinder:
                if abs(surface.Cylinder().Axis().Direction().Z()) < .999: continue
            elif surface.GetType() == GeomAbs_Plane:
                if abs(surface.Plane().Axis().Direction().Y()) < .999: continue
            else: continue
            vertices = [audit.xyz(BRep_Tool.Pnt_s(TopoDS.Vertex(v))) for v in audit.unique_shapes(face, TopAbs_VERTEX)]
            if len(vertices) != 7 or len(audit.unique_shapes(face, TopAbs_WIRE)) != 1: continue
            if not (min(v[2] for v in vertices) > -20 and max(v[2] for v in vertices) < 150): continue
            direction = audit.arrow_direction([[p[0],p[2],p[1]] for p in vertices])
            if direction is not None: markers.append({"faceIndex": i+1, "directionNormalizedX": direction})
        if len(markers) < 2 or any(m["directionNormalizedX"] != 1 for m in markers):
            raise ValueError(f"Corrected casing arrows not confirmed: {markers}")
        result.update(status="verified", boundsErrorMm=error, faceCount=len(faces), markers=markers)
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corrections',type=Path,required=True)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--workers',type=int,default=4)
    args=parser.parse_args()
    items=json.loads(args.corrections.read_text(encoding='utf8'))
    results=[]
    with ProcessPoolExecutor(max_workers=args.workers,max_tasks_per_child=1) as pool:
        for future in as_completed([pool.submit(verify,str(args.root),item) for item in items]):
            result=future.result();results.append(result)
            print(f"{len(results)}/{len(items)} {result['pumpId']}: {result['status']}",flush=True)
    results.sort(key=lambda r:r['pumpId'])
    target=args.corrections.with_name('verification.json')
    target.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    if any(r['status']!='verified' for r in results): raise SystemExit('Verification failed; drafts must not be activated')
    print(f'All {len(results)} corrected STEP copies verified',flush=True)


if __name__=='__main__': main()
