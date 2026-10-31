import test from "node:test";
import assert from "node:assert/strict";
import {loadTs} from "./load-ts.mjs";
import {fixture,choose,sync,resources} from "./fixtures/station-specification.mjs";
const {collectorNippleRules,DEFAULT_COLLECTOR_NIPPLES,legacyBaseSnapshot,validateBaseValues,initialBaseValues}=await loadTs(new URL("../app/base-values.ts",import.meta.url));
const {calculateCollector,collectorCode,collectorStorageCode}=await loadTs(new URL("../app/collector-calculations.ts",import.meta.url));
const count=(c,dn)=>c.instrumentPorts.filter(p=>p.dn===dn).length;

test("collector settings expand to eight independent combinations and preserve the original defaults",async()=>{
  const {collectorCombinationSettings,collectorCombinationKey,collectorCombinationConversionIssue,collectorRuleSet,resolveNippleRule}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const legacy=collectorRuleSet(),before=JSON.stringify(legacy),settings=collectorCombinationSettings(legacy);
  assert.equal(settings.version,3);assert.equal(settings.combinations.length,8);assert.equal(new Set(settings.combinations.map(collectorCombinationKey)).size,8);
  assert.equal(collectorCombinationConversionIssue(legacy),"");
  for(const c of settings.combinations){
    const expected15=c.side==="suction"?1:c.material==="st20"||c.circuits===2?2:1;
    assert.equal(c.outputs.find(o=>o.dn===15).quantity,expected15);assert.equal(c.outputs.find(o=>o.dn===20)?.quantity??0,c.side==="discharge"?1:0);
    assert.ok(c.outputs.every(o=>o.lengthMm===60&&o.threaded));
    const context={...c,stationType:"utility",pn:16,dn:200,tank:false};
    assert.deepEqual(resolveNippleRule(settings,context).outputs,resolveNippleRule(legacy,context).outputs);
  }
  settings.combinations[0].outputs[0].quantity=7;
  assert.equal(settings.combinations[1].outputs[0].quantity,1);assert.equal(JSON.stringify(legacy),before);
  assert.ok(collectorCombinationConversionIssue({...legacy,rules:legacy.rules.slice(0,1)}));
  legacy.rules[0].when.pn="25";assert.match(collectorCombinationConversionIssue(legacy),/нельзя однозначно/);
});

test("each collector combination has its own composition in the project and BOM without rule priority",async()=>{
  const {collectorCombinationSettings,newNippleOutput,resolveNippleRule,collectorCombinationKey}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const settings=collectorCombinationSettings();
  settings.combinations.forEach((c,i)=>{c.outputs=[{...newNippleOutput("own"),quantity:i+1,lengthMm:60+i*5,purpose:"reserve",state:"open",threaded:i%2===0}];});
  const saved=JSON.stringify(settings);
  for(const [i,c] of settings.combinations.entries()){
    const p=fixture();p.entities["station-settings"].baseValues=legacyBaseSnapshot();p.entities["station-settings"].baseValues.values.preferences.collectorNipples=settings;
    p.entities["station-settings"].stationType=c.circuits===2?"combined":"utility";
    if(c.circuits===2)choose(p,"318",1,0,true);
    p.entities["station-collectors"][c.side].overrides.material=c.material;
    const config=sync(p).entities["station-collectors"][c.side].configuration;
    assert.equal(config.instrumentPorts.length,i+1,collectorCombinationKey(c));assert.ok(config.instrumentPorts.every(port=>port.lengthMm===60+i*5&&port.threaded===(i%2===0)));
    const bom=calculateCollector(config,resources.components.collectorCatalog).bom;
    assert.equal(bom.filter(row=>row.kind==="nipple").reduce((n,row)=>n+row.quantity,0),i+1);
    for(const stationType of ["utility","fire","combined","smart"])for(const pn of [10,16,25])for(const tank of [true,false]){
      const context={...c,stationType,pn,tank,dn:75};
      assert.equal(resolveNippleRule(settings,context).outputs[0].quantity,i+1);
      assert.deepEqual(resolveNippleRule({...settings,combinations:[...settings.combinations].reverse()},context).outputs,resolveNippleRule(settings,context).outputs);
    }
  }
  assert.equal(JSON.stringify(settings),saved);
  settings.combinations[0].outputs=[];
  assert.deepEqual(resolveNippleRule(settings,{...settings.combinations[0],stationType:"utility",pn:16,dn:200,tank:false}).outputs,[]);
});

