"""Audit the project's round paronite STEP gaskets and prepare only exact catalogue matches.
No source CAD, prices or catalogue dimensions are changed. Requires cadquery-ocp.
"""
import hashlib
import json
import re
from pathlib import Path
from model_assets import convert_step, valid_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent


def measure(path):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(path))) != 1:
        raise ValueError("STEP read failed")
    reader.SetSystemLengthUnit(1.0)
    reader.TransferRoots()
    shape = reader.OneShape()
    if not BRepCheck_Analyzer(shape).IsValid():
        raise ValueError("Invalid solid")
    ex = TopExp_Explorer(shape, TopAbs_SOLID)
    solids = 0
    while ex.More():
        solids += 1
        ex.Next()
    if solids != 1:
        raise ValueError("Expected one solid")
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    cylinders, planes = [], []
    while ex.More():
        surface = BRepAdaptor_Surface(TopoDS.Face(ex.Current()))
        if surface.GetType() == GeomAbs_Cylinder:
            c = surface.Cylinder()
            if abs(abs(c.Axis().Direction().Z()) - 1) > 1e-7:
                raise ValueError("Unsupported cylinder axis")
            cylinders.append((c.Radius() * 2, c.Location().X(), c.Location().Y()))
        elif surface.GetType() == GeomAbs_Plane:
            p = surface.Plane()
            if abs(abs(p.Axis().Direction().Z()) - 1) > 1e-7:
                raise ValueError("Unsupported end plane")
            planes.append(p.Location().Z())
        else:
            raise ValueError("Not a plain round ring")
        ex.Next()
    if len(cylinders) != 2 or len(planes) != 2:
        raise ValueError("Expected two cylinders and two end planes")
    if any(abs(cylinders[0][i] - cylinders[1][i]) > 1e-6 for i in (1, 2)):
        raise ValueError("Not concentric")
    box = Bnd_Box(); BRepBndLib.AddOptimal_s(shape, box, False, False)
    b = [box.CornerMin().X(), box.CornerMin().Y(), box.CornerMin().Z(), box.CornerMax().X(), box.CornerMax().Y(), box.CornerMax().Z()]
    return {"outer": max(c[0] for c in cylinders), "inner": min(c[0] for c in cylinders), "thickness": max(planes)-min(planes), "bounds": b,
            "rotation": [0, 90, 0], "position": [-min(planes), -cylinders[0][1+1], cylinders[0][1]]}


def main():
    catalog = json.loads((FRONTEND/'public/binding-components.json').read_text(encoding='utf-8'))
    rows, audit = [], []
    for path in sorted((ROOT/'Equipment/Seals/3D').rglob('*.stp')):
        match = re.search(r'Прокладка А-(\d+)-(\d+)-ПОН', path.stem)
        if not match:
            continue
        dn, pn = map(int, match.groups())
        try:
            geometry = measure(path)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            for item in catalog['items']:
                if item['catalogId'] != 'прокладки':
                    continue
                fields = {f['headerPath'][-1]: f['value'] for f in item['fields'] if f['headerPath']}
                if fields.get('DN') != dn or fields.get('Исполнение') != 'А':
                    continue
                pressures = [int(v) for v in str(fields.get('Совместимые PN', fields.get('PN'))).split('/')]
                if pn not in pressures or abs(float(fields.get('Толщина, мм', 0))-geometry['thickness']) > 1e-5:
                    continue
                target = FRONTEND/'public/model-assets'/f'model-{digest}-v1.stl'
                if not valid_stl(target):
                    convert_step(path, target)
                rows.append({"componentId": item['id'], "name": fields.get('Наименование'), "dn": dn, "modelPn": pn, "execution": "А", "source": path.relative_to(ROOT).as_posix(), "sourceHash": digest, "geometry": geometry})
            audit.append({"source": path.relative_to(ROOT).as_posix(), "measured": geometry})
        except Exception as error:
            audit.append({"source": path.relative_to(ROOT).as_posix(), "error": str(error)})
    result = {"version": 1, "source": "B-Rep исходных STEP пользователя; миллиметры; один solid, два соосных цилиндра и две торцевые плоскости. Применять только к указанному DN/исполнению/PN модели и толщине каталога.", "rows": rows, "audit": audit}
    (FRONTEND/'data/line-gasket-models.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({"bindings": len(rows), "audited": len(audit), "errors": [a for a in audit if 'error' in a]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
