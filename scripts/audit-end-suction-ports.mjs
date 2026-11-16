// Exercise the same resolver used by the scene against the actual catalog.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalogSnapshot } from '../services/local-storage/node-catalog.mjs';
import { loadTs } from '../tests/load-ts.mjs';
const app = fileURLToPath(new URL('../', import.meta.url));
const arg = process.argv.find(a => a.startsWith('--snapshot='))?.slice(11);
const catalog = arg ? JSON.parse(await readFile(resolve(app, arg), 'utf8')).pump_catalog_v2
  : readCatalogSnapshot(resolve(app, '../../../database/catalog-v2/pumps.sqlite'));
const { preparedPumpCadModel } = await loadTs(new URL('../app/model-editor/prepared-pump-cad.ts', import.meta.url));
const { resolvePumpSpatial } = await loadTs(new URL('../app/model-editor/pump-spatial.ts', import.meta.url));
const rows = catalog.items.filter(i => i.pump.type === 'end_suction').map(({ pump }) => {
  const cad = preparedPumpCadModel(pump), r = resolvePumpSpatial(pump, cad?.profile);
  const hydraulicComplete = ['inlet', 'outlet'].every(side => pump[side]?.dn > 0 && pump[side]?.connection_type);
  const spatialComplete = ['inlet', 'outlet'].every(id => r.ports.some(p => p.id === id && p.point.every(Number.isFinite) && p.axis?.length === 3 && Math.abs(Math.hypot(...p.axis) - 1) < 1e-6));
  return { id: pump.id, manufacturer: pump.manufacturer, series: pump.series, model: pump.model, execution: pump.execution,
    inlet: pump.inlet, outlet: pump.outlet, hydraulicComplete, spatialComplete, basis: cad ? 'STEP' : spatialComplete ? 'drawing' : 'missing',
    ports: r.ports, dimensionsMm: r.info.dimensionsMm, issues: r.info.issues };
});
const groups = [...new Set(rows.map(r => r.manufacturer + ' / ' + r.series))].map(name => {
  const items = rows.filter(r => r.manufacturer + ' / ' + r.series === name);
  return { name, total: items.length, hydraulic: items.filter(r => r.hydraulicComplete).length, spatial: items.filter(r => r.spatialComplete).length };
});
const report = { snapshotId: catalog.id, checkedAt: new Date().toISOString(), total: rows.length,
  hydraulicComplete: rows.filter(r => r.hydraulicComplete).length, spatialComplete: rows.filter(r => r.spatialComplete).length,
  groups, missing: rows.filter(r => !r.spatialComplete), rows };
const out = resolve(app, 'outputs/end-suction-ports'); await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'audit.json'), JSON.stringify(report, null, 2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Патрубки консольных насосов</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;color:#183044;padding:0 20px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #d7e1e7}th{background:#edf4f7}details{margin:10px 0}code{font-size:13px}.pending{background:#fff2d4;padding:18px;border-radius:8px}small{color:#526877}</style><h1>Патрубки горизонтальных консольных насосов</h1><p>Проверено <b>${report.total}</b> исполнений. DN и присоединения: <b>${report.hydraulicComplete}</b>. Обе пространственные точки: <b>${report.spatialComplete}</b>.</p><table><tr><th>Серия</th><th>Исполнений</th><th>DN входа / выхода</th><th>Координаты и оси</th></tr>${groups.map(g => `<tr><td>${esc(g.name)}</td><td>${g.total}</td><td>${g.hydraulic}</td><td>${g.spatial}</td></tr>`).join('')}</table><div class="pending">${report.missing.map(r => `<b>${esc(r.model)}</b>: DN${esc(r.inlet.dn)} / DN${esc(r.outlet.dn)} заданы. Для координат нужен размерный чертёж именно этого исполнения. В заводском результате Aquastrong a32a58b44d3ba5200ddce94362672fc2 отсутствует Image.jpg, генератор сообщает Drawing is missing.`).join('<br>') || 'Пропусков нет.'}</div><p>Начало координат — центр всасывающего фланца. X направлена к двигателю, Z вверх. Нормаль всасывания −X, напора +Z. Для CAD используются плоскости соответствующего STEP; размерные схемы не переносятся на другую CAD-модель.</p><p>Неизвестные габариты не вычисляются из DN и упаковки. Координаты по справочным чертежам сохраняют отметку о проверке соответствия заказному исполнению.</p><p><a href="audit.json">Полный отчёт JSON</a></p><details><summary>Исполнения и источники</summary><table><tr><th>Насос</th><th>Вход / выход</th><th>Координата выхода, мм</th><th>Основание</th></tr>${rows.map(r => `<tr><td>${esc(r.model)}<br><small>${esc(r.execution)}</small></td><td>${esc(r.inlet?.dn)} / ${esc(r.outlet?.dn)}</td><td>${esc(r.ports.find(p => p.id === 'outlet')?.point.join('; ') ?? 'Нет данных')}</td><td><details><summary>${esc(r.basis)}</summary><small>${esc(r.ports.find(p => p.id === 'outlet')?.source ?? r.issues.join(' '))}</small></details></td></tr>`).join('')}</table></details><small>Снимок каталога ${esc(catalog.id)}</small></html>`;
await writeFile(resolve(out, 'report.html'), html);
console.log(JSON.stringify({ total: report.total, hydraulicComplete: report.hydraulicComplete, spatialComplete: report.spatialComplete, groups, missing: report.missing.map(r => r.model) }, null, 2));
if (rows.some(r => !r.hydraulicComplete) || report.missing.some(r => r.model !== 'EEZ65-50-200/214-2NZ')) process.exitCode = 1;
