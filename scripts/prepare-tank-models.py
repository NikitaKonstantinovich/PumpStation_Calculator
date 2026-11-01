"""Prepare native membrane-tank CAD for the station layout, without scaling."""
import argparse
import json
from pathlib import Path
from model_assets import file_hash, run_cad_command
from native_display_models import display_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
SOURCES = {
    'tank8': 'Equipment/Valves/3D/Клапан шаровой Ду20 с возд. + бак Wester WAV 8.SLDASM',
    'tank50': 'Equipment/Tanks/3D/Баки/Wester/Мембранный бак WAV-50.SLDPRT',
    'tank100': 'Equipment/Tanks/3D/Баки/Wester/Мембранный бак WAV-100.SLDPRT',
    'tank80': 'Equipment/Tanks/3D/Баки/Wester/Мембранный бак WAV-80.SLDPRT',
    'valve20': 'Equipment/Valves/3D/Шаровые/Ld_pride_44_20_40Pn Б с воздухоотводчиком.SLDPRT',
    'valve25': 'Equipment/Valves/3D/Шаровые/Кран шаровой Ld_pride_47_25_40Pn Р Красный.SLDPRT',
    'cap20': 'Equipment/Fittings/3D/Заглушки/Заглушка ВР 6ти гранная нержавеющая AISI304 DN20 3_4 PN16.SLDPRT',
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cadmpeg', type=Path, required=True)
    args = parser.parse_args()
    audit = ROOT / 'work/tank-mounting-2026-11-01'
    audit.mkdir(parents=True, exist_ok=True)
    output = FRONTEND / 'public/model-assets'
    assets = {}
    for role, source in SOURCES.items():
        digest = file_hash(ROOT / source)
        cadir = audit / f'{role}-{digest}.json'
        if not cadir.exists():
            with (audit / f'{role}.log').open('w', encoding='utf8') as log:
                code = run_cad_command([str(args.cadmpeg.resolve()), 'dump', str(ROOT / source), '-o', str(cadir), '--force'], log, 60)
            if code:
                print(role, 'decode failed', flush=True)
                continue
        data = json.loads(cadir.read_text(encoding='utf8'))
        mesh = output / f'model-{digest}-v1.stl'
        try:
            bounds = display_stl(data, mesh)
        except ValueError as error:
            print(role, str(error), flush=True)
            continue
        assets[role] = dict(name=Path(source).stem, source=source, sourceHash=digest,
                            meshHash=file_hash(mesh), meshUrl=f'/model-assets/{mesh.name}', bounds=bounds)
        print(role, bounds, len(data['model']['tessellations']), flush=True)
    (audit / 'assets.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    def port(id, point, axis, dn, gender):
        return dict(id=id, point=point, axis=axis, dn=dn, thread='G3/4' if dn == 20 else 'G1',
                    gender=gender, connection='threaded', plane='thread-reference', provisional=True)
    info = {
        'tank50': dict(rotation=[0,0,0], ports=[port('inlet',[0,0,-301.5606689453125],[0,0,-1],25,'male')]),
        'tank80': dict(rotation=[90,0,0], ports=[port('inlet',[0,78,0],[0,-1,0],25,'male')]),
        'tank100': dict(rotation=[90,0,0], ports=[port('inlet',[0,78,0],[0,-1,0],25,'male')]),
        'valve20': dict(rotation=[90,0,0], position=[0,0,16], ports=[port('inlet',[0,-26,0],[0,-1,0],20,'female'),port('outlet',[0,29.5,0],[0,1,0],20,'female')]),
        'valve25': dict(rotation=[0,90,0], position=[0,0,22], ports=[port('inlet',[32,0,0],[1,0,0],25,'female'),port('outlet',[-32,0,0],[-1,0,0],25,'female')]),
        'cap20': dict(rotation=[90,0,0], position=[0,0,-10], ports=[port('inlet',[0,0,0],[0,-1,0],20,'female')]),
    }
    for role, value in info.items():
        assets[role].update(value)
    passport = ROOT / 'work/spec-stage3-2026-10-29/wester-wav.pdf'
    data = dict(version=1, revision='tank-native-cad-v1', assets=assets,
                tank8=dict(diameterMm=200,heightMm=311,thread='G3/4',source='Паспорт Wester WAV/WAO, таблица размеров, стр. 3; локальная копия work/spec-stage3-2026-10-29/wester-wav.pdf',
                           sourceSha256=file_hash(passport),note='Габаритная модель; исходная сборка WAV 8 не содержит доступной сетки бака. Профиль днищ и локальные детали условные.'))
    (FRONTEND / 'data/tank-models.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    for path in [ROOT / 'Equipment/native-display-library.json', output / 'library.json']:
        registry = json.loads(path.read_text(encoding='utf8'))
        for role, asset in assets.items():
            entry = {k:asset[k] for k in ['name','source','sourceHash','meshHash','meshUrl','bounds']}
            entry.update(id=asset['sourceHash'],sources=[asset['source']],categories=['Баки и подключения'],units='mm',status='ready',
                         bytes=(output / Path(asset['meshUrl']).name).stat().st_size,ports=[],mapping='native_display_mesh',
                         warnings=['Исходная сетка SolidWorks, без масштабирования; монтажные базы предварительные'],
                         conversion=dict(method='cadmpeg CADIR shaded_strips to binary STL'))
            registry['models'] = [m for m in registry['models'] if m['id'] != entry['id']] + [entry]
        if 'summary' in registry:
            registry['summary']['uniqueModels'] = len(registry['models'])
            registry['summary']['ready'] = sum(m['status'] == 'ready' for m in registry['models'])
        path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

if __name__ == '__main__':
    main()
