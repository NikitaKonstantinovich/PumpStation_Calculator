"""Inventory all catalogue STEP bindings; preserve measured source coordinates."""
import json
import sqlite3
from pathlib import Path

root = Path('E:/PumpStation_Calculator')
out = root / 'outputs/pump-fasteners-2026-11-10'
out.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect((root/'database/catalog-v2/pumps.sqlite').as_uri()+'?mode=ro', uri=True)
db.row_factory = sqlite3.Row
old = [json.loads(line) for line in (root/'outputs/mounting-grids-2026-11-10/pump-cad-measurements.jsonl').read_text(encoding='utf-8').splitlines()]
known = {r['id'] for r in old if not r.get('error')}
tasks, bindings, skipped = [], [], []
for row in db.execute('SELECT c.*,a.path FROM cad_bindings c JOIN assets a ON a.id=c.asset_id'):
    r = dict(row)
    profile = json.loads(r.pop('profile_json'))
    r['measurementIds'] = []
    if 'rejected_' in r['execution_match_status']:
        skipped.append({'id':r['id'],'reason':r['execution_match_status']});bindings.append(r);continue
    path = root / profile.get('outputFile', r['path'])
    normalized = any(s in str(path) for s in ('3D_Normalized','3D_ONIS_Normalized','3D_FlowVerified'))
    if not path.exists() or path.suffix.lower() not in ('.step','.stp'):
        skipped.append({'id':r['id'],'reason':'No readable STEP: '+str(path)});bindings.append(r);continue
    for axis in ([2] if normalized else [0,1,2]):
        ident = r['id'] if normalized else r['id']+':axis'+str(axis)
        r['measurementIds'].append(ident)
        if ident not in known:
            tasks.append({'id':ident,'bindingId':r['id'],'modelId':r['model_id'],'path':str(path),'verticalAxis':axis,'orientationConfirmed':normalized,'bindingStatus':r['execution_match_status']})
    bindings.append(r)
(out/'cad-tasks.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'cad-bindings.json').write_text(json.dumps(bindings,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'cad-skipped.json').write_text(json.dumps(skipped,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'bindings':len(bindings),'cached':len(known),'tasks':len(tasks),'skipped':len(skipped)}))
