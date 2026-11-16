/** Unparsed form text belongs to the open project, never to a particular window. */
export class ParameterDrafts {
  private entries=new Map<string,{basis:string;text:string}>();
  private listeners=new Set<()=>void>();
  private revision=0;
  snapshot=()=>this.revision;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  get pending(){return this.entries.size>0;}
  read(key:string,basis:string){const entry=this.entries.get(key);return entry?.basis===basis?entry.text:null;}
  write(key:string,basis:string,text:string|null){
    const old=this.entries.get(key);
    if(text===null){if(!this.entries.delete(key))return;}
    else {if(old?.basis===basis&&old.text===text)return;this.entries.set(key,{basis,text});}
    this.revision++;for(const listener of this.listeners)listener();
  }
  prune(key:string,basis:string){const entry=this.entries.get(key);if(entry&&entry.basis!==basis)this.write(key,basis,null);}
}
