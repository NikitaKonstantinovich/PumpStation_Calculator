import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
const json = async p => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const { mountingRotation } = await loadTs(new URL("../app/model-editor/line-assembly.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const { calculateCollector } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const { lineGeometryIds } = await loadTs(new URL("../app/model-editor/specification-models.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { lineGeometry } = await loadTs(new URL("../app/line-geometry-catalog.ts", import.meta.url));
const pumps = await json("../public/pumps.json"), profiles = await json("../public/model-assets/manifest.json"), binding = await json("../public/binding-components.json");
const db = { ...binding, collectorCatalog: makeCollectorCatalog(binding) };
const pageUrl = new URL("../app/full-workspace.tsx", import.meta.url), page = await readFile(pageUrl, "utf8"), shared = await readFile(new URL("../app/allowed-pump-tools.tsx", import.meta.url), "utf8");
const source = [
  'import {recommendedDn,defaultCollectorMaterial,resolveDnConnection,suctionHydraulics,dischargeHydraulics} from "./dn-defaults";',
  'import {buildSuctionSpec,replaceSuctionSpec,checkSuctionSpecPressure} from "./suction-spec";',
  'import {buildDischargeSpec,replaceDischargeSpec,checkDischargeSpecPressure} from "./discharge-spec";',
  'import {normalizeSpecificationItems,specificationOption} from "./specification-items";',
  'import {synchronizeCollectors} from "./collector-project";',
  'import {bindProjectComponents} from "./base-values-components";',
  shared.match(/^export const isCalculated =.*$/m)[0], page.match(/^const isSecondaryEnabled =.*$/m)[0], shared.match(/^export const componentFieldLabel=.*$/m)[0],
  page.slice(page.indexOf("const isJockeyCircuit="), page.indexOf("function DnCalculator(")),
  page.slice(page.indexOf("const HYDRAULIC_SPEC_OPTIONS:"), page.indexOf("function PanelContent(")),
  "let loadedComponentsDatabase; export {refreshSuctionSpecification as refresh};",
].join("\n");
const { refresh } = await loadTs(pageUrl, { [pageUrl.href]: source });
const empty = { version: 1, revision: "test", items: {}, issues: [] };
function station(id = "nu-b1879e1e3807d907", dn = 40, discharge = 32, connection = "threaded") {
  const p = createProject("Обвязка", { id: "line-test", timestamp: "2026-10-26T00:00:00Z" });
  Object.assign(p.entities["system-input"], { selectedPumpId: id, calculated: true, flowRate: 21, head: 18, staticHead: 0, workingPumpCount: 2, reservePumpCount: 1 });
  Object.assign(p.entities["station-settings"], { inletHead: 10, stationType: "utility" });
  Object.assign(p.entities["station-dn"], { suctionValveDn: dn, dischargeValveDn: discharge, connectionType: connection, suctionValveType: connection === "threaded" ? "ball" : "butterfly", dischargeValveType: connection === "threaded" ? "ball" : "butterfly", pn: 16,
    pumpSuctionPort: { pumpId: id, dn, connection, source: "Явно задано в проекте" }, pumpDischargePort: { pumpId: id, dn: discharge, connection, source: "Явно задано в проекте" } });
  return refresh(synchronizeCollectors(p), db, true);
}
const build = (p, data = empty, pr = profiles) => model.buildAssembly(p, pumps, pr, data);
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-6, `${a} != ${b}`);
const vecClose = (a,b) => a.forEach((v,i) => close(v,b[i]));
async function realLineCatalog(p) {
  const source = await json("../public/component-insert-source.json"), catalog = makeInsertCatalog(source);
  const { insertionGeometryContext } = await loadTs(new URL("../app/component-insert-3d-server.ts", import.meta.url), {
    [new URL("../app/auth-server.ts", import.meta.url).href]: "export const sha256 = async () => 'unused';",
  });
  const { suctionCatalogItems } = await loadTs(new URL("../app/suction-catalog.ts", import.meta.url));
  const context = insertionGeometryContext(source, catalog), items = new Map([...binding.items, ...source.items, ...suctionCatalogItems].map(i=>[i.id,i]));
  return {...empty, items:Object.fromEntries(lineGeometryIds(p).filter(id=>items.has(id)).map(id=>[id,lineGeometry(items.get(id),catalog,context)]))};
}

test("CDM42 loose flanges seat on collar backs; opposite collars face valves and the real hollow insert separates check and shutoff", async () => {
  const pump = pumps.find(p=>p.model==='CDM42-1-1'); assert.ok(pump);
  const p=station(pump.id,65,65,'flanged'), data=await realLineCatalog(p), a=build(p,data);
  assert.ok(!model.connectionIssues(a).some(i=>i.message.includes('типы соединения стыка не совпадают')));
  const wp=(c,id)=>model.add(c.position,model.rotate(c.ports.find(p=>p.id===id).point,c.rotation));
  const axis=c=>model.rotate([1,0,0],c.rotation);
  const dot=(x,y)=>x.reduce((s,v,i)=>s+v*y[i],0);
  for (const pump of a.components.filter(c=>c.kind==='pump')) for (const side of ['suction','discharge']) {
    const parts=a.components.filter(c=>c.line?.pumpId===pump.id && c.line.side===side);
    for (const flange of parts.filter(c=>c.line.role.endsWith('-looseFlange'))) {
      const collar=parts.find(c=>c.line.role===flange.line.role.replace('-looseFlange','-collar') && c.line.instance===flange.line.instance);
      assert.ok(collar); vecClose(wp(flange,'left'),wp(collar,'flange-seat')); vecClose(axis(flange),axis(collar));
      assert.ok(a.lineJoints.some(j=>j.a.componentId===collar.id && j.b.componentId===flange.id));
    }
    if (side === 'suction') {
      assert.ok(!parts.some(c=>/primary-(insertion|pump-flange|valve-flange|pump-gasket)/.test(c.line.role)));
      assert.equal(parts.filter(c=>c.line.role==='primary-valve-gaskets').length,2);
      continue;
    }
    const pipe=parts.find(c=>c.line.role===(side==='suction'?'primary-insertion':'primary-between-valves-insertion'));
    assert.ok(pipe); assert.equal(pipe.shape.kind,'tube'); close(pipe.shape.lengthMm,120); close(pipe.shape.outerMm,76.1); close(pipe.shape.innerMm,71.1);
    const left=parts.find(c=>c.line.role===(side==='suction'?'primary-pump-flange-collar':'primary-between-valves-flanges-collar') && c.line.instance===0);
    const right=parts.find(c=>c.line.role===(side==='suction'?'primary-valve-flange-collar':'primary-between-valves-flanges-collar') && c.line.instance===(side==='suction'?0:1));
    vecClose(wp(left,'right'),wp(pipe,'left')); vecClose(wp(right,'right'),wp(pipe,'right'));
    close(dot(axis(left),axis(pipe)),1); close(dot(axis(right),axis(pipe)),-1);
    if (side==='discharge') {
      const check=parts.find(c=>c.line.role==='primaryCheckValve'), valve=parts.find(c=>c.line.role==='primaryDischargeValve');
      assert.ok(dot(model.subtract(wp(pipe,'left'),wp(check,'right')),axis(pipe))>0);
      assert.ok(dot(model.subtract(wp(valve,'left'),wp(pipe,'right')),axis(pipe))>0);
    }
  }
  const old=structuredClone(a), auto=old.components.find(c=>c.line?.role.endsWith('-looseFlange'));
  auto.position[2]+=100; auto.line.baseline.position=[...auto.position];
  const manual=old.components.find(c=>c.line?.role.endsWith('-looseFlange') && c.id!==auto.id);
  manual.position[2]+=9;manual.hidden=true;
  const reopened=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:old}))).assembly;
  const fixed=model.mergeAssembly(reopened,build(p,data));
  vecClose(fixed.components.find(c=>c.id===auto.id).position,a.components.find(c=>c.id===auto.id).position);
  vecClose(fixed.components.find(c=>c.id===manual.id).position,manual.position);assert.equal(fixed.components.find(c=>c.id===manual.id).hidden,true);
});

