"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas, type Focus } from "../engineering/canvas";
import { layout, type Address } from "../engineering/canvas-layout";
import { usesInStation } from "../engineering/uses";
import { Properties } from "../engineering/properties";
import { TypeEditor } from "../engineering/type-editor";
import { GroupDialog } from "../engineering/group-dialog";
import { connectionProblem, type Trace } from "../engineering/engine";
import { compatible, makeField, type Diagram, type Edge, type Field, type GraphNode, type NodeType } from "../engineering/schema";
import { compileTools, parameterType } from "./compiler";
import { evaluatePlan, traceNode } from "./runtime";
import { ToolForm } from "./form";
import { loadTools } from "./workspace";
import { API, ROOT, safeId, type ToolDocument, type ToolTest, type TestResult, type Values } from "./schema";
import type { ProjectConfig } from "../project-config";
import "../engineering/editor.css";
import "./tools.css";
type Remote = {
  revision: number;
  active: string | null;
  draft: ToolDocument;
  versions: {
    id: string;
    created: string;
    author: string;
  }[];
};
class ToolRequestError extends Error {
  constructor(message: string, readonly location?: {
    graph: string;
    node?: string;
  }) {
    super(message);
  }
}
async function request(body?: unknown): Promise<Remote> {
  const response = await fetch(API, body ? {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  } : {
    cache: "no-store"
  });
  const value = await response.json();
  if (!response.ok) throw new ToolRequestError(value.error ?? "Ошибка редактора", value.location);
  return value;
}
const uuid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);
export function ToolEditor({
  project,
  back,
  openMain,
  navigation
}: {
  project: ProjectConfig;
  back: () => void;
  openMain: () => void;
  navigation: ReactNode;
}) {
  const [remote, setRemote] = useState<Remote | null>(null),
    [doc, setDoc] = useState<ToolDocument | null>(null),
    [defaults, setDefaults] = useState<Values>({});
  const [toolId, setToolId] = useState("settings"),
    [at, setAt] = useState<Address>({
      graph: ROOT,
      path: [],
      node: "settings"
    }),
    [focus, setFocus] = useState<Focus | null>(null);
  const [history, setHistory] = useState<ToolDocument[]>([]),
    [error, setError] = useState(""),
    [errorAt, setErrorAt] = useState<{
      graph: string;
      node?: string;
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [props, setProps] = useState(true),
    [preview, setPreview] = useState(true),
    [width, setWidth] = useState(390),
    [values, setValues] = useState<Values>({});
  const [library, setLibrary] = useState(false),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<NodeType | null>(null),
    [pack, setPack] = useState(false);
  const [transfer, setTransfer] = useState<{
      from: string;
      out?: string;
      to?: string;
    } | null>(null),
    [menu, setMenu] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null);
  const [tests, setTests] = useState<TestResult[] | null>(null),
    [testJson, setTestJson] = useState<string | null>(null),
    [versions, setVersions] = useState(false);
  const [newParam, setNewParam] = useState(false),
    [parameter, setParameter] = useState({
      key: "",
      name: "",
      kind: "string",
      unit: "",
      meaning: "text",
      required: false,
      permission: "input",
      options: ""
    });
  const [metadata, setMetadata] = useState(false);
  const tool = doc?.tools.find(t => t.id === toolId),
    root = tool?.diagram ?? ROOT;
  const graph = doc?.diagrams.find(g => g.id === at.graph),
    node = graph?.nodes.find(n => n.id === at.node),
    type = doc?.types.find(t => t.id === node?.type);
  const dirty = !!doc && doc !== remote?.draft;
  function accept(next: Remote) {
    setRemote(next);
    setDoc(next.draft);
    setHistory([]);
  }
  useEffect(() => {
    let live = true;
    Promise.all([request(), loadTools()]).then(([state, data]) => {
      if (live) {
        accept(state);
        setDefaults(data.defaults);
        setToolId(state.draft.tools[0]?.id ?? "");
        setAt({
          graph: state.draft.tools[0]?.diagram ?? ROOT,
          path: [],
          node: "settings"
        });
      }
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, []);
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
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTransfer(null);
        setMenu(null);
        setLibrary(false);
        setEditing(null);
        setNewParam(false);
        setPack(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const trial = useMemo(() => {
    if (!doc || !tool) return {
      result: null,
      error: ""
    };
    try {
      const program = compileTools(doc, "preview");
      return {
        result: evaluatePlan(program.plans[tool.id], {
          values,
          defaults,
          role: "admin"
        }),
        error: ""
      };
    } catch (e) {
      return {
        result: null,
        error: (e as Error).message
      };
    }
  }, [doc, tool, values, defaults]);
  function change(next: ToolDocument) {
    if (busy) return;
    setHistory(h => [...h.slice(-39), doc!]);
    setDoc(next);
    setTests(null);
    setError("");
    setMessage("");
  }
  function updateGraph(next: Diagram) {
    change({
      ...doc!,
      diagrams: doc!.diagrams.map(g => g.id === next.id ? next : g)
    });
  }
  function updateNode(patch: Partial<GraphNode>) {
    if (!graph || !node) return;
    updateGraph({
      ...graph,
      nodes: graph.nodes.map(n => n.id === node.id ? {
        ...n,
        ...patch
      } : n)
    });
  }
  function navigate(target: Address, base = root) {
    setAt(target);
    setFocus({
      ...target,
      base,
      serial: Date.now()
    });
    setMenu(null);
    setTransfer(null);
  }
  function locate(diagram: string, nid: string, path?: string[]) {
    if (!doc) return;
    const route = path ?? layout(doc).locate(diagram, root);
    navigate({
      graph: diagram,
      path: route ?? [],
      node: nid
    }, route ? root : diagram);
  }
  function choose(target: Address) {
    if (transfer?.out && !transfer.to && target.graph === graph?.id) {
      if (targets.has(target.node)) setTransfer({
        ...transfer,
        to: target.node
      });else setError("Выберите совместимый вход");
      return;
    }
    setAt(target);
    setMenu(null);
  }
  const from = graph?.nodes.find(n => n.id === transfer?.from),
    fromType = doc?.types.find(t => t.id === from?.type),
    out = fromType?.fields.find(f => f.key === transfer?.out);
  function inputsFor(n: GraphNode) {
    return doc!.types.find(t => t.id === n.type)!.fields.filter(f => out && compatible(out, f) && !connectionProblem(graph!, doc!.types, {
      from: from!.id,
      out: out.key,
      to: n.id,
      input: f.key
    }));
  }
  const targets = new Set(out && graph ? graph.nodes.filter(n => inputsFor(n).length).map(n => n.id) : []);
  function connect(input: string) {
    if (!transfer?.to || !transfer.out || !graph) return;
    const edge: Edge = {
      from: transfer.from,
      out: transfer.out,
      to: transfer.to,
      input,
      kind: out?.meaning === "parameterBinding" ? "binding" : out?.meaning === "saveCommand" ? "command" : "data"
    };
    const problem = connectionProblem(graph, doc!.types, edge);
    if (problem) {
      setError(problem);
      return;
    }
    const old = graph.edges.find(e => e.to === edge.to && e.input === input);
    if (old && !window.confirm("Заменить источник входа?")) return;
    updateGraph({
      ...graph,
      edges: [...graph.edges.filter(e => e !== old), edge]
    });
    setTransfer(null);
  }
  function unlink(g: Diagram, e: Edge) {
    if (window.confirm("Удалить связь " + e.from + "." + e.out + " → " + e.to + "." + e.input + "?")) updateGraph({
      ...g,
      edges: g.edges.filter(edge => edge !== e)
    });
  }
  function addType(t: NodeType, types = doc!.types) {
    if (!graph) return;
    const n: GraphNode = {
      id: "n_" + uuid(),
      type: t.id,
      name: t.name,
      x: (node?.x ?? 0) + 340,
      y: (node?.y ?? 0) + 150,
      values: {}
    };
    change({
      ...doc!,
      types,
      diagrams: doc!.diagrams.map(g => g.id === graph.id ? {
        ...g,
        nodes: [...g.nodes, n]
      } : g)
    });
    setAt({
      ...at,
      node: n.id
    });
    setLibrary(false);
  }
  function saveType(t: NodeType) {
    if (!doc) return;
    const exists = doc.types.some(type => type.id === t.id),
      types = exists ? doc.types.map(type => type.id === t.id ? t : type) : [...doc.types, t];
    if (exists && t.instrument) {
      const g = doc.diagrams.find(g => g.id === t.instrument)!;
      for (const [nid, dir] of [["source", "input"], ["result", "output"]] as const) {
        const b = g.nodes.find(n => n.id === nid),
          i = types.findIndex(v => v.id === b?.type);
        if (i >= 0) types[i] = {
          ...types[i],
          fields: t.fields.filter(f => f.direction === dir).map(f => ({
            ...f,
            direction: dir === "input" ? "output" : "input"
          }))
        };
      }
    }
    if (exists) change({
      ...doc,
      types
    });else addType(t, types);
    setEditing(null);
  }
  function saveParameter() {
    if (!doc || !graph) return;
    if (!safeId(parameter.key) || !parameter.name.trim()) throw Error("Укажите название и устойчивый ключ");
    const field: Field = {
      key: parameter.key,
      name: parameter.name,
      kind: parameter.kind as Field["kind"],
      meaning: parameter.meaning || parameter.key,
      unit: parameter.unit,
      direction: "input",
      required: parameter.required,
      ...(parameter.kind === "enum" ? {
        options: parameter.options.split(",").map(s => s.trim()).filter(Boolean)
      } : {})
    };
    const t = parameterType("param_" + uuid(), parameter.name, field, parameter.permission as "input"),
      n: GraphNode = {
        id: "p_" + uuid(),
        type: t.id,
        name: t.name,
        x: (node?.x ?? 0) + 350,
        y: (node?.y ?? 0) + 210,
        values: {}
      },
      f: GraphNode = {
        id: "field_" + uuid(),
        type: "ui.field",
        name: parameter.name,
        x: n.x + 350,
        y: n.y,
        values: {}
      };
    const edges: Edge[] = [...graph.edges, {
      from: n.id,
      out: "binding",
      to: f.id,
      input: "binding",
      kind: "binding"
    }];
    for (const [source, input, output] of [["workspace2", "values", "value"], ["base-values", "defaults", "value"], ["workspace2", "role", "role"]]) {
      const src = graph.nodes.find(node => doc.types.find(t => t.id === node.type)?.operation === "source" && node.values.source === source);
      if (src) edges.push({
        from: src.id,
        out: output,
        to: n.id,
        input
      });else {
        const boundary = graph.nodes.find(n => n.id === "source"),
          type = doc.types.find(t => t.id === boundary?.type);
        if (type?.fields.some(f => f.key === input)) edges.push({
          from: "source",
          out: input,
          to: n.id,
          input
        });
      }
    }
    const form = graph.nodes.find(n => doc.types.find(t => t.id === n.type)?.operation === "form");
    if (form) {
      const slot = Array.from({
        length: 64
      }, (_, i) => "child" + i).find(k => !edges.some(e => e.to === form.id && e.input === k));
      if (slot) edges.push({
        from: f.id,
        out: "value",
        to: form.id,
        input: slot
      });
    }
    change({
      ...doc,
      types: [...doc.types, t],
      diagrams: doc.diagrams.map(g => g.id === graph.id ? {
        ...g,
        nodes: [...g.nodes, n, f],
        edges
      } : g)
    });
    setAt({
      ...at,
      node: n.id
    });
    setNewParam(false);
  }
  async function action(action: "save" | "publish" | "rollback", version?: string) {
    if (!doc || !remote) return;
    if (action !== "save" && !window.confirm(action === "publish" ? "Проверить и опубликовать согласованную версию инструментов?" : "Восстановить публикацию и её черновик?")) return;
    setBusy(true);
    setError("");
    try {
      accept(await request({
        action,
        document: doc,
        revision: remote.revision,
        version
      }));
      setMessage(action === "save" ? "Черновик сохранён" : "Публикация обновлена");
      setVersions(false);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ToolRequestError) setErrorAt(e.location ?? null);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!doc || !remote) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "test",
            document: doc,
            revision: remote.revision,
            tool: toolId,
            values,
            role: "pro"
          })
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      setTests(data.tests);
      setMessage("Проба выполнена. Запись данных представлена как план команды.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedAddress = [...at.path, at.node].join("/");
  function previewSelect(id: string) {
    if (!doc) return;
    const path = id.split("/"),
      node = path.pop()!;
    const current = layout(doc).at(root, path);
    navigate({
      graph: current.graph.id,
      path,
      node
    });
    setProps(true);
  }
  const localTrace = trial.result ? traceNode(trial.result.trace, at.path) : {} as Trace;
  function newTool() {
    if (!doc) return;
    const name = window.prompt("Название нового инструмента");
    if (!name?.trim()) return;
    const id = "tool_" + uuid(),
      context = makeField("context", "Контекст", "object", "toolContext"),
      ui = makeField("ui", "Интерфейс", "object", "view"),
      value = makeField("value", "Результат", "object", "record");
    const input: NodeType = {
        id: id + ".in",
        name: "Входы",
        category: "Границы",
        description: "",
        formulas: {},
        fields: [{
          ...context,
          direction: "output"
        }]
      },
      output: NodeType = {
        id: id + ".out",
        name: "Выходы",
        category: "Границы",
        description: "",
        formulas: {},
        fields: [{
          ...ui,
          direction: "input"
        }, {
          ...value,
          direction: "input"
        }]
      };
    const g: Diagram = {
      id,
      name,
      groups: {},
      nodes: [{
        id: "source",
        type: input.id,
        name: "Контекст",
        x: 0,
        y: 0,
        values: {}
      }, {
        id: "form",
        type: "ui.form",
        name: "Форма",
        x: 350,
        y: 0,
        values: {
          title: name
        }
      }, {
        id: "result",
        type: output.id,
        name: "Результат",
        x: 700,
        y: 0,
        values: {}
      }],
      edges: [{
        from: "form",
        out: "value",
        to: "result",
        input: "ui"
      }]
    };
    change({
      ...doc,
      types: [...doc.types, input, output],
      diagrams: [...doc.diagrams, g],
      tools: [...doc.tools, {
        id,
        name,
        category: "Ввод",
        diagram: id,
        tests: []
      }]
    });
    setToolId(id);
    navigate({
      graph: id,
      path: [],
      node: "form"
    }, id);
  }
  if (!doc || !remote) return <main className="gn-editor"><header><button onClick={back}>←</button><h1>Нодовый редактор</h1></header><p role="status">{error || "Загрузка определений…"}</p></main>;
  return <main className="gn-editor nt-editor" aria-busy={busy}><header><button aria-label="Открыть меню" onClick={openMain}>☰</button><button onClick={() => {
        if (!dirty || window.confirm("Выйти с несохранённым черновиком?")) back();
      }}>←</button><h1>Нодовый редактор</h1><small>Workspace 2 · черновик {remote.revision}{dirty ? " · изменён" : ""}</small><div className="gn-actions"><button disabled={busy} onClick={() => action("save")}>Сохранить</button><button disabled={busy} onClick={() => action("publish")}>Опубликовать</button><button onClick={() => setProps(!props)}>☰ Свойства</button></div></header>{navigation}
    <div className="gn-toolbar"><select aria-label="Инструмент" value={toolId} onChange={e => {
        const t = doc.tools.find(t => t.id === e.target.value)!;
        setToolId(t.id);
        navigate({
          graph: t.diagram,
          path: [],
          node: ""
        }, t.diagram);
      }}>{doc.tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><button onClick={newTool}>＋ Инструмент</button><button onClick={() => setMetadata(true)}>Определение</button><button onClick={() => setLibrary(!library)}>＋ Библиотека</button><button onClick={() => {
        setParameter({
          key: "designation",
          name: "Обозначение установки",
          kind: "string",
          meaning: "text",
          unit: "",
          required: false,
          permission: "input",
          options: ""
        });
        setNewParam(true);
      }}>Новый параметр</button><button disabled={!graph || !node} onClick={() => setPack(true)}>Собрать Instrument</button><button disabled={!history.length} onClick={() => {
        setDoc(history.at(-1)!);
        setHistory(history.slice(0, -1));
      }}>↶</button><button disabled={busy} onClick={run}>▷ Проверить</button><button onClick={() => setVersions(true)}>Версии</button><button onClick={() => setPreview(!preview)}>Предпросмотр</button></div>
    {(error || message) && <div className={error ? "gn-error" : "gn-status"} role={error ? "alert" : "status"}>{error || message}{error && errorAt && <button onClick={() => locate(errorAt.graph, errorAt.node ?? "")}>Перейти к ошибке</button>}{error.includes("другом окне") && <button onClick={() => {
        if (window.confirm("Загрузить сохранённую ревизию?")) void request().then(accept);
      }}>Загрузить актуальную</button>}</div>}
    <div className="gn-body">{graph && <Canvas overviewLabel="Показать все инструменты" root={root} doc={doc} active={at} focus={focus} storageKey={"tools/" + project.project.id + "/" + toolId} eligible={out ? targets : null} select={choose} context={(target, x, y) => {
        setAt(target);
        setMenu({
          id: target.node,
          x,
          y
        });
      }} move={(g, n, x, y) => updateGraph({
        ...g,
        nodes: g.nodes.map(v => v.id === n ? {
          ...v,
          x,
          y
        } : v)
      })} unlink={unlink} overview={() => navigate({
        graph: root,
        path: [],
        node: ""
      }, root)} />}
    {props && graph && node && type && <Properties graph={graph} node={node} type={type} trace={localTrace} update={updateNode} edit={() => setEditing(type)} send={key => setTransfer({
        from: node.id,
        out: key
      })} go={node => navigate({
        ...at,
        node
      })} unlink={e => unlink(graph, e)} test={run} pick={() => {}} group={() => setPack(true)} extra={<><p>{type.operation ? "Базовая операция · " + type.operation : type.instrument ? "Общее определение Instrument" : "Функция"}</p>{type.instrument && <button onClick={() => navigate({
          graph: type.instrument!,
          path: [...at.path, node.id],
          node: ""
        })}>Раскрыть Instrument</button>}<NodeProperties graph={graph} node={node} type={type} update={updateNode} />{type.parameter && <><small>{usesInStation(doc, type.id, root).map(u => u.name).join(" · ")}</small><ParameterProperties type={type} save={next => change({
            ...doc,
            types: doc.types.map(t => t.id === next.id ? next : t)
          })} /></>}</>} />}
    {preview && <aside className="nt-preview" style={{
        width
      }}><header><strong>Предпросмотр</strong><input aria-label="Ширина предпросмотра" type="range" min="280" max="800" value={width} onChange={e => setWidth(Number(e.target.value))} /><button onClick={() => setPreview(false)}>×</button></header>{trial.error ? <p role="alert">{trial.error}</p> : <ToolForm view={trial.result?.view} issues={trial.result?.issues ?? []} change={(key, value) => setValues(v => ({
          ...v,
          [key]: value
        }))} selected={selectedAddress} select={previewSelect} />}<details><summary>Тестовые значения</summary><textarea aria-label="Тестовые значения JSON" key={JSON.stringify(values)} defaultValue={JSON.stringify(values, null, 2)} onBlur={e => {
            try {
              setValues(JSON.parse(e.target.value));
              setError("");
            } catch {
              setError("Некорректный JSON входов");
            }
          }} /></details></aside>}</div>
    {menu && graph && <div className="gn-menu" style={{
      left: Math.min(menu.x, window.innerWidth - 240),
      top: Math.min(menu.y, window.innerHeight - 200)
    }}><button onClick={() => {
        setTransfer({
          from: menu.id
        });
        setMenu(null);
      }}>Передать атрибут…</button><button onClick={() => {
        setProps(true);
        setMenu(null);
      }}>Свойства</button>{!["source", "result"].includes(menu.id) && <button onClick={() => {
        updateGraph({
          ...graph,
          nodes: graph.nodes.filter(n => n.id !== menu.id),
          edges: graph.edges.filter(e => e.from !== menu.id && e.to !== menu.id)
        });
        setMenu(null);
      }}>Удалить узел</button>}<button onClick={() => setMenu(null)}>Закрыть</button></div>}
    {transfer && graph && <section className="gn-transfer"><header><h3>Передать атрибут</h3><button onClick={() => setTransfer(null)}>×</button></header>{!transfer.out ? fromType?.fields.filter(f => f.direction !== "input").map(f => <button key={f.key} onClick={() => setTransfer({
        ...transfer,
        out: f.key
      })}>{f.name}<small>{f.kind} · {f.meaning} {f.unit}</small></button>) : !transfer.to ? graph.nodes.filter(n => targets.has(n.id)).map(n => <button key={n.id} onClick={() => setTransfer({
        ...transfer,
        to: n.id
      })}>{n.name}</button>) : inputsFor(graph.nodes.find(n => n.id === transfer.to)!).map(f => <button key={f.key} onClick={() => connect(f.key)}>{f.name}</button>)}</section>}
    {library && graph && <section className="gn-library"><header><h2>Библиотека</h2><button onClick={() => setLibrary(false)}>×</button></header><input aria-label="Поиск нодов" value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => setEditing({
        id: "custom_" + uuid(),
        name: "",
        category: "Функции",
        description: "",
        fields: [],
        formulas: {}
      })}>Создать функцию</button>{doc.types.filter(t => !t.id.endsWith(".in") && !t.id.endsWith(".out") && !t.parameter && t.name.toLowerCase().includes(search.toLowerCase()) && t.instrument !== graph.id).map(t => <button key={t.id} onClick={() => addType(t)}>{t.name}<small>{t.category}</small></button>)}</section>}
    {editing && <TypeEditor root={root} original={editing} doc={doc} close={() => setEditing(null)} save={saveType} navigate={(g, n, path) => {
      setEditing(null);
      locate(g, n, path);
    }} />}
    {pack && graph && <GroupDialog doc={doc} graph={graph} initial={at.node} close={() => setPack(false)} save={(next, id) => {
      change({
        ...next,
        tools: doc.tools
      });
      setPack(false);
      navigate({
        ...at,
        node: id
      });
    }} />}
    {newParam && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Новый параметр"><header><h2>Параметр и поле формы</h2><button onClick={() => setNewParam(false)}>Закрыть</button></header>{(["key", "name", "meaning", "unit"] as const).map(k => <label key={k}>{{
            key: "Устойчивый ключ",
            name: "Название",
            meaning: "Инженерный смысл",
            unit: "Единица"
          }[k]}<input value={parameter[k]} onChange={e => setParameter({
            ...parameter,
            [k]: e.target.value
          })} /></label>)}<label>Тип<select value={parameter.kind} onChange={e => setParameter({
            ...parameter,
            kind: e.target.value
          })}>{["float", "int", "boolean", "string", "enum"].map(v => <option key={v}>{v}</option>)}</select></label>{parameter.kind === "enum" && <label>Варианты через запятую<input value={parameter.options} onChange={e => setParameter({
            ...parameter,
            options: e.target.value
          })} /></label>}<label>Обязательный<input type="checkbox" checked={parameter.required} onChange={e => setParameter({
            ...parameter,
            required: e.target.checked
          })} /></label><button onClick={() => {
          try {
            saveParameter();
          } catch (e) {
            setError((e as Error).message);
          }
        }}>Создать параметр</button>{error && <p role="alert">{error}</p>}</section></div>}
    {metadata && tool && <div className="gn-shade"><section className="gn-dialog"><header><h2>Определение инструмента</h2><button onClick={() => setMetadata(false)}>Закрыть</button></header><p>{tool.id}</p><label>Название<input value={tool.name} onChange={e => change({
            ...doc,
            tools: doc.tools.map(t => t.id === tool.id ? {
              ...t,
              name: e.target.value
            } : t)
          })} /></label><label>Категория<input value={tool.category} onChange={e => change({
            ...doc,
            tools: doc.tools.map(t => t.id === tool.id ? {
              ...t,
              category: e.target.value
            } : t)
          })} /></label><button onClick={() => {
          setTestJson(JSON.stringify(tool.tests, null, 2));
          setMetadata(false);
        }}>Редактировать проверочные примеры</button></section></div>}
    {testJson !== null && tool && <div className="gn-shade"><section className="gn-dialog"><header><h2>Проверочные примеры</h2><button onClick={() => setTestJson(null)}>Закрыть</button></header><p>Входные values, ожидаемые expected по пути результата, errors с ключами ошибок, tolerance для дробных чисел.</p><textarea rows={18} value={testJson} onChange={e => setTestJson(e.target.value)} /><button onClick={() => {
          try {
            const tests = JSON.parse(testJson) as ToolTest[];
            if (!Array.isArray(tests)) throw Error("Нужен массив примеров");
            change({
              ...doc,
              tools: doc.tools.map(t => t.id === tool.id ? {
                ...t,
                tests
              } : t)
            });
            setTestJson(null);
          } catch (e) {
            setError((e as Error).message);
          }
        }}>Сохранить примеры в черновик</button></section></div>}
    {tests && <div className="gn-shade"><section className="gn-dialog nt-tests"><header><h2>Проверки определения</h2><button onClick={() => setTests(null)}>Закрыть</button></header><table><tbody>{tests.map(t => <tr key={t.id}><td>{t.passed ? "✓" : "Ошибка"}</td><td>{t.name}</td><td>{t.message}<details><summary>Ожидаемое и фактическое</summary><pre>{JSON.stringify({expected:t.expected,actual:t.actual},null,2)}</pre></details>{!t.passed&&t.node&&<button onClick={()=>{setTests(null);previewSelect(t.node!);}}>Перейти к узлу</button>}</td></tr>)}</tbody></table><p>Команда записи · Workspace 2 · пробный запуск</p></section></div>}
    {versions && <div className="gn-shade"><section className="gn-dialog"><header><h2>Публикации Workspace 2</h2><button onClick={() => setVersions(false)}>Закрыть</button></header>{remote.versions.map(v => <p key={v.id}>{v.created} · {v.author}<br />{v.id}{v.id === remote.active ? " · Действующая" : <button onClick={() => action("rollback", v.id)}>Восстановить</button>}</p>)}</section></div>}
  </main>;
}
function ParameterProperties({
  type,
  save
}: {
  type: NodeType;
  save: (t: NodeType) => void;
}) {
  const p = type.parameter!;
  const [error, setError] = useState("");
  const update = (field: Partial<Field>) => {
    const next = {
        ...p.field,
        ...field
      },
      t = parameterType(type.id, type.name, next, p.permission);
    t.parameter = {
      ...p,
      field: next
    };
    save(t);
  };
  return <details className="nt-parameter-definition" open><summary>Определение параметра</summary><p>{p.key}</p><label>Начальное значение (JSON)<input key={JSON.stringify(p.field.initial)} defaultValue={JSON.stringify(p.field.initial) ?? ""} onBlur={e => {
        try {
          update({
            initial: e.target.value ? JSON.parse(e.target.value) : undefined
          });
          setError("");
        } catch {
          setError("Некорректное JSON-значение");
        }
      }} /></label><label>Права редактирования<select value={p.permission} onChange={e => {
        const permission = e.target.value as "input" | "options" | "all";
        const next = parameterType(type.id, type.name, p.field, permission);
        next.parameter = {
          ...p,
          permission
        };
        save(next);
      }}><option value="input">Все пользователи</option><option value="options">Plus, pro, admin</option><option value="all">Pro, admin</option></select></label>{error && <p role="alert">{error}</p>}<label>Название<input value={p.field.name} onChange={e => update({
        name: e.target.value
      })} /></label><label>Тип<select value={p.field.kind} onChange={e => update({
        kind: e.target.value as Field["kind"]
      })}>{["float", "int", "boolean", "string", "enum", "object", "array"].map(k => <option key={k}>{k}</option>)}</select></label><label>Единица<input value={p.field.unit} onChange={e => update({
        unit: e.target.value
      })} /></label><label>Инженерный смысл<input value={p.field.meaning} onChange={e => update({
        meaning: e.target.value
      })} /></label><label>Обязательный<input type="checkbox" checked={!!p.field.required} onChange={e => update({
        required: e.target.checked
      })} /></label>{(["min", "max"] as const).map(key => <label key={key}>{key}<input type="number" value={p.field[key] ?? ""} onChange={e => update({
        [key]: e.target.value === "" ? undefined : Number(e.target.value)
      })} /></label>)}<label>Варианты через запятую<input value={p.field.options?.join(",") ?? ""} onChange={e => update({
        options: e.target.value.split(",").map(v => v.trim()).filter(Boolean)
      })} /></label><small>Изменение определения применяется ко всем его экземплярам. Пути доступны в редакторе типа.</small></details>;
}
function NodeProperties({
  graph,
  node,
  type,
  update
}: {
  graph: Diagram;
  node: GraphNode;
  type: NodeType;
  update: (patch: Partial<GraphNode>) => void;
}) {
  const fields = type.fields.filter(f => f.direction !== "output" && !graph.edges.some(e => e.to === node.id && e.input === f.key) && !["object", "array", "reference"].includes(f.kind));
  return <details open className="nt-settings"><summary>Настройки экземпляра</summary>{fields.map(f => {
      const value = Object.hasOwn(node.values, f.key) ? node.values[f.key] : f.initial;
      const set = (value: unknown) => update({
        values: {
          ...node.values,
          [f.key]: value
        }
      });
      return <label key={f.key}>{f.name}{f.kind === "boolean" ? <input type="checkbox" checked={value === true} onChange={e => set(e.target.checked)} /> : f.kind === "enum" ? <select value={String(value ?? "")} onChange={e => set(e.target.value)}><option value="">По умолчанию</option>{f.options?.map(v => <option key={v}>{v}</option>)}</select> : <input value={value == null ? "" : String(value)} type={["number", "float", "int"].includes(f.kind) ? "number" : "text"} onChange={e => set(["number", "float", "int"].includes(f.kind) ? e.target.value === "" ? null : Number(e.target.value) : e.target.value)} />}</label>;
    })}</details>;
}
