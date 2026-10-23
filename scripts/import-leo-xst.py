"""Add/update LEO XST without rebuilding or replacing the other manufacturers."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3

from leo_xst import SOURCE_FILE, attach_catalog

APP = Path(__file__).resolve().parents[1]
DATA = APP / 'data/pump-catalog'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8-sig') != text:
        path.write_text(text, encoding='utf-8')


def main():
    source = DATA / SOURCE_FILE
    document = read(source)
    public = APP / 'public/pumps.json'
    pumps, records = read(public), read(DATA / 'records.json')
    old_pumps = {p['id']: deepcopy(p) for p in pumps if p.get('catalogSource') != 'leo-local-selector'}
    old_records = {pid: deepcopy(records[pid]) for pid in old_pumps}
    report = attach_catalog(pumps, records, document)
    report['snapshotSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    report['snapshotFile'] = 'data/pump-catalog/' + SOURCE_FILE
    pumps.sort(key=lambda p: (p['manufacturer'], p['series'], p['model'], p['id']))
    assert len({p['id'] for p in pumps}) == len(pumps)
    for pump in pumps:
        if pump['id'] in old_pumps:
            assert pump == old_pumps[pump['id']]
            assert records[pump['id']] == old_records[pump['id']]
    summary = read(DATA / 'merge-report.json')
    summary.update(totalCount=len(pumps), selectableCount=sum(p['selectable'] for p in pumps),
        byManufacturer=dict(Counter(p['manufacturer'] for p in pumps)),
        byMedium=dict(Counter(p['medium'] for p in pumps)),
        curvePoints=sum(len(p['curve']) for p in pumps), leoXst=report)
    metadata = read(DATA / 'source-metadata.json')
    metadata['local/leo-xst'] = report
    db_path = APP.parent / 'database/pumps-merged.sqlite'
    # Preserve the pre-import JSON and database once, including any unrelated local changes.
    backup = APP.parent / 'artifacts/leo-xst-import-2026-10-15/before'
    if not backup.exists():
        backup.mkdir(parents=True)
        for path in [public, DATA / 'records.json', DATA / 'merge-report.json', DATA / 'source-metadata.json']:
            target = backup / path.relative_to(APP)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        if db_path.exists():
            with sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True) as db:
                with sqlite3.connect(backup / 'pumps-merged.sqlite') as saved:
                    db.backup(saved)
    if db_path.exists():
        with sqlite3.connect(db_path) as db:
            db.execute('PRAGMA foreign_keys=ON')
            for pump in pumps:
                if pump.get('catalogSource') != 'leo-local-selector':
                    saved = db.execute('SELECT payload_json,evidence_json FROM catalog_models WHERE id=?', (pump['id'],)).fetchone()
                    if saved is None or json.loads(saved[0]) != pump or json.loads(saved[1]) != records[pump['id']]:
                        raise ValueError(f'Existing catalog/SQLite disagreement: {pump["id"]}')
                    continue
                values = (pump['id'], pump['manufacturer'], pump['series'], pump['model'], pump['medium'],
                          pump['selectable'], json.dumps(pump, ensure_ascii=False), json.dumps(records[pump['id']], ensure_ascii=False))
                db.execute('INSERT INTO catalog_models VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                           'manufacturer=excluded.manufacturer,series=excluded.series,model=excluded.model,'
                           'medium=excluded.medium,selectable=excluded.selectable,payload_json=excluded.payload_json,'
                           'evidence_json=excluded.evidence_json', values)
                db.execute('DELETE FROM catalog_curve_points WHERE pump_id=?', (pump['id'],))
                db.executemany('INSERT INTO catalog_curve_points VALUES (?,?,?,?)',
                               [(pump['id'], i, q, h) for i, (q, h) in enumerate(pump['curve'])])
            for key, value in [('merge', summary), ('leo_xst', report)]:
                db.execute('INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)', (key, json.dumps(value, ensure_ascii=False)))
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            assert db.execute('SELECT count(*) FROM catalog_models').fetchone()[0] == len(pumps)
    write(public, pumps)
    write(DATA / 'records.json', records)
    write(DATA / 'merge-report.json', summary)
    write(DATA / 'source-metadata.json', metadata)
    write(DATA / 'leo-xst-report.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
