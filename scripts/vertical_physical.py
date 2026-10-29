"""Apply traceable vertical-pump physical facts without overwriting source data."""
import math

def positive(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>0

def enrich_vertical_physical(pump,evidence,document):
    fact=document.get('pumps',{}).get(pump['id'])
    if not fact:return
    if pump.get('type') not in ('vertical_multistage','inline'):
        raise ValueError(f'Unexpected pump type: {pump["id"]}')
    if any(fact.get(k)!=pump.get(k) for k in ('model','manufacturer','execution')):
        raise ValueError(f'Vertical physical identity mismatch: {pump["id"]}')
    evidence['verticalPhysicalData']=fact
    invalid=fact.get('invalidDrawing')
    if invalid and pump.get('drawing')==invalid['path']:
        pump['drawing']=None
        warning=f'Чертёж {invalid["drawingModel"]} не соответствует модели; нужна замена.'
        warnings=pump.setdefault('dataWarnings',[])
        if warning not in warnings:warnings.append(warning)
    for field in ('weightKg','nominalFlow','dimensions'):
        if field not in fact:continue
        values=fact[field]
        if field=='dimensions':
            target=pump.get('dimensions') or {}
            pump['dimensions']=target
            for k,v in values.items():
                if not positive(v):raise ValueError(f'Invalid dimension {pump["id"]}/{k}')
                if target.get(k) is None:target[k]=v
        else:
            if not positive(values):raise ValueError(f'Invalid {field}: {pump["id"]}')
            if positive(pump.get(field)):continue
            pump[field]=values
        ref=fact['provenance'][field];source=document['sources'][ref['source']]
        title=source['title']+(f', стр. {ref["page"]}' if ref.get('page') else '')
        pump.setdefault('physicalDataSources',{}).setdefault({'weightKg':'Масса','nominalFlow':'Номинальная подача серии','dimensions':'Габариты'}[field],title)
    if fact.get('physicalNote'):
        note=pump.get('physicalNote','')
        if fact['physicalNote'] not in note:pump['physicalNote']=(note+' '+fact['physicalNote']).strip()
