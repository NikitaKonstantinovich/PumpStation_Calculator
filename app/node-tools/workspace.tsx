"use client";
import { sharedToolRequest } from "../shared-tool-request";

import { useEffect, useRef, useState, useMemo } from "react";
import { DEFAULT_ALGORITHM } from "./algorithm-schema";
import { useAppNavigationGuard } from "../app-navigation";
import { ToolForm } from "./form";
import { DataTree } from "./data-inspector";
import { applyParameterWrites } from "./form-actions";
import { evaluatePlan, migrateValues, OPERATIONS } from "./runtime";
import { missingRuntimeOperations, NODE_RUNTIME_HEADER, NODE_RUNTIME_UPDATE_MESSAGE } from "./runtime-compatibility";
import { migrateProduct, productContexts, invalidateInactiveSelections } from "./product-state";
import { diagnosticKey, type SavedTool, type ToolContext, type ToolProgram, type Values, type WorkspaceData } from "./schema";
import type { UserRole } from "../user-types";
import type { ProjectConfig, SettingsEntity } from "../project-config";
import { ProductIdentityContext } from "./geometry-view";
import { ProductWindows } from "./product-windows";
import {ProductRibbon,type WindowRibbonActions} from "./product-ribbon";
import { ParameterDraftProvider, usePendingParameterDrafts } from "./parameter-drafts-context";
import { CalculationToggle } from "../pressure-check-toggle";
import { controlInfo, productEvaluator, toolAvailable, workspaceControls, writeControl } from "./workspace-controls";
import type { Evaluation, View } from "./schema";
import "./tools.css";
import "./product-workspace.css";
const hasGeometryView = (view?: View): boolean => view?.kind === "station-geometry" || !!view?.children?.some(hasGeometryView);
function ToolResult({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Результат инструмента</summary>{open && <DataTree value={value} label="Вычисленные данные" />}</details>;
}
export async function loadTools(version?: string, base?: Record<string, string>, sources?: Record<string, string>, algorithmId = DEFAULT_ALGORITHM, editor = false) {
  const query = new URLSearchParams();
  query.set("partial", "1");
  query.set("algorithm",algorithmId);
  if(editor) query.set("editor","1");
  if (version) query.set("version", version);
  if (base) query.set("base", JSON.stringify(base));
  if (sources) query.set("sources", JSON.stringify(sources));
  const response = await sharedToolRequest("/api/workspace2?" + query, {
      cache: "no-store",
      headers: { [NODE_RUNTIME_HEADER]: OPERATIONS.join(",") }
    }),
    body = await response.json();
  if (!response.ok) throw Error(body.error ?? "Не удалось загрузить инструменты");
  if (missingRuntimeOperations(body.program, OPERATIONS).length) throw Error(NODE_RUNTIME_UPDATE_MESSAGE);
  return body as {
    program: ToolProgram;
    algorithm: {id:string;name:string};
    defaults: Values;
    baseVersions: Record<string, string>;
    role: UserRole;
    resources?: ToolContext["resources"];
    sourceVersions: Record<string, string>;
    sourceErrors?: Record<string, string>;
  };
}
function RuntimeTool({
  toolId,
  algorithmId,
  initial,
  applyProduct,
  save
}: {
  toolId: string;
  algorithmId: string;
  initial?: SavedTool;
  applyProduct: (data: Awaited<ReturnType<typeof loadTools>>) => void;
  save: (data: SavedTool) => void;
}) {
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof loadTools>> | null>(null),
    [values, setValues] = useState<Values>(initial?.values ?? {}),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [seenValues,setSeenValues]=useState(initial?.values);
  if(seenValues!==initial?.values){setSeenValues(initial?.values);setValues(initial?.values??{});}
  const alive = useRef(true);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial?.values ?? {}) || !!remote && (remote.program.version !== initial?.version || JSON.stringify(remote.baseVersions) !== JSON.stringify(initial?.baseVersions));
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    alive.current = true;
    loadTools(initial?.version, initial?.baseVersions,initial?.sourceVersions,algorithmId).then(data => {
      if (alive.current) setRemote(data);
    }).catch(e => {
      if (alive.current) setError(e.message);
    });
    return () => {
      alive.current = false;
    };
  }, [initial?.version, initial?.baseVersions,initial?.sourceVersions,algorithmId]);
  if (!remote) return <p role="status">{error || "Загружаем определение инструмента…"}</p>;
  const plan = remote.program.plans[toolId];
  if (!plan) return <p>Инструмент отсутствует в этой версии.</p>;
  let result;
  try {
    result = evaluatePlan(plan, {
      values,
      stored: initial?.values,
      defaults: remote.defaults,
      role: remote.role
    });
  } catch (e) {
    return <p role="alert">{(e as Error).message}</p>;
  }
  const persist = () => {
    if (result.issues.length) {
      setError("Проверьте обязательные поля перед сохранением");
      return;
    }
    save({
      ...initial,
      version: remote.program.version,
      values,
      baseVersions: remote.baseVersions,
      sourceVersions: remote.sourceVersions
    });
    setMessage("Изменения переданы в сохранение проекта");
    setError("");
  };
  const changeValues=(next:Values)=>{setValues(next);save({...initial,version:remote.program.version,values:next,baseVersions:remote.baseVersions,sourceVersions:remote.sourceVersions});setMessage("");};
  return <article className="nt-tool"><header><strong>{remote.program.tools.find(t => t.id === toolId)?.name}</strong><small>Версия {remote.program.version}</small><button onClick={async () => {
        try {
          const next = await loadTools(undefined,initial?.baseVersions,initial?.sourceVersions,algorithmId);
          if (next.program.product) {
            applyProduct(next);
            return;
          }
          if (!next.program.plans[toolId]) throw Error("Инструмент отсутствует в актуальной публикации");
          const migrated = migrateValues(next.program.plans[toolId], {
            values,
            defaults: next.defaults,
            role: next.role
          });
          setRemote(next);
          setValues(migrated.values);
          setMessage(migrated.messages.join(" · ") || "Актуальная версия применена к форме. Сохраните значения.");
        } catch (e) {
          setError((e as Error).message);
        }
      }}>Применить актуальную версию</button></header>
    <ToolForm key={remote.program.version} showTitle={false} view={result.view} issues={result.issues} change={(key, value, clearKeys = []) => {
      changeValues({
        ...values,
        ...Object.fromEntries(clearKeys.map(key => [key, null])),
        [key]: value
      });
      setMessage("");
    }} writes={writes => {
      try { changeValues(applyParameterWrites({[toolId]: values}, result.bindings, writes, toolId)[toolId]); }
      catch (e) { setError((e as Error).message); }
    }} save={persist} />
    {!!result.issues.length && <p role="status">Проверок с ошибками · {result.issues.length}</p>}
    {dirty && <small>Есть несохранённые значения</small>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <ToolResult value={result.value} />
  </article>;
}
type Loaded = Awaited<ReturnType<typeof loadTools>>;
function ProductTool({
  toolId,
  data,
  remote,
  initial,
  change,
  save,
  evaluate
}: {
  toolId: string;
  evaluate: (id:string)=>Evaluation;
  data: WorkspaceData;
  remote: Loaded;
  initial?: WorkspaceData;
  change: (data: WorkspaceData) => void;
  save: () => void;
}) {
  const result = useMemo(() => {
    try {
      return {
        value: evaluate(toolId),
        error: ""
      };
    } catch (e) {
      return {
        value: null,
        error: (e as Error).message
      };
    }
  }, [evaluate, toolId]);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(data) !== JSON.stringify(initial ?? {
    schema: 1,
    tools: {}
  });
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  if (!result.value) return <p role="alert">{result.error}</p>;
  const value = result.value,
    errors = value.issues.filter(i => i.severity === "error");
  const feedback = <>{dirty && <small>Есть несохранённые изменения продукта</small>}{message && <p role="status">{message}</p>}{value.issues.map(i => <p key={diagnosticKey(i)} role={i.severity === "error" ? "alert" : "status"}>{i.message}</p>)}<ToolResult value={value.value} /></>;
  return <article className="nt-tool"><header><strong>{remote.program.tools.find(t => t.id === toolId)?.name}</strong><small>Единый граф · {remote.program.version}</small></header><ToolForm showTitle={false} view={value.view} issues={value.issues} change={(key, next, clearKeys = []) => {
      const old = data.tools[toolId];
      change({
        ...data,
        tools: {
          ...data.tools,
          [toolId]: {
            ...old,
            values: {
              ...old.values,
              ...Object.fromEntries(clearKeys.map(key => [key, null])),
              [key]: next
            }
          }
        }
      });
      setMessage("");
    }} writes={writes => {
      try {
        const next = applyParameterWrites(Object.fromEntries(Object.entries(data.tools).map(([id, tool]) => [id, tool.values])), value.bindings, writes, toolId);
        change({ ...data, tools: Object.fromEntries(Object.entries(data.tools).map(([id, tool]) => [id, next[id] === tool.values ? tool : {...tool, values:next[id]}])) });
        setMessage("");
      } catch (e) { setMessage((e as Error).message); }
    }} save={() => {
      if (errors.length) {
        setMessage("Проверьте исходные данные и зависимости");
        return;
      }
      save();
      setMessage("Изменения переданы в сохранение проекта");
    }} />{hasGeometryView(value.view) ? <details className="nt-geometry-feedback"><summary>Данные инструмента · замечаний: {value.issues.length}{message ? " · " + message : ""}</summary>{feedback}</details> : feedback}</article>;
}
function NodeWorkspaceContent({
  project,
  update,
  back,
  status,
  algorithmId = DEFAULT_ALGORITHM,
  name = "Насосная установка",
  userId,
  flush,
  projectActions,
  detach,
  pendingSave = false
}: {
  project: ProjectConfig;
  update: (data: WorkspaceData) => void;
  back: () => void;
  status: string;
  algorithmId?: string;
  name?: string;
  pendingSave?: boolean;
  userId: string;
  flush: () => void;
  projectActions?: React.ReactNode;
  detach: (panelId:string)=>void;
}) {
  const [working, setWorking] = useState<WorkspaceData>(() => project.workspace2 ?? {
      schema: 1,
      tools: {}
    }),
    [seen, setSeen] = useState(project.workspace2);
  if (seen !== project.workspace2) {
    setSeen(project.workspace2);
    setWorking(project.workspace2 ?? {
      schema: 1,
      tools: {}
    });
  }
  const [loaded, setRemote] = useState<Loaded | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [catalogUpdatePrompt, setCatalogUpdatePrompt] = useState(false),
    [updatingCatalog, setUpdatingCatalog] = useState(false);
  const pendingInput=usePendingParameterDrafts();
  const dirty = pendingInput || JSON.stringify(working) !== JSON.stringify(project.workspace2 ?? {schema:1,tools:{}});
  useAppNavigationGuard(dirty || pendingSave,"Есть несохранённые данные продукта. Сохраните их или подтвердите переход без сохранения.");
  useEffect(()=>{if(!dirty && !pendingSave)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty,pendingSave]);
  const legacyFirst = Object.values(working.tools)[0],
    version = working.product?.version ?? legacyFirst?.version,
    base = JSON.stringify(working.product?.baseVersions ?? legacyFirst?.baseVersions),
    sources = JSON.stringify(working.product?.sourceVersions ?? legacyFirst?.sourceVersions);
  const remote=loaded&&(!working.product||loaded.program.version===working.product.version&&JSON.stringify(loaded.baseVersions)===JSON.stringify(working.product.baseVersions)&&JSON.stringify(loaded.sourceVersions??{})===JSON.stringify(working.product.sourceVersions??{}))?loaded:null;
  useEffect(() => {
    let live = true;
    loadTools(version, base ? JSON.parse(base) : undefined, sources ? JSON.parse(sources) : undefined,algorithmId).then(data => {
      if (live) {
        setRemote(data);
        setError("");

      }
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [version, base, sources, project.project.id, algorithmId]);
  function apply(next: Loaded) {
    if(pendingInput)throw Error("Завершите ввод в поле перед применением версии или каталога. Набранный текст сохранён в окнах этого проекта.");
    if (next.sourceErrors && Object.keys(next.sourceErrors).length) throw Error("Версия не применена: " + Object.values(next.sourceErrors).join("; "));
    if (!next.program.product) {
      setRemote(next);
      return;
    }
    const oldSettings=project.entities["station-settings"] as SettingsEntity;
    const migrated = migrateProduct(next.program, working, next.defaults, next.baseVersions, next.role, next.resources, next.sourceVersions ?? {}, {geometry:oldSettings?.geometryEnabled,pressure:oldSettings?.pressureChecksEnabled});
    setWorking(migrated.data);
    update(migrated.data);
    setRemote(next);

    setMessage(migrated.messages.join(" · ") || "Применена согласованная версия продукта. Изменения переданы в сохранение проекта.");
    setError("");
  }
  const tools = remote?.program.tools.filter(t => t.enabled !== false) ?? [];
  const contexts = useMemo(()=>remote ? productContexts(remote.program,working,remote.defaults,remote.role,remote.resources) : {},[remote,working]);
  const evaluate = useMemo(()=>remote ? productEvaluator(remote.program,contexts) : ()=>{throw Error("Загружаем граф");},[remote,contexts]);
  const controls = useMemo(()=>{
    try { return {items:remote&&working.product?workspaceControls(remote.program,evaluate):[],error:""}; }
    catch(e) { return {items:[],error:(e as Error).message}; }
  },[remote,working.product,evaluate]);
  const options = useMemo(()=>remote ? remote.program.tools.filter(t=>t.enabled!==false).map(t=>{
    let available=true;
    try { available=toolAvailable(remote.program,t.id,contexts); } catch { /* Input errors belong in the tool, not the menu. */ }
    return {id:t.id,name:t.name,category:t.category,disabled:!available,reason:available?undefined:"контур не используется"};
  }) : [],[remote,contexts]);
  function changeData(next:WorkspaceData) {
    if(!remote)return;
    const checked=invalidateInactiveSelections(remote.program,next,remote.defaults,remote.role,remote.resources);
    setWorking(checked);
    update(checked);
    setMessage("");
  }
  const [disabled,setDisabled] = useState(false);
  useEffect(()=>{
    let live=true;
    const check=async()=>{try{const response=await fetch("/api/algorithms",{cache:"no-store"});if(!response.ok)return;const data=await response.json();if(live)setDisabled(!data.algorithms.some((a:{id:string})=>a.id===algorithmId));}catch{/* Preserve input during a temporary outage. */}};
    void check();const timer=window.setInterval(()=>void check(),10000);window.addEventListener("algorithms-changed",check);window.addEventListener("focus",check);
    return()=>{live=false;window.clearInterval(timer);window.removeEventListener("algorithms-changed",check);window.removeEventListener("focus",check);};
  },[algorithmId]);
  if(disabled)return <main className="nt-workspace"><h1>{loaded?.algorithm.name ?? name}</h1><p>Продукт отключён администратором. Введённые данные остаются в этой вкладке.</p><button onClick={()=>update(working)}>Сохранить введённые данные</button><button onClick={()=>{const blob=new Blob([JSON.stringify({...project,workspace2:working},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="project.json";link.click();URL.revokeObjectURL(url);}}>Скачать проект</button><button onClick={back}>В рабочее пространство</button><p>{status}</p></main>;
  const archived = Object.keys(working.tools).filter(id => !tools.some(t => t.id === id));
  const ribbon=(windows?:WindowRibbonActions)=><ProductRibbon storageKey={"product-ribbon/1/"+[userId,algorithmId].map(encodeURIComponent).join("/")} name={loaded?.algorithm.name??name} windows={windows}
    project={<>
      <div className="tool-group tool-group--labeled"><button aria-label="Сохранить проект" onClick={()=>{if(pendingInput){setError("Завершите ввод в поле перед сохранением. Текст сохраняется при переключении окон.");return;}update(working);flush();}}><b>▣</b><small>Сохранить</small></button></div>
      <span className="ribbon__divider"/>
      <div className="tool-group tool-group--labeled" onClickCapture={event=>{if(pendingInput && (event.target as HTMLElement).closest("button")){event.preventDefault();event.stopPropagation();setError("Завершите ввод в поле перед сменой проекта. Набранный текст сохранён в окнах этого проекта.");}}}>{projectActions}</div>
      <span className="nt-ribbon-save" role="status">{pendingInput?"Есть незавершённый ввод":dirty?"Есть несохранённые изменения":status}</span>
    </>}
    calculation={<>
{controls.items.map(control=><CalculationToggle key={control.kind} label={controlInfo[control.kind].label} hint={controlInfo[control.kind].hint} enabled={control.binding.value===true} disabled={!control.binding.editable||!control.binding.active} onChange={enabled=>{try{changeData(writeControl(working,control,enabled));}catch(e){setError((e as Error).message);}}}/>)}
    <details className="nt-workspace-menu"><summary>Действия продукта</summary><div><button onClick={async () => {
        try { apply(await loadTools(undefined,base ? JSON.parse(base) : undefined,sources ? JSON.parse(sources) : undefined,algorithmId)); }
        catch (e) { setError((e as Error).message); }
      }} disabled={updatingCatalog}>Применить актуальную версию продукта</button>{remote?.sourceVersions.pump_catalog_v2 && <button disabled={updatingCatalog} onClick={()=>setCatalogUpdatePrompt(true)}>Обновить каталог насосов</button>}{working.product && <small>Закреплена версия · {working.product.version}</small>}<button onClick={()=>{if(pendingInput){setError("Завершите ввод в поле перед выходом из продукта.");return;}back();}}>Первое рабочее пространство</button>
      {!!archived.length && <details><summary>Архив инструментов · {archived.length}</summary>{archived.map(id=><p key={id}>{id} · данные сохранены</p>)}</details>}
    </div></details>
    {controls.items.filter(c=>c.binding.value!==true).map(c=><small role="status" key={c.kind}>{c.kind==="geometry"?"Расчёт геометрии отключён":"Проверки давления отключены"}</small>)}
    </>}/>;
  const notices=<>
  {controls.error && <p role="alert">{controls.error}</p>}
  {catalogUpdatePrompt && <div className="nt-catalog-shade"><section className="nt-catalog-dialog" role="dialog" aria-modal="true" aria-label="Обновление каталога насосов"><h2>Обновить каталог насосов?</h2><p>В проект будет загружен актуальный снимок с габаритами, характеристиками и ценами. Выбранные насосы потребуется повторно подтвердить. Настройки проекта, версия алгоритма и остальные справочники сохранятся.</p><footer><button disabled={updatingCatalog} onClick={async()=>{
    setUpdatingCatalog(true);
    try {
      const nextSources={...(working.product?.sourceVersions ?? legacyFirst?.sourceVersions ?? {})};delete nextSources.pump_catalog_v2;
      apply(await loadTools(version,base ? JSON.parse(base) : undefined,nextSources,algorithmId));
      setCatalogUpdatePrompt(false);
    } catch(e){setError((e as Error).message);} finally{setUpdatingCatalog(false);}
  }}>{updatingCatalog ? "Загрузка каталога…" : "Обновить каталог"}</button><button disabled={updatingCatalog} onClick={()=>setCatalogUpdatePrompt(false)}>Отмена</button></footer>{error && <p role="alert">{error}</p>}</section></div>}
  {error && <p role="alert">{error}{error===NODE_RUNTIME_UPDATE_MESSAGE && <button onClick={()=>window.location.reload()}>Обновить страницу</button>}</p>}{remote?.sourceErrors && <p role="alert">Ошибка источника: {Object.values(remote.sourceErrors).join("; ")}. Зависимые инструменты недоступны до восстановления источника; закреплённый снимок не заменяется.</p>}{message && <p role="status">{message}</p>}{!remote && !error && <p>Загружаем инструменты…</p>}
  {remote && !tools.length && <p className="al-empty">В этом продукте пока нет инструментов. Администратор может добавить их в нодовом редакторе.</p>}
  </>;
  return <main className="nt-workspace nt-product-workspace"><h1 className="visually-hidden">{loaded?.algorithm.name??name}</h1>{remote && tools.length>0 ? <ProductIdentityContext.Provider value={project.project}><ProductWindows renderToolbar={ribbon} notices={notices} detach={id=>{if(pendingInput){setError("Завершите ввод в поле перед открытием отдельной вкладки.");return;}detach(id);}} key={userId+"/"+algorithmId+"/"+project.project.id} userId={userId} algorithmId={algorithmId} projectId={project.project.id} tools={options} renderTool={toolId=>working.product ? <ProductTool toolId={toolId} data={working} remote={remote} initial={project.workspace2} change={changeData} save={()=>{update(working);flush();}} evaluate={evaluate}/> : remote.program.product ? <p>В меню «Действия продукта» нажмите «Применить актуальную версию продукта». Предыдущие значения сохранятся.</p> : <RuntimeTool key={project.project.id+"/"+toolId} algorithmId={algorithmId} toolId={toolId} initial={working.tools[toolId]} applyProduct={apply} save={data=>changeData({...working,algorithmId,tools:{...working.tools,[toolId]:data}})}/>}/></ProductIdentityContext.Provider> : <>{ribbon()}{notices}</>}</main>;
}
export function NodeWorkspace(props:Parameters<typeof NodeWorkspaceContent>[0]) {
  return <ParameterDraftProvider key={props.userId+"/"+props.algorithmId+"/"+props.project.project.id}><NodeWorkspaceContent {...props}/></ParameterDraftProvider>;
}
