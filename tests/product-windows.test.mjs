import test from "node:test";
import assert from "node:assert/strict";
import {loadTs} from "./load-ts.mjs";
import {engineeringStore} from "./fixtures/engineering-store.mjs";
const app=new URL("../app/",import.meta.url);
const layout=await loadTs(new URL("node-tools/window-layout.ts",app));
const {ParameterDrafts}=await loadTs(new URL("node-tools/parameter-drafts.ts",app));
const {initialTools}=await loadTs(new URL("node-tools/factory.ts",app));
const {prepareDocument}=await loadTs(new URL("node-tools/authoring.ts",app));
const {connectWorkspaceControls}=await loadTs(new URL("node-tools/workspace-upgrade.ts",app));
const {compileTools}=await loadTs(new URL("node-tools/compiler.ts",app));
const {evaluateProduct}=await loadTs(new URL("node-tools/runtime.ts",app));
const {productEvaluator,workspaceControls,writeControl,toolAvailable}=await loadTs(new URL("node-tools/workspace-controls.ts",app));
const {migrateProduct,productContexts}=await loadTs(new URL("node-tools/product-state.ts",app));
const defaults={usdRate:85,cnyRate:13};
const values={stationType:"utility","main.flowRate":20,"main.head":30,"main.workingPumpCount":1,"main.reservePumpCount":1};
function controlled(){const doc=prepareDocument(initialTools());connectWorkspaceControls(doc,"settings");return doc;}

test("unfinished numeric text survives window switches, is shared, and cannot leak across projects",()=>{
  const project=new ParameterDrafts(),other=new ParameterDrafts();let notifications=0;
  const stop=project.subscribe(()=>notifications++);
  project.write("settings/flow","value=50","12,");
  assert.equal(project.read("settings/flow","value=50"),"12,");
  assert.equal(other.read("settings/flow","value=50"),null);
  assert.equal(project.pending,true);
  assert.equal(project.read("settings/flow","value=80"),null);
  project.prune("settings/flow","value=80");assert.equal(project.pending,false);
  project.write("settings/flow","value=80","bad-input");
  project.write("settings/flow","value=80",null);assert.equal(project.pending,false);
  assert.equal(notifications,4);stop();
});

