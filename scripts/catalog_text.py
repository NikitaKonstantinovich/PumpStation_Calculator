"""Readable catalog text, applied after source identities and IDs are established."""
from copy import deepcopy


TEXT_REPLACEMENTS = {
    '非标': 'нестандартное исполнение',
    '无隔离罩': 'без изолирующего кожуха',
    '三相': 'трёхфазный',
    '爆炸图': ' — сборочный чертёж',
    '法兰': ' (фланец)',
    '二代': 'второе поколение',
    '）': ')',
    '（': '(',
    '～': '…',
    '℃': '°C',
}
RECORD_TEXT_FIELDS = {
    'model', 'article', 'description', 'phase', 'properties_raw',
    'liquid_temperature_standard', 'liquid_temperature_high',
    'document_name', 'title',
}


def readable_pump_text(value):
    for original, readable in TEXT_REPLACEMENTS.items():
        value = value.replace(original, readable)
    return value.replace(')без изолирующего кожуха', ') без изолирующего кожуха')


def normalize_pump_catalog(pumps, records, originals=None):
    """Keep source strings separately; never rewrite IDs, URLs or asset paths."""
    originals = deepcopy(originals or {})
    for pump in pumps:
        saved = originals.setdefault(pump['id'], {})
        for key in ['model', 'article', 'description']:
            value = pump.get(key)
            if not isinstance(value, str):
                continue
            readable = readable_pump_text(value)
            if readable != value:
                saved.setdefault('pump.' + key, value)
                pump[key] = readable

        def visit(value, path='record'):
            if isinstance(value, dict):
                for key, item in value.items():
                    pointer = path + '.' + key
                    if key in RECORD_TEXT_FIELDS and isinstance(item, str):
                        readable = readable_pump_text(item)
                        if readable != item:
                            saved.setdefault(pointer, item)
                            value[key] = readable
                    elif isinstance(item, (dict, list)):
                        visit(item, pointer)
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    visit(item, path + f'[{index}]')

        visit(records.get(pump['id'], {}))
        if not saved:
            originals.pop(pump['id'])
    return originals


def readable_control_text(value):
    return (value.replace('двигвателя', 'двигателя')
            .replace('бемперебойного', 'бесперебойного')
            .replace('2ХDB9', '2 × DB9')
            .replace('тип AС', 'тип AC')
            .replace('АСDC', 'ACDC')
            .replace('«сухие контакты (', '«сухие контакты» ('))


def normalize_control_component(component):
    for key in ['name', 'componentType']:
        if isinstance(component.get(key), str):
            component[key] = readable_control_text(component[key])
    for key, value in component.get('attributes', {}).items():
        if isinstance(value, str):
            component['attributes'][key] = readable_control_text(value)
    # https://meandr.ru/rvo-15: article 4640016932887 has two changeover groups.
    if component.get('article') == '4640016932887':
        component['name'] = component['name'].replace('АС230', 'AC230')
        for key, value in component.get('attributes', {}).items():
            if value == '2NOС':
                component['attributes'][key] = '2 переключающие группы контактов'
    return component


def normalize_control_database(database):
    for component in database['components']:
        normalize_control_component(component)
    for cabinet in database['cabinets']:
        for item in cabinet['items']:
            if isinstance(item.get('component'), dict):
                normalize_control_component(item['component'])
    return database
