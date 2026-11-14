"""Read the user-selected workbooks; never modify them. Apply reviewed price rules."""
import hashlib
import json
from pathlib import Path
import openpyxl

app = Path(__file__).resolve().parents[1]
paths = [Path('E:/PumpStation_Calculator/Equipment/Калькулятор по ОБВЯЗКЕ.xlsm'),
         Path('E:/WENARD/Yandex.Disk/кулькулятор насосков/Калькулятор расчета цены станций вер 1.1.xlsx')]
books = [openpyxl.load_workbook(p, read_only=True, data_only=True) for p in paths]
hashes = [hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]
target = app/'data/frame-fasteners-import.json'
data = json.loads(target.read_text(encoding='utf-8'))
items = {i['id']:i for i in data['items']}
def field(item, key, value):
    item['fields'] = [f for f in item['fields'] if f['column'] != key] + [dict(column=key, headerPath=[key], value=value)]
def price(ident, book, sheet, cell, rule='', mass_cell=None):
    item = items[ident]
    value = books[book][sheet][cell].value
    if not isinstance(value, (int,float)) or value <= 0: raise ValueError((sheet,cell,value))
    item['prices'] = [dict(label='Цена, руб./шт.', amount=round(value,2), currency='RUB')]
    source = f'{paths[book].name} · {sheet}!{cell}' + (f' · {rule}' if rule else '')
    field(item,'Источник цены',source)
    field(item,'FRAME_PRICE_SOURCE',dict(path=str(paths[book]),sha256=hashes[book],sheet=sheet,cell=cell,rule=rule,checked='2026-11-11'))
    if mass_cell: field(item,'Масса, кг',books[book][sheet][mass_cell].value)
for side, row in [('left',13),('right',14)]:
    ident = f'frame-hardware-stand-{side}'
    price(ident,1,'Рама',f'E{row}')
    new = json.loads(json.dumps(items[ident])); new['id'] += '-1800';new['family'] += ' 1800 мм'
    field(new,'Наименование',new['family']);items[new['id']] = new
    price(new['id'],1,'Рама',f'E{row+2}')
for length,row in [(25,250),(35,253)]:
    price(f'frame-hardware-bolt-m8-{length}',1,'Болты',f'G{row}',mass_cell=f'K{row}')
for length in [600,800]:
    price(f'frame-hardware-profile-{length}',1,'Доп оборудование','G21','По решению пользователя 11.11.2026: 399,33 руб. за штуку независимо от длины; исходная единица в Спецификация!F47 — м')
for length,row in zip(range(45,81,5),range(32,40)):
    price(f'frame-hardware-bolt-m12-{length}',1,'Болты',f'G{row}',mass_cell=f'K{row}')
for item in items.values():
    rivet = next((f['value'] for f in item['fields'] if f['column']=='FRAME_RIVET'),None)
    if rivet:
        d = rivet['threadMm'];row={6:120,8:121,10:122,12:123}[d]
        price(item['id'],0,'Метизы',f'H{row}','Цена аналога BRALO того же диаметра; согласовано пользователем 11.11.2026. Технические параметры RIVKLE не заменены')
        rivet.update(holeDiameterMm={6:9,8:11,10:13,12:16}[d],headDiameterMm={6:13,8:16,10:19,12:23}[d])
data.update(prepared='2026-11-11',items=list(items.values()))
target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for b in books:b.close()
print(json.dumps({'items':len(items),'priced':sum(bool(i['prices']) for i in items.values())}))
