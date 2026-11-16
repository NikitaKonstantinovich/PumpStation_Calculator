"use client";
import { useEffect, useState, type ReactNode } from "react";
import { FloatingPanel, GridWorkspace, type WindowToolOption } from "../workspace-panels";
import { GridHeightControl } from "../grid-height-control";
import type {WindowRibbonActions} from "./product-ribbon";
import type { WorkspaceMode } from "../project-config";
import { closeWindow, fitGrid, initialLayout, layoutKey, newWindow, readLayout, type ProductLayout, type ProductWindow } from "./window-layout";

export function ProductWindows({userId, algorithmId, projectId, tools, renderTool, detach, renderToolbar, notices}: {
  userId: string; algorithmId: string; projectId: string; tools: WindowToolOption[]; renderTool: (tool: string) => ReactNode; detach:(panelId:string)=>void; renderToolbar:(actions:WindowRibbonActions)=>ReactNode; notices?:ReactNode;
}) {
  const key = layoutKey(userId, algorithmId, projectId);
  const [layout, setLayout] = useState(() => { try { return readLayout(localStorage.getItem(key), tools.find(t=>!t.disabled)?.id); } catch { return initialLayout(tools.find(t=>!t.disabled)?.id); } });
  const [error, setError] = useState("");
  const [past, setPast] = useState<ProductLayout[]>([]), [future, setFuture] = useState<ProductLayout[]>([]);
  const [detached] = useState(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("nodePanel"));
  function change(next: ProductLayout, history = true) {
    if (history) { setPast(p=>[...p.slice(-39),layout]); setFuture([]); }
    setLayout(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setError(""); }
    catch { setError("Не удалось сохранить расположение окон в браузере. Данные проекта сохраняются отдельно."); }
  }
  useEffect(() => {
    const receive = (event: StorageEvent) => { if(event.key===key && event.newValue) { setLayout(readLayout(event.newValue)); setPast([]); setFuture([]); } };
    window.addEventListener("storage",receive);
    return ()=>window.removeEventListener("storage",receive);
  },[key]);
  function add(tool?: string, cell?: number) {
    if(layout.windows.length>=40) { setError("Можно открыть до 40 окон."); return; }
    const panel = newWindow(crypto.randomUUID(), tool, layout.windows.length);
    let next = {...layout,windows:[...layout.windows,panel]};
    if(layout.mode === "grid") {
      let slot = cell ?? layout.grid.cells.indexOf(null);
      if(slot < 0 && layout.grid.rows < 6) { next={...next,grid:{...layout.grid,rows:layout.grid.rows+1,rowSizes:[...layout.grid.rowSizes,1],cells:[...layout.grid.cells,...Array<string|null>(layout.grid.columns).fill(null)]}}; slot=layout.grid.cells.length; }
      if(slot < 0) { setError("Все ячейки заняты. Освободите ячейку или выберите свободные окна."); return; }
      next={...next,grid:{...next.grid,cells:next.grid.cells.map((id,i)=>i===slot?panel.id:id)}};
    }
    change(next);
  }
  const modify=(panel:ProductWindow)=>change({...layout,windows:layout.windows.map(w=>w.id===panel.id?panel:w)});
  const renderPanel=(panel:ProductWindow,mode:WorkspaceMode="free")=>{
    const option=tools.find(t=>t.id===panel.activeTool);
    return <FloatingPanel key={panel.id} panel={panel} zoom={layout.zoom} layoutMode={mode} toolOptions={tools} secondaryEnabled content={panel.activeTool && option && !option.disabled ? renderTool(panel.activeTool) : <div className="empty-tool"><b>{option?.reason ?? (panel.activeTool ? "Инструмент недоступен в этой версии или для текущих условий" : "Выберите инструмент")}</b><p>Выберите другой инструмент в заголовке окна. Сохранённые данные остаются в проекте.</p></div>} onChange={modify}
      onFocus={()=>{if(layout.windows.some(w=>w.z>panel.z))change({...layout,windows:layout.windows.map(w=>w.id===panel.id?{...w,z:Math.max(...layout.windows.map(w=>w.z))+1}:w)},false);}}
      onDetach={()=>{change(layout,false);detach(panel.id);}}
      onMinimize={()=>modify({...panel,minimized:true})} onClose={()=>change(closeWindow(layout,panel.id))}/>;
  };
  const actions:WindowRibbonActions={
    history:<div className="tool-group">
      <button aria-label="Отменить изменение окон" title="Отменить изменение окон" disabled={!past.length} onClick={()=>{setFuture(f=>[layout,...f]);setPast(p=>p.slice(0,-1));change(past.at(-1)!,false);}}>↶</button>
      <button aria-label="Повторить изменение окон" title="Повторить изменение окон" disabled={!future.length} onClick={()=>{setPast(p=>[...p,layout]);setFuture(f=>f.slice(1));change(future[0],false);}}>↷</button>
    </div>,
    insert:<div className="tool-group tool-group--labeled"><button onClick={()=>add()} aria-label="Добавить инструмент"><b>＋</b><small>Добавить инструмент</small></button></div>,
    view:<>
      <div className="view-modes" role="group" aria-label="Режим рабочего пространства">
        <button className={layout.mode==="free"?"view-modes__button view-modes__button--active":"view-modes__button"} aria-pressed={layout.mode==="free"} onClick={()=>change({...layout,mode:"free"})}><b>◇</b><span>Свободные окна</span></button>
        <button className={layout.mode==="mobile"?"view-modes__button view-modes__button--active":"view-modes__button"} aria-pressed={layout.mode==="mobile"} onClick={()=>change({...layout,mode:"mobile"})}><b>▤</b><span>Mobile</span></button>
        <details className={`view-grid-menu ${layout.mode==="grid"?"view-grid-menu--active":""}`}><summary className="view-modes__button"><b>▦</b><span>Сетка</span><i aria-hidden="true">⌄</i></summary><div className="view-grid-menu__list" aria-label="Выбор сетки"><strong>Выберите сетку</strong>{[[2,2],[3,2],[2,3]].map(([c,r])=><button className={layout.mode==="grid"&&layout.grid.columns===c&&layout.grid.rows===r?"grid-presets__button grid-presets__button--active":"grid-presets__button"} key={`${c}/${r}`} onClick={e=>{change(fitGrid(layout,c,r));e.currentTarget.closest("details")?.removeAttribute("open");}}><b>{c} × {r}</b><small>{c} столб. · {r} стр.</small></button>)}</div></details>
      </div>
      {layout.mode==="grid" && <><span className="ribbon__divider"/><GridHeightControl value={layout.gridHeightScreens} onChange={gridHeightScreens=>change({...layout,gridHeightScreens})}/><span className="ribbon__divider"/><div className="grid-actions"><button disabled={layout.grid.columns>=6} onClick={()=>change(fitGrid(layout,layout.grid.columns+1,layout.grid.rows))}><b>＋▥</b><small>Столбец</small></button><button disabled={layout.grid.rows>=6} onClick={()=>change(fitGrid(layout,layout.grid.columns,layout.grid.rows+1))}><b>＋▤</b><small>Строка</small></button></div></>}
      <span className="ribbon__divider"/>
      <div className="tool-group tool-group--labeled"><button onClick={()=>change({...layout,windows:layout.windows.map((w,i)=>({...w,x:20+i*36,y:16+i*36,w:760,h:600}))})}><b>▦</b><small>Упорядочить</small></button></div>
      {layout.mode==="free" && <div className="workspace__zoom nt-ribbon-zoom"><button disabled={layout.zoom<=50} aria-label="Уменьшить масштаб" onClick={()=>change({...layout,zoom:layout.zoom-10})}>−</button><button aria-label="Сбросить масштаб" onClick={()=>change({...layout,zoom:100})}>{layout.zoom}%</button><button disabled={layout.zoom>=150} aria-label="Увеличить масштаб" onClick={()=>change({...layout,zoom:layout.zoom+10})}>＋</button></div>}
    </>
  };
  if(detached) { const panel=layout.windows.find(w=>w.id===detached); return <>{renderToolbar(actions)}{notices}<section className="nt-detached-window">{panel?renderPanel(panel,"mobile"):<p>Окно закрыто в основном рабочем пространстве. <a href={`/?view=workspace2&algorithm=${encodeURIComponent(algorithmId)}&project=${encodeURIComponent(projectId)}`}>Открыть продукт</a></p>}</section></>; }
  const visible=layout.windows.filter(w=>!w.minimized), minimized=layout.windows.filter(w=>w.minimized);
  return <>
    {renderToolbar(actions)}{notices}
    {error && <p role="alert">{error}</p>}
    <section className={`workspace workspace--${layout.mode}`} aria-label="Окна инструментов">
      {layout.mode==="grid" ? <div className="workspace__canvas workspace__canvas--grid"><GridWorkspace grid={layout.grid} heightScreens={layout.gridHeightScreens} panels={layout.windows} secondaryEnabled toolOptions={tools} renderPanel={renderPanel} onGridChange={grid=>change({...layout,grid})} onCreate={(cell,tool)=>add(tool,cell)}/></div> : <div className={`workspace__canvas ${layout.mode==="mobile"?"workspace__canvas--mobile":""}`}><div className={layout.mode==="mobile"?"workspace-mobile":"workspace__surface"} style={layout.mode==="free"?{width:`${10000/layout.zoom}%`,minHeight:Math.max(640,...visible.map(w=>w.y+w.h+20)),transform:`scale(${layout.zoom/100})`}:undefined}>{visible.map(panel=>renderPanel(panel,layout.mode))}{!visible.length && <div className="empty-tool"><b>Все окна закрыты или свёрнуты</b><button className="button" onClick={()=>add(tools.find(t=>!t.disabled)?.id)}>Открыть инструмент</button></div>}</div></div>}
    </section>
    {!!minimized.length && <div className="window-dock">{minimized.map(panel=><button key={panel.id} onClick={()=>{const next={...layout,windows:layout.windows.map(w=>w.id===panel.id?{...w,minimized:false}:w)};change(layout.mode==="grid"?fitGrid(next):next);}}>{tools.find(t=>t.id===panel.activeTool)?.name ?? "Пустой инструмент"}</button>)}</div>}
  </>;
}
