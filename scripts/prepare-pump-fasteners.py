"""Build a traceable mounting/fastener supplement; never approve raw OCR output.

Read-only source inventory. Run after inspect-pump-mounting.py. Exact STEP
geometry is preferred only when its execution and bearing plane agree with
the pump/drawing. Conflicting universal STEP files remain audit evidence.
"""
import collections
import copy
import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path('E:/PumpStation_Calculator')
APP = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/pump-fasteners-2026-11-10'
PREVIOUS = ROOT / 'outputs/mounting-grids-2026-11-10'
def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
@lru_cache(maxsize=None)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

# ISO 273 clearance ranges, manufacturer chart; a geometric size selection,
# not a claim that a pump manufacturer specified a particular bolt strength.
CLEARANCE_SOURCE = 'https://www.albanycountyfasteners.com/media/6b/b8/g0/1764944339/clearance-hole-chart.pdf?ts=1764944339'
CLEARANCE = [(5,5.3,5.8),(6,6.4,7),(8,8.4,10),(10,10.5,12),(12,13,14.5),(14,15,16.5),(16,17,18.5),(20,21,24),(24,25,28),(30,31,35)]
def bolt(d):
    if not isinstance(d, (int, float)):
        return None
    matches = [thread for thread,lo,hi in CLEARANCE if lo-.05 <= d <= hi+.05]
    return matches[0] if len(matches)==1 else None

def cad_reference_message(evidence):
    if evidence.get('kind') == 'dwg_mounting_reference':
        return 'Монтажные размеры DWG согласованы только как справочные'
    if evidence.get('kind') == 'factory_drawing_mounting_reference':
        return 'Монтажные размеры заводского чертежа согласованы только как справочные'
    return 'Монтажная геометрия STEP согласована только как справочная для 3D'

# Reviewed dimension callouts (mm): transverse pitch, flow pitch, bore,
# full clamp height, base width, base length. Family diagrams are constant;
# motor envelope is taken separately from each exact execution's table.
CRV = {1:(180,100,13,30,210,150),3:(180,100,13,30,210,150),5:(180,100,13,30,210,150),10:(215,130,14,25,247,199),15:(215,130,14,35,247,199),20:(215,130,14,35,247,199),32:(240,170,14,30,298,225),45:(266,190,14,45,330,245),64:(266,190,14,45,330,245),90:(280,199,14,45,348,255),120:(380,275,18,40,472,340),150:(380,275,18,40,472,340)}
MV = {1:(180,100,14,38,220,150),3:(180,100,14,38,220,150),5:(180,100,14,38,220,150),10:(215,130,14,34,247,200),15:(215,130,14,34,247,200),20:(215,130,14,33,247,200),32:(240,170,14,29,298,235),45:(265,190,14,45,330,250),64:(265,190,14,45,330,250),90:(280,199,14,45,348,261),120:(380,275,18,None,472,340),150:(380,275,18,None,472,340)}