test("welded-flange insertion uses the calculator's 5 mm face offsets and full pipe wall instead of stacking flange thicknesses", async () => {
  const p=station('9',65,65,'flanged');
  p.entities['station-spec'].items=[
    {position:'04.30',section:'discharge',assemblyRole:'primary-between-valves-flanges-weldFlange',equipmentId:'фланцы-002-r0033',name:'Фланец DN65',details:'PN16',quantity:6,unit:'шт.'},
    {position:'04.31',section:'discharge',assemblyRole:'primary-between-valves-insertion',equipmentId:'suction-table:ff-65',name:'Вставка ФФ DN65',details:'PN16',quantity:3,unit:'шт.'},
  ];
  const a=build(p,await realLineCatalog(p));
  const parts=a.components.filter(c=>c.line?.pumpId===a.components.find(c=>c.kind==='pump').id&&c.line.side==='discharge');
  const pipe=parts.find(c=>c.kind==='pipe'); assert.ok(pipe);
  close(pipe.shape.lengthMm,192);close(pipe.shape.outerMm,76);close(pipe.shape.innerMm,69);
  const ends=parts.filter(c=>c.line.role.endsWith('weldFlange'));
  const wp=c=>model.add(c.position,model.rotate(c.ports.find(p=>p.id==='left').point,c.rotation));
  close(Math.hypot(...model.subtract(wp(ends[1]),wp(ends[0]))),202);
});

test("real ECH threaded specification becomes three distinct inlet/outlet branches without flanged substitutions", () => {
  const p = station(), a = build(p), ps = a.components.filter(c => c.kind === "pump");
  assert.equal(ps.length, 3); assert.equal(a.components.filter(c => c.routing).length, 0);
  for (const pump of ps) {
    const inlet = a.components.filter(c => c.line?.pumpId === pump.id && c.line.side === "suction" && !c.line.auxiliary);
    const outlet = a.components.filter(c => c.line?.pumpId === pump.id && c.line.side === "discharge" && !c.line.auxiliary);
    assert.deepEqual(inlet.map(c => c.line.role), ["primary-union", "primarySuctionValve"]);
    assert.deepEqual(outlet.map(c => c.line.role), ["primary-union", "primaryCheckValve", "primary-between-valves-nipple", "primaryDischargeValve"]);
    assert.ok(inlet.some(c => /DN40/.test(c.name))); assert.ok(outlet.some(c => /DN32/.test(c.name)));
    assert.ok([...inlet, ...outlet].every(c => !/затвор|фланец/i.test(c.name)));
  }
  assert.equal(new Set(a.components.map(c => c.id)).size, a.components.length);
  assert.ok(model.connectionIssues(a).some(i => /монтажн|геометри/.test(i.message)));
});

test("ECH threaded discharge follows +Z, suction stays horizontal, and explicit CAD axes keep priority",async()=>{
  const p=station(),data=await realLineCatalog(p),a=build(p,data);
  for(const pump of a.components.filter(c=>c.kind==="pump"))for(const side of ["suction","discharge"]){
    const axis=side==="discharge"?[0,0,1]:[-1,0,0];
    vecClose(pump.ports.find(p=>p.id===(side==="discharge"?"outlet":"inlet")).axis,axis);
    for(const c of a.components.filter(c=>c.line?.pumpId===pump.id&&c.line.side===side&&!c.line.auxiliary)){
      const first=c.ports.find(p=>p.id===c.line.ports[0]),last=c.ports.find(p=>p.id===c.line.ports[1]);
      vecClose(model.rotate(last.axis,c.rotation),axis);
      const from=model.worldPoint(c,first.point),to=model.worldPoint(c,last.point);
      close(model.subtract(to,from).reduce((s,v,i)=>s+v*axis[i],0),c.line.length??0);
    }
  }
  const pr=structuredClone(profiles),id=p.entities["system-input"].selectedPumpId;
  pr.profiles[id].ports.find(p=>p.id==="outlet").axis=[1,0,0];
  const explicit=build(p,data,pr);assert.ok(explicit.components.filter(c=>c.kind==="pump").every(c=>JSON.stringify(c.ports.find(p=>p.id==="outlet").axis)==="[1,0,0]"));
  assert.ok(!model.connectionIssues(a).some(i=>/соединение нарушено/.test(i.message)));
});

test("flanged parts, individual gaskets and fastener quantities match the real aggregated specification", () => {
  const p = station("9", 80, 80, "flanged"), a = build(p);
  for (const row of p.entities["station-spec"].items.filter(r => r.assemblyRole?.startsWith("primary-") && !/flax|error/.test(r.assemblyRole))) {
    const parts = a.components.filter(c => c.line?.role === row.assemblyRole && c.line.side === row.section);
    assert.equal(parts.reduce((s,c) => s+c.line.quantity, 0), row.quantity, row.assemblyRole);
  }
  for (const side of ["suction", "discharge"]) {
    const c = a.components.find(c => c.id === `collector-${side}`);
    vecClose(model.rotate([1,0,0], c.rotation), [0,1,0]);
  }
});

