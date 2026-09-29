"""Rebuild reviewed CNP physical facts from local official PDFs / selector export.

Requires pypdf. WQ OCR is produced by database/ocr_cnp_pages.ps1 at 2200px.
Only exact model/execution matches are accepted; catalogue generations are never
interchanged. Source snapshots and their hashes are retained in the output.
"""
import hashlib
import json
from pathlib import Path
import re
from collections import defaultdict, Counter
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / 'frontend'
TD = ROOT / 'database/cnp_catalog_sources/TD_LLT_TDi_10082026.pdf'
NIS = ROOT / 'database/cnp_catalog_sources/NIS_NISO_20062025.pdf'
WQ = ROOT / 'reference-calculator-nu/CNP/catalogue_WQ_120224.pdf'
SELECTOR = ROOT / 'database/cnp_export/model_drawing_candidates.json'
CDM_SELECTOR = ROOT / 'reference-calculator-nu/data/prototype/eventech_cdm_catalog.json'
CDM_PDF = ROOT / 'Equipment/Pumps/CDM_CDMF_220626.pdf'
SHP = ROOT / 'database/cnp_catalog_sources/SHP_021124.pdf'
URLS = {
    'shp': 'https://www.cnprussia.ru/upload/iblock/ee5/ht6mb8aij1hrcdtw39avgw91z5gzd8tp/SHP_021124.pdf',
    'td': 'https://www.cnprussia.ru/upload/iblock/936/zz6g5mxeoyb43v06ma3jvd1mo7jp47wt/TD_LLT_TD%28i%29_10082026.pdf',
    'nis': 'https://www.cnprussia.ru/upload/iblock/cdc/0wwwdmq46grsmtcf5es1v3l2pqbi61l5/NIS_NISO_20062025.pdf',
    'wq': 'https://www.cnprussia.ru/catalog/cnp/stochno-massnye-i-drenazhnye-nasosy-cnp/wq/',
}

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def key(model):
    return re.sub(r'\s+', '', model).upper().replace(',', '.').replace('–', '-').replace('−', '-')

def number(value):
    try:
        result = float(str(value).replace(',', '.'))
        return result if result > 0 else None
    except (ValueError, TypeError):
        return None

def pages(path):
    cache = ROOT / 'tmp/pdfs' / (path.stem + '.text.json')
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps([p.extract_text() for p in PdfReader(path).pages], ensure_ascii=False), encoding='utf-8')
    return read(cache)

def source(kind, page=None, **extra):
    result = {'source': kind, **extra}
    if page:
        result['page'] = page
    return result

def td_weights():
    result = defaultdict(list)
    # 20..57 are standard TD. Later pages describe distinct TD(I) executions.
    for i, text in enumerate(pages(TD)[19:57], 20):
        # Hidden spread text is repeated in this PDF; identical rows are deduped.
        for line in text.splitlines():
            row = re.match(r'\s*(TD\s*\d+\s*-\s*[\d,.]+[A-Z0-9]*\s*/\s*[24])\s+([\d,.\s]+)$', line)
            if not row:
                continue
            values = row[2].split()
            # Dimension columns D,B1..B5,H1..H3,L1,L2 + mass, never Q/H rows.
            if len(values) == 12 and all(number(v) for v in values) and number(values[0]) >= 100:
                fact = {'weightKg': number(values[-1]), 'evidence': source('td', i, row=line.strip())}
                result[key(row[1])].append(fact)
    return result

def ocr_key(text):
    # OCR glyph corrections, not pump aliases. All suffixes are preserved.
    text = key(text).replace('WQQ', 'WQ').replace('W0', 'WQ').replace('WO', 'WQ')
    text = text.replace('<1)', '(I)')
    if '(' not in text and text.endswith('0)'):
        text = text[:-2] + '(I)'
    text = re.sub(r'\(([IL1]+)\)$', lambda m: '(' + 'I'*len(m[1]) + ')', text)
    main, sep, suffix = text.partition('(')
    main = main.replace('O', '0').replace('I', '1').replace('L', '1')
    return main + sep + suffix

