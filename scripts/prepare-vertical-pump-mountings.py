"""Complete missing vertical mounting grids from reviewed drawings and STEP facts.

Run with a read-only catalogue projection and the original coverage audit. Existing
mountings retain priority. This manifest is execution-bound, never a fuzzy family
fallback at runtime. Unknown foot bores/clamp heights remain null.
"""
import copy
import hashlib
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[2]
OUT = APP / 'work/vertical-mountings'
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
@lru_cache(None)
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def source_path(p):
    p = Path(p)
    return p if p.is_absolute() else ROOT / p
def sym_bounds(w, l): return dict(minX=-w/2, maxX=w/2, minY=-l/2, maxY=l/2)
def norm(s): return re.sub(r'\s+', '', s.translate(str.maketrans({'А':'A','В':'B','З':'3'}))).replace('*','')

# Transverse / flow pitches, base width / length. ONIS round-flange drawings.
MV = {1:(180,100,220,150),3:(180,100,220,150),5:(180,100,220,150),
      10:(215,130,247,200),15:(215,130,247,200),20:(215,130,247,200),
      32:(240,170,298,235),45:(265,190,330,250),64:(265,190,330,250),
      90:(280,199,348,261),120:(380,275,472,340),150:(380,275,472,340),200:(500,385,600,460)}
CDM_ENVELOPE = {95:(440,380),125:(530,485),155:(530,485),185:(600,615),215:(600,615)}
CDM_PDF = ROOT/'Equipment/Pumps/CDM_CDMF_220626.pdf'

