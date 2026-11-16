/** Deduplicate identical reads by open windows. Each consumer owns its cancellation. */
type Flight = {controller:AbortController;promise:Promise<Response>;users:number;settled:boolean;expires:number};
const flights=new Map<string,Flight>();
export function sharedToolRequest(url:string,init:RequestInit={}):Promise<Response> {
  const {signal,...options}=init;
  if(signal?.aborted)return Promise.reject(new DOMException("Aborted","AbortError"));
  const key=JSON.stringify([url,options.method??"GET",options.body??null,[...new Headers(options.headers).entries()].sort()]);
  let flight=flights.get(key);
  if(flight?.settled && flight.expires<Date.now()){flights.delete(key);flight=undefined;}
  if(!flight){
    const controller=new AbortController();
    const entry:Flight={controller,users:0,settled:false,expires:0,promise:Promise.resolve(new Response())};
    entry.promise=fetch(url,{...options,signal:controller.signal}).then(async response=>{
      // Buffer once so consumers can independently parse without sharing mutable data.
      const bytes=await response.arrayBuffer();
      const copy=new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
      entry.settled=true;entry.expires=Date.now()+250;
      const timer=setTimeout(()=>{if(flights.get(key)===entry)flights.delete(key);},250);
      if(typeof timer==="object"&&"unref" in timer)timer.unref();
      return copy;
    }).catch(error=>{entry.settled=true;if(flights.get(key)===entry)flights.delete(key);throw error;});
    flights.set(key,entry);flight=entry;
  }
  const active=flight;active.users++;
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=()=>{if(done)return false;done=true;signal?.removeEventListener("abort",abort);active.users--;return true;};
    const abort=()=>{if(!finish())return;if(!active.users&&!active.settled){active.controller.abort();if(flights.get(key)===active)flights.delete(key);}reject(new DOMException("Aborted","AbortError"));};
    signal?.addEventListener("abort",abort,{once:true});
    active.promise.then(response=>{if(finish())resolve(response.clone());},error=>{if(finish())reject(error);});
  });
}