def family_grid(row,pump):
    s=row['series']; table=CRV if s=='CRV' else MV if s in ('MV','MVS') else {}
    match=re.match(r'^(?:CRV|MVS?)\s*(\d+)-',row['designation'])
    if not match or int(match[1]) not in table: return None
    family=int(match[1]); index=crv_index if s=='CRV' else mv_index
    drawing=index[family]['drawing']; dimensions=pump.get('dimensions') or {}
    # These reviewed MV callouts are for round flanges, not oval/threaded bases.
    if s in ('MV','MVS') and (pump.get('inlet') or {}).get('connection_type')!='round_flange': return None
    px,py,d,h,w,l=table[family]
    values={v.get('key'):v.get('valueMm') for v in dimensions.get('sourceValues',[])}
    widths=[w];lengths=[l]
    for value in [values.get('D1'),2*values['D2'] if values.get('D2') else None]:
        if isinstance(value,(int,float)) and value>0: widths.append(value);lengths.append(value)
    face=dimensions.get('flange_face_to_face')
    if s=='CRV' and face is None: face={1:250,3:250,5:250,10:280,15:300,20:300,32:320,45:365,64:365,90:380,120:380,150:380}[family]
    if isinstance(face,(int,float)) and face>0: lengths.append(face)
    # Without a verified motor envelope publish the bolt facts only, not a
    # complete placement envelope assembled from an unrelated motor.
    envelope_known=s=='CRV' and values.get('D1') is not None and values.get('D2') is not None and face is not None
    path=ROOT/('work/collector-spacing-research/vandjord-crv.pdf' if s=='CRV' else 'database/catalog-v2/documents/onis/official-mv-catalog.pdf')
    source=f"{s} {family}: общий размерный чертёж основания; таблица исполнения {row['designation']}"
    evidence={'kind':'catalogue','path':str(path),'sha256':digest(path),'page':drawing.get('page'),'drawing':drawing,'scope':'family_base_with_execution_motor_envelope'}
    mounting={'verified':True,'source':source,'holes':[{'id':f'p{i}','owner':'pump','x':x,'y':y,'diameterMm':d} for i,(x,y) in enumerate(((-px/2,-py/2),(-px/2,py/2),(px/2,-py/2),(px/2,py/2)))],'bounds':{'minX':-max(widths)/2,'maxX':max(widths)/2,'minY':-max(lengths)/2,'maxY':max(lengths)/2},'footThicknessMm':None,'clampHeightMm':h,'boltDiameterMm':bolt(d),'fastenerSource':source+'; диаметр болта подобран по проходному отверстию'}
    return {'mounting':mounting if envelope_known else None,'fasteners':{'holeCount':4,'holeDiameterMm':d,'boltDiameterMm':bolt(d),'clampHeightMm':h},'evidence':evidence}

def horizontal_facts(row,pump):
    match=re.match(r'([A-Z]+)\s*(\d+)',row['designation'])
    if not match: return None
    key=(row['series'],match[2]);review=horizontal.get(key)
    if not review or row['series']=='MH': return None # No bore size on the reviewed MH sheets.
    s=row['series']; values={v['key']:v.get('valueMm') for v in (pump.get('dimensions')or{}).get('sourceValues',[])}
    d=11 if s in ('CMI','VCM') else 8.5 if s=='CUC' and int(match[2]) in (2,4) else 9
    if s=='CHLF' and int(match[2]) in (15,20):
        d=values.get('d')
        if not d: return None
    path=Path(review['path']); source=f"{s} {match[2]}: монтажные отверстия на размерном листе"
    evidence={'kind':'technical_sheet','path':str(path),'sha256':digest(path),'drawing':review['row']['drawings'][0],'scope':'family_base_dimensions'}
    result={'mounting':None,'fasteners':{'holeCount':4,'holeDiameterMm':d,'boltDiameterMm':bolt(d),'clampHeightMm':None},'evidence':evidence}
    # CHLF's STEP files omit the material suffix. Use them for the base only
    # after matching all four holes against the catalogue's actual pitches.
    if s=='CHLF':
        px=values.get('M') if int(match[2]) in (15,20) else 108
        py=values.get('J') if int(match[2]) in (15,20) else 138
        if not px or not py: return result
        for binding in by_model[row['modelId']]:
            bare=re.match(r'CHLF\d+-\d+',row['designation'])
            if not bare or binding.get('exact_designation')!=bare[0]: continue
            for mid in binding['measurementIds']:
                m=measurements.get(mid)
                if not m or m['verticalAxis']!=2: continue
                holes=m.get('holes',[])+m.get('raisedBoreCandidates',[])
                if len(holes)!=4 or any(abs(h['diameterMm']-d)>.1 for h in holes): continue
                xs={round(h['center'][1],2) for h in holes};ys={round(h['center'][0],2) for h in holes}
                if len(xs)!=2 or len(ys)!=2 or abs(max(xs)-min(xs)-px)>1 or abs(max(ys)-min(ys)-py)>1: continue
                heights=[h['footThicknessMm']+h.get('bearingOffsetMm',0) for h in holes]
                if max(heights)-min(heights)>1 or min(heights)<=0: continue
                result['fasteners']['clampHeightMm']=max(heights)
                result['evidence']={'kind':'step','path':m['path'],'sha256':m['sha256'],'bindingId':binding['id'],'scope':'base_only_grid_and_bore_crosschecked_with_catalogue','catalogue':evidence}
                return result
    return result

