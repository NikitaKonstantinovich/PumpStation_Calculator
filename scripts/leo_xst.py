"""Import exact LEO XST records from the installed selector's exported MDB snapshot."""
from collections import Counter
from copy import deepcopy
import math
import re


SOURCE_FILE = 'leo-xst-source.json'


def properties(text):
    result = {}
    for entry in (text or '').split('|'):
        key, separator, value = entry.partition(':')
        if separator:
            if key in result:
                raise ValueError(f'Duplicate LEO property {key}')
            result[key] = value.strip()
    return result


def scalar(text, unit=None):
    if text in (None, ''):
        return None
    pattern = r'\s*([-+]?\d+(?:\.\d+)?)\s*' + (re.escape(unit) if unit else '') + r'\s*'
    match = re.fullmatch(pattern, str(text), re.I)
    if not match:
        raise ValueError(f'Unsupported LEO numeric value: {text!r}')
    value = float(match[1])
    if not math.isfinite(value):
        raise ValueError('Nonfinite LEO numeric value')
    return value


def points(text):
    if not text:
        return []
    count, *pairs = text.split('|')
    if int(count) != len(pairs):
        raise ValueError('LEO curve point count does not match the source')
    result = []
    for pair in pairs:
        values = pair.split(',')
        if len(values) != 2:
            raise ValueError('Invalid LEO curve coordinate')
        q, value = map(float, values)
        if not all(math.isfinite(x) and x >= 0 for x in [q, value]):
            raise ValueError('Invalid LEO curve coordinate')
        if result and q <= result[-1][0]:
            raise ValueError('LEO curve flow coordinates must increase')
        result.append([q, value])
    return result


def temperature(text):
    return (text or '').replace('℃', '°C').replace('～', '…')


