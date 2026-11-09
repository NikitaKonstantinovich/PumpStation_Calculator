import assert from "node:assert/strict";
import test from "node:test";
import { engineeringStore } from "./fixtures/engineering-store.mjs";

async function fixture() {
  const f=await engineeringStore();
  const storage=await f.load("node-tools/storage-server"), library=await f.load("node-tools/algorithm-store-server");
  await storage.initializeAlgorithms();
  return {...f,storage,library};
}
async function publish(f,id,document) {
  const state=await f.storage.toolState(id);
  return f.storage.toolCommand({action:"publish",algorithmId:id,revision:state.revision,document},"Инженер");
}
test("migration backs up and preserves actual draft, published snapshots and stable IDs; restart is idempotent",async()=>{
  const f=await engineeringStore();try{
    const factory=await f.load("node-tools/factory"),compiler=await f.load("node-tools/compiler"),product=await f.load("node-tools/product");
    const doc=product.upgradeDocument(factory.initialTools());
    doc.diagrams[0].name="Пользовательский граф";
    const draft=structuredClone(doc);draft.diagrams[0].nodes[0].x=918;
    f.sql.prepare("INSERT INTO node_tool_versions(id,document,program,author) VALUES(?,?,?,?)").run("existing-v1",JSON.stringify(doc),JSON.stringify(compiler.compileTools(doc,"existing-v1")),"Администратор");
    f.sql.prepare("UPDATE node_tool_state SET revision=44,active=?,draft=?").run("existing-v1",JSON.stringify(draft));
    const storage=await f.load("node-tools/storage-server"),library=await f.load("node-tools/algorithm-store-server");
    const state=await storage.toolState();assert.equal(state.active,"existing-v1");assert.equal(JSON.stringify(state.draft),JSON.stringify(draft));assert.equal(state.revision,44);
    assert.equal(f.sql.prepare("SELECT draft FROM node_algorithm_migration_backup").get().draft,JSON.stringify(draft));
    await storage.initializeAlgorithms();await storage.initializeAlgorithms();
    assert.equal((await library.listAlgorithms()).length,1);assert.equal((await library.algorithmHistory("pump-station")).length,1);
    assert.equal((await library.listAlgorithms())[0].connected,true);
    assert.equal(f.sql.prepare("SELECT document FROM node_tool_versions WHERE id='existing-v1'").get().document,JSON.stringify(doc));
  }finally{f.close();}
});
test("empty products are valid and adding the first Instrument uses the shared engine",async()=>{
  const f=await fixture();try{
    const id=await f.library.createAlgorithm("  Водомерный узел  ","Администратор");
    const state=await f.storage.toolState(id);assert.equal(state.name,"Водомерный узел");assert.equal(state.connected,false);assert.equal(state.draft.diagrams[0].nodes.length,0);assert.equal(state.draft.types.length,0);
    const program=await f.storage.toolProgram(undefined,id);assert.equal(program.tools.length,0);assert.equal(program.algorithmId,id);
    const authoring=await f.load("node-tools/authoring"), added=authoring.addProductTool(state.draft,"Исходные данные");
    const saved=await publish(f,id,added.document);assert.equal(saved.versions[0].number,2);
    const runtime=await f.load("node-tools/runtime"), compiled=await f.storage.toolProgram(undefined,id);
    assert.equal(runtime.evaluateProduct(compiled,added.id,{[added.id]:{values:{},defaults:{},role:"admin"}}).view.kind,"form");
    await assert.rejects(()=>f.library.createAlgorithm("ВОДОМЕРНЫЙ УЗЕЛ","Администратор"),e=>e.status===409);
    await assert.rejects(()=>f.library.createAlgorithm("   ","Администратор"));
  }finally{f.close();}
});
test("clone current and backup versions deeply, isolate drafts and nested definitions, keep provenance",async()=>{
  const f=await fixture();try{
    const source=await f.storage.toolState(), original=source.active;
    const copyId=await f.library.createAlgorithm("Копия","Инженер",{algorithmId:"pump-station",version:original});
    const copy=await f.storage.toolState(copyId);assert.deepEqual(copy.draft,JSON.parse((await f.library.algorithmSnapshot("pump-station",original)).document));
    const edited=structuredClone(copy.draft);edited.types[0].name="Только в копии";
    await f.storage.toolCommand({action:"save",algorithmId:copyId,revision:copy.revision,document:edited},"Инженер");
    assert.notEqual((await f.storage.toolState()).draft.types[0].name,"Только в копии");
    const v2=await publish(f,copyId,edited), history=await f.library.algorithmHistory(copyId);
    const backupId=await f.library.createAlgorithm("Копия резерва","Инженер",{algorithmId:copyId,version:history[1].id});
    assert.deepEqual((await f.storage.toolState(backupId)).draft,copy.draft);
    assert.equal((await f.library.algorithmHistory(backupId)).length,1);
    assert.equal((await f.library.algorithmHistory(backupId))[0].sourceVersion,history[1].id);
    assert.equal((await f.library.algorithmHistory(backupId))[0].sourceAlgorithm,copyId);
    await assert.rejects(()=>f.library.algorithmSnapshot(backupId,v2.active),e=>e.status===404);
    await assert.rejects(()=>f.storage.toolProgram(v2.active,backupId),e=>e.status===404);
  }finally{f.close();}
});
test("autosave does not create versions; five visible snapshots, monotonic restore, pinned archive retained",async()=>{
  const f=await fixture();try{
    const id=await f.library.createAlgorithm("История","Инженер"),initial=await f.storage.toolState(id);
    for(let i=0;i<7;i++){const state=await f.storage.toolState(id);await f.storage.toolCommand({action:"save",algorithmId:id,revision:state.revision,document:state.draft},"Инженер");}
    assert.equal((await f.library.algorithmHistory(id)).length,1);
    for(let i=0;i<6;i++)await publish(f,id,initial.draft);
    const before=await f.storage.toolState(id),history=await f.library.algorithmHistory(id);assert.deepEqual(history.map(v=>v.number),[7,6,5,4,3]);
    const snapshot=await f.library.algorithmSnapshot(id,history[3].id);
    await f.library.restoreAlgorithm(id,before.revision,history[3].id,"Инженер");
    const after=await f.storage.toolState(id);assert.equal(after.versions[0].number,8);assert.equal(after.versions[1].id,before.active);assert.equal(after.versions[0].reason,"restore");assert.equal(after.versions[0].sourceVersion,history[3].id);
    assert.deepEqual(await f.library.algorithmSnapshot(id,history[3].id),snapshot);
    assert.deepEqual(after.draft,JSON.parse(snapshot.document));assert.equal(after.name,"История");assert.equal(after.connected,false);
    assert.equal((await f.storage.toolProgram(initial.active,id)).version,initial.active);
    const state=await f.storage.toolState(id);await f.storage.toolCommand({action:"save",algorithmId:id,revision:state.revision,document:state.draft},"Инженер");
    await assert.rejects(()=>f.library.restoreAlgorithm(id,state.revision+1,state.versions[1].id,"Инженер"),e=>e.status===409);
  }finally{f.close();}
});
test("concurrent writes conflict and transaction failure leaves current version and draft intact",async()=>{
  const f=await fixture();try{
    const id=await f.library.createAlgorithm("Конфликты","Инженер"),state=await f.storage.toolState(id);
    const results=await Promise.allSettled([1,2].map(()=>f.storage.toolCommand({action:"save",algorithmId:id,revision:state.revision,document:state.draft},"Инженер")));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.status,409);
    const second=await publish(f,id,state.draft),before=await f.storage.toolState(id),count=f.sql.prepare("SELECT count(*) n FROM node_tool_versions").get().n;
    f.sql.exec("CREATE TRIGGER simulate_failure BEFORE UPDATE OF active ON node_algorithms BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END");
    await assert.rejects(()=>f.library.restoreAlgorithm(id,before.revision,second.versions[1].id,"Инженер"),/simulated disk failure/);
    assert.deepEqual(await f.storage.toolState(id),before);assert.equal(f.sql.prepare("SELECT count(*) n FROM node_tool_versions").get().n,count);
    f.sql.exec("DROP TRIGGER simulate_failure");
    await f.library.restoreAlgorithm(id,before.revision,second.versions[1].id,"Инженер");assert.equal((await f.storage.toolState(id)).versions[0].number,3);
  }finally{f.close();}
});
test("library and runtime routes enforce roles, connection status and version ownership",async()=>{
  const f=await fixture();try{
    const admin=await f.load("api/admin/algorithms/route"),runtime=await f.load("api/workspace2/route"),publicRoute=await f.load("api/algorithms/route");
    const request=(url,role,body)=>new Request("http://fixture"+url,{method:body?"POST":"GET",headers:role?{"x-test-role":role}:{},body:body?JSON.stringify(body):undefined});
    for(const role of [null,"base","plus","pro"]){const status=role?403:401;assert.equal((await admin.GET(request("/api/admin/algorithms",role))).status,status);assert.equal((await admin.POST(request("/api/admin/algorithms",role,{action:"create",name:"Недопустимый"}))).status,status);}
    const id=await f.library.createAlgorithm("Продукт","Инженер"),state=await f.storage.toolState(id);
    assert.equal((await runtime.GET(request("/api/workspace2?algorithm="+id,"admin"))).status,403);
    assert.equal((await runtime.GET(request("/api/workspace2?algorithm="+id+"&editor=1","admin"))).status,200);
    assert.equal((await runtime.GET(request("/api/workspace2?algorithm="+id+"&editor=1","pro"))).status,403);
    await f.library.setAlgorithmConnected(id,state.revision,true);
    const menu=await (await publicRoute.GET(request("/api/algorithms","base"))).json();assert.equal(menu.algorithms.length,2);
    assert.equal((await runtime.GET(request("/api/workspace2?algorithm="+id,"base"))).status,200);
    const defaultState=await f.storage.toolState();assert.equal((await runtime.GET(request("/api/workspace2?algorithm="+id+"&version="+defaultState.active,"admin"))).status,404);
    await f.library.setAlgorithmConnected(id,(await f.storage.toolState(id)).revision,false);
    assert.equal((await runtime.GET(request("/api/workspace2?algorithm="+id,"base"))).status,403);
    assert.equal((await f.storage.toolState(id)).active,state.active);
  }finally{f.close();}
});

