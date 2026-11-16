"use client";
import "./engineering/native-server";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NodeWorkspace, loadTools } from "./node-tools/workspace";
import { DEFAULT_ALGORITHM, algorithmForProject } from "./node-tools/algorithm-schema";
import { migrateProduct } from "./node-tools/product-state";
import { toolSourceDependencies } from "./node-tools/workspace-sources";
import { loadProgram } from "./engineering/client";
import { currentPublication, INITIAL_VERSION, setBrowserPublication } from "./engineering/runtime";
import { ProjectRequestError, ProjectSession, projectApi, type ProjectCard, type ProjectFile } from "./project-session";
import { mergeProjectChanges } from "./project-merge";
import { ProjectHistory } from "./project-history";
import { resetComponentsDatabase } from "./allowed-pump-tools";
import { AppSettings } from "./app-settings";
import { AppNavigation, type AppView } from "./app-navigation";
import { AssistantMenu } from "./ai-assistant";
import type { NodeAssistantReader } from "./node-tools/assistant-project";
import { useTheme } from "./use-theme";
import { createProject, projectFilename, withUpdatedTimestamp, type ProjectConfig, type SettingsEntity, type SpecEntity } from "./project-config";
import { BaseValuesPanel } from "./base-values-panel";
import { ItemEntryPanel } from "./item-entry-panel";
import { EquipmentAdminPanel } from "./equipment-admin-panel";
import { HelpCenter } from "./help-center";
import { fetchPublishedBaseValues } from "./base-values-update";
import { UsersPanel } from "./users-panel";
import { ComponentCalculator } from "./component-calculator";
import type { AccountUser } from "./user-types";
import { parseAccessibleProject, projectAccessError } from "./project-access";
import { WorkspaceLoading, paintLoadingStep, PRODUCT_OPEN_STEPS, PROJECT_OPEN_STEPS, PROJECT_CREATE_STEPS } from "./workspace-loading";

const AlgorithmLibrary = lazy(() => import("./node-tools/algorithm-library").then(module => ({default: module.AlgorithmLibrary})));
const ToolEditor = lazy(() => import("./node-tools/editor").then(module => ({default: module.ToolEditor})));
const fullViews = new Set<AppView>(["projects", "users", "component-calculator", "base-values", "item-entry", "equipment-admin", "node-editor", "workspace2", "algorithm-library", "help"]);
const requestedView = (value: string | null): AppView => fullViews.has(value as AppView) ? value as AppView : "projects";

type StoredProject=ProjectCard;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toLocaleUpperCase("ru-RU")).join("")||"ПС";

function ProjectsPage({user,projects,onBack,onOpen,onCreate,onDelete,onLogout}:{user:AccountUser;projects:StoredProject[];onBack:()=>void;onOpen:(project:StoredProject)=>void;onCreate:()=>void;onDelete:(project:StoredProject)=>void;onLogout:()=>void}){
  return <div className="projects-page"><header className="projects-header"><button className="brand brand-button" onClick={onBack}><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></button><div className="projects-header__actions"><span className="save-state">{user.email}</span><button className="avatar" title={user.name}>{initials(user.name)}</button><button className="button" onClick={onLogout}>Выйти</button></div></header><main className="projects-main"><div className="projects-main__title"><div><h1>Мои проекты</h1><p>Откройте сохранённый расчёт и продолжите работу с того же места.</p></div><button className="button button--primary" style={{width:"auto"}} onClick={onCreate}>＋ Новый проект</button></div>{projects.length?<div className="projects-grid">{projects.map(project=><article className="project-card" key={project.id}><span className="project-card__icon">▦</span><h2>{project.name}</h2><p>Изменён {new Date(project.updatedAt).toLocaleString("ru-RU",{dateStyle:"medium",timeStyle:"short"})}</p><p>{project.id}</p><div className="project-card__actions"><button onClick={()=>onOpen(project)}>Открыть проект</button><button onClick={()=>onDelete(project)} aria-label={`Удалить ${project.name}`}>Удалить</button></div></article>)}</div>:<div className="projects-empty"><span>▦</span><b>У вас пока нет сохранённых проектов</b><p>Создайте первый проект, чтобы начать расчёт насосной станции.</p></div>}</main></div>;
}

