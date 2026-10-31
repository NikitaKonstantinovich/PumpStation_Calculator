"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DiagnosticsProvider, useDiagnosticRegistry } from "./diagnostics-ui";
import { pumpIssues } from "./diagnostics";
import { AllowedPumpPanel } from "./allowed-pump-tools";
import { FloatingPanel, GridWorkspace, Icon } from "./workspace-panels";
import { AppSettings } from "./app-settings";
import { BaseValuesPanel } from "./base-values-panel";
import { HelpCenter } from "./help-center";
import { AIAssistant } from "./ai-assistant";
import { BaseValuesUpdateNotice, usePublishedBaseValues } from "./base-values-update";
import { useBetaBaseValues } from "./beta-base-values";
import { createProject, type SettingsEntity } from "./project-config";
import { UsersPanel } from "./users-panel";
import { GridHeightControl } from "./grid-height-control";
import { useTheme } from "./use-theme";
import { defaultProjectSettings } from "./default-settings";
import { betaStorageKey, defaultBetaState, parseBetaState, type BetaState } from "./beta-state";
import { isBetaTool, RELEASE_LABEL, RELEASE_VERSION } from "./release-policy";
import { ENTITY_BY_TOOL, PANEL_INFO } from "./tool-registry";
import type { AccountUser } from "./user-types";
import type { Pump } from "./pump-catalog";
import type { InputEntity, ProjectConfig, PanelKind, PanelState, WorkspaceGrid, WorkspaceMode } from "./project-config";
const BETA_LOCK = "Недоступно в beta 0.1";
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toLocaleUpperCase("ru-RU")).join("")||"ПС";

