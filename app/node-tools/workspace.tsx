"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ToolForm } from "./form";
import { evaluatePlan, migrateValues } from "./runtime";
import type { SavedTool, ToolProgram, Values, WorkspaceData } from "./schema";
import type { UserRole } from "../user-types";
import type { ProjectConfig } from "../project-config";
import "./tools.css";
export async function loadTools(version?: string, base?: Record<string, string>) {
  const query = new URLSearchParams();
  if (version) query.set("version", version);
  if (base) query.set("base", JSON.stringify(base));
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
  };
}
function RuntimeTool({
  toolId,
  initial,
  save
}: {
  toolId: string;
  initial?: SavedTool;
  save: (data: SavedTool) => void;
}) {
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof loadTools>> | null>(null),
    [values, setValues] = useState<Values>(initial?.values ?? {}),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial?.values ?? {});
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
  const [list, setList] = useState<ToolProgram | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  useEffect(() => {
    let active = true;
    loadTools().then(r => {
      if (active) {
        setList(r.program);
        setSelected(r.program.tools[0]?.id ?? "");
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, []);
  const known = new Map([...(list?.tools ?? []).map(t => [t.id, t] as const), ...Object.keys(project.workspace2?.tools ?? {}).filter(id => !list?.tools.some(t => t.id === id)).map(id => [id, {
    id,
    name: id
  }] as const)]);
  return <main className="nt-workspace"><header><button aria-label="Открыть меню" onClick={openMain}>☰</button><h1>Рабочее пространство 2</h1><button onClick={back}>Рабочее пространство</button><span role="status">{status}</span></header>{navigation}
    {error && <p role="alert">{error}</p>}{!list && !error && <p>Загружаем опубликованные инструменты…</p>}
    {list && known.size === 0 && <p>Опубликованных инструментов пока нет.</p>}
    <nav aria-label="Инструменты Workspace 2">{[...known.values()].map(t => <button key={t.id} aria-pressed={selected === t.id} onClick={() => setSelected(t.id)}>{t.name}</button>)}</nav>
    {selected && <RuntimeTool key={project.project.id + "/" + selected} toolId={selected} initial={project.workspace2?.tools[selected]} save={data => update({
      schema: 1,
      tools: {
        ...project.workspace2?.tools,
        [selected]: data
      }
    })} />}
  </main>;
}
