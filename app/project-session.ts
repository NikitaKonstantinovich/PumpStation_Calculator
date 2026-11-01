import type {ProjectConfig} from "./project-config";

export type ProjectCard = {id:string; name:string; revision:number; createdAt:string; updatedAt:string};
export type ProjectFile = ProjectCard & {config:ProjectConfig};
type Receipt = {revision:number};
type Pending = {config:ProjectConfig; baseRevision:number; operation:string};
type Draft = {key:string; project:string; owner:string; config:ProjectConfig; baseRevision:number; pending?:Pending; time:number};
export class ProjectRequestError extends Error {
  constructor(message:string, readonly status:number) { super(message); }
}
export async function projectApi<T>(params="",body?:unknown,method=body?"PUT":"GET"):Promise<T> {
  const response=await fetch("/api/projects"+params,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(!response.ok) throw new ProjectRequestError(data.error??"Ошибка хранилища проектов",response.status);
  return data;
}
let database:Promise<IDBDatabase>|undefined;
function drafts() {
  return database??=new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open("psc-project-drafts-v1",2);
    req.onupgradeneeded=()=>{
      const store=req.result.objectStoreNames.contains("drafts")?req.transaction!.objectStore("drafts"):req.result.createObjectStore("drafts",{keyPath:"key"});
      store.createIndex("ownerTime",["owner","time"]);
      store.createIndex("projectTime",["owner","project","time"]);
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>{database=undefined;reject(req.error);};
  });
}
async function writeDraft(key:string,row?:Draft) {
  const db=await drafts();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("drafts","readwrite"),store=tx.objectStore("drafts");
    if(row) store.put(row); else store.delete(key);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
  });
}
async function removeRecoveredDraft(draft:Draft) {
  const db=await drafts();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("drafts","readwrite"),store=tx.objectStore("drafts"),req=store.get(draft.key);
    req.onsuccess=()=>{if(req.result?.time===draft.time)store.delete(draft.key);};
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
  });
}
export async function latestDraft(owner:string,id?:string):Promise<Draft|undefined> {
  const db=await drafts();
  return new Promise((resolve,reject)=>{
    const store=db.transaction("drafts").objectStore("drafts");
    const prefix=id?[owner,id]:[owner];
    const req=store.index(id?"projectTime":"ownerTime").openCursor(IDBKeyRange.bound([...prefix,0],[...prefix,Number.MAX_SAFE_INTEGER]),"prev");
    req.onsuccess=()=>resolve(req.result?.value as Draft|undefined);req.onerror=()=>reject(req.error);
  });
}
export class ProjectSession {
  latest:ProjectConfig;
  acknowledged:ProjectConfig|null;
  pending?:Pending;
  private key:string;
  private since=0;
  private timer?:ReturnType<typeof setTimeout>;
  private flight?:Promise<boolean>;
  private recovered?:Draft;
  private forkSource?:ProjectSession;
  blocked=false;
  constructor(readonly owner:string, config:ProjectConfig, public revision:number,
    private notify:(message:string)=>void, private saved:(card:ProjectCard)=>void) {
    this.latest=config;this.acknowledged=revision?config:null;
    this.key=JSON.stringify([owner,config.project.id,crypto.randomUUID()]);
  }
  recover(draft:Draft) {
    this.recovered=draft; this.revision=draft.baseRevision;this.pending=draft.pending;
    this.acknowledged=null;this.update(draft.config);
  }
  get dirty() {return this.latest!==this.acknowledged || Boolean(this.pending);}
  retireAfterCopy(source:ProjectSession) {this.forkSource=source;}
  private draft() {
    const row={key:this.key,owner:this.owner,project:this.latest.project.id,config:this.latest,baseRevision:this.revision,pending:this.pending,time:Date.now()};
    return writeDraft(this.key,this.dirty?row:undefined);
  }
  update(config:ProjectConfig) {
    if(config.project.id!==this.latest.project.id) throw new Error("Смена ID в открытом проекте");
    this.latest=config;
    if(!this.dirty) return;
    void this.draft().catch(()=>this.notify("Локальный черновик недоступен. Можно экспортировать JSON."));
    if(this.blocked) return;
    this.notify("Есть изменения");
    this.since ||= Date.now();
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>void this.flush(),Math.max(0,Math.min(3000,30000-(Date.now()-this.since))));
  }
  flush():Promise<boolean> {
    clearTimeout(this.timer);
    if(this.flight) return this.flight;
    if(this.blocked || !this.dirty) return Promise.resolve(!this.blocked);
    this.flight=this.send().finally(()=>{this.flight=undefined;});
    return this.flight;
  }
  private async send() {
    this.since=0;
    try {
      while(this.dirty) {
        const request=this.pending??={config:this.latest,baseRevision:this.revision,operation:crypto.randomUUID()};
        void this.draft().catch(()=>{});this.notify("Сохранение…");
        const {revision}=await projectApi<Receipt>("",request);
        this.revision=revision;this.acknowledged=request.config;this.pending=undefined;
        this.saved({...request.config.project,revision});await this.draft().catch(()=>{});
      }
      if(this.recovered)await removeRecoveredDraft(this.recovered).catch(()=>{});
      this.recovered=undefined;
      if(this.forkSource){
        await writeDraft(this.forkSource.key).catch(()=>{});
        this.forkSource=undefined;
      }
      this.notify(this.dirty?"Есть изменения":"Сохранено на сервере");
      return true;
    } catch(error) {
      this.blocked=error instanceof ProjectRequestError && error.status===409;
      // Retry ambiguous network outcomes with the same operation ID.
      if(error instanceof ProjectRequestError && error.status>=400 && error.status<500 && !this.blocked) this.pending=undefined;
      const local=await this.draft().then(()=>true,()=>false);
      this.notify((local?"Сохранено только на этом устройстве. ":"Можно экспортировать JSON. ")+(error instanceof Error?error.message:"Ошибка сохранения"));
      return false;
    }
  }
}