def cad_candidate(row,pump,reference):
    results=[]; rejected=[]
    for binding in by_model[row['modelId']]:
        exact=re.sub(r'\s+','',binding.get('exact_designation') or '').casefold()==re.sub(r'\s+','',row['designation']).casefold()
        # A family reference is insufficient to approve the actual execution.
        if not exact: continue
        for mid in binding['measurementIds']:
            m=measurements.get(mid)
            if not m or m.get('verticalAxis')!=2 or not any(t in m['path'] for t in ('3D_Normalized','3D_ONIS_Normalized','3D_FlowVerified')): continue
            holes=m.get('holes',[])+m.get('raisedBoreCandidates',[])
            if len(holes)!=4 or len({round(h['diameterMm'],1) for h in holes})!=1: continue
            # Normalized STEP has inlet origin and Z up. Check the support
            # level against the independently stored port-axis height.
            height=(pump.get('dimensions') or {}).get('flange_center_height')
            if not height or abs(m['floor']+height)>2: continue
            xs=sorted({round(h['center'][1],1) for h in holes});ys=sorted({round(h['center'][0],1) for h in holes})
            if len(xs)!=2 or len(ys)!=2 or xs[1]-xs[0]<20 or ys[1]-ys[0]<20: continue
            if len({(round(h['center'][1],1),round(h['center'][0],1)) for h in holes})!=4: continue
            d=holes[0]['diameterMm'];clamps=[h['footThicknessMm']+h.get('bearingOffsetMm',0) for h in holes]
            if max(clamps)-min(clamps)>1 or not bolt(d): continue
            if reference:
                rh=reference['holes']; rx=max(h['x'] for h in rh)-min(h['x'] for h in rh);ry=max(h['y'] for h in rh)-min(h['y'] for h in rh)
                if abs(xs[1]-xs[0]-rx)>1 or abs(ys[1]-ys[0]-ry)>1 or any(h['diameterMm'] is not None and abs(h['diameterMm']-d)>1 for h in rh):
                    rejected.append({'bindingId':binding['id'],'reason':'STEP и размерный лист расходятся по отверстиям','diameterMm':d});continue
            cx=sum(xs)/2;cy=sum(ys)/2;b=m['bounds'];source=f"STEP {Path(m['path']).name}; отверстия и опорная плоскость проверены"
            mounting={'verified':True,'source':source,'holes':[{'id':f'p{i}','owner':'pump','x':round(h['center'][1]-cx,4),'y':round(h['center'][0]-cy,4),'diameterMm':d} for i,h in enumerate(holes)],'bounds':{'minX':b[1]-cx,'maxX':b[4]-cx,'minY':b[0]-cy,'maxY':b[3]-cy},'footThicknessMm':holes[0]['footThicknessMm'],'clampHeightMm':round(max(clamps),3),'boltDiameterMm':bolt(d),'fastenerSource':source+'; диаметр болта подобран по проходному отверстию'}
            results.append({'mounting':mounting,'fasteners':{'holeCount':4,'holeDiameterMm':d,'boltDiameterMm':bolt(d),'clampHeightMm':mounting['clampHeightMm']},'evidence':{'kind':'step','path':m['path'],'sha256':m['sha256'],'bindingId':binding['id'],'scope':'exact_designation_mounting_only'}})
    signatures={json.dumps(r['fasteners'],sort_keys=True) for r in results}
    if len(signatures)>1: return None,rejected+[{'reason':'Несколько точных STEP дают разные размеры крепления'}]
    return (results[0] if results else None),rejected

