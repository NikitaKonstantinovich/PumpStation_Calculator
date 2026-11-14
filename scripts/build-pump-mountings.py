"""Prepare catalogue mounting facts and an exhaustive coverage report.

Reads the source database and reviewed execution identities; never changes either.
Only explicitly reviewed drawing conventions below can produce a layout binding.
CAD candidates remain separate until compared with the exact execution's drawing.
"""
import argparse
import hashlib
import html
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('database')
    parser.add_argument('snapshot')
    parser.add_argument('output')
    args = parser.parse_args()
    app = Path(__file__).resolve().parent.parent
    root = Path(args.database).resolve().parents[2]
    out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(Path(args.database).resolve().as_uri()+'?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    query = lambda q: [dict(r) for r in db.execute(q)]
    drawing_rows = {r['variantId']:r for r in json.loads((app/'data/pump-drawings-reviewed.json').read_text(encoding='utf-8'))['rows']}
    motors = {r['variant_id']:r for r in query('SELECT * FROM motor_configurations')}
    identities = []
    for v in query('SELECT v.*, s.code AS series, f.name AS manufacturer FROM variants v JOIN models m ON m.id=v.model_id JOIN series s ON s.id=m.series_id JOIN manufacturers f ON f.id=s.manufacturer_id ORDER BY v.id'):
        identity = dict(variantId=v['id'],modelId=v['model_id'],designation=v['designation'],article=v['manufacturer_article'],manufacturer=v['manufacturer'],series=v['series'],motor={k:motors.get(v['id'],{}).get(k) for k in ['power_kw','phase_count','frequency_hz','speed_rpm','efficiency_class','protection_class']})
        drawing = drawing_rows.get(v['id'])
        identity['drawings'] = drawing['drawings'] if drawing and all(drawing[k] == val for k,val in identity.items()) else []
        identities.append(identity)
    pumps = {r['variantId']: r['pump'] for r in json.loads(Path(args.snapshot).read_text(encoding='utf-8'))['items']}
    sets = {r['id']: r for r in query('SELECT * FROM dimension_sets')}
    patterns = {r['dimension_set_id']: r for r in query('SELECT * FROM mounting_patterns')}
    profiles = {r['id']: r for r in query('SELECT * FROM catalogue_geometry_profiles')}
    assets = {r['id']: r for r in query('SELECT * FROM assets')}
    # Reviewed CDM round flange drawings: pages 56–65. Oval/thread/grooved
    # connections and single-phase executions have different geometry.
    # On pages 56–61 the circular flange callout is for flange bolts, not feet.
    # Retain the dimensioned base grid without assigning a bore diameter.
    cdm = {1:(56,100,180,None),3:(57,100,180,None),5:(58,100,180,None),10:(59,130,215,None),15:(60,130,215,None),20:(61,130,215,None),32:(62,170,240,14),42:(63,190,266,14),65:(64,190,266,14),85:(65,199,280,14)}
    cdm_path = root/'Equipment/Pumps/CDM_CDMF_220626.pdf'
    cdm_hash = hashlib.sha256(cdm_path.read_bytes()).hexdigest()
    rows = []
    for identity in identities:
        row = {k:v for k,v in identity.items() if k != 'drawings'}
        pump = pumps.get(row['variantId'], {})
        dims = pump.get('dimensions') or {}
        raw = {str(v['key']).lower():v.get('valueMm') for v in dims.get('sourceValues',[])}
        row.update(status='missing', missing=['Привязка монтажных отверстий и габаритов к исполнению'], drawings=identity.get('drawings',[]))
        gx = gy = diameter = foot = None
        source = None
        profile = (dims.get('baseGeometry') or {}).get('profileId')
        if profile in profiles and row['series'] == 'EVR':
            base = dims['baseGeometry']; values = {v['key']:v['value'] for v in base['sourceValues']}
            if values.get('mounting_hole_count') == 4:
                gx, gy = values.get('mounting_hole_spacing_transverse_to_flow'), values.get('mounting_hole_spacing_along_flow')
                diameter, foot = values.get('mounting_hole_diameter'), values.get('base_foot_thickness')
                p = profiles[profile]; asset = assets[p['document_asset_id']]
                source = {'path':asset['path'],'sha256':asset['sha256'],'page':p['pdf_page'],'profileId':profile,'scope':p['applicability']}
                width = max(base.get('base_width',0),raw.get('d1') or 0,2*(raw.get('d2') or 0))
                length = max(base.get('flange_face_to_face',0),raw.get('d1') or 0,2*(raw.get('d2') or 0))
        match = re.fullmatch(r'CDM(\d+)-[\d-]+FSWPC',row['designation'])
        if row['manufacturer'] == 'CNP' and match and row['motor'].get('phase_count') == 3:
            family = int(match[1]); selected = sets.get(dims.get('dimensionSetId'))
            if family in cdm and selected and selected['model_id'] == row['modelId'] and selected['exact_designation'] == row['designation']:
                page,gy,gx,diameter = cdm[family]
                if selected['document_page'] == page:
                    source = {'path':str(cdm_path.relative_to(root)).replace('\\','/'),'sha256':cdm_hash,'page':page,'dimensionSetId':selected['id'],'scope':'round_flange_three_phase_catalogue_geometry'}
                    width = max(dims.get('overall_width',0),raw.get('d1') or 0,2*(raw.get('d2') or 0))
                    length = max(dims.get('overall_length',0),raw.get('d1') or 0,2*(raw.get('d2') or 0))
        known_bore = isinstance(diameter,(float,int)) and diameter>0
        grid_without_bore = diameter is None and source and source['scope']=='round_flange_three_phase_catalogue_geometry'
        if source and (known_bore or grid_without_bore) and all(isinstance(v,(float,int)) and v>0 for v in [gx,gy,width,length]):
            row.update(status='catalogue_grid', missing=['Диаметр крепёжного болта','Диапазон зажима гайки-заклёпки']+([] if foot else ['Толщина крепёжной лапы']))
            row['evidence'] = source
            row['mounting'] = {
                'verified': True, 'scope':'catalogue_layout',
                'source': f"{source['path']}, стр. {source['page']}; {row['designation']}; схема основания. Огибающая корпуса консервативная, по габаритам и вылету двигателя; крепёж проверяется отдельно.",
                'axisDefinition': {'x':'Поперёк потока, вдоль ряда насосов','y':'Вдоль потока','origin':'Ось насосной части в плоскости основания'},
                'holes':[{'id':str(i),'owner':'pump','x':x*gx/2,'y':y*gy/2,'diameterMm':diameter} for i,(x,y) in enumerate([(-1,-1),(-1,1),(1,-1),(1,1)])],
                'bounds':{'minX':-width/2,'maxX':width/2,'minY':-length/2,'maxY':length/2},
                'footThicknessMm':foot,'boltDiameterMm':None,
            }
        elif dims.get('dimensionSetId') in patterns:
            row['status'] = 'partial'; row['candidatePattern'] = patterns[dims['dimensionSetId']]
        rows.append(row)
    if len(rows)!=len(pumps) or len({r['variantId']for r in rows})!=len(rows):
        raise ValueError('Execution coverage mismatch; do not publish a partial inventory')
    manifest={'schema':1,'version':'pump-mounting-catalogue-2026-11-11-v2','axisConvention':'frame-row-X_flow-Y','rows':rows}
    (app/'data/pump-mountings-reviewed.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    counts=dict(Counter(r['status']for r in rows));(out/'coverage.json').write_text(json.dumps({'total':len(rows),'counts':counts,'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    # Human-readable audit with a dimensioned view of every available grid.
    def svg(m):
        if not m:return 'Нет подтверждённой сетки'
        b=m['bounds'];w=b['maxX']-b['minX'];h=b['maxY']-b['minY']
        circles=''.join(f'<circle cx="{p["x"]}" cy="{p["y"]}" r="{(p["diameterMm"] or 4)/2}"/>' for p in m['holes'])
        gx=max(p['x']for p in m['holes'])-min(p['x']for p in m['holes']);gy=max(p['y']for p in m['holes'])-min(p['y']for p in m['holes'])
        diameter=m["holes"][0]["diameterMm"]
        bore=f'4 × Ø{diameter:g}' if diameter else 'диаметр отверстий не указан'
        return f'<svg width="180" height="145" viewBox="{b["minX"]-15} {b["minY"]-15} {w+30} {h+30}"><g fill="none" stroke="#246" stroke-width="2"><rect x="{b["minX"]}" y="{b["minY"]}" width="{w}" height="{h}"/>{circles}</g></svg><br>{gx:g} × {gy:g} мм; {bore}'
    body=''.join('<tr><td>'+html.escape(r['manufacturer']+' '+r['designation'])+'<small>'+html.escape(r['article'] or r['variantId'])+'</small></td><td>'+html.escape(r['status'])+'</td><td>'+svg(r.get('mounting'))+'</td><td>'+html.escape('; '.join(r['missing']))+'</td><td>'+html.escape(r.get('mounting',{}).get('source',''))+'</td></tr>' for r in rows)
    (out/'mounting-grids.html').write_text('<!doctype html><meta charset="utf-8"><title>Монтажные сетки насосов</title><style>body{font:14px system-ui;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ccc}small{display:block;color:#666}th{position:sticky;top:0;background:#eee}</style><h1>Монтажные сетки насосов</h1><p>Каталожная компоновка; не разрешение на изготовление. X — вдоль ряда, Y — вдоль потока. Крепёж проверяется отдельно.</p><p>'+html.escape(str(counts))+'</p><table><thead><tr><th>Исполнение</th><th>Статус</th><th>Сетка</th><th>Требуется</th><th>Источник</th></tr></thead><tbody>'+body+'</tbody></table>',encoding='utf-8')
    print(json.dumps({'total':len(rows),'counts':counts}))


if __name__=='__main__':main()
