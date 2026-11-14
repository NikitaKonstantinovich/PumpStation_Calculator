"""Extract available dimension-sheet text for the complete pump inventory."""
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

def read(task):
    from pypdf import PdfReader
    try:
        return {**task,'text':'\n'.join(p.extract_text() for p in PdfReader(task['path']).pages)}
    except Exception as e:
        return {**task,'error':str(e)}

if __name__=='__main__':
    app=Path(__file__).resolve().parent.parent
    root=Path('E:/PumpStation_Calculator')
    out=root/'outputs/pump-fasteners-2026-11-10/sheet-text.jsonl'
    manifest=json.loads((app/'data/pump-drawings-reviewed.json').read_text(encoding='utf-8'))
    ids={d['fileId'] for r in manifest['rows'] for d in r['drawings'] if d['fileId'].lower().endswith('.pdf')}
    done={r['id'] for r in map(json.loads,out.read_text(encoding='utf-8').splitlines()) if not r.get('error')} if out.exists() else set()
    tasks=[{'id':id,'path':str(root/'database/catalog-v2/drawing-files'/id)} for id in sorted(ids-done)]
    print('PDF sheets',len(ids),'pending',len(tasks),flush=True)
    with ProcessPoolExecutor(max_workers=3) as pool:
        pending={pool.submit(read,t):t for t in tasks}
        for i,f in enumerate(as_completed(pending),1):
            result=f.result()
            with out.open('a',encoding='utf-8') as dest:dest.write(json.dumps(result,ensure_ascii=False)+'\n')
            if i%100==0:print('Read',i,flush=True)