test("layout round trip preserves independent windows, minimized state, unequal tracks and removed tool IDs",()=>{
  const state=layout.initialLayout("renamed-stable-id");state.windows.push({...layout.newWindow("second","renamed-stable-id",1),minimized:true,w:995,x:654});
  state.windows[0].activeTool="deleted-tool";state.windows[0].entityId="deleted-tool";state.grid.columnSizes=[.7,1.3];state.grid.cells=["initial","second",null,null];state.zoom=80;state.gridHeightScreens=2.3;
  assert.deepEqual(layout.readLayout(JSON.stringify(state)),state);
  const closed=layout.closeWindow(state,"second");assert.equal(closed.windows.length,1);assert.equal(closed.grid.cells[1],null);assert.equal(state.windows.length,2);
  const grid=layout.fitGrid({...state,windows:[...state.windows,...Array.from({length:5},(_,i)=>layout.newWindow("more"+i))]},2,2);
  assert.equal(grid.windows.filter(w=>!w.minimized).length,4);assert.equal(new Set(grid.grid.cells).size,4);
});
test("layout storage keys isolate user, algorithm and project; damaged layouts are bounded and recoverable",()=>{
  const keys=[layout.layoutKey("a","b","c"),layout.layoutKey("other","b","c"),layout.layoutKey("a","other","c"),layout.layoutKey("a","b","other")];assert.equal(new Set(keys).size,4);
  assert.notEqual(layout.layoutKey("a/b","c","d"),layout.layoutKey("a","b/c","d"));
  assert.deepEqual(layout.readLayout("broken","settings"),layout.initialLayout("settings"));
  const state=layout.initialLayout("settings");state.windows[0].w=-99;state.grid.rows=500;state.grid.cells=["missing"];
  const parsed=layout.readLayout(JSON.stringify(state));assert.equal(parsed.windows[0].w,280);assert.equal(parsed.grid.rows,6);assert.equal(parsed.grid.cells[0],null);
});
test("explicit controls edit preserves user nodes and wires, is idempotent, and follows stable IDs after renaming",()=>{
  const doc=prepareDocument(initialTools()),before=structuredClone(doc);
  const root=doc.diagrams.find(g=>g.id===doc.product.root);root.nodes.find(n=>n.id==="settings").name="Параметры узла";
  assert.equal(connectWorkspaceControls(doc,"settings"),2);assert.equal(connectWorkspaceControls(doc,"settings"),0);
  for(const graph of before.diagrams){const next=doc.diagrams.find(g=>g.id===graph.id);for(const n of graph.nodes)assert(next.nodes.some(x=>x.id===n.id&&x.x===n.x&&x.y===n.y));for(const e of graph.edges)assert(next.edges.some(x=>JSON.stringify(x)===JSON.stringify(e)));}
  const program=compileTools(doc,"pinned"),contexts={settings:{values,defaults,role:"admin"}};
  const controls=workspaceControls(program,productEvaluator(program,contexts));assert.deepEqual(controls.map(c=>[c.kind,c.binding.value]),[["geometry",false],["pressure",true]]);
  assert.equal(program.tools[0].name,"Параметры узла");
  doc.product.controls.geometry.node="settings/missing";assert.throws(()=>compileTools(doc,"bad"),/логический параметр/);
});
test("one project state feeds duplicated windows; control writes retain pins, selections and unrelated tool values",()=>{
  const program=compileTools(controlled(),"pinned"),data=migrateProduct(program,undefined,defaults,{base:"base-v1"},"admin").data;
  Object.assign(data.tools.settings.values,values);data.product.sourceVersions={pump_catalog_v2:"catalog-v7"};
  const evaluate=productEvaluator(program,productContexts(program,data,defaults,"admin"));
  assert.equal(evaluate("settings"),evaluate("settings"),"same instrument is evaluated once across windows");
  const pressure=workspaceControls(program,evaluate).find(c=>c.kind==="pressure"),next=writeControl(data,pressure,false);
  assert.equal(next.tools.settings.values.pressureChecksEnabled,false);assert.equal(data.tools.settings.values.pressureChecksEnabled,undefined);
  assert.deepEqual(next.product,data.product);assert.equal(next.tools.settings.values["main.flowRate"],20);
  const updated=productEvaluator(program,productContexts(program,next,defaults,"admin"));assert.equal(updated("settings").value.pressureChecksEnabled,false);assert.equal(updated("settings").value.main.flowRate,20);
  const low=workspaceControls(program,productEvaluator(program,productContexts(program,data,defaults,"base"))).find(c=>c.kind==="pressure");
  assert.throws(()=>writeControl(data,low,false),/недоступно/);
});
test("products without declared capabilities have no controls",()=>{
  const program=compileTools(prepareDocument(initialTools()),"old");assert.deepEqual(workspaceControls(program,()=>{throw Error("must not evaluate");}),[]);
});

