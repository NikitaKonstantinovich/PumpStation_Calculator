"""Build the initial, traceable spacing registry from the reviewed research."""
import json, pathlib, math
root = pathlib.Path(__file__).resolve().parents[1]
research = json.loads((root.parent/'work/collector-spacing-research/grouped-data.json').read_text(encoding='utf8'))
pumps = json.loads((root/'public/pumps.json').read_text(encoding='utf8'))
by_id = {p['id']: p for p in pumps}
rules = []
for i, x in enumerate(research['inputs']):
    rules.append(dict(id=f'research-{i+1}', manufacturer=x['brand'], type=x['type'], series=x['family'],
        nominalFlow=x['size'] if x['type']=='vertical_multistage' else None,
        inletDn=x['size'] if x['type']=='inline' else None, outletDn=x['size'] if x['type']=='inline' else None,
        modelId='', modelIds=x['ids'], powerMin=None, powerMax=x['power'], execution=x['scope'],
        radius=x['r'], spacing=max(400, math.ceil((2*x['r']+150)/50)*50) if x['r'] else None,
        status='confirmed' if x['status']=='По каталогу' else 'missing' if x['r'] is None else 'conditional',
        source=f"{x['url']} · {x['page']}", note=x['evidence']+'; '+x['status']))
seed={'financial':{'usdRate':85,'cnyRate':13,'date':'2026-10-29','discounts':{'cnp':45,'aquastrong':55,'onis':0,'vandjord':25,'wellmix':35}},
      'spacing':{'legacy':False,'minimum':400,'increment':50,'gap':150,'rules':rules},
      'welding':{'aisi304':5000,'st20':2400,'date':'2026-10-29','note':'Тарифы конструктора, перенесены из WELD_RATES'},
      'velocity':[{'fromDn':1,'toDn':250,'limit':2},{'fromDn':251,'toDn':None,'limit':3}],
      'painting':json.loads((root/'public/collector-catalog.json').read_text(encoding='utf8')).get('paintingRates',[]),
      'preferences':{'hoseLengthMm':None,'rules':[]}}
for p in pumps: seed['financial']['discounts'].setdefault(p['manufacturer'].lower(),0)
for r in seed['painting']: r.update(date='2026-10-29', note='Исходная запись каталога работ')
(root/'data/base-values-seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2),encoding='utf8')
metadata={p['id']:{**{k:p.get(k) for k in ['manufacturer','series','model','type','nominalFlow','power','inletDn','outletDn']}, 'active':p.get('active') is not False, 'selectable':p.get('selectable') is not False} for p in pumps}
(root/'data/base-values-pumps.json').write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(f'{len(rules)} spacing rules; {len(seed["painting"])} source painting tariffs')
