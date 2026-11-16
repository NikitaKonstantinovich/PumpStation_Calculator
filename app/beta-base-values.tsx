"use client";
import { useCallback, useEffect, useState } from "react";
import { baseSnapshot, legacyBaseValues, type AppliedBaseValues } from "./base-values";

/** Persist references only; published values are always read from the server. */
export function useBetaBaseValues(storageKey:string) {
  const [applied,setApplied]=useState<AppliedBaseValues|null>(null),[error,setError]=useState("");
  const accept=useCallback((value:AppliedBaseValues)=>{
    setApplied(value);
    try{localStorage.setItem(`${storageKey}:base-versions`,JSON.stringify(value.versions));setError("");}
    catch{setError("Не удалось сохранить версию расчёта в этом браузере.");}
  },[storageKey]);
  useEffect(()=>{
    let active=true;
    const restore=async()=>{
      try{
        const saved=localStorage.getItem(`${storageKey}:base-versions`);
        const versions=saved?JSON.parse(saved):localStorage.getItem(storageKey)?baseSnapshot("legacy-v1",legacyBaseValues()).versions:null;
        const response=await fetch(`/api/base-values/effective${versions?`?versions=${encodeURIComponent(JSON.stringify(versions))}`:""}`,{cache:"no-store"});
        const body=await response.json();if(!response.ok)throw new Error(body.error);
        if(active)accept(body.applied);
      }catch(reason){if(active)setError(reason instanceof Error?reason.message:"Не удалось восстановить версию расчёта.");}
    };
    void restore();
    const sync=(event:StorageEvent)=>{if(event.key===`${storageKey}:base-versions`)void restore();};
    window.addEventListener("storage",sync);
    return()=>{active=false;window.removeEventListener("storage",sync);};
  },[storageKey,accept]);
  return {applied,error,accept};
}
