"use client";
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from "react";
import {ParameterDrafts} from "./parameter-drafts";
const DraftContext=createContext<ParameterDrafts|null>(null);
const noop=()=>()=>{},zero=()=>0;
export function ParameterDraftProvider({children}:{children:ReactNode}) {
  const [store]=useState(()=>new ParameterDrafts());
  return <DraftContext.Provider value={store}>{children}</DraftContext.Provider>;
}
export function usePendingParameterDrafts(){
  const store=useContext(DraftContext);
  useSyncExternalStore(store?.subscribe??noop,store?.snapshot??zero,zero);
  return store?.pending??false;
}
export function useParameterDraft(key:string,basis:string):[string|null,(text:string|null)=>void] {
  const store=useContext(DraftContext),[local,setLocal]=useState<{basis:string;text:string|null}>({basis,text:null});
  useSyncExternalStore(store?.subscribe??noop,store?.snapshot??zero,zero);
  useEffect(()=>{store?.prune(key,basis);},[store,key,basis]);
  return [store?store.read(key,basis):local.basis===basis?local.text:null,text=>{if(store)store.write(key,basis,text);else setLocal({basis,text});}];
}