test("vibration toggle replaces the assembly without stale untouched compensators", () => {
  let p = station("9", 80, 80, "flanged"); const before = build(p);
  p.entities["station-settings"].vibrationCompensators = true; p = refresh(synchronizeCollectors(p), db, true);
  const withVibration = model.mergeAssembly(before, build(p));
  assert.equal(withVibration.components.filter(c => c.line?.role === "primary-vibration-compensator").length, 6);
  for (const pump of withVibration.components.filter(c => c.kind === "pump")) {
    const chain = withVibration.components.filter(c => c.line?.pumpId === pump.id && c.line.side === "discharge");
    assert.ok(chain.findIndex(c => /vibration-compensator/.test(c.line.role)) < chain.findIndex(c => /after-vibration-insertion$/.test(c.line.role)));
    assert.equal(chain.filter(c => c.line.role === "primary-between-valves-insertion").length, 1);
  }
  p.entities["station-settings"].vibrationCompensators = false; p = refresh(synchronizeCollectors(p), db, true);
  assert.ok(!model.mergeAssembly(withVibration, build(p)).components.some(c => c.line?.role.includes("vibration")));
});

test("both physical collectors survive vibration and insertion changes and move to the new branch endpoints",async()=>{
  let p=station("371",100,100,"flanged");
  for(const side of ["suction","discharge"])p.entities["station-collectors"][side].overrides.dn=200;
  p=synchronizeCollectors(p);
  for(const side of ["suction","discharge"]){const c=p.entities["station-collectors"][side];c.calculation=calculateCollector(c.configuration,db.collectorCatalog);c.calculationSourceFingerprint=c.sourceFingerprint;}
  p=synchronizeCollectors(p);let assembly=build(p,await realLineCatalog(p));
  const starting=structuredClone(assembly),lengths=Object.fromEntries(["suction","discharge"].map(side=>[side,assembly.components.find(c=>c.id===`collector-${side}`).collector.template.main.lengthMm]));
  const savedCalculations=JSON.stringify([p.entities["station-collectors"].suction.calculation,p.entities["station-collectors"].discharge.calculation]);
  for(const enabled of [true,false,true]){
    p.entities["station-model"].editor={...model.emptyEditor(),assembly};p.entities["station-settings"].vibrationCompensators=enabled;
    if(enabled)p.entities["station-dn"].insertionDesigns={"suction:primary-after-vibration-insertion":{totalLengthMm:186},"discharge:primary-after-vibration-insertion":{totalLengthMm:186}};
    else delete p.entities["station-dn"].insertionDesigns;
    p=refresh(synchronizeCollectors(p),db,true);assembly=model.mergeAssembly(assembly,build(p,await realLineCatalog(p)));
    assert.equal(JSON.stringify([p.entities["station-collectors"].suction.calculation,p.entities["station-collectors"].discharge.calculation]),savedCalculations);
    assert.equal(assembly.components.filter(c=>c.line?.role==="primary-vibration-compensator").length,enabled?6:0);
    for(const side of ["suction","discharge"]){
      const c=assembly.components.find(c=>c.id===`collector-${side}`);assert.ok(c.collector.template.main);assert.equal(c.collector.template.main.lengthMm,lengths[side]);assert.equal(c.collector.template.branches.filter(b=>b.role==="branch").length,3);assert.notEqual(p.entities["station-collectors"][side].status,"stale");
      const ends=assembly.lineJoints.filter(j=>j.b.componentId===c.id);assert.equal(ends.length,3);for(const end of ends)vecClose(model.portPoint(assembly,end.a),model.portPoint(assembly,end.b));
      if(enabled)assert.ok(Math.abs(c.position[0]-starting.components.find(old=>old.id===c.id).position[0])>100,"collector must move with the added mounting lengths");
    }
  }
});

test("a real selected reducer mounts its small end towards the pump without stretching the CAD", async () => {
  let p = station("9",80,80,"flanged");
  p.entities["station-dn"].pumpSuctionPort.dn = 65;
  p.entities["station-dn"].pumpDischargePort.dn = 65;
  p = refresh(synchronizeCollectors(p),db,true);
  const rows = p.entities["station-spec"].items.filter(r=>r.assemblyRole?.endsWith("-reducer"));
  assert.equal(rows.length,2);
  const source = await json("../public/component-insert-source.json"), catalog = makeInsertCatalog(source);
  const {insertionGeometryContext} = await loadTs(new URL("../app/component-insert-3d-server.ts",import.meta.url), { [new URL("../app/auth-server.ts",import.meta.url).href]: 'export const sha256=async()=>"a".repeat(64);' });
  const context = insertionGeometryContext(source,catalog), data = {...empty,items:{}};
  for (const row of rows) {
    const item = source.items.find(i=>i.id===row.equipmentId); assert.ok(item);
    data.items[item.id] = lineGeometry(item,catalog,context);
  }
  const a=build(p,data), reducers=a.components.filter(c=>c.line?.role.endsWith("-reducer"));
  assert.equal(reducers.length,6);
  for (const c of reducers) {
    assert.equal(c.ports.find(p=>p.id===c.line.ports[0]).dn,65);
    assert.equal(c.ports.find(p=>p.id===c.line.ports[1]).dn,80);
    assert.equal(c.line.length,data.items[c.equipmentId].length);
  }
});

test("catalog eccentric reducers stay flat on top when the small end faces horizontal pump ports", async () => {
  const f = await json("./fixtures/insertion-3d.json");
  const part = f.catalog.parts.find(p => p.geometry === "eccentric"), item = f.source.items.find(i => i.id === part.id);
  assert.ok(item);
  const g = lineGeometry(item, f.catalog, {catalog:f.catalog,flanges:{},models:{}}), s = g.shape;
  assert.equal(s.kind,"reducer-outline");
  close(s.offset[2]+s.smallOuterMm/2,s.outerMm/2);
  vecClose(g.ports[1].point,[g.length,0,s.offset[2]]);
  for (const axis of [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0]]) {
    const rotation = mountingRotation([-1,0,0],axis,[0,0,1]);
    const largeTop = model.rotate([0,0,s.outerMm/2],rotation);
    const smallTop = model.rotate([g.length,0,s.offset[2]+s.smallOuterMm/2],rotation);
    close(largeTop[2],smallTop[2]);
    assert.ok(model.rotate([g.length,0,s.offset[2]-s.smallOuterMm/2],rotation)[2] > model.rotate([0,0,-s.outerMm/2],rotation)[2]);
  }
});

