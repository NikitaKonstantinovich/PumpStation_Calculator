import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { importComponentDimensions } from "../scripts/import-collar-dimensions.mjs";
const { mergeInsertAnalogs, analogColumns, ANALOG_FIELDS } = await loadTs(new URL("../app/component-insert-analog-source.ts", import.meta.url));
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url),"utf8"));
const reference = JSON.parse(await readFile(new URL("../data/insert-analog-dimensions.json", import.meta.url),"utf8"));
const raw = structuredClone(source); for (const item of raw.items) item.fields = item.fields.filter(field => !analogColumns.includes(field.column));

test("49 original reducer lengths come from exact recorded analogues, preserving native values, PN, walls, prices and unknown profiles", () => {
  const merged = mergeInsertAnalogs(raw, reference);
  assert.deepEqual(mergeInsertAnalogs(merged, reference), merged);
  const before = makeInsertCatalog(raw), after = makeInsertCatalog(merged);
  assert.equal(reference.rows.length, 49);
  for (const rule of reference.rows) {
    const old = before.parts.find(p => p.id === rule.componentId), next = after.parts.find(p => p.id === rule.componentId);
    assert.equal(old.lengthMm, null); assert.equal(next.lengthMm, rule.lengthMm);
    for (const key of ["id","pn","material","wallThickness","wallThicknessSmall","price","outerDiameter","outerDiameterSmall","cylindricalLengthLargeMm","cylindricalLengthSmallMm"]) assert.deepEqual(next[key],old[key]);
    assert.equal(next.dimensionSources.lengthMm, rule.source); assert.match(rule.source, new RegExp(rule.donorId));
    assert.ok(!next.warnings.some(w => w.startsWith("Проверка длины:")));
  }
  for (let i=0;i<raw.items.length;i++) {
    assert.deepEqual(merged.items[i].prices, raw.items[i].prices);
    assert.deepEqual(merged.items[i].fields.filter(f=>!analogColumns.includes(f.column)),raw.items[i].fields);
  }
});

test("changed donors, native values, shape or saved acceptance revoke only the analogue length", () => {
  const rule=reference.rows[0];
  for (const mutate of [
    data=>{data.source.sha256="different";},
    data=>{data.items.find(i=>i.id===rule.donorId).fields.find(f=>f.column==="CALC_INSERT_LENGTH_MM").value+=1;},
    data=>{data.items.find(i=>i.id===rule.componentId).fields.find(f=>f.headerPath.at(-1)==="Толщина 1, мм").value+=0.1;},
    data=>{data.items.find(i=>i.id===rule.componentId).fields.find(f=>f.column===ANALOG_FIELDS.length[0]).value+=1;},
    data=>{data.items.find(i=>i.id===rule.componentId).fields=data.items.find(i=>i.id===rule.componentId).fields.filter(f=>f.column!==ANALOG_FIELDS.source[0]);},
  ]) {
    const changed=mergeInsertAnalogs(raw,reference);mutate(changed);
    const part=makeInsertCatalog(changed).parts.find(p=>p.id===rule.componentId);
    assert.equal(part.lengthMm,null);
  }
  const native=structuredClone(raw), target=native.items.find(i=>i.id===rule.componentId);
  target.fields.push({column:"NATIVE_LENGTH",headerPath:["Длина, мм"],value:333});
  const merged=mergeInsertAnalogs(native,reference);
  assert.equal(makeInsertCatalog(merged).parts.find(p=>p.id===rule.componentId).lengthMm,333);
  assert.equal(merged.items.find(i=>i.id===rule.componentId).fields.some(f=>f.column===ANALOG_FIELDS.length[0]),false);
});

const schema=await readFile(new URL("../drizzle/0000_burly_jackpot.sql",import.meta.url),"utf8");
const revisions=await readFile(new URL("../drizzle/0009_component_source_revision.sql",import.meta.url),"utf8");
function database() {
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");db.exec(schema);db.exec(revisions);
  db.prepare("INSERT INTO catalog_imports(id,source_file,source_sha256,source_size_bytes,source_modified_at) VALUES(1,'fixture',?,1,'fixture')").run(reference.sourceSha256);
  db.exec("INSERT INTO component_catalogs(id,import_id,source_id,name,source_sheet) VALUES(1,1,'переходы','Переходы','Переходы')");
  const families=new Map();let id=0;
  for (const item of raw.items.filter(i=>i.catalogId==="переходы")) {
    if (!families.has(item.tableId)) {const familyId=families.size+1;families.set(item.tableId,familyId);db.prepare("INSERT INTO component_families(id,catalog_id,source_id,title,source_range) VALUES(?,1,?,?,'fixture')").run(familyId,item.tableId,item.family);}
    const family=families.get(item.tableId);id++;
    db.prepare("INSERT INTO components(id,family_id,source_id,source_row) VALUES(?,?,?,?)").run(id,family,item.id,item.sourceRow);
    db.prepare("INSERT INTO component_prices(component_id,label,amount_microunits,source_column) VALUES(?,'Цена',123456000,'I')").run(id);
    for (const field of item.fields) {
      if (!field.headerPath.length) continue;
      let attr=db.prepare("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?").get(family,field.column);
      if(!attr){const result=db.prepare("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type) VALUES(?,?,?,?,?,?)").run(family,field.column,field.column,field.headerPath.at(-1),JSON.stringify(field.headerPath),typeof field.value==="number"?"number":"text");attr={id:result.lastInsertRowid};}
      db.prepare("INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value,text_value) VALUES(?,?,?,?,?)").run(id,attr.id,typeof field.value==="number"?"number":"text",typeof field.value==="number"?field.value:null,typeof field.value==="number"?null:field.value);
    }
  }
  return db;
}
const options={catalogId:"переходы",columns:analogColumns,confirmedColumn:ANALOG_FIELDS.length[0],reviewColumn:ANALOG_FIELDS.review[0]};
test("database enrichment is atomic and repeatable, preserving all component prices",()=>{
  const db=database();try{
    const prices=db.prepare("SELECT * FROM component_prices").all();
    const result=importComponentDimensions(db,reference,mergeInsertAnalogs,options);
    assert.equal(result.updated,49);assert.equal(result.confirmed,49);assert.deepEqual(result.pending,[]);
    const saved=JSON.stringify(db.prepare("SELECT * FROM component_attribute_values ORDER BY id").all());
    assert.equal(importComponentDimensions(db,reference,mergeInsertAnalogs,options).updated,0);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM component_attribute_values ORDER BY id").all()),saved);
    assert.deepEqual(db.prepare("SELECT * FROM component_prices").all(),prices);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{db.close();}
});
test("an interrupted analogue import rolls back dimensions and source revision",()=>{
  const db=database();try{
    const snapshot=()=>JSON.stringify([db.prepare("SELECT * FROM component_attribute_values ORDER BY id").all(),db.prepare("SELECT * FROM component_calculator_source_revision").all()]);
    const before=snapshot();
    db.exec("CREATE TRIGGER fail_analog BEFORE INSERT ON component_attribute_values WHEN NEW.attribute_definition_id IN (SELECT id FROM attribute_definitions WHERE source_column='CALC_ANALOG_SOURCE') BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(()=>importComponentDimensions(db,reference,mergeInsertAnalogs,options),/fixture failure/);
    assert.equal(snapshot(),before);
  }finally{db.close();}
});
