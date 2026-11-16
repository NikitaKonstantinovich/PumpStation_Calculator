"""Extract the original KIP part meshes; never alter or scale source geometry."""
import argparse
import json
import math
import struct
from pathlib import Path
from model_assets import file_hash, run_cad_command
from native_display_models import display_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
SOURCES = {
    'valve': 'Equipment/Valves/3D/Шаровые/Кран шаровой латунный с дренажем и воздухоотводчиком трехходовой LD Pride 44_15_В-В_С_Б Ду 15 Ру40.SLDPRT',
    'gauge': 'Equipment/Instrumentation/3D/Манометры/Манометр ТМ-510Р.SLDPRT',
    'adapter': 'Equipment/Fittings/3D/Переходники/Переходник ВР1_2-НР1_4.SLDPRT',
    'bush': 'Equipment/Fittings/3D/Переходники/Футорка 1_2-1_4 нар_вн лат..SLDPRT',
    'relay': 'Equipment/Instrumentation/3D/Датчики давления/Реле давления РД-2Р, мод. 35, резьба G14.SLDPRT',
    'transducer': 'Equipment/Instrumentation/3D/Датчики давления/ПД РРТ10 G1_4 Mini.SLDPRT',
    'connector': 'Equipment/Instrumentation/3D/Датчики давления/Разъем DIN43650 для apz2412.SLDPRT',
}

def display_colors(mesh, role):
    """STL Magics facet colors expose the existing dial/needle and handle.

    No faces or markings are generated. Regions are measured in native CAD
    coordinates; neutral stainless/brass colors are display conventions.
    """
    if role not in ['gauge', 'valve']:
        return
    data = bytearray(mesh.read_bytes())
    data[:80] = (b'KIP native CAD mm; COLOR=' + bytes([190, 196, 201, 255])).ljust(80, b'\0')
    for i in range(struct.unpack_from('<I', data, 80)[0]):
        offset = 84 + i * 50
        vertices = [struct.unpack_from('<3f', data, offset + 12 + j * 12) for j in range(3)]
        x, y, z = [sum(p[k] for p in vertices) / 3 for k in range(3)]
        rgb = (174, 182, 187)
        if role == 'gauge':
            rgb = (184, 190, 196)
            if z < -50:
                rgb = (178, 148, 66)
            elif 40.98 <= x < 41.04 and math.hypot(y, z) < 47:
                rgb = (244, 245, 240)
            elif 41.04 <= x < 43 and math.hypot(y, z) < 47:
                rgb = (32, 35, 40)
        elif y > 21 and abs(z) < 3:
            rgb = (192, 40, 38)
        packed = sum(round(c * 31 / 255) << (5 * j) for j, c in enumerate(rgb))
        struct.pack_into('<H', data, offset + 48, packed)
    mesh.write_bytes(data)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cadmpeg', type=Path, required=True)
    args = parser.parse_args()
    audit = ROOT / 'work/instrument-mounts-2026-11-01'
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
                raise ValueError(f'Cannot decode {source}')
        mesh = output / f'model-{digest}-v1.stl'
        data = json.loads(cadir.read_text(encoding='utf8'))
        bounds = display_stl(data, mesh)
        display_colors(mesh, role)
        if file_hash(ROOT / source) != digest:
            raise ValueError('CAD source changed during extraction')
        assets[role] = dict(name=Path(source).stem, source=source, sourceHash=digest,
                            meshHash=file_hash(mesh), meshUrl=f'/model-assets/{mesh.name}', bounds=bounds)
        print(role, bounds, flush=True)
    (audit / 'assets.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    # Native coordinates, mm. Nominal thread engagements are layout settings,
    # not manufacturing tolerances. See docs/collector-instrument-mounting.md.
    mounts = {
        'valve': ([0, 0, 14.5], [0, 90, 0]),
        'gauge': ([0, -17, 122], [0, 0, 90]),
        'adapter': ([35.5, 0, 30], [0, 0, 180]),
        'bush': ([42.5, 0, 30], [0, 0, 180]),
        'relay': ([94, 20, 12], [0, 0, -90]),
        'transducer': ([34.5, 0, 30], [0, 0, -90]),
        'connector': ([82, 0, 30], [0, 0, -90]),
    }
    def port(id, point, axis, dn, gender):
        return dict(id=id, point=point, axis=axis, dn=dn, thread='G1/2' if dn == 15 else 'G1/4',
                    gender=gender, connection='threaded', plane='thread-reference', provisional=True)
    ports = {
        'valve': [port('inlet', [24.5, 0, 0], [1, 0, 0], 15, 'female'),
                  port('gauge', [-29.5, 0, 0], [-1, 0, 0], 15, 'female'),
                  port('sensor', [-15.5, 0, 22.5], [0, 0, 1], 8, 'female')],
        'gauge': [port('inlet', [17, 0, -88], [0, 0, -1], 15, 'male')],
        'adapter': [port('inlet', [21, 0, 0], [1, 0, 0], 8, 'male'), port('outlet', [0, 0, 0], [-1, 0, 0], 15, 'female')],
        'bush': [port('inlet', [18, 0, 0], [1, 0, 0], 15, 'male'), port('outlet', [0, 0, 0], [-1, 0, 0], 8, 'female')],
        'relay': [port('inlet', [20, -59.5, 18], [0, -1, 0], 8, 'male')],
        'transducer': [port('inlet', [0, 0, 0], [0, -1, 0], 8, 'male')],
        'connector': [],
    }
    data = dict(version=1, revision='collector-kip-mounts-v1', assets={
        role: dict(**asset, position=mounts[role][0], rotation=mounts[role][1], ports=ports[role])
        for role, asset in assets.items()
    })
    (FRONTEND / 'data/instrument-mounts.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    # Keep the normal source/mesh validation and subsequent library rebuilds.
    for path in [ROOT / 'Equipment/native-display-library.json', output / 'library.json']:
        registry = json.loads(path.read_text(encoding='utf8'))
        for role, asset in assets.items():
            entry = dict(**asset, id=asset['sourceHash'], sources=[asset['source']], categories=['КИПиА'],
                         units='mm', status='ready', bytes=(output / Path(asset['meshUrl']).name).stat().st_size,
                         ports=ports[role], mapping='native_display_mesh', warnings=['Сохранённая сетка SolidWorks, мм; компоновочная посадка КИП'],
                         conversion=dict(method='cadmpeg CADIR shaded_strips to binary STL'))
            registry['models'] = [m for m in registry['models'] if m['id'] != entry['id']] + [entry]
        if 'summary' in registry:
            registry['summary']['uniqueModels'] = len(registry['models'])
            registry['summary']['ready'] = sum(m['status'] == 'ready' for m in registry['models'])
        path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

if __name__ == '__main__':
    main()
