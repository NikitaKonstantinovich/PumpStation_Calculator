import test from "node:test";
import assert from "node:assert/strict";
import { load, fixture, choose, sync, role, resources, parseProjectConfig } from "./fixtures/station-specification.mjs";

const { frameConstructionForPumpMass, projectFrameSelection } = await load("frame-selection");
const model = await load("model-editor/model");
const profiles = { version: 1, profiles: {} };
const catalogWithMass = (mass, secondary = 25) => resources.pumps.map(p => p.id === "318" ? { ...p, weightKg: mass } : p.id === "217" ? { ...p, weightKg: secondary } : p);
const rowFrame = p => role(p, "frame");

test("owner mass bands include sub-30 kg pumps and use the next construction at every threshold", () => {
  for (const [mass, code, height] of [
    [.01, "bent-4", 50], [29.999, "bent-4", 50], [30, "bent-4", 50], [49.999, "bent-4", 50],
    [50, "bent-5", 50], [50.001, "bent-5", 50], [99.999, "bent-5", 50],
    [100, "channel-8p", 80], [100.001, "channel-8p", 80], [299.999, "channel-8p", 80],
    [300, "channel-10p", 100], [300.001, "channel-10p", 100], [499.999, "channel-10p", 100],
    [500, "channel-12p", 120], [500.001, "channel-12p", 120], [999.999, "channel-12p", 120],
    [1000, "channel-14p", 140], [1000.001, "channel-14p", 140], [2500, "channel-14p", 140],
  ]) {
    const actual = frameConstructionForPumpMass(mass);
    assert.equal(actual.code, code, `${mass} kg`);
    assert.equal(actual.heightMm, height, `${mass} kg`);
  }
  assert.equal(frameConstructionForPumpMass(20).sheetThicknessMm, 4);
  assert.equal(frameConstructionForPumpMass(50).sheetThicknessMm, 5);
  for (const invalid of [null, undefined, 0, -1, NaN, Infinity, -Infinity, "50", true]) assert.equal(frameConstructionForPumpMass(invalid), null);
});

test("common frame uses the heaviest individual active pump, never their sum or an inactive circuit", () => {
  let p = choose(fixture(), "318", 6, 3);
  p = choose(p, "217", 1, 0, true);
  const pumps = catalogWithMass(40, 500);
  assert.equal(projectFrameSelection(p, pumps).construction.code, "bent-4");
  p.entities["station-settings"].stationType = "combined";
  assert.equal(projectFrameSelection(p, pumps).construction.code, "channel-12p");
  p.entities["station-settings"].stationType = "fire";
  p.entities["station-settings"].jockeyPump = true;
  assert.equal(projectFrameSelection(p, pumps).massKg, 500);
  p.entities["station-settings"].jockeyPump = false;
  assert.equal(projectFrameSelection(p, pumps).massKg, 40);
  p.entities["station-settings"].jockeyPump = true;
  assert.equal(projectFrameSelection(p, catalogWithMass(40, null)).construction, null);
  assert.equal(projectFrameSelection(p, null).construction, null);
});

test("specification updates frame construction without inventing dimensions, catalogue identity or price", () => {
  let p = fixture();
  for (const [mass, label, height] of [[20, /лист 4 мм/, 50], [50, /лист 5 мм/, 50], [100, /8П/, 80], [300, /10П/, 100], [500, /12П/, 120], [1000, /14П/, 140]]) {
    p = sync(p, { ...resources, pumps: catalogWithMass(mass) });
    const frame = rowFrame(p);
    assert.match(frame.name, label);
    assert.match(frame.details, new RegExp(`Высота ${height} мм`));
    assert.equal(frame.quantity, 1);
    assert.equal(frame.price, null);
    assert.equal(frame.equipmentId, undefined);
    assert.equal(frame.technicalStatus, "incomplete");
    assert.equal(p.entities["station-spec"].items.filter(i => i.option === "frame").length, 1);
    const restored = parseProjectConfig(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(rowFrame(sync(restored, { ...resources, pumps: catalogWithMass(mass) })), frame);
  }
  p = sync(p, { ...resources, pumps: catalogWithMass(null) });
  assert.equal(rowFrame(p).quantity, 0);
  assert.match(rowFrame(p).technicalNotes.join(" "), /масса одного насоса/);
});

test("explicit manual frame and price survive synchronization and receive an applicability warning", () => {
  const p = fixture();
  Object.assign(rowFrame(p), { name: "Рама по чертежу заказчика", quantity: 1, price: 12345, details: "1800 × 700", technicalStatus: "ready" });
  const frame = rowFrame(sync(p, { ...resources, pumps: catalogWithMass(300) }));
  assert.equal(frame.name, "Рама по чертежу заказчика");
  assert.equal(frame.details, "1800 × 700");
  assert.equal(frame.price, 12345);
  assert.equal(frame.technicalStatus, "stale");
});

test("3D frame, pump mounting plane and collectors use the selected height without scaling the pump", () => {
  const p = fixture();
  let pumpBounds;
  for (const [mass, height] of [[25, 50], [50, 50], [100, 80], [300, 100], [500, 120], [1000, 140]]) {
    const a = model.buildAssembly(p, catalogWithMass(mass), profiles);
    const frame = a.components.find(c => c.id === "frame");
    assert.equal(frame.parameters.height, height);
    assert.equal(frame.position[2], height / 2);
    for (const pump of a.components.filter(c => c.kind === "pump")) {
      assert.equal(pump.position[2] + pump.bounds[2], height);
      pumpBounds ??= pump.bounds;
      assert.deepEqual(pump.bounds, pumpBounds);
    }
    assert.equal(a.components.find(c => c.id === "collector-suction").position[2], a.components.find(c => c.kind === "pump").position[2]);
  }
  const unknown = model.buildAssembly(p, catalogWithMass(null), profiles).components.find(c => c.id === "frame");
  assert.match(unknown.name, /уточнить массу/);
  assert.match(unknown.sourceNote, /конструкция рамы не выбрана/);
});

test("3D refresh updates untouched automatic poses and preserves manual/legacy frame geometry", () => {
  const p = fixture();
  const before = model.buildAssembly(p, catalogWithMass(40), profiles);
  const after = model.buildAssembly(p, catalogWithMass(1000), profiles);
  const merged = model.mergeAssembly(before, after);
  assert.equal(merged.components.find(c => c.id === "frame").parameters.height, 140);
  const pump = merged.components.find(c => c.kind === "pump");
  assert.equal(pump.position[2] + pump.bounds[2], 140);
  assert.equal(merged.components.find(c => c.id === "collector-suction").position[2], pump.position[2]);
  const frame = before.components.find(c => c.id === "frame");
  const manual = model.editComponent(before, { id: "frame", patch: { parameters: { ...frame.parameters, height: 95 } } });
  assert.equal(model.mergeAssembly(manual, after).components.find(c => c.id === "frame").parameters.height, 95);
  const locked = model.editComponent(before, { id: "frame", patch: { locked: true } });
  assert.equal(model.mergeAssembly(locked, after).components.find(c => c.id === "frame").parameters.height, 50);
  const legacy = structuredClone(before);
  delete legacy.components.find(c => c.id === "frame").autoPose;
  const saved = model.mergeAssembly(legacy, after).components.find(c => c.id === "frame");
  assert.equal(saved.parameters.height, 50);
  assert.equal(saved.name, frame.name);
  assert.match(saved.sourceNote, /Сохранена ручная или прежняя геометрия/);
});