test("combination settings require every unique tuple and validate the actual dimensions",async()=>{
  const {collectorCombinationSettings,validateCollectorNippleRules}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const good=collectorCombinationSettings();assert.deepEqual(validateCollectorNippleRules(good),[]);
  for(const change of [v=>v.combinations.pop(),v=>v.combinations.push(structuredClone(v.combinations[0])),v=>v.combinations[1]=structuredClone(v.combinations[0]),v=>v.combinations[0].side="all",v=>v.combinations[0].material="all",v=>v.combinations[0].circuits="1",v=>v.combinations[0].circuits=3,v=>v.combinations[0].outputs=null,v=>v.combinations[0].outputs[0].lengthMm=0,v=>v.combinations[0].outputs[0].quantity=33,v=>v.combinations[0].outputs[0].threadLengthMm=100]){
    const bad=structuredClone(good);change(bad);assert.ok(validateCollectorNippleRules(bad).length);
    const values=initialBaseValues();values.preferences.collectorNipples=bad;assert.ok(validateBaseValues(values).length);
  }
});

test("editing one combination is shown in project updates and invalidates collector calculations only when applied",async()=>{
  const {collectorCombinationSettings}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const {projectBaseChanges,applyProjectBaseUpdate}=await loadTs(new URL("../app/base-values-project.ts",import.meta.url));
  const p=fixture();p.entities["station-settings"].baseValues=legacyBaseSnapshot();p.entities["station-settings"].baseValues.values.preferences.collectorNipples=collectorCombinationSettings();const original=JSON.stringify(p);
  const next=structuredClone(p.entities["station-settings"].baseValues);next.versions.preferences="combinations";next.values.preferences.collectorNipples.combinations[7].outputs[0].quantity=4;
  const change=projectBaseChanges(p,next).find(c=>c.label==="Настройки коллекторов");assert.ok(change);assert.match(change.after,/Напорный · 2 контура · Ст20/);assert.match(change.after,/4 × DN15/);
  const updated=applyProjectBaseUpdate(p,next,["preferences"]);assert.equal(JSON.stringify(p),original);assert.equal(updated.entities["station-collectors"].discharge.databaseStatus,"unchecked");
  assert.deepEqual(updated.entities["station-settings"].baseValues.values.preferences.collectorNipples.combinations.slice(0,7),p.entities["station-settings"].baseValues.values.preferences.collectorNipples.combinations.slice(0,7));
});

test("all material/circuit combinations follow the collector nipple rules; two conditions never double the count",()=>{
  for(const material of ["aisi304","st20"])for(const twoCircuits of [false,true])for(const tank of [false,true]){
    const p=fixture();Object.assign(p.entities["station-settings"],{stationType:twoCircuits?"combined":"utility",membraneTank:tank});
    if(twoCircuits)choose(p,"318",1,0,true);
    for(const side of ["suction","discharge"])p.entities["station-collectors"][side].overrides.material=material;
    const next=sync(p),cards=next.entities["station-collectors"];
    assert.equal(count(cards.suction.configuration,15),1);assert.equal(count(cards.suction.configuration,20),0);
    assert.equal(count(cards.discharge.configuration,15),material==="st20"||twoCircuits?2:1);assert.equal(count(cards.discharge.configuration,20),1);
    assert.equal(cards.discharge.configuration.instrumentPorts.find(p=>p.id==="tank").state,tank?"occupied":"capped");
    for(const side of ["suction","discharge"]){const c=cards[side].configuration,bom=calculateCollector(c,resources.components.collectorCatalog).bom;assert.equal(bom.filter(r=>r.kind==="nipple").reduce((n,r)=>n+r.quantity,0),c.instrumentPorts.length);assert.ok(!/КИП|_Б-|_СЕК-/.test(collectorCode(c)));}
  }
});