export default function BetaWorkspace({ account, onAccountChange }: { account: AccountUser; onAccountChange: (user: AccountUser | null) => void }) {
  const {latest,error:baseValuesError}=usePublishedBaseValues(true);
  const key = betaStorageKey(account.id);
  const {applied,error:pinnedError,accept}=useBetaBaseValues(key);
  const settings=useMemo(()=>defaultProjectSettings(applied??undefined),[applied]);
  const [config,setConfig]=useState<BetaState>(()=>{try{return parseBetaState(JSON.parse(localStorage.getItem(key)??"null"));}catch{return defaultBetaState();}});
  const [sidebar,setSidebar]=useState(false);
  const [view,setView]=useState<"workspace"|"users"|"base-values"|"help">("workspace");
  const navigateView=(next:"workspace"|"users"|"base-values"|"help")=>{
    if((next==="users"||next==="base-values")&&account.role!=="admin")return;
    window.history.pushState({},"",next!=="workspace"?`/?view=${next}`:"/");
    setView(next);setDetached(null);setSidebar(false);setAccessNotice("");
  };
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [theme,setTheme,colorProfile,setColorProfile]=useTheme();
  const menuButton=useRef<HTMLButtonElement>(null);
  const closeSettings=()=>{setSettingsOpen(false);requestAnimationFrame(()=>menuButton.current?.focus());};
  const [activeTab,setActiveTab]=useState("Проект");
  const [ribbonCollapsed,setRibbonCollapsed]=useState(false);
  const ribbonTools=useRef<HTMLDivElement>(null);
  const toggleRibbon=()=>{ribbonTools.current?.querySelectorAll("details[open]").forEach(menu=>menu.removeAttribute("open"));setRibbonCollapsed(value=>!value);};
  const [detached,setDetached]=useState<string|null>(null);
  const [accessNotice,setAccessNotice]=useState("");
  const [saveMessage,setSaveMessage]=useState("Сохранено в этом браузере");
  const [catalogue,setCatalogue]=useState<Pump[]>([]);
  const [catalogueError,setCatalogueError]=useState("");
  const history=useRef<BetaState[]>([config]),historyIndex=useRef(0);
  const [historyState,setHistoryState]=useState({canUndo:false,canRedo:false});
  const refreshHistoryState=()=>setHistoryState({canUndo:historyIndex.current>0,canRedo:historyIndex.current<history.current.length-1});
  const updateConfig=(change:(current:BetaState)=>BetaState)=>setConfig(current=>{
    const changed=change(current),next=parseBetaState(changed);
    // Layout changes must not invalidate memoized pump selection/diagnostics.
    if(changed.input===current.input)next.input=current.input;
    if(JSON.stringify(next)!==JSON.stringify(current)){history.current=history.current.slice(0,historyIndex.current+1);history.current.push(next);historyIndex.current=history.current.length-1;queueMicrotask(refreshHistoryState);}
    return next;
  });
  const undo=()=>{if(historyIndex.current<=0)return;historyIndex.current--;setConfig(history.current[historyIndex.current]);refreshHistoryState();};
  const redo=()=>{if(historyIndex.current>=history.current.length-1)return;historyIndex.current++;setConfig(history.current[historyIndex.current]);refreshHistoryState();};
  const panels=config.workspace.windows,zoom=config.workspace.zoom,workspaceMode=config.workspace.mode,workspaceGrid=config.workspace.grid,gridHeightScreens=config.workspace.gridHeightScreens,secondaryEnabled=false;
  useEffect(()=>{
    const navigate=()=>{
      const params=new URLSearchParams(window.location.search),requested=params.get("panel");
      if(params.get("view")==="help"){setView("help");setDetached(null);setSidebar(false);return;}
      if(["users","base-values"].includes(params.get("view")??"")&&account.role==="admin"&&!requested){
        setView(params.get("view") as "users"|"base-values");setDetached(null);
        return;
      }
      setView("workspace");
      let current:BetaState;try{current=parseBetaState(JSON.parse(localStorage.getItem(key)??"null"));}catch{current=defaultBetaState();}
      const panel=requested?current.workspace.windows.find(item=>item.id===requested&&(!item.activeTool||isBetaTool(item.activeTool))):null;
      const allowed=panel??(isBetaTool(requested)?{id:requested}:null);
      setDetached(allowed?.id??null);
      if(params.has("view")||params.has("project")||(requested&&!allowed)||[...params.keys()].some(name=>name!=="panel")){
        window.history.replaceState({},"",allowed?`/?panel=${encodeURIComponent(allowed.id)}`:"/");
        setAccessNotice("Ссылка открыта в рабочем пространстве beta 0.1. Остальные инструменты недоступны.");
      }
    };
    navigate();window.addEventListener("popstate",navigate);
    const sync=(event:StorageEvent)=>{if(event.key!==key)return;try{const next=parseBetaState(JSON.parse(event.newValue??"null"));setConfig(next);history.current=[next];historyIndex.current=0;refreshHistoryState();}catch{/* Malformed external state is ignored. */}};
    window.addEventListener("storage",sync);
    return()=>{window.removeEventListener("popstate",navigate);window.removeEventListener("storage",sync);};
  },[key,account.role]);
  useEffect(()=>{
    try{const serialized=JSON.stringify(config);if(localStorage.getItem(key)!==serialized)localStorage.setItem(key,serialized);}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    catch{setSaveMessage("Браузер запретил сохранение параметров");}
  },[config,key]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/pumps.json",{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Не удалось загрузить каталог насосов");const data=await response.json() as Pump[];if(!Array.isArray(data))throw new Error("Некорректный каталог насосов");setCatalogue(data);}).catch(reason=>{if(!controller.signal.aborted)setCatalogueError(reason instanceof Error?reason.message:"Каталог недоступен");});
    return()=>controller.abort();
  },[]);
  const setPanels = (change: (panels: PanelState[]) => PanelState[]) => updateConfig(current => ({ ...current, workspace: { ...current.workspace, windows: change(current.workspace.windows) } }));
  const setZoom = (change: number | ((zoom: number) => number)) => updateConfig(current => ({ ...current, workspace: { ...current.workspace, zoom: typeof change === "function" ? change(current.workspace.zoom) : change } }));
  const setWorkspaceMode=(mode:WorkspaceMode)=>updateConfig(current=>{if(mode!=="grid")return {...current,workspace:{...current.workspace,mode}};const visible=current.workspace.windows.filter(panel=>!panel.minimized),cells=current.workspace.grid.cells.map(id=>visible.some(panel=>panel.id===id)?id:null),assigned=new Set(cells.filter((id):id is string=>Boolean(id))),remaining=visible.filter(panel=>!assigned.has(panel.id));for(let index=0;index<cells.length&&remaining.length;index++)if(!cells[index]){const panel=remaining.shift()!;cells[index]=panel.id;assigned.add(panel.id);}const windows=current.workspace.windows.map(panel=>!panel.minimized&&!assigned.has(panel.id)?{...panel,minimized:true}:panel);return {...current,workspace:{...current.workspace,mode,grid:{...current.workspace.grid,cells},windows}};});
  const setWorkspaceGrid=(grid:WorkspaceGrid)=>updateConfig(current=>({...current,workspace:{...current.workspace,grid}}));
  const setGridHeightScreens=(gridHeightScreens:number)=>updateConfig(current=>({...current,workspace:{...current.workspace,gridHeightScreens}}));
  const applyGridTemplate=(columns:number,rows:number)=>updateConfig(current=>{const visible=current.workspace.windows.filter(panel=>!panel.minimized),assigned=current.workspace.grid.cells.map(id=>visible.find(panel=>panel.id===id)?.id).filter((id):id is string=>Boolean(id)),remaining=visible.map(panel=>panel.id).filter(id=>!assigned.includes(id)),ids=[...assigned,...remaining],selected=new Set(ids.slice(0,columns*rows)),windows=current.workspace.windows.map(panel=>!panel.minimized&&!selected.has(panel.id)?{...panel,minimized:true}:{...panel,minimized:selected.has(panel.id)?false:panel.minimized});return {...current,workspace:{...current.workspace,mode:"grid",grid:{columns,rows,columnSizes:Array.from({length:columns},()=>1),rowSizes:Array.from({length:rows},()=>1),cells:Array.from({length:columns*rows},(_,index)=>ids[index]??null)},windows}};});
  const addGridColumn=()=>updateConfig(current=>{const grid=current.workspace.grid;if(grid.columns>=6)return current;const columns=grid.columns+1,cells=Array.from({length:grid.rows},(_,row)=>[...grid.cells.slice(row*grid.columns,(row+1)*grid.columns),null]).flat();return {...current,workspace:{...current.workspace,grid:{...grid,columns,columnSizes:[...grid.columnSizes,1],cells}}};});
  const addGridRow=()=>updateConfig(current=>{const grid=current.workspace.grid;if(grid.rows>=6)return current;return {...current,workspace:{...current.workspace,grid:{...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]}}};});
  const focus = (id: string) => setPanels(p => p.map(item => item.id === id ? { ...item, z: Math.max(0,...p.map(v => v.z)) + 1 } : item));
  const change = (next: PanelState) => { if(next.activeTool&&!isBetaTool(next.activeTool))return;setPanels(p => p.map(item => item.id === next.id ? next : item)); };
  const openPanel = (id: string) => window.open(`${window.location.pathname}?panel=${encodeURIComponent(id)}`, "_blank", "noopener,noreferrer");
  const addPanel = () => updateConfig(current=>{const windows=current.workspace.windows,index=windows.length,maxZ=Math.max(0,...windows.map(panel=>panel.z)),panel:PanelState={id:`tool-${Date.now()}`,entityId:"system-input",x:24+(index%5)*34,y:24+(index%5)*34,w:430,h:320,z:maxZ+1};if(current.workspace.mode!=="grid")return {...current,workspace:{...current.workspace,windows:[...windows,panel]}};let grid=current.workspace.grid,cell=grid.cells.findIndex(id=>!id||!windows.some(candidate=>candidate.id===id));if(cell<0&&grid.rows<6){cell=grid.cells.length;grid={...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]};}if(cell>=0){const cells=[...grid.cells];cells[cell]=panel.id;grid={...grid,cells};}return {...current,workspace:{...current.workspace,grid,windows:[...windows,panel]}};});
  const createGridTool=(cell:number,activeTool:PanelKind)=>updateConfig(current=>{const windows=current.workspace.windows,maxZ=Math.max(0,...windows.map(panel=>panel.z)),panel:PanelState={id:`grid-tool-${Date.now()}-${cell}`,activeTool,entityId:ENTITY_BY_TOOL[activeTool],x:0,y:0,w:430,h:320,z:maxZ+1},cells=[...current.workspace.grid.cells];cells[cell]=panel.id;return {...current,workspace:{...current.workspace,windows:[...windows,panel],grid:{...current.workspace.grid,cells}}};});
  const minimizePanel = (id:string) => setPanels(current=>current.map(panel=>panel.id===id?{...panel,minimized:true}:panel));
  const restorePanel = (id:string) => updateConfig(current=>{const windows=current.workspace.windows,maxZ=Math.max(0,...windows.map(panel=>panel.z)),nextWindows=windows.map(panel=>panel.id===id?{...panel,minimized:false,z:maxZ+1}:panel);if(current.workspace.mode!=="grid"||current.workspace.grid.cells.includes(id))return {...current,workspace:{...current.workspace,windows:nextWindows}};let grid=current.workspace.grid,cell=grid.cells.findIndex(value=>!value||!windows.some(panel=>panel.id===value));if(cell<0&&grid.rows<6){cell=grid.cells.length;grid={...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]};}if(cell>=0){const cells=[...grid.cells];cells[cell]=id;grid={...grid,cells};}return {...current,workspace:{...current.workspace,windows:nextWindows,grid}};});
  const closePanel = (id:string) => updateConfig(current=>({...current,workspace:{...current.workspace,windows:current.workspace.windows.filter(panel=>panel.id!==id),grid:{...current.workspace.grid,cells:current.workspace.grid.cells.map(cell=>cell===id?null:cell)}}}));
  const updateInput=(patch:Partial<InputEntity>)=>updateConfig(current=>({...current,input:{...current.input,...patch}}));
  const logout=async()=>{try{const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});if(!response.ok)throw new Error("Не удалось выйти. Повторите попытку.");window.location.replace("/");}catch(reason){setAccessNotice(reason instanceof Error?reason.message:"Сервер недоступен");}};
  const diagnosticProject=useMemo<ProjectConfig>(()=>{const project=createProject(RELEASE_LABEL,{id:key,baseValues:applied??undefined});return {...project,workspace:config.workspace,entities:{...project.entities,"system-input":config.input,"station-settings":settings}};},[key,config,applied,settings]);
  const derivedIssues=useMemo(()=>pumpIssues(config.input,"input",catalogue),[config.input,catalogue]);
  const diagnostics=useDiagnosticRegistry(diagnosticProject,derivedIssues);
  const diagnosticsValue={...diagnostics,onNavigate:()=>{}};
  if(view==="help")return <HelpCenter onBack={()=>navigateView("workspace")}/>;
  if(view==="base-values")return <BaseValuesPanel actor={account} onBack={()=>navigateView("workspace")}/>;
  if(!applied)return <main className="base-page"><h1>Базовые значения</h1><p role="status">{pinnedError||baseValuesError||"Загрузка версии расчёта…"}</p><button className="button" onClick={()=>window.location.reload()}>Повторить</button></main>;
  if(view==="users"&&account.role==="admin")return <UsersPanel actor={account} onBack={()=>navigateView("workspace")} onAccountChange={onAccountChange}/>;
  const renderTool=(tool:PanelKind|undefined)=>!tool?<div className="empty-tool"><span>＋</span><b>Пустой инструмент</b><p>Выберите нужный инструмент в списке заголовка.</p></div>:tool==="assistant"?<AIAssistant userId={account.id} context={{beta:{input:config.input,versions:applied.versions}}}/>:!isBetaTool(tool)?<div className="tool-lock"><b>{BETA_LOCK}</b></div>:tool!=="components"&&!catalogue.length?<p role={catalogueError?"alert":"status"}>{catalogueError||"Загружаем каталог насосов…"}</p>:<AllowedPumpPanel id={tool} input={config.input} settings={settings} catalogue={catalogue} onInputChange={updateInput}/>;
  if(detached){const tool=panels.find(panel=>panel.id===detached)?.activeTool??(isBetaTool(detached)?detached:undefined);return <DiagnosticsProvider value={diagnosticsValue}><main className="detached"><header className="detached__header"><Link className="brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link><span>{tool?PANEL_INFO[tool].title:"Пустой инструмент"}</span><span className="beta-release">{RELEASE_LABEL} · Внутреннее тестирование</span></header><section className="detached__content">{renderTool(tool)}</section></main></DiagnosticsProvider>;}
  const minimizedPanels=panels.filter(panel=>panel.minimized);
  const renderWorkspacePanel=(panel:PanelState,mode:WorkspaceMode="free")=><FloatingPanel key={panel.id} panel={panel} zoom={zoom} layoutMode={mode} content={renderTool(panel.activeTool)} isToolEnabled={isBetaTool} secondaryEnabled={false} onFocus={()=>focus(panel.id)} onChange={change} onDetach={()=>openPanel(panel.id)} onMinimize={()=>minimizePanel(panel.id)} onClose={()=>closePanel(panel.id)}/>;
  const workspaceHint=workspaceMode==="free"?"Окна можно перемещать, масштабировать и прикреплять к границам":workspaceMode==="mobile"?"Один инструмент в строке на всю ширину рабочего пространства":`Фиксированная сетка ${workspaceGrid.columns} × ${workspaceGrid.rows}`;
  return <DiagnosticsProvider value={diagnosticsValue}><div className={`app-shell beta-edition app-shell--${workspaceMode} ${ribbonCollapsed ? "app-shell--ribbon-collapsed" : ""} ${minimizedPanels.length?"app-shell--tasks":""}`}>
    <header className="app-header">
      <button ref={menuButton} className="icon-button app-header__menu" onClick={() => setSidebar(true)} aria-label="Открыть меню"><Icon name="menu" /></button>
      <Link className="brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link>
      <div className="app-header__project"><small>Внутреннее тестирование</small><button disabled title={BETA_LOCK}>{RELEASE_LABEL}</button></div>
      <div className="app-header__actions"><span className="save-state"><i />{saveMessage}</span><button className="avatar" onClick={()=>{setSidebar(true)}} title={account.name}>{initials(account.name)}</button></div>
    </header>

    <BaseValuesUpdateNotice project={diagnosticProject} latest={latest} error={pinnedError||baseValuesError} onApply={next=>accept((next.entities["station-settings"] as SettingsEntity).baseValues!)}/>
    {accessNotice && <p className="access-note" role="status">{accessNotice}<button className="button" onClick={()=>setAccessNotice("")}>Понятно</button></p>}
    <div className={`sidebar ${sidebar ? "sidebar--open" : ""}`} inert={!sidebar}><button className="sidebar__backdrop" onClick={() => setSidebar(false)} aria-label="Закрыть меню"/><aside className="sidebar__panel"><div className="sidebar__top"><div className="brand"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></div><button className="icon-button" onClick={() => setSidebar(false)}><Icon name="close" /></button></div><div className="user-card"><span className="avatar avatar--large">{initials(account.name)}</span><div><div className="user-card__name"><b>{account.name}</b><span className="user-role">{account.role}</span></div><small>{account.email}</small></div></div><nav className="sidebar__nav"><button className="sidebar__link sidebar__link--active" onClick={()=>setSidebar(false)}>▦ <span>Рабочее пространство</span></button><button className="sidebar__link" disabled title={BETA_LOCK}>▤ <span>Мои проекты</span></button><button className="sidebar__link" disabled title={BETA_LOCK}>⌁ <span>База оборудования</span></button>{account.role==="admin"&&<button className="sidebar__link" disabled title={BETA_LOCK}>⌗ <span>Расчёт комплектующих</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>navigateView("base-values")}>⚙ <span>Базовые значения</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>navigateView("users")}>♙ <span>Список пользователей</span></button>}<button className="sidebar__link" onClick={() => { setSidebar(false); setSettingsOpen(true); }}>⚙ <span>Настройки</span></button><Link className="sidebar__link" href="/?auth=forgot">⌘ <span>Сменить пароль</span></Link><button className="sidebar__link" onClick={logout}>↪ <span>Выйти</span></button></nav><button className="sidebar__footer help-center-entry" onClick={()=>navigateView("help")}><span className="help-center-entry__icon" aria-hidden="true">?</span><span><b>Центр помощи</b><small>Документация и поддержка</small></span></button></aside></div>

    <nav className="ribbon">
      <div className="ribbon__tabs">
        {["Проект", "Вставка", "Расчёт", "Вид"].map(t => <button key={t} className={activeTab === t ? "ribbon__tab ribbon__tab--active" : "ribbon__tab"} onClick={() => { setActiveTab(t); setRibbonCollapsed(false); }}>{t}</button>)}
        <button className="ribbon__toggle" onClick={toggleRibbon} aria-expanded={!ribbonCollapsed} aria-controls="ribbon-tools" aria-label={ribbonCollapsed ? "Развернуть верхнюю панель" : "Свернуть верхнюю панель"} title={ribbonCollapsed ? "Развернуть верхнюю панель" : "Свернуть верхнюю панель"}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 10 4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div id="ribbon-tools" ref={ribbonTools} className="ribbon__tools" hidden={ribbonCollapsed}><div className="tool-group"><button onClick={undo} disabled={!historyState.canUndo} title="Назад"><Icon name="undo" /></button><button onClick={redo} disabled={!historyState.canRedo} title="Вперёд"><Icon name="redo" /></button></div><span className="ribbon__divider"/>{activeTab==="Вид"?<><div className="view-modes" role="group" aria-label="Режим рабочего пространства"><button className={workspaceMode==="free"?"view-modes__button view-modes__button--active":"view-modes__button"} onClick={()=>setWorkspaceMode("free")}><b>◇</b><span>Свободные окна</span></button><button className={workspaceMode==="mobile"?"view-modes__button view-modes__button--active":"view-modes__button"} onClick={()=>setWorkspaceMode("mobile")}><b>▤</b><span>Mobile</span></button><details className={`view-grid-menu ${workspaceMode==="grid"?"view-grid-menu--active":""}`}><summary className="view-modes__button"><b>▦</b><span>Сетка</span><i aria-hidden="true">⌄</i></summary><div className="view-grid-menu__list" aria-label="Выбор сетки"><strong>Выберите сетку</strong>{[[2,2],[3,2],[2,3]].map(([columns,rows])=><button key={`${columns}x${rows}`} className={workspaceMode==="grid"&&workspaceGrid.columns===columns&&workspaceGrid.rows===rows?"grid-presets__button grid-presets__button--active":"grid-presets__button"} onClick={event=>{applyGridTemplate(columns,rows);event.currentTarget.closest("details")?.removeAttribute("open");}}><b>{columns} × {rows}</b><small>{columns} столб. · {rows} стр.</small></button>)}</div></details></div>{workspaceMode==="grid"&&<><span className="ribbon__divider"/><GridHeightControl key={account.id} value={gridHeightScreens} onChange={setGridHeightScreens} /><span className="ribbon__divider"/><div className="grid-actions"><button onClick={addGridColumn} disabled={workspaceGrid.columns>=6}><b>＋▥</b><small>Столбец</small></button><button onClick={addGridRow} disabled={workspaceGrid.rows>=6}><b>＋▤</b><small>Строка</small></button></div></>}</>:<><div className="tool-group tool-group--labeled"><button disabled title={BETA_LOCK}><b>＋</b><small>Новый</small></button><button disabled title={BETA_LOCK}><b>↥</b><small>Открыть JSON</small></button></div><span className="ribbon__divider"/><div className="tool-group tool-group--labeled"><button onClick={() => setPanels(() => defaultBetaState().workspace.windows) }><b>▦</b><small>Упорядочить</small></button><button onClick={addPanel}><b>＋</b><small>Добавить инструмент</small></button></div><span className="ribbon__divider"/><div className="tool-group tool-group--labeled"><button disabled title={BETA_LOCK}><b>▣</b><small>Сохранить</small></button><button disabled title={BETA_LOCK}><b>↓</b><small>Экспорт JSON</small></button><button disabled title={BETA_LOCK}><b>▷</b><small>Запустить расчёт</small></button></div></>}<span className="ribbon__hint">{activeTab}: инструменты проекта</span></div>
    </nav>

    <main className={`workspace workspace--${workspaceMode}`}><div className="workspace__bar"><div><span className="workspace__status"/><b>Рабочее пространство</b><small>{workspaceHint}</small></div>{workspaceMode==="free"&&<div className="workspace__zoom"><button onClick={() => setZoom(value => Math.max(50, value - 10))} disabled={zoom === 50} aria-label="Уменьшить масштаб">−</button><button className="workspace__zoom-value" onClick={() => setZoom(100)} aria-label="Сбросить масштаб">{zoom}%</button><button onClick={() => setZoom(value => Math.min(150, value + 10))} disabled={zoom === 150} aria-label="Увеличить масштаб">＋</button></div>}</div>{workspaceMode==="free"?<div className="workspace__canvas"><div className="workspace__surface" style={{width:`${10000/zoom}%`,height:`${10000/zoom}%`,transform:`scale(${zoom/100})`}}>{panels.filter(panel=>!panel.minimized).map(panel=>renderWorkspacePanel(panel,"free"))}</div></div>:workspaceMode==="mobile"?<div className="workspace__canvas workspace__canvas--mobile"><div className="workspace-mobile">{panels.filter(panel=>!panel.minimized).map(panel=>renderWorkspacePanel(panel,"mobile"))}</div></div>:<div className="workspace__canvas workspace__canvas--grid"><GridWorkspace isToolEnabled={isBetaTool} grid={workspaceGrid} heightScreens={gridHeightScreens} panels={panels} secondaryEnabled={secondaryEnabled} renderPanel={renderWorkspacePanel} onGridChange={setWorkspaceGrid} onCreate={createGridTool}/></div>}</main>
    {minimizedPanels.length>0&&<div className="window-dock" role="toolbar" aria-label="Свернутые инструменты"><span className="window-dock__label">Свернутые</span>{minimizedPanels.map(panel=><button key={panel.id} onClick={()=>restorePanel(panel.id)}><i aria-hidden="true"/>{panel.activeTool?PANEL_INFO[panel.activeTool].title:"Пустой инструмент"}<span>Развернуть</span></button>)}</div>}
    {settingsOpen && <AppSettings theme={theme} onThemeChange={setTheme} profile={colorProfile} onProfileChange={setColorProfile} onClose={closeSettings} />}
    <footer className="app-footer"><span>{RELEASE_LABEL} · Внутреннее тестирование</span><span>Недоступные инструменты заблокированы</span><span>{RELEASE_VERSION}</span></footer>
  </div></DiagnosticsProvider>;
}
