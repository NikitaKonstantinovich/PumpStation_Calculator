"""Apply reviewed vertical facts, preserving unrelated data and SQLite evidence.

Creates a local recovery snapshot before writing. Re-running is idempotent.
"""
import copy,json,sqlite3,shutil,datetime
from pathlib import Path
from vertical_physical import enrich_vertical_physical

ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
def main():
    pump_path=ROOT/'frontend/public/pumps.json'
    record_path=ROOT/'frontend/data/pump-catalog/records.json'
    db_path=ROOT/'database/pumps-merged.sqlite'
    document=read(ROOT/'frontend/data/pump-catalog/vertical-physical-data.json')
    pumps=read(pump_path);records=read(record_path)
    allowed={'weightKg','nominalFlow','dimensions','physicalDataSources','physicalNote','drawing','dataWarnings'}
    changed=[]
    for p in pumps:
        before=copy.deepcopy(p)
        enrich_vertical_physical(p,records[p['id']],document)
        diff={k for k in set(before)|set(p) if before.get(k)!=p.get(k)}
        if not diff<=allowed:raise ValueError(f'Unexpected mutation: {p["id"]}: {diff}')
        if diff:changed.append(p['id'])
        check=copy.deepcopy(p);e=copy.deepcopy(records[p['id']])
        enrich_vertical_physical(check,e,document)
        if check!=p or e!=records[p['id']]:raise ValueError('Not idempotent')
    # Validate every SQLite identity before making any changes.
    with sqlite3.connect(db_path) as db:
        rows=dict(db.execute('SELECT id,model FROM catalog_models'))
        if any(rows.get(p['id'])!=p['model'] for p in pumps):raise ValueError('SQLite identity mismatch')
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity')
        if changed:
            backup=ROOT/'work/collector-spacing-research/backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
            backup.mkdir(parents=True)
            shutil.copy2(pump_path,backup/'pumps.json');shutil.copy2(record_path,backup/'records.json')
            with sqlite3.connect(backup/'pumps-merged.sqlite') as target:db.backup(target)
            print('Recovery snapshot:',backup)
        serialized_pumps=encode(pumps);serialized_records=encode(records)
        # SQLite transaction, then atomic individual file replacement; recovery snapshot above.
        for p in pumps:
            if p['id'] in document['pumps']:
                db.execute('UPDATE catalog_models SET payload_json=?,evidence_json=? WHERE id=?',(encode(p).strip(),encode(records[p['id']]).strip(),p['id']))
        db.execute('INSERT OR REPLACE INTO catalog_metadata VALUES (?,?)',('vertical_physical_sources',encode(document['sources']).strip()))
        for path,value in [(pump_path,serialized_pumps),(record_path,serialized_records)]:
            temp=path.with_suffix('.vertical-tmp');temp.write_text(value,encoding='utf-8');temp.replace(path)
    print('Models enriched:',len(changed),'; idempotence and identity checks passed')

if __name__=='__main__':main()
