"""Publish reviewed installation facts, bound to each complete catalogue execution.

No analogue dimensions, pressure-class guesses, or assembly approvals are created.
Run after work/vertical-installation/audit.mjs. Source DB is read-only.
"""
import copy
import hashlib
import json
import re
import sqlite3
from functools import lru_cache
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[2]
DB = ROOT / 'database/catalog-v2/pumps.sqlite'
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
audited = read(APP/'work/vertical-installation/audit.json')
identities = {r['variantId']:r for r in read(APP/'data/pump-fasteners-reviewed.json')['rows']}
c = sqlite3.connect(DB.as_uri()+'?mode=ro', uri=True)
c.row_factory = sqlite3.Row

@lru_cache(None)
def evidence(path, page=None):
    p = ROOT/path
    return dict(path=path, sha256=hashlib.sha256(p.read_bytes()).hexdigest(), **({'page':page} if page else {}))

CDM = 'Equipment/Pumps/CDM_CDMF_220626.pdf'
CRV = 'database/catalog-v2/documents/vandjord/vandjord-crv.pdf'
CN = 'database/catalog-v2/documents/vandjord/vandjord-crv-cn.pdf'
OLD = 'database/catalog-v2/documents/vandjord/vandjord-crv-old.pdf'
PV = 'database/catalog-v2/documents/onis/official-pv-catalog.pdf'
MV = 'database/catalog-v2/documents/onis/official-mv-catalog.pdf'
EVR = 'database/catalog-v2/documents/evr-evs-44p.pdf'
# Manufacturer drawing: face span, port-axis height, PDF page (1-based).
cdm = {1:(250,75,56),3:(250,75,57),5:(250,75,58),10:(280,80,59),15:(300,90,60),20:(300,90,61),32:(320,105,62),42:(365,140,63),65:(365,140,64),85:(380,140,65),95:(380,140,66),120:(380,180,67),125:(485,180,68),150:(380,180,69),155:(485,180,70),185:(615,200,71),200:(490,200,72),215:(615,200,73)}
crv = {1:(250,75,20),3:(250,75,22),5:(250,75,24),10:(280,80,26),15:(300,90,28),20:(300,90,30),32:(320,105,32),45:(365,140,34),64:(365,140,36),90:(380,140,38),120:(380,180,40),150:(380,180,42),200:(490,200,46)}
# Current C/CN drawings have different bearing heights from old B/N bases.
# Keep the independently reviewed exact 74121730 drawing (53 mm).
c_clamp = {1:30,3:30,5:30,10:25,15:34,20:34,32:51,45:63,64:62,90:63}
cn_clamp = {1:43,3:43,5:43,10:42,15:49,20:49,32:33,45:50,64:50,90:50}
c_width = {1:210,3:210,5:210,10:284,15:284,20:284,32:334,45:366,64:366,90:384}
cn_width = {1:235,3:235,5:235,10:279,15:279,20:279,32:296,45:330,64:330,90:348}
cad = {}
for raw in c.execute('SELECT model_id,profile_json FROM cad_bindings'):
    profile = json.loads(raw['profile_json'] or '{}')
    sha = profile.get('sourceHash') or profile.get('outputSha256')
    if sha: cad[(str(raw['model_id']),sha)] = profile