def main():
    resources=read(sys.argv[1]); audit=read(sys.argv[2])
    pumps={r['variantId']:r['pump'] for r in resources['pump_catalog_v2']['items']}
    base={r['variantId']:r for r in read(APP/'data/pump-mountings-reviewed.json')['rows']}
    fast={r['variantId']:r for r in read(APP/'data/pump-fasteners-reviewed.json')['rows']}
    cdm_text=read(OUT/'cdm-text.json')
    measurements={}
    for name in ['outputs/mounting-grids-2026-11-10/pump-cad-measurements.jsonl','outputs/pump-fasteners-2026-11-10/cad-measurements.jsonl']:
        for line in (ROOT/name).read_text().splitlines():
            m=json.loads(line)
            if m.get('bounds') and m.get('verticalAxis')==2: measurements[m['sha256']]=m
    rows=[]
    for a in audit:
        if a['grid'] and a['bore']: continue
        identity=base[a['id']]; p=pumps[a['id']]; f=fast[a['id']]
        row={k:copy.deepcopy(identity[k]) for k in ['variantId','modelId','designation','article','manufacturer','series','motor']}
        e=copy.deepcopy(f.get('evidence') or {}); hardware=copy.deepcopy(f.get('fasteners') or {})
        d=p.get('dimensions') or {}; values={v['key']:v.get('valueMm') for v in d.get('sourceValues',[])}
        family=int(re.search(r'\d+',p['model'])[0]); series=p['series']
        cad=None; foot=None; note=None; span=None; application='reviewed_source'; bounds_scope='conservative_catalogue_envelope'
        if a['grid']:
            # 82 existing CDM grids had null bores although the independently
            # reviewed STEP fastener facts already confirmed them. Keep every
            # existing coordinate/envelope; fill only the absent hardware facts.
            assert series=='CDM' and e['kind']=='step' and hardware.get('holeDiameterMm')
            assert digest(source_path(e['path']))==e['sha256']
            assert e['pitchMm']==[a['gridY'],a['gridX']]
            m=copy.deepcopy(f['mounting']); assert m['holes']==a['holes']
            for h in m['holes']:
                assert h['diameterMm'] is None
                h['diameterMm']=hardware['holeDiameterMm']
            m.update(footThicknessMm=e['source']['footThicknessMm'],clampHeightMm=hardware['clampHeightMm'],boltDiameterMm=hardware['boltDiameterMm'],fastenerSource=f"STEP {Path(e['path']).name}; четыре отверстия и полные опорные кольца проверены")
            row.update(mode='fill_missing_fastener_dimensions',mounting=m,fasteners=hardware,evidence=e,missing=[])
            rows.append(row)
            continue
        if series=='CDM':
            if a['id']=='CNP:CDM:1100119319':
                # Page 59 explicitly allows oval CDM10 through stage 14. The foot
                # grid is shared in the base views; flange Ø18 / M12 callouts
                # are NOT foot bore dimensions.
                assert row['designation']=='CDM10-14YSWPC' and row['motor']['power_kw']==5.5
                px,py=215,130; bounds=sym_bounds(336,336)
                hardware=dict(holeCount=4,holeDiameterMm=None,boltDiameterMm=None,clampHeightMm=None)
                e=dict(kind='manufacturer_catalogue',path=str(CDM_PDF),sha256=digest(CDM_PDF),page=59,
                       scope='CDM10_oval_Y_through_stage_14',tableRow='10-14',motorEnvelopeMm={'D1':260,'D2':168},
                       reason='Shared base grid 215 × 130; oval connection explicitly available up to CDM10-14. Foot bore and clamp height are not dimensioned in the oval view.')
            else:
                pitch=e.get('pitchMm') or e.get('mounting',{}).get('pitchMm')
                assert pitch and len(pitch)==2, a['id']
                py,px=pitch
                sc=e.get('stepCheck') or e.get('source') or e
                measured=measurements.get(sc.get('sha256'))
                if measured:
                    assert digest(source_path(measured['path']))==measured['sha256']
                    raw=e.get('mounting',{}).get('holeCentersXyMm') or sc.get('holeCentersXyMm')
                    assert raw and len(raw)==4, a['id']
                    flow=(min(h[0] for h in raw)+max(h[0] for h in raw))/2
                    transverse=(min(h[1] for h in raw)+max(h[1] for h in raw))/2
                    b=measured['bounds']; z=b[2]
                    assert abs(max(h[0] for h in raw)-min(h[0] for h in raw)-py)<.1
                    assert abs(max(h[1] for h in raw)-min(h[1] for h in raw)-px)<.1
                    bounds=dict(minX=b[1]-transverse,maxX=b[4]-transverse,minY=b[0]-flow,maxY=b[3]-flow)
                    cad=dict(sourceHash=measured['sha256'],anchorMm=[flow,transverse,z],boundsMm=b,pointsMm=[[x,y,z] for x,y in raw])
                    foot=sc.get('footThicknessMm') or e.get('mounting',{}).get('throughWallThicknessMm')
                    bounds_scope='source_step_envelope'
                    e['placementEvidence']=dict(path=measured['path'],sha256=measured['sha256'],boundsMm=b,anchorMm=cad['anchorMm'])
                else:
                    page=e['source']['page']; text=norm(cdm_text[page-1])
                    # Extract the exact table row, including a separate D3 envelope
                    # for the large motors. Do not substitute another stage/power.
                    label=norm(p['model']).removeprefix('CDM')
                    rawtext=cdm_text[page-1].translate(str.maketrans({'А':'A','В':'B','З':'3'}))
                    if family in (185,215):
                        pattern=r'(?<![\d-])'+re.escape(label).replace(r'\-',r'\s*-\s*')+r'\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+|/)'
                        hit=re.search(pattern,rawtext); assert hit,(a['id'],label)
                        power,h1,h2,height,d1,d2,d3=hit.groups(); assert float(power)==p['power'], a['id']
                    else:
                        hit=re.search(r'(?<![\d-])'+re.escape(label)+r'\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)',rawtext)
                        assert hit,(a['id'],label)
                        h1,h2,height,d1,d2=hit.groups(); d3='/'
                    w,l=CDM_ENVELOPE[family]; span=l
                    motor=max(float(d1),2*float(d2),float(d3) if d3!='/' else 0)
                    bounds=sym_bounds(max(w,motor),max(l,motor))
                    e['placementEvidence']=dict(path=str(CDM_PDF),sha256=digest(CDM_PDF),page=page,tableRow=label,
                        envelopeMm=dict(D1=float(d1),D2=float(d2),D3=None if d3=='/' else float(d3)),method='Symmetric conservative envelope of the dimensioned base, flange span, and exact model motor including D3.')
        elif series in ('MV','MVS'):
            assert p.get('inlet',{}).get('connection_type')=='round_flange'
            px,py,w,l=MV[family]
            envelope=e.get('envelopeMm') or values
            span=e.get('portFaceToFaceMm') or d.get('flange_face_to_face')
            assert envelope.get('D1') and envelope.get('D2') and span,a['id']
            if e.get('mountingGridMm'): assert (px,py)==(e['mountingGridMm']['transverse'],e['mountingGridMm']['alongFlow'])
            motor=max(envelope['D1'],2*envelope['D2'])
            bounds=sym_bounds(max(w,motor),max(l,span,motor))
            e['placementEvidence']=dict(D1=envelope['D1'],D2=envelope['D2'],spanMm=span,tableRow=p['model'],
                method='Shared MV/MVS base drawing and motor dimensions of this catalogue row; conservative symmetric motor envelope.')
        elif series=='PV':
            px,py=values['B'],values['A']
            assert px==py and px in (140,164)
            bounds=sym_bounds(2*max(values['L'],values['E']-values['L']),2*max(values['D'],values['C']-values['D']))
            path=ROOT/'database/catalog-v2/documents/onis/official-pv-catalog.pdf'
            hardware=dict(holeCount=4,holeDiameterMm=9.5 if family in (2,4) else None,boltDiameterMm=8 if family in (2,4) else None,clampHeightMm=None)
            e=dict(kind='manufacturer_catalogue',path=str(path),sha256=digest(path),page=9 if family in (2,4) else 10,
                   scope='exact_three_phase_model_table',tableRow=p['model'],symbols={k:values[k] for k in ['A','B','C','D','E','L']},
                   reason='A and B dimension the four base hole axes. PV12-3/4 use 140 × 140; PV12-5…8 use 164 × 164. Page 10 does not specify the foot bore diameter.')
        elif series=='EVR':
            assert a['id']=='AQUASTRONG:EVR:EVR5-36'
            px,py=180,100; span=250; foot=20; bounds=sym_bounds(284,284)
            e['placementEvidence']=dict(D1=210,D2=142,spanMm=250,baseWidthMm=220,method='Exact EVR5-36 factory selector drawing; conservative symmetric envelope.')
        elif series=='CRV':
            if family==32:
                px,py=240,170; span=320; bounds=sym_bounds(334,320)
                path=ROOT/'database/catalog-v2/documents/vandjord/drawings/2f5c172e82e3a52db995.png'
                hardware=dict(holeCount=4,holeDiameterMm=14,boltDiameterMm=12,clampHeightMm=53)
                e=dict(kind='exact_article_drawing',path=str(path),sha256=digest(path),article=row['article'],
                    scope='variant_drawing',placementEvidence=dict(D1=200,D2=146,baseWidthMm=334,spanMm=320),
                    reason='Exact 74121730 drawing has a 53 mm clamping dimension; the 30 mm generic CRV32 base is not used.')
            else:
                assert family==200 and row['article'] in ('74127003','74127007','74127013','74127017')
                px,py=500,385; motor=max(values['D1'],2*values['D2']); bounds=sym_bounds(max(600,motor),max(490,motor)); span=490
                hardware.update(holeCount=4,holeDiameterMm=20)
                application='owner_accepted_unconfirmed_execution'
                note='Сетка 500×385 мм принята пользователем 15.11.2026. В базе PN16, на исходном чертеже PN25–40; заводское исполнение не подтверждено.'
                e.update(scope='owner_accepted_catalogue_crv200_grid',ownerDecision=note)
                e['placementEvidence']=dict(D1=values['D1'],D2=values['D2'],baseWidthMm=600,spanMm=490,scope='catalogue_model_reference')
        else: raise ValueError(a['id'])
        assert digest(source_path(e['path']))==e['sha256'],a['id']
        source=f"{row['designation']}: {Path(e['path']).name}"+(f" · стр. {e['page']}" if e.get('page') else '')+(f". {note}" if note else '')
        holes=[dict(id=f'p{i}',owner='pump',x=x,y=y,diameterMm=hardware.get('holeDiameterMm')) for i,(x,y) in enumerate([(-px/2,-py/2),(-px/2,py/2),(px/2,-py/2),(px/2,py/2)])]
        if cad:
            # Keep the measured ordering; CAD and frame points must correspond.
            holes=[dict(id=f'p{i}',owner='pump',x=round(y-cad['anchorMm'][1],4),y=round(x-cad['anchorMm'][0],4),diameterMm=hardware.get('holeDiameterMm')) for i,(x,y,z) in enumerate(cad['pointsMm'])]
        mounting=dict(verified=True,scope='catalogue_layout',source=source,holes=holes,bounds=bounds,boundsScope=bounds_scope,
            gridMm={'transverse':px,'alongFlow':py},coordinateSystem='x: поперёк потока (ряд насосов); y: вдоль потока; начало в центре монтажной сетки',
            footThicknessMm=foot,clampHeightMm=hardware.get('clampHeightMm'),boltDiameterMm=hardware.get('boltDiameterMm'),fastenerSource=source,
            application=application)
        if cad: mounting['cad']=cad
        if note: mounting['note']=note
        if span: mounting['flangeFaceToFaceMm']=span
        row.update(mounting=mounting,fasteners=hardware,evidence=e,missing=[msg for key,msg in [('holeDiameterMm','Нет подтверждённого диаметра отверстия в лапе'),('boltDiameterMm','Нет подтверждённого диаметра крепёжного болта'),('clampHeightMm','Нет полной монтажной высоты для выбора длины болта')] if not hardware.get(key)])
        rows.append(row)
    assert len(rows)==975
    target=APP/'data/vertical-pump-mountings-reviewed.json'
    target.write_text(json.dumps(dict(schema=1,version='vertical-pump-mountings-2026-11-15-v2',rows=rows),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(rows=len(rows),cad=sum(bool(r['mounting'].get('cad')) for r in rows),unknownBore=sum(not r['fasteners'].get('holeDiameterMm') for r in rows)),ensure_ascii=False))

if __name__=='__main__': main()
