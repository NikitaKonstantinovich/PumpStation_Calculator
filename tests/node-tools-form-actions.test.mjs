import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { applyParameterWrites } = await loadTs(new URL("../app/node-tools/form-actions.ts", import.meta.url));
const binding = (key, meaning, unit) => ({ key, node: "settings/main/" + key, toolId: "settings", field: {key,name:key,kind:"float",meaning,unit,direction:"input",required:true,min:0}, value:10,active:true,editable:true,permission:"input",origin:"Введено пользователем",mode:"user" });
const flow=binding("main.flowRate","flow","м³/ч"),head=binding("main.head","head","м");

test("a point edit changes both owning settings together and preserves other tool state",()=>{
  const old={settings:{other:7,"main.flowRate":10,"main.head":10},chart:{method:"linear"},selection:{selectedPump:{variantId:"manual"}}};
  const result=applyParameterWrites(old,[flow,head],[{binding:flow,value:60},{binding:head,value:20}],"chart");
  assert.deepEqual(result.settings,{other:7,"main.flowRate":60,"main.head":20});
  assert.equal(result.chart,old.chart);assert.equal(result.selection,old.selection);assert.equal(old.settings["main.flowRate"],10);
});

test("invalid second write cannot partially commit a point change",()=>{
  const old={settings:{"main.flowRate":10,"main.head":10}};
  assert.throws(()=>applyParameterWrites(old,[flow,head],[{binding:flow,value:60},{binding:head,value:-1}],"chart"),/диапазон/);
  assert.deepEqual(old.settings,{"main.flowRate":10,"main.head":10});
});

test("writes cannot forge permissions, ownership or values of the evaluated bindings",()=>{
  const old={settings:{}};
  for(const forged of [{...flow,editable:false},{...flow,toolId:"chart"},{...flow,value:99}]) assert.throws(()=>applyParameterWrites(old,[flow],[{binding:forged,value:60}],"chart"),/Привязка/);
  for(const locked of [{...flow,editable:false},{...flow,active:false},{...flow,mode:"fixed"},{...flow,mode:"computed"}]) assert.throws(()=>applyParameterWrites(old,[locked],[{binding:locked,value:60}],"chart"),/недоступно/);
});

test("duplicate actions and absent owning tool state fail before mutation",()=>{
  assert.throws(()=>applyParameterWrites({settings:{}},[flow],[{binding:flow,value:1},{binding:flow,value:2}],"chart"),/Повторяется/);
  assert.throws(()=>applyParameterWrites({chart:{}},[flow],[{binding:flow,value:1}],"chart"),/Отсутствует состояние/);
});