rows = []
for a in audited:
    ident = identities[a['id']]
    row = {k:copy.deepcopy(ident[k]) for k in ('variantId','modelId','designation','article','manufacturer','series','motor')}
    family = int(re.search(r'\d+',a['model'])[0])
    series = a['series']; m = a['mounting']; dim = {}; patch = {}; notes = []; sources = []
    span, height = a['span'], a['axisHeight']
    if series == 'CDM':
        s,h,page = cdm[family]; src = evidence(CDM,page); sources.append(src)
        if a['ports'][0]['connection_type'] == 'oval_flange':
            h = 80 if family == 10 else 50
            # Exact reviewed STEP includes the detachable oval mating pieces.
            # The catalogue's bare-connection dimension is preserved separately.
            p = cad.get((a['modelId'],m.get('cad',{}).get('sourceHash')), {})
            other = p.get('outletNormalizedMm') or p.get('normalizedOtherPort',{}).get('pointMm')
            if not other:
                other = next((v['point'] for v in p.get('ports',[]) if v.get('id')=='outlet'),None)
            s = round(other[0],3) if other else (200 if family == 10 else 162)
            dim['bare_connection_span_mm'] = 200 if family == 10 else 162
            if other: notes.append('Межприсоединительный размер со съёмными ответными деталями взят из связанного STEP; размер корпуса сохранён отдельно.')
            else: notes.append('Межприсоединительный размер по чертежу корпуса; съёмные ответные детали не включены.')
        span = span or s; height = height or h
    elif series == 'CRV':
        s,h,page = crv[family]
        suffix = re.match(r'CRV\s*\d+-[^ ]*?([A-Z]+)(?:\s|$)',a['execution'])[1]
        path = CN if suffix=='CN' else CRV if suffix=='C' else OLD
        if suffix=='CN':page -= 1
        if suffix in ('B','N'): page = {1:18,3:22 if suffix=='N' else 20,5:26 if suffix=='N' else 24,10:28,15:30,20:32,32:34,45:36,64:38,90:40,120:42,150:44,200:46}[family]
        sources.append(evidence(path,page)); span=span or s; height=height or h
        if suffix in ('C','CN') and a['article']!='74121730':
            patch['clampHeightMm'] = (cn_clamp if suffix=='CN' else c_clamp)[family]
            if suffix=='CN' and family in (10,15,20):patch['holeDiameterMm']=13.5
        if suffix in ('C','CN'):patch['minimumBaseWidthMm']=(cn_width if suffix=='CN' else c_width)[family]
    elif series in ('MV','MVS'):
        sources.append(a['evidence']);height=height or {120:180,150:180,200:200}.get(family)
    elif series == 'EVR':
        sources.append(a['evidence']);height=height or {1:75,2:75,3:75,4:75,5:75,10:80,15:90,20:90,32:105,45:140,64:140,90:140,120:180,150:180,200:200}[family]
    elif series=='PV':
        sources.extend([evidence(PV,4),evidence(PV,9 if family in (2,4) else 10)])
    if span: dim['flange_face_to_face']=span
    if height: dim['flange_center_height']=height
    # Owner accepted provisional same-family dimensions on 2026-11-16.
    if a['id']=='CNP:CDM:1100119319':
        analogue=next(v for v in audited if v['execution']=='CDM10-13YSWPC')
        patch.update(holeDiameterMm=14,boltDiameterMm=12,clampHeightMm=30,footThicknessMm=7,
                     assumption='Расчётное допущение: отверстия Ø14, болты M12, зажим 30 мм и толщина лапы 7 мм по CDM10-13YSWPC с той же сеткой 215×130 мм.',
                     analogueVariantId=analogue['id'],ownerAccepted=True)
        sources.append(analogue['evidence'])
    if series=='PV':
        patch.update(clampHeightMm=10,footThicknessMm=10,ownerAccepted=True,
            assumption='Расчётное допущение: для основания PV принята толщина зажима 10 мм по общей схеме серии; размер не нанесён на чертеже. Для PV8/12 отверстия Ø9,5 и болты M8 приняты по PV2/4.')
        if family in (8,12):patch.update(holeDiameterMm=9.5,boltDiameterMm=8,analogueVariantId='ONIS:PV:114006')
    if m.get('boltDiameterMm') is None and all(h.get('diameterMm')==20 for h in m['holes']):
        patch.update(boltDiameterMm=18,boltSelectionNote='Геометрический подбор M18 для проходного отверстия Ø20 мм: диаметральный зазор 2 мм; класс прочности этим правилом не задаётся.')
    ports = {}
    pressure = c.execute('SELECT * FROM variant_pressure_limits WHERE variant_id=?',(a['id'],)).fetchone()
    for port in a['ports']:
        side=port['side']; out={}
        pn_options=sorted({r[0] for r in c.execute('SELECT pn_bar FROM port_pn_options WHERE variant_id=? AND side=?',(a['id'],side))})
        if series=='CDM' and not port['pn_nominal_bar']:
            # Main flange shown in the family drawing; alternatives marked
            # "available on request" are not silently substituted.
            pn_options=[25,40]
        dn_options=sorted({r[0] for r in c.execute('SELECT dn FROM port_dn_options WHERE variant_id=? AND side=?',(a['id'],side))})
        if pn_options:out['pn_options_bar']=pn_options
        if not port['pn_nominal_bar']:
            out['pn_status']='catalogue_options' if pn_options else 'not_published'
            out['pn_note']='В каталоге несколько исполнений; PN конкретного артикула не определён.' if pn_options else 'Номинальный класс фланца отдельно не опубликован.'
            if pn_options:
                out.update(pn_nominal_bar=min(pn_options),pn_designation='PN '+str(int(min(pn_options))),pn_status='owner_accepted_minimum',
                           pn_note='Принято исполнение PN '+str(int(min(pn_options)))+' — минимальный PN из каталога; согласовано пользователем 16.11.2026. Заказное исполнение отдельно не подтверждено.')
        if pressure and pressure['max_working_pressure_bar']:
            out['max_working_pressure_bar']=pressure['max_working_pressure_bar']
            out['working_pressure_source_id']=pressure['source_id']
        if not port['dn']:
            if series in ('PV','CDM'):
                thread=port['thread_designation']; out['dn']={'G1':25,'G1¼':32,'G1½':40,'G1 1/4':32,'G1 1/2':40}[thread.replace('"','').strip()]
                out['dn_basis']='Номинальный DN резьбы ответного присоединения' if series=='CDM' else 'Номинальный DN трубной резьбы'
            elif series=='CRV' and suffix=='C':
                out['dn']=32;out['dn_basis']='Чертёж мультифланца CRV-C: PN25/DN32'
            elif dn_options:out['dn_options']=dn_options;out['dn_note']='Мультифланец DN25/DN32; размер ответного присоединения выбирается в проекте.'
        if series in ('MV','MVS'):out['connection_standard']='DIN'
        if series=='PV':
            values={v['key']:v.get('valueMm') for v in a['dimensions']['sourceValues']}
            out.update(axis_height_mm=values['H'] if side=='inlet' else values['H1'],layout='same_side_different_heights',pn_status='not_applicable',pn_note='Резьбовое присоединение; ограничение задаётся рабочим давлением, а не PN фланца.')
        else:
            out.update(axis_height_mm=height,face_to_face_mm=span,layout='inline_opposed')
        if series=='CDM' and port['connection_type']=='oval_flange':
            out.update(bolt_count=2,bolt_axis_spacing_mm=100 if family==10 else 75,fastener_thread='M12' if family==10 else 'M10')
        out['installation_source']='; '.join(f"{Path(s['path']).name}"+(f", стр. {s['page']}" if s.get('page') else '') for s in sources)
        if notes:out['installation_note']=' '.join(notes)
        ports[side]=out
    row.update(ports=ports,dimensions=dim,mounting=patch,evidence=sources)
    rows.append(row)

assert len(rows)==2214 and len({r['variantId'] for r in rows})==2214
result=dict(version='vertical-installation-2026-11-16-v2',sourceDatabaseSha256=hashlib.sha256(DB.read_bytes()).hexdigest(),policy='Complete execution binding; owner accepted minimum published PN and explicitly labelled provisional mounting dimensions; working pressure remains separate from flange PN.',rows=rows)
(APP/'data/vertical-pump-installation-reviewed.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Reviewed installation records:',len(rows))
