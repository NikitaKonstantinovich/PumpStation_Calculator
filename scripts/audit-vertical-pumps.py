"""Check every vertical pump. --strict fails when required data remains absent."""
import argparse,json,math,re,sqlite3,collections
from pathlib import Path
from vertical_physical import positive
ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def connection(p,supp,side):
    values=[(p.get(side) or {}).get('dn'),p.get(side+'Dn'),(p.get('connectionSourceValue')or{}).get(side),
            (p.get('mounting')or{}).get('Размер '+('всасывающего' if side=='inlet' else 'напорного')+' патрубка'),supp.get(side+'Dn')]
    return next((v for v in values if positive(v) or isinstance(v,str) and re.search(r'\d',v)),None)
def numeric_dimensions(p):
    return {k:v for k,v in (p.get('dimensions')or{}).items() if positive(v) and not re.search(r'кг|weight|net|gross|темпер|temperature',k,re.I)}
def audit(pumps,supp,document):
    result=[]
    for p in pumps:
        if p['type'] not in ['vertical_multistage','inline']:continue
        extra=supp.get(p['id'],{});dims=numeric_dimensions(p)
        d=p.get('dimensions')or{}
        mass=next((v for v in [p.get('weightKg'),d.get('Нетто, кг'),d.get('Масса, кг'),d.get('weight_kg'),extra.get('weightKg')] if positive(v)),None)
        checks={'масса':bool(mass),'номинальная подача':positive(p.get('nominalFlow')),'мощность':positive(p.get('power')),
                'всасывающий патрубок':bool(connection(p,extra,'inlet')),'напорный патрубок':bool(connection(p,extra,'outlet')),
                'численные размеры':bool(dims),'кривая Q–H':len(p.get('curve',[]))>=2}
        if checks['кривая Q–H']:
            checks['кривая Q–H']=all(len(pt)==2 and all(isinstance(v,(int,float)) and math.isfinite(v) and v>=0 for v in pt) for pt in p['curve'])
        source=(document.get('pumps',{}).get(p['id'],{}).get('provenance')or{})
        note=p.get('physicalNote','')
        result.append({'id':p['id'],'manufacturer':p['manufacturer'],'series':p['series'],'model':p['model'],'type':p['type'],
          'nominalFlow':p.get('nominalFlow'),'power':p.get('power'),'weightKg':mass,'inlet':connection(p,extra,'inlet'),'outlet':connection(p,extra,'outlet'),
          'dimensions':dims,'drawing':p.get('drawing'),'checks':checks,'missing':[k for k,v in checks.items() if not v],
          'note':note,'provenance':source})
    return result
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--strict',action='store_true');args=parser.parse_args()
    pumps=read(ROOT/'frontend/public/pumps.json');supp=read(ROOT/'frontend/app/pump-card-supplement.json');doc=read(ROOT/'frontend/data/pump-catalog/vertical-physical-data.json')
    rows=audit(pumps,supp,doc);issues=collections.Counter(k for r in rows for k in r['missing'])
    mismatches=[]
    with sqlite3.connect(f'file:{(ROOT/"database/pumps-merged.sqlite").as_posix()}?mode=ro',uri=True) as db:
        integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
        sqlite_rows={r[0]:json.loads(r[1]) for r in db.execute('SELECT id,payload_json FROM catalog_models')}
        mismatches=[p['id'] for p in pumps if p['type'] in ['vertical_multistage','inline'] and sqlite_rows.get(p['id'])!=p]
    by=[]
    for brand,series in sorted({(r['manufacturer'],r['series']) for r in rows}):
        group=[r for r in rows if r['manufacturer']==brand and r['series']==series]
        by.append({'manufacturer':brand,'series':series,'total':len(group),'missingWeight':sum(r['weightKg'] is None for r in group),'missingNumericDimensions':sum(not r['dimensions'] for r in group),'rowsWithGaps':sum(bool(r['missing']) for r in group)})
    report={'checkedOn':'2026-10-29','total':len(rows),'completeRequiredFields':sum(not r['missing'] for r in rows),
      'status':'PASS' if not issues and integrity=='ok' and not mismatches else 'INCOMPLETE','missingByField':dict(issues),
      'sqliteIntegrity':integrity,'sqliteMismatches':mismatches,'bySeries':by,'pumps':rows,
      'limits':'Численные размеры проверяются на наличие, не на полноту контура. Табличная масса — нетто одного насоса. КПД, NPSH и цена не подставляются из других моделей и не являются обязательными полями этой проверки.'}
    dest=ROOT/'frontend/data/pump-catalog/vertical-physical-report.json';dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['pumps','bySeries','limits']},ensure_ascii=False,indent=2))
    if integrity!='ok' or mismatches or args.strict and issues:raise SystemExit(1)
if __name__=='__main__':main()