test("saving a draft and restoring the oldest backup is atomic and does not evict the target mid-operation",async()=>{
  const f=await fixture();try{
    const id=await f.library.createAlgorithm("Атомарное восстановление","Инженер"), initial=await f.storage.toolState(id);
    for(let i=0;i<4;i++)await publish(f,id,initial.draft);
    let state=await f.storage.toolState(id);
    const draft=structuredClone(state.draft);draft.diagrams[0].name="Несохранённая версия";
    state=await f.storage.toolCommand({action:"save",algorithmId:id,revision:state.revision,document:draft},"Инженер");
    const count=f.sql.prepare("SELECT count(*) n FROM node_tool_versions").get().n;
    f.sql.exec("CREATE TRIGGER restore_failure BEFORE INSERT ON node_algorithm_versions WHEN NEW.reason='restore' BEGIN SELECT RAISE(ABORT,'restore failed'); END");
    await assert.rejects(()=>f.storage.toolCommand({action:"restore-preserve",algorithmId:id,revision:state.revision,document:draft,version:initial.active},"Инженер"),/restore failed/);
    assert.deepEqual(await f.storage.toolState(id),state);assert.equal(f.sql.prepare("SELECT count(*) n FROM node_tool_versions").get().n,count);
    f.sql.exec("DROP TRIGGER restore_failure");
    const result=await f.storage.toolCommand({action:"restore-preserve",algorithmId:id,revision:state.revision,document:draft,version:initial.active},"Инженер");
    assert.equal(result.versions[0].number,7);assert.equal(result.versions[1].number,6);assert.equal(result.versions.length,5);
    assert.equal(JSON.parse((await f.library.algorithmSnapshot(id,result.versions[1].id)).document).diagrams[0].name,"Несохранённая версия");
    assert.deepEqual(result.draft,initial.draft);
  }finally{f.close();}
});
test("projects reject cross-product state and keep pinned versions after restores",async()=>{
  const f=await fixture();try{
    const a=await f.library.createAlgorithm("Продукт A","Инженер"),b=await f.library.createAlgorithm("Продукт B","Инженер");
    const migration=await f.load("node-tools/product-state"),base=await f.storage.toolDefaults();
    const pa=await f.storage.toolProgram(undefined,a),pb=await f.storage.toolProgram(undefined,b);
    const saved=migration.migrateProduct(pa,undefined,base.defaults,base.baseVersions,"admin").data;
    await f.storage.verifyWorkspace(saved,undefined,"admin");
    const other=migration.migrateProduct(pb,undefined,base.defaults,base.baseVersions,"admin").data;
    await assert.rejects(()=>f.storage.verifyWorkspace(other,saved,"admin"),e=>e.status===409);
    assert.throws(()=>migration.migrateProduct(pb,saved,base.defaults,base.baseVersions,"admin"),/независимыми/);
    await publish(f,a,(await f.storage.toolState(a)).draft);
    const state=await f.storage.toolState(a);await f.library.restoreAlgorithm(a,state.revision,state.versions[1].id,"Инженер");
    await f.storage.verifyWorkspace(saved,saved,"admin");assert.equal(saved.product.version,pa.version);
  }finally{f.close();}
});
