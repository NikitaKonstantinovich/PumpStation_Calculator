import assert from "node:assert/strict";
import test from "node:test";
import { calculations, component, requirement, insertionDesign, selectStationInsertion } from "./fixtures/station-insertions.mjs";
import { load, resources, fixture, sync, rows, choose, parseProjectConfig } from "./fixtures/station-specification.mjs";
const { lineSpecParts, selectJointFasteners } = await load("line-spec-parts");
const { insertionPrice } = await load("calculated-insertion");
const { insertionEndThickness } = await load("line-joint-stack");
const { specificationLineTotal, assessSpecification } = await load("specification-readiness");
const { specificationExportRows, specificationCsv } = await load("specification-export");
const { addPumpConnectionAssembly } = await load("line-vibration");
const valid = (material = "st20", pn = 16, geometry = "straight") => {
  const c = calculations.find(c => c.material === material && c.pn === pn && c.geometry === geometry && c.complete && c.dnLarge === 80);
  assert.ok(c, `${material} PN${pn} ${geometry}`); return c;
};
test("exact calculated insert wins over the table for both materials and PN16/25, without price substitution", () => {
  for (const material of ["st20", "aisi304"]) for (const pn of [16, 25]) {
    const c = valid(material, pn), item = component(c), req = requirement(c);
    const selected = selectStationInsertion([...resources.components.items, item], req);
    assert.equal(selected.item.id, item.id); assert.equal(selected.exact, true);
    const unpriced = component({ ...c, price: null });
    assert.equal(selectStationInsertion([unpriced, ...resources.components.items], req).item.id, unpriced.id);
    assert.equal(selectStationInsertion([unpriced], req).technicalStatus, "ready");
    assert.equal(insertionPrice(unpriced.calculatedInsertion), null);
  }
});
test("all physical mismatches and unknown required dimensions refuse exact matching", () => {
  const c = valid(), item = component(c), req = requirement(c);
  const cases = [r => r.material = "aisi304", r => r.pn = 25, r => r.from.dn++, r => r.to.dn++, r => r.from.connection = "threaded", r => r.to.connection = "collar", r => r.geometry = "eccentric",
    r => r.design.totalLengthMm++, r => r.design.configuration.sensor.requested = true, r => r.design.configuration.axialLeftMm++, r => r.design.configuration.base = "different pipe", r => delete r.design, r => r.design.configuration.baseLengthMm = null, r => r.purpose = "unknown"];
  for (const change of cases) { const r = structuredClone(req); change(r); const selected = selectStationInsertion([item], r); assert.equal(selected.exact, false); assert.equal(selected.item, undefined); }
});
test("orientation, revision, stale source, and deterministic ties are independent of list ordering and price", () => {
  const c = valid("st20", 16, "eccentric"), a = component(c, "a"), b = component(c, "b", { revision: 2 });
  assert.equal(selectStationInsertion([a], requirement(c, true)).reversed, true);
  for (const items of [[a, b], [b, a]]) assert.equal(selectStationInsertion(items, requirement(c)).item.id, b.id);
  b.calculatedInsertion.currentCatalogVersion = "new-version";
  assert.equal(selectStationInsertion([b, a], requirement(c)).item.id, a.id);
  const stale = selectStationInsertion([b], requirement(c));
  assert.equal(stale.technicalStatus, "stale"); assert.equal(stale.exact, false); assert.equal(insertionPrice(b.calculatedInsertion), null);
  assert.match(stale.explanation, /ревизия/);
});
test("missing BOM roles, partial costs and engineering assumptions remain incomplete", () => {
  const c = valid(), req = requirement(c);
  for (const change of [c => c.bom.pop(), c => c.bom[0].cost = null, c => c.bom[0].unitPrice = null, c => c.price++, c => c.complete = false]) {
    const item = component(c); change(item.calculatedInsertion.calculation); assert.equal(insertionPrice(item.calculatedInsertion), null);
    assert.ok(selectStationInsertion([item], req).findings.length);
  }
  const item = component(c); item.calculatedInsertion.calculation.assumptions = [{ code: "sensor-pn25-pressure", message: "TEST pressure decision", source: "TEST" }];
  assert.equal(selectStationInsertion([item], req).technicalStatus, "incomplete");
});
test("both lines, circuits and vibration modes count the supplied BOM once and preserve external joints", () => {
  for (const material of ["st20", "aisi304"]) for (const pn of [16, 25]) for (const section of ["suction", "discharge"]) for (const prefix of ["primary", "secondary"]) for (const vibration of [false, true]) {
    const c = valid(material, pn, section === "suction" ? "eccentric" : "concentric"), item = component(c), result = [];
    const db = { ...resources.components, items: [...resources.components.items, item] };
    const designs = { [`${section}:${prefix}-reducer`]: insertionDesign(c) };
    const collector = { material }, parts = lineSpecParts(result, section, "test", collector, db, db.collectorCatalog, designs);
    parts.gasket(`${prefix}-external-valve-gaskets`,c.dnLarge,pn,6);
    addPumpConnectionAssembly({ parts, database: db, catalog: db.collectorCatalog, collector, port: { dn: c.dnSmall, connection: "flanged", source: "TEST" }, valveDn: c.dnLarge, connection: "flanged", pn, count: 3, prefix, title: prefix, vibration, terminal: "check" });
    const assembly = result.find(row => row.insertionAssembly);
    assert.ok(assembly, JSON.stringify({ material, pn, section, prefix, vibration }));
    assert.equal(assembly.quantity, 3); assert.equal(assembly.price, c.price);
    assert.equal(specificationLineTotal(assembly), 3 * c.price);
    const bom=assembly.insertionAssembly.snapshot.calculation.bom;
    for(const kind of ["weldFlange","looseFlange","collar"]){
      const supplied=bom.filter(part=>part.kind===kind).reduce((sum,part)=>sum+part.quantity,0);
      const external=result.filter(row=>row.assemblyRole.endsWith(`-${kind}`)).reduce((sum,row)=>sum+row.quantity,0);
      if(supplied===2) assert.equal(external,0,`included ${kind} must not be added again`);
      if(kind==="looseFlange"&&c.leftConnection==="collar"&&!supplied) assert.equal(external,6,"loose flanges excluded from factory BOM remain external");
    }
    assert.ok(result.some(row => /fasteners-bolts/.test(row.assemblyRole)));
    assert.ok(result.some(row => /gasket/.test(row.assemblyRole)));
    assert.ok(result.find(row => /pump-fasteners-bolts/.test(row.assemblyRole)).price === null, "unknown own pump flange never receives invented bolt length");
  }
});
test("confirmed insert dimensions reach the bolt stack and exclude replacement by a generic flange", () => {
  const c = valid("st20"), item = component(c), row = { insertionAssembly: { snapshot: item.calculatedInsertion, reversed: false, accounting: "assembly" } };
  const thickness = insertionEndThickness(row, "from", resources.components); assert.ok(thickness > 0);
  const missing = structuredClone(row); missing.insertionAssembly.snapshot.calculation.bom.find(b => b.role === "left-flanged").componentId = "missing-real-flange";
  assert.equal(insertionEndThickness(missing, "from", resources.components), null);
  assert.equal(selectJointFasteners(resources.components, "st20", 80, 16, { gaskets: 1, thickness: 0, flangeThickness: null }).bolt, undefined);
});
test("station sync, save/load, count change and second/jockey circuits retain manual rows and no duplicates", () => {
  for (const mode of ["utility", "combined", "fire"]) {
    let p = fixture(); p.entities["station-settings"].stationType = mode; p.entities["station-settings"].jockeyPump = mode === "fire";
    if (mode !== "utility") choose(p, "318", 1, 1, true);
    p.entities["station-spec"].items.push({ position: "m", name: "Manual", details: "", quantity: 1, price: 12, status: "selected", section: "suction" });
    p = sync(p);
    const candidates = [];
    for (const row of rows(p).filter(row => row.insertionRequirement)) {
      const req = row.insertionRequirement;
      const c = calculations.find(c => c.complete && c.material === req.material && c.pn === req.pn && c.geometry === req.geometry && c.dnLarge === Math.max(req.from.dn, req.to.dn) && c.dnSmall === Math.min(req.from.dn, req.to.dn));
      if (c) { candidates.push(component(c, row.assemblyRole)); (p.entities["station-dn"].insertionDesigns ??= {})[req.location] = insertionDesign(c); }
    }
    assert.ok(candidates.length);
    const data = { ...resources, components: { ...resources.components, items: [...resources.components.items, ...candidates] } };
    p = sync(p, data); assert.ok(rows(p).some(r => r.insertionAssembly));
    assert.deepEqual(sync(p, data), p);
    const restored = sync(parseProjectConfig(JSON.parse(JSON.stringify(p))), data);
    assert.deepEqual(restored.entities["station-dn"].insertionDesigns, p.entities["station-dn"].insertionDesigns);
    assert.equal(rows(restored).filter(r => r.name === "Manual").length, 1);
    choose(restored, "318", 3, 1); const changed = sync(restored, data);
    assert.ok(rows(changed).filter(r => r.insertionAssembly && r.assemblyRole.startsWith("primary")).every(r => r.quantity === 4));
    const identities = rows(changed).filter(r => r.generatedBy).map(r => `${r.section}:${r.assemblyRole ?? r.option}`);
    assert.equal(new Set(identities).size, identities.length);
    assert.equal(assessSpecification(changed).knownTotal, rows(changed).filter(r => r.quantity > 0).reduce((sum, row) => sum + specificationLineTotal(row), 0));
  }
});
test("draft and explanatory BOM survive CSV export without a second cost row", () => {
  const c = valid(), item = component({ ...c, price: null }), result = [], requirement = { fromDn:80,toDn:80,fromConnection:"flanged",toConnection:"flanged",pn:16,purpose:"between-valves" };
  const parts = lineSpecParts(result,"discharge","test",{material:"st20"},{items:[item]},resources.components.collectorCatalog,{"discharge:primary-between-valves-insertion":insertionDesign(c)});
  parts.insertion("primary-between-valves-insertion","Insert",3,"",requirement);
  const exported = specificationExportRows(result,[{title:"Line",sections:[{id:"discharge"}]}]);
  assert.equal(exported.filter(r=>r.kind==="item").length,1);
  const csv=specificationCsv(exported); assert.match(csv,/Полная актуальная стоимость вставки не подтверждена/); assert.match(csv,/не суммируется повторно/); assert.match(csv,/welding/);
  assert.equal(exported.find(r=>r.kind==="item").cells[5],null);
});
test("thread standard, gender and end orientation are mandatory, not inferred from DN", () => {
  // Hypothetical end is confined to this test; no source catalogue is altered.
  const c=structuredClone(calculations.find(c=>c.complete&&c.material==="st20"&&c.pn===16&&c.dnLarge===50&&c.geometry==="straight"));
  assert.ok(c);
  const physical=JSON.parse(c.configuration.left.part); physical[0]="threadEnd";physical[15]="G2";physical[16]="male";
  c.leftConnection="threaded";c.threadLeft="G2";c.configuration.left={connection:"threaded",part:JSON.stringify(physical),looseFlange:null};
  const part=c.bom.find(p=>p.role==="left-flanged");part.role="left-threaded";part.kind="threadEnd";
  const item=component(c), req=requirement(c);
  assert.equal(selectStationInsertion([item],req).exact,true);
  for(const patch of [{thread:"R2"},{gender:"female"},{thread:"G1"}]){
    const r=structuredClone(req);Object.assign(r.from,patch);assert.equal(selectStationInsertion([item],r).item,undefined);
  }
  const unknown=structuredClone(req);unknown.design.threadLeft=null;
  assert.equal(selectStationInsertion([item],unknown).item,undefined);
  assert.equal(selectStationInsertion([item],requirement(c,true)).reversed,true);
});
test("a sourced compensator thickness and the selected insert define only their own joint", async () => {
  const {equipmentFlangeThickness,flangeStack}=await load("line-joint-stack");
  const c=valid(), item=component(c), row={insertionAssembly:{snapshot:item.calculatedInsertion,reversed:false,accounting:"assembly"}};
  const own={fields:[{headerPath:["Толщина фланца, мм"],value:20},{headerPath:["Источник толщины фланца"],value:"TEST measured compensator"},{headerPath:["Дата проверки толщины фланца"],value:"2026-10-28"}]};
  assert.equal(equipmentFlangeThickness(own),20);
  const thickness=flangeStack(equipmentFlangeThickness(own),insertionEndThickness(row,"from",resources.components));
  assert.ok(selectJointFasteners(resources.components,"st20",80,16,{gaskets:1,thickness:0,flangeThickness:thickness}).bolt);
  assert.equal(equipmentFlangeThickness({...own,fields:own.fields.slice(0,2)}),null);
});

