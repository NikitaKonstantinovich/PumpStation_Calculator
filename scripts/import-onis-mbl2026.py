"""Import the user-supplied MBL workbook and its two reviewed drawing layouts.

Reading XLSX needs openpyxl (available in the bundled Python runtime).
No workbook is written. Catalog persistence uses the existing atomic importer.
"""
import copy
import datetime
import hashlib
import importlib.util
import json
import math
import re
import shutil
from pathlib import Path
from onis_spatial import enrich_onis_spatial

ROOT = Path(__file__).resolve().parents[1]
SOURCE_KEY = 'mbl2026-user-workbook-20261031'
SMALL = 'A B D E F H1 H2 S'.split()
LARGE = 'A B D E F H H1 H2 K M S W X Y'.split()
SOURCE_PATH = 'data/sources/onis-mbl2026/MBL.xlsx'
SOURCE_URL = 'repository:' + SOURCE_PATH


def parse_row(row):
    """Select a reviewed schema by structure, never slide individual blank cells."""
    values = list(row)
    while values and values[-1] is None:
        values.pop()
    if not values or values[0] is None:
        return None
    model, *cells = values
    if not isinstance(model, str) or not re.fullmatch(r'MBL \d+-[\dA-Z]+-\d+(?:\.\d+)?/2E', model):
        raise ValueError(f'Unexpected model: {model}')
    if len(cells) == 8:
        headers, layout = SMALL, 'small'
    elif len(cells) == 14:
        headers, layout = LARGE, 'large'
    else:
        raise ValueError(f'Incomplete/shifted row: {model}')
    d = {}
    for name, v in zip(headers, cells):
        if name == 'S':
            if v != '4*14':
                raise ValueError(f'Unexpected mounting-hole notation: {model}/{v}')
        elif not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or not 0 < v <= 1e6:
            raise ValueError(f'Invalid dimension: {model}/{name}')
        else:
            d[name] = v
    face_height = d['H2'] if layout == 'small' else d['H']
    if face_height <= d['H1'] or d['A'] >= d['D']:
        raise ValueError(f'Invalid nozzle location: {model}')
    return model, layout, headers, cells, d


def spatial_from_dimensions(d, layout, source):
    if layout not in ('small', 'large'):
        raise ValueError('Unknown drawing layout')
    face_height = d['H2'] if layout == 'small' else d['H']
    height = d['H2'] if layout == 'small' else max(d['H'], d['H2'])
    width = d['F'] if layout == 'small' else max(d['F'], d['K'], d['Y'])
    rule = ('Малая схема: H1 — высота оси входа; H2 — высота напорной плоскости; габарит D×F×H2.'
            if layout == 'small' else
            'Большая схема: H — высота напорной плоскости, H1 — высота оси входа, H2 — высота двигателя. '
            'Габарит D×max(F,K,Y)×max(H,H2). F/K — поперечные размеры насосной части, Y — двигателя. '
            'W — осевой установочный размер, не ширина насоса.')
    return {
        'version': 1, 'units': 'mm', 'coordinateSystem': 'inlet',
        'boundsMm': [0, -width/2, -d['H1'], d['D'], width/2, height-d['H1']],
        'ports': [
            {'id': 'inlet', 'point': [0, 0, 0], 'axis': [-1, 0, 0], 'source': source},
            {'id': 'outlet', 'point': [d['A'], 0, face_height-d['H1']], 'axis': [0, 0, 1], 'source': source},
        ],
        'source': source,
        'rule': rule + ' Начало — центр входной присоединительной плоскости; X к двигателю, Z вверх. '
        'Выход X=A, Z=высота напорной плоскости−H1; основание Z=−H1. '
        'Блок центрирован по общей продольной оси. Размеры упаковки не используются.',
        'issues': [],
    }