test("known mounting planes form a dimension chain; movement breaks the joint and undo restores it", () => {
  const p = station(), row = p.entities["station-spec"].items.find(r => r.option === "primaryDischargeValve");
  const descriptor = { equipmentId: row.equipmentId, source: "Контрольная геометрия монтажных плоскостей", revision: "1", length: 123, fidelity: "parametric", issues: [], shape: { kind: "tube", outerMm: 42.4, innerMm: 36.4, lengthMm: 123 }, ports: [{ id: "left", point: [0,0,0], axis: [-1,0,0], provisional: false }, { id: "right", point: [123,0,0], axis: [1,0,0], provisional: false }] };
  const a = build(p, { ...empty, items: { [row.equipmentId]: descriptor } });
  const valve = a.components.find(c => c.line?.role === row.option);
  close(model.distance(model.worldPoint(valve, valve.ports[0].point), model.worldPoint(valve, valve.ports[1].point)),123);
  const moved = model.editComponent(a, { id: valve.id, patch: { position: model.add(valve.position,[100,0,0]), rotation: [0,0,31] } });
  assert.ok(model.connectionIssues(moved).some(i => /соединение нарушено/.test(i.message)));
  const h = model.execute(model.createHistory(a), moved); assert.deepEqual(model.undo(h).present,a); assert.deepEqual(model.redo(model.undo(h)).present,moved);
  const updated = model.mergeAssembly(moved, build(p, { ...empty, items: { [row.equipmentId]: { ...descriptor, length: 150 } } }));
  const same = updated.components.find(c => c.id === valve.id); assert.deepEqual(same.position, moved.components.find(c => c.id === valve.id).position);
  const loaded = model.normalizeEditor(JSON.parse(JSON.stringify({ ...model.emptyEditor(), assembly: updated }))).assembly;
  assert.deepEqual(loaded.lineJoints, updated.lineJoints); assert.deepEqual(loaded.components.find(c => c.id === valve.id).line, same.line);
});

test("frame-to-frame mounting handles horizontal, vertical and oblique ports without losing roll", () => {
  for (const axis of [[1,0,0],[-1,0,0],[0,0,1],[0,1,0],[Math.SQRT1_2,0,Math.SQRT1_2]]) {
    const r = mountingRotation([1,0,0],axis); vecClose(model.rotate([1,0,0],r),axis);
  }
});

test("gasket CAD is matched by execution, catalogue identity, thickness and required PN; no ring invented for missing sizes", async () => {
  const src = await json("../public/component-insert-source.json"), cat = makeInsertCatalog(src), context = { catalog: cat, flanges: {}, models: {} };
  const item = binding.items.find(r => r.catalogId === "прокладки" && r.fields.some(f => f.headerPath.at(-1) === "DN" && f.value === 65));
  const g = lineGeometry(item, cat, context);
  assert.ok(g.gasketModels.some(m => m.pn === 25)); assert.equal(g.shape, undefined); assert.equal(g.length,2);
  const p = station("9",65,65,"flanged"); p.entities["station-spec"].items = [{ position:"03.30", section:"suction", assemblyRole:"primary-pump-gasket", equipmentId:item.id, name:"Прокладка", details:"DN65 · соединение PN25", quantity:3, unit:"шт.", price:1, status:"selected" }];
  const a = build(p, { ...empty, items: { [item.id]:g } });
  const parts = a.components.filter(c => c.line); assert.equal(parts.length,3); assert.ok(parts.every(c => c.shape.kind === "mesh" && c.line.length === 2));
  const bad = structuredClone(item); bad.fields.find(f => f.headerPath.at(-1) === "Толщина, мм").value = 3;
  assert.equal(lineGeometry(bad,cat,context).gasketModels.length,0);
  p.entities["station-spec"].items[0].details = "DN65 · соединение PN16";
  assert.ok(build(p,{...empty,items:{[item.id]:g}}).components.filter(c => c.line).every(c => c.shape === undefined));
});

test("pipe wall geometry has an open bore and actual annular end faces", async () => {
  const url = new URL("../app/model-editor/insertion-renderer.ts", import.meta.url);
  const renderer = await loadTs(url, { [url.href]: (await readFile(url,"utf8")).replace('from "three"', `from ${JSON.stringify(new URL("../node_modules/three/build/three.module.js",import.meta.url).href)}`) });
  const THREE = await import("three");
  const geometry = renderer.ringGeometry({ kind:"tube", outerMm:114.3, innerMm:108.3, lengthMm:137 });
  geometry.computeBoundingBox(); close(geometry.boundingBox.max.x,137); close(geometry.boundingBox.min.x,0);
  const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})); mesh.updateMatrixWorld(true);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(-10,0,0),new THREE.Vector3(1,0,0)).intersectObject(mesh).length,0);
  assert.ok(new THREE.Raycaster(new THREE.Vector3(-10,55,0),new THREE.Vector3(1,0,0)).intersectObject(mesh).length > 0);
  geometry.dispose();mesh.material.dispose();
});

test("DENDOR valves render existing STEP meshes by series, DN and drive, preserving CAD length discrepancies", async () => {
  const p=station("9",65,65,"flanged"), source=await json("../public/component-insert-source.json"), catalog=makeInsertCatalog(source);
  const data={...empty,items:{}};
  for (const row of p.entities["station-spec"].items.filter(r=>/Valve$/.test(r.option??""))) {
    const item=binding.items.find(i=>i.id===row.equipmentId); assert.ok(item);
    data.items[item.id]=lineGeometry(item,catalog,{catalog,flanges:{},models:{}});
  }
  const a=build(p,data), valves=a.components.filter(c=>/SuctionValve$|DischargeValve$/.test(c.line?.role??""));
  assert.equal(valves.length,6); assert.ok(valves.every(c=>c.shape?.kind==="mesh"));
  assert.ok(valves.every(c=>c.line.length===46 && c.shape.meshUrl.includes("33eb90ce")));
  assert.ok(valves.every(c=>c.line.issues.some(i=>i.includes("каталог 45 мм"))));
  assert.equal(a.components.filter(c=>/CheckValve$/.test(c.line?.role??"") && c.shape?.kind==="mesh").length,3);
  for (const row of p.entities["station-spec"].items.filter(r=>/Valve$/.test(r.option??""))) row.details=row.details.replace("PN16","PN25");
  assert.ok(build(p,data).components.filter(c=>/Valve$/.test(c.line?.role??"")).every(c=>!c.shape));
});

