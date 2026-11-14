"""Technical references only: do not invent supplier prices or component masses."""
import hashlib
import json
from pathlib import Path

app=Path(__file__).resolve().parents[1]
pdf=Path('E:/PumpStation_Calculator/outputs/pump-fasteners-2026-11-10/rivkle.pdf')
source='https://media.boellhoff.com/files/pdf13/rivkle-blind-rivet-nuts-and-studs-en-2307.pdf'
items=[]
def item(ident,name,fields=None):
    items.append({'id':ident,'catalogId':'метизы','family':name,'fields':[{'column':k,'headerPath':[k],'value':v} for k,v in {'Наименование':name,**(fields or {})}.items()],'prices':[]})
for side,label in [('left','левая'),('right','правая')]:
    item('frame-hardware-stand-'+side,'Стойка шкафа управления '+label,{'Источник':'Комплектация задана пользователем: одна левая и одна правая стойка','Исполнение':side})
for length in [25,35]:
    item(f'frame-hardware-bolt-m8-{length}',f'Болт М8×{length}',{'Диаметр резьбы, мм':8,'Длина, мм':length,'Источник':'Размер задан пользователем'})
for width in [600,800]:
    item(f'frame-hardware-profile-{width}',f'Профиль С-образный 40×40×20, L={width} мм',{'Источник':'Задано пользователем; учёт в штуках, цена не зависит от длины','Длина, мм':width})
# Steel, flat head, open end, page 22. L2 is the installed projection below
# the sheet, not a guessed multiple of the thread diameter.
for d,lo,hi,head,tail,code in [(6,3,5.5,1.5,9.3,'23301060055'),(8,3,5.5,1.5,11,'23301080055'),(10,1,3.5,2,15,'23301100035'),(10,3.5,6,2,15,'23301100060'),(12,1,4,2,17.1,'23301120040'),(12,4,7,2,17.1,'23301120070')]:
    item('frame-hardware-rivkle-'+code,f'Гайка-заклёпка М{d} RIVKLE {code}',{'FRAME_PUMP_FASTENER':True,'FRAME_RIVET':{'verified':True,'source':source+' · стр. 22 · '+code,'sourceSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'threadMm':d,'gripMinMm':lo,'gripMaxMm':hi,'headThicknessMm':head,'installedProjectionMm':tail},'Диаметр резьбы, мм':d})
# Complete the M12 length series needed by the reviewed raised pump bases.
# Standard sizes, not an assertion that these are already priced/stocked.
for length in [45,50,55,60,65,70,75,80]:
    item(f'frame-hardware-bolt-m12-{length}',f'Болт М12×{length} DIN933 Ц 8,8',{'FRAME_PUMP_FASTENER':True,'Диаметр резьбы, мм':12,'Длина, мм':length,'Источник':'Размерный ряд DIN 933; полная резьба. Цена и масса поставщика не заданы.','Справочный каталог':'https://www.fabory.com/en_NL/hexagon-head-screw-din-933-steel-zinc-plated-8-8-m12x60-s%3D19/p/01210120060'})
(app/'data/frame-fasteners-import.json').write_text(json.dumps({'schema':1,'prepared':'2026-11-10','items':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(len(items))
