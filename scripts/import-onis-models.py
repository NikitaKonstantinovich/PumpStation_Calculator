"""Import explicit ONIS MV/MH folders, retaining originals and preparing rigid STEP/STL copies.

Run with an OCP Python: --downloads C:/Users/.../Downloads --run --workers 4.
Only exact ONIS model identities (and MH 380 V) are linked to the catalogue.
Unsupported DWG and unmatched models are recorded, never guessed into the BOM.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

from model_assets import convert_step, file_hash, run_cad_command, valid_stl
from onis_model_geometry import annular_faces, display_frame
from rigid_step_instance import wrap_step

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
VERSION = 'onis-rigid-v1'


def read(path, fallback=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else fallback


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix+'.pending')
    options = {'separators': (',', ':')} if path.parent.name == 'model-assets' else {'indent': 2}
    temp.write_text(json.dumps(data, ensure_ascii=False, **options)+'\n', encoding='utf-8')
    os.replace(temp, path)


def identity(name):
    match = re.fullmatch(r'(MV|MH)\s*(\d+(?:-\d+)+)(?:\s*\((380)V\))?', name, re.I)
    return (match[1].upper()+match[2], match[3]) if match else None


def match_pump(name, pumps):
    key = identity(name)
    if not key:
        return None
    matches = [p for p in pumps if p.get('manufacturer') == 'ONIS'
               and p.get('series') in ('MH', 'MV') and identity(p['model'])
               and identity(p['model'])[0] == key[0]
               and (not key[1] or str(p.get('voltage')) == key[1])]
    if len(matches) > 1:
        raise ValueError('Ambiguous catalogue identity: '+name)
    return matches[0] if matches else None


def inventory(downloads, pumps):
    rows = []
    for folder in sorted(downloads.iterdir()):
        if not folder.is_dir() or not re.fullmatch(r'M[VH]\d+', folder.name):
            continue
        for path in sorted(folder.iterdir()):
            if not path.is_file() or path.suffix.lower() not in ('.stp', '.step', '.dwg'):
                continue
            key = identity(path.stem)
            if not key or not key[0].startswith(folder.name+'-'):
                raise ValueError('Unexpected model filename: '+str(path))
            pump = match_pump(path.stem, pumps)
            series = key[0][:2]
            kind = 'vertical_multistage' if series == 'MV' else 'horizontal_multistage'
            target = ROOT/'Equipment/Pumps/3D'/kind/'ONIS'/series/folder.name/path.name
            rows.append(dict(original=str(path), source=target.relative_to(ROOT).as_posix(),
                             sourceHash=file_hash(path), name='ONIS '+path.stem, model=key[0], series=series,
                             format=path.suffix.lower(), pumpId=pump['id'] if pump else None,
                             catalogDimensions=(pump or {}).get('dimensions', {})))
    return rows


def catalogue_warnings(result, dimensions):
    warnings = [w for w in result['warnings'] if not w.startswith('Расхождение габарита ')]
    for i, key in enumerate(('overall_length', 'overall_width', 'overall_height')):
        known = dimensions.get(key)
        actual = result['bounds'][i+3]-result['bounds'][i]
        if isinstance(known, (int, float)) and abs(actual-known) > max(1, known*.01):
            warnings.append(f'Расхождение габарита {key}: STEP {actual:.2f} мм, каталог {known:g} мм; модель не масштабировалась.')
    return warnings


def prepare(job):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    row = job['row']; source = ROOT/row['source']
    if file_hash(source) != row['sourceHash']:
        raise ValueError('Source changed after inventory')
    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(source))) != 1:
        raise ValueError('Cannot read STEP')
    reader.SetSystemLengthUnit(1.0)
    print('Reading STEP geometry', flush=True)
    if not reader.TransferRoots():
        raise ValueError('STEP has no geometry')
    shape = reader.OneShape(); box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, box, False, False)
    lo, hi = box.CornerMin(), box.CornerMax()
    bounds = [lo.X(), lo.Y(), lo.Z(), hi.X(), hi.Y(), hi.Z()]
    frame = display_frame(row['series'], bounds, annular_faces(shape))
    print('Measured connections; preparing rigid copy', flush=True)
    raw, preservation = wrap_step(source.read_bytes(), frame['rotation'], frame['translation'], row['model']+'__Z_UP')
    normalized = ROOT/'Equipment/Pumps/3D_ONIS_Normalized'/row['series']/(row['model']+'-'+row['sourceHash'][:12]+'.step')
    normalized.parent.mkdir(parents=True, exist_ok=True)
    if normalized.exists() and normalized.read_bytes() != raw:
        raise ValueError('Existing normalized source differs; review before replacing')
    if not normalized.exists():
        normalized.write_bytes(raw)
    digest = file_hash(normalized)
    target = FRONTEND/'public/model-assets'/f'model-{digest}-v1.stl'
    with tempfile.TemporaryDirectory(prefix='mesh-', dir=job['state']) as directory:
        temporary = Path(directory)/'mesh.stl'
        result = convert_step(normalized, temporary)
        print('Browser mesh complete; checking transform', flush=True)
        # Reimported STEP must match the exact rigid transform, without scaling.
        import itertools
        from onis_model_geometry import transform_point
        corners = [transform_point(frame['rotation'], frame['origin'], p) for p in itertools.product(*[(bounds[i], bounds[i+3]) for i in range(3)])]
        expected = [min(p[i] for p in corners) for i in range(3)]+[max(p[i] for p in corners) for i in range(3)]
        if any(abs(a-b) > .05 for a, b in zip(expected, result['bounds'])):
            raise ValueError('STEP rigid transform verification failed')
        os.replace(temporary, target)
    warnings = [frame['warning'], 'Связь с каталогом проверена по обозначению модели; комплектация двигателя требует сверки.']
    for i, key in enumerate(('overall_length', 'overall_width', 'overall_height')):
        known = row['catalogDimensions'].get(key)
        actual = result['bounds'][i+3]-result['bounds'][i]
        if isinstance(known, (int, float)) and abs(actual-known) > max(1, known*.01):
            warnings.append(f'Расхождение габарита {key}: STEP {actual:.2f} мм, каталог {known:g} мм; модель не масштабировалась.')
    return dict(status='ready', algorithm=VERSION, originalHash=row['sourceHash'], source=normalized.relative_to(ROOT).as_posix(),
                sourceHash=digest, bounds=result['bounds'], nativeBounds=bounds, units='mm', ports=frame['ports'],
                warnings=warnings, frame=frame, preservation=preservation,
                meshUrl='/model-assets/'+target.name, meshHash=file_hash(target), bytes=target.stat().st_size)


def mesh_warnings(row, state, record, result):
    log = state/(row['sourceHash']+'.log')
    messages = log.read_text(encoding='utf-8', errors='replace') if log.exists() else ''
    skipped = re.findall(r'(\d+) faces have been skipped due to null triangulation', messages)
    if skipped:
        warning = 'При триангуляции STEP пропущены поверхности без сетки: '+', '.join(skipped)+'. Браузерная копия требует визуальной сверки с исходником.'
        if warning not in result['warnings']:
            result['warnings'].append(warning)
            atomic(record, result)
    return result


def run_one(row, state, timeout):
    record = state/(row['sourceHash']+'.json')
    previous = read(record, {})
    if previous.get('algorithm') == VERSION and previous.get('status') == 'ready':
        asset = FRONTEND/'public'/previous['meshUrl'].lstrip('/')
        source = ROOT/previous['source']
        if source.exists() and file_hash(source) == previous['sourceHash'] and valid_stl(asset) and file_hash(asset) == previous['meshHash']:
            return mesh_warnings(row, state, record, previous)
    job = state/(row['sourceHash']+'.job.json')
    atomic(job, dict(row=row, state=str(state), record=str(record)))
    with (state/(row['sourceHash']+'.log')).open('w', encoding='utf-8') as log:
        try:
            code = run_cad_command([sys.executable, str(Path(__file__).resolve()), '--job', str(job)], log, timeout)
            result = read(record, {})
            if code or result.get('status') != 'ready':
                return dict(status='error', error=result.get('error', 'CAD conversion failed'))
            log.flush()
            return mesh_warnings(row, state, record, result)
        except Exception as error:
            return dict(status='error', error=str(error))


def publish(rows, results):
    output = FRONTEND/'public/model-assets'
    manifest = read(output/'manifest.json', dict(version=1, profiles={}, equipment={}))
    library = read(output/'library.json', dict(version=1, models=[], inventoryErrors=[]))
    entries = {m['id']: m for m in library['models']}
    registry, report = [], []
    for row in rows:
        result = results.get(row['sourceHash'], dict(status='unsupported', error='DWG: нужен объёмный STEP/STP или отдельный DWG-конвертер.'))
        if result['status'] == 'ready':
            result = {**result, 'warnings': catalogue_warnings(result, row['catalogDimensions'])}
        report.append({**row, 'archivedSource': row['source'], **result})
        if result['status'] != 'ready':
            continue
        digest = result['sourceHash']
        entries[digest] = dict(id=digest, name=row['name'], source=result['source'], sources=[result['source'], row['source']],
                               sourceHash=digest, units='mm', status='ready', bounds=result['bounds'], meshUrl=result['meshUrl'],
                               meshHash=result['meshHash'], bytes=result['bytes'], categories=['Насосы'], ports=[],
                               mapping='library_unbound', warnings=result['warnings'])
        if row['pumpId']:
            profile = {k: result[k] for k in ('source', 'sourceHash', 'units', 'bounds', 'ports', 'warnings')}
            profile.update(key='pump:'+row['pumpId'], pumpId=row['pumpId'], mapping='catalog_model_match_execution_review')
            registry.append(profile)
            existing = manifest['profiles'].get(row['pumpId'])
            if existing and existing['source'] != profile['source'] and '/3D_ONIS_Normalized/' not in existing['source']:
                raise ValueError('Existing pump profile would be replaced: '+row['pumpId'])
            manifest['profiles'][row['pumpId']] = {**profile, 'meshUrl': result['meshUrl'], 'meshHash': result['meshHash']}
    library['models'] = list(entries.values())
    summary = library.setdefault('summary', {})
    summary.update(uniqueModels=len(entries), ready=sum(m['status']=='ready' for m in entries.values()),
                   errors=sum(m['status']=='error' for m in entries.values())+len(library.get('inventoryErrors', [])),
                   pending=sum(m['status']=='pending' for m in entries.values()))
    summary['sourceFiles'] = sum(len(m.get('sources', [m['source']])) for m in entries.values())
    summary['duplicates'] = summary['sourceFiles']-len(entries)
    atomic(FRONTEND/'data/onis-model-registry.json', dict(version=1, models=registry))
    atomic(output/'manifest.json', manifest)
    atomic(output/'library.json', library)
    atomic(FRONTEND/'data/onis-model-import.json', dict(version=1, importedOn='2026-10-31', files=report))
    print(json.dumps(dict(files=len(rows), ready=sum(r['status']=='ready' for r in results.values()),
                         linked=len(registry), errors=sum(r['status']=='error' for r in results.values()),
                         unsupported=sum(r['format']=='.dwg' for r in rows))), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--downloads', type=Path)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--timeout', type=int, default=480)
    parser.add_argument('--job', type=Path)
    args = parser.parse_args()
    if args.job:
        job = read(args.job)
        try:
            result = prepare(job)
        except Exception as error:
            atomic(Path(job['record']), dict(status='error', error=str(error)))
            raise
        atomic(Path(job['record']), result)
        return
    if not args.downloads or not 1 <= args.workers <= 6:
        parser.error('--downloads and 1..6 workers required')
    rows = inventory(args.downloads, read(FRONTEND/'public/pumps.json'))
    state = FRONTEND/'.model-library/onis-2026-10-31'; state.mkdir(parents=True, exist_ok=True)
    atomic(state/'inventory.json', rows)
    print(f'Inventory {len(rows)} files; {sum(r["pumpId"] is not None for r in rows)} catalogue matches', flush=True)
    if not args.run:
        return
    for row in rows:
        target = ROOT/row['source']; target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and file_hash(target) != row['sourceHash']:
            raise ValueError('Existing original differs: '+str(target))
        if not target.exists():
            shutil.copy2(row['original'], target)
        if file_hash(target) != row['sourceHash']:
            raise ValueError('Copy verification failed')
    steps = [r for r in rows if r['format'] != '.dwg']; results = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_one, r, state, args.timeout): r for r in steps}
        for future in as_completed(futures):
            row = futures[future]; results[row['sourceHash']] = future.result()
            print(f'{len(results)}/{len(steps)} {row["model"]}: {results[row["sourceHash"]]["status"]}', flush=True)
    publish(rows, results)


if __name__ == '__main__':
    main()