def prepare_document(pumps, document, sheets, sources):
    result = copy.deepcopy(document)
    result['sources'][SOURCE_KEY] = sources
    targets = {p['model']: p for p in pumps if p.get('manufacturer') == 'ONIS' and p.get('series') == 'MBL (2026)'}
    if len(targets) != 99:
        raise ValueError('Unexpected MBL (2026) catalog scope')
    found = set()
    for sheet, rows in sheets:
        for row_number, row in enumerate(rows, 1):
            parsed = parse_row(row)
            if parsed is None:
                continue
            model, layout, headers, cells, d = parsed
            if model not in targets or model in found:
                raise ValueError(f'Unknown/duplicate model: {model}')
            found.add(model)
            p = targets[model]
            old = result['pumps'].get(p['id'], {})
            source = SOURCE_URL + '#' + sheet + '!A' + str(row_number) + ':' + ('I' if layout == 'small' else 'O') + str(row_number)
            superseded = list(old.get('supersedesNotes', []))
            if old.get('source') != SOURCE_KEY and old.get('note') and old['note'] not in superseded:
                superseded.append(old['note'])
            f = {key: p.get(key) for key in ('manufacturer', 'model', 'series', 'article', 'execution')}
            f.update(source=SOURCE_KEY, workbookSheet=sheet, workbookRow=row_number,
                     drawingLayout=layout, sourceHeaders=headers, sourceRow=cells,
                     dimensions=d, spatial=spatial_from_dimensions(d, layout, source),
                     note='MBL (2026): размеры и координаты из предоставленных пользователем MBL.xlsx и двух схем. '
                     'Схема: ' + ('малая (H2 — напорный фланец).' if layout == 'small' else 'большая (H — напорный фланец, H2 — двигатель).') +
                     ' Масса в файле отсутствует и не изменяется; упаковка не используется.')
            if superseded:
                f['supersedesNotes'] = superseded
            result['pumps'][p['id']] = f
    if found != set(targets):
        raise ValueError('Missing workbook models: ' + ', '.join(sorted(set(targets)-found)))
    # Check identity, conflicts, and the whole document before writing anything.
    for p in copy.deepcopy(pumps):
        enrich_onis_spatial(p, {}, result)
    return result


def main():
    from openpyxl import load_workbook
    folder = ROOT/'data/sources/onis-mbl2026'
    files = ['MBL.xlsx', 'small-pump.png', 'large-pump.png']
    sources = {
        'title': 'MBL (2026): MBL.xlsx и две размерные схемы, предоставлены пользователем 31.10.2026',
        'url': SOURCE_URL,
        'localFile': 'frontend/' + SOURCE_PATH,
        'sha256': hashlib.sha256((folder/'MBL.xlsx').read_bytes()).hexdigest(),
        'attachments': [{'file': 'frontend/data/sources/onis-mbl2026/' + n, 'sha256': hashlib.sha256((folder/n).read_bytes()).hexdigest()} for n in files],
        'retrieval': 'Локальный файл пользователя; 99 точных моделей MBL (2026). '
        'Короткие строки содержат 8 значений A/B/D/E/F/H1/H2/S под общим 14-колоночным заголовком. '
        'Схема выбирается по полной структуре строки и позиции S=4*14, без заполнения отдельных пропусков. '
        'Масса и упаковка в импорт не входят.',
    }
    workbook = load_workbook(folder/'MBL.xlsx', data_only=False, read_only=True)
    try:
        sheets = [(s.title, list(s.values)) for s in workbook]
    finally:
        workbook.close()
    path = ROOT/'data/pump-catalog/onis-spatial-data.json'
    old = json.loads(path.read_text(encoding='utf8'))
    pumps = json.loads((ROOT/'public/pumps.json').read_text(encoding='utf8'))
    new = prepare_document(pumps, old, sheets, sources)
    backup = None
    if old != new:
        backup = ROOT/'work/mbl-xlsx-backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup.mkdir(parents=True)
        shutil.copy2(path, backup/path.name)
        path.write_text(json.dumps(new, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf8')
    spec = importlib.util.spec_from_file_location('apply_onis', ROOT/'scripts/apply-onis-spatial-data.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        changed = module.apply(ROOT.parent)
    except Exception:
        if backup:
            shutil.copy2(backup/path.name, path)
        raise
    print('MBL (2026): 99 exact matches; changed catalog records:', len(changed))


if __name__ == '__main__':
    main()
