"""Build mounting records from reviewed evidence and the actual meshes used in 3D."""
import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from functools import cache
from hashlib import file_digest
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[2]
DATA = APP / 'data'
OUTPUT = ROOT / 'outputs/horizontal-frame-mounts-2026-11-14'
MESHES = ROOT / 'Equipment/Pumps/PreparedForAssembly/meshes'
STEP = ROOT / 'Equipment/Pumps/PreparedForAssembly/step'
EXACT_WELLMIX = 'mounting_base_only_exact_step_execution_and_factory_geometry_match'
TOLERANCE = .15


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


@cache
def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def relative(path):
    return path.resolve().relative_to(ROOT).as_posix()


def clean(x):
    return round(x, 5) or 0


def within(a, b, tolerance=TOLERANCE):
    return abs(a - b) <= tolerance


def normalize_wellmix(task):
    from OCP.BRepBndLib import BRepBndLib
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.Bnd import Bnd_Box
    from OCP.STEPControl import STEPControl_AsIs, STEPControl_Reader, STEPControl_Writer
    from OCP.StlAPI import StlAPI_Writer
    from OCP.gp import gp_Trsf, gp_Vec

    row, ref = task
    evidence = row['evidence']
    source = ROOT / evidence['path']
    if digest(source) != evidence['sha256']:
        raise ValueError(f'Изменился исходник {row["designation"]}')
    box = evidence['nativeStepBoundsMm']
    inlet = evidence['inletAxisNativeMm']
    origin = [box[0], inlet['y'], inlet['z']]
    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(source))) != 1 or not reader.TransferRoots():
        raise ValueError(f'Ошибка чтения {source}')
    transform = gp_Trsf()
    transform.SetTranslation(gp_Vec(*(-n for n in origin)))
    shape = BRepBuilderAPI_Transform(reader.OneShape(), transform, True).Shape()
    bounds = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, bounds, False, False)
    low, high = bounds.CornerMin(), bounds.CornerMax()
    bbox = [low.X(), low.Y(), low.Z(), high.X(), high.Y(), high.Z()]
    if any(not within(v, box[i] - origin[i % 3]) for i, v in enumerate(bbox)):
        raise ValueError(f'Изменились габариты {source}')
    stem = f'frame-{row["series"]}-{row["article"]}-{evidence["sha256"][:12]}'
    staged = OUTPUT / (stem + '.step')
    cache_file = OUTPUT / (stem + '.json')
    if cache_file.exists():
        saved = load(cache_file)
        p = saved['profile']
        if digest(ROOT / p['source']) == p['sourceHash'] and digest(MESHES / Path(p['meshUrl']).name) == p['meshHash']:
            return saved
    writer = STEPControl_Writer()
    if int(writer.Transfer(shape, STEPControl_AsIs)) != 1 or int(writer.Write(str(staged))) != 1:
        raise ValueError(f'Не записан STEP {source}')
    source_hash = digest(staged)
    native = STEP / f'{stem}-{source_hash[:12]}.step'
    if not native.exists():
        staged.replace(native)
    filename = f'model-{source_hash}-v1.stl'
    mesh = MESHES / filename
    if not mesh.exists():
        tessellation = BRepMesh_IncrementalMesh(shape, .12, False, .25, False)
        stl = StlAPI_Writer()
        stl.ASCIIMode = False
        if not tessellation.IsDone() or not stl.Write(shape, str(mesh)):
            raise ValueError(f'Не записан STL {source}')
    ports = [{'id':'inlet', 'point':[0,0,0], 'axis':[-1,0,0], 'provisional':True}]
    if ref and ref.get('outletMm'):
        ports.append({'id':'outlet','point':ref['outletMm'],'axis':[0,0,1],'provisional':True})
    profile = {'pumpId':row['variantId'],'key':'pump:'+row['variantId'],'source':relative(native),
               'sourceHash':source_hash,'units':'mm','meshUrl':'/model-assets/'+filename,
               'meshHash':digest(mesh),'bounds':bbox,'ports':ports,'mapping':'catalogue_prepared_step',
               'warnings':['Монтажные поверхности проверены. Координаты выводов по размерному листу.']}
    openings = [{'center':[clean(op['centerMm'][i] - origin[i]) for i in (0,1)],
                 'support':clean(op['padZMm'] - origin[2]),
                 'opening':min(op['axialOpeningMm'], op['transverseOpeningMm'])}
                for op in evidence['analyticStepOpenings']]
    result = {'profile':profile,'openings':openings,'sourceHash':evidence['sha256']}
    cache_file.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result


