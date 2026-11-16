"""Persist reviewed ONIS facts to the catalog and SQLite, with recovery snapshot."""
import copy
from contextlib import closing
import datetime
import json
import shutil
import sqlite3
from pathlib import Path
from onis_spatial import enrich_onis_spatial

ROOT = Path(__file__).resolve().parents[2]


def apply(root=ROOT):
    pump_path = root/'frontend/public/pumps.json'
    record_path = root/'frontend/data/pump-catalog/records.json'
    source_path = root/'frontend/data/pump-catalog/onis-spatial-data.json'
    read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n'
    pumps, records, document = read(pump_path), read(record_path), read(source_path)
    known = {p['id'] for p in pumps}
    if set(document['pumps'])-known:
        raise ValueError('Unknown pump identity in ONIS source')
    changed = []
    allowed = {'dimensions', 'spatialData', 'physicalDataSources', 'physicalNote', 'weightKg'}
    for p in pumps:
        before, old_evidence = copy.deepcopy(p), copy.deepcopy(records[p['id']])
        enrich_onis_spatial(p, records[p['id']], document)
        if {k for k in set(before)|set(p) if before.get(k) != p.get(k)}-allowed:
            raise ValueError('Unexpected field mutation')
        if before != p or old_evidence != records[p['id']]:
            changed.append(p['id'])
        check, e = copy.deepcopy(p), copy.deepcopy(records[p['id']])
        enrich_onis_spatial(check, e, document)
        if check != p or e != records[p['id']]:
            raise ValueError('Not idempotent')
    db_path = root/'database/pumps-merged.sqlite'
    with closing(sqlite3.connect(db_path)) as db:
        rows = dict(db.execute('SELECT id,model FROM catalog_models'))
        if any(rows.get(p['id']) != p['model'] for p in pumps):
            raise ValueError('SQLite identity mismatch')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity failed')
        # A no-op import still checks that the persisted payload/evidence agree.
        for p in pumps:
            if p['id'] in document['pumps']:
                row = db.execute('SELECT payload_json,evidence_json FROM catalog_models WHERE id=?', (p['id'],)).fetchone()
                if (json.loads(row[0]) != p or json.loads(row[1]) != records[p['id']]) and p['id'] not in changed:
                    changed.append(p['id'])
        if not changed:
            print('ONIS: unchanged; catalog/SQLite agree')
            return []
        backup = root/'work/onis-spatial-backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup.mkdir(parents=True)
        shutil.copy2(pump_path, backup/'pumps.json'); shutil.copy2(record_path, backup/'records.json')
        with closing(sqlite3.connect(backup/'pumps-merged.sqlite')) as target:
            db.backup(target)
        files = [(pump_path, encode(pumps)), (record_path, encode(records))]
        for path, value in files:
            path.with_suffix('.onis-tmp').write_text(value, encoding='utf-8')
        try:
            with db:
                for p in pumps:
                    if p['id'] in changed:
                        db.execute('UPDATE catalog_models SET payload_json=?,evidence_json=? WHERE id=?',
                                   (encode(p).strip(), encode(records[p['id']]).strip(), p['id']))
                db.execute('INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)', ('onis_spatial_sources', encode(document['sources']).strip()))
                for path, _ in files:
                    path.with_suffix('.onis-tmp').replace(path)
        except Exception:
            for path, _ in files:
                shutil.copy2(backup/path.name, path)
            raise
        print('Recovery snapshot:', backup)
        print('ONIS updated:', len(changed), '; identity, idempotence, SQLite integrity passed')
    return changed


if __name__ == '__main__':
    apply()
