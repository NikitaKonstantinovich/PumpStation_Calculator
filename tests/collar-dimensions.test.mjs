import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importCollarDimensions } from "../scripts/import-collar-dimensions.mjs";

const { mergeCollarDimensions: merge, COLLAR_COLUMNS: columns, validateCollarReference } = await loadTs(new URL("../app/component-collar-dimensions.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { insertPartIdentity, generateInsertCalculations } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const reference = JSON.parse(await readFile(new URL("../data/collar-dimensions.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const original = structuredClone(source);
for (const item of original.items) item.fields = item.fields.filter(field => !Object.values(columns).includes(field.column));
const field = (item, column) => item.fields.find(field => field.column === column)?.value;
const native = (label, value) => ({ column: `native-${label}`, headerPath: [label], value });

test("approved DN80/150 collars use 3 mm PN16 components at PN10 and PN16, retaining actual prices and assembly pressure", () => {
  const data = merge(original, reference), catalog = makeInsertCatalog(data);
  const input = { dnFrom: 80, dnTo: 150, materials: ["aisi304"], withSensorNipple: false, includeEccentric: true, seating: { collar: { mode: "insertion-depth", valueMm: 0 } } };
  const rows = generateInsertCalculations(input, catalog);
  for (const [dn, id, length, diameter] of [[80,"воротники-002-r0036",23,138],[150,"воротники-002-r0039",30,212]]) {
    const selected = catalog.parts.find(part => part.id === id);
    assert.equal(selected.wallThickness,3); assert.equal(selected.pn,16);
    assert.equal(selected.lengthMm,length); assert.equal(selected.lipOuterDiameterMm,diameter);
    for (const pn of [10,16]) {
      const straight = rows.find(row => row.dnLarge===dn && row.geometry==="straight" && row.pn===pn);
      assert.ok(straight); assert.equal(straight.pn,pn);
      const ends = straight.bom.filter(item=>item.kind==="collar");
      assert.equal(ends.length,2);
      assert.ok(ends.every(item=>item.componentId===id && item.unitPrice===selected.price));
      assert.equal(straight.configuration.axialLeftMm,length);
      assert.equal(straight.configuration.axialRightMm,length);
      assert.equal(straight.complete,true,straight.warnings.join('; '));
      assert.equal(straight.totalLengthMm,straight.baseLengthMm+2*length);
      assert.equal(straight.price,straight.bom.reduce((total,item)=>total+item.cost,0));
      const bolt = catalog.engineering.boltReferences.find(r=>r.dn===dn && r.pn===pn && r.material==="aisi304" && r.model==="017W-line-spec");
      assert.ok(bolt.source.includes(id));
      assert.equal(straight.baseLengthMm,bolt.standardLengthMm);
    }
    for (const row of rows.filter(row=>[10,16].includes(row.pn))) {
      for (const [end,endDn] of [["left",row.dnLarge],["right",row.dnSmall]]) if (endDn===dn && row[`${end}Connection`]==="collar")
        assert.equal(row.bom.find(item=>item.role===`${end}-collar`)?.componentId,id);
    }
    assert.ok(rows.filter(row=>row.pn===25).every(row=>row.bom.every(item=>item.componentId!==id)));
  }
  assert.equal(new Set(rows.map(row=>row.identityKey)).size,rows.length);
  const oldCatalog=structuredClone(catalog); delete oldCatalog.engineering.collarSelections;
  const old=generateInsertCalculations(input,oldCatalog).find(r=>r.geometry==="straight" && r.dnLarge===80 && r.pn===10);
  assert.notEqual(rows.find(r=>r.geometry==="straight" && r.dnLarge===80 && r.pn===10).identityKey,old.identityKey);
});

test("missing or changed selected collar cannot silently fall back to the old 2 mm execution", () => {
  const catalog=makeInsertCatalog(merge(original,reference));
  for (const mutate of [c=>{c.parts=c.parts.filter(p=>p.id!=="воротники-002-r0036");},c=>{c.parts.find(p=>p.id==="воротники-002-r0036").wallThickness=2;},c=>{c.parts.find(p=>p.id==="воротники-002-r0036").pn=10;}]) {
    const changed=structuredClone(catalog); mutate(changed);
    const row=generateInsertCalculations({dnFrom:80,dnTo:80,materials:["aisi304"],withSensorNipple:false,includeEccentric:false},changed).find(r=>r.geometry==="straight" && r.pn===10);
    assert.ok(row); assert.equal(row.complete,false); assert.equal(row.price,null);
    assert.ok(row.warnings.some(w=>w.includes("выбранного воротника")));
    assert.ok(row.bom.every(p=>p.componentId!=="воротники-001-r0012"));
  }
});

test("drawing transcription distinguishes lip thickness, wall and full height; DN200 inner diameter is not tube OD", async () => {
  const image = await readFile(new URL(`../${reference.image.path}`, import.meta.url));
  assert.equal(createHash("sha256").update(image).digest("hex"), reference.image.sha256);
  assert.equal(reference.rows.length, 13);
  assert.deepEqual(reference.rows.map(r => [r.dn, r.a, r.b, r.c, r.d, r.e]), [
    [10,2,2,9,17.2,40],[15,2,2,9,21.3,45],[20,2,2,12,26.9,58],[25,2,2,15,33.7,68],
    [32,2,2,15,42.4,78],[40,2,2,17,48.3,88],[50,2,2,23,60.3,102],[65,2,2,23,76.1,122],
    [80,3,3,23,88.9,138],[100,3,3,28,114.3,158],[125,3,3,30,139.7,188],[150,3,3,30,168.3,212],[200,null,null,18,null,270],
  ]);
  assert.equal(reference.rows.at(-1).innerDiameterMm, 219.1);
  validateCollarReference(reference);
  for (const patch of [{ c: 0 }, { b: NaN }, { a: 28 }, { e: 100 }]) {
    const bad = structuredClone(reference);
    Object.assign(bad.rows.find(row => row.dn === 100), patch);
    assert.throws(() => validateCollarReference(bad));
  }
});

test("eleven drawing, four CAD and seven explicit user executions gain dimensions without changing PN/prices", () => {
  const enriched = merge(original, reference), collars = enriched.items.filter(item => item.catalogId === "воротники");
  assert.equal(collars.filter(item => field(item, columns.length) !== undefined).length, 22);
  assert.equal(collars.filter(item => field(item, columns.review) !== undefined).length, 40);
  assert.ok(collars.every(item => field(item, columns.thickness) === 3));
  assert.deepEqual(merge(enriched, reference), enriched);
  for (let i = 0; i < enriched.items.length; i++) {
    assert.deepEqual(enriched.items[i].prices, original.items[i].prices);
    assert.deepEqual(enriched.items[i].fields.filter(f => !Object.values(columns).includes(f.column)), original.items[i].fields);
  }
  const parts = makeInsertCatalog(enriched).parts.filter(part => part.kind === "collar");
  const dn100 = parts.find(part => part.dn === 100 && part.pn === 16);
  assert.equal(dn100.lengthMm, 28); assert.equal(dn100.thicknessMm, 3); assert.equal(dn100.lipOuterDiameterMm, 158);
  assert.equal(dn100.outerDiameter, 114.3); assert.equal(dn100.wallThickness, 3);
  assert.match(dn100.dimensionSources.lengthMm, /NIOB 2079 ISO/);
  assert.equal(dn100.standard, null);
  assert.equal(parts.find(part => part.dn === 100 && part.pn === 10).lengthMm, 16);
  for (const dn200 of parts.filter(part => part.dn === 200)) {
    assert.equal(dn200.lengthMm,18); assert.equal(dn200.thicknessMm,3); assert.equal(dn200.lipOuterDiameterMm,270);
    if (dn200.pn===16) assert.match(dn200.dimensionSources.lengthMm,/Прямое подтверждение пользователя 25.10.2026/);
  }
  assert.notEqual(insertPartIdentity(dn100), insertPartIdentity({ ...dn100, lipOuterDiameterMm: 159 }));
});

test("DN200 PN16 project dimensions are tied to the exact execution and never attributed to CAD", () => {
  const enriched=merge(original,reference), expected=reference.userRows[0];
  const item=enriched.items.find(i=>i.id===expected.componentId), catalog=makeInsertCatalog(enriched);
  const part=catalog.parts.find(p=>p.id===expected.componentId);
  assert.deepEqual([part.dn,part.pn,part.outerDiameter,part.wallThickness,part.lengthMm,part.lipOuterDiameterMm],[200,16,219.1,3,18,270]);
  assert.equal(field(item,columns.cadThickness),undefined);
  assert.equal(part.dimensionSources.lengthMm,expected.source);
  assert.equal(part.dimensionSources.lipOuterDiameterMm,expected.source);
  const row=generateInsertCalculations({dnFrom:200,dnTo:200,materials:["aisi304"],withSensorNipple:false,includeEccentric:false},catalog).find(r=>r.geometry==="straight" && r.pn===16);
  assert.equal(row.configuration.axialLeftMm,18); assert.equal(row.configuration.axialRightMm,18);
  assert.equal(row.complete,true,row.warnings.join('; '));
  assert.equal(row.totalLengthMm,row.baseLengthMm+36);
  assert.ok(!row.warnings.some(w=>/осевого размера воротника/.test(w)));
  for(const mutate of [
    d=>{d.source.sha256="changed";},
    d=>{d.items.find(i=>i.id===expected.componentId).tableId="another-family";},
    d=>{d.items.find(i=>i.id===expected.componentId).fields.push(native("PN",25));},
    d=>{d.items.find(i=>i.id===expected.componentId).fields.push(native("Толщина, мм",2));},
    d=>{d.items.find(i=>i.id===expected.componentId).fields.find(f=>f.headerPath.at(-1)==="Наименование").value="Воротник приварной DN 200 (219,1 x 2,0 мм)";},
  ]) {
    const changed=structuredClone(enriched); mutate(changed);
    const result=makeInsertCatalog(changed).parts.find(p=>p.id===expected.componentId);
    assert.equal(result.lengthMm,null); assert.equal(result.lipOuterDiameterMm,null);
  }
  for(const patch of [{c:0},{e:200},{b:120},{componentId:reference.cadRows[0].componentId}]) {
    const bad=structuredClone(reference); Object.assign(bad.userRows[0],patch); assert.throws(()=>validateCollarReference(bad));
  }
});

test("six small PN16 collars adopt approved image/model dimensions at wall 3 without altering the originals", async () => {
  const enriched=merge(original,reference), catalog=makeInsertCatalog(enriched);
  const expected=[[15,29,9,21.3,45],[20,30,12,26.9,58],[32,32,15,42.4,78],[40,33,17,48.3,88],[50,34,23,60.3,102],[65,35,25,76.1,122]];
  const models=JSON.parse(await readFile(new URL("../data/collar-cad-models.json",import.meta.url),"utf8")).models;
  for (const [dn,id,c,d,e] of expected) {
    const componentId=`воротники-002-r${String(id).padStart(4,"0")}`;
    const item=enriched.items.find(i=>i.id===componentId), part=catalog.parts.find(p=>p.id===componentId);
    const adopted=reference.userRows.find(r=>r.componentId===componentId);
    assert.deepEqual([part.dn,part.pn,part.wallThickness,part.thicknessMm,part.outerDiameter,part.lengthMm,part.lipOuterDiameterMm],[dn,16,3,3,d,c,e]);
    assert.equal(part.dimensionSources.lengthMm,adopted.source);
    assert.equal(field(item,columns.cadThickness),undefined);
    assert.match(adopted.source,/Перенос размеров c\/e на стенку b=3 мм согласован пользователем/);
    assert.equal(reference.rows.find(r=>r.dn===dn).b,2);
    if (dn>=32) {
      const model=models.find(m=>m.nativePath===`Equipment/Piping/3D/Воротники/Воротник приварной DN${dn} ISO.SLDPRT`);
      const body=model.dimensions[0];
      assert.deepEqual([body.lengthMm,body.outerDiameterMm,body.lipOuterDiameterMm,body.wallThicknessMm],[c,d,e,2]);
      assert.ok(adopted.source.includes(model.modelSha256));
    }
  }
  // The approved change applies to PN16: the original PN10 DN65 remains 23 mm.
  assert.equal(catalog.parts.find(p=>p.id==="воротники-001-r0011").lengthMm,23);
  assert.equal(reference.rows.find(r=>r.dn===65).c,23);
  const rows=generateInsertCalculations({dnFrom:65,dnTo:65,materials:["aisi304"],withSensorNipple:false,includeEccentric:true},catalog);
  const reducers=rows.filter(r=>r.dnSmall===50 && r.pn===16 && r.leftConnection==="collar" && r.rightConnection==="collar" && r.geometry!=="straight");
  assert.equal(reducers.length,2);
  for (const row of reducers) {
    assert.equal(row.complete,true,row.warnings.join("; "));
    assert.equal(row.totalLengthMm,row.baseLengthMm+25+23);
    assert.equal(row.welds.length,2);
    assert.ok(Math.abs(row.weldLengthMm-2*Math.PI*(76.1+60.3))<1e-8);
    assert.equal(row.price,row.bom.reduce((sum,item)=>sum+item.cost,0));
    assert.ok(row.bom.every(item=>item.kind!=="looseFlange"));
  }
});

test("CAD supplements only the four measured executions; native lip remains distinct from the project rule", () => {
  const enriched = merge(original, reference), catalog = makeInsertCatalog(enriched);
  assert.deepEqual(reference.cadRows.map(r => [r.dn,r.pn,r.b,r.c,r.e]), [[100,10,2,16,158],[125,10,2,16,185],[200,10,2,18,270],[25,16,3,14,68]]);
  for (const expected of reference.cadRows) {
    const item=enriched.items.find(i=>i.id===expected.componentId), part=catalog.parts.find(p=>p.id===expected.componentId);
    assert.equal(part.lengthMm,expected.c); assert.equal(part.lipOuterDiameterMm,expected.e);
    assert.equal(part.thicknessMm,3); assert.equal(field(item,columns.cadThickness),expected.a);
    assert.equal(part.outerDiameter,expected.d); assert.equal(part.wallThickness,expected.b); assert.equal(part.pn,expected.pn);
    assert.match(part.dimensionSources.lengthMm,/SLDPRT.*SHA-256.*STEP.*SHA-256/);
    for (const mutate of [
      data=>{ data.items.find(i=>i.id===expected.componentId).fields.find(f=>f.column==='C').value+=' другое исполнение'; },
      data=>{ data.items.find(i=>i.id===expected.componentId).fields.push(native('Диаметр, мм',expected.d+1)); },
      data=>{ data.items.find(i=>i.id===expected.componentId).fields.push(native('Толщина, мм',expected.b+1)); },
      data=>{ data.items.find(i=>i.id===expected.componentId).fields.push(native('PN',expected.pn+1)); },
      data=>{ data.items.find(i=>i.id===expected.componentId).fields.find(f=>f.column===columns.length).value+=1; },
    ]) {
      const changed=structuredClone(enriched); mutate(changed);
      assert.equal(makeInsertCatalog(changed).parts.find(p=>p.id===expected.componentId).lengthMm,null);
    }
  }
  assert.equal(catalog.parts.find(p=>p.id==='воротники-001-r0011').lengthMm,23); // User's DN65 height was not overwritten by a different CAD version.
  for (const patch of [{ modelSha256:'bad' }, { modelPath:'Equipment/../../outside.step' }, { c:0 }, { d:1 }]) {
    const bad=structuredClone(reference); Object.assign(bad.cadRows[0],patch); assert.throws(()=>validateCollarReference(bad));
  }
});

test("changed workbook, explicit dimensions, name or material cannot inherit drawing dimensions; native values survive", () => {
  const enriched = merge(original, reference);
  const id = enriched.items.find(item => field(item, columns.length) === 28).id;
  for (const modify of [
    data => { data.source.sha256 = "changed"; },
    data => { data.items.find(item => item.id === id).fields.push(native("Диаметр, мм", 108)); },
    data => { data.items.find(item => item.id === id).fields.push(native("Толщина, мм", 2)); },
    data => { data.items.find(item => item.id === id).fields.find(f => f.headerPath.at(-1) === "Наименование").value = "Воротник DN100 (114,3 x 2,0 мм)"; },
  ]) {
    const tampered = structuredClone(enriched); modify(tampered);
    const part = makeInsertCatalog(tampered).parts.find(part => part.id === id);
    assert.equal(part.lengthMm, null); assert.equal(part.thicknessMm, tampered.source.sha256 === reference.sourceSha256 ? 3 : null); assert.equal(part.lipOuterDiameterMm, null);
    assert.match(part.warnings.join(" "), /устарели/);
  }
  const material = structuredClone(original); material.items.find(item => item.id === id).family = "Воротник Сталь 20";
  assert.equal(field(merge(material, reference).items.find(item => item.id === id), columns.length), undefined);
  const manual = structuredClone(enriched), item = manual.items.find(item => item.id === id);
  item.fields.push(native("Длина, мм", 42));
  const result = merge(manual, reference).items.find(item => item.id === id);
  assert.equal(field(result, columns.length), undefined);
  assert.equal(field(result, "native-Длина, мм"), 42);
  assert.match(field(result, columns.review), /другого источника/);
});

test("collar height c enters chosen zero-insertion geometry separately from lip thickness and stays auditable", () => {
  const catalog = makeInsertCatalog(merge(original, reference));
  const collar = catalog.parts.find(part => part.kind === "collar" && part.dn === 100 && part.pn === 16);
  // Explicit fixture bolt/pipe isolates geometry from missing production stainless bolt-stack data.
  catalog.parts = [collar, { ...collar, id: "fixture-pipe", kind: "pipe", name: "fixture pipe", dnSmall: 100, outerDiameterSmall: 114.3, wallThicknessSmall: 3, lengthMm: null, thicknessMm: null, lipOuterDiameterMm: null, price: 1000 }];
  catalog.engineering.straightLength = { model: "fixture", basis: "standard-bolt", source: "test fixture only" };
  catalog.engineering.boltReferences = [{ model: "fixture", material: "aisi304", dn: 100, pn: 16, threadDiameterMm: 16, minimumLengthMm: 120, standardLengthMm: 130, componentId: "fixture-bolt", source: "test fixture" }];
  catalog.standardBolts = [{ id: "fixture-bolt", diameterMm: 16, lengthMm: 130, source: "test fixture" }];
  catalog.engineering.connectionPairs = [{ left: "collar", right: "collar", source: "test fixture" }];
  const [row] = generateInsertCalculations({ dnFrom: 100, dnTo: 100, materials: ["aisi304"], withSensorNipple: false, includeEccentric: false, seating: { collar: { mode: "insertion-depth", valueMm: 0 } } }, catalog);
  assert.equal(row.baseLengthMm, 130); assert.equal(row.totalLengthMm, 186);
  assert.equal(row.configuration.axialLeftMm, 28); assert.equal(row.configuration.axialRightMm, 28);
  assert.ok(row.dimensions.some(dimension => dimension.name.includes("(c)") && dimension.value === 28 && dimension.source.includes("NIOB")));
  assert.ok(row.dimensions.some(dimension => dimension.name.includes("(e)") && dimension.value === 158));
  assert.ok(!row.bom.some(item => item.kind === "looseFlange"));
});

const schema = await readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8");
const revisions = await readFile(new URL("../drizzle/0009_component_source_revision.sql", import.meta.url), "utf8");
function fixtureDb() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(schema); db.exec(revisions);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'воротники','Воротники','Воротники')");
  db.exec("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(1,1,'fixture-family','Воротник AISI304','B1:J3')");
  let attrId = 0;
  for (const [componentId, wall] of [[1, 3], [2, 2]]) {
    db.prepare("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,1,?,?)").run(componentId, `fixture-${componentId}`, componentId);
    db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',123456000,'E')").run(componentId);
    for (const [column, label, value] of [["B", "DN", "DN100"], ["C", "Наименование", `Воротник DN100 (114,3 x ${wall},0 мм)`], ["D", "Давление", "PN16"]]) {
      let attr = db.prepare("SELECT id FROM attribute_definitions WHERE family_id=1 AND source_column=?").get(column);
      if (!attr) {
        db.prepare("INSERT INTO attribute_definitions(id,family_id,source_column,key,label,header_path_json,data_type) VALUES(?,1,?,?,?,?,'text')").run(++attrId, column, column, label, JSON.stringify([label]));
        attr = { id: attrId };
      }
      db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,text_value) VALUES(?,?,'text',?)").run(componentId, attr.id, value);
    }
  }
  return db;
}
const revision = db => db.prepare("SELECT revision FROM component_calculator_source_revision WHERE id=1").get().revision;
const fields = db => db.prepare("SELECT * FROM component_attribute_values ORDER BY component_id,attribute_definition_id").all();
test("DN200 PN16 user dimensions persist and reimport without changing price or PN", () => {
  const db=fixtureDb(), expected=reference.userRows[0];
  try {
    db.prepare("UPDATE component_families SET source_id=?,title=? WHERE id=1").run(expected.tableId,expected.family);
    db.prepare("UPDATE components SET source_id=? WHERE id=1").run(expected.componentId);
    db.prepare("UPDATE component_attribute_values SET text_value='DN200' WHERE component_id=1 AND attribute_definition_id=1").run();
    db.prepare("UPDATE component_attribute_values SET text_value=? WHERE component_id=1 AND attribute_definition_id=2").run(expected.name);
    const before=fields(db),prices=db.prepare("SELECT * FROM component_prices").all();
    importCollarDimensions(db,reference,merge);
    const saved=()=>Object.fromEntries(db.prepare("SELECT a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=1").all().map(r=>[r.source_column,r.numeric_value??r.text_value]));
    assert.equal(saved().CALC_COLLAR_C,18); assert.equal(saved().CALC_COLLAR_E,270); assert.equal(saved().CALC_COLLAR_A,3);
    assert.equal(saved().CALC_COLLAR_SOURCE,expected.source); assert.equal(saved().CALC_COLLAR_CAD_A,undefined);
    assert.deepEqual(fields(db).filter(r=>r.attribute_definition_id<=3),before);
    const rev=revision(db); assert.equal(importCollarDimensions(db,reference,merge).updated,0); assert.equal(revision(db),rev);
    db.prepare("UPDATE component_attribute_values SET text_value='Воротник приварной DN 200 (219,1 x 2,0 мм)' WHERE component_id=1 AND attribute_definition_id=2").run();
    importCollarDimensions(db,reference,merge);
    assert.equal(saved().CALC_COLLAR_C,undefined); assert.equal(saved().CALC_COLLAR_E,undefined);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(),prices);
  } finally {db.close();}
});
test("six approved small collar executions persist idempotently and reject changed pressure or wall", () => {
  for (const expected of reference.userRows.filter(r=>r.dn<=65)) {
    const db=fixtureDb();
    try {
      db.prepare("UPDATE component_families SET source_id=?,title=? WHERE id=1").run(expected.tableId,expected.family);
      db.prepare("UPDATE components SET source_id=? WHERE id=1").run(expected.componentId);
      db.prepare("UPDATE component_attribute_values SET text_value=? WHERE component_id=1 AND attribute_definition_id=1").run(`DN${expected.dn}`);
      db.prepare("UPDATE component_attribute_values SET text_value=? WHERE component_id=1 AND attribute_definition_id=2").run(expected.name);
      const before=fields(db), prices=db.prepare("SELECT * FROM component_prices").all();
      const saved=()=>Object.fromEntries(db.prepare("SELECT a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=1").all().map(r=>[r.source_column,r.numeric_value??r.text_value]));
      importCollarDimensions(db,reference,merge);
      assert.deepEqual([saved().CALC_COLLAR_C,saved().CALC_COLLAR_E,saved().CALC_COLLAR_A],[expected.c,expected.e,3]);
      assert.equal(saved().CALC_COLLAR_SOURCE,expected.source);
      assert.equal(saved().CALC_COLLAR_CAD_A,undefined);
      assert.deepEqual(fields(db).filter(r=>r.attribute_definition_id<=3),before);
      const rev=revision(db); assert.equal(importCollarDimensions(db,reference,merge).updated,0); assert.equal(revision(db),rev);
      db.prepare("UPDATE component_attribute_values SET text_value='PN25' WHERE attribute_definition_id=3").run();
      importCollarDimensions(db,reference,merge); assert.equal(saved().CALC_COLLAR_C,undefined);
      db.prepare("UPDATE component_attribute_values SET text_value='PN16' WHERE attribute_definition_id=3").run();
      db.prepare("UPDATE component_attribute_values SET text_value=? WHERE component_id=1 AND attribute_definition_id=2").run(expected.name.replace('3,0','2,0'));
      importCollarDimensions(db,reference,merge); assert.equal(saved().CALC_COLLAR_C,undefined);
      assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(),prices);
    } finally {db.close();}
  }
});