def round_openings(points, floor):
    return [{'center':p['center'][:2], 'support':p['center'][2] if floor is None else floor,
             'opening':p['diameterMm']} for p in points]


def existing_openings(row, measurements):
    e, series = row['evidence'], row['series']
    scope = e['scope']
    if series == 'CHLF' and scope in ('base_only_grid_and_bore_crosschecked_with_catalogue',
                                      'mounting_base_only_catalogue_grid_bore_and_axis_height_match'):
        metric = next((m for m in measurements[e['sha256']] if m['id'] == e['bindingId']), None)
        if metric:
            return round_openings(metric['holes'] + metric.get('raisedBoreCandidates', []), metric['floor'])
    if (series == 'ECH' and scope == 'mounting_base_only_matching_step_product_grid_axis_and_opening_width'
            and not e['stepBaseMm'].get('lowestGeometryBelowPad')):
        return [{'center':p['centerMm'], 'support':p['padZMm'],
                 'opening':min(p['axialOpeningMm'], p['transverseOpeningMm'])} for p in e['stepOpenings']]
    if series == 'MH' and scope == 'mounting_base_only_380v_step_and_exact_article_grid_and_axis_height_match':
        return [{'center':p['centerMm'], 'support':p['padZMm'],
                 'opening':min(p['axialOpeningMm'], p['transverseOpeningMm'])} for p in e['stepMountingOpenings']]
    if series == 'NIS' and scope in ('exact_article_factory_pedestal_mounting_only',
            'shared_nis_nisf_step_mounting_base_only_exact_article_footprint_and_axis_match',
            'exact_article_drawing_matched_shared_NIS_NISF_step_base_only',
            'mounting_base_only_matching_article_footprint_axis_bolt_holes_and_seating_faces',
            'matching_mounting_base_only', 'exact_factory_pedestal_dimensions'):
        points = e.get('holes') or e.get('stepBoresWithBearingAnnuli') or []
        if not points or any(not (p.get('lowerBearingAnnulus3Mm') and p.get('upperBearingAnnulus3Mm')) for p in points):
            return []
        if any(e.get(k) for k in ('mountingDifferencesMm','mountingDifferences','conflicts','generalCatalogueConflict')):
            return []
        return round_openings(points, e.get('supportPlaneZMm'))
    return []


