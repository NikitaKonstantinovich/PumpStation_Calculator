"""Join measured STEP candidates to exact catalogue variant links; never approve them.

Inputs are produced by build-pump-mountings.py and inspect-pump-mounting.py.
The report includes every execution, including those without any usable source.
"""
import argparse
import html
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument('database'); p.add_argument('output')
    args = p.parse_args()
    out = Path(args.output)
    drawing_dir=Path(args.database).resolve().parent/'drawing-files'
    manifest = json.loads((out/'coverage.json').read_text(encoding='utf-8'))
    measured = {r['id']:r for r in (json.loads(line) for line in (out/'pump-cad-measurements.jsonl').read_text(encoding='utf-8').splitlines())}
    db = sqlite3.connect(Path(args.database).resolve().as_uri()+'?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    links = defaultdict(list)
    for link in db.execute('SELECT v.variant_id,v.binding_id,v.applicability,c.model_id,c.exact_designation,c.execution_match_status,c.assembly_approved FROM variant_cad_candidates v JOIN cad_bindings c ON c.id=v.binding_id'):
        if link['binding_id'] in measured:
            links[link['variant_id']].append(dict(link))
    model_links=defaultdict(list)
    for binding in db.execute('SELECT id AS binding_id,model_id,exact_designation,execution_match_status,assembly_approved FROM cad_bindings'):
        if binding['binding_id'] in measured:
            model_links[binding['model_id']].append(dict(binding))
    counts = Counter()
    for row in manifest['rows']:
        candidates=[]
        exact=links[row['variantId']]
        known={c['binding_id'] for c in exact}
        references=[{**c,'linkScope':'variant_candidate'} for c in exact]+[{**c,'linkScope':'model_reference_only','variant_id':row['variantId'],'applicability':'Общая CAD-модель: точный артикул, двигатель и исполнение креплений не подтверждены'} for c in model_links[row['modelId']] if c['binding_id'] not in known]
        for link in references:
            if link['model_id'] != row['modelId']:
                raise ValueError('Model binding differs: '+row['variantId'])
            m = measured[link['binding_id']]
            bores = m.get('holes',[]) or m.get('raisedBoreCandidates',[])
            candidate = {**link, 'holeCount':len(bores), 'requiresReview':True}
            if len(bores)==4 and m['verticalAxis']==2:
                # Normalized models use flow X; the frame row runs along CAD Y.
                pitches=[max(b['center'][i] for b in bores)-min(b['center'][i] for b in bores) for i in [1,0]]
                candidate['rawPitchTransverseAlongFlowMm']=pitches
                diameters=sorted({b['diameterMm'] for b in bores})
                candidate['boreDiametersMm']=diameters
                mounting=row.get('mounting')
                if mounting:
                    expected=[max(h[axis] for h in mounting['holes'])-min(h[axis] for h in mounting['holes']) for axis in ['x','y']]
                    candidate['cataloguePitchMatches']=all(abs(a-b)<0.1 for a,b in zip(expected,pitches))
                    candidate['catalogueBoreMatches']=all(abs(d-mounting['holes'][0]['diameterMm'])<0.1 for d in diameters)
            candidates.append(candidate)
        row['cadCandidates']=candidates
        row['auditStatus']='catalogue_grid' if row.get('mounting') else 'cad_review' if any(c['holeCount']>=2 for c in candidates) else row['status']
        counts[row['auditStatus']]+=1
    report={**manifest, 'counts':dict(counts),'measuredCadCount':len(measured),'cad':measured}
    (out/'mounting-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    e=html.escape
    labels={'catalogue_grid':'Каталожная сетка подключена','cad_review':'CAD-сетка требует сверки','partial':'Есть часть размеров','missing':'Нет полной сетки'}
    def svg(holes,bounds):
        x0,y0,x1,y1=bounds;w=x1-x0;h=y1-y0
        circles=''.join(f'<circle cx="{x:g}" cy="{y:g}" r="{d/2:g}"/>' for x,y,d in holes)
        return f'<svg width="180" height="150" viewBox="{x0-15:g} {y0-15:g} {w+30:g} {h+30:g}"><g fill="none" stroke="#267" stroke-width="2"><rect x="{x0:g}" y="{y0:g}" width="{w:g}" height="{h:g}"/>{circles}</g></svg>'
    def drawing(row):
        m=row.get('mounting')
        refs=[]
        for d in row.get('drawings',[]):
            file_id=d.get('fileId','')
            path=drawing_dir/file_id
            if file_id and Path(file_id).name==file_id and path.is_file():
                refs.append('<p><a href="'+e(path.as_uri())+'">'+e(d['name'])+'</a><small>'+e(d.get('note',''))+'</small></p>')
        sources='<details><summary>Исходные чертежи · '+str(len(refs))+'</summary>'+''.join(refs)+'</details>' if refs else ''
        if not m:return 'Сетка не подтверждена'+sources
        b=m['bounds'];holes=m['holes']
        pitch=[max(p[a]for p in holes)-min(p[a]for p in holes) for a in ['x','y']]
        return svg([(p['x'],p['y'],p['diameterMm'])for p in holes],[b['minX'],b['minY'],b['maxX'],b['maxY']])+f'<p>{pitch[0]:g} × {pitch[1]:g}; {len(holes)} × Ø{holes[0]["diameterMm"]:g} мм</p><small>'+e(m['source'])+'</small>'+sources
    def cad(row):
        entries=[]
        for c in row['cadCandidates']:
            m=measured[c['binding_id']];bores=m.get('holes',[]) or m.get('raisedBoreCandidates',[])
            axes=[i for i in range(3) if i!=m['verticalAxis']]
            b=m['bounds'];view=svg([(h['center'][axes[0]],h['center'][axes[1]],h['diameterMm'])for h in bores],[b[axes[0]],b[axes[1]],b[axes[0]+3],b[axes[1]+3]]) if bores else 'Отверстия не выделены'
            conflict=' · Расхождение с каталогом' if c.get('catalogueBoreMatches') is False or c.get('cataloguePitchMatches') is False else ''
            entries.append('<details><summary>'+str(len(bores))+' отверстий'+conflict+'</summary>'+view+'<p>Исходные оси CAD, не координаты сверления рамы. Геометрию лап, соответствие артикулу и крепёж необходимо проверить.</p><code>'+e(m['path'])+'</code><p>'+e(c['applicability'])+'</p><small>SHA256 '+e(m['sha256'])+'</small></details>')
        return ''.join(entries) or 'Нет обработанного CAD с привязкой к исполнению'
    body=''.join('<tr data-status="'+r['auditStatus']+'"><td>'+e(r['manufacturer']+' '+r['designation'])+'<small>'+e(r['article'] or r['variantId'])+'</small></td><td>'+labels[r['auditStatus']]+'</td><td>'+drawing(r)+'</td><td>'+cad(r)+'</td><td>'+e('; '.join(r['missing']))+'</td></tr>' for r in report['rows'])
    head='<!doctype html><meta charset="utf-8"><title>Монтажные сетки всех исполнений</title><style>body{font:14px system-ui;margin:24px;color:#123}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5df;padding:10px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#edf3f7}small{display:block;color:#456}code{overflow-wrap:anywhere}details{max-width:450px;margin:8px 0}summary{cursor:pointer}input,select{padding:8px;margin:8px}</style>'
    controls='<h1>Монтажные сетки насосов</h1><p>Всего исполнений: '+str(len(report['rows']))+'. Обработано STEP: '+str(len(measured))+'.</p><p>'+e('; '.join(labels[k]+': '+str(v) for k,v in counts.items()))+'</p><p>Каталожные сетки используются для компоновки. Крепёж и изготовление требуют отдельного подтверждения. CAD-кандидаты не включаются в расчёт автоматически.</p><input id="search" placeholder="Модель, артикул или производитель"><select id="status"><option value="">Все статусы</option>'+''.join('<option value="'+k+'">'+v+'</option>'for k,v in labels.items())+'</select><span id="shown"></span>'
    script='<script>const rows=[...document.querySelectorAll("tbody tr")],q=document.querySelector("#search"),s=document.querySelector("#status");function filter(){let n=0;for(const r of rows){r.hidden=!!((s.value&&r.dataset.status!==s.value)||!r.cells[0].textContent.toLocaleLowerCase().includes(q.value.toLocaleLowerCase()));if(!r.hidden)n++;}document.querySelector("#shown").textContent="Показано: "+n;}q.oninput=s.onchange=filter;filter();</script>'
    (out/'mounting-audit.html').write_text(head+controls+'<table><thead><tr><th>Исполнение</th><th>Статус</th><th>Каталожная сетка</th><th>CAD-кандидаты</th><th>Недостающие сведения</th></tr></thead><tbody>'+body+'</tbody></table>'+script,encoding='utf-8')
    print(json.dumps({'total':len(report['rows']),'counts':dict(counts),'measured':len(measured)}))


if __name__=='__main__':main()