def build_catalog(document):
    series = {row['ID']: row for row in document['series']}
    groups = {row['ID']: row for row in document['groups']}
    curves = {row['ID']: row for row in document['curves1']}
    derived = {row['ID']: row for row in document['curves2']}
    spectra = {row['ID']: row for row in document['spectra']}
    parts = {}
    for part in document['parts']:
        if part['PumpID'] in parts:
            raise ValueError('Multiple LEO part executions need explicit reconciliation')
        parts[part['PumpID']] = part
    result, evidence = [], {}
    for row in document['pumps']:
        family = series[row['SeriesID']]
        defaults = properties(family['PumpDefaultParas'])
        if (defaults.get('UnitQ'), defaults.get('UnitH'), defaults.get('UnitP')) != ('1', '0', '1'):
            raise ValueError('LEO source curve units changed; verify before importing')
        if family['Name'] != 'XST':
            raise ValueError('Unexpected series in LEO XST snapshot')
        part = parts[row['ID']]
        prop = properties(part['PartPropParas'])
        raw_curve = curves[row['ID']]
        qh = points(raw_curve['PointsInfoQH'])
        if len(qh) < 2:
            raise ValueError('LEO XST model has no usable Q/H curve')
        qe = points(raw_curve['PointsInfoQE'])
        qp = points(raw_curve['PointsInfoQP'])
        npsh = points(raw_curve['PointsInfoNPSH'])
        rating = list(map(float, row['RatedParas'].split(',')))
        if len(rating) != 6 or not all(math.isfinite(x) and x >= 0 for x in rating):
            raise ValueError('Unexpected LEO rated parameters')
        frequency = int(family['MotorFrequece'])
        if prop.get('114') and scalar(prop['114'], 'Hz') != frequency:
            raise ValueError('LEO series and execution frequency disagree')
        power = scalar(prop.get('12'), 'kW')
        net_weight = scalar(prop.get('148'), 'kg')
        inlet = int(scalar(prop['29'].removeprefix('DN')))
        outlet = int(scalar(prop['30'].removeprefix('DN')))
        if part.get('SalePrice') not in (None, -1, 0):
            raise ValueError('A new LEO source price needs an explicit currency')
        active = bool(family['UseStatus']) and bool(row['UseStatus']) and bool(part['SaleStatus'])
        selectable = active and frequency == 50
        pid = f'leo-xst-{row["ID"]}'
        source = f'Программа подбора LEO SPumpAloneLEOZ2024 · XST · {frequency} Гц · PumpMain {row["ID"]}'
        electric = {'Частота, Гц': frequency}
        phase = {'三相': 'Трёхфазный', '单相': 'Однофазный'}.get(prop.get('8'))
        if prop.get('8') and not phase:
            raise ValueError('Unknown LEO phase designation')
        if phase:
            electric['Фазность'] = phase
        for code, label in [('115', 'Номинальное напряжение'), ('116', 'Номинальный ток'),
                            ('9', 'Степень защиты'), ('10', 'Класс изоляции'), ('19', 'Модель двигателя')]:
            if prop.get(code):
                electric[label] = prop[code]
        if prop.get('141'):
            electric['Число полюсов'] = int(scalar(prop['141']))
        motor = {'非标电机(同轴)': 'Нестандартный электродвигатель, соосное исполнение',
                 '标准电机(套轴)': 'Стандартный электродвигатель, втулочное соединение'}.get(prop.get('26'))
        if prop.get('26') and not motor:
            raise ValueError('Unknown LEO motor execution')
        if motor:
            electric['Исполнение двигателя'] = motor
        materials = {}
        for code, label in [('1', 'Рабочее колесо'), ('2', 'Корпус насоса'), ('165', 'Вал'),
                            ('200', 'Вал'), ('273', 'Уплотнительное кольцо'), ('275', 'Задняя крышка'),
                            ('280', 'Соединительный корпус'), ('282', 'Вентилятор'),
                            ('283', 'Кожух'), ('284', 'Опора')]:
            if prop.get(code):
                materials[label] = re.sub(r'\\+', ' / ', prop[code])
        fluid = {'Рабочая жидкость': 'Чистая вода и жидкости с близкими физико-химическими свойствами',
                 'Температура жидкости': temperature(prop['7'])}
        if prop.get('123'):
            fluid['Максимальная температура окружающей среды'] = temperature(prop['123'])
        if prop.get('125'):
            fluid['Максимальное рабочее давление, бар'] = scalar(prop['125'], 'bar')
        for code, label in [('191', 'Рабочее давление штатного исполнения, МПа'),
                            ('192', 'Допустимое давление проточной части, МПа')]:
            if prop.get(code):
                fluid[label] = scalar(prop[code])
        if prop.get('147'):
            fluid['NPSH в номинальной точке, м'] = scalar(prop['147'], 'm')
        if prop.get('281'):
            fluid['Максимальная высота установки, м'] = scalar(prop['281'], 'm')
        if prop.get('25'):
            fluid['pH'] = prop['25']
        working = list(map(float, spectra[row['ID']]['PerformRegionParas'].split(',')))
        if len(working) not in (6, 7) or not (qh[0][0] <= working[4] < working[5] <= qh[-1][0]):
            raise ValueError('LEO working flow interval is outside its source curve')
        fluid['Допустимый расход, м³/ч'] = f'{working[4]:g}…{working[5]:g}'
        fluid['Предпочтительный расход, м³/ч'] = f'{working[2]:g}…{working[3]:g}'
        dimensions = {}
        if prop.get('150'):
            dimensions['Упаковочные размеры, мм'] = re.sub(r'(?i)mm$', '', prop['150']).replace('x', ' × ')
        if prop.get('149'):
            dimensions['Масса брутто, кг'] = scalar(prop['149'], 'kg')
        description = ('Одноступенчатый горизонтальный центробежный насос LEO XST. '
                       'Для водоснабжения, повышения давления, циркуляции, водоподготовки и орошения. '
                       'Рабочая жидкость: чистая вода и жидкости с близкими свойствами. '
                       f'Частота питания: {frequency} Гц.')
        if phase:
            description += f' {phase} электродвигатель.'
        pump = {'id': pid, 'manufacturer': 'LEO', 'series': 'XST',
            'group': groups[row['GroupID']]['Name'], 'model': row['PumpName'], 'type': 'end_suction',
            'article': str(part['PartNO'] or part['PartCode']), 'power': power,
            'efficiency': max((point[1] for point in qe), default=None), 'nominalFlow': rating[1],
            'ratedHead': rating[2], 'minFlow': qh[0][0], 'maxFlow': qh[-1][0],
            'minHead': min(point[1] for point in qh), 'maxHead': max(point[1] for point in qh),
            'selectionFlowRange': working[4:6], 'price': None, 'priceCurrency': None,
            'priceKind': 'list', 'priceSource': None, 'discountPercent': 0,
            'source': source, 'drawing': None, 'curve': qh, 'efficiencyCurve': qe,
            'powerCurve': qp, 'npshCurve': npsh, 'frequencyHz': frequency,
            'speedRpm': row['Ratedn'], 'voltage': prop.get('115'), 'weightKg': net_weight,
            'inletDn': inlet, 'outletDn': outlet, 'electric': electric, 'materials': materials,
            'dimensions': dimensions, 'fluid': fluid, 'description': description,
            'active': active, 'selectable': selectable, 'medium': 'water',
            'catalogSource': 'leo-local-selector',
            'physicalDataSources': {'Масса': source + f' · PartBase {part["ID"]}, поле 148 (нетто)',
                                   'Всасывающий патрубок': source + f' · PartBase {part["ID"]}, поле 29',
                                   'Напорный патрубок': source + f' · PartBase {part["ID"]}, поле 30'}}
        if not selectable:
            pump['dataWarnings'] = ['Справочная запись на 60 Гц. Серия отключена в исходной программе LEO; '
                                    'автоматический подбор на 50 Гц для этого исполнения не выполняется.']
        result.append(pump)
        evidence[pid] = {'sources': [{'file': SOURCE_FILE, 'record': {
            'pump': deepcopy(row), 'part': deepcopy(part), 'series_id': row['SeriesID'],
            'curve_primary': deepcopy(raw_curve), 'curve_derived': deepcopy(derived.get(row['ID'])),
            'spectrum': deepcopy(spectra[row['ID']])}}],
            'fieldSources': {key: SOURCE_FILE for key in pump if key != 'id'}}
    identities = [(p['manufacturer'], p['model'].upper().replace(' ', '')) for p in result]
    if len(set(identities)) != len(result) or len({p['id'] for p in result}) != len(result):
        raise ValueError('Duplicate LEO identities')
    report = {'source': deepcopy(document['source']), 'models': len(result),
        'selectable': sum(p['selectable'] for p in result),
        'byFrequencyHz': dict(Counter(str(p['frequencyHz']) for p in result)),
        'curvePoints': sum(len(p['curve']) for p in result),
        'pricedModels': 0, 'localDrawings': 0,
        'units': {'flow': 'm³/h', 'head': 'm', 'power': 'kW', 'efficiency': '%', 'npsh': 'm'}}
    return result, evidence, report


def attach_catalog(pumps, records, document):
    imported, evidence, report = build_catalog(document)
    existing = {p['id']: p for p in pumps}
    for pump in imported:
        old = existing.get(pump['id'])
        if old and old.get('catalogSource') != 'leo-local-selector':
            raise ValueError('LEO source ID collides with another catalog')
    kept = [p for p in pumps if p.get('catalogSource') != 'leo-local-selector']
    keys = {(p['manufacturer'].upper(), re.sub(r'\s+', '', p['model']).upper()) for p in kept}
    if any((p['manufacturer'], re.sub(r'\s+', '', p['model']).upper()) in keys for p in imported):
        raise ValueError('LEO model is already present under another catalog identity')
    pumps[:] = kept + imported
    for pid in [pid for pid in records if pid.startswith('leo-xst-')]:
        records.pop(pid)
    records.update(evidence)
    return report