test("editing a parametric branch pipe rebuilds its bore and ports and survives merge and reopen", () => {
  const p=station(), row=p.entities["station-spec"].items.find(r=>r.assemblyRole==="primary-between-valves-nipple");
  const g={equipmentId:row.equipmentId,kind:"pipe",source:"Контрольная труба с подтверждёнными размерами",revision:"1",length:137,wall:3,shape:{kind:"tube",lengthMm:137,outerMm:114.3,innerMm:108.3},ports:[{id:"left",point:[0,0,0],axis:[-1,0,0]},{id:"right",point:[137,0,0],axis:[1,0,0]}],fidelity:"parametric",issues:[]};
  const data={...empty,items:{[row.equipmentId]:g}}, a=build(p,data), c=a.components.find(c=>c.kind==="pipe");
  const edited=model.editComponent(a,{id:c.id,patch:{parameters:{...c.parameters,length:211,diameter:108,wallThickness:4}}});
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:edited}))).assembly;
  const merged=model.mergeAssembly(saved,build(p,data)), pipe=merged.components.find(v=>v.id===c.id);
  assert.equal(pipe.shape.lengthMm,211); assert.equal(pipe.shape.innerMm,100); assert.equal(pipe.parameters.wallThickness,4);
  vecClose(pipe.ports.find(p=>p.id==="right").point,[211,0,0]); close(model.routeLength(merged,pipe),211);
  assert.equal(pipe.line.manualGeometry,true);
  const invalid=model.editComponent(merged,{id:c.id,patch:{parameters:{...pipe.parameters,wallThickness:55}}});
  assert.equal(invalid.components.find(v=>v.id===c.id).shape.innerMm,100);
});

test("reopening preserves manual visibility, fixation, opacity, port metadata and identity", () => {
  const p = station(), a = build(p), c = a.components.find(c => c.line);
  const edited = model.editComponent(a,{id:c.id,patch:{position:[120,220,330],rotation:[10,20,30],hidden:true,opacity:.3,locked:true}});
  p.entities["station-model"].editor = {...model.emptyEditor(),assembly:edited,selectedId:c.id};
  const loaded = parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-model"].editor.assembly;
  const merged = model.mergeAssembly(loaded,build(p)); const restored = merged.components.find(v => v.id === c.id);
  assert.deepEqual(restored.position,[120,220,330]);assert.deepEqual(restored.rotation,[10,20,30]);assert.equal(restored.hidden,true);assert.equal(restored.locked,true);assert.equal(restored.opacity,.3);
  assert.equal(new Set(merged.components.map(v => v.id)).size,merged.components.length);
});

test("collector follows a new automatic position, but manual dimensions and locked poses survive updates", () => {
  const p = station(), a = build(p), id = "collector-suction", c = a.components.find(c => c.id === id);
  const next = structuredClone(a), changed = next.components.find(c => c.id === id);
  changed.position[0] -= 250; changed.autoPose.position = [...changed.position]; changed.parameters.length += 200;
  changed.autoPose.parametersKey = JSON.stringify(changed.parameters);
  assert.deepEqual(model.mergeAssembly(a,next).components.find(c=>c.id===id).position,changed.position);
  const edited = model.editComponent(a,{id,patch:{parameters:{...c.parameters,length:1234,diameter:114.3,wallThickness:3}}});
  const saved = model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:edited}))).assembly;
  const kept = model.mergeAssembly(saved,next).components.find(c=>c.id===id);
  assert.equal(kept.parameters.length,1234); assert.equal(kept.parameters.wallThickness,3); assert.deepEqual(kept.position,c.position);
  const locked = model.editComponent(a,{id,patch:{locked:true}});
  assert.deepEqual(model.mergeAssembly(locked,next).components.find(c=>c.id===id).position,c.position);
});

test("active second circuit builds its own branches and reserves, without multiplying common rows", () => {
  let p = station();
  p.entities["station-settings"].stationType = "combined";
  Object.assign(p.entities["system-input-2"], { selectedPumpId: "90", calculated: true, flowRate: 4, head: 30, staticHead: 0, workingPumpCount: 1, reservePumpCount: 1 });
  Object.assign(p.entities["station-dn"], { secondarySuctionValveDn: 40, secondaryDischargeValveDn: 40, secondaryConnectionType: "threaded", secondaryPn: 16, secondarySuctionValveType: "ball", secondaryDischargeValveType: "ball",
    secondaryPumpSuctionPort: { pumpId:"90",dn:40,connection:"threaded",source:"Контрольный проект" }, secondaryPumpDischargePort: { pumpId:"90",dn:40,connection:"threaded",source:"Контрольный проект" } });
  p = refresh(synchronizeCollectors(p),db,true);
  const a = build(p);
  assert.equal(a.components.filter(c=>c.kind==="pump").length,5);
  assert.equal(a.components.filter(c=>c.line?.role==="secondaryCheckValve").length,2);
  assert.equal(a.components.filter(c=>c.line?.role==="primaryCheckValve").length,3);
  assert.ok(!a.components.some(c=>c.line?.role.startsWith("network")));
});

test("expanded flanged branches exceeding the legacy 500-part limit survive reopening", () => {
  let p=station("9",80,80,"flanged");
  p.entities["station-settings"].stationType="combined";
  Object.assign(p.entities["system-input"],{workingPumpCount:6,reservePumpCount:6});
  Object.assign(p.entities["system-input-2"],{...p.entities["system-input"]});
  Object.assign(p.entities["station-dn"],{secondarySuctionValveDn:80,secondaryDischargeValveDn:80,secondaryConnectionType:"flanged",secondaryPn:16,secondarySuctionValveType:"butterfly",secondaryDischargeValveType:"butterfly",secondaryPumpSuctionPort:{...p.entities["station-dn"].pumpSuctionPort},secondaryPumpDischargePort:{...p.entities["station-dn"].pumpDischargePort}});
  p=refresh(synchronizeCollectors(p),db,true);
  const a=build(p); assert.ok(a.components.length>500);
  const loaded=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly;
  assert.equal(loaded.components.length,a.components.length); assert.equal(loaded.lineJoints.length,a.lineJoints.length);
});