def wq_rows():
    result = []
    for page in [16,17,18,19,20,32,33,38,41,46,48]:
        words = read(ROOT / f'tmp/pdfs/cnp/wq{page}.png.ocr.json')
        # Column positions verified against rendered catalogue pages (1622x2200).
        mass_bounds = (957, 1039) if page == 20 else (983, 1067) if page == 46 else (928, 1000)
        dn_bounds = (362, 444) if page == 20 else (355, 444) if page == 46 else (398, 460)
        starts = [w for w in words if w['x'] < 390 and w['y'] > 330 and re.search(r'W[QO0]', w['text'], re.I)]
        for first in starts:
            row = sorted([w for w in words if abs((w['y']+w['height']/2)-(first['y']+first['height']/2)) < 9], key=lambda w:w['x'])
            cell = lambda lo, hi: ''.join(w['text'] for w in row if lo <= w['x']+w['width']/2 < hi)
            model = cell(0, dn_bounds[0])
            mass = number(cell(*mass_bounds))
            dn = number(cell(*dn_bounds))
            if mass and dn and re.match(r'\d+W', ocr_key(model), re.I):
                result.append({'model': ocr_key(model), 'weightKg': mass, 'outletDn': dn,
                               'evidence': source('wq', page, row=' '.join(w['text'] for w in row))})
    return result

