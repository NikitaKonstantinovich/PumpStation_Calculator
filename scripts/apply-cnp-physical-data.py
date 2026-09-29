"""Apply reviewed CNP facts to the browser catalogue and its merged SQLite mirror.

Only missing physical fields are filled; curves/prices/IDs are left untouched.
The main catalogue importer uses the same function on every future merge.
"""
import importlib.util
import json
import sqlite3
from collections import Counter
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('merge', ROOT / 'scripts/merge-pump-catalogs.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)

def main():
    pumps = merge.read_json(ROOT / 'public/pumps.json')
    records = merge.read_json(ROOT / 'data/pump-catalog/records.json')
    document = merge.read_json(ROOT / 'data/pump-catalog/cnp-physical-data.json')
    changed = []
    for pump in pumps:
        before = json.dumps(pump, sort_keys=True)
        merge.enrich_cnp_physical(pump, records[pump['id']], document)
        if json.dumps(pump, sort_keys=True) != before:
            changed.append(pump['id'])
    db_path = ROOT.parent / 'database/pumps-merged.sqlite'
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    with closing(sqlite3.connect(db_path)) as db, db:
        for pump in pumps:
            if pump['manufacturer'] == 'CNP' and pump['id'] in document['pumps']:
                # Require an existing, identical catalogue model; never create IDs here.
                row = db.execute('SELECT model FROM catalog_models WHERE id=?',(pump['id'],)).fetchone()
                if not row or row[0] != pump['model']:
                    raise ValueError(f'SQLite identity mismatch: {pump["id"]}')
                db.execute('UPDATE catalog_models SET payload_json=?, evidence_json=? WHERE id=?',
                           (json.dumps(pump,ensure_ascii=False),json.dumps(records[pump['id']],ensure_ascii=False),pump['id']))
        db.execute('INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)',('cnp_physical_sources',json.dumps(document['sources'],ensure_ascii=False)))
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    merge.write_json(ROOT / 'public/pumps.json',pumps)
    merge.write_json(ROOT / 'data/pump-catalog/records.json',records)
    cnp = [p for p in pumps if p['manufacturer'] == 'CNP']
    missing = [{'id':p['id'], 'model':p['model'], 'series':p['series'],
                'reason':'Нет точного совпадения исполнения и мощности в проверенных каталогах; масса другой модели не подставлена.'}
               for p in cnp if not p.get('weightKg')]
    report = {'totalCnpModels':len(cnp), 'withWeight':len(cnp)-len(missing),
              'withWeightBySeries':dict(Counter(p['series'] for p in cnp if p.get('weightKg'))),
              'missingWeight':missing, 'sourceIndex':'cnp-physical-data.json',
              'note':'Для WQ/SHP указан напорный патрубок; всасывающий присоединительный патрубок не выдумывается.'}
    merge.write_json(ROOT / 'data/pump-catalog/cnp-physical-report.json',report)
    print(f'CNP physical facts: {len(changed)} models enriched; SQLite integrity OK')

if __name__ == '__main__':
    main()
