"use client";

import { useState } from "react";
import { compatible, type Edge, type Field, type NodeType } from "../engineering/schema";
import type { Address } from "../engineering/canvas-layout";
import { compileExpression } from "../engineering/expression";
import { productConnectionProblem } from "./product";
import { usesInStation } from "../engineering/uses";
import { deriveTools } from "./product";
import { parameterType } from "./compiler";
import { parameterRepresentations } from "./navigation";
import { DataTree } from "./data-inspector";
import { ValueEditor } from "./value-editor";
import type { Evaluation, ToolDocument, Values } from "./schema";
export const SOURCE_NAMES = {
  user: "Ввод пользователя",
  fixed: "Постоянное",
  computed: "Вычисляется",
  source: "Данные источника"
};
type Props = {
  doc: ToolDocument;
  root: string;
  at: Address;
  type: NodeType;
  result: Evaluation | null;
  values: Values;
  defaults: Values;
  change: (doc: ToolDocument) => void;
  go: (address: Address, root?: string) => void;
};
export function ParameterProperties({
  doc,
  root,
  at,
  type,
  result,
  values,
  defaults,
  change,
  go
}: Props) {
  const p = type.parameter!,
    mode = p.source?.mode ?? "user",
    graph = doc.diagrams.find(g => g.id === at.graph)!,
    node = graph.nodes.find(n => n.id === at.node)!;
  const uses = doc.product ? usesInStation(doc, type.id, root).map(use => ({
      ...use,
      root,
      name: use.name
    })) : deriveTools(doc).flatMap(tool => usesInStation(doc, type.id, tool.diagram).map(use => ({
      ...use,
      root: tool.diagram,
      name: tool.name + " → " + use.name
    }))),
    reps = parameterRepresentations(doc, at, root),
    binding = result?.bindings.find(b => b.node === [...at.path, at.node].join("/"));
  const [error, setError] = useState("");
  function save(next: NodeType) {
    change({
      ...doc,
      types: doc.types.map(t => t.id === next.id ? next : t)
    });
  }
  function metadata(patch: Partial<NonNullable<NodeType["parameter"]>>) {
    const parameter = {
        ...p,
        ...patch
      },
      t = parameterType(type.id, type.name, parameter.field, parameter.permission);
    t.parameter = parameter;
    save(t);
  }
  function update(field: Partial<Field>) {
    metadata({
      field: {
        ...p.field,
        ...field
      }
    });
  }
  function source(next: NonNullable<NonNullable<NodeType["parameter"]>["source"]>) {
    if (next.mode !== mode && uses.length > 1 && !window.confirm("Изменится общее определение для " + uses.map(u => u.name).join(", ") + ". Продолжить?")) return;
    const parameter = {
        ...p,
        source: next
      },
      t = parameterType(type.id, type.name, p.field, p.permission);
    t.parameter = parameter;
    change({
      ...doc,
      types: doc.types.map(v => v.id === t.id ? t : v),
      diagrams: doc.diagrams.map(g => {
        let edges = [...g.edges];
        const nodes = g.nodes.map(n => {
          if (n.type !== type.id) return n;
          const userEdges = g.edges.filter(e => e.to === n.id && ["values", "defaults", "role"].includes(e.input));
          const saved = Array.isArray(n.values.authoringUserLinks) ? n.values.authoringUserLinks as Edge[] : userEdges;
          if (next.mode !== "computed") edges = edges.filter(e => e.to !== n.id || e.input !== "computed");
          if (next.mode !== "user") edges = edges.filter(e => e.to !== n.id || !["values", "defaults", "role"].includes(e.input));else for (const e of saved) if (["values", "defaults", "role"].includes(e.input) && g.nodes.some(n => n.id === e.from) && !edges.some(v => v.to === n.id && v.input === e.input)) edges.push({
            ...e,
            to: n.id
          });
          return {
            ...n,
            values: {
              ...n.values,
              authoringUserLinks: saved
            }
          };
        });
        return {
          ...g,
          nodes,
          edges
        };
      })
    });
  }
  const sourceData = p.source?.registry === "workspace2" ? values : defaults;
  const sourceContract = (key: string) => doc.types.find(t => t.parameter && (key === (t.parameter.defaultKey ?? t.parameter.key) || key.endsWith("." + (t.parameter.defaultKey ?? t.parameter.key))) && compatible({
    ...t.parameter.field,
    direction: "output"
  }, {
    ...p.field,
    direction: "input"
  }))?.parameter?.field;
  const attributes = [...new Set([...Object.keys(sourceData).filter(key => sourceContract(key)), ...(p.source?.attribute ? [p.source.attribute] : [])])];
  const computed = graph.edges.find(e => e.to === node.id && e.input === "computed");
  const candidates = graph.nodes.flatMap(n => n.id === node.id ? [] : (doc.types.find(t => t.id === n.type)?.fields ?? []).filter(f => compatible(f, {
    ...p.field,
    direction: "input"
  })).map(f => ({
    node: n,
    field: f
  })));
  function connectComputed(ref: string) {
    const candidate = candidates.find(c => c.node.id + "/" + c.field.key === ref);
    if (!candidate) return;
    const edge = {
      from: candidate.node.id,
      out: candidate.field.key,
      to: node.id,
      input: "computed"
    };
    const problem = productConnectionProblem(doc, graph, edge);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    change({
      ...doc,
      diagrams: doc.diagrams.map(g => g.id === graph.id ? {
        ...g,
        edges: [...g.edges.filter(e => e.to !== node.id || e.input !== "computed"), edge]
      } : g)
    });
  }
  function computedChange(next: ToolDocument) {
    const changed = next.diagrams.find(g => g.id === graph.id)!;
    const calc = "calc_" + node.id;
    const affected = changed.edges.filter(e => e.to === calc || e.from === calc || e.to === node.id && e.input === "computed");
    for (const edge of affected) {
      const problem = productConnectionProblem(next, changed, edge);
      if (problem) throw Error(problem);
    }
    setError("");
    change(next);
  }
  return <section className="nt-parameter-definition" aria-label="Основные свойства параметра"><h3>Параметр</h3><label>Название<input value={p.field.name} onChange={e => update({
        name: e.target.value
      })} /></label><label>Источник значения<select aria-label="Источник значения" value={mode} onChange={e => source({
        mode: e.target.value as typeof mode,
        ...(e.target.value === "fixed" ? {
          value: binding?.value ?? p.field.initial ?? null
        } : e.target.value === "source" ? {
          registry: "base-values",
          attribute: p.defaultKey ?? p.key
        } : {})
      })}>{Object.entries(SOURCE_NAMES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {mode === "user" && <><ValueEditor field={p.field} value={p.field.initial} label="Начальное значение" change={initial => update({
        initial
      })} /><p className="nt-hint">Приоритет: текущее введённое → сохранённое в проекте → базовое → начальное.</p></>}
    {mode === "fixed" && <ValueEditor field={p.field} value={p.source?.value} label="Постоянное значение" allowEmpty={false} change={value => source({
      mode: "fixed",
      value
    })} />}
    {mode === "source" && <><label>Зарегистрированный источник<select aria-label="Зарегистрированный источник" value={p.source?.registry ?? "base-values"} onChange={e => source({
          ...p.source!,
          registry: e.target.value as "workspace2" | "base-values"
        })}><option value="base-values">Базовые значения проекта</option><option value="workspace2">Входные значения Workspace 2</option></select></label><label>Атрибут источника<input aria-label="Атрибут источника" list="nt-source-attributes" value={p.source?.attribute ?? ""} onChange={e => source({
          ...p.source!,
          attribute: e.target.value
        })} /><datalist id="nt-source-attributes">{attributes.map(key => <option key={key} value={key} label={sourceContract(key) ? sourceContract(key)!.name + " · " + sourceContract(key)!.kind + " " + sourceContract(key)!.unit : key} />)}</datalist></label><small>Выберите атрибут из списка. $.flowRate учитывает основной или второй контур. Тип ожидаемого значения: {p.field.kind} {p.field.unit}.</small></>}
    {mode === "computed" && <><label>Связанный расчётный выход<select aria-label="Связанный расчётный выход" value={computed ? computed.from + "/" + computed.out : ""} onChange={e => connectComputed(e.target.value)}><option value="">Выберите совместимый выход</option>{candidates.map(c => <option key={c.node.id + "/" + c.field.key} value={c.node.id + "/" + c.field.key}>{c.node.name} → {c.field.name}</option>)}</select></label>{computed && <button onClick={() => go({
        ...at,
        node: computed.from
      })}>Раскрыть вычисление</button>}<ExpressionBuilder key={node.id} doc={doc} at={at} field={p.field} change={computedChange} fail={setError} /></>}
    <label>Тип<select value={p.field.kind} onChange={e => update({
        kind: e.target.value as Field["kind"]
      })}>{["float", "int", "boolean", "string", "enum", "object", "array"].map(k => <option key={k}>{k}</option>)}</select></label><label>Единица<input value={p.field.unit} onChange={e => update({
        unit: e.target.value
      })} /></label><label><input type="checkbox" checked={!!p.field.required} onChange={e => update({
        required: e.target.checked
      })} />Обязательный</label>{["float", "int", "number"].includes(p.field.kind) && (["min", "max"] as const).map(k => <label key={k}>{k === "min" ? "Минимум" : "Максимум"}<input type="text" inputMode="decimal" key={String(p.field[k])} defaultValue={p.field[k] ?? ""} onBlur={e => {
        const v = e.target.value.trim();
        if (!v || Number.isFinite(Number(v.replace(",", ".")))) update({
          [k]: v ? Number(v.replace(",", ".")) : undefined
        });else setError("Введите число");
      }} /></label>)}
    <fieldset><legend>Отображение в форме</legend>{reps.length ? reps.map(r => <div key={[...r.address.path, r.address.node].join("/")}><label><input type="checkbox" aria-label="Показывать в форме" checked={r.visible} onChange={e => {
            const target = doc.diagrams.find(g => g.id === r.address.graph)!,
              incoming = target.edges.find(edge => edge.to === r.address.node && edge.input === "visible");
            if (incoming && !window.confirm("Видимость задаётся связью. Заменить условие постоянной видимостью?")) return;
            change({
              ...doc,
              diagrams: doc.diagrams.map(g => g.id === target.id ? {
                ...g,
                edges: g.edges.filter(edge => edge !== incoming),
                nodes: g.nodes.map(n => n.id === r.address.node ? {
                  ...n,
                  values: {
                    ...n.values,
                    visible: e.target.checked
                  }
                } : n)
              } : g)
            });
          }} />Показывать в форме{reps.length > 1 ? " · " + r.label : ""}</label><button onClick={() => go(r.address)}>Свойства поля</button>{r.condition && <button onClick={() => go(r.condition!)}>Условная видимость</button>}</div>) : <small>Представления в форме отсутствуют</small>}</fieldset>
    <h4>Текущее значение</h4><p>{binding?.origin ?? "Нет исполненного результата"} · {binding?.active === false ? "не участвует в активном расчёте" : "участвует в расчёте"}</p><DataTree value={binding?.value} missing={!binding} label={p.field.name} />{result?.issues.filter(i => i.node === binding?.node).map(i => <p role="alert" key={i.key}>{i.message}</p>)}
    <details><summary>Общее определение · использований {uses.length}</summary>{uses.map(u => <p key={u.root + u.path.join("/") + u.node}><button onClick={() => go({
          graph: u.diagram,
          path: u.path,
          node: u.node
        }, u.root)}>{u.name}</button> · связей {u.links}</p>)}<small>Изменение режима, типа и начальных значений затрагивает все эти экземпляры. Их пользовательские значения хранятся отдельно.</small></details>
    <details><summary>Расширенные свойства параметра</summary><p>Устойчивый ключ · {p.key}</p><p>Техническое значение · {JSON.stringify(binding?.value)}</p><label>Инженерный смысл<input value={p.field.meaning} onChange={e => update({
          meaning: e.target.value
        })} /></label><label>Права пользовательского ввода<select value={p.permission} onChange={e => metadata({
          permission: e.target.value as "input" | "options" | "all"
        })}><option value="input">Все пользователи</option><option value="options">Plus, pro, admin</option><option value="all">Pro, admin</option></select></label>{p.field.kind === "enum" && <label>Варианты: значение = название<textarea defaultValue={p.field.options?.map(k => k + " = " + (p.field.optionNames?.[k] ?? k)).join("\n")} onBlur={e => {
          const rows = e.target.value.split("\n").map(row => row.split("=").map(s => s.trim())).filter(row => row[0]);
          update({
            options: rows.map(r => r[0]),
            optionNames: Object.fromEntries(rows.map(r => [r[0], r[1] || r[0]]))
          });
        }} /></label>}<DataTree value={p} label="Контракт параметра" /></details>{error && <p role="alert">{error}</p>}
  </section>;
}
function ExpressionBuilder({
  doc,
  at,
  field,
  change,
  fail
}: {
  doc: ToolDocument;
  at: Address;
  field: Field;
  change: (doc: ToolDocument) => void;
  fail: (error: string) => void;
}) {
  const graph = doc.diagrams.find(g => g.id === at.graph)!,
    id = "calc_" + at.node,
    typeId = graph.id + "." + id,
    existing = doc.types.find(t => t.id === typeId);
  const [expression, setExpression] = useState(existing?.formulas.value ?? JSON.stringify(field.initial ?? (["float", "int", "number"].includes(field.kind) ? 0 : field.kind === "boolean" ? false : null))),
    [inputs, setInputs] = useState<{
      name: string;
      ref: string;
    }[]>(() => existing?.fields.filter(f => f.direction === "input").map(f => {
      const e = graph.edges.find(e => e.to === id && e.input === f.key);
      return {
        name: f.key,
        ref: e ? e.from + "/" + e.out : ""
      };
    }) ?? []);
  const options = graph.nodes.filter(n => n.id !== at.node && n.id !== id).flatMap(n => (doc.types.find(t => t.id === n.type)?.fields ?? []).filter(f => f.direction !== "input").map(f => ({
    ref: n.id + "/" + f.key,
    n,
    f
  })));
  return <details><summary>Безопасное выражение</summary><label>Выражение<input aria-label="Выражение" value={expression} onChange={e => setExpression(e.target.value)} /></label><small>Арифметика, if, min, max, get. Имена входов объявляются ниже.</small>{inputs.map((v, i) => <div className="nt-expression-input" key={i}><input aria-label={"Имя входа " + (i + 1)} value={v.name} onChange={e => setInputs(rows => rows.map((r, j) => i === j ? {
        ...r,
        name: e.target.value
      } : r))} /><select aria-label={"Источник входа " + (i + 1)} value={v.ref} onChange={e => setInputs(rows => rows.map((r, j) => i === j ? {
        ...r,
        ref: e.target.value
      } : r))}><option value="">Выход…</option>{options.map(o => <option key={o.ref} value={o.ref}>{o.n.name} → {o.f.name}</option>)}</select><button onClick={() => setInputs(rows => rows.filter((_, j) => j !== i))}>×</button></div>)}<button onClick={() => setInputs(rows => [...rows, {
      name: "v" + (rows.length + 1),
      ref: ""
    }])}>Добавить вход</button><button onClick={() => {
      try {
        if (new Set(inputs.map(i => i.name)).size !== inputs.length || inputs.some(i => !/^[_a-zA-Z]\w*$/.test(i.name))) throw Error("Задайте уникальные имена входов латиницей");
        compileExpression(expression, new Set(inputs.map(i => i.name)));
        const prior = graph.nodes.find(n => n.id === id);
        if (prior && prior.values.parameterCalculation !== at.node || existing && !prior) throw Error("Имя внутреннего вычисления уже занято. Переименуйте конфликтующую ноду или тип перед созданием выражения.");
        const selected = inputs.map(i => {
          const o = options.find(o => o.ref === i.ref);
          if (!o) throw Error("Выберите источник каждого входа");
          return {
            ...o,
            key: i.name
          };
        });
        const t: NodeType = {
          id: typeId,
          name: "Вычисление · " + field.name,
          description: "Выражение с объявленными типизированными входами",
          category: "Функции",
          fields: [...selected.map(o => ({
            ...o.f,
            key: o.key,
            direction: "input" as const,
            required: false
          })), {
            ...field,
            key: "value",
            direction: "output",
            required: false
          }],
          formulas: {
            value: expression
          }
        };
        change({
          ...doc,
          types: [...doc.types.filter(t => t.id !== typeId), t],
          diagrams: doc.diagrams.map(g => g.id === graph.id ? {
            ...g,
            nodes: [...g.nodes.filter(n => n.id !== id), {
              id,
              type: typeId,
              name: t.name,
              x: (graph.nodes.find(n => n.id === at.node)?.x ?? 0) - 330,
              y: (graph.nodes.find(n => n.id === at.node)?.y ?? 0) + 180,
              values: {
                parameterCalculation: at.node
              }
            }],
            edges: [...g.edges.filter(e => e.to !== id && (e.to !== at.node || e.input !== "computed")), ...selected.map(o => ({
              from: o.n.id,
              out: o.f.key,
              to: id,
              input: o.key
            })), {
              from: id,
              out: "value",
              to: at.node,
              input: "computed"
            }]
          } : g)
        });
        fail("");
      } catch (e) {
        fail((e as Error).message);
      }
    }}>Применить выражение</button></details>;
}