test("saved insertion keeps its calculated bore and seats, without duplicate constituent flanges", async () => {
  const fixture = await json("./fixtures/insertion-3d.json");
  const {prepareInsertionTemplate} = await loadTs(new URL("../app/model-editor/insertion-template.ts",import.meta.url));
  const {insertionGeometryContext} = await loadTs(new URL("../app/component-insert-3d-server.ts",import.meta.url), { [new URL("../app/auth-server.ts",import.meta.url).href]: 'export const sha256=async()=>"a".repeat(64);' });
  const template = {...prepareInsertionTemplate(fixture.rows[0],insertionGeometryContext(fixture.source,fixture.catalog),{id:"saved-insert",revision:1},0),geometryKey:"a".repeat(64)};
  const p = station("9",65,65,"flanged"), id = "calculated-insertion:saved-insert";
  const left = template.geometry.pieces.find(p=>p.id==="left"), right = template.geometry.pieces.find(p=>p.id==="right");
  p.entities["station-spec"].items = [
    {position:"04.40",section:"discharge",assemblyRole:"primary-pump-insertion",equipmentId:id,name:"Вставка из расчёта",details:"PN25",quantity:3,unit:"шт.",status:"selected"},
    {position:"04.41",section:"discharge",assemblyRole:"primary-pump-flange-weldFlange",equipmentId:left.componentId,name:left.name,details:"PN25",quantity:3,unit:"шт.",status:"selected"},
    {position:"04.42",section:"discharge",assemblyRole:"primary-check-flange-weldFlange",equipmentId:right.componentId,name:right.name,details:"PN25",quantity:3,unit:"шт.",status:"selected"}
  ];
  const data = {...empty,items:{[id]:{equipmentId:id,source:"Сохранённый расчёт",revision:"1",template,length:137,ports:template.geometry.ports,bounds:template.geometry.bounds,fidelity:"parametric",issues:[]}}};
  const a=build(p,data), parts=a.components.filter(c=>c.line);
  assert.equal(parts.length,3); assert.ok(parts.every(c=>c.insertion));
  assert.equal(parts[0].insertion.template.geometry.baseLengthMm,127);
  assert.equal(parts[0].insertion.template.geometry.totalLengthMm,137);
  assert.ok(model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:a}))).assembly.components.filter(c=>c.line).every(c=>c.insertion));
  const edited = structuredClone(a), c = edited.components.find(c=>c.line);
  c.line.manualGeometry = true; c.insertion.template.geometry.eccentricAngleDeg = 90;
  c.insertion.hiddenPieceIds = ["left"];
  const reloaded = model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:edited}))).assembly;
  const merged = model.mergeAssembly(reloaded,build(p,data)).components.find(v=>v.id===c.id);
  assert.equal(merged.insertion.template.geometry.eccentricAngleDeg,90);
  assert.deepEqual(merged.insertion.hiddenPieceIds,["left"]); assert.equal(merged.line.manualGeometry,true);
});

test("prepared CAD refresh preserves the canonical mounting frame and manual pose", () => {
  const p=station(), row=p.entities["station-spec"].items.find(r=>r.option==="primaryDischargeValve");
  const data={...empty,items:{[row.equipmentId]:{equipmentId:row.equipmentId,revision:"1",source:"Контрольные монтажные данные",length:120,ports:[{id:"left",point:[0,0,0],axis:[-1,0,0]},{id:"right",point:[120,0,0],axis:[1,0,0]}],fidelity:"missing",issues:[]}}};
  const a=build(p,data), selected=a.components.find(c=>c.line?.role===row.option);
  const moved=model.editComponent(a,{id:selected.id,patch:{position:[10,20,30],rotation:[20,10,15],opacity:.4,hidden:true,locked:true}});
  const hash="f".repeat(64), prepared={version:1,profiles:{},equipment:{[`equipment:${row.equipmentId}`]:{source:"verified.step",sourceHash:hash,bounds:[-30,-30,0,30,30,120],meshUrl:`/model-assets/model-${hash}-v1.stl`,mapping:"reviewed",warnings:[],ports:[{id:"inlet",point:[0,0,0],axis:[0,0,-1],provisional:false},{id:"outlet",point:[0,0,120],axis:[0,0,1],provisional:false}]}}};
  const updated=model.refreshModelAssets(moved,p,pumps,model.combineProfiles(profiles,prepared),data), c=updated.components.find(c=>c.id===selected.id);
  assert.deepEqual(c.position,[10,20,30]);assert.deepEqual(c.rotation,[20,10,15]);assert.equal(c.opacity,.4);assert.equal(c.hidden,true);assert.equal(c.locked,true);
  vecClose(c.ports[0].point,[0,0,0]);vecClose(c.ports[1].point,[120,0,0]);assert.equal(c.shape.kind,"mesh");
  assert.equal(updated.components.filter(c=>c.equipmentId===row.equipmentId).length,3);
});

for (const side of ["suction", "discharge"]) for (const vibration of [false, true]) for (const reducer of [false, true]) {
  test(`${side}: mounting planes, BOM and lengths agree for vibration=${vibration}, reducer=${reducer}`, async () => {
    let p = station("9", reducer ? 80 : 65, reducer ? 80 : 65, "flanged");
    Object.assign(p.entities["station-dn"].pumpSuctionPort, { dn: 65 });
    Object.assign(p.entities["station-dn"].pumpDischargePort, { dn: 65 });
    p.entities["station-settings"].vibrationCompensators = vibration;
    p = refresh(synchronizeCollectors(p), db, true);
    const data = await realLineCatalog(p);
    const a = build(p, data);
    const terminal = side === "suction" ? "primarySuctionValve" : "primaryCheckValve";
    for (const pump of a.components.filter(c => c.kind === "pump")) {
      const chain = a.components.filter(c => c.line?.pumpId === pump.id && c.line.side === side && !c.line.auxiliary);
      const firstValve = chain.findIndex(c => c.line.role === terminal);
      assert.ok(firstValve >= 0);
      const before = chain.slice(0, firstValve).filter(c => !/gasket|flange|collar/i.test(c.line.role));
      assert.deepEqual(before.map(c => c.line.role), [
        ...(vibration ? ["primary-vibration-compensator"] : []),
        ...(reducer ? ["primary-reducer"] : vibration ? ["primary-after-vibration-insertion"] : []),
      ]);
      assert.ok(chain.every(c => c.line.length > 0), "all selected mounting lengths in this fixture are known");
      const start = pump.ports.find(port => port.id === (side === "suction" ? "inlet" : "outlet"));
      const last = chain.at(-1), end = model.worldPoint(last, last.ports.find(port => port.id === last.line.ports[1]).point);
      const axis = model.rotate(start.axis, pump.rotation);
      close(model.subtract(end, model.worldPoint(pump, start.point)).reduce((sum, value, i) => sum + value * axis[i], 0), chain.reduce((sum, c) => sum + c.line.length, 0));
      for (const joint of a.lineJoints.filter(j => chain.some(c => c.id === j.b.componentId) && j.kind !== "seat")) {
        const left = a.components.find(c => c.id === joint.a.componentId), right = a.components.find(c => c.id === joint.b.componentId);
        vecClose(model.worldPoint(left, left.ports.find(port => port.id === joint.a.portId).point), model.worldPoint(right, right.ports.find(port => port.id === joint.b.portId).point));
      }
    }
    for (const row of p.entities["station-spec"].items.filter(row => row.section === side && row.assemblyRole?.startsWith("primary-") && !/flax|error/.test(row.assemblyRole))) {
      close(a.components.filter(c => c.line?.side === side && c.line.role === row.assemblyRole).reduce((sum, c) => sum + c.line.quantity, 0), row.quantity);
    }
    assert.ok(!model.connectionIssues(a).some(i => /несовместимые DN стыка|типы соединения стыка не совпадают|соединение нарушено/.test(i.message)));
  });
}