def main():
    pumps = [p for p in read(FRONTEND / 'public/pumps.json') if p['manufacturer'] == 'CNP']
    drawings = {key(r['pumpName']): r for r in read(SELECTOR)}
    cdm = {key(r['model']): r for r in read(CDM_SELECTOR)['models']}
    td = td_weights()
    wq = wq_rows()
    reviewed = read(FRONTEND / 'data/pump-catalog/cnp-physical-reviewed.json')
    nis = {}
    for page, model, weights in reviewed['nis']:
        for power, kg in weights.items():
            name = f'NIS{model}/{power}'
            assert name not in nis
            nis[name] = {'weightKg':kg, 'evidence':source('nis',page,model=name,method='visual verification')}
    for model, kg, page in reviewed['td']:
        td[key(model)] = [{'weightKg':kg, 'evidence':source('td',page,model=model,method='visual verification')}]
    for model, kg, dn, page in reviewed['wq']:
        wq.insert(0, {'model':model, 'weightKg':kg, 'outletDn':dn, 'evidence':source('wq',page,model=model,method='visual verification')})
    for model, kg, dn, page in reviewed['shp']:
        wq.insert(0, {'model':model, 'weightKg':kg, 'outletDn':dn, 'evidence':source('shp',page,model=model,method='dimension table: pump mass, excludes separate coupling mass')})
    output = {}
    for p in pumps:
        facts, provenance = {}, {}
        def put(field, value, evidence):
            if value is not None:
                facts[field] = value
                provenance[field] = evidence
        model = key(p['model'])
        if p['series'] == 'CDM' and model in cdm:
            record = cdm[model]
            variants = [v for v in record['variants'] if v['designation'] == p['execution']] if p.get('execution') else [v for v in record['variants'] if re.match(r'CDM\d',v['designation'])]
            # These catalogue rows explicitly exist ONLY as CDMF (pp.68,70).
            cdmf_only = {'CDM125-6','CDM125-7','CDM125-8','CDM125-9-2','CDM125-9','CDM125-10','CDM155-5-2','CDM155-5','CDM155-6','CDM155-7','CDM155-8-2'}
            if not variants and not p.get('execution') and model in cdmf_only:
                variants = record['variants']
                put('physicalNote', 'Этот типоразмер выпускается только в исполнении CDMF. Масса и патрубки указаны для CDMF из программы CNP.', source('cdm',68 if model.startswith('CDM125') else 70))
            if variants:
                evidence = source('cdm-selector', model=record['model'], variants=[{'execution':v['designation'],'article':v.get('manufacturer_number')} for v in variants])
                weights = {v.get('weight_kg') for v in variants}
                if len(weights) == 1 and number(next(iter(weights))):
                    put('weightKg', next(iter(weights)), evidence)
                elif all(number(v.get('weight_kg')) for v in variants):
                    put('weightVariants', [{'execution':v['designation'], 'kg':v['weight_kg']} for v in variants], evidence)
                connections = sorted({v['connection_designation'] for v in variants if v.get('connection_designation')})
                if connections and all(v.get('connection_designation') for v in variants):
                    for side in ['inlet','outlet']:
                        if len(connections) == 1 and re.fullmatch(r'DN\s*\d+', connections[0]):
                            put(side+'Dn', int(re.search(r'\d+',connections[0])[0]), evidence)
                        else:
                            put(side+'Connection', '; '.join(connections) + (' (зависит от исполнения)' if len(connections)>1 else ''), evidence)
        elif p['series'] == 'CHLF' and model in drawings:
            record = drawings[model]
            variants = []
            for part in record['parts']:
                if p.get('execution') and p['execution'] != part['PartCode']:
                    continue
                paras = dict(pair.split(':',1) for pair in part['PartPropParas'].split('|') if ':' in pair)
                variants.append({'execution': part['PartCode'], 'weightKg': number(paras.get('11')),
                                 'inletConnection': paras.get('29'), 'outletConnection': paras.get('30')})
            for field in ['weightKg', 'inletConnection', 'outletConnection']:
                values = {v[field] for v in variants}
                if len(values) == 1 and None not in values:
                    put(field, values.pop(), source('selector', pumpId=record['pumpId'], variants=[v['execution'] for v in variants], parameter={'weightKg':'11','inletConnection':'29','outletConnection':'30'}[field]))
        elif p['series'] == 'TD':
            match = re.fullmatch(r'TD(\d+)-[\d.]+[A-Z0-9]*/[24]', model)
            if match:
                for field in ['inletDn','outletDn']:
                    put(field, int(match[1]), source('td', 5, note='Номинальный диаметр патрубков в маркировке, позиция 3'))
            matches = td.get(model, [])
            if matches and len({r['weightKg'] for r in matches}) == 1:
                put('weightKg', matches[0]['weightKg'], matches[0]['evidence'])
        elif p['series'] == 'NIS':
            match = re.fullmatch(r'NIS(\d+)-(\d+)-\d+(?:G|\(Q\))?/[\d.]+',model)
            if match:
                put('inletDn', int(match[1]), source('nis',5,note='Диаметр всасывающего патрубка в маркировке, позиция 3'))
                put('outletDn', int(match[2]), source('nis',5,note='Диаметр напорного патрубка в маркировке, позиция 4'))
            if model in nis:
                put('weightKg', nis[model]['weightKg'], nis[model]['evidence'])
        elif p['series'] == 'WQ':
            for row in wq:
                candidate = row['model']
                pole_match = re.search(r'-([468])\(I\)$', candidate)
                if pole_match and p.get('electric',{}).get('Число полюсов') == int(pole_match[1]):
                    candidate = re.sub(r'-[468]\(I\)$', '(I)', candidate)
                if candidate == model:
                    for field in ['weightKg','outletDn']:
                        put(field, row[field], row['evidence'])
                    break
        if facts:
            output[p['id']] = {'model': p['model'], **facts, 'provenance': provenance}
            if p.get('execution'):
                output[p['id']]['execution'] = p['execution']
    document = {'sources': {}, 'pumps': output}
    for name, path in [('td',TD),('nis',NIS),('wq',WQ),('selector',SELECTOR),('cdm-selector',CDM_SELECTOR),('cdm',CDM_PDF),('shp',SHP)]:
        document['sources'][name] = {'file': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'url': URLS.get(name), 'title': 'Программа подбора CNP / Eventech' if 'selector' in name else path.name}
    dest = FRONTEND / 'data/pump-catalog/cnp-physical-data.json'
    dest.write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for series in ['CDM','CHLF','TD','NIS','WQ']:
        relevant = [p for p in pumps if p['series']==series]
        print(series, len(relevant), dict(Counter(field for p in relevant for field in output.get(p['id'],{}) if field not in ['model','provenance'])))
    print('WQ OCR rows:',len(wq),'TD dimension models:',len(td))

if __name__ == '__main__':
    main()
