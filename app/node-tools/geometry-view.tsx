"use client";
import { createContext, useContext, useEffect, useRef, useMemo } from "react";
import { ModelTool } from "../model-editor/tool";
import { CadProvider } from "../cad-build-state";
import type { ProjectConfig } from "../project-config";
import type { View } from "./schema";
// Identity only: all calculation entities come from the graph output.
export const ProductIdentityContext=createContext<ProjectConfig["project"]|null>(null);
export function GeometryView({view,disabled,change}:{view:View;disabled:boolean;change:(key:string,value:unknown)=>void}) {
  const identity=useContext(ProductIdentityContext),data=view.geometry,binding=view.binding;
  const project=useMemo(()=>data?{...data.project,project:identity??data.project.project,entities:{...data.project.entities,"station-model":data.model}}:null,[data,identity]);
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[view]);
  if(view.enabled!==true)return <div className="tool-lock"><b>Расчёт геометрии отключён</b><p>Включите его в верхней панели. DN, межосевые расстояния и материалы продолжают рассчитываться.</p></div>;
  if(!data || !project || !binding)return <p>Подключите результат спецификации и параметр настроек модели.</p>;
  if(disabled || !binding.editable)return <p>Редактирование 3D-модели доступно с уровня pro.</p>;
  return <div className="nt-geometry"><CadProvider project={project} enabled><ModelTool project={project} catalogue={data.pumps} entity={data.model} onChange={next=>{if(live.current)change(binding.key,next);}}/></CadProvider></div>;
}
