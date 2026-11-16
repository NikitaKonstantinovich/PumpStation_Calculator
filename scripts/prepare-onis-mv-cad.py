"""Build exact ONIS MV CAD profiles from reviewed catalogue links and measured assets."""

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sqlite3


FRONTEND = Path(__file__).resolve().parents[1]
REVIEW_MAPPING = 'catalog_model_match_execution_review'
REVIEW_NOTE = 'Геометрия исходного STEP для компоновки. Исполнение двигателя, материала и монтажный допуск требуют сверки.'
FLOW_NOTE = 'Направление потока подтверждено двумя стрелками на основании исходной STEP-модели ONIS.'


def file_hash(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def checked_asset(root, relative, expected, allowed_root):
    path = Path(relative)
    target = (root / path).resolve()
    if path.is_absolute() or not target.is_relative_to((root / allowed_root).resolve()):
        raise ValueError(f'CAD path outside its library: {path}')
    if file_hash(target) != expected:
        raise ValueError(f'CAD hash mismatch: {path}')
    return target


def identifier(value):
    return ''.join(value.upper().split())


def vector(value):
    return isinstance(value, list) and len(value) == 3 and all(math.isfinite(v) for v in value)


def profile_for(root, row, flow_reviews):
    article = row['article']
    identity = f'ONIS:MV:{article}'
    if row['variant_id'] != identity or identifier(row['designation']) != identifier(row['exact_designation']):
        raise ValueError(f'Ambiguous ONIS MV identity: {identity}')
    source = checked_asset(root, row['source'], row['source_hash'], 'Equipment/Pumps/3D_ONIS_Normalized/MV')
    mesh = checked_asset(root, row['mesh'], row['mesh_hash'], 'frontend/public/model-assets')
    if source.suffix.lower() not in {'.step', '.stp'} or mesh.name != f"model-{row['source_hash']}-v1.stl":
        raise ValueError(f'Unexpected CAD source or display file: {identity}')
    with mesh.open('rb') as stream:
        header = stream.read(84)
    triangles = int.from_bytes(header[80:84], 'little')
    if len(header) != 84 or not triangles or mesh.stat().st_size != 84 + 50 * triangles:
        raise ValueError(f'Invalid STL: {identity}')

    measured = json.loads(row['profile_json'])
    if (measured.get('units') != 'mm' or measured.get('source', row['source']) != row['source']
            or measured.get('sourceHash', row['source_hash']) != row['source_hash']
            or measured.get('meshHash', row['mesh_hash']) != row['mesh_hash']):
        raise ValueError(f'Measured profile does not match its CAD assets: {identity}')
    bounds = measured['bounds']
    ports = measured['ports']
    warnings = measured['warnings']
    if (len(bounds) != 6 or not all(math.isfinite(v) for v in bounds)
            or any(bounds[i] >= bounds[i + 3] for i in range(3))
            or {port['id'] for port in ports} != {'port-a', 'port-b'} or len(ports) != 2
            or any(not vector(port['point']) or not vector(port['axis']) or abs(math.hypot(*port['axis']) - 1) > 1e-6 for port in ports)):
        raise ValueError(f'Invalid CAD coordinates: {identity}')
    if row['flow_status'] == 'reviewed_roles_from_source_geometry':
        review = flow_reviews[row['source_hash']]
        if (review['method'] != 'casing_arrows' or review['source'] != row['source']
                or review['inlet'] not in {'port-a', 'port-b'}
                or any(abs(a - b) > .01 for a, b in zip(review['bounds'], bounds, strict=True))
                or any(any(review['originalPorts'][port['id']][field] != port[field] for field in ('point', 'axis')) for port in ports)):
            raise ValueError(f'Flow review does not match its measured source: {identity}')
        ports = [{**port, 'id': 'inlet' if port['id'] == review['inlet'] else 'outlet', 'source': FLOW_NOTE} for port in ports]
        warnings = [warning for warning in warnings if not warning.startswith('Направление потока MV не подтверждено')]
    elif row['flow_status'] != 'unconfirmed_PORT_A_PORT_B_only':
        raise ValueError(f'Unrecognized flow evidence: {identity}')

    return identity, {
        'article': article,
        'designation': row['designation'],
        'profile': {
            'key': f'pump:{identity}', 'pumpId': identity, 'mapping': REVIEW_MAPPING,
            'source': row['source'], 'sourceHash': row['source_hash'], 'units': 'mm',
            'meshUrl': '/model-assets/' + mesh.name, 'meshHash': row['mesh_hash'],
            'bounds': bounds, 'ports': ports, 'warnings': [REVIEW_NOTE, *warnings],
        },
    }


def build(root):
    flow_reviews = json.loads((FRONTEND / 'data/onis-flow-reviews.json').read_text(encoding='utf-8'))
    database = root / 'database/catalog-v2/pumps.sqlite'
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute('''
            SELECT v.id AS variant_id, v.manufacturer_article AS article, m.designation, c.exact_designation,
                   c.flow_status, c.profile_json, a.path AS source, a.sha256 AS source_hash,
                   mesh.path AS mesh, mesh.sha256 AS mesh_hash
            FROM variants v JOIN models m ON m.id = v.model_id
            JOIN variant_cad_candidates x ON x.variant_id = v.id
            JOIN cad_bindings c ON c.id = x.binding_id AND c.model_id = m.id
            JOIN assets a ON a.id = c.asset_id JOIN assets mesh ON mesh.id = c.mesh_asset_id
            WHERE m.series_id = 'ONIS:MV'
              AND c.execution_match_status = 'exact_model_name; source_geometry_prepared; motor_material_mounting_execution_unconfirmed'
              AND x.applicability = 'prepared_source_candidate; not_assembly_approved'
              AND c.assembly_approved = 0 AND a.kind = 'cad_step' AND mesh.kind = 'cad_mesh'
            ORDER BY v.id
        ''').fetchall()
    models = dict(profile_for(root, row, flow_reviews) for row in rows)
    if not models or len(models) != len(rows):
        raise ValueError('No unambiguous prepared ONIS MV profiles')
    return {'version': 1, 'models': models}, Counter(row['flow_status'] for row in rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=FRONTEND / 'data/onis-mv-cad-models.json')
    args = parser.parse_args()
    content, counts = build(args.root.resolve())
    args.output.write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'profiles': len(content['models']), 'flow': counts}))
