"use client";
import { useAppNavigationGuard } from "../app-navigation";

import { useEffect, useState } from "react";
import { betaOperations } from "./profile";
import { Canvas, type Focus } from "./canvas";
import { rowIdentity, type RowHistory } from "./trial-trace";
import { GroupDialog } from "./group-dialog";
import { ROOT, childDiagram } from "./hierarchy";
import { layout, classification, type Address } from "./canvas-layout";
import { Properties } from "./properties";
import { TypeEditor } from "./type-editor";
import { connectionProblem, type Trace } from "./engine";
import { compatible, display, type Diagram, type Document, type Edge, type EditorState, type GraphNode, type NodeType } from "./schema";
import { graphNode, signatures } from "./templates";
import { catalogPumpPort, pumpPortField } from "../pump-ports";
import type { Pump } from "../pump-catalog";
import type { DnEntity, InputEntity, ProjectConfig, SpecEntity, SpecItem } from "../project-config";
import "./editor.css";
const api = "/api/admin/geometry-nodes";
interface NodeLocation {
  diagram: string;
  node?: string;
}
interface AffectedNode {
  diagram: string;
  graph: string;
  node: string;
  name: string;
  links: Edge[];
}
class RequestError extends Error {
  constructor(message: string, readonly location?: NodeLocation) {
    super(message);
  }
}
async function request(path: string, body?: unknown) {
  const response = await fetch(path, body ? {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  } : {
    cache: "no-store"
  });
  const value = await response.json();
  if (!response.ok) throw new RequestError(value.error ?? "Ошибка доступа к редактору", value.location);
  return value;
}
function inputsFor(key: string, project: ProjectConfig, pumps: Pump[], secondary: boolean, side: "inlet" | "outlet", document?:Document) {
  const input = project.entities[secondary ? "system-input-2" : "system-input"] as InputEntity,
    entity = project.entities["station-dn"] as DnEntity;
  const pump = pumps.find(p => p.id === input.selectedPumpId);
  if (key === "resolvePort") {
    const override = entity[pumpPortField(secondary, side)];
    return {
      catalog: catalogPumpPort(pump?.id ?? input.selectedPumpId, side, pump),
      override: input.selectedPumpId && override?.pumpId === input.selectedPumpId ? override : null
    };
  }
  const selectedIds = ["system-input", "system-input-2"].map(k => (project.entities[k] as InputEntity).selectedPumpId);
  const catalogue = pumps.filter(p => selectedIds.includes(p.id));
  const known: Record<string, unknown> = {
    project,
    resources: {
      pumps: catalogue,
      cabinets: null,
      smartCabinets: null
    },
    catalogue,specEntity:project.entities["station-spec"],input2:project.entities["system-input-2"],primary:project.entities["system-input"],second:project.entities["system-input-2"],pump1:pumps.find(p=>p.id===selectedIds[0]),pump2:pumps.find(p=>p.id===selectedIds[1]),
    side,
    profiles: {
      version: 1,
      profiles: {}
    },
    lines: {
      version: 1,
      items: {},
      issues: []
    },
    item: (project.entities["station-spec"] as SpecEntity).items[0],
    entity,
    input,
    settings: project.entities["station-settings"],
    pump,
    row: pump,
    filters: {},
    secondary,
    flow: input.flowRate,
    head: input.head,
    count: input.workingPumpCount,
    method: "pchip",
    massKg: pump?.weightKg,
    frequencyHz: 50,
    nominalHz: 50,
    grip: 30,
    nut: 8,
    washer: 2,
    ends: 2,
    dn: entity.dischargeValveDn,
    volume: 50
  };
  if (key === ROOT) return known;
  const source=document?.diagrams.find(g=>g.id===key)?.nodes.find(n=>n.id==="source");
  const args = signatures.find(s => s.id === key)?.args ?? document?.types.find(t=>t.id===source?.type)?.fields ?? [];
  return Object.fromEntries(args.map(f => [f.key, known[f.key] ?? null]));
}
type Transfer = {
  from: string;
  out?: string;
  to?: string;
};
type Props = {
  project: ProjectConfig;
  pumps: Pump[];
  back: () => void;
};
export function EngineeringEditor({
  project,
  pumps,
  back,
}: Props) {
  const [remote, setRemote] = useState<EditorState | null>(null),
    [doc, setDoc] = useState<Document | null>(null),
    [id, setId] = useState(ROOT);
  const [selected, setSelected] = useState("spec"),
    [props, setProps] = useState(false),
    [library, setLibrary] = useState(false),
    [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null),
    [transfer, setTransfer] = useState<Transfer | null>(null),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<NodeType | null>(null),
    [trace, setTrace] = useState<Trace>({}),
    [group, setGroup] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<Document[]>([]);
  const [trialPump, setTrialPump] = useState("");
  const [testOpen, setTestOpen] = useState(false),
    [json, setJson] = useState("{}"),
    [secondary, setSecondary] = useState(false),
    [side, setSide] = useState<"inlet" | "outlet">("outlet");
  const [samples, setSamples] = useState(false),
    [sampleRows, setSampleRows] = useState<{
      id: string;
      name: string;
    }[]>([]),
    [sampleQuery, setSampleQuery] = useState("");
  const [impact, setImpact] = useState<AffectedNode[] | null>(null);
  const [errorLocation, setErrorLocation] = useState<NodeLocation | null>(null);
  const [path, setPath] = useState<string[]>([]),
    [focus, setFocus] = useState<Focus | null>(null),
    [pack, setPack] = useState(false),
    [useCatalog, setUseCatalog] = useState(true),
    [trialOut, setTrialOut] = useState("stationComposition"),
    [rowEvents, setRowEvents] = useState<RowHistory[]>([]),
    [trialSpec, setTrialSpec] = useState<SpecEntity | null>(null),
    [tracePrefix, setTracePrefix] = useState("");
  const [versions, setVersions] = useState(false);
  const graph = doc?.diagrams.find(g => g.id === id),
    node = graph?.nodes.find(n => n.id === selected),
    type = doc?.types.find(t => t.id === node?.type);
  const dirty = !!doc && doc !== remote?.draft;
  useAppNavigationGuard(dirty);
  function accept(state: EditorState) {
    setRemote(state);
    setDoc(state.draft);
    setHistory([]);
    setTrace({});
  }
  useEffect(() => {
    let live = true;
    request(api).then(r => {
      if (live) accept(r);
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImpact(null);
        setMenu(null);
        setTransfer(null);
        setEditing(null);
        setTestOpen(false);
        setSamples(false);
        setVersions(false);
        setLibrary(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
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
    if (!samples || !type) return;
    let active = true;
    const timer = setTimeout(() => {
      request(api + "?category=" + encodeURIComponent(type.id) + "&q=" + encodeURIComponent(sampleQuery)).then(rows => {
        if (active) setSampleRows(rows);
      }).catch(e => {
        if (active) setError(e.message);
      });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [samples, sampleQuery, type]);
  if (!doc || !graph || !remote) return <main className="gn-editor"><header><button onClick={back}>← Рабочее пространство</button><h1>Geometry Nodes</h1></header><p role="status">{error || "Загружаем типы, графы и черновик…"}</p>{error && <button onClick={() => window.location.reload()}>Повторить</button>}</main>;
  const current = doc,
    g = graph,
    state = remote;
  function change(next: Document) {
    if (busy) return;
    setRowEvents([]);
    setTrialSpec(null);
    setHistory(old => [...old.slice(-39), current]);
    setDoc(next);
    setTrace({});
    setError("");
    setMessage("");
  }
  function updateGraph(next: Diagram) {
    change({
      ...current,
      diagrams: current.diagrams.map(d => d.id === next.id ? next : d)
    });
  }
  function updateNode(nid: string, patch: Partial<GraphNode>) {
    updateGraph({
      ...g,
      nodes: g.nodes.map(n => n.id === nid ? {
        ...n,
        ...patch
      } : n)
    });
  }
  function unlink(edge: Edge) {
    if (window.confirm("Удалить связь " + edge.from + "." + edge.out + " → " + edge.to + "." + edge.input + "?")) updateGraph({
      ...g,
      edges: g.edges.filter(e => e !== edge)
    });
  }
  function pickNode(nid: string) {
    if (transfer?.out && !transfer.to) {
      if (targets.has(nid)) {
        setTransfer({
          ...transfer,
          to: nid
        });
        setSearch("");
      } else setError("У получателя нет совместимого входа или соединение образует цикл.");
      return;
    }
    setSelected(nid);
    setMenu(null);
  }
  function start(nid: string, key?: string) {
    setMenu(null);
    setTransfer({
      from: nid,
      out: key
    });
    setSearch("");
    setError("");
  }
  const src = g.nodes.find(n => n.id === transfer?.from),
    srcType = current.types.find(t => t.id === src?.type),
    out = srcType?.fields.find(f => f.key === transfer?.out);
  const fieldsFor = (n: GraphNode) => current.types.find(t => t.id === n.type)!.fields.filter(f => out && compatible(out, f) && !connectionProblem(g, current.types, {
    from: src!.id,
    out: out.key,
    to: n.id,
    input: f.key
  }));
  const targets = new Set(transfer?.out ? g.nodes.filter(n => fieldsFor(n).length).map(n => n.id) : []);
  function connect(input: string) {
    if (!transfer?.to || !transfer.out) return;
    const edge = {
        from: transfer.from,
        out: transfer.out,
        to: transfer.to,
        input
      },
      issue = connectionProblem(g, current.types, edge);
    if (issue) {
      setError(issue);
      return;
    }
    const old = g.edges.find(e => e.to === edge.to && e.input === edge.input);
    if (old && !window.confirm("Заменить источник " + old.from + "." + old.out + "?")) return;
    updateGraph({
      ...g,
      edges: [...g.edges.filter(e => e !== old), edge]
    });
    setTransfer(null);
  }
  function makeType(category: string) {
    setEditing({
      id: "custom_" + crypto.randomUUID().slice(0, 8),
      name: "",
      category,
      description: "",
      fields: [],
      formulas: {}
    });
  }
  function add(t: NodeType, types = current.types, diagrams = current.diagrams) {
    const key = "n_" + crypto.randomUUID().slice(0, 8),
      n = graphNode(key, t.id, t.name, (node?.x ?? 30) + 65, (node?.y ?? 40) + 140);
    change({
      ...current,
      types,
      diagrams: diagrams.map(d => d.id === id ? {
        ...d,
        nodes: [...d.nodes, {
          ...n,
          group: group || undefined
        }]
      } : d)
    });
    setSelected(key);
    setProps(true);
    setLibrary(false);
  }
  function saveType(t: NodeType) {
    const exists = current.types.some(x => x.id === t.id),
      types = exists ? current.types.map(x => x.id === t.id ? t : x) : [...current.types, t];
    if (!exists && t.category === "Инструменты") {
      if (t.fields.some(f => f.direction === "both")) throw Error("Укажите направление каждого внешнего порта Instrument.");
      const wrap: NodeType = {
        ...t,
        instrument: t.id,
        formulas: {},
        section: "edit"
      };
      const leaf: NodeType = {
        ...t,
        id: t.id + ".rule",
        category: "Функции"
      };
      const bounds = (input: boolean): NodeType => ({
        ...t,
        id: t.id + (input ? ".in" : ".out"),
        category: "Границы",
        formulas: {},
        fields: t.fields.filter(f => f.direction === (input ? "input" : "output")).map(f => ({
          ...f,
          direction: input ? "output" : "input"
        }))
      });
      const child: Diagram = {
        id: t.id,
        name: t.name,
        groups: {},
        nodes: [graphNode("source", t.id + ".in", "Входы", 0, 60), graphNode("rule", leaf.id, t.name, 365, 60), graphNode("result", t.id + ".out", "Выходы", 730, 60)],
        edges: t.fields.map(f => f.direction === "input" ? {
          from: "source",
          out: f.key,
          to: "rule",
          input: f.key
        } : {
          from: "rule",
          out: f.key,
          to: "result",
          input: f.key
        })
      };
      add(wrap, [...current.types, wrap, leaf, bounds(true), bounds(false)], [...current.diagrams, child]);
      setEditing(null);
      return;
    }
    if (exists && t.instrument) {
      const child = current.diagrams.find(d => d.id === t.instrument);
      if (child) {
        for (const [id, dir] of [["source", "input"], ["result", "output"]] as const) {
          const boundary = child.nodes.find(n => n.id === id),
            index = types.findIndex(type => type.id === boundary?.type);
          if (index < 0) continue;
          const fields = t.fields.filter(f => f.direction === dir).map(f => ({
            ...f,
            direction: dir === "input" ? "output" as const : "input" as const
          }));
          if (child.edges.some(e => e.from === id && !fields.some(f => f.key === e.out) || e.to === id && !fields.some(f => f.key === e.input))) throw Error("Сначала отключите внутренние связи удаляемого порта.");
          types[index] = {
            ...types[index],
            fields
          };
        }
      }
    }
    if (exists) change({
      ...current,
      types
    });else add(t, types);
    setEditing(null);
  }
  function navigate(at: Address, base = focus?.base ?? ROOT) {
    setId(at.graph);
    setSelected(at.node);
    setPath(at.path);
    setFocus({
      ...at,
      base,
      serial: Date.now()
    });
    setMenu(null);
    setTransfer(null);
  }
  function activate(at: Address) {
    if (transfer && at.graph !== id) return;
    setId(at.graph);
    setPath(at.path);
    pickNode(at.node);
  }
  function locate(at: NodeLocation) {
    setImpact(null);
    const route = layout(current).locate(at.diagram);
    navigate({
      graph: at.diagram,
      path: route ?? [],
      node: at.node ?? "result"
    }, route ? ROOT : at.diagram);
    setProps(true);
    setGroup("");
  }
  async function review() {
    setBusy(true);
    setError("");
    setErrorLocation(null);
    try {
      const result = await request(api, {
        action: "impact",
        document: current,
        revision: state.revision
      });
      setImpact(result.uses);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError) setErrorLocation(e.location ?? null);
    } finally {
      setBusy(false);
    }
  }
  async function save(action: "save" | "publish" | "rollback", version?: string) {
    setImpact(null);
    if (action === "rollback" && !window.confirm("Восстановить опубликованную версию и её черновик?")) return;
    setBusy(true);
    setError("");
    try {
      const value = await request(api, {
        action,
        document: current,
        revision: state.revision,
        version
      });
      accept(value);
      setVersions(false);
      setMessage(action === "save" ? "Черновик сохранён" : "Активная версия · " + value.active);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startTest() {
    setTrialPump("");
    setJson(JSON.stringify(inputsFor(id, project, pumps, path[0]==="secondary"||secondary, side,current), null, 2));
    setTestOpen(true);
    setError("");
  }
  async function test() {
    try {
      setBusy(true);
      setError("");
      const inputs = JSON.parse(json);
      if (!inputs || Array.isArray(inputs) || typeof inputs !== "object") throw Error("Укажите входы объектом JSON.");
      const result = await request(api, {
        action: "test",
        revision: state.revision,
        document: current,
        diagram: id,
        output: id === ROOT ? trialOut : undefined,
        useCatalog: id === ROOT && useCatalog,
        inputs
      });
      setTrace(result.trace);
      setTracePrefix(path.join("/"));
      if (result.value?.entities?.["station-spec"]) {
        setTrialSpec(result.value.entities["station-spec"]);
        setRowEvents(result.rows ?? []);
      }
      setTestOpen(false);
      setMessage(result.value?.entities ? "Готово · строк спецификации: " + result.value.entities["station-spec"].items.length : "Результат · " + display(result.value));
    } catch (e) {
      setTrace({});
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const localTrace: Trace = {};
  const prefix = path.join("/");
  if (!tracePrefix || prefix === tracePrefix || prefix.startsWith(tracePrefix + "/")) {
    const rel = prefix.slice(tracePrefix.length).replace(/^\//, "");
    for (const n of g.nodes) {
      const key = [rel, n.id].filter(Boolean).join("/");
      if (trace[key]) localTrace[n.id] = trace[key];else if (trace[key + "/result"]) localTrace[n.id] = {
        inputs: trace[key + "/source"]?.outputs ?? {},
        outputs: trace[key + "/result"].inputs,
        sources: trace[key + "/result"].sources
      };
    }
  }
  function rowRule(item: SpecItem) {
    if (item.generatedBy === "suction-line" || item.generatedBy === "discharge-line") return "stationLines";
    if (item.generatedBy === "hydraulic-options") return "stationOptions";
    if (item.option === "controlCabinet") return "stationCabinetRows";
    if (item.section === "pump") return "preparePumpRows";
    if (item.option?.toLowerCase().includes("frame")) return "stationFrameRows";
    if (item.option?.toLowerCase().includes("collector")) return "stationCollectors";
    return "finalizeStation";
  }
  const shellBack = () => {
    if (!dirty || window.confirm("Выйти и отбросить несохранённые изменения?")) back();
  };
  const filtered = (s: string) => s.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  return <main className="gn-editor" aria-busy={busy}>
    <header><button aria-label="Вернуться в рабочее пространство" onClick={shellBack}>←</button><h1>Geometry Nodes</h1><span className="gn-revision" title={state.active}>Черновик {state.revision}{dirty ? " · изменён" : ""}</span><div className="gn-actions"><button disabled={busy} onClick={() => save("save")}>Сохранить</button><button disabled={busy} className="gn-primary" onClick={review}>Опубликовать</button><button onClick={() => setProps(!props)} aria-expanded={props}>☰ Свойства</button></div></header>

    <div className="gn-toolbar"><strong>Расчёт насосной установки</strong><span className="gn-location">{id === ROOT ? "Станция" : g.name}</span><button onClick={() => setPack(true)}>Собрать Instrument</button>
    <button onClick={() => setLibrary(!library)}>＋ Библиотека</button><button disabled={!history.length || busy} onClick={() => {
        setDoc(history.at(-1)!);
        setHistory(history.slice(0, -1));
        setTrace({});
      }}>↶ Отменить</button><button onClick={startTest}>▷ Запуск</button><button onClick={() => setVersions(true)}>Версии</button></div>
    {(message || error) && <div className={error ? "gn-error" : "gn-status"} role={error ? "alert" : "status"}>{error || message} {error && errorLocation && <button onClick={() => locate(errorLocation)}>Перейти к ошибке</button>} {error.includes("другом окне") && <button onClick={() => {
        if (window.confirm("Заменить локальный черновик сохранённым?")) void request(api).then(accept).catch(e => setError(e.message));
      }}>Загрузить актуальный</button>}</div>}
    <div className="gn-body"><Canvas doc={current} storageKey={project.project.id} active={{
        graph: id,
        node: selected,
        path
      }} focus={focus} eligible={transfer?.out ? targets : null} select={activate} context={(at, x, y) => {
        setId(at.graph);
        setPath(at.path);
        setSelected(at.node);
        setMenu({
          id: at.node,
          x,
          y
        });
      }} move={(graph, nid, x, y) => updateGraph({
        ...graph,
        nodes: graph.nodes.map(n => n.id === nid ? {
          ...n,
          x,
          y
        } : n)
      })} unlink={(graph, e) => {
        if (window.confirm("Удалить связь " + e.from + "." + e.out + " → " + e.to + "." + e.input + "?")) updateGraph({
          ...graph,
          edges: graph.edges.filter(w => w !== e)
        });
      }} overview={() => navigate({
        graph: ROOT,
        node: "",
        path: []
      }, ROOT)} />
    {props && node && type && <Properties key={node.id} graph={g} node={node} type={type} trace={localTrace} extra={<>{childDiagram(type, id) && <button onClick={() => navigate({
          graph: childDiagram(type, id)!,
          path: [...path, node.id],
          node: ""
        })}>Раскрыть Instrument</button>}{path.length > 0 && <button onClick={() => {
          const base = focus?.base ?? ROOT;
          const parent = path.slice(0, -1);
          navigate({
            graph: layout(current).at(base, parent).graph.id,
            path: parent,
            node: path.at(-1)!
          }, base);
        }}>К внешним портам</button>}{node.id === "spec" && id === ROOT && <details open><summary>Строки спецификации</summary>{(trialSpec ?? project.entities["station-spec"] as SpecEntity).items.map((item, i) => <details key={i}><summary>{item.position} · {item.name}</summary><p>{item.equipmentId ?? "Позиция проекта"} · {item.quantity} {item.unit ?? "шт"} · цена {item.price ?? "не указана"}</p><p>{[item.generatedBy, item.option, item.assemblyRole, item.details, ...(item.technicalNotes ?? [])].filter(Boolean).join(" · ")}</p>{item.listPrice != null && <p>Прайс · {item.listPrice} {item.priceCurrency}</p>}{(rowEvents.find(row => row.row === rowIdentity(item))?.changes ?? []).map(c => <button key={c.node} onClick={() => {
              const p = c.node.split("/");
              const n = p.pop()!;
              const target = layout(current).at(ROOT, p);
              navigate({
                graph: target.graph.id,
                path: p,
                node: n
              }, ROOT);
            }}>{c.fields.join(", ")} · {c.node === "source" ? "из сохранённого проекта" : c.node}</button>)}<button onClick={() => locate({
              diagram: rowRule(item),
              node: "operation"
            })}>К правилу состава</button><button onClick={() => locate({
              diagram: "specificationLineTotal",
              node: "row"
            })}>К количеству и цене</button></details>)}</details>}</>} source={type.native ? state.sources[type.native] : undefined} update={patch => updateNode(node.id, patch)} edit={() => setEditing(type)} send={key => start(node.id, key)} go={nid => {
        setGroup("");
        navigate({
          graph: id,
          path,
          node: nid
        });
      }} unlink={unlink} test={startTest} pick={() => {
        setSamples(true);
        setSampleQuery("");
      }} group={() => {
        const name = window.prompt("Название группы (пустое — вывести из группы)", g.groups[node.group ?? ""] ?? "");
        if (name === null) return;
        const gid = Object.keys(g.groups).find(k => g.groups[k] === name) ?? "group_" + crypto.randomUUID().slice(0, 8);
        updateGraph({
          ...g,
          groups: name ? {
            ...g.groups,
            [gid]: name
          } : g.groups,
          nodes: g.nodes.map(n => n.id === node.id ? {
            ...n,
            group: name ? gid : undefined
          } : n)
        });
      }} />}</div>
    {menu && <div className="gn-menu" style={{
      left: Math.min(menu.x, window.innerWidth - 225),
      top: Math.min(menu.y, window.innerHeight - 150)
    }}><button onClick={() => start(menu.id)}>Передать атрибут…</button><button onClick={() => {
        setProps(true);
        setMenu(null);
      }}>Свойства</button>{!["source", "result"].includes(menu.id) && <button onClick={() => {
        updateGraph({
          ...g,
          nodes: g.nodes.filter(n => n.id !== menu.id),
          edges: g.edges.filter(e => e.from !== menu.id && e.to !== menu.id)
        });
        setSelected("source");
        setMenu(null);
      }}>Удалить узел</button>}<button onClick={() => setMenu(null)}>Закрыть</button></div>}
    {transfer && <section className="gn-transfer"><header><h3>{!transfer.out ? "Передать атрибут" : !transfer.to ? "Выберите получателя" : "Выберите вход"}</h3><button onClick={() => setTransfer(null)}>×</button></header><input aria-label="Поиск атрибута или узла" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск…" />
    {!transfer.out ? srcType?.fields.filter(f => f.direction !== "input" && filtered(f.name + " " + f.key)).map(f => <button key={f.key} onClick={() => {
        setTransfer({
          ...transfer,
          out: f.key
        });
        setSearch("");
      }}>{f.name}<small>{f.kind} · {f.meaning} {f.unit} · {display(localTrace[src!.id]?.outputs[f.key] ?? src?.values[f.key] ?? f.initial)}</small></button>) : !transfer.to ? <>{g.nodes.filter(n => targets.has(n.id) && filtered(n.name)).map(n => <button key={n.id} onClick={() => pickNode(n.id)}>{n.name}</button>)}{!targets.size && <p>Совместимых входов нет. Проверьте тип, инженерный смысл, единицу и направление связи.</p>}</> : fieldsFor(g.nodes.find(n => n.id === transfer.to)!).filter(f => filtered(f.name)).map(f => <button key={f.key} onClick={() => connect(f.key)}>{f.name} · {f.meaning} {f.unit}</button>)}</section>}
    {library && <section className="gn-library"><header><h2>Библиотека</h2><button onClick={() => setLibrary(false)}>×</button></header><input aria-label="Поиск типов" value={query} onChange={e => setQuery(e.target.value)} placeholder="Тип или инструмент…" />{query.trim() && current.diagrams.filter(d => d.name.toLowerCase().includes(query.toLowerCase())).map(d => <button key={d.id} onClick={() => {
        locate({
          diagram: d.id,
          node: ""
        });
        setLibrary(false);
      }}>Открыть · {d.name}</button>)}<button onClick={() => makeType("Комплектующие")}>Создать тип комплектующего</button><button onClick={() => makeType("Инструменты")}>Создать тип инструмента</button>{current.types.filter(t => t.category !== "Границы" && !t.id.startsWith("args.") && !t.id.startsWith("return.") && (!betaOperations.has(id) || !t.native || betaOperations.has(t.native)) && t.name.toLowerCase().includes(query.toLowerCase())).map(t => <button key={t.id} onClick={() => add(t)}>{t.name}<small>{classification(t)}</small></button>)}</section>}
    {pack && <GroupDialog graph={g} doc={current} initial={selected} close={() => setPack(false)} save={(d, n) => {
      change(d);
      setPack(false);
      navigate({
        graph: id,
        path,
        node: n
      });
    }} />}
    {editing && <TypeEditor original={editing} doc={current} close={() => setEditing(null)} save={saveType} navigate={(g, n, route) => {
      setEditing(null);
      setLibrary(false);
      if (route) navigate({
        graph: g,
        node: n,
        path: route
      }, ROOT);else locate({
        diagram: g,
        node: n
      });
      setGroup("");
      setProps(true);
      setTrace({});
    }} />}
    {testOpen && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Тестовый запуск"><header><h2>Тестовый запуск</h2><button onClick={() => setTestOpen(false)}>Закрыть</button></header><p>{g.name} · копия входных данных проекта</p>
      {id === ROOT && <label>Выход станции<select value={trialOut} onChange={e => setTrialOut(e.target.value)}>{current.types.find(t => t.id === "station.out")?.fields.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}</select><span><input type="checkbox" checked={useCatalog} onChange={e => setUseCatalog(e.target.checked)} /> Использовать рабочие каталоги сервера</span></label>}
      {id === "resolvePort" && <div className="gn-toolbar"><select aria-label="Контур" value={Number(secondary)} onChange={e => {
            const s = !!Number(e.target.value);
            setSecondary(s);
            setJson(JSON.stringify(inputsFor(id, project, pumps, s, side), null, 2));
          }}><option value="0">Основной контур</option><option value="1">Второй контур</option></select><select aria-label="Патрубок" value={side} onChange={e => {
            const s = e.target.value as typeof side;
            setSide(s);
            setJson(JSON.stringify(inputsFor(id, project, pumps, secondary, s), null, 2));
          }}><option value="outlet">Выход</option><option value="inlet">Вход</option></select></div>}
      {id === "resolvePort" && <label>Проверить другой насос из каталога<input list="gn-pumps" placeholder="ID или модель" value={trialPump} onChange={e => {
            const value = e.target.value;
            setTrialPump(value);
            const pump = pumps.find(p => p.id === value || p.model === value);
            if (pump) setJson(JSON.stringify({
              catalog: catalogPumpPort(pump.id, side, pump),
              override: null
            }, null, 2));
          }} /><datalist id="gn-pumps">{pumps.filter(p => !trialPump || p.model.toLowerCase().includes(trialPump.toLowerCase()) || p.id === trialPump).slice(0, 60).map(p => <option key={p.id} value={p.id}>{p.manufacturer} {p.model}</option>)}</datalist></label>}
      <label>Входы (JSON)<textarea rows={12} value={json} onChange={e => setJson(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="gn-primary" disabled={busy} onClick={test}>Выполнить</button></section></div>}
    {impact && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Проверка публикации"><header><h2>Публикация графа</h2><button onClick={() => setImpact(null)}>Закрыть</button></header><p>Граф проверен. Версия будет доступна штатным расчётам.</p>
      {!!impact.length && <><h3>Экземпляры изменённых типов</h3>{impact.map(item => <details key={item.diagram + item.node}><summary>{item.graph} → {item.name} · связей {item.links.length}</summary>{item.links.map(e => <div key={e.from + e.out + e.to + e.input}>{e.from}.{e.out} → {e.to}.{e.input}</div>)}<button onClick={() => locate(item)}>Перейти к узлу</button></details>)}</>}
      <button className="gn-primary" disabled={busy} onClick={() => save("publish")}>Подтвердить публикацию</button></section></div>}
    {versions && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Версии"><header><h2>Публикации</h2><button onClick={() => setVersions(false)}>Закрыть</button></header>{state.versions.map(v => <p key={v.id}>{v.created} · {v.author}<br /><code>{v.id}</code> {v.id === state.active ? "Действующая" : <button disabled={busy} onClick={() => save("rollback", v.id)}>Восстановить</button>}</p>)}</section></div>}
    {samples && type && node && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Выбор записи каталога"><header><h2>{type.name}</h2><button onClick={() => setSamples(false)}>Закрыть</button></header><input value={sampleQuery} onChange={e => setSampleQuery(e.target.value)} placeholder="Модель или наименование" />{sampleRows.map(r => <button key={r.id} onClick={async () => {
          try {
            const hit = await request(api + "?category=" + encodeURIComponent(type.id) + "&id=" + encodeURIComponent(r.id));
            if (!hit) throw Error("Запись недоступна");
            updateNode(node.id, {
              values: hit.values,
              catalog: {
                id: r.id,
                name: r.name,
                overridden: []
              }
            });
            setSamples(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}>{r.name}</button>)}</section></div>}
  </main>;
}
