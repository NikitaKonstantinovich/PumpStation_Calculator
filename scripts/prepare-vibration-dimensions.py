"""Import DENDOR KMS face-to-face lengths, with exact PN and STEP evidence.

Run with the existing CAD Python runtime. Never stretch a mismatching STEP or
interpret the alternative lengths in the single L column as PN10/PN16 columns.
"""
import hashlib
import json
from pathlib import Path
import re
import sys

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
sys.path.insert(0, str(FRONTEND / 'scripts'))
DOC = 'data/sources/kms-dimensions-2026-10-28/dendor-kms-current.pdf'
DOC_HASH = 'f3af951101c7dca045f2c118cf08759ac89ac143eeafef5bb315da29476dde39'
URL = 'https://dendor.ru/re/kms.pdf'
# Visual transcription: table 2, printed page 5. The single L column applies
# to PN10 and PN16; slash-separated values are alternative executions.
LENGTHS = {32: [95], 40: [95], 50: [105], 65: [115], 80: [135], 100: [150],
           125: [165], 150: [180], 200: [205, 210], 250: [230, 240], 300: [245],
           350: [255, 265], 400: [255, 265], 450: [265], 500: [265], 600: [260, 265],
           700: [265], 800: [260, 265], 900: [265], 1000: [265], 1200: [265], 1400: [350], 1600: [350]}


def sealing_planes(path, coordinates, dn):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    reader = STEPControl_Reader()
    assert int(reader.ReadFile(str(path))) == 1
    reader.SetSystemLengthUnit(1.0)
    reader.TransferRoots()
    found = [0.0, 0.0]
    explorer = TopExp_Explorer(reader.OneShape(), TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face(explorer.Current())
        surface = BRepAdaptor_Surface(face)
        if surface.GetType() == GeomAbs_Plane:
            plane = surface.Plane()
            if abs(abs(plane.Axis().Direction().X()) - 1) < 1e-6:
                for i, coordinate in enumerate(coordinates):
                    if abs(plane.Location().X() - coordinate) < .01:
                        props = GProp_GProps()
                        BRepGProp.SurfaceProperties_s(face, props)
                        found[i] += props.Mass()
        explorer.Next()
    # Largest metal annuli can be recessed behind the elastomer. Only the
    # actual exterior sealing faces establish the documented full length L.
    assert min(found) > dn * dn * .1, f'Exterior sealing faces not confirmed: {found}'
    return coordinates, found


def main():
    assert hashlib.sha256((FRONTEND / DOC).read_bytes()).hexdigest() == DOC_HASH, 'Review the changed manufacturer document first'
    binding = json.loads((FRONTEND / 'public/binding-components.json').read_text(encoding='utf-8'))
    library = json.loads((FRONTEND / 'public/model-assets/library.json').read_text(encoding='utf-8'))
    candidates = {}
    for model in library['models']:
        match = re.fullmatch(r'3D - KMS DN(\d+) PN(10|16)(?:,\s*16)?', model.get('name', ''))
        if not match:
            continue
        dn = int(match[1])
        candidates.update({(dn, pn): model for pn in ([10, 16] if ',' in model['name'] else [int(match[2])])})
    audited = {}
    rows = []
    for item in binding['items']:
        if item['catalogId'] != 'компенсаторы' or item['family'] != 'Компенсатор резиновый фланцевый KMS · EPDM':
            continue
        dn = int(re.search(r'\d+', str(next(f['value'] for f in item['fields'] if f['headerPath'][-1] == 'DN')))[0])
        if dn not in LENGTHS:
            continue
        executions = []
        for pn in [10, 16, 25]:
            source = f'{URL}; таблица 2, стр. 5; DN{dn} PN{pn}; L между уплотнительными торцами'
            execution = {'pn': pn, 'source': source, 'status': 'missing', 'candidateLengthsMm': [], 'reason': 'В руководстве KMS приведены только PN10 и PN16; размеры PN25 не подтверждены.'}
            if pn == 25:
                executions.append(execution)
                continue
            lengths = LENGTHS[dn]
            execution.update(candidateLengthsMm=lengths, separateGasket=False,
                             sealingSource='https://dendor.ru/re/recommend_KMS.pdf; эластомер заменяет уплотнительное кольцо, отдельная прокладка не предусмотрена')
            model = candidates.get((dn, pn))
            cad = None
            if model:
                key = model['sourceHash']
                if key not in audited:
                    path = ROOT / model['source']
                    assert hashlib.sha256(path.read_bytes()).hexdigest() == key, 'Stale STEP hash'
                    extent = round(model['bounds'][3] - model['bounds'][0], 4)
                    planes, areas = sealing_planes(path, [-extent / 2, extent / 2], dn)
                    audited[key] = {'source': model['source'], 'sourceHash': key, 'bounds': model['bounds'],
                                    'planesMm': planes, 'matingAreasMm2': areas, 'lengthMm': round(planes[1] - planes[0], 4)}
                cad = audited[key]
                execution['cadReview'] = cad
            matching = cad and any(abs(cad['lengthMm'] - length) < .01 for length in lengths)
            if len(lengths) == 1 or matching:
                length = cad['lengthMm'] if matching else lengths[0]
                execution.update(status='confirmed', lengthMm=length, reason='Единственная длина в руководстве.' if len(lengths) == 1 else 'Выбрано документированное исполнение, совпадающее с измеренными монтажными плоскостями локального STEP.')
                if matching:
                    assert (FRONTEND / f'public/model-assets/model-{cad["sourceHash"]}-v1.stl').is_file(), 'Prepare the reviewed STL first'
                    execution['cad'] = cad
                elif cad:
                    execution['reason'] += f' STEP имеет L={cad["lengthMm"]} мм и не применяется; масштабирование запрещено.'
            else:
                execution.update(status='ambiguous', reason=f'В одной графе L указаны варианты {"/".join(map(str, lengths))} мм; это не разделение по PN. Локальный STEP не подтверждает ни один вариант. Требуется точное исполнение.')
            executions.append(execution)
        rows.append({'componentId': item['id'], 'family': item['family'], 'tableId': item['tableId'], 'dn': dn, 'executions': executions})
    output = {'version': 1, 'id': 'dendor-kms-mounting-2026-10-28', 'sourceSha256': binding['source']['sha256'],
              'verifiedAt': '2026-10-28', 'document': {'url': URL, 'path': DOC, 'sha256': DOC_HASH, 'page': 5, 'table': 2,
              'lengthReference': 'distance-between-elastomer-mating-faces', 'pressures': [10, 16]}, 'rows': rows}
    (FRONTEND / 'data/vibration-dimensions.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'rows': len(rows), 'confirmed': sum(e['status'] == 'confirmed' for r in rows for e in r['executions']),
                      'cad': sum('cad' in e for r in rows for e in r['executions'])}))


if __name__ == '__main__':
    main()
