"""Merge calculator-nu pump facts with the local catalogue, without editing either source.

Run from any directory: python scripts/merge-pump-catalogs.py --source ../../reference
The first run freezes the previous browser catalogue. Subsequent runs use that baseline.
No source code from the reference repository is executed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import sqlite3
import subprocess
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
DATA = FRONTEND / 'data/pump-catalog'
PUBLIC = FRONTEND / 'public'
CATALOG_FILES = ['onis_cleanwater_catalog_2026-08-08.json',
                 'aquastrong_cleanwater_catalog_2026-08-09.json',
                 'vandjord_cleanwater_catalog_2026-08-09.json',
                 'wellmix_cleanwater_catalog_2026-08-09.json']


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')


def present(value):
    return value is not None and value not in ('', '—', '-') and value != [] and value != {}


def supplement(old, new):
    if isinstance(old, dict) and isinstance(new, dict):
        result = deepcopy(old)
        for key, value in new.items():
            if present(value):
                result[key] = supplement(old.get(key), value)
        return result
    return deepcopy(new) if present(new) else deepcopy(old)


def number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = float(str(value).replace(',', '.'))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def brand(value):
    return {'AQUASTRONG': 'Aquastrong', 'WELLMIX': 'Wellmix'}.get(str(value).upper(), str(value).upper())


def model_key(value):
    return re.sub(r'\s+', '', str(value).upper()).replace('CHLF(T)', 'CHLF').replace(',', '.')


def enrich_cnp_physical(pump, evidence, document):
    """Fill physical facts only; preserve selected executions and existing values."""
    fact = document.get('pumps', {}).get(pump['id'])
    if pump['manufacturer'] != 'CNP' or not fact:
        return
    if fact['model'] != pump['model'] or fact.get('execution') != pump.get('execution'):
        raise ValueError(f'CNP physical identity mismatch: {pump["id"]}')
    evidence['cnpPhysicalData'] = fact
    labels = {'weightKg':'Масса', 'inletDn':'Всасывающий патрубок', 'outletDn':'Напорный патрубок',
              'inletConnection':'Всасывающий патрубок', 'outletConnection':'Напорный патрубок', 'physicalNote':'Примечание'}
    for field in ['weightKg','inletDn','outletDn','inletConnection','outletConnection','physicalNote']:
        if field not in fact:
            continue
        if field.endswith('Connection'):
            side = field.removesuffix('Connection')
            target, target_key = pump.setdefault('connectionSourceValue', {}), side
            if present((pump.get(side) or {}).get('dn')) or present(pump.get(side+'Dn')):
                continue
        else:
            target, target_key = pump, field
            if field.endswith('Dn') and present((pump.get(field[:-2]) or {}).get('dn')):
                continue
        if present(target.get(target_key)):
            continue
        target[target_key] = fact[field]
        ref = fact['provenance'][field]
        source = document['sources'][ref['source']]
        title = source['title'] + (f', стр. {ref["page"]}' if ref.get('page') else '')
        if ref.get('variants'):
            executions = sorted({v if isinstance(v,str) else v['execution'] for v in ref['variants']})
            title += ' · ' + ', '.join(executions)
        pump.setdefault('physicalDataSources', {})[labels[field]] = title


def identity(p):
    return (brand(p['manufacturer']), model_key(p['model']))


def curve(points):
    """Sort and deduplicate exact coordinates; never average conflicting head values."""
    result = {}
    for q, h in points:
        q, h = number(q), number(h)
        if q is None or h is None or q < 0 or h < 0:
            raise ValueError(f'Invalid curve coordinate: {q}, {h}')
        q = round(q, 8)
        if q in result and not math.isclose(result[q], h, abs_tol=1e-6):
            raise ValueError(f'Conflicting curve heads at Q={q}: {result[q]} / {h}')
        result[q] = h
    return [[q, h] for q, h in sorted(result.items())]


def kind(manufacturer, series):
    if series in {'CDM', 'EVR', 'EVS', 'CRV', 'CV', 'MV', 'PV'}:
        return 'vertical_multistage'
    if series in {'CHLF', 'CHLF(T)', 'ECH', 'EDH', 'VCM', 'CMI', 'CUC', 'MH'}:
        return 'horizontal_multistage'
    if series in {'TD', 'TG', 'TL', 'TPV', 'INL', 'EPP'}:
        return 'inline'
    if series in {'NIS', 'EST', 'EEZ', 'NBV', 'NBS', 'NBW', 'MBL', 'MBL (2026)'}:
        return 'end_suction'
    return 'submersible'


def point_rows(rows, field='h_m'):
    return [[r['q_m3h'] if r.get('q_m3h') is not None else r['q_lps'] * 3.6, r[field]]
            for r in rows if r.get(field) is not None]


def json_fields(row):
    return {key[:-5]: json.loads(value) for key, value in row.items() if key.endswith('_json') and value}


def list_price(row):
    p = row.get('price') or {}
    for key, currency in [('list_price_cny_vat', 'CNY'), ('list_price_rub_vat', 'RUB'), ('retail_amount', 'RUB')]:
        if p.get(key) is not None:
            return {'price': p[key], 'priceCurrency': currency, 'priceKind': 'list',
                    'discountPercent': p.get('discount_percent')}
    if p.get('amount') is not None:
        return {'price': p['amount'], 'priceCurrency': p.get('currency', 'RUB'),
                'priceKind': 'net' if p.get('price_kind') == 'calculated_purchase_price' else 'list',
                'discountPercent': 0}
    return {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    source_db = source / 'data/app/pumps.db'
    if not source_db.is_file():
        raise SystemExit(f'Missing source database: {source_db}')
    DATA.mkdir(parents=True, exist_ok=True)
    baseline_path = DATA / 'legacy-pumps.json'
    if not baseline_path.exists():
        shutil.copy2(PUBLIC / 'pumps.json', baseline_path)
    baseline = read_json(baseline_path)
    pumps = {identity(p): deepcopy(p) for p in baseline}
    if len(pumps) != len(baseline):
        raise ValueError('Ambiguous legacy model identities; manual reconciliation needed')
    details = {p['id']: {'legacy': deepcopy(p), 'sources': [], 'fieldSources': {}} for p in baseline}
    changes, asset_issues, source_hashes, source_metadata = [], [], {}, {}
    def register(path):
        source_hashes[str(path.relative_to(source)).replace('\\', '/')] = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.suffix == '.json':
            source_metadata[path.relative_to(source).as_posix()] = {k: v for k, v in read_json(path).items() if k not in {'models', 'pumps', 'records'}}
    register(source_db)

    def apply(record, facts, origin):
        facts = {k: v for k, v in facts.items() if present(v)}
        key = identity(facts)
        if key not in pumps:
            new_id = 'nu-' + hashlib.sha256('|'.join(key).encode()).hexdigest()[:16]
            pumps[key] = {k: None for k in ['power', 'efficiency', 'nominalFlow', 'minFlow', 'maxFlow', 'minHead', 'maxHead', 'price', 'priceCurrency', 'priceSource', 'source', 'drawing']}
            pumps[key].update(id=new_id, curve=[], group=facts.get('series', ''), type='unknown')
            details[new_id] = {'sources': [], 'fieldSources': {}}
        target = pumps[key]
        raw = details[target['id']]
        raw['sources'].append({'file': origin, 'record': deepcopy(record)})
        for field, value in facts.items():
            if field == 'id':
                continue
            value = supplement(target.get(field), value)
            if present(target.get(field)) and target[field] != value:
                changes.append({'id': target['id'], 'model': target.get('model', facts['model']), 'field': field,
                                'previous': target[field], 'reference': value, 'source': origin})
            target[field] = deepcopy(value)
            raw['fieldSources'][field] = origin
        target['catalogSource'] = 'calculator-nu'
        return target

    with sqlite3.connect(f'file:{source_db.as_posix()}?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Invalid reference SQLite database')
        docs = [dict(x) for x in db.execute('SELECT * FROM pump_documents ORDER BY id')]
        documents = defaultdict(list)
        for doc in docs:
            if doc['pump_model_id']:
                documents[doc['pump_model_id']].append(doc)
        all_curves = defaultdict(list)
        for row in db.execute('SELECT * FROM pump_curve_points ORDER BY pump_model_id,point_order,id'):
            all_curves[row['pump_model_id']].append(dict(row))
        rows = db.execute('SELECT p.*,m.name manufacturer,s.name series FROM pump_models p JOIN manufacturers m ON m.id=p.manufacturer_id JOIN pump_series s ON s.id=p.series_id ORDER BY p.id').fetchall()
        for r in rows:
            row = dict(r)
            points = all_curves[row['id']]
            charts = defaultdict(list)
            for point in points:
                if point['frequency_hz'] in (None, 50):
                    charts[point['curve_name']].append(point)
            chosen = max(charts.values(), key=len, default=[])
            raw = {**row, 'curve_records': points, 'documents': documents[row['id']], **json_fields(row)}
            p = {'manufacturer': brand(row['manufacturer']), 'series': row['series'], 'model': row['model'],
                 'article': row['article'], 'power': row['power_kw'], 'frequencyHz': row['frequency_hz'],
                 'type': kind(row['manufacturer'], row['series']), 'active': bool(row['is_active']),
                 'medium': 'water' if row['series'] in {'CDM', 'CHLF', 'TD', 'NIS'} else 'wastewater',
                 'curve': curve(point_rows(chosen)), 'source': 'calculator-nu/data/app/pumps.db',
                 'weightKg': row['weight_kg'], 'dimensions': raw.get('dimensions'), 'materials': raw.get('materials'),
                 'electric': raw.get('electric'), 'mounting': raw.get('mounting'), 'fluid': raw.get('fluid'),
                 'description': row['description'], 'availability': row['availability'],
                 'voltage': (raw.get('electric') or {}).get('Номинальное напряжение'),
                 'efficiencyCurve': point_rows(chosen, 'efficiency_pct'), 'powerCurve': point_rows(chosen, 'point_power_kw')}
            if row['source_price'] is not None:
                p.update(price=row['source_price'], priceCurrency=row['base_currency'], priceKind='list',
                         discountPercent=100 * row['price_discount_pct'] if row['price_discount_pct'] is not None else 0)
            elif row['price_rub_vat'] is not None:
                # This column is already in RUB, even where base_currency says CNY.
                p.update(price=row['price_rub_vat'], priceCurrency='RUB', priceKind='net', discountPercent=0)
            if 'price' in p:
                p['priceSource'] = 'calculator-nu/data/app/pumps.db'
            if chosen and any('scaled from' in x['curve_name'] for x in chosen):
                p['dataWarnings'] = ['Кривая в исходной базе пересчитана с другой модели; требуется проверка.']
            model_docs = sorted(documents[row['id']], key=lambda x: x['document_name'] or '')
            drawing_docs = [d for d in model_docs if d['document_type'] == 'drawing_image' and not any(t in (d['title'] or '').lower() for t in ['атм', 'упм', 'муфт'])]
            if row['drawing_path']:
                p['drawing'] = row['drawing_path']
            elif drawing_docs:
                p['drawing'] = drawing_docs[0]['file_path'] or drawing_docs[0]['url']
            if p.get('drawing'):
                p['drawingSource'] = 'Чертёж из каталога calculator-nu'
            apply(raw, p, 'data/app/pumps.db')

    for name in ['eventech_cdm_catalog.json', 'eventech_td_nis_chlf_catalog.json']:
        path = source / 'data/prototype' / name
        register(path)
        for row in read_json(path)['models']:
            variants = row.get('variants', [])
            powers = set(v['motor_power_kw'] for v in variants if v.get('motor_power_kw') is not None)
            power = row.get('motor_power_kw')
            if power is None and len(powers) == 1:
                power = next(iter(powers))
            curves = row['curves']
            p = {'manufacturer': 'CNP', 'model': row['model'], 'series': row['series'], 'power': power,
                 'medium': 'water', 'type': kind('CNP', row['series']), 'nominalFlow': row.get('rated_flow_m3h'),
                 'ratedHead': row.get('rated_head_m'), 'efficiency': row.get('rated_efficiency_pct'), 'speedRpm': row.get('speed_rpm'),
                 'curve': curve([[x['q_m3h'], x['value']] for x in curves.get('qh', [])])}
            for src, dest in [('efficiency', 'efficiencyCurve'), ('power', 'powerCurve'), ('npsh', 'npshCurve')]:
                p[dest] = [[x['q_m3h'], x['value']] for x in curves.get(src, [])]
            apply(row, p, 'data/prototype/' + name)

    for name, rows_key in [('cnp_cdm_fswpc_prices_2026-07-01.json', 'records'), ('cnp_cdm_fswpc_technical_data.json', 'records')]:
        path = source / 'data/prototype' / name
        register(path)
        for row in read_json(path)[rows_key]:
            p = {'manufacturer': 'CNP', 'series': 'CDM', 'model': row.get('base_model', row.get('model')), 'execution': row['exact_variant']}
            if 'retail_price_usd' in row:
                p.update(price=row['retail_price_usd'], priceCurrency='USD', priceKind='list',
                         priceSource='calculator-nu/data/prototype/' + name,
                         discountPercent=row['discount_percent'], power=row['motor_power_kw'])
            else:
                p.update(dimensions=row['dimensions_mm'], weightKg=row['weight_kg'], inlet=row.get('inlet'), outlet=row.get('outlet'))
            apply(row, p, 'data/prototype/' + name)

    vandjord_path = source / 'data/sources/vandjord/2026-08-09/vandjord_cleanwater_selector.json'
    register(vandjord_path)
    vandjord = {str(x['article']): x for x in read_json(vandjord_path)['records']}
    for name in CATALOG_FILES:
        path = source / 'data/prototype' / name
        register(path)
        for row in read_json(path)['pumps']:
            pts = row.get('curve_points', (row.get('curve') or {}).get('points', []))
            p = {'manufacturer': brand(row['manufacturer']), 'model': row['model'], 'series': row['series'],
                 'article': row['article'], 'power': row.get('motor_power_kw'), 'nominalFlow': row.get('rated_flow_m3h'),
                 'ratedHead': row.get('rated_head_m'), 'type': kind(row['manufacturer'], row['series']),
                 'medium': 'water', 'selectable': row.get('selectable', True), 'curve': curve(point_rows(pts)),
                 'efficiencyCurve': point_rows(pts, 'efficiency_pct'), 'powerCurve': point_rows(pts, 'point_power_kw'),
                 'voltage': row.get('voltage'), 'frequencyHz': row.get('frequency_hz'),
                 'speedRpm': row.get('speed_rpm'), 'materials': row.get('materials'), 'electric': row.get('electric'),
                 'weightKg': row.get('weight_kg'), 'inletDn': row.get('inlet_dn'), 'outletDn': row.get('outlet_dn'),
                 'connectionSourceValue': row.get('connection_source_value'),
                 'source': 'calculator-nu/data/prototype/' + name, **list_price(row)}
            if 'price' in p:
                p['priceSource'] = p['source']
            if row['manufacturer'] == 'VANDJORD':
                extra = vandjord.get(str(row['article']), {})
                decoded = json_fields(extra)
                p.update(drawing=extra.get('drawing_path'), drawingSource='Официальный каталог VANDJORD',
                         nominalFlow=extra.get('rated_q_m3h'), ratedHead=extra.get('rated_h_m'),
                         dimensions=decoded.get('dimensions'), mounting=decoded.get('mounting'))
                row = {**row, 'selectorRecord': extra}
            apply(row, p, 'data/prototype/' + name)

    # Keep every extra field from the old SQLite, not only the browser projection.
    old_db = FRONTEND.parent / 'database/pumps.sqlite'
    if old_db.exists():
        with sqlite3.connect(f'file:{old_db.as_posix()}?mode=ro', uri=True) as db:
            db.row_factory = sqlite3.Row
            old_details = defaultdict(dict)
            for row in db.execute('SELECT * FROM pump_models'):
                old_details[str(row['id'])]['model'] = dict(row)
            for table in ['pump_attributes', 'pump_connections', 'pump_dimensions', 'pump_materials', 'pump_curve_points']:
                for row in db.execute(f'SELECT * FROM {table}'):
                    old_details[str(row['model_id'])].setdefault(table, []).append(dict(row))
            for pump_id, record in old_details.items():
                if pump_id in details:
                    details[pump_id]['legacySqlite'] = record

    asset_manifest = {}
    remote_cache = read_json(DATA / 'remote-drawings.json') if (DATA / 'remote-drawings.json').exists() else {}
    def asset(path):
        if not path:
            return None
        if path.startswith(('https://', 'http://')):
            cached = remote_cache.get(path, {})
            if cached.get('path') and (PUBLIC / cached['path'].lstrip('/')).is_file():
                asset_manifest[cached['path']] = {'source': path, 'sha256': cached['sha256']}
                return cached['path']
            return path
        if path.startswith('/assets/'):
            local = source / 'data' / path.lstrip('/')
        else:
            local = source / path.lstrip('/')
        if local.is_file() and local.resolve().is_relative_to(source):
            suffix = local.suffix.lower()
            digest = hashlib.sha256(local.read_bytes()).hexdigest()
            dest = PUBLIC / 'reference-pump-assets' / (digest[:20] + suffix)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists():
                shutil.copy2(local, dest)
            url = '/' + dest.relative_to(PUBLIC).as_posix()
            asset_manifest[url] = {'source': path, 'sha256': digest}
            return url
        if (PUBLIC / path.lstrip('/')).is_file():
            return path
        asset_issues.append(path)
        return None

    result = list(pumps.values())
    physical_path = DATA / 'cnp-physical-data.json'
    physical_document = read_json(physical_path) if physical_path.exists() else {}
    for p in result:
        enrich_cnp_physical(p, details[p['id']], physical_document)
        p.setdefault('medium', 'water')
        p.setdefault('active', True)
        p.setdefault('priceKind', 'list')
        p['curve'] = curve(p['curve'])
        p['selectable'] = p.get('selectable', True) and p['active'] and len(p['curve']) >= 2
        if not p['selectable']:
            p.setdefault('dataWarnings', []).append('Нет подтверждённой рабочей кривой или модель неактивна; подбор отключён.')
        if p['curve']:
            p.update(minFlow=p['curve'][0][0], maxFlow=p['curve'][-1][0],
                     minHead=min(x[1] for x in p['curve']), maxHead=max(x[1] for x in p['curve']))
        if p.get('efficiency') is None and p.get('efficiencyCurve'):
            p['efficiency'] = max(x[1] for x in p['efficiencyCurve'])
        original = p.get('drawing')
        p['drawing'] = asset(original)
        if original and not p['drawing']:
            p.setdefault('dataWarnings', []).append('Файл чертежа из источника не найден.')
        # Preserve all supporting documents, including ATM drawings, without using them as pump sketches.
        docs = [d for s in details[p['id']]['sources'] for d in s['record'].get('documents', [])]
        for d in docs:
            d['localAsset'] = asset(d.get('file_path') or d.get('url'))
        if docs:
            details[p['id']]['documents'] = docs

    result.sort(key=lambda p: (p['manufacturer'], p['series'], p['model'], p['id']))
    if len({p['id'] for p in result}) != len(result):
        raise ValueError('Duplicate pump IDs')
    revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    report = {'sourceRepository': 'https://github.com/nickzon8/calculator-nu', 'sourceCommit': revision,
              'sourceFiles': source_hashes, 'legacyCount': len(baseline), 'totalCount': len(result),
              'matchedLegacyCount': sum(p['id'] in {b['id'] for b in baseline} and p.get('catalogSource') == 'calculator-nu' for p in result),
              'selectableCount': sum(p['selectable'] for p in result),
              'byManufacturer': dict(Counter(p['manufacturer'] for p in result)),
              'byMedium': dict(Counter(p['medium'] for p in result)),
              'curvePoints': sum(len(p['curve']) for p in result),
              'localAssets': len(asset_manifest), 'missingSourceAssets': sorted(set(asset_issues)),
              'externalDrawings': sum(str(p.get('drawing', '')).startswith('http') for p in result),
              'remoteDrawingUrlsCached': sum('path' in r for r in remote_cache.values()),
              'remoteDrawingUrlsUnavailable': sum('error' in r for r in remote_cache.values()),
              'changedFields': dict(Counter(c['field'] for c in changes))}
    write_json(PUBLIC / 'pumps.json', result)
    write_json(DATA / 'records.json', details)
    write_json(DATA / 'merge-report.json', report)
    write_json(DATA / 'conflicts.json', changes)
    write_json(DATA / 'asset-manifest.json', asset_manifest)
    write_json(DATA / 'source-metadata.json', source_metadata)
    # Compact typed connection evidence used by the existing DN / suction specification tools.
    ports = {}
    for p in result:
        inlet = p.get('inlet') or {}
        if inlet.get('type') == 'flange' and number(inlet.get('dn')):
            pn = re.search(r'PN\s*(\d+)', inlet.get('pressure_class', ''))
            ports[p['id']] = [{'dn': number(inlet['dn']), 'connection': 'flanged',
                              'maxPressure': float(pn[1]) if pn else None,
                              'source': f'calculator-nu: {p.get("execution", p["model"])}', 'shape': 'round'}]
    write_json(FRONTEND / 'app/imported-pump-ports.json', ports)

    # A separate self-contained merged SQLite is authoritative for both source snapshots and normalized facts.
    merged_path = FRONTEND.parent / 'database/pumps-merged.sqlite'
    with sqlite3.connect(merged_path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS catalog_models (id TEXT PRIMARY KEY, manufacturer TEXT NOT NULL, series TEXT NOT NULL, model TEXT NOT NULL, medium TEXT NOT NULL, selectable INTEGER NOT NULL, payload_json TEXT NOT NULL, evidence_json TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS catalog_curve_points (pump_id TEXT NOT NULL REFERENCES catalog_models(id), point_order INTEGER NOT NULL, flow_m3h REAL NOT NULL, head_m REAL NOT NULL, PRIMARY KEY(pump_id,point_order))')
        db.execute('CREATE TABLE IF NOT EXISTS catalog_metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)')
        db.execute('DELETE FROM catalog_curve_points')
        db.execute('DELETE FROM catalog_models')
        db.execute('DELETE FROM catalog_metadata')
        for p in result:
            db.execute('INSERT INTO catalog_models VALUES (?,?,?,?,?,?,?,?)', (p['id'],p['manufacturer'],p['series'],p['model'],p['medium'],p['selectable'],json.dumps(p,ensure_ascii=False),json.dumps(details[p['id']],ensure_ascii=False)))
            db.executemany('INSERT INTO catalog_curve_points VALUES (?,?,?,?)',[(p['id'],i,q,h) for i,(q,h) in enumerate(p['curve'])])
        db.execute('INSERT INTO catalog_metadata VALUES (?,?)', ('merge', json.dumps(report,ensure_ascii=False)))
        if physical_document:
            db.execute('INSERT INTO catalog_metadata VALUES (?,?)', ('cnp_physical_sources', json.dumps(physical_document['sources'],ensure_ascii=False)))
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Merged SQLite integrity check failed')
    copied_source = FRONTEND.parent / 'database/calculator-nu-source.sqlite'
    shutil.copy2(source_db, copied_source)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