test("parameter rules use all conditions and first-match priority, including disabled rules and DN/PN/tank limits",async()=>{
  const {collectorRuleSet,anyNippleConditions,newNippleOutput,resolveNippleRule}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const rule={id:"custom",name:"Своя схема",enabled:true,when:{...anyNippleConditions(),side:"discharge",material:"aisi304",circuits:"2",stationType:"combined",pn:"25",dnFrom:100,dnTo:200,tank:"on"},outputs:[{...newNippleOutput("custom-dn25"),dn:25,quantity:3,lengthMm:90,threaded:false,purpose:"reserve",state:"open"}]};
  const config=collectorRuleSet();config.rules.unshift(rule);
  const context={side:"discharge",material:"aisi304",circuits:2,stationType:"combined",pn:25,dn:100,tank:true};
  assert.equal(resolveNippleRule(config,context).rule.id,"custom");assert.equal(resolveNippleRule(config,{...context,dn:200}).rule.id,"custom");
  for(const patch of [{side:"suction"},{material:"st20"},{circuits:1},{stationType:"fire"},{pn:16},{dn:99},{dn:201},{dn:null},{tank:false}])assert.notEqual(resolveNippleRule(config,{...context,...patch}).rule.id,"custom");
  config.rules[0].enabled=false;assert.notEqual(resolveNippleRule(config,context).rule.id,"custom");
  config.rules[0].enabled=true;config.rules.push(config.rules.shift());assert.notEqual(resolveNippleRule(config,context).rule.id,"custom");
});

test("zero output and an unmatched rule are distinct; custom sizes and dimensions reach the project and BOM",async()=>{
  const {anyNippleConditions,newNippleOutput,resolveNippleRule}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const context={side:"suction",material:"aisi304",circuits:1,stationType:"utility",pn:16,dn:100,tank:false};
  const config={version:2,rules:[{id:"empty",name:"Без сгонов",enabled:true,when:anyNippleConditions(),outputs:[]}]};
  assert.equal(resolveNippleRule(config,context).error,"");assert.deepEqual(resolveNippleRule(config,context).outputs,[]);
  const p=fixture();p.entities["station-settings"].baseValues=legacyBaseSnapshot();p.entities["station-settings"].baseValues.values.preferences.collectorNipples=config;
  let next=sync(p);for(const side of ["suction","discharge"]){assert.deepEqual(next.entities["station-collectors"][side].configuration.instrumentPorts,[]);assert.equal(calculateCollector(next.entities["station-collectors"][side].configuration,resources.components.collectorCatalog).bom.filter(r=>r.kind==="nipple").length,0);}
  config.rules[0].outputs=[{...newNippleOutput("reserved"),dn:25,quantity:3,lengthMm:90,threaded:false,purpose:"reserve",state:"open"}];
  next=sync(p);const c=next.entities["station-collectors"].discharge.configuration;assert.equal(c.instrumentPorts.length,3);assert.ok(c.instrumentPorts.every(port=>port.dn===25&&port.lengthMm===90&&port.threaded===false&&port.state==="open"));
  assert.equal(calculateCollector(c,resources.components.collectorCatalog).bom.filter(r=>r.kind==="nipple").reduce((n,r)=>n+r.quantity,0),3);
  config.rules[0].outputs[0].quantity=0;next=sync(p);assert.deepEqual(next.entities["station-collectors"].discharge.configuration.instrumentPorts,[]);
  config.rules[0].enabled=false;next=sync(p);assert.match(next.entities["station-collectors"].discharge.configuration.instrumentRuleIssue,/Не найдено/);assert.equal(next.entities["station-collectors"].discharge.code,null);
});

