import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const {selectSuctionInstruments:select,pressureRange}=await loadTs(new URL("../app/suction-instruments.ts",import.meta.url));
const {items}=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8"));
const synthetic=(family,range,id="test")=>({id,family,fields:[{headerPath:["Давление, МПа"],value:range}],prices:[]});

test("signed catalogue ranges preserve zero, commas and vacuum",()=>{
  assert.deepEqual(pressureRange(synthetic("Мановакуумметр","−0,1…0,15")),{min:-.1,max:.15});
  assert.deepEqual(pressureRange(synthetic("Манометр","0...0,6")),{min:0,max:.6});
  assert.equal(pressureRange(synthetic("Манометр","0,6")),null);
  assert.equal(pressureRange(synthetic("Манометр","1…0")),null);
  assert.deepEqual(pressureRange(items.find(x=>x.id==="кипиа-002-r0015")),{min:.1,max:1});
});

test("unknown, zero, small and negative inlet head retain vacuum requirements with a warned fallback",()=>{
  for(const head of [undefined,null,NaN,Infinity,0,1,5,-3]) {
    const [gauge,relay]=select(items,head);
    assert.equal(gauge.name,"Манометр");
    assert.equal(gauge.item.id,"кипиа-001-r0005");
    assert.match(gauge.warning,/разрежение до −0,1 МПа не измеряется/);
    assert.match(gauge.details,/-0,1…0,15 МПа/);
    assert.equal(relay.item.id,"кипиа-002-r0013");
    assert.match(relay.details,/уставки отключения и возврата — при наладке/);
  }
  assert.equal(select(items,5.001)[0].name,"Манометр");
  assert.equal(select(items,-6)[1].item.id,"кипиа-002-r0014");
  assert.equal(select(items,-8)[1].item,undefined,"erroneous catalogue minus must not qualify as vacuum relay");
});

test("positive head chooses smallest available gauge with 1.5 margin and switch covering inlet",()=>{
  for(const [head,gaugeId,relayId] of [[30,"кипиа-001-r0005","кипиа-002-r0013"],[50,"кипиа-001-r0006","кипиа-002-r0014"],[80,"кипиа-001-r0007","кипиа-002-r0015"],[120,"кипиа-001-r0008","кипиа-002-r0016"]]) {
    const [gauge,relay]=select(items,head);
    assert.equal(gauge.item.id,gaugeId);assert.equal(relay.item.id,relayId);
    assert.equal(gauge.warning,undefined);
  }
  assert.match(select(items,80)[1].details,/0,1…1 МПа/);
  const boundary=.6/(.00980665*1.5);
  assert.equal(select(items,boundary-1e-7)[0].item.id,"кипиа-001-r0005");
  assert.equal(select(items,boundary+1e-7)[0].item.id,"кипиа-001-r0006");
});

test("compliant vacuum gauge wins; largest catalogue gauge is fallback for excess pressure",()=>{
  const vacuum=synthetic("Мановакуумметр G1/2","-0,1…0,15","vacuum");
  assert.equal(select([...items,vacuum],null)[0].item.id,"vacuum");
  assert.equal(select([...items,vacuum],null)[0].warning,undefined);
  assert.equal(select([],30)[0].item,undefined);
  assert.equal(select(items,200)[0].item.id,"кипиа-001-r0008");
  assert.match(select(items,200)[0].warning,/Требуется 0…4 МПа, выбран 0…2,5 МПа/);
  assert.match(select(items,200)[0].warning,/запас верхнего предела 1,5 не обеспечен/);
  assert.match(select(items,300)[0].warning,/входное давление вне шкалы/);
  assert.equal(select(items,200)[1].item,undefined);
  for(const result of select(items,-20))assert.equal(result.item,undefined);
  assert.match(select(items,-20)[0].details,/проверьте напор/);
});

test("fallback compares both endpoints, excludes other devices and is stable across catalogue order",()=>{
  const candidates=[synthetic("Манометр","0…0,16","positive"),synthetic("Мановакуумметр","-0,05…0,15","partial-vacuum"),synthetic("Реле давления","-0,1…0,15","relay")];
  for(const catalogue of [candidates,[...candidates].reverse()]) {
    assert.equal(select(catalogue,null)[0].item.id,"partial-vacuum");
    assert.match(select(catalogue,null)[0].warning,/разрежение/);
  }
  assert.equal(select([synthetic("Реле давления","0…0,6")],30)[0].item,undefined);
});
