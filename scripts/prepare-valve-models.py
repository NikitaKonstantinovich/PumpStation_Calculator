"""Audit mounting planes of the exact DENDOR series in the supplied library.
Uses the existing STL cache; never stretches equipment or converts the whole library.
"""
import hashlib
import json
import re
from pathlib import Path
from model_assets import convert_step, valid_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent


def model_frame(series, coordinates):
    if series == '010C':
        # The cast flow arrow in these STEP files points along native -Z.
        # Reverse about canonical Z, preserving the top of the valve and both
        # mating planes. Native z=0 becomes inlet x=0; z=-L becomes outlet x=L.
        return {'position': [coordinates[1], 0, 0], 'rotation': [180, -90, 0],
                'nativeFlowAxis': [0, 0, -1], 'flowDirection': 'left-to-right'}
    return {'position': [-coordinates[0], 0, 0], 'rotation': [0, 0, 0]}


def mounting_planes(path, axis, coordinates, dn):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(path))) != 1:
        raise ValueError('Cannot read STEP')
    reader.SetSystemLengthUnit(1.0)
    reader.TransferRoots()
    found = [0.0, 0.0]
    planes = {}
    explorer = TopExp_Explorer(reader.OneShape(), TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face(explorer.Current())
        surface = BRepAdaptor_Surface(face)
        if surface.GetType() == GeomAbs_Plane:
            plane = surface.Plane()
            direction = plane.Axis().Direction().Coord()
            if abs(abs(direction[axis]) - 1) < 1e-6:
                coordinate = plane.Location().Coord()[axis]
                props = GProp_GProps()
                BRepGProp.SurfaceProperties_s(face, props)
                key = round(coordinate, 4)
                planes[key] = planes.get(key, 0) + props.Mass()
                for i, value in enumerate(coordinates):
                    if abs(coordinate - value) < .01:
                        props = GProp_GProps()
                        BRepGProp.SurfaceProperties_s(face, props)
                        found[i] += props.Mass()
        explorer.Next()
    if axis == 0:
        # The rubber liner can project beyond the nominal metal-body length.
        # Use the measured outer mating faces, retain the catalogue discrepancy.
        half = (coordinates[1]-coordinates[0])/2
        pairs = [(x, min(area, planes.get(-x, 0))) for x, area in planes.items()
                 if half*.8 <= x <= half*1.2 and min(area, planes.get(-x, 0)) > dn*dn*.1]
        if pairs:
            x, area = max(pairs, key=lambda pair: pair[1])
            return [-x, x], [area, area]
    if min(found) < dn * dn * .1:
        raise ValueError(f'Expected mating planes {coordinates} not confirmed: areas {found}')
    return coordinates, found


def main():
    library = json.loads((FRONTEND/'public/model-assets/library.json').read_text(encoding='utf-8'))
    reference = json.loads((FRONTEND/'app/suction-fasteners.json').read_text(encoding='utf-8'))
    rows, errors = [], []
    for model in library['models']:
        if '/Valves/' not in model['source']:
            continue
        butterfly = re.fullmatch(r'Затвор 017WDN(\d+) (с рукояткой|редуктор)', model['name'])
        check = re.fullmatch(r'010[СC] DN(\d+)', model['name'])
        if not butterfly and not check:
            continue
        dn = int((butterfly or check)[1])
        series = '017W' if butterfly else '010C'
        key = 'wafer017WLength' if butterfly else 'wafer010CLength'
        length = next((r[key] for r in reference if r['dn'] == dn and r.get(key)), None)
        if not length:
            continue
        axis = 0 if butterfly else 2
        coordinates = [-length/2, length/2] if butterfly else [-length, 0]
        try:
            path = ROOT/model['source']
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != model['sourceHash']:
                raise ValueError('Library source hash is stale')
            coordinates, areas = mounting_planes(path, axis, coordinates, dn)
            measured = coordinates[1]-coordinates[0]
            target = FRONTEND/'public/model-assets'/f'model-{digest}-v1.stl'
            if not valid_stl(target):
                convert_step(path, target)
            # All models retain their native coordinates; the renderer transforms the local frame.
            rows.append({'series': series, 'dn': dn, 'drive': ('handle' if butterfly[2] == 'с рукояткой' else 'gear') if butterfly else 'none',
                         'source': model['source'], 'sourceHash': digest, 'bounds': model['bounds'], 'length': measured, 'catalogLength': length,
                         **model_frame(series, coordinates), 'matingAreas': areas if butterfly else areas[::-1]})
        except Exception as error:
            errors.append({'source': model['source'], 'error': str(error)})
    output = {'version': 1, 'source': 'STEP пользователя; плоскости проверены по строительным длинам выбранной серии из suction-fasteners.json. Стрелка потока 010C: native -Z, после преобразования +X. Материал и PN проверяются отдельно.', 'rows': rows, 'errors': errors}
    (FRONTEND/'data/line-valve-models.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    catalog = json.loads((FRONTEND/'public/binding-components.json').read_text(encoding='utf-8'))
    links = []
    for item in catalog['items']:
        family = item['family']
        series = '017W' if re.search(r'\b017W\b(?!\.)', family) else '010C' if re.search(r'010[СC]', family) else None
        if not series or item['catalogId'] not in ('затворы', 'обратные-клапаны'):
            continue
        dn_field = next((f['value'] for f in item['fields'] if f['headerPath'][-1] == 'DN'), '')
        match = re.search(r'\d+', str(dn_field))
        if not match:
            continue
        dn = int(match[0]); drive = ('handle' if dn <= 150 else 'gear') if series == '017W' else 'none'
        model = next((r for r in rows if r['dn'] == dn and r['series'] == series and r['drive'] == drive), None)
        if not model:
            continue
        axis = 0 if series == '017W' else 2
        points = [[0, 0, 0], [0, 0, 0]]
        if series == '010C':
            points[0][axis] = model['position'][0]; points[1][axis] = points[0][axis] - model['length']
        else:
            points[0][axis] = -model['position'][0]; points[1][axis] = points[0][axis] + model['length']
        direction = -1 if series == '010C' else 1
        links.append({'key': 'equipment:'+item['id'], 'source': model['source'], 'sourceHash': model['sourceHash'], 'units': 'mm',
                      'mapping': 'series_geometry_review', 'ports': [{'id': 'inlet' if i == 0 else 'outlet', 'point': points[i], 'axis': [direction * (-1 if i == 0 else 1) if j == axis else 0 for j in range(3)], 'provisional': True} for i in range(2)],
                      'warnings': ['Геометрия серии по STEP; конкретное исполнение PN/материала требует проверки. Привод выбран по существующему правилу спецификации: рукоятка до DN150 включительно, редуктор от DN200.']})
    (FRONTEND/'data/line-valve-registry.json').write_text(json.dumps({'version':1,'models':links},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'models': len(rows), 'errors': errors}, ensure_ascii=False))


if __name__ == '__main__':
    main()