if __name__=='__main__':
    base=read(APP/'data/pump-mountings-reviewed.json'); snapshot={r['variantId']:r['pump'] for r in read(PREVIOUS/'snapshot-before.json')['items']}
    crv_index={r['family']:r for r in read(OUT/'crv-contact-index.json')};mv_index={r['family']:r for r in read(OUT/'onis-contact-index.json')}
    horizontal={tuple(r['family']):r for r in read(OUT/'horizontal-review.json')}
    measurements={}
    for path in [PREVIOUS/'pump-cad-measurements.jsonl',OUT/'cad-measurements.jsonl']:
        for line in path.read_text(encoding='utf-8').splitlines():
            m=json.loads(line)
            if not m.get('error'): measurements[m['id']]=m
    by_model=collections.defaultdict(list)
    for binding in read(OUT/'cad-bindings.json'): by_model[binding['model_id']].append(binding)
    reviews=read(APP/'data/pump-fastener-dimension-reviews.json')
    exact_reviews={r['variantId']:r for r in reviews['rows']}
    rows=[]
    for r in base['rows']:
        pump=snapshot.get(r['variantId'],{}); result=family_grid(r,pump) or horizontal_facts(r,pump)
        if r.get('mounting') and r['status']=='catalogue_grid':
            m=copy.deepcopy(r['mounting']);d=m['holes'][0]['diameterMm']
            m['boltDiameterMm']=bolt(d);m['clampHeightMm']=m.get('footThicknessMm')
            if m['boltDiameterMm']:
                m['fastenerSource']=m['source']+'; диаметр болта подобран по проходному отверстию'
            result={'mounting':m,'fasteners':{'holeCount':len(m['holes']),'holeDiameterMm':d,'boltDiameterMm':bolt(d),'clampHeightMm':m['clampHeightMm']},'evidence':{'kind':'catalogue',**r['evidence']}}
        cad,rejected=cad_candidate(r,pump,(result or {}).get('mounting'))
        if cad: result=cad
        row={k:copy.deepcopy(r[k]) for k in ('variantId','modelId','designation','article','manufacturer','series','motor')}
        review=exact_reviews.get(r['variantId'])
        if review and not all(review[k]==value for k,value in row.items()):
            review=None
        if review:
            path=ROOT/review['evidence']['path']
            if digest(path)!=review['evidence']['sha256']:
                raise ValueError(f"Reviewed source changed: {path}")
            result={k:copy.deepcopy(review[k]) for k in ('mounting','fasteners','evidence')}
        row.update({'status':'missing','missing':['Нет проверенных размеров монтажных отверстий'], 'cadBindingsChecked':len(by_model[r['modelId']]),'conflicts':rejected})
        if result:
            row.update(result);f=result['fasteners']
            row['status']='dimensions_ready' if f.get('boltDiameterMm') and f.get('clampHeightMm') else 'diameter_only' if f.get('boltDiameterMm') else 'height_only' if f.get('clampHeightMm') else 'missing'
            row['missing']=[message for key,message in [('boltDiameterMm','Нет подтверждённого диаметра крепёжного болта'),('clampHeightMm','Нет полной монтажной высоты для выбора длины болта')] if not f.get(key)]
            if review and review.get('mode')=='cad_reference_only':
                row['mode']='cad_reference_only'
                row['missing'].append(cad_reference_message(review['evidence']))
            elif review and not row.get('mounting') and r['status']!='catalogue_grid':
                row['missing'].append('Применимость монтажной сетки на раме 410 мм не проверена')
        rows.append(row)
    result={'schema':1,'version':reviews.get('version','pump-fasteners-2026-11-11-v2'),'sourcePriority':['explicit_review','exact_step','technical_sheet','catalogue'],'clearanceSource':CLEARANCE_SOURCE,'rows':rows}
    write(APP/'data/pump-fasteners-reviewed.json',result)
    counts=collections.Counter(r['status'] for r in rows);print(json.dumps(counts))
    write(OUT/'fastener-audit.json',{'counts':counts,'cadMeasurements':len(measurements),'series':{s:dict(collections.Counter(r['status'] for r in rows if r['series']==s)) for s in sorted({r['series'] for r in rows})},'rows':rows})
