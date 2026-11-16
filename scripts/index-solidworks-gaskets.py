"""Index native round paronite gaskets by exact catalogue execution and measured faces."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def ring(model):
    if model["units"].get("length")!="millimeter":return
    geometry=model["model"]
    if len(geometry["bodies"])!=1 or len(geometry["faces"])!=4:return
    surfaces=[s["geometry"] for s in geometry["surfaces"]]
    planes=[s for s in surfaces if s["kind"]=="plane"]
    walls=[s for s in surfaces if s["kind"]=="cylinder"]
    if len(planes)!=2 or len(walls)!=2 or len(surfaces)!=4:return
    axis=max("xyz",key=lambda dim:abs(walls[0]["axis"][dim]))
    for s in planes+walls:
        if abs(s.get("axis",s.get("normal"))[axis])<.999999:return
    centre=walls[0]["origin"].copy()
    if any(abs(walls[1]["origin"][k]-centre[k])>.001 for k in "xyz" if k!=axis):return
    lo,hi=sorted(s["origin"][axis] for s in planes)
    centre[axis]=lo
    bases={"x":[[1,0,0],[0,1,0],[0,0,1]],"y":[[0,-1,0],[1,0,0],[0,0,1]],"z":[[0,0,-1],[0,1,0],[1,0,0]]}
    basis=bases[axis]
    shift=[-sum(centre[k]*basis[i][j] for i,k in enumerate("xyz"))/1000 for j in range(3)]
    di,do=sorted(2*s["radius"] for s in walls)
    return dict(innerMm=di,outerMm=do,lengthMm=round(hi-lo,4)),sum(basis,[])+shift+[1,0,0,0]

def main():
    args=argparse.ArgumentParser();args.add_argument('--cadmpeg',type=Path,required=True);tool=args.parse_args().cadmpeg.resolve()
    front=ROOT/'frontend'
    items=json.loads((front/'public/binding-components.json').read_text(encoding='utf8'))['items']
    rows=[]
    with tempfile.TemporaryDirectory(dir=front/'work') as temp:
        for path in sorted((ROOT/'Equipment/Seals').rglob('*')):
            m=re.fullmatch(r'Прокладка А[-_ ](\d+)[-_ ](\d+)[-_ ]?ПОН.*',path.stem,re.I)
            if path.suffix.lower()!='.sldprt' or not m:continue
            dn,pn=map(int,m.groups());dump=Path(temp)/'part.json'
            subprocess.run([str(tool),'dump',str(path),'-o',str(dump),'--force'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=60)
            measured=ring(json.loads(dump.read_text(encoding='utf8')))
            if not measured:continue
            dims,t=measured
            for item in items:
                if item.get('catalogId')!='прокладки':continue
                fields={f['headerPath'][-1]:f['value'] for f in item['fields']}
                if fields.get('DN')!=dn or fields.get('Исполнение')!='А' or fields.get('Толщина, мм')!=dims['lengthMm']:continue
                if str(pn) not in re.findall(r'\d+',str(fields.get('Совместимые PN',fields.get('PN','')))):continue
                rows.append(dict(kind='gasket',equipmentId=item['id'],name=fields['Наименование'],dn=dn,modelPn=pn,dimensions=dims,placement=t,
                                 source=path.relative_to(ROOT).as_posix(),sourceHash=hashlib.sha256(path.read_bytes()).hexdigest()))
    (front/'data/solidworks-gaskets.json').write_text(json.dumps(rows,ensure_ascii=False,indent=1)+'\n',encoding='utf8')
    print('Measured native gasket bindings:',len(rows))
if __name__=='__main__':main()