test("explicit migration imports saved project flags only when graph values are absent",()=>{
  const program=compileTools(controlled(),"new");
  const migrated=migrateProduct(program,undefined,defaults,{},"admin",undefined,{}, {geometry:true,pressure:false}).data;
  assert.equal(migrated.tools.settings.values.geometryEnabled,true);
  assert.equal(migrated.tools.settings.values.pressureChecksEnabled,false);
  const next=migrateProduct(program,migrated,defaults,{},"admin",undefined,{}, {geometry:false,pressure:true}).data;
  assert.equal(next.tools.settings.values.geometryEnabled,true);
  assert.equal(next.tools.settings.values.pressureChecksEnabled,false);
  const unsupported=compileTools(prepareDocument(initialTools()),"old");
  assert.deepEqual(migrateProduct(unsupported,undefined,defaults,{},"admin",undefined,{}, {geometry:true}).data.tools.settings.values,{});
});
test("geometry gate skips the entire data branch when disabled and evaluates current inputs after enabling",()=>{
  // A missing dependency deliberately throws if the supposedly disabled branch is visited.
  const op={id:"geometry/panel",type:"ui.stationGeometry",operation:"ui.stationGeometry",name:"Geometry",fields:[{key:"enabled",kind:"boolean",meaning:"flag",unit:"",direction:"input",name:"Enabled"},{key:"data",kind:"object",meaning:"stationSpecificationResult",unit:"",direction:"input",name:"Data"},{key:"value",kind:"object",meaning:"view",unit:"",direction:"output",name:"View"}],values:{enabled:false},expressions:{},links:[{from:"expensive-missing",out:"value",to:"geometry/panel",input:"data"}]};
  const result={id:"result",type:"result",fields:[{key:"ui",kind:"object",meaning:"view",unit:"",direction:"input",name:"UI"}],values:{},expressions:{},links:[{from:op.id,out:"value",to:"result",input:"ui"}]};
  const program={version:"v1",tools:[{id:"geometry",name:"Geometry"}],plans:{geometry:{steps:[op,result],productRoot:"root",toolId:"geometry"}},product:{root:"root",dependencies:{}}};
  const context={geometry:{values:{},defaults:{},role:"admin"}};
  assert.equal(evaluateProduct(program,"geometry",context).view.enabled,false);
  op.values.enabled=true;assert.throws(()=>evaluateProduct(program,"geometry",context),/Источник связи отсутствует/);
  context.geometry.role="base";assert.equal(evaluateProduct(program,"geometry",context).view.enabled,false,"role gate also prevents heavy work");
  op.values.enabled=false;assert.equal(evaluateProduct(program,"geometry",context).view.enabled,false);
});
test("availability menu reads only circuit guards, never downstream calculations",()=>{
  const active={key:"active",kind:"boolean",meaning:"flag",unit:"",name:"Active",direction:"input",initial:false};
  const plan={productRoot:"root",toolId:"secondary",steps:[{id:"secondary/guard",operation:"circuit.guard",fields:[active],values:{active:false},expressions:{},links:[]}]};
  const program={version:"pinned",tools:[],plans:{secondary:plan}},context={secondary:{values:{},defaults:{},role:"admin"}};
  assert.equal(toolAvailable(program,"secondary",context),false);plan.steps[0].values.active=true;assert.equal(toolAvailable(program,"secondary",context),true);
});
test("server enforces flags through the same parameter bindings and rejects forged permissions",async()=>{
  const f=await engineeringStore();try{
    const storage=await f.load("node-tools/storage-server");let state=await storage.toolState();
    state=await storage.toolCommand({action:"publish",revision:state.revision,document:controlled()},"Test");
    const program=await storage.toolProgram(state.active),base=await storage.toolDefaults();
    const data=migrateProduct(program,undefined,base.defaults,base.baseVersions,"admin").data;
    Object.assign(data.tools.settings.values,values,{geometryEnabled:false,pressureChecksEnabled:true});
    await storage.verifyWorkspace(structuredClone(data),undefined,"admin");
    for(const [key,value] of [["pressureChecksEnabled",false],["geometryEnabled",true]]){
      const next=structuredClone(data);next.tools.settings.values[key]=value;
      await storage.verifyWorkspace(structuredClone(next),data,"admin");
      await assert.rejects(()=>storage.verifyWorkspace(next,data,"base"),e=>e.status===403);
    }
    const invalid=structuredClone(data);invalid.tools.settings.values["main.flowRate"]=-1;
    await assert.rejects(()=>storage.verifyWorkspace(invalid,data,"admin"),/Расход|расход|диапазон/);
  }finally{f.close();}
});