test("parameterized rule validation bounds workload and rejects ambiguous IDs or invalid dimensions",async()=>{
  const {anyNippleConditions,newNippleOutput,validateCollectorNippleRules}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const good={version:2,rules:[{id:"one",name:"Правило",enabled:true,when:anyNippleConditions(),outputs:[newNippleOutput("outlet")]}]};assert.deepEqual(validateCollectorNippleRules(good),[]);
  for(const change of [v=>v.version=3,v=>v.rules[0].when.dnFrom=200,v=>v.rules[0].outputs[0].quantity=-1,v=>v.rules[0].outputs[0].quantity=33,v=>v.rules[0].outputs[0].quantity=.5,v=>v.rules[0].outputs[0].lengthMm=0,v=>v.rules[0].outputs[0].threadLengthMm=80,v=>v.rules[0].outputs[0].threadPitchMm=0,v=>v.rules[0].outputs[0].dn=80,v=>v.rules.push(structuredClone(v.rules[0])),v=>v.rules[0].outputs.push(structuredClone(v.rules[0].outputs[0]))]){
    const bad=structuredClone(good);bad.rules[0].when.dnTo=100;change(bad);assert.ok(validateCollectorNippleRules(bad).length);
  }
  const over=structuredClone(good);over.rules[0].outputs[0].quantity=32;over.rules[0].outputs.push({...newNippleOutput("extra"),quantity:1});assert.match(validateCollectorNippleRules(over).join(" "),/всего/);
});

test("a condition-only edit is visible in the project update review and keeps the current project unchanged",async()=>{
  const {collectorRuleSet}=await loadTs(new URL("../app/collector-nipple-rules.ts",import.meta.url));
  const {projectBaseChanges,applyProjectBaseUpdate}=await loadTs(new URL("../app/base-values-project.ts",import.meta.url));
  const p=fixture();p.entities["station-settings"].baseValues=legacyBaseSnapshot();p.entities["station-settings"].baseValues.values.preferences.collectorNipples=collectorRuleSet();const original=JSON.stringify(p);
  const next=structuredClone(p.entities["station-settings"].baseValues);next.versions.preferences="new-rules";next.values.preferences.collectorNipples.rules[1].when.pn="25";
  const changes=projectBaseChanges(p,next);assert.ok(changes.some(c=>c.label==="Настройки коллекторов"&&c.after.includes("PN: 25")));
  const updated=applyProjectBaseUpdate(p,next,["preferences"]);assert.equal(updated.entities["station-settings"].baseValues.versions.preferences,"new-rules");assert.equal(JSON.stringify(p),original);
});

test("published custom nipple counts change composition while the readable code stays unchanged",()=>{
  const p=fixture();p.entities["station-settings"].baseValues=legacyBaseSnapshot();
  const standard=sync(p),code=standard.entities["station-collectors"].discharge.code;
  p.entities["station-settings"].baseValues.values.preferences.collectorNipples={...DEFAULT_COLLECTOR_NIPPLES,dischargeDn15:3};
  const customized=sync(p),c=customized.entities["station-collectors"].discharge.configuration;
  assert.equal(count(c,15),3);assert.equal(customized.entities["station-collectors"].discharge.code,code);
  assert.notEqual(collectorStorageCode(c),collectorStorageCode(standard.entities["station-collectors"].discharge.configuration));
});

test("old publications retain their bytes and use the requested defaults when no rule was stored",()=>{
  const old=initialBaseValues(),before=JSON.stringify(old);assert.deepEqual(collectorNippleRules(old),{suctionDn15:1,dischargeDn15:1,dischargeSt20OrTwoCircuitsDn15:2,dischargeDn20:1});assert.equal(JSON.stringify(old),before);
  for(const bad of [null,{},[],{...DEFAULT_COLLECTOR_NIPPLES,suctionDn15:0},{...DEFAULT_COLLECTOR_NIPPLES,dischargeDn20:1.5}]){const values=initialBaseValues();values.preferences.collectorNipples=bad;assert.match(validateBaseValues(values).join(" "),/Количество сгонов/);}
});
