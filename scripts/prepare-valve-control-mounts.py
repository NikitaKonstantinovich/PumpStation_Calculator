"""Publish reviewed, unscaled Dendor bracket meshes and nominal mounting poses.

CAD measurements and source selection: docs/valve-control-mounting.md.
Run after prepare-limit-switch-models.py; only the two additional native assets
and their library entries are published. CAD sources are never modified.
"""
import argparse
import importlib.util
import json
from pathlib import Path
from model_assets import file_hash, run_cad_command
from native_display_models import display_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cadmpeg', type=Path, required=True)
    args = parser.parse_args()
    output = FRONTEND / 'public/model-assets'
    audit = ROOT / 'work/limit-switch-mounting-2026-10-29'
    audit.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location('equipment_batch', FRONTEND / 'scripts/prepare-equipment-library.py')
    batch = importlib.util.module_from_spec(spec); spec.loader.exec_module(batch)
    native_path = ROOT / 'Equipment/native-display-library.json'
    native = json.loads(native_path.read_text(encoding='utf8'))
    library_path = output / 'library.json'
    library = json.loads(library_path.read_text(encoding='utf8'))
    brackets = [next(m for m in native['models'] if 'Dn50-80.SLDPRT' in m['source'])]
    for stem, label in [('Кронштейн концевых выключателей 017W Dn125 мал', 'DN100–125'), ('Кронштейн концевых выключателей 017W Dn150', 'DN150')]:
        source = f'Equipment/FabricatedParts/3D/Кронштейны/{stem}.SLDPRT'
        digest = file_hash(ROOT / source)
        cadir = audit / f'{digest}.json'
        with (audit / f'{digest}.log').open('w', encoding='utf8') as log:
            code = run_cad_command([str(args.cadmpeg.resolve()), 'dump', str(ROOT / source), '-o', str(cadir), '--force'], log, 60)
        if code: raise ValueError(f'Cannot decode {source}')
        mesh = output / f'model-{digest}-v1.stl'
        bounds = display_stl(json.loads(cadir.read_text(encoding='utf8')), mesh)
        if file_hash(ROOT / source) != digest: raise ValueError('Source changed')
        model = dict(id=digest, sourceHash=digest, source=source, sources=[source], name=f'Кронштейн концевых выключателей Dendor 017W {label}',
                     categories=['Изготовляемые детали', 'Концевые выключатели'], units='mm', status='ready', bounds=bounds,
                     meshUrl=f'/model-assets/{mesh.name}', meshHash=file_hash(mesh), bytes=mesh.stat().st_size, ports=[], mapping='native_display_mesh',
                     warnings=['Сохранённая сетка исходной детали SolidWorks, мм; точность исходной визуализации'],
                     conversion=dict(method='cadmpeg CADIR shaded_strips to binary STL', cadirHash=file_hash(cadir)))
        native['models'] = [m for m in native['models'] if m['source'] != source] + [model]
        if not any(m['id'] == digest for m in library['models']): library['summary']['sourceFiles'] += 1
        library['models'] = [m for m in library['models'] if m['id'] != digest] + [model]
        brackets.append(model)
    library['summary']['uniqueModels'] = len(library['models'])
    library['summary']['ready'] = sum(m['status'] == 'ready' for m in library['models'])
    batch.atomic_json(native_path, native); batch.atomic_json(library_path, library)
    switch = next(m for m in library['models'] if m['source'].endswith('Концевой выключатель TZ-8111 PROxima EKF.step'))
    valves = json.loads((FRONTEND / 'data/line-valve-models.json').read_text(encoding='utf8'))['rows']
    def asset(m): return {k: m[k] for k in ['name', 'source', 'sourceHash', 'meshHash', 'meshUrl', 'bounds']}
    rows = []
    for dn, seat in [(50,161), (65,175), (80,181), (100,200), (125,213), (150,226)]:
        valve = next(v for v in valves if v['dn']==dn and v['drive']=='handle' and v['series']=='017W')
        bracket = brackets[0 if dn<=80 else 1 if dn<=125 else 2]
        # Native small bracket: sheet in XZ, +Y normal. Larger plates: XY,
        # their mounting-hole midpoint is offset (+sqrt(4.5), +sqrt(4.5)).
        if dn <= 80:
            position, rotation, thickness = [0,0,seat], [90,0,0], 2
            a, b = 82.544155877, -58.455844123
        else:
            shift = 2.12132034356
            position, rotation, thickness = [-shift,-shift,seat], [0,0,0], 3
            a, b = (62.997474683-shift, -60.580735804-shift) if dn<=125 else (79.5-shift, -58.5-shift)
        rows.append(dict(dn=dn, valveHash=valve['sourceHash'], valveSource=valve['source'], drive='handle', bracket=asset(bracket),
                         bracketPosition=position, bracketRotation=rotation, seatZ=seat, thickness=thickness,
                         boltCircle=50 if dn<=80 else 70, switchPositions=[[a,b,seat+thickness],[b,a,seat+thickness]],
                         switchRotations=[[180,0,180],[180,0,-90]]))
    batch.atomic_json(FRONTEND / 'data/valve-control-mounts.json', dict(version=1, revision='dendor-017w-controls-v1', switch=asset(switch), rows=rows))
    print('Published 6 mounting profiles and 2 native brackets')

if __name__ == '__main__': main()
