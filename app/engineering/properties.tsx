"use client";

import { useState } from "react";
import { accepts, display, type Diagram, type Edge, type GraphNode, type NodeType } from "./schema";
import type { Trace } from "./engine";
export function Properties({
  taskMode=false,extra,graph,
  node,
  type,
  trace,
  source,
  update,
  edit,
  send,
  go,
  unlink,
  test,
  pick,
  group
}: {
  taskMode?: boolean;
  extra: import("react").ReactNode;
  graph: Diagram;
  node: GraphNode;
  type: NodeType;
  trace: Trace;
  source?: string;
  update: (patch: Partial<GraphNode>) => void;
  edit: () => void;
  send: (key: string) => void;
  go: (id: string) => void;
  unlink: (e: Edge) => void;
  test: () => void;
  pick: () => void;
  group: () => void;
}) {
  const [tab, setTab] = useState("Объект"),
    [error, setError] = useState("");
  const [advanced,setAdvanced]=useState(false);
  const locked = !!type.native || type.id.startsWith("args.") || type.id.startsWith("return.");
  const links = graph.edges.filter(e => e.from === node.id || e.to === node.id),
    record = trace[node.id];
  return <aside className="gn-props"><h2>Свойства</h2><strong>{node.name}</strong>{extra}{taskMode&&<button onClick={()=>setAdvanced(!advanced)}>Расширенные свойства ноды</button>}{(!taskMode||advanced)&&<><nav>{["Объект", "Атрибуты", "Функции и скрипты", "Связи и результат"].map(k => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k}</button>)}</nav>
    {tab === "Объект" && <><label>Имя экземпляра<input key={node.id + node.name} defaultValue={node.name} onBlur={e => {
          if (e.target.value.trim() && e.target.value !== node.name) update({
            name: e.target.value.trim()
          });
        }} /></label><p>{type.category} · {type.name}</p><p>{type.description}</p><small>{node.id}</small>{node.catalog && <p>Запись каталога · {node.catalog.name} <small>{node.catalog.id}</small></p>}
      {type.id.startsWith("equipment.") && <button onClick={pick}>Выбрать запись каталога</button>}{!locked && <button onClick={edit}>Изменить определение типа</button>}<button onClick={group}>Назначить группу</button></>}
    {tab === "Атрибуты" && type.fields.map(f => {
      const incoming = graph.edges.find(e => e.to === node.id && e.input === f.key),
        v = record ? Object.hasOwn(record.outputs, f.key) ? record.outputs[f.key] : record.inputs[f.key] : Object.hasOwn(node.values, f.key) ? node.values[f.key] : f.initial;
      return <details key={node.id + f.key}><summary>{f.name} <small>{display(v)}</small></summary><p>{f.key} · {f.kind} · {f.meaning} {f.unit} · {f.required ? "обязательный" : "необязательный"}</p>{(f.min != null || f.max != null) && <p>Диапазон · {f.min ?? "−∞"} … {f.max ?? "+∞"}</p>}{f.options && <p>{f.options.join(", ")}</p>}<p>По умолчанию · {display(f.initial)}</p><p>Источник · {record?.sources[f.key] ?? (incoming ? incoming.from + "." + incoming.out : Object.hasOwn(node.values, f.key) ? node.catalog && !node.catalog.overridden.includes(f.key) ? "Каталог · " + node.catalog.name : "Введено инженером" : "По умолчанию")}</p>
        {!incoming && (!type.native || f.direction !== "output") && !Object.hasOwn(type.formulas, f.key) && <label>Значение экземпляра (JSON)<textarea key={JSON.stringify(node.values[f.key])} defaultValue={JSON.stringify(node.values[f.key]) ?? ""} onBlur={e => {
            try {
              const value = e.target.value ? JSON.parse(e.target.value) : undefined;
              if (value != null && !accepts(f, value)) throw Error("Неверный тип или диапазон");
              if (JSON.stringify(value) !== JSON.stringify(node.values[f.key])) update({
                values: {
                  ...node.values,
                  [f.key]: value
                },
                catalog: node.catalog ? {
                  ...node.catalog,
                  overridden: [...new Set([...node.catalog.overridden, f.key])]
                } : undefined
              });
              setError("");
            } catch (err) {
              setError(f.name + " · " + (err as Error).message);
            }
          }} /></label>}{f.direction !== "input" && <button onClick={() => send(f.key)}>Передать атрибут…</button>}</details>;
    })}
    {tab === "Функции и скрипты" && <><p>{type.description}</p><p>Входы · {type.fields.filter(f => f.direction !== "output").map(f => f.key).join(", ") || "—"}</p><p>Выходы · {type.fields.filter(f => f.direction !== "input").map(f => f.key).join(", ") || "—"}</p>{source && <details open><summary>Встроенная операция · {type.native}</summary><pre>{source}</pre></details>}{Object.entries(type.formulas).map(([k, v]) => <pre key={k}>{k + " = " + v}</pre>)}{!locked && <button onClick={edit}>Редактировать функции типа</button>}<button onClick={test}>Тестовый запуск</button><details><summary>Язык формул</summary><p>Имена входов, числа, строки в двойных кавычках, true, false, null. Арифметика + − * / %, сравнения, ??, &&, ||. Функции if, min, max, abs, round, sqrt, len, get и set. Пример: mass * count.</p></details></>}
    {tab === "Связи и результат" && <>{links.map(e => <div className="gn-link-row" key={e.from + e.out + e.to + e.input}><button onClick={() => go(e.from === node.id ? e.to : e.from)}>{e.from}.{e.out} → {e.to}.{e.input}</button><button aria-label="Удалить связь" onClick={() => unlink(e)}>×</button></div>)}{!links.length && <p>Связей пока нет.</p>}<pre>{record ? JSON.stringify(record, null, 2) : "Выполните тестовый запуск"}</pre></>}
    </>}{error && <p role="alert">{error}</p>}
  </aside>;
}
