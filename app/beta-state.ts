import type { InputEntity, PanelState, ProjectConfig } from "./project-config";
import { isBetaTool } from "./release-policy";
import { ENTITY_BY_TOOL } from "./tool-registry";

export const betaStorageKey = (userId: string) => `psc:beta:0.1:${userId}`;
export const emptyBetaInput = (): InputEntity => ({ kind: "input", medium: "water", flowRate: null, head: null, staticHead: 0, workingPumpCount: 1, reservePumpCount: 0, calculated: false });

// Whitelist scalar input fields. Roles and project settings never come from storage.
export function parseBetaInput(raw: unknown): InputEntity {
  const result = emptyBetaInput();
  if (!raw || typeof raw !== "object") return result;
  const value = raw as Record<string, unknown>;
  for (const key of ["flowRate", "head", "staticHead", "workingPumpCount", "reservePumpCount"] as const) {
    const field = value[key];
    if (field === null || (typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= 1e6)) result[key] = field;
  }
  result.medium = value.medium === "wastewater" ? "wastewater" : "water";
  if (typeof value.selectedPumpId === "string" && value.selectedPumpId.length <= 256) result.selectedPumpId = value.selectedPumpId;
  result.calculated = value.calculated === true && result.flowRate !== null && result.flowRate > 0 && result.head !== null && result.head > 0 && result.staticHead !== null && result.staticHead <= result.head && Number.isInteger(result.workingPumpCount) && result.workingPumpCount! >= 1 && result.workingPumpCount! <= 6 && Number.isInteger(result.reservePumpCount) && result.reservePumpCount! >= 0 && result.reservePumpCount! <= 3;
  return result;
}

export type BetaState = { input: InputEntity; workspace: ProjectConfig["workspace"] };
export function defaultBetaState(): BetaState {
  return { input: emptyBetaInput(), workspace: { zoom:100, mode:"free", gridHeightScreens:1,
    grid:{columns:2,rows:2,columnSizes:[1,1],rowSizes:[1,1],cells:["input","chart","sketch","components"]},
    windows:[
      {id:"input",activeTool:"input",entityId:"system-input",x:18,y:18,w:550,h:545,z:1},
      {id:"chart",activeTool:"chart",entityId:"working-point",x:586,y:18,w:510,h:390,z:2},
      {id:"sketch",activeTool:"sketch",entityId:"pump-sketch",x:586,y:426,w:510,h:390,z:3},
      {id:"components",activeTool:"components",entityId:"station-components",x:1114,y:18,w:540,h:650,z:4},
    ],
  }};
}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const bounded=(value:unknown,fallback:number,min:number,max:number)=>typeof value==="number"&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
// Read only our separate beta key. Reconstruct permitted fields, never merge a
// serialized project. In particular entityId cannot enable a forbidden tool.
export function parseBetaState(raw:unknown):BetaState {
  const defaults=defaultBetaState(),value=record(raw),workspace=record(value.workspace);
  const input=parseBetaInput(value.input??value);
  const seen=new Set<string>();
  const windows:PanelState[]=Array.isArray(workspace.windows)?workspace.windows.slice(0,36).flatMap(rawPanel=>{
    const panel=record(rawPanel),tool=panel.activeTool;
    if(tool!==undefined&&!isBetaTool(tool))return [];
    if(typeof panel.id!=="string"||!/^[-a-zA-Z0-9_]{1,100}$/.test(panel.id)||seen.has(panel.id))return [];
    seen.add(panel.id);
    return [{id:panel.id,activeTool:tool,entityId:tool?ENTITY_BY_TOOL[tool]:"system-input",x:bounded(panel.x,0,0,10000),y:bounded(panel.y,0,0,10000),w:bounded(panel.w,430,280,4000),h:bounded(panel.h,320,220,4000),z:bounded(panel.z,1,0,1e6),minimized:panel.minimized===true}];
  }):defaults.workspace.windows;
  if(Array.isArray(workspace.windows)&&workspace.windows.length&&!windows.length)windows.push(...defaults.workspace.windows);
  const grid=record(workspace.grid),columns=Math.round(bounded(grid.columns,2,1,6)),rows=Math.round(bounded(grid.rows,2,1,6));
  const sizes=(raw:unknown,count:number)=>Array.from({length:count},(_,index)=>bounded(Array.isArray(raw)?raw[index]:undefined,1,.1,100));
  const assigned=new Set<string>();
  const cells=Array.from({length:columns*rows},(_,index)=>{const id=Array.isArray(grid.cells)?grid.cells[index]:defaults.workspace.grid.cells[index];if(typeof id!=="string"||assigned.has(id)||!windows.some(panel=>panel.id===id))return null;assigned.add(id);return id;});
  return {input,workspace:{zoom:bounded(workspace.zoom,100,50,150),mode:workspace.mode==="grid"||workspace.mode==="mobile"?workspace.mode:"free",gridHeightScreens:bounded(workspace.gridHeightScreens,1,.1,10),grid:{columns,rows,columnSizes:sizes(grid.columnSizes,columns),rowSizes:sizes(grid.rowSizes,rows),cells},windows}};
}