test("collar choice is persisted alongside source records without rewriting dimensions, PN or prices", () => {
  const db=fixtureDb();
  try {
    db.prepare("UPDATE component_attribute_values SET text_value='DN80' WHERE attribute_definition_id=1").run();
    db.prepare("UPDATE component_attribute_values SET text_value='Воротник DN80 (88,9 x 3,0 мм)' WHERE attribute_definition_id=2 AND component_id=1").run();
    db.prepare("UPDATE component_attribute_values SET text_value='Воротник DN80 (88,9 x 2,0 мм)' WHERE attribute_definition_id=2 AND component_id=2").run();
    const before=fields(db), prices=db.prepare('SELECT * FROM component_prices').all();
    importCollarDimensions(db,reference,merge);
    const policies=db.prepare("SELECT v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE a.source_column='CALC_COLLAR_INSERT_SELECTION'").all();
    assert.equal(policies.length,2);
    assert.ok(policies.every(p=>JSON.parse(p.text_value).componentId==="воротники-002-r0036"));
    assert.deepEqual(fields(db).filter(r=>r.attribute_definition_id<=3),before);
    assert.deepEqual(db.prepare('SELECT * FROM component_prices').all(),prices);
    const rev=revision(db); assert.equal(importCollarDimensions(db,reference,merge).updated,0); assert.equal(revision(db),rev);
  } finally {db.close();}
});
test("D1 import is atomic, idempotent and preserves prices/PN; refreshed reads retain the exact confirmed dimensions", () => {
  const db = fixtureDb();
  try {
    const beforePrices = db.prepare("SELECT * FROM component_prices").all(), before = fields(db), firstRevision = revision(db);
    const result = importCollarDimensions(db, reference, merge);
    assert.equal(result.confirmed, 1); assert.equal(result.updated, 2); assert.equal(result.pending.length, 1);
    assert.ok(revision(db) > firstRevision);
    const saved = fields(db), savedRevision = revision(db);
    assert.equal(importCollarDimensions(db, reference, merge).updated, 0);
    assert.deepEqual(fields(db), saved); assert.equal(revision(db), savedRevision);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(), beforePrices);
    assert.deepEqual(fields(db).filter(row => row.attribute_definition_id <= 3), before);
    const assembly=db.prepare("SELECT v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE a.source_column='CALC_COLLAR_INSERT_ASSEMBLY'").all();
    assert.equal(assembly.length,2);
    assert.ok(assembly.every(row=>JSON.stringify(JSON.parse(row.text_value))===JSON.stringify(reference.assembly)));
    const dims = db.prepare("SELECT a.source_column AS col,v.numeric_value AS value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=1 AND a.source_column IN ('CALC_COLLAR_C','CALC_COLLAR_A','CALC_COLLAR_E')").all();
    assert.deepEqual(Object.fromEntries(dims.map(row => [row.col, row.value])), { CALC_COLLAR_C: 28, CALC_COLLAR_A: 3, CALC_COLLAR_E: 158 });
    assert.throws(() => importCollarDimensions(db, { ...reference, sourceSha256: "different" }, merge), /workbook/);
    assert.deepEqual(fields(db), saved);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { db.close(); }
});

