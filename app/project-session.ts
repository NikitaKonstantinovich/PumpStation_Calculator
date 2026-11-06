import type {ProjectConfig} from "./project-config";
import {mergeProjectChanges,sameProject} from "./project-merge";

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
  private channel?:BroadcastChannel;
  private disconnect?:()=>void;
  private stopped=false;
  blocked=false;
  constructor(readonly owner:string, config:ProjectConfig, public revision:number,
    private notify:(message:string)=>void, private saved:(card:ProjectCard)=>void,
    private changed:(config:ProjectConfig,previous:ProjectConfig)=>void=()=>{},
    private validate:(config:ProjectConfig)=>ProjectConfig=config=>config) {
    this.latest=config;this.acknowledged=revision?config:null;
    this.key=JSON.stringify([owner,config.project.id,crypto.randomUUID()]);
  }
  recover(draft:Draft) {
    this.recovered=draft; this.revision=draft.baseRevision;this.pending=draft.pending;
    this.acknowledged=null;this.update(draft.config);
  }
  get dirty() {return !sameProject(this.acknowledged,this.latest) || Boolean(this.pending);}
  connect() {
    this.stopped=false;
    if(typeof window==="undefined")return ()=>this.dispose();
    if(typeof BroadcastChannel!=="undefined") {
      this.channel=new BroadcastChannel(`psc-project:${JSON.stringify([this.owner,this.latest.project.id])}`);
      this.channel.onmessage=event=>{
        if(event.data?.type==="saved" && Number.isInteger(event.data.revision) && event.data.revision>this.revision)void this.refresh();
      };
    }
    const visible=()=>{if(document.visibilityState==="visible")void this.refresh();};
    const leaving=()=>{if(this.dirty)void this.flush();};
    window.addEventListener("focus",visible);
    window.addEventListener("pagehide",leaving);
    document.addEventListener("visibilitychange",visible);
    // Also catch saves from another device or browsers without BroadcastChannel.
    const interval=setInterval(visible,15000);
    this.disconnect=()=>{
      window.removeEventListener("focus",visible);
      window.removeEventListener("pagehide",leaving);
      document.removeEventListener("visibilitychange",visible);
      clearInterval(interval);
    };
    return ()=>this.dispose();
  }
  dispose() {
    this.stopped=true;clearTimeout(this.timer);
    this.disconnect?.();this.disconnect=undefined;
    this.channel?.close();this.channel=undefined;
  }
  retainConflict(config:ProjectConfig) {
    this.latest=config;this.blocked=true;this.pending=undefined;clearTimeout(this.timer);
    void this.draft().catch(()=>{});
    this.notify("Одновременно изменён один и тот же параметр. Откройте версию из базы или сохраните свои изменения как копию.");
  }
  retireAfterCopy(source:ProjectSession) {this.forkSource=source;}
  private draft() {
    const row={key:this.key,owner:this.owner,project:this.latest.project.id,config:this.latest,baseRevision:this.revision,pending:this.pending,time:Date.now()};
    return writeDraft(this.key,this.dirty?row:undefined);
  }
  update(config:ProjectConfig) {
    if(this.stopped)return;
    if(config.project.id!==this.latest.project.id) throw new Error("Смена ID в открытом проекте");
    this.latest=config;
    if(!this.dirty) {clearTimeout(this.timer);return;}
    void this.draft().catch(()=>this.notify("Локальный черновик недоступен. Можно экспортировать JSON."));
    if(this.blocked) return;
    this.notify("Есть изменения");
    this.since ||= Date.now();
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>void this.flush(),Math.max(0,Math.min(3000,30000-(Date.now()-this.since))));
  }
  flush():Promise<boolean> {
    clearTimeout(this.timer);
    if(this.flight) return this.flight.then(ok=>ok&&this.dirty?this.flush():ok);
    if(this.blocked || this.stopped) return Promise.resolve(false);
    return this.run(true);
  }
  refresh():Promise<boolean> {
    if(this.blocked || this.stopped || !this.revision)return Promise.resolve(false);
    if(this.flight)return this.flight.then(ok=>ok?this.refresh():false);
    return this.run(false);
  }
  private run(save:boolean):Promise<boolean> {
    const execute=()=>this.send(save);
    // Serialize writes in tabs of this browser. Optimistic server revisions
    // still protect other browsers/devices and the fallback without Web Locks.
    const perform=async()=>typeof navigator!=="undefined" && navigator.locks
      ? await navigator.locks.request(`psc-save:${JSON.stringify([this.owner,this.latest.project.id])}`,execute)
      : await execute();
    const flight=perform().finally(()=>{this.flight=undefined;});
    this.flight=flight;
    return flight;
  }
  private async readLatest() {
    if(!this.revision)return;
    const file=await projectApi<ProjectFile>("?id="+encodeURIComponent(this.latest.project.id));
    if(this.stopped || file.revision<=this.revision)return;
    file.config=this.validate(file.config);
    if(!this.acknowledged)throw new ProjectRequestError("Не удалось сопоставить версии проекта. Откройте версию из базы или сохраните копию.",409);
    const previous=this.latest;
    const merged=mergeProjectChanges(this.acknowledged,previous,file.config);
    if(merged.conflicts.length)throw new ProjectRequestError("Один и тот же параметр изменён в нескольких окнах. Откройте версию из базы или сохраните свои изменения как копию.",409);
    this.revision=file.revision;this.acknowledged=file.config;
    this.latest=sameProject(merged.config,file.config)?file.config:merged.config;
    this.saved(file);
    if(!sameProject(previous,this.latest))this.changed(this.latest,previous);
    await this.draft().catch(()=>{});
  }
  private async send(save:boolean) {
    this.since=0;
    try {
      if(this.stopped)return false;
      // An ambiguous network result must replay the exact pending operation
      // before reading/rebasing; the server may already have committed it.
      if(!this.pending)await this.readLatest();
      let retries=0;
      while(!this.stopped && !this.blocked && (save && this.dirty || this.pending)) {
        const request=this.pending??={config:this.latest,baseRevision:this.revision,operation:crypto.randomUUID()};
        void this.draft().catch(()=>{});this.notify("Сохранение…");
        let revision:number;
        try {({revision}=await projectApi<Receipt>("",request));}
        catch(error) {
          if(!(error instanceof ProjectRequestError) || error.status!==409 || retries++>=3)throw error;
          this.pending=undefined;
          await this.readLatest();
          continue;
        }
        this.revision=revision;this.acknowledged=request.config;this.pending=undefined;
        this.saved({...request.config.project,revision});await this.draft().catch(()=>{});
        this.channel?.postMessage({type:"saved",revision});
        // A replay can acknowledge an older revision than another window has
        // already saved. Re-read before sending any edits made during the PUT.
        await this.readLatest();
      }
      if(this.stopped || this.blocked)return false;
      if(this.dirty){this.update(this.latest);return true;}
      if(this.recovered)await removeRecoveredDraft(this.recovered).catch(()=>{});
      this.recovered=undefined;
      if(this.forkSource){
        await writeDraft(this.forkSource.key).catch(()=>{});
        this.forkSource=undefined;
      }
      this.notify("Сохранено на сервере");
      return true;
    } catch(error) {
      this.blocked=error instanceof ProjectRequestError && error.status===409;
      // Retry ambiguous network outcomes with the same operation ID.
      if(error instanceof ProjectRequestError && error.status>=400 && error.status<500 && !this.blocked) this.pending=undefined;
      const local=await this.draft().then(()=>true,()=>false);
      if(!this.stopped && (save || this.dirty || this.blocked))this.notify((local&&this.dirty?"Сохранено только на этом устройстве. ":"")+(error instanceof Error?error.message:"Ошибка сохранения"));
      return false;
    }
  }
}
