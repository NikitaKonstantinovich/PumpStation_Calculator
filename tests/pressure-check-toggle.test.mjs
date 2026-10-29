import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadTs } from './load-ts.mjs';

const { createProject, parseProjectConfig } = await loadTs(new URL('../app/project-config.ts', import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL('../app/collector-project.ts', import.meta.url));
const { collectorPressureChecks } = await loadTs(new URL('../app/collector-calculations.ts', import.meta.url));
const { checkSuctionSpecPressure } = await loadTs(new URL('../app/suction-spec.ts', import.meta.url));
const { checkDischargeSpecPressure } = await loadTs(new URL('../app/discharge-spec.ts', import.meta.url));
const { suctionHydraulics } = await loadTs(new URL('../app/dn-defaults.ts', import.meta.url));
const { withoutPressureChecks } = await loadTs(new URL('../app/pressure-check-policy.ts', import.meta.url));
const { collectProjectIssues } = await loadTs(new URL('../app/diagnostics.ts', import.meta.url));
const { visibleSpecificationItems, specificationItemPresentation } = await loadTs(new URL('../app/specification-presentation.ts', import.meta.url));
const { specificationExportRows } = await loadTs(new URL('../app/specification-export.ts', import.meta.url));
const toggleUrl = new URL('../app/pressure-check-toggle.tsx', import.meta.url);
const toggleCode = ts.transpileModule(await readFile(toggleUrl, 'utf8'), { fileName: 'toggle.tsx', compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
const { PressureCheckToggle } = await loadTs(toggleUrl, { [toggleUrl.href]: toggleCode });
const { parseAccessibleProject } = await loadTs(new URL('../app/project-access.ts', import.meta.url));
const pump = { id: 'pressure-pump', manufacturer: 'Test', model: 'Fixture', series: 'Fixture', type: 'end_suction', power: 3, curve: [[0, 40], [60, 10]], price: 125, priceCurrency: 'RUB' };
const row = (section = 'pump', extra = {}) => ({ position: '01', name: 'Контрольная позиция', equipmentId: pump.id, details: 'DN50 · PN16', section, quantity: 2, price: 123, status: 'selected', ...extra });
function project() {
  const p = createProject();
  p.entities['station-settings'].inletHead = 200;
  Object.assign(p.entities['system-input'], { flowRate: 30, head: 25, staticHead: 5, workingPumpCount: 1, reservePumpCount: 1, selectedPumpId: pump.id, calculated: true });
  const port = { pumpId: pump.id, dn: 50, connection: 'flanged', maxPressure: 16, maxInletPressure: 16, source: 'fixture' };
  Object.assign(p.entities['station-dn'], { pn: 16, pumpSuctionPort: port, pumpDischargePort: port });
  return synchronizeCollectors(p);
}
const checked = (p, rows) => checkDischargeSpecPressure(p, checkSuctionSpecPressure(p, rows));

test('new and legacy projects enable validation; explicit false persists through JSON and authorized project parsing', () => {
  const p = createProject();
  assert.equal(p.entities['station-settings'].pressureChecksEnabled, true);
  delete p.entities['station-settings'].pressureChecksEnabled;
  assert.equal(parseProjectConfig(p).entities['station-settings'].pressureChecksEnabled, true);
  p.entities['station-settings'].pressureChecksEnabled = false;
  for (const role of ['pro', 'admin']) assert.equal(parseAccessibleProject(JSON.parse(JSON.stringify(p)), role).entities['station-settings'].pressureChecksEnabled, false);
  p.entities['station-settings'].pressureChecksEnabled = 'false';
  assert.equal(parseProjectConfig(p).entities['station-settings'].pressureChecksEnabled, true);
});

test('turning checks off clears inlet and outlet warnings; re-enabling recalculates current heads without altering price or PN', () => {
  const p = project(), settings = p.entities['station-settings'], original = row();
  const high = checked(p, [original])[0];
  assert.equal(high.inletPressureCheck.checks[0].status, 'exceeded');
  assert.equal(high.dischargePressureCheck.checks[0].status, 'exceeded');
  settings.pressureChecksEnabled = false;
  const off = checked(p, [high])[0];
  assert.deepEqual(JSON.parse(JSON.stringify(off)), original);
  assert.equal(suctionHydraulics(p.entities['station-dn'], p.entities['system-input'], settings).inletPressureCheck, null);
  settings.inletHead = 10;
  settings.pressureChecksEnabled = true;
  const low = checked(p, [off])[0];
  assert.equal(low.inletPressureCheck.checks[0].status, 'within-limit');
  assert.equal(low.dischargePressureCheck.checks[0].status, 'within-limit');
  assert.equal(low.status, 'selected');
  assert.equal(low.price, 123); assert.equal(low.quantity, 2);
  assert.equal(p.entities['station-dn'].pn, 16);
});

test('disabled checks do not read pressure sources or calculate collector BOMs', () => {
  const p = project(); p.entities['station-settings'].pressureChecksEnabled = false;
  const unavailable = new Proxy({}, { get() { throw new Error('Pressure source must not be read'); } });
  assert.deepEqual(checkSuctionSpecPressure(p, [row()], unavailable, unavailable), [row()]);
  assert.deepEqual(checkDischargeSpecPressure(p, [row()], unavailable, unavailable), [row()]);
  assert.deepEqual(collectorPressureChecks(unavailable, 200, unavailable, false), []);
});

test('unrelated clarification and confirmation statuses, description and prices survive pressure removal', () => {
  for (const status of ['selected', 'clarify', 'confirmation']) {
    const source = row('pump', { status, description: 'Предупреждение: проверить монтажные размеры' });
    const high = checked(project(), [source])[0];
    const clean = withoutPressureChecks(high);
    assert.equal(clean.status, status);
    assert.equal(clean.description, source.description); assert.equal(clean.price, source.price);
    assert.match(specificationItemPresentation(clean).warningText, /монтажные размеры/);
    assert.doesNotMatch(specificationItemPresentation(clean).warningText, /превышает|давление/);
  }
});

test('diagnostics and specification/export suppress cached pressure issues even before resynchronization', () => {
  const p = project(), item = checked(p, [row()])[0];
  p.entities['station-spec'].items = [item];
  assert.ok(collectProjectIssues(p, [pump], null, []).some(i => i.tool === 'spec' && /превышает/.test(i.message)));
  p.entities['station-settings'].pressureChecksEnabled = false;
  p.entities['station-settings'].inletHead = null;
  p.entities['station-settings'].usdRate = -1;
  const messages = collectProjectIssues(p, [pump], null, []);
  assert.ok(messages.some(i => i.id === 'settings/rates/usdRate'));
  assert.ok(!messages.some(i => i.id.endsWith('/pressure') || i.id.includes('/pressure/') || i.id === 'settings/inlet-head'));
  assert.ok(!messages.some(i => /давление неизвестно|превышает PN|проверка.*давления/.test(i.message)));
  const visible = visibleSpecificationItems(p.entities['station-spec'], p.entities['station-settings']);
  assert.equal(specificationItemPresentation(visible[0]).hasWarning, false);
  const exported = specificationExportRows(visible, [{ title: 'Насосы', sections: [{ id: 'pump' }] }]);
  assert.equal(exported.find(r => r.kind === 'item').cells[7], '');
  assert.ok(item.inletPressureCheck, 'presentation must not mutate the saved source');
});

test('collector synchronization and reopening remove obsolete pressure statuses while preserving saved collector price', () => {
  let p = project(), c = p.entities['station-collectors'].suction;
  c.databaseStatus = 'found'; c.database = { id: 'collector-saved', code: c.code, price: 12345 };
  p = synchronizeCollectors(p);
  assert.equal(p.entities['station-spec'].items.find(i => i.option === 'suctionCollector').status, 'confirmation');
  p.entities['station-settings'].pressureChecksEnabled = false;
  p = synchronizeCollectors(p);
  const collector = p.entities['station-spec'].items.find(i => i.option === 'suctionCollector');
  assert.equal(collector.status, 'selected'); assert.equal(collector.price, 12345); assert.equal(collector.inletPressureCheck, undefined);
  p.entities['station-spec'].items.push(checked(project(), [row()])[0]);
  const restored = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.ok(restored.entities['station-spec'].items.every(i => !i.inletPressureCheck && !i.dischargePressureCheck));
});

test('ribbon switch renders a named accessible control and explicit enabled/disabled state', () => {
  for (const enabled of [true, false]) {
    const html = renderToStaticMarkup(createElement(PressureCheckToggle, { enabled, onChange() {} }));
    assert.match(html, /role="switch"/); assert.match(html, /aria-label="Проверка давления"/);
    assert.ok(html.includes(`aria-checked="${enabled}"`));
    assert.ok(html.includes(enabled ? 'Включена' : 'Выключена'));
  }
});