test("failure during a later collar write rolls back dimensions, definitions and revision", () => {
  const db = fixtureDb();
  try {
    const before = fields(db), oldRevision = revision(db), definitions = db.prepare("SELECT * FROM attribute_definitions").all();
    db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON component_attribute_values WHEN NEW.component_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => importCollarDimensions(db, reference, merge), /fixture failure/);
    assert.deepEqual(fields(db), before); assert.equal(revision(db), oldRevision);
    assert.deepEqual(db.prepare("SELECT * FROM attribute_definitions").all(), definitions);
  } finally { db.close(); }
});

test("CAD dimensions survive database reload, repeat import is a no-op, and a changed execution invalidates them", () => {
  const db=fixtureDb(), cad=reference.cadRows.find(r=>r.dn===100);
  try {
    db.prepare('UPDATE component_families SET source_id=?,title=? WHERE id=1').run(cad.tableId,cad.family);
    db.prepare('UPDATE components SET source_id=? WHERE id=2').run(cad.componentId);
    db.prepare("UPDATE component_attribute_values SET text_value=? WHERE component_id=2 AND attribute_definition_id=2").run(cad.name);
    db.prepare("UPDATE component_attribute_values SET text_value='PN10' WHERE attribute_definition_id=3").run();
    const prices=db.prepare('SELECT * FROM component_prices').all();
    importCollarDimensions(db,reference,merge);
    const saved=()=>Object.fromEntries(db.prepare('SELECT a.source_column,v.numeric_value,v.text_value FROM component_attribute_values v JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=2').all().map(r=>[r.source_column,r.numeric_value??r.text_value]));
    assert.equal(saved().CALC_COLLAR_C,16); assert.equal(saved().CALC_COLLAR_CAD_A,2); assert.equal(saved().CALC_COLLAR_A,3);
    assert.match(saved().CALC_COLLAR_SOURCE,/SLDPRT.*SHA-256.*STEP/);
    const before=fields(db), rev=revision(db);
    assert.equal(importCollarDimensions(db,reference,merge).updated,0);
    assert.deepEqual(fields(db),before); assert.equal(revision(db),rev);
    db.prepare("UPDATE component_attribute_values SET text_value='Воротник DN100 (114,3 x 4,0 мм)' WHERE component_id=2 AND attribute_definition_id=2").run();
    importCollarDimensions(db,reference,merge);
    assert.equal(saved().CALC_COLLAR_C,undefined); assert.equal(saved().CALC_COLLAR_CAD_A,undefined);
    assert.equal(saved().CALC_COLLAR_A,3); assert.match(saved().CALC_COLLAR_REVIEW,/устарела/);
    assert.deepEqual(db.prepare('SELECT * FROM component_prices').all(),prices);
  } finally { db.close(); }
});
