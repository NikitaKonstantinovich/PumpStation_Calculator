"""Apply reviewed ONIS drawing facts; never infer coordinates from letter names."""
import copy
import math


def number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and abs(v) <= 1e6


def validate_spatial(value):
    if value.get('version') != 1 or value.get('units') != 'mm' or value.get('coordinateSystem') != 'inlet':
        raise ValueError('Invalid spatial frame')
    b = value.get('boundsMm', [])
    if len(b) != 6:
        raise ValueError('Invalid bounds')
    for i in range(3):
        if any(v is not None and not number(v) for v in (b[i], b[i+3])):
            raise ValueError('Invalid bounds axis')
        if b[i] is not None and b[i+3] is not None and b[i+3] <= b[i]:
            raise ValueError('Invalid bounds axis')
    ports = value.get('ports', [])
    if len(ports) != 2 or {p.get('id') for p in ports} != {'inlet', 'outlet'}:
        raise ValueError('Invalid port roles')
    for p in ports:
        for k in ('point', 'axis'):
            if len(p.get(k, [])) != 3 or not all(number(v) for v in p[k]):
                raise ValueError('Invalid port vector')
        if abs(math.hypot(*p['axis'])-1) > 1e-6:
            raise ValueError('Invalid unit axis')
    if next(p for p in ports if p['id'] == 'inlet')['point'] != [0, 0, 0]:
        raise ValueError('Inlet origin mismatch')
    if not value.get('source') or not value.get('rule'):
        raise ValueError('Missing drawing provenance')


def enrich_onis_spatial(pump, evidence, document):
    fact = document.get('pumps', {}).get(pump['id'])
    if not fact:
        return
    if pump.get('manufacturer') != 'ONIS' or pump.get('series') in ('SW', 'SW (2026)', 'SWB'):
        raise ValueError('Unexpected ONIS scope')
    if any(fact.get(k) != pump.get(k) for k in ('manufacturer', 'model', 'series', 'article', 'execution')):
        raise ValueError(f'ONIS identity mismatch: {pump["id"]}')
    source = document['sources'][fact['source']]
    net_weight = fact.get('netWeightKg')
    if net_weight is not None:
        if not number(net_weight) or net_weight <= 0 or not fact.get('netWeightPdfPage'):
            raise ValueError('Invalid net weight or missing source page')
        if pump.get('weightKg') is not None and pump['weightKg'] != net_weight:
            raise ValueError(f'Conflicting ONIS net weight: {pump["id"]}')
    dimensions = copy.deepcopy(pump.get('dimensions') or {})
    for k, v in fact.get('dimensions', {}).items():
        if not number(v) or v <= 0:
            raise ValueError(f'Invalid ONIS dimension {pump["id"]}/{k}')
        if k in dimensions and dimensions[k] != v:
            raise ValueError(f'Conflicting ONIS dimension {pump["id"]}/{k}')
        dimensions[k] = v
    spatial = fact.get('spatial')
    if spatial:
        validate_spatial(spatial)
        for i, key in enumerate(('overall_length', 'overall_width', 'overall_height')):
            b = spatial['boundsMm']
            if b[i] is not None and b[i+3] is not None:
                value = round(b[i+3]-b[i], 6)
                if key in dimensions and abs(dimensions[key]-value) > 1e-6:
                    raise ValueError(f'Envelope conflict: {pump["id"]}/{key}')
                dimensions[key] = value
    # Mutate only after validating the complete candidate.
    if dimensions:
        pump['dimensions'] = dimensions
    if spatial:
        pump['spatialData'] = copy.deepcopy(spatial)
    if net_weight is not None:
        pump['weightKg'] = net_weight
        pump.setdefault('physicalDataSources', {})['Масса'] = 'Нетто; ' + source['title'] + '; ' + source['url'] + '#page=' + str(fact['netWeightPdfPage'])
    pump.setdefault('physicalDataSources', {})['Размерная схема ONIS'] = source['title'] + '; ' + source['url']
    # Remove only explicitly superseded, previously imported statements; keep user notes.
    for old_note in fact.get('supersedesNotes', []):
        if old_note:
            pump['physicalNote'] = (pump.get('physicalNote') or '').replace(old_note, '').strip()
    note = fact.get('note', '')
    if note and note not in (pump.get('physicalNote') or ''):
        pump['physicalNote'] = ((pump.get('physicalNote') or '') + ' ' + note).strip()
    evidence['onisSpatialData'] = copy.deepcopy(fact)
