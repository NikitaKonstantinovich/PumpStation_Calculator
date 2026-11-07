"use client";

import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { ToolForm } from "./form";
import { evaluatePlan, evaluateProduct, migrateValues } from "./runtime";
import { migrateProduct, productContexts } from "./product-state";
import type { CatalogSnapshot } from "./catalog-schema";
import type { SavedTool, ToolProgram, Values, WorkspaceData } from "./schema";
import type { UserRole } from "../user-types";
import type { ProjectConfig } from "../project-config";
import "./tools.css";
export async function loadTools(version?: string, base?: Record<string, string>, sources?: Record<string, string>) {
  const query = new URLSearchParams();
  query.set("partial", "1");
  if (version) query.set("version", version);
  if (base) query.set("base", JSON.stringify(base));
  if (sources) query.set("sources", JSON.stringify(sources));
  const response = await fetch("/api/workspace2?" + query, {
      cache: "no-store"
    }),
    body = await response.json();
  if (!response.ok) throw Error(body.error ?? "Не удалось загрузить инструменты");
  return body as {
    program: ToolProgram;
    defaults: Values;
    baseVersions: Record<string, string>;
    role: UserRole;
    resources?: {
      pump_catalog_v2?: CatalogSnapshot;
    };
    sourceVersions: Record<string, string>;
    sourceErrors?: Record<string, string>;
  };
}
function RuntimeTool({
  toolId,
  initial,
  applyProduct,
  save
}: {
  toolId: string;
  initial?: SavedTool;
  applyProduct: (data: Awaited<ReturnType<typeof loadTools>>) => void;
  save: (data: SavedTool) => void;
}) {
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof loadTools>> | null>(null),
    [values, setValues] = useState<Values>(initial?.values ?? {}),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
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
    loadTools(initial?.version, initial?.baseVersions).then(data => {
      if (alive.current) setRemote(data);
    }).catch(e => {
      if (alive.current) setError(e.message);
    });
    return () => {
      alive.current = false;
    };
  }, [initial?.version, initial?.baseVersions]);
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
      version: remote.program.version,
      values,
      baseVersions: remote.baseVersions
    });
    setMessage("Изменения переданы в сохранение проекта");
    setError("");
  };
  return <article className="nt-tool"><header><strong>{remote.program.tools.find(t => t.id === toolId)?.name}</strong><small>Версия {remote.program.version}</small><button onClick={async () => {
        try {
          const next = await loadTools();
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
    <ToolForm key={remote.program.version} view={result.view} issues={result.issues} change={(key, value) => {
      setValues(v => ({
        ...v,
        [key]: value
      }));
      setMessage("");
    }} save={persist} />
    {!!result.issues.length && <p role="status">Проверок с ошибками · {result.issues.length}</p>}
    {dirty && <small>Есть несохранённые значения</small>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <details><summary>Результат инструмента</summary><pre>{JSON.stringify(result.value, null, 2)}</pre></details>
  </article>;
}
type Loaded = Awaited<ReturnType<typeof loadTools>>;
function ProductTool({
  toolId,
  data,
  remote,
  initial,
  change,
  save
}: {
  toolId: string;
  data: WorkspaceData;
  remote: Loaded;
  initial?: WorkspaceData;
  change: (data: WorkspaceData) => void;
  save: () => void;
}) {
  const result = useMemo(() => {
    try {
      return {
        value: evaluateProduct(remote.program, toolId, productContexts(remote.program, data, remote.defaults, remote.role, remote.resources)),
        error: ""
      };
    } catch (e) {
      return {
        value: null,
        error: (e as Error).message
      };
    }
  }, [remote, toolId, data]);
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
  return <article className="nt-tool"><header><strong>{remote.program.tools.find(t => t.id === toolId)?.name}</strong><small>Единый граф · {remote.program.version}</small></header><ToolForm view={value.view} issues={value.issues} change={(key, next) => {
      const old = data.tools[toolId];
      change({
        ...data,
        tools: {
          ...data.tools,
          [toolId]: {
            ...old,
            values: {
              ...old.values,
              [key]: next
            }
          }
        }
      });
      setMessage("");
    }} save={() => {
      if (errors.length) {
        setMessage("Проверьте исходные данные и зависимости");
        return;
      }
      save();
      setMessage("Изменения переданы в сохранение проекта");
    }} />{dirty && <small>Есть несохранённые изменения продукта</small>}{message && <p role="status">{message}</p>}{value.issues.map(i => <p key={i.node + i.key} role={i.severity === "error" ? "alert" : "status"}>{i.message}</p>)}<details><summary>Результат инструмента</summary><pre>{JSON.stringify(value.value, null, 2)}</pre></details></article>;
}
export function NodeWorkspace({
  project,
  update,
  back,
  openMain,
  navigation,
  status
}: {
  project: ProjectConfig;
  update: (data: WorkspaceData) => void;
  back: () => void;
  openMain: () => void;
  navigation: ReactNode;
  status: string;
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
    [selected, setSelected] = useState("");
  const legacyFirst = Object.values(working.tools)[0],
    version = working.product?.version ?? legacyFirst?.version,
    base = JSON.stringify(working.product?.baseVersions ?? legacyFirst?.baseVersions),
    sources = JSON.stringify(working.product?.sourceVersions ?? legacyFirst?.sourceVersions);
  const remote=loaded&&(!working.product||loaded.program.version===working.product.version&&JSON.stringify(loaded.baseVersions)===JSON.stringify(working.product.baseVersions)&&JSON.stringify(loaded.sourceVersions??{})===JSON.stringify(working.product.sourceVersions??{}))?loaded:null;
  useEffect(() => {
    let live = true;
    loadTools(version, base ? JSON.parse(base) : undefined, sources ? JSON.parse(sources) : undefined).then(data => {
      if (live) {
        setRemote(data);
        setError("");
        setSelected(id => data.program.tools.some(t => t.id === id && t.enabled !== false) ? id : data.program.tools.find(t => t.enabled !== false)?.id ?? "");
      }
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [version, base, sources, project.project.id]);
  function apply(next: Loaded) {
    if (next.sourceErrors && Object.keys(next.sourceErrors).length) throw Error("Версия не применена: " + Object.values(next.sourceErrors).join("; "));
    if (!next.program.product) {
      setRemote(next);
      return;
    }
    const migrated = migrateProduct(next.program, working, next.defaults, next.baseVersions, next.role, next.resources, next.sourceVersions ?? {});
    setWorking(migrated.data);
    setRemote(next);
    setSelected(id => next.program.tools.some(t => t.id === id && t.enabled !== false) ? id : next.program.tools.find(t => t.enabled !== false)?.id ?? "");
    setMessage(migrated.messages.join(" · ") || "Применена согласованная версия продукта. Сохраните значения.");
    setError("");
  }
  const tools = remote?.program.tools.filter(t => t.enabled !== false) ?? [];
  const toolStates = useMemo(() => {
    if (!remote?.program.product || !working.product) return {};
    const contexts = productContexts(remote.program, working, remote.defaults, remote.role, remote.resources);
    return Object.fromEntries(remote.program.tools.filter(t => t.enabled !== false && t.id !== selected).map(t => {
      try {
        const result = evaluateProduct(remote.program, t.id, contexts);
        const stale = remote.program.plans[t.id].steps.filter(s => s.operation === "pump.select").some(s => (result.trace[s.id]?.outputs.selection as {
          stale?: boolean;
        } | undefined)?.stale);
        return [t.id, stale ? "Требует повторной проверки" : result.issues.some(i => i.severity === "error") ? "Ошибка исходных данных" : ""];
      } catch {
        return [t.id, "Не удалось вычислить"];
      }
    }));
  }, [remote, working, selected]);
  const archived = Object.keys(working.tools).filter(id => !tools.some(t => t.id === id));
  return <main className="nt-workspace"><header><button aria-label="Открыть меню" onClick={openMain}>☰</button><h1>Рабочее пространство 2</h1><button onClick={back}>Рабочее пространство</button><span role="status">{status}</span></header>{navigation}<div><button onClick={async () => {
        try {
          apply(await loadTools());
        } catch (e) {
          setError((e as Error).message);
        }
      }}>Применить актуальную версию продукта</button>{working.product && <small>Закреплена единая версия · {working.product.version}</small>}</div>{error && <p role="alert">{error}</p>}{remote?.sourceErrors && <p role="alert">Ошибка источника: {Object.values(remote.sourceErrors).join("; ")}. Зависимые инструменты недоступны до восстановления источника; закреплённый снимок не заменяется.</p>}{message && <p role="status">{message}</p>}{!remote && !error && <p>Загружаем инструменты…</p>}<nav aria-label="Инструменты Workspace 2">{tools.map(t => <span key={t.id}><button aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>{t.name}</button>{toolStates[t.id] && <small role="status"> · {toolStates[t.id]}</small>}</span>)}</nav>
  {remote && selected && (working.product ? <ProductTool key={selected} toolId={selected} data={working} remote={remote} initial={project.workspace2} change={setWorking} save={() => update(working)} /> : remote.program.product ? <p>Для работы с общим графом нажмите «Применить актуальную версию продукта». Предыдущие значения сохранятся.</p> : <RuntimeTool key={project.project.id + "/" + selected} toolId={selected} initial={working.tools[selected]} applyProduct={apply} save={data => {
      const next = {
        ...working,
        tools: {
          ...working.tools,
          [selected]: data
        }
      };
      setWorking(next);
      update(next);
    }} />)}
  {!!archived.length && <details><summary>Архив инструментов · {archived.length}</summary>{archived.map(id => <p key={id}>{id} · версия {working.tools[id].version}. Значения сохранены в проекте и истории.</p>)}</details>}
  </main>;
}
