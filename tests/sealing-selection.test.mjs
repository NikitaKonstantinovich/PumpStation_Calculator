import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeSealingSupplement } from "../scripts/sealing-supplement.mjs";
import { loadTs } from "./load-ts.mjs";

const binding=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8"));
const supplement=JSON.parse(await readFile(new URL("../data/sealing-supplement.json",import.meta.url),"utf8"));
const {selectGasket,selectFlax,gasketPressures,sealingPrice}=await loadTs(new URL("../app/sealing-selection.ts",import.meta.url));
const val=(item,label)=>item.fields.find(f=>f.headerPath.at(-1)===label)?.value;

test("all supplied seals are merged with max prices, separate pressure executions and metre prices",()=>{
  const seals=binding.items.filter(i=>i.catalogId==="прокладки");
  assert.equal(seals.length,27);
  assert.equal(sealingPrice(selectGasket(seals,32,16)),10.98);
  assert.equal(sealingPrice(selectGasket(seals,50,25)),21.96);
  assert.equal(sealingPrice(selectGasket(seals,150,16)),87);
  assert.equal(sealingPrice(selectGasket(seals,200,16)),115.9);
  assert.equal(sealingPrice(selectGasket(seals,200,40)),800);
  assert.equal(sealingPrice(selectGasket(seals,500,10)),1100);
  assert.equal(sealingPrice(selectGasket(seals,800,10)),1185.4);
  for(const row of supplement.gaskets) {
    const item=selectGasket(seals,row.dn,row.pn);
    assert.ok(item);assert.ok(sealingPrice(item)>=row.price);
    assert.deepEqual(gasketPressures(item),row.compatiblePn);
    assert.equal(val(item,"Цена, ₽/шт"),sealingPrice(item));
  }
  const flax=seals.filter(i=>/Лён/.test(i.family));
  assert.equal(flax.length,2);
  for(const item of flax){assert.equal(sealingPrice(item),51.5);assert.equal(val(item,"Единица цены"),"м");}
});

test("merge is repeatable, keeps unrelated data and removes duplicates without lowering price",()=>{
  const source=structuredClone(binding);
  const original=selectGasket(source.items,32,10);
  const duplicate=structuredClone(original);duplicate.id="duplicate-gasket";duplicate.prices[0].amount=99;
  source.items.push(duplicate);
  const merged=mergeSealingSupplement(source,supplement);
  assert.equal(merged.items.length,binding.items.length);
  assert.equal(selectGasket(merged.items,32,40).id,original.id);
  assert.equal(sealingPrice(selectGasket(merged.items,32,40)),99);
  assert.deepEqual(mergeSealingSupplement(merged,supplement),merged);
  assert.deepEqual(merged.items.filter(i=>i.catalogId!=="прокладки"),source.items.filter(i=>i.catalogId!=="прокладки"));
  assert.equal(merged.statistics.componentRows,merged.items.length);
  assert.equal(merged.quality.catalogRecordCounts["прокладки"],27);
  for(const table of merged.catalogs.find(c=>c.id==="прокладки").tables)
    assert.deepEqual(table.recordIds,merged.items.filter(i=>i.tableId===table.id).map(i=>i.id));
});

test("fresh workbook rows use PN to correct generic names and retain their higher prices",()=>{
  const source=structuredClone(binding);
  source.items=source.items.filter(i=>i.tableId!==supplement.id);
  source.catalogs.find(c=>c.id==="прокладки").tables=source.catalogs.find(c=>c.id==="прокладки").tables.filter(t=>t.id!==supplement.id);
  for(const item of source.items.filter(i=>i.tableId==="прокладки-001")) {
    item.fields=item.fields.filter(f=>f.headerPath.at(-1)!=="Совместимые PN");
    item.fields.find(f=>f.headerPath.at(-1)==="PN").value="PN10";
  }
  const merged=mergeSealingSupplement(source,supplement);
  assert.equal(merged.items.filter(i=>i.catalogId==="прокладки").length,27);
  assert.equal(sealingPrice(selectGasket(merged.items,32,25)),10.98);
  assert.equal(sealingPrice(selectGasket(merged.items,100,16)),47.58);
  assert.equal(sealingPrice(selectGasket(merged.items,100,25)),100);
});

test("gaskets prefer compatible PN, then the next greater PN, then nearest while keeping DN",()=>{
  for(const dn of [15,20,25,32,40,50,65,80])for(const pn of [10,16,25,40])assert.ok(selectGasket(binding.items,dn,pn));
  for(const dn of [100,125,150])assert.ok(selectGasket(binding.items,dn,25));
  for(const dn of [200,250])assert.deepEqual(gasketPressures(selectGasket(binding.items,dn,25)),[40]);
  assert.deepEqual(gasketPressures(selectGasket(binding.items,200,17)),[40],"higher PN wins even if PN16 is numerically closer");
  assert.deepEqual(gasketPressures(selectGasket(binding.items,200,63)),[40]);
  for(const [dn,pn] of [[300,16],[350,25],[500,40]])assert.deepEqual(gasketPressures(selectGasket(binding.items,dn,pn)),[10]);
  assert.deepEqual(gasketPressures(selectGasket(binding.items,80,63)),[10,16,25,40]);
  assert.equal(selectGasket(binding.items,90,16),undefined);
  assert.equal(selectGasket([],100,16),undefined);
  assert.equal(selectGasket(binding.items,100,NaN),undefined);
});

test("flax uses the maximum metre price and cannot use a package price",()=>{
  assert.equal(sealingPrice(selectFlax(binding.items)),51.5);
  const metre=structuredClone(selectFlax(binding.items));metre.id="metre-expensive";metre.prices[0].amount=65;
  const pack=structuredClone(metre);pack.id="package";pack.prices[0].amount=999;
  pack.fields.find(f=>f.headerPath.at(-1)==="Единица цены").value="упак.";
  assert.equal(selectFlax([...binding.items,metre,pack]).id,"metre-expensive");
  assert.equal(selectFlax([pack]),undefined);
  assert.equal(selectFlax([]),undefined);
});
