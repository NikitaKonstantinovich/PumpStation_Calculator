// Read-only audit of the same public catalog and coordinate resolver used by the editor.
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs } from "../tests/load-ts.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const { resolvePumpSpatial } = await loadTs(new URL("../app/model-editor/pump-spatial.ts", import.meta.url));
const { catalogPumpPort } = await loadTs(new URL("../app/pump-ports.ts", import.meta.url));
const pumps = JSON.parse(await readFile(join(root, "public/pumps.json"), "utf8"));
const profiles = JSON.parse(await readFile(join(root, "public/model-assets/manifest.json"), "utf8")).profiles;
const rows = [];
for (const p of pumps) {
  const profile = profiles[p.id], r = resolvePumpSpatial(p, profile);
  let meshPresent = false;
  if (profile?.meshUrl?.startsWith("/model-assets/")) {
    try { await access(join(root, "public", profile.meshUrl)); meshPresent = true; } catch { /* no prepared file */ }
  }
  const port = side => {
    if (side === "inlet" && p.type === "submersible") return { applicable: false };
    const meta = catalogPumpPort(p.id, side), spatial = r.ports.find(v => v.id === side);
    return { applicable: true, dn: meta?.dn ?? null, connection: meta?.connection ?? null, maxPressureBar: meta?.maxPressure ?? null,
      pointMm: spatial?.point ?? null, axis: spatial?.axis ?? null, provisional: spatial?.provisional === true,
      source: meta?.source ?? null, spatialSource: spatial?.source ?? profile?.source ?? null };
  };
  const inlet = port("inlet"), outlet = port("outlet");
  const missing = [];
  r.info.dimensionsMm.forEach((v, i) => { if (v === null) missing.push(["длина L", "ширина W", "высота H"][i]); });
  for (const [label, pt] of [["вход", inlet], ["выход", outlet]]) {
    if (!pt.applicable) continue;
    if (!(pt.dn > 0)) missing.push(`DN: ${label}`);
    if (!pt.connection) missing.push(`тип соединения: ${label}`);
    if (!pt.pointMm) missing.push(`координаты и база отсчёта: ${label}`);
    else if (!pt.axis || Math.abs(Math.hypot(...pt.axis) - 1) > 1e-6) missing.push(`направление: ${label}`);
  }
  rows.push({ id: p.id, manufacturer: p.manufacturer, series: p.series, model: p.model, type: p.type,
    active: p.active !== false, selectable: p.selectable !== false, envelope: r.info.envelope, dimensionsMm: r.info.dimensionsMm,
    coordinateSystem: r.info.coordinateSystem, hasCadProfile: !!profile, meshPresent, inlet, outlet,
    unassignedPorts: r.ports.filter(p => !["inlet", "outlet"].includes(p.id)), missing,
    catalogDimensionKeys: Object.keys(p.dimensions ?? {}).filter(k => !k.startsWith("overall_")), source: p.source ?? null,
    spatialNote: r.note });
}
const counts = list => ({ total: list.length, availableInSelection: list.filter(p => p.active && p.selectable).length,
  completeEnvelope: list.filter(p => p.envelope !== "incomplete").length,
  missingEnvelope: list.filter(p => p.envelope === "incomplete").length,
  missingOutletCoordinates: list.filter(p => !p.outlet.pointMm).length,
  unassignedPortRoles: list.filter(p => p.unassignedPorts.length).length,
  missingInletDn: list.filter(p => p.inlet.applicable && !(p.inlet.dn > 0)).length,
  missingOutletDn: list.filter(p => !(p.outlet.dn > 0)).length,
  missingAnyRequired: list.filter(p => p.missing.length).length,
  preparedMesh: list.filter(p => p.meshPresent).length });
const report = { generatedAt: new Date().toISOString(), sources: ["public/pumps.json", "public/model-assets/manifest.json", "app/pump-nozzles.json", "app/pump-ports.ts"],
  notes: "DN и давление не задают пространственные координаты. Неоднозначные буквенные размеры требуют расшифровки. Предварительные CAD-точки не являются подтверждением монтажной точности. Для погружных насосов трубопроводный вход не требуется.",
  summary: counts(rows), byType: Object.fromEntries([...new Set(rows.map(p => p.type))].map(type => [type, counts(rows.filter(p => p.type === type))])),
  bySeries: Object.fromEntries([...new Set(rows.map(p => `${p.manufacturer} ${p.series}`))].sort().map(key => [key, counts(rows.filter(p => `${p.manufacturer} ${p.series}` === key))])), rows };
