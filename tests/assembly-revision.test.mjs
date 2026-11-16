import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { realStation } from "./fixtures/flange-fasteners.mjs";

const { createCadManifest, snapshotKey }=await loadTs(new URL("../app/cad-export.ts",import.meta.url));
const { rebuildFasteners }=await loadTs(new URL("../app/model-editor/flange-fasteners.ts",import.meta.url));
const { composeValvePose }=await loadTs(new URL("../app/model-editor/valve-controls.ts",import.meta.url));

test("pump-facing rods and shared hardware work across pump sizes, counts, compensators and rotated stations",async()=>{
  for(const [pump,dn,count,vibration] of [["371",80,4,false],["371",80,2,true],["425",100,2,true]]){
    const {project,assembly:original}=await realStation(pump,dn,"aisi304",count,vibration);
    assert.ok(!project.entities["station-spec"].items.some(r=>/-valve-gaskets$/.test(r.assemblyRole??"")));
    assert.ok(!original.components.some(c=>/-valve-gaskets$/.test(c.line?.role??"")));
    for(const rotation of [[0,0,0],[23,65,110]]){
      const assembly=rebuildFasteners({...original,components:original.components.map(c=>({...c,...composeValvePose({position:[500,-230,140],rotation},c)}))});
      const sets=new Map(); let checked=0;
      for(const c of assembly.components.filter(c=>c.fastener?.status==="ready"&&c.fastener.dimensions.ends===1)){
        const members=c.fastener.members.map(id=>assembly.components.find(c=>c.id===id));
        const line=members.find(c=>c.line)?.line;
        const pump=members.find(c=>c.kind==="pump")??assembly.components.find(c=>c.id===line?.pumpId);
        if(!pump)continue;
        const axis=composeValvePose({position:[0,0,0],rotation:c.rotation},{position:[1,0,0],rotation:[0,0,0]}).position;
        assert.ok(axis.reduce((sum,v,i)=>sum+v*(pump.position[i]-c.position[i]),0)>0,c.name);
        checked++;
        if(members.some(c=>c.kind==="pump")){
          const key=`${line?.circuit}:${line?.side}`;
          const names=sets.get(key)??new Set(); names.add(c.fastener.hardware.rod.name);sets.set(key,names);
        }
      }
      assert.ok(checked>=count*2);
      assert.ok([...sets.values()].every(names=>names.size===1));
    }
  }
});

test("collectors and insertions own their loose flanges; gauge names follow the side, and hierarchy changes invalidate CAD",async()=>{
  const {project,assembly}=await realStation();
  project.entities["station-model"].editor={assembly};
  const manifest=createCadManifest(project);
  for(const owner of assembly.components.filter(c=>c.collector||c.insertion)){
    const parts=manifest.instances.filter(p=>p.componentId===owner.id);
    assert.ok(parts.length);
    assert.ok(parts.every(p=>p.subassembly?.id===owner.id));
    const flanges=parts.filter(p=>/фланец/i.test(p.name));
    assert.ok(flanges.length,owner.name);
  }
  for(const [side,designation] of [["suction","КИП1"],["discharge","КИП2"]]){
    const gauge=assembly.components.find(c=>c.instrumentMount?.role==="gauge"&&c.instrumentMount.parentId===`collector-${side}`);
    assert.ok(gauge);assert.ok(gauge.name.includes(designation));
  }
  const before=await snapshotKey(manifest.instances);
  const changed=structuredClone(manifest.instances);delete changed.find(p=>p.subassembly).subassembly;
  assert.notEqual(await snapshotKey(changed),before);
});