export default function Home({account, onAccountChange}: {account: AccountUser; onAccountChange: (user: AccountUser | null) => void}) {
  const [sidebar, setSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme, colorProfile, setColorProfile] = useTheme();
  const menuButton = useRef<HTMLButtonElement>(null);
  const assistantContextRef = useRef<NodeAssistantReader | null>(null);
  const closeSettings = () => { setSettingsOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); };
  const [config, setConfig] = useState<ProjectConfig>(() => createProject("Насосная станция № 24", { id:"PS-NEW", timestamp:"2000-01-01T00:00:00.000Z" }));
  const [saveMessage, setSaveMessage] = useState("");
  const bootstrapAccount = useRef(account);
  const role = account.role;
  const [bootError,setBootError]=useState("");
  const [projectLoadError,setProjectLoadError]=useState("");
  const accessError = account ? projectAccessError(config, role) : null;
  const [accessNotice,setAccessNotice]=useState("");
  const [accountLoading,setAccountLoading]=useState(true);
  const [bootstrapStep,setBootstrapStep]=useState(0);
  const openingBusy=useRef(false), openingAttempt=useRef(0);
  const [opening,setOpening]=useState<{title:string;steps:readonly string[];step:number;attempt:number;retry:()=>void;error?:string}|null>(null);
  const beginOpening=(title:string,steps:readonly string[],retry:()=>void)=>{
    if(openingBusy.current)return false;
    openingBusy.current=true;setSidebar(false);
    setOpening({title,steps,step:0,attempt:++openingAttempt.current,retry});
    return true;
  };
  const openingStep=(step:number)=>setOpening(current=>current?{...current,step}:null);
  const openingFailed=(error:unknown)=>setOpening(current=>current?{...current,error:error instanceof Error?error.message:"Не удалось открыть рабочее пространство."}:null);
  const finishOpening=()=>{openingBusy.current=false;setOpening(current=>current?.error?current:null);};
  const [projects,setProjects]=useState<StoredProject[]>([]);
  const [nextPage,setNextPage]=useState<number|null>(null);
  const [historyVisible,setHistoryVisible]=useState(false);
  const importMode=useRef<"new"|"replace">("new");
  const libraryVersion=useRef<string|undefined>(undefined);
  const session=useRef<ProjectSession|null>(null);
  const [activeSession,setActiveSession]=useState<ProjectSession|null>(null);
  const [conflicted,setConflicted]=useState(false);
  const [projectDirty,setProjectDirty]=useState(false);
  const activate=useCallback((user:AccountUser,project:ProjectConfig,revision:number,freeze:boolean)=>{
    session.current?.dispose();
    if (freeze && (project.entities["station-spec"] as SpecEntity).items.some(item => item.insertionAssembly)) resetComponentsDatabase();
    if(libraryVersion.current && !project.project.modelLibraryVersion){
      project={...project,project:{...project.project,modelLibraryVersion:libraryVersion.current}};
    }
    const active=new ProjectSession(user.id,project,revision,
      message=>{if(session.current===active){setSaveMessage(message);setConflicted(active.blocked);setProjectDirty(active.dirty);}},
      card=>setProjects(cards=>[card,...cards.filter(other=>other.id!==card.id)]),
      (next,previous)=>{
        if(session.current!==active)return;
        setConfig(current=>{
          if(current.project.id!==next.project.id)return current;
          const merged=mergeProjectChanges(previous,current,next);
          if(merged.conflicts.length)active.retainConflict(current);
          return merged.conflicts.length?current:merged.config;
        });
      },next=>parseAccessibleProject(next,user.role));
    session.current=active;setActiveSession(active);setConflicted(false);setProjectDirty(active.dirty); setConfig(project);
    hydrated.current=true;setProjectLoadError("");setAccessNotice("");
    setSaveMessage(revision?"Сохранено на сервере":"Есть изменения");
    return active;
  },[]);
  useEffect(()=>activeSession?.connect(),[activeSession]);
  const [view,setView] = useState<AppView>(() => requestedView(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null));
  const [algorithmId,setAlgorithmId]=useState(()=>typeof window!=="undefined"?new URLSearchParams(window.location.search).get("algorithm")??DEFAULT_ALGORITHM:DEFAULT_ALGORITHM);
  const [algorithmName,setAlgorithmName]=useState("Насосная установка");
  const [initialRuntime,setInitialRuntime]=useState<{projectId:string; data:Awaited<ReturnType<typeof loadTools>>}|null>(null);
  useEffect(()=>{
    if(initialRuntime)queueMicrotask(()=>setInitialRuntime(current=>current===initialRuntime?null:current));
  },[initialRuntime]);
  const rememberedProducts=useRef(new Map<string,string>());
  const projectCreation=useRef<{running:boolean; request?:{owner:string; algorithm:string; config:ProjectConfig; operation:string}}>({running:false});
  const [creatingProject,setCreatingProject]=useState(false);
  const [projectCreationError,setProjectCreationError]=useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    const params=new URLSearchParams(window.location.search),requestedProject=params.get("project");
    let active=true;
    void (async()=>{
      const user=bootstrapAccount.current;
      // A stale project link must not discard the project list or block other tools.
      const [pageResult, fileResult]=await Promise.allSettled([
        projectApi<{projects:StoredProject[];next:number|null;modelLibraryVersion?:string}>(),
        requestedProject ? projectApi<ProjectFile>("?id="+encodeURIComponent(requestedProject)) : undefined
      ]);
      if(!active)return;
      setBootstrapStep(1);
      for(const result of [pageResult,fileResult]){
        if(result.status==="rejected" && result.reason instanceof ProjectRequestError && result.reason.status===401)throw result.reason;
      }
      const page=pageResult.status==="fulfilled"?pageResult.value:undefined;
      if(page){
        setProjects(page.projects);setNextPage(page.next);libraryVersion.current=page.modelLibraryVersion;
      }else if(pageResult.status==="rejected"){
        setBootError(pageResult.reason instanceof Error?pageResult.reason.message:"Не удалось загрузить список проектов");
      }
      const requested=params.get("view");
      const projectView=!requested || requested==="workspace" || requested==="workspace2" || requested==="projects";
      try {
        if(fileResult.status==="rejected")throw fileResult.reason;
        const recentProject=!requestedProject && projectView?page?.projects[0]?.id:undefined;
        const file=fileResult.value ?? (recentProject ? await projectApi<ProjectFile>("?id="+encodeURIComponent(recentProject)) : undefined);
        if(!active)return;
        const loaded=file?parseAccessibleProject(file.config,user.role):undefined;
        setBootstrapStep(2);
        const program=await loadProgram(loaded?(loaded.project.graphVersion??INITIAL_VERSION):undefined);
        if(!active)return;
        setBrowserPublication(program);
        if(loaded && file){
          loaded.project.graphVersion=program.version;
          activate(user,loaded,file.revision,true);
          if(!requested || requested==="workspace"){
            params.set("project",loaded.project.id);
            if(loaded.workspace2){
              const id=algorithmForProject(loaded.workspace2);
              setAlgorithmId(id);setView("workspace2");params.set("view","workspace2");params.set("algorithm",id);
            }else {setView("projects");params.set("view","projects");}
            params.delete("panel");
            window.history.replaceState({},"","/?"+params.toString());
          }
        }
      } catch(error) {
        if(!active)return;
        if(error instanceof ProjectRequestError && error.status===401)throw error;
        setProjectLoadError(error instanceof Error?error.message:"Не удалось открыть проект.");
        if(error instanceof ProjectRequestError && error.status===404){
          params.delete("project");params.delete("nodePanel");params.delete("panel");
          if(projectView){setView("projects");params.set("view","projects");params.delete("algorithm");}
          window.history.replaceState({},"","/?"+params.toString());
        }
      }
      hydrated.current=true;
    })().catch(error=>{
      if(!active)return;
      if(error instanceof ProjectRequestError && error.status===401)onAccountChange(null);
      else setBootError(error instanceof Error?error.message:"Не удалось загрузить проект");
    }).finally(()=>{if(active)setAccountLoading(false);});
    return ()=>{active=false;};
  }, [activate, onAccountChange]);
  useEffect(() => {
    const navigate = () => { const params=new URLSearchParams(window.location.search);setAlgorithmId(params.get("algorithm")??DEFAULT_ALGORITHM);setView(requestedView(params.get("view")));setSidebar(false); };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(() => {
    if(hydrated.current && account && !accessError && session.current?.latest.project.id===config.project.id)session.current.update(config);
  },[config,account,accessError]);

  const updateConfig = (change: (current: ProjectConfig) => ProjectConfig) => setConfig(current => {
    const next=change(current);
    return projectAccessError(next,role) ? current : withUpdatedTimestamp(next);
  });
  const download = () => {
    const blob = new Blob([JSON.stringify(withUpdatedTimestamp(config), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = projectFilename(config); link.click(); URL.revokeObjectURL(url);
  };
  const openFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      if(!account)return;
      const loaded=parseAccessibleProject(JSON.parse(await file.text()),role);
      if(session.current && !await session.current.flush())throw new Error("Сначала сохраните текущий проект или сохраните конфликт как копию.");
      if(importMode.current==="replace") {
        if(!window.confirm("Заменить содержимое открытого проекта импортированным JSON?"))return;
        loaded.project={...loaded.project,id:config.project.id,createdAt:config.project.createdAt};
        const program=await loadProgram(loaded.project.graphVersion??INITIAL_VERSION);setBrowserPublication(program);loaded.project.graphVersion=program.version;
        setConfig(loaded);
      } else {
        loaded.project={...loaded.project,id:crypto.randomUUID()};
        const program=await loadProgram(loaded.project.graphVersion??INITIAL_VERSION);setBrowserPublication(program);loaded.project.graphVersion=program.version;
        activate(account,loaded,0,true);
      }
      setAccessNotice("");showProject(loaded);
    } catch(error){window.alert(error instanceof Error?error.message:"Не удалось открыть проект");}
  };
  const rename = () => { const name=window.prompt("Название проекта",config.project.name)?.trim();if(name)updateConfig(current=>({...current,project:{...current.project,name}})); };
  const openById=async(id:string):Promise<void>=>{
    if(!account || !beginOpening("Открываем сохранённый проект",PROJECT_OPEN_STEPS,()=>void openById(id)))return;
    try{
    if(session.current?.latest.project.id!==id && session.current && !await session.current.flush())throw new Error("Сначала сохраните текущий проект или сохраните конфликт как копию.");
    openingStep(1);
    const file=await projectApi<ProjectFile>("?id="+encodeURIComponent(id));
    const loaded=parseAccessibleProject(file.config,role);
    openingStep(2);
    const program=await loadProgram(loaded.project.graphVersion??INITIAL_VERSION);
    openingStep(3);await paintLoadingStep();
    setBrowserPublication(program);loaded.project.graphVersion=program.version;
    activate(account,loaded,file.revision,true);
    const params=new URLSearchParams({project:id});
    setAccessNotice("");
    if(loaded.workspace2){const id=algorithmForProject(loaded.workspace2);setAlgorithmId(id);setView("workspace2");params.set("view","workspace2");params.set("algorithm",id);}else {setView("projects");params.set("view","projects");}
    window.history.replaceState({},"","/?"+params.toString());
    }catch(error){openingFailed(error);}finally{finishOpening();}
  };
  const openStoredProject=(card:StoredProject)=>{void openById(card.id).catch(error=>window.alert(error.message));};
  const reloadFromDatabase=()=>{void openById(config.project.id).catch(error=>setAccessNotice(error.message));};
  const saveConflictCopy=()=>{
    const original=session.current;
    if(!account || !original)return;
    const copy={...config,project:{...config.project,id:crypto.randomUUID(),name:config.project.name+" (копия)"}};
    activate(account,copy,0,true).retireAfterCopy(original);
    showProject(copy);
  };
  const deleteProject=async(card:StoredProject)=>{if(!window.confirm("Удалить проект «"+card.name+"»?"))return;
    try{await projectApi("?id="+encodeURIComponent(card.id)+"&base="+card.revision,undefined,"DELETE");setProjects(current=>current.filter(p=>p.id!==card.id));if(config.project.id===card.id){session.current?.dispose();session.current=null;setActiveSession(null);setConfig(createProject("Новая насосная станция"));setSaveMessage("");setView("projects");window.history.replaceState({},"","/?view=projects");}}catch(error){window.alert(String(error));}
  };
  const logout=async()=>{await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});window.location.replace("/");};

  const showProject=(project:ProjectConfig)=>{
    const params=new URLSearchParams({project:project.project.id});
    const next=project.workspace2 ? "workspace2" : "projects";
    if(project.workspace2){const id=algorithmForProject(project.workspace2);setAlgorithmId(id);params.set("algorithm",id);}
    setView(next);params.set("view",next);window.history.replaceState({},"","/?"+params.toString());
  };
  if(accountLoading)return <main className="beta-loading"><WorkspaceLoading title="Подготавливаем рабочее пространство" steps={["Загружаем список проектов", "Загружаем выбранный проект", "Проверяем правила расчёта"]} step={bootstrapStep}/></main>;
  const header = <>
      <Link prefetch={false} className="brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link>
      {activeSession && <div className="app-header__project"><small>ТЕКУЩИЙ ПРОЕКТ</small><button onClick={rename}>{config.project.name} <span>✎</span></button></div>}
      <div className="app-header__actions"><span className="save-state" role="status"><i style={{background:saveMessage==="Сохранено на сервере"?"#48a96a":conflicted?"#d75a57":"#d29b44"}}/>{saveMessage}</span><button className="avatar" onClick={()=>{setSidebar(true)}} title={account.name}>{initials(account.name)}</button><AssistantMenu userId={account.id} context={activeSession && config.workspace2 ? {projectId:config.project.id} : undefined} getWorkspace={view === "workspace2" ? async signal => assistantContextRef.current?.(signal) : undefined}/></div>
  </>;
  const openAlgorithmEditor=(id:string)=>{setAlgorithmId(id);setView("node-editor");const params=new URLSearchParams({view:"node-editor",algorithm:id});if(session.current)params.set("project",session.current.latest.project.id);window.history.pushState({},"","/?"+params);};
  const openAlgorithmProduct=async(id:string,name:string):Promise<void>=>{
    if(!beginOpening(name,PRODUCT_OPEN_STEPS,()=>void openAlgorithmProduct(id,name)))return;
    try {
      if(session.current && !await session.current.flush())throw Error("Сначала сохраните текущий проект или разрешите конфликт сохранения.");
      openingStep(1);
      let target:ProjectConfig|undefined,revision=0,persisted=false;
      if(session.current && algorithmForProject(config.workspace2)===id){target=config;revision=session.current.revision;persisted=revision>0;}
      else {
        let remembered=rememberedProducts.current.get(id);
        try{remembered??=localStorage.getItem("product.last."+account.id+"."+id)??undefined;}catch{/* Optional shortcut to a server project. */}
        if(remembered){try{const file=await projectApi<ProjectFile>("?id="+encodeURIComponent(remembered));const candidate=parseAccessibleProject(file.config,role);if(algorithmForProject(candidate.workspace2)===id){target=candidate;revision=file.revision;persisted=true;}}catch{/* A deleted shortcut does not delete any product state. */}}
      }
      if(!target?.workspace2){
        const [initial,baseValues]=await Promise.all([loadTools(undefined,undefined,undefined,id,"initialize"),target?undefined:fetchPublishedBaseValues()]);
        target??=createProject(name,{baseValues});
        const settings=target.entities["station-settings"] as SettingsEntity;
        const projectControls={geometry:settings.geometryEnabled,pressure:settings.pressureChecksEnabled};
        const needsCatalogs=Object.values(initial.program.product?.controls ?? {}).some(ref=>toolSourceDependencies(initial.program,ref.toolId).length);
        openingStep(2);
        const remote=needsCatalogs ? await loadTools(initial.program.version,initial.baseVersions,initial.sourceVersions,id) : initial;
        if(remote.sourceErrors && Object.keys(remote.sourceErrors).length)throw Error(Object.values(remote.sourceErrors).join(" · "));
        openingStep(3);await paintLoadingStep();
        const workspace2=remote.program.product
          ? migrateProduct(remote.program,undefined,remote.defaults,remote.baseVersions,remote.role,remote.resources,remote.sourceVersions,projectControls).data
          : {schema:1 as const,algorithmId:id,tools:{}};
        target={...target,workspace2};
        setInitialRuntime({projectId:target.project.id,data:remote});
      }
      if(!session.current || target.project.id!==config.project.id)activate(account,target,revision,persisted);else updateConfig(()=>target!);
      rememberedProducts.current.set(id,target.project.id);try{localStorage.setItem("product.last."+account.id+"."+id,target.project.id);}catch{/* The project itself is stored on the server. */}
      setAlgorithmId(id);setAlgorithmName(name);setView("workspace2");setSidebar(false);
      window.history.pushState({},"","/?"+new URLSearchParams({view:"workspace2",algorithm:id,project:target.project.id}));
    }catch(e){openingFailed(e);}finally{finishOpening();}
  };
  const openProductWindow=(panelId:string)=>{
    const current=session.current;if(!current)return;
    const child=window.open("about:blank","_blank");
    if(!child){setSaveMessage("Разрешите всплывающие окна для этого сайта.");return;}
    child.opener=null;current.update(config);
    void current.flush().then(saved=>{
      if(!saved || session.current!==current){child.close();return;}
      child.location.replace("/?"+new URLSearchParams({view:"workspace2",algorithm:algorithmId,project:config.project.id,nodePanel:panelId}));
    }).catch(()=>{child.close();setSaveMessage("Не удалось сохранить проект перед открытием отдельного окна.");});
  };
  const newAlgorithmProject=async():Promise<void>=>{
    const creation=projectCreation.current, previous=session.current;
    if(creation.running || !beginOpening("Создаём проект",PROJECT_CREATE_STEPS,()=>void newAlgorithmProject()))return;
    creation.running=true;
    setCreatingProject(true);
    setProjectCreationError("");
    try {
      if(previous && !await previous.flush())throw Error("Сначала сохраните текущий проект или разрешите конфликт.");
      openingStep(1);
      let runtime: Awaited<ReturnType<typeof loadTools>> | undefined;
      if(creation.request?.owner!==account.id || creation.request.algorithm!==algorithmId){
        const [remote,baseValues]=await Promise.all([loadTools(undefined,undefined,undefined,algorithmId,"initialize"),fetchPublishedBaseValues()]);
        runtime=remote;
        if(remote.sourceErrors && Object.keys(remote.sourceErrors).length)throw Error(Object.values(remote.sourceErrors).join(" · "));
        openingStep(2);await paintLoadingStep();
        const next=createProject(remote.algorithm.name,{baseValues});
        next.project.graphVersion=currentPublication().version;
        next.project.modelLibraryVersion=libraryVersion.current;
        next.workspace2=remote.program.product
          ? migrateProduct(remote.program,undefined,remote.defaults,remote.baseVersions,remote.role,remote.resources,remote.sourceVersions).data
          : {schema:1,algorithmId,tools:{}};
        creation.request={owner:account.id,algorithm:algorithmId,config:next,operation:crypto.randomUUID()};
      }
      if(session.current!==previous)return;
      const {config:next,operation}=creation.request;
      openingStep(3);
      let revision:number;
      try {
        ({revision}=await projectApi<{revision:number}>("",{config:next,operation,baseRevision:0}));
      } catch(error) {
        if(error instanceof ProjectRequestError && error.status>=400 && error.status<500)creation.request=undefined;
        throw error;
      }
      creation.request=undefined;
      setProjects(cards=>[{...next.project,revision},...cards.filter(card=>card.id!==next.project.id)]);
      if(session.current!==previous)return;
      if(previous?.dirty && !await previous.flush())throw Error("Новый проект сохранён в «Моих проектах». Сохраните изменения открытого проекта перед переходом.");
      if(session.current!==previous)return;
      if(runtime)setInitialRuntime({projectId:next.project.id,data:runtime});
      activate(account,next,revision,true);setView("workspace2");
      rememberedProducts.current.set(algorithmId,next.project.id);try{localStorage.setItem("product.last."+account.id+"."+algorithmId,next.project.id);}catch{/* Optional navigation shortcut. */}
      window.history.replaceState({},"","/?"+new URLSearchParams({view:"workspace2",algorithm:algorithmId,project:next.project.id}));
    } catch(error){setProjectCreationError(error instanceof Error?error.message:"Не удалось создать проект.");openingFailed(error);}
    finally{creation.running=false;setCreatingProject(false);finishOpening();}
  };
  const navigateView = (next: AppView) => {
    setView(requestedView(next)); setSidebar(false);
    const params = new URLSearchParams();
    if(session.current)params.set("project",session.current.latest.project.id);
    params.set("view", requestedView(next));
    if(next==="node-editor"||next==="workspace2")params.set("algorithm",algorithmId);
    window.history.pushState({}, "", "/?" + params.toString());
  };
  const backToProjects=()=>navigateView("projects");
  const renderPage = () => {
    if(view==="workspace2" && projectLoadError && !activeSession)return <main className="base-page"><h1>Не удалось загрузить проект</h1><p role="alert">{projectLoadError}</p><button className="button" onClick={()=>window.location.reload()}>Повторить загрузку</button><button className="button" onClick={backToProjects}>Мои проекты</button></main>;
    if(view==="help")return <HelpCenter onBack={backToProjects}/>;
    if(view==="algorithm-library")return account.role==="admin"?<AlgorithmLibrary openEditor={openAlgorithmEditor}/>:<main><h1>Доступ только для администратора</h1></main>;
    if(view==="node-editor")return account.role==="admin"?<ToolEditor key={algorithmId} algorithmId={algorithmId} selectAlgorithm={openAlgorithmEditor} project={algorithmForProject(config.workspace2)===algorithmId?config:{...config,workspace2:undefined}} back={async()=>{if(session.current && !await session.current.flush())return;backToProjects();}}/>:<main><h1>Доступ только для администратора</h1></main>;
    if(view==="workspace2" && (!config.workspace2 || algorithmForProject(config.workspace2)!==algorithmId))return <main className="nt-workspace"><h1>Рабочее пространство продукта</h1><button onClick={()=>void openAlgorithmProduct(algorithmId,algorithmName)}>Открыть проект выбранного продукта</button></main>;
  if(view==="workspace2")return <NodeWorkspace assistantContextRef={assistantContextRef} initialRuntime={initialRuntime?.projectId===config.project.id?initialRuntime.data:undefined} key={config.project.id+"/"+algorithmId} algorithmId={algorithmId} name={algorithmName} userId={account.id} pendingSave={projectDirty} projectError={projectCreationError} flush={()=>{setTimeout(()=>void session.current?.flush(),0);}} projectActions={<><button aria-label="Новый проект" disabled={creatingProject} onClick={()=>void newAlgorithmProject()}><b>＋</b><small>{creatingProject?"Создаём…":"Новый"}</small></button><button aria-label="Переименовать проект" onClick={rename}><b>✎</b><small>Переименовать</small></button><button onClick={async()=>{if(!session.current || await session.current.flush())setView("projects");}}><b>▤</b><small>Мои проекты</small></button><button onClick={()=>setHistoryVisible(true)}><small>История версий</small></button><button onClick={()=>{importMode.current="replace";fileInput.current?.click();}}><small>Заменить из JSON</small></button><button onClick={download}><b>↓</b><small>Экспорт JSON</small></button>{conflicted&&<><button onClick={reloadFromDatabase}><small>Открыть из базы</small></button><button onClick={saveConflictCopy}><small>Сохранить копию</small></button></>}</>} detach={openProductWindow} project={config} status={saveMessage} update={workspace2=>updateConfig(current=>({...current,workspace2}))} back={async()=>{if(session.current && !await session.current.flush())return;navigateView("projects");}}/>;
    if(view==="equipment-admin")return <EquipmentAdminPanel actor={account} onBack={backToProjects}/>;
    if(view==="item-entry")return <ItemEntryPanel actor={account} onSaved={()=>{}} onBack={backToProjects}/>;
    if(view==="base-values")return <BaseValuesPanel actor={account} onBack={backToProjects}/>;
    if(view==="component-calculator")return <ComponentCalculator actor={account} onBack={backToProjects} onSaved={()=>resetComponentsDatabase()}/>;
    if(view==="users")return account.role==="admin"?<UsersPanel actor={account} onAccountChange={onAccountChange} onBack={backToProjects}/>:<main className="users-page"><h1>Доступ только для администратора</h1></main>;
    return <>
      {accessError && <p role="alert">{accessError}</p>}
      {activeSession && !config.workspace2 && <section className="base-page"><h2>{config.project.name}</h2><p>Проект создан в прежнем рабочем пространстве. Откройте его в продукте для продолжения расчёта и подтвердите выбор насоса.</p><button className="button" onClick={()=>void openAlgorithmProduct(DEFAULT_ALGORITHM,"Насосная установка")}>Открыть в продукте</button><button className="button" onClick={download}>Экспорт JSON</button><button className="button" onClick={()=>setHistoryVisible(true)}>История версий</button></section>}
      <div className="projects-header__actions"><button className="button" onClick={()=>{importMode.current="new";fileInput.current?.click();}}>Открыть JSON</button></div>
      {bootError?<main className="base-page"><h1>Не удалось загрузить список проектов</h1><p role="alert">{bootError}</p><button className="button" onClick={()=>window.location.reload()}>Повторить загрузку</button></main>:<ProjectsPage user={account} projects={projects} onBack={()=>setSidebar(true)} onOpen={openStoredProject} onCreate={()=>void newAlgorithmProject()} onDelete={deleteProject} onLogout={logout}/>}
      {projectCreationError && <p role="alert">{projectCreationError}</p>}
      {nextPage!==null&&<button onClick={()=>void projectApi<{projects:StoredProject[];next:number|null}>("?offset="+nextPage).then(page=>{setProjects(old=>[...old,...page.projects.filter(p=>!old.some(item=>item.id===p.id))]);setNextPage(page.next);}).catch(e=>window.alert(e.message))}>Загрузить ещё</button>}
    </>;
  };
  return <AppNavigation account={account} view={view} open={sidebar} setOpen={setSidebar} buttonRef={menuButton} header={header} navigate={navigateView} navigateAlgorithm={(id,name)=>void openAlgorithmProduct(id,name)} activeAlgorithm={algorithmId} projectCount={projects.length} settings={()=>setSettingsOpen(true)} logout={logout}>
    {accessNotice && <p className="access-note" role="status">{accessNotice}</p>}
    {projectLoadError && view!=="workspace2" && <p className="access-note" role="status">Не удалось открыть проект по ссылке: {projectLoadError}. Выберите сохранённый проект или создайте новый.</p>}
    <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={openFile}/>
    {historyVisible&&activeSession&&<ProjectHistory session={activeSession} onClose={()=>setHistoryVisible(false)} onOpen={openById}/>}
    <Suspense fallback={<main className="beta-loading" role="status">Загружаем инструменты…</main>}>{renderPage()}</Suspense>
    {settingsOpen && <AppSettings theme={theme} onThemeChange={setTheme} profile={colorProfile} onProfileChange={setColorProfile} onClose={closeSettings}/>}
    {opening && <WorkspaceLoading key={opening.attempt} modal title={opening.title} steps={opening.steps} step={opening.step} error={opening.error} retry={opening.retry} close={()=>setOpening(null)}/>}
  </AppNavigation>;
}