test("saved scenes remove obsolete pump spacers and hardware even when locked; current equipment and manual parts survive", async () => {
  let p = station("9", 65, 65, "flanged");
  p.entities["station-settings"].vibrationCompensators = true;
  p = refresh(synchronizeCollectors(p), db, true);
  const previous = build(p, await realLineCatalog(p));
  for (const c of previous.components.filter(c => c.line?.role.includes("vibration"))) {
    c.locked = true;
    c.position[2] += 30;
    c.line.manualGeometry = true;
  }
  const legacy = structuredClone(previous.components.find(c => c.line?.role === "primary-after-vibration-insertion"));
  legacy.id = "legacy-pump-spacer"; legacy.line.role = "primary-pump-insertion";
  previous.components.push(legacy);
  const withManual = model.addManualPipe(previous, "manual-pipe");
  p.entities["station-settings"].vibrationCompensators = false;
  p = refresh(synchronizeCollectors(parseProjectConfig(JSON.parse(JSON.stringify(p)))), db, true);
  const generated = build(p, await realLineCatalog(p));
  const restored = model.normalizeEditor(JSON.parse(JSON.stringify({ ...model.emptyEditor(), assembly: withManual }))).assembly;
  const merged = model.mergeAssembly(restored, generated);
  assert.ok(!merged.components.some(c => c.id === legacy.id || c.line?.role.includes("vibration")));
  assert.deepEqual(merged.components.find(c => c.id === "manual-pipe"), restored.components.find(c => c.id === "manual-pipe"));
  assert.deepEqual(merged.components.filter(c => c.kind === "pump").map(c => [c.equipmentId, c.position]), generated.components.filter(c => c.kind === "pump").map(c => [c.equipmentId, c.position]));
  assert.deepEqual(model.mergeAssembly(merged, generated), merged);
});

test("unverified PN25 mounting data stays explicit and introduces no hidden 40 mm spacing", async () => {
  let p = station("9",65,65,"flanged");
  p.entities["station-settings"].vibrationCompensators = true;
  p = refresh(synchronizeCollectors(p),db,true);
  p.entities["station-dn"].pn = 25;
  p = refresh(synchronizeCollectors(p),db,true);
  const a = build(p,await realLineCatalog(p));
  const compensators = a.components.filter(c=>c.line?.role.endsWith("vibration-compensator"));
  assert.ok(compensators.length);
  assert.ok(compensators.every(c=>c.line.length===null && c.line.issues.some(i=>/монтажная длина/.test(i))));
  for (const c of compensators) {
    const joint = a.lineJoints.find(j=>j.a.componentId===c.id);
    const right = a.components.find(item=>item.id===joint.b.componentId);
    vecClose(model.worldPoint(c,c.ports.find(port=>port.id===joint.a.portId).point),model.worldPoint(right,right.ports.find(port=>port.id===joint.b.portId).point));
  }
});

test("all 010C CAD arrows follow +X after normalization and keep their measured mounting planes", async () => {
  const models = await json("../data/line-valve-models.json"), registry = await json("../data/line-valve-registry.json");
  const checks = models.rows.filter(row => row.series === "010C");
  assert.equal(checks.length,17);
  for (const row of checks) {
    assert.equal(row.flowDirection,"left-to-right");
    vecClose(model.rotate(row.nativeFlowAxis,row.rotation),[1,0,0]);
    vecClose(model.add(model.rotate([0,0,0],row.rotation),row.position),[0,0,0]);
    vecClose(model.add(model.rotate([0,0,-row.length],row.rotation),row.position),[row.length,0,0]);
    for (const link of registry.models.filter(link=>link.sourceHash===row.sourceHash)) {
      const inlet=link.ports.find(p=>p.id==="inlet"),outlet=link.ports.find(p=>p.id==="outlet");
      vecClose(inlet.point,[0,0,0]);vecClose(outlet.point,[0,0,-row.length]);
      vecClose(inlet.axis,[0,0,1]);vecClose(outlet.axis,[0,0,-1]);
    }
  }
  assert.ok(models.rows.filter(row=>row.series==="017W").every(row=>JSON.stringify(row.rotation)==="[0,0,0]"));
});

test("010C arrows follow discharge flow for every working/reserve pump in both circuits on horizontal, vertical and oblique branches", async () => {
  let p=station("9",65,65,"flanged");
  p.entities["station-settings"].stationType="combined";
  Object.assign(p.entities["system-input-2"],{...p.entities["system-input"],workingPumpCount:1,reservePumpCount:1});
  Object.assign(p.entities["station-dn"],{secondarySuctionValveDn:80,secondaryDischargeValveDn:80,secondaryConnectionType:"flanged",secondaryPn:16,secondarySuctionValveType:"butterfly",secondaryDischargeValveType:"butterfly",
    secondaryPumpSuctionPort:{...p.entities["station-dn"].pumpSuctionPort,dn:80},secondaryPumpDischargePort:{...p.entities["station-dn"].pumpDischargePort,dn:80}});
  p=refresh(synchronizeCollectors(p),db,true);
  const data=await realLineCatalog(p);
  for (const axis of [[1,0,0],[0,0,1],[Math.SQRT1_2,0,Math.SQRT1_2]]) {
    const pr=structuredClone(profiles);pr.profiles["9"].ports.find(p=>p.id==="outlet").axis=axis;
    const a=build(p,data,pr),checks=a.components.filter(c=>/CheckValve$/.test(c.line?.role??""));
    assert.equal(checks.length,5);
    for (const c of checks) {
      assert.equal(c.shape.kind,"mesh");
      const arrow=model.rotate(model.rotate([0,0,-1],c.shape.modelRotation),c.rotation);
      const pump=a.components.find(pump=>pump.id===c.line.pumpId),flow=model.rotate(pump.ports.find(p=>p.id==="outlet").axis,pump.rotation);
      vecClose(arrow,flow);
      close(model.distance(model.worldPoint(c,c.ports[0].point),model.worldPoint(c,c.ports[1].point)),c.line.length);
      assert.ok(c.ports.every(p=>!p.provisional));
      assert.ok(!c.line.issues.some(issue=>/направление.*(?:требует проверки|не подтверждено)/i.test(issue)));
    }
  }
});