test("station sensor policy filters candidates and rejects a saved incompatible execution", async () => {
  const { insertionOrientations } = await load("station-insertion-selection");
  const { generateInsertCalculations, catalog } = await import("./fixtures/station-insertions.mjs");
  const c = generateInsertCalculations({ dnFrom: 80, dnTo: 80, materials: ["st20"], withSensorNipple: true, includeEccentric: false }, catalog).find(c => c.complete && c.pn === 16 && c.geometry === "concentric");
  assert.ok(c);
  const item = component(c), req = { ...requirement(c), withSensorNipple: true };
  assert.equal(selectStationInsertion([item], req).item.id, item.id);
  assert.ok(insertionOrientations(item, req).length);
  assert.deepEqual(insertionOrientations(item, { ...req, withSensorNipple: false }), []);
  assert.equal(selectStationInsertion([item], { ...req, withSensorNipple: false }).item, undefined);
  assert.equal(selectStationInsertion([item], { ...req, geometry: "eccentric" }).item, undefined);
  const invalid = component(c); invalid.calculatedInsertion.calculation.configuration.sensor.dn = 20;
  assert.deepEqual(insertionOrientations(invalid, req), []);
  const plain = component(valid());
  assert.equal(selectStationInsertion([plain], { ...requirement(plain.calculatedInsertion.calculation), withSensorNipple: true }).item, undefined);
});