const out = resolve(process.argv[2] ?? join(root, "work/pump-spatial-audit-20261031"));
await mkdir(out, { recursive: true });
await writeFile(join(out, "audit.json"), JSON.stringify(report, null, 2));
const html = String.raw`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Габариты и патрубки насосов — аудит</title>
<style>body{font:15px system-ui;margin:24px;color:#182a36;background:#f6f8fa}h1{font-size:25px}input,select,button{padding:9px;margin:4px;border:1px solid #9aaeba;border-radius:5px}table{border-collapse:collapse;width:100%;background:white;font-size:13px}th,td{border:1px solid #dce3e8;padding:9px;vertical-align:top}th{background:#dfeaf0;position:sticky;top:0}small{color:#476071}#summary{line-height:1.7}.bad{color:#9a4217}details{margin-top:8px}td:first-child{min-width:210px}</style>
<h1>Габариты и патрубки насосов</h1><p id="summary"></p><p>Размеры — L × W × H, мм. Координаты — локальные X/Y/Z в системе, указанной в источнике. «—» означает отсутствие данных, не ноль. Вход погружного насоса: не применяется. Буквенные размеры без расшифровки не приняты за габариты. Наличие предварительных точек CAD не подтверждает точность монтажа.</p>
<input id="search" placeholder="Модель, ID, производитель, серия" size="45"><select id="filter"><option value="all">Все насосы</option><option value="gaps" selected>Есть недостающие данные</option><option value="bounds">Нет полных габаритов</option><option value="outlet">Нет координат выхода</option><option value="dn">Нет DN</option><option value="roles">Не назначены роли портов</option></select><select id="maker"><option value="">Все производители</option></select><label><input type="checkbox" id="active">Только доступные для выбора</label><p id="count"></p><button id="prev">← Назад</button><button id="next">Далее →</button>
<table><thead><tr><th>Позиция базы</th><th>Габариты / CAD</th><th>Вход</th><th>Напорный патрубок</th><th>Не хватает / источники</th></tr></thead><tbody id="rows"></tbody></table>
<script type="application/json" id="data">${JSON.stringify(report).replaceAll("<", "\\u003c")}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),$=id=>document.getElementById(id);let page=0;
$('summary').textContent='Проверено '+data.summary.total+' позиций. Нет полных габаритов: '+data.summary.missingEnvelope+'. Нет координат выхода: '+data.summary.missingOutletCoordinates+'. Дата: '+new Date(data.generatedAt).toLocaleString('ru-RU');
for(const maker of [...new Set(data.rows.map(r=>r.manufacturer))].sort()){const o=document.createElement('option');o.textContent=maker;o.value=maker;$('maker').append(o);}
const fmt=v=>v===null||v===undefined?'—':typeof v==='number'?Math.round(v*1000)/1000:String(v),vec=v=>v?v.map(fmt).join(' / '):'—';
function port(p){return !p.applicable?'Не применяется':'DN '+fmt(p.dn)+'; '+fmt(p.connection)+'; давление '+fmt(p.maxPressureBar)+' бар\nX/Y/Z: '+vec(p.pointMm)+'\nОсь: '+vec(p.axis)+(p.provisional?'\nПредварительные точки':'');}
function render(){const q=$('search').value.toLowerCase(),f=$('filter').value;const selected=data.rows.filter(r=>(!q||[r.id,r.manufacturer,r.series,r.model].join(' ').toLowerCase().includes(q))&&(!$('maker').value||r.manufacturer===$('maker').value)&&(!$('active').checked||r.active&&r.selectable)&&(f==='all'||f==='gaps'&&r.missing.length||f==='bounds'&&r.envelope==='incomplete'||f==='outlet'&&!r.outlet.pointMm||f==='roles'&&r.unassignedPorts.length||f==='dn'&&r.missing.some(v=>v.startsWith('DN:'))));
const pages=Math.max(1,Math.ceil(selected.length/100));page=Math.min(page,pages-1);$('count').textContent='Найдено '+selected.length+'; страница '+(page+1)+' / '+pages;$('prev').disabled=page===0;$('next').disabled=page===pages-1;$('rows').replaceChildren();
for(const r of selected.slice(page*100,(page+1)*100)){const tr=document.createElement('tr');const values=[r.manufacturer+' '+r.model+'\nID: '+r.id+'\n'+r.type,vec(r.dimensionsMm)+' мм\nИсточник: '+r.envelope+'\nCAD-профиль: '+(r.hasCadProfile?'да':'нет')+'; файл модели: '+(r.meshPresent?'да':'нет'),port(r.inlet),port(r.outlet),r.missing.join('\n')||'Обязательные поля заполнены'];for(const v of values){const td=document.createElement('td');td.style.whiteSpace='pre-line';td.textContent=v;tr.append(td);}const detail=document.createElement('details'),title=document.createElement('summary'),source=document.createElement('p');title.textContent='Источники и размерная схема';source.textContent=r.spatialNote+'\n'+(r.source||'')+'\nВход: '+(r.inlet.source||'—')+'\nВыход: '+(r.outlet.source||'—')+'\nИсточник координат: '+(r.outlet.spatialSource||r.inlet.spatialSource||'—')+'\nКлючи размеров каталога: '+r.catalogDimensionKeys.join(', ');detail.append(title,source);tr.lastChild.append(detail);$('rows').append(tr);}}
for(const id of ['search','filter','maker','active'])$(id).oninput=()=>{page=0;render();};$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};render();</script></html>`;
await writeFile(join(out, "index.html"), html);
console.log(JSON.stringify({ output: out, summary: report.summary, byType: report.byType }, null, 2));