test("refreshing an old reversed CAD valve corrects its arrow while preserving its saved pose, ports, DN and length", async () => {
  const p=station("9",65,65,"flanged"),data=await realLineCatalog(p),generated=build(p,data),old=structuredClone(generated);
  const valve=old.components.find(c=>c.line?.role==="primaryCheckValve");
  valve.shape.modelRotation=[0,90,0];valve.shape.modelPosition=[valve.line.length,0,0];valve.locked=true;valve.hidden=true;valve.opacity=.4;
  valve.position=model.add(valve.position,[0,100,20]);
  const saved=model.normalizeEditor(JSON.parse(JSON.stringify({...model.emptyEditor(),assembly:old}))).assembly;
  const updated=model.mergeAssembly(saved,generated).components.find(c=>c.id===valve.id);
  assert.deepEqual(updated.position,valve.position);assert.deepEqual(updated.rotation,valve.rotation);assert.deepEqual(updated.ports,generated.components.find(c=>c.id===valve.id).ports);
  assert.equal(updated.line.length,valve.line.length);assert.equal(updated.equipmentId,valve.equipmentId);assert.equal(updated.locked,true);assert.equal(updated.hidden,true);assert.equal(updated.opacity,.4);
  vecClose(model.rotate([0,0,-1],updated.shape.modelRotation),[1,0,0]);
});


test("measured MBL recovery assembles all seven branches and replaces staged valve copies", async()=>{
  const p=station("nu-34f0554f7dc091e4",100,80,"flanged");
  p.entities["station-settings"].stationType="combined";
  Object.assign(p.entities["system-input"],{workingPumpCount:3,reservePumpCount:1});
  Object.assign(p.entities["system-input-2"],p.entities["system-input"],{workingPumpCount:2,reservePumpCount:1});
  Object.assign(p.entities["station-dn"],{secondarySuctionValveDn:100,secondaryDischargeValveDn:80});
  const project=refresh(synchronizeCollectors(p),db,true), data=await realLineCatalog(project), a=build(project,data);
  const pumps=a.components.filter(c=>c.kind==="pump");assert.equal(pumps.length,7);
  for(const pump of pumps){assert.equal(pump.pumpGeometry.envelope,"catalog");assert.notEqual(pump.pumpGeometry.schematic,true);assert.deepEqual(pump.pumpGeometry.dimensionsMm,[973,450,564]);for(const side of ["suction","discharge"])assert.ok(a.components.some(c=>c.line?.pumpId===pump.id&&c.line.side===side));}
  const line=a.components.find(c=>c.line&&!c.line.auxiliary&&c.equipmentId);
  const staged={...line,id:`spec-${line.line.specPosition}-equipment:${line.equipmentId}-0`,line:undefined,position:[2000,0,100]};
  const manual={...staged,id:"manual-user-valve",sourceKey:"manual"};
  const old={...a,components:[...pumps,staged,manual]};
  const recovered=model.mergeAssembly(old,a);
  assert.equal(recovered.components.some(c=>c.id===staged.id),false);
  assert.ok(recovered.components.some(c=>c.id===manual.id));
  assert.equal(recovered.components.filter(c=>c.id.startsWith("spec-")).length,0);
  for(const j of recovered.lineJoints){const from=model.portPoint(recovered,j.a),to=model.portPoint(recovered,j.b);if(from&&to)vecClose(from,to);}
});

test("discharge butterfly rolls 90 degrees toward suction without moving either mating plane", async () => {
  const {addLineAssemblies,dischargeValveUp}=await loadTs(new URL("../app/model-editor/line-assembly.ts",import.meta.url));
  for (const axis of [[0,0,1],[0,0,-1],[1,0,0]]) for (const toward of [[-1,0,0],[1,0,0],[0,-1,0]]) {
    const up=dischargeValveUp(axis,toward), before=model.rotate([0,0,1],mountingRotation([1,0,0],axis));
    close(up.reduce((s,v,i)=>s+v*axis[i],0),0);
    close(up.reduce((s,v,i)=>s+v*before[i],0),0);
    assert.ok(up.reduce((s,v,i)=>s+v*toward[i],0)>=-1e-6);
  }
  for (const prefix of ["primary","secondary"]) for (const inletX of [-200,200]) {
    const p=station("9",80,80,"flanged");
    const circuit=prefix==="primary"?1:2, pumpId=circuit===1?"pump-1-0":"pump-2-0";
    Object.assign(p.entities[circuit===1?"system-input":"system-input-2"],{workingPumpCount:1,reservePumpCount:0});
    const rows=[{position:"v",section:"discharge",option:`${prefix}DischargeValve`,name:"Затвор DENDOR 017W",details:"PN16 · редуктор",quantity:1,status:"selected",equipmentId:"valve"},
      {position:"c",section:"discharge",option:`${prefix}CheckValve`,name:"Обратный клапан",details:"PN16",quantity:1,status:"selected",equipmentId:"check"},
      {position:"s",section:"suction",option:`${prefix}SuctionValve`,name:"Затвор DENDOR 017W",details:"PN16",quantity:1,status:"selected",equipmentId:"valve"}];
    p.entities["station-spec"].items=rows;
    const pump={...build(p).components.find(c=>c.kind==="pump"),id:pumpId,position:[100,200,300],rotation:[0,0,0],ports:[{id:"inlet",point:[inletX,0,0],axis:[Math.sign(inletX),0,0]},{id:"outlet",point:[0,0,100],axis:[0,0,1]}]};
    const geometry={length:56,ports:[{id:"left",point:[0,0,0],axis:[-1,0,0],up:[0,0,1]},{id:"right",point:[56,0,0],axis:[1,0,0],up:[0,0,1]}],fidelity:"cad",issues:[],source:"test",revision:"1"};
    const data={...empty,items:{valve:{...geometry,equipmentId:"valve"},check:{...geometry,equipmentId:"check"}}};
    const base={...build(p),components:[pump]};
    const turned=addLineAssemblies(base,p,profiles,data);
    const unchangedProject=structuredClone(p);unchangedProject.entities["station-spec"].items[0].name="Кран";
    const original=addLineAssemblies(base,unchangedProject,profiles,data);
    for(const c of turned.components.filter(c=>c.line)) {
      const old=original.components.find(o=>o.id===c.id);
      for(const port of c.ports)vecClose(model.worldPoint(c,port.point),model.worldPoint(old,port.point));
      if(c.line.role===`${prefix}DischargeValve`)vecClose(model.rotate([0,0,1],c.rotation),[Math.sign(inletX),0,0]);
      else vecClose(c.rotation,old.rotation);
    }
    const merged=model.mergeAssembly(original,turned), id=turned.components.find(c=>c.line?.role===`${prefix}DischargeValve`).id;
    vecClose(merged.components.find(c=>c.id===id).rotation,turned.components.find(c=>c.id===id).rotation);
    const manual=structuredClone(original), changed=manual.components.find(c=>c.id===id);changed.locked=true;changed.rotation=[12,34,56];
    vecClose(model.mergeAssembly(manual,turned).components.find(c=>c.id===id).rotation,[12,34,56]);
    assert.deepEqual(turned.lineJoints,original.lineJoints);
  }
});