def mount_record(row, profile, openings):
    e, facts = row['evidence'], row.get('fasteners', {})
    if len(openings) != 4 or any(o['opening'] <= 0 for o in openings):
        return None
    bounds = profile['bounds']
    support = openings[0]['support']
    if not within(support, bounds[2]) or any(not within(o['support'], support) for o in openings):
        return None
    # CAD is X forward from suction, Y along the pump row and Z up.
    # Put the drive / water connection on the same center as in the pump model.
    row_y = sum(o['center'][1] for o in openings) / len(openings)
    flow_center = (bounds[0] + bounds[3]) / 2
    holes = sorted([(clean(o['center'][1] - row_y), clean(o['center'][0] - flow_center), clean(o['opening']),
                     [clean(value) for value in (*o['center'], o['support'])]) for o in openings])
    if len({(x,y) for x,y,_,_ in holes}) != 4:
        return None
    size = min(h[2] for h in holes)
    bolt = facts.get('boltDiameterMm')
    if bolt and bolt >= size - .05:
        bolt = None
    path = relative(ROOT / e['path'])
    drawing = e.get('drawing') or e.get('catalogue')
    note = f'{row["designation"]}. Опорная плоскость и центры креплений по проверенному STEP. {path}'
    if drawing and drawing.get('path'):
        note += f'. Сверка с заводским листом {Path(drawing["path"]).name}'
    if e.get('equipmentEnvelopeDifferencesMm') or e.get('drawingDifferences'):
        note += '. Габарит использует форму модели STEP, в заводском листе есть отличающиеся размеры'
    return {k:row[k] for k in ('variantId','modelId','manufacturer','series','designation','article','motor')} | {
        'evidence':{'kind':'horizontal_step_mount','path':path,'sha256':e['sha256'],'scope':e['scope']},
        'mounting':{'verified':True,'source':note,
            'bounds':dict(minX=clean(bounds[1]-row_y),maxX=clean(bounds[4]-row_y),
                          minY=clean(bounds[0]-flow_center),maxY=clean(bounds[3]-flow_center)),
            'holes':[{'x':x,'y':y,'diameterMm':d} for x,y,d,_ in holes],
            'cad':{'sourceHash':profile['sourceHash'],'anchorMm':[clean(flow_center), clean(row_y), clean(support)],
                   'boundsMm':[clean(n) for n in bounds], 'pointsMm':[point for _,_,_,point in holes]},
            'footThicknessMm':None,'clampHeightMm':facts.get('clampHeightMm'),'boltDiameterMm':bolt}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    rows = load(DATA/'pump-fasteners-reviewed.json')['rows']
    prepared = load(DATA/'prepared-pump-cad-models.json')['models']
    identities = {r['variantId']: r for r in load(ROOT/'outputs/all-pump-step-readiness-2026-11-12/runtime-variants.json')['records']}
    drawings = load(DATA/'cmi-spatial-profiles.json')['variants'] | load(DATA/'horizontal-pump-cuc-drawings.json')['variants']
    new = [r for r in rows if r['series'] in ('CMI','CUC') and r.get('evidence', {}).get('scope') == EXACT_WELLMIX]
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        normalized = dict(zip((r['variantId'] for r in new),
                               pool.map(normalize_wellmix, [(r, drawings.get(r['variantId'])) for r in new])))
    measurements = defaultdict(list)
    for p in [ROOT/'outputs/mounting-grids-2026-11-10/pump-cad-measurements.jsonl',
              ROOT/'outputs/pump-fasteners-2026-11-10/cad-measurements.jsonl']:
        with p.open(encoding='utf-8') as stream:
            for raw in stream:
                metric = json.loads(raw)
                if not metric.get('error') and metric.get('verticalAxis') == 2:
                    measurements[metric['sha256']].append(metric)
    mounts = []
    profiles = {}
    for row in rows:
        vid = row['variantId']
        entry = prepared.get(vid)
        e = row.get('evidence') or {}
        if vid in normalized:
            p = normalized[vid]
            profile, openings = p['profile'], p['openings']
        elif entry and entry['profile']['sourceHash'] == e.get('sha256'):
            profile, openings = entry['profile'], existing_openings(row, measurements)
        else:
            continue
        if not openings:
            continue
        if digest(ROOT / e['path']) != e['sha256']:
            raise ValueError(f'Изменился проверенный STEP {row["designation"]}')
        record = mount_record(row, profile, openings)
        if not record:
            continue
        mounts.append(record)
        if vid in normalized:
            ident = identities[vid]
            profiles[vid] = dict(manufacturer=row['manufacturer'],series=row['series'],model=ident['model'],
                article=ident['article'],execution=ident['execution'],powerKw=ident['powerKw'],
                frequencyHz=ident['frequencyHz'],scope='variant_step',profile=profile)
    print('Mounts by series:', {s:sum(r['series']==s for r in mounts) for s in sorted({r['series'] for r in mounts})})
    print('Prepared Wellmix meshes:', len(profiles))
    payload = {'version':'horizontal-frame-mounts-2026-11-14-v1','rows':mounts,'models':profiles}
    target = DATA/'horizontal-frame-mounts.json' if args.write else OUTPUT/'horizontal-frame-mounts.json'
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__ == '__main__':
    main()
