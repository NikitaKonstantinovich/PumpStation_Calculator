"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas, type Focus } from "../engineering/canvas";
import { layout, type Address } from "../engineering/canvas-layout";
import { usesInStation } from "../engineering/uses";
import { DataTree, FormTree, compactValue } from "./data-inspector";
import { ParameterProperties, SOURCE_NAMES } from "./parameter-properties";
import { addressFromTrace, graphBreadcrumbs, provenance } from "./navigation";
import { ValueEditor } from "./value-editor";
import type { UserRole } from "../user-types";
import { Properties } from "../engineering/properties";
import { TypeEditor } from "../engineering/type-editor";
import { GroupDialog } from "../engineering/group-dialog";
import { type Trace } from "../engineering/engine";
import { compatible, makeField, type Diagram, type Edge, type Field, type GraphNode, type NodeType } from "../engineering/schema";
import { compileTools, parameterType } from "./compiler";
import { evaluatePlan, evaluateProduct, traceNode } from "./runtime";
import { ToolForm } from "./form";
import { applyParameterWrites } from "./form-actions";
import { visualizationSources, addVisualizationTool } from "./visualization-tools";
import { addStationTool, stationToolSources, type StationToolKind } from "./station-tools";
import { deriveTools, productConnectionProblem } from "./product";
import { prepareDocument, addProductTool, updateToolMetadata } from "./authoring";
import { loadCatalog } from "./catalog-client";
import { loadStationCatalog, type StationCatalogResources } from "./station-catalog";
import { unpackTrace } from "./trace-transport";
import type { CatalogSnapshot } from "./catalog-schema";
import { loadTools } from "./workspace";
import { API, ROOT, safeId, diagnosticKey, type ToolDocument, type ToolTest, type TestResult, type Values, type Evaluation } from "./schema";
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
    path?: string[];
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
      path?: string[];
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
  const [template, setTemplate] = useState<null | {kind:"hydraulic"|"card"|StationToolKind;selectionId:string;settingsId:string;secondarySelectionId?:string;dnId?:string;collectorsId?:string}>(null);
  const [dataset, setDataset] = useState<"preview" | "saved" | "test">("preview");
  const [role, setRole] = useState<UserRole>("pro"),
    [sessionRole, setSessionRole] = useState<UserRole>("admin");
  const [baseVersions, setBaseVersions] = useState<Record<string, string>>({}),
    [savedDefaults, setSavedDefaults] = useState<Values | null>(null);
  const [lastTest, setLastTest] = useState<{
    result: Evaluation;
    document: ToolDocument;
    tool: string;
    dataset: {
      version: string;
      revision: number;
      role: UserRole;
      sourceVersions: Record<string, string>;
      values: Values;
    };
  } | null>(null);
  const tools = useMemo(() => doc ? deriveTools(doc) : [], [doc]);
  const tool = tools.find(t => t.id === toolId),
    root = doc?.product?.root ?? tool?.diagram ?? ROOT;
  const [toolValues, setToolValues] = useState<Record<string, Values>>({});
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null),
    [catalogError, setCatalogError] = useState(""),
    [catalogLoading, setCatalogLoading] = useState(false);
  const catalogNeeded = !!doc?.diagrams.some(g => g.nodes.some(n => doc.types.find(t => t.id === n.type)?.operation === "pump.catalog"));
  const stationCatalogNeeded = !!doc?.diagrams.some(g => g.nodes.some(n => doc.types.find(t => t.id === n.type)?.operation === "engineering.catalog"));
  const [stationCatalog, setStationCatalog] = useState<StationCatalogResources | null>(null), [stationCatalogError, setStationCatalogError] = useState(""), [stationCatalogLoading, setStationCatalogLoading] = useState(false);
  const stationBaseKey = JSON.stringify(dataset === "saved" ? project.workspace2?.product?.baseVersions ?? baseVersions : baseVersions);
  const stationSnapshotId = dataset === "saved" ? project.workspace2?.product?.sourceVersions?.station_catalog : undefined;
  const graph = doc?.diagrams.find(g => g.id === at.graph),
    node = graph?.nodes.find(n => n.id === at.node),
    type = doc?.types.find(t => t.id === node?.type);
  const dirty = !!doc && doc !== remote?.draft;
  function accept(next: Remote) {
    const draft = prepareDocument(next.draft);
    setRemote({
      ...next,
      draft
    });
    setDoc(draft);
    const available=deriveTools(draft);setToolId(id=>available.some(t=>t.id===id)?id:available[0]?.id??"");setAt(previous=>draft.diagrams.some(g=>g.id===previous.graph&&(!previous.node||g.nodes.some(n=>n.id===previous.node)))?previous:{graph:draft.product!.root,path:[],node:available[0]?.id??""});
    setHistory([]);
  }
  useEffect(() => {
    let live = true;
    let documentFailed=false;
    request().then(state=>{
      if(!live)return;
      accept(state);
      const ready=prepareDocument(state.draft),first=deriveTools(ready)[0];
      setToolId(first?.id??"");
      setAt({graph:ready.product!.root,path:[],node:first?.id??""});
    }).catch(e=>{if(live){documentFailed=true;setError(e.message);}});
    loadTools().then(data=>{
      if(!live)return;
      setDefaults(data.defaults);setSessionRole(data.role);setBaseVersions(data.baseVersions);
      const sourceErrors=Object.values(data.sourceErrors??{});if(sourceErrors.length&&!documentFailed)setError(sourceErrors.join(" · "));
    }).catch(e=>{if(live&&!documentFailed)setError("Данные предпросмотра недоступны: "+e.message);});
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
        setTemplate(null);
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
  const stored = project.workspace2?.tools[toolId];
  useEffect(() => {
    let active = true;
    setSavedDefaults(null);
    loadTools(undefined, stored?.baseVersions).then(data => {
      if (active) setSavedDefaults(data.defaults);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [stored?.baseVersions]);
  useEffect(() => {
    if (!catalogNeeded) return;
    let live = true;
    const abort = new AbortController();
    setCatalogLoading(true);
    setCatalog(null);
    loadCatalog(dataset === "saved" ? project.workspace2?.product?.sourceVersions?.pump_catalog_v2 : undefined, abort.signal).then(snapshot => {
      if (live) {
        setCatalog(snapshot);
        setCatalogError("");
      }
    }).catch(e => {
      if (live) setCatalogError(e.message);
    }).finally(() => {
      if (live) setCatalogLoading(false);
    });
    return () => {
      live = false;
      abort.abort();
    };
  }, [catalogNeeded, dataset, project.workspace2?.product?.sourceVersions?.pump_catalog_v2]);
  useEffect(() => {
    if (!stationCatalogNeeded || stationBaseKey === "{}") return;
    const abort = new AbortController();
    setStationCatalog(null); setStationCatalogLoading(true); setStationCatalogError("");
    loadStationCatalog(stationSnapshotId, JSON.parse(stationBaseKey), abort.signal).then(snapshot => { if (!abort.signal.aborted) setStationCatalog(snapshot); }).catch(error => { if (!abort.signal.aborted) setStationCatalogError(error.message); }).finally(() => { if (!abort.signal.aborted) setStationCatalogLoading(false); });
    return () => abort.abort();
  }, [stationCatalogNeeded, stationBaseKey, stationSnapshotId]);
  const trial = useMemo(() => {
    if (!doc || !tool) return {
      result: null,
      error: ""
    };
    try {
      const program = compileTools(doc, "preview");
      return {
        result: program.product ? evaluateProduct(program, tool.id, Object.fromEntries(tools.map(t => [t.id, {
          values: dataset === "saved" ? project.workspace2?.tools[t.id]?.values ?? {} : t.id === toolId ? values : toolValues[t.id] ?? {},
          stored: dataset === "saved" ? project.workspace2?.tools[t.id]?.values : undefined,
          defaults: dataset === "saved" ? savedDefaults ?? defaults : defaults,
          role: dataset === "saved" ? sessionRole : role,
          resources: { ...(catalog ? { pump_catalog_v2: catalog } : {}), ...(stationCatalog ? { station_catalog: stationCatalog } : {}) }
        }]))) : evaluatePlan(program.plans[tool.id], {
          values: dataset === "saved" ? stored?.values ?? {} : values,
          stored: dataset === "saved" ? stored?.values : undefined,
          defaults: dataset === "saved" ? savedDefaults ?? defaults : defaults,
          role: dataset === "saved" ? sessionRole : role
        }),
        error: ""
      };
    } catch (e) {
      return {
        result: null,
        error: (e as Error).message
      };
    }
  }, [doc, tool, values, defaults, dataset, stored, savedDefaults, sessionRole, role, tools, toolValues, toolId, project.workspace2, catalog, stationCatalog]);
  const viewed = dataset === "test" ? lastTest?.tool === toolId ? lastTest.result : null : trial.result;
  const stale = dataset === "test" && (JSON.stringify(lastTest?.document) !== JSON.stringify(doc) || !!catalog && !!lastTest?.dataset.sourceVersions.pump_catalog_v2 && lastTest.dataset.sourceVersions.pump_catalog_v2 !== catalog.id || !!stationCatalog && !!lastTest?.dataset.sourceVersions.station_catalog && lastTest.dataset.sourceVersions.station_catalog !== stationCatalog.id);
  const dataStatus = dataset === "test" ? lastTest ? stale ? "Устаревший результат · повторите проверку" : "Последняя серверная проба" : "Проба ещё не выполнена" : dataset === "saved" ? savedDefaults ? "Черновик на сохранённых входах проекта" : "Загрузка сохранённых источников…" : "Предпросмотр на тестовых значениях";
  const chain = useMemo(() => doc ? provenance(doc, root, at) : null, [doc, root, at]);
  function change(next: ToolDocument) {
    if (busy) return;
    setHistory(h => [...h.slice(-39), doc!]);
    setDoc({
      ...next,
      types: next.types.map(t => !["field", "form"].includes(t.operation ?? "") ? t : {
        ...t,
        fields: [...t.fields, ...(t.operation === "form" ? ["showOrigin"] : ["visible", "enabled", "showOrigin"]).filter(key => !t.fields.some(f => f.key === key)).map(key => ({
          ...makeField(key, key === "visible" ? "Показывать в форме" : key === "showOrigin" ? "Показывать источник значения" : "Доступно для ввода", "boolean", "flag"),
          direction: "input" as const,
          initial: true
        }))]
      })
    });
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
  function undo() {
    if (history.length && !busy) {
      setDoc(history.at(-1)!);
      setHistory(history.slice(0, -1));
      setTests(null);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])") || target?.closest("[role=dialog],.gn-dialog,.gn-transfer,.gn-library")) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "F2" && node) {
        e.preventDefault();
        const name = window.prompt("Имя экземпляра", node.name);
        if (name?.trim()) updateNode({
          name: name.trim()
        });
      } else if (e.key === "Delete" && graph && node && !["source", "result"].includes(node.id)) {
        e.preventDefault();
        if (window.confirm("Удалить узел «" + node.name + "» и его связи?")) updateGraph({
          ...graph,
          nodes: graph.nodes.filter(n => n.id !== node.id),
          edges: graph.edges.filter(e => e.from !== node.id && e.to !== node.id)
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function syncOwner(target: Address) {
    const owner = target.path[0] || (target.graph === root ? target.node : undefined);
    if (owner && tools.some(t => t.id === owner) && owner !== toolId) {
      setToolValues(v => ({
        ...v,
        [toolId]: values
      }));
      setValues(toolValues[owner] ?? {});
      setToolId(owner);
    }
  }
  function navigate(target: Address, base = root) {
    syncOwner(target);
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
    syncOwner(target);
    setAt(target);
    setMenu(null);
  }
  const from = graph?.nodes.find(n => n.id === transfer?.from),
    fromType = doc?.types.find(t => t.id === from?.type),
    out = fromType?.fields.find(f => f.key === transfer?.out);
  function inputsFor(n: GraphNode) {
    return doc!.types.find(t => t.id === n.type)!.fields.filter(f => out && compatible(out, f) && !productConnectionProblem(doc!, graph!, {
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
    const problem = productConnectionProblem(doc!, graph, edge);
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
        nodes: [...g.nodes, n],
        edges: t.parameter ? [...g.edges, ...[["workspace2", "values", "value"], ["workspace2", "role", "role"], ["base-values", "defaults", "value"]].flatMap(([source, input, out]) => {
          const src = g.nodes.find(node => doc!.types.find(type => type.id === node.type)?.operation === "source" && node.values.source === source);
          return src ? [{
            from: src.id,
            out,
            to: n.id,
            input
          }] : [];
        })] : g.edges
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
        version,
        tool: toolId,
        values,
        contexts: Object.fromEntries(tools.map(t => [t.id, t.id === toolId ? values : toolValues[t.id] ?? {}])),
        sourceVersions: { ...(catalog ? {pump_catalog_v2:catalog.id} : {}), ...(stationCatalog ? {station_catalog:stationCatalog.id} : {}) }
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
            compactTrace: true,
            document: doc,
            revision: remote.revision,
            tool: toolId,
            values,
            role,
            contexts: Object.fromEntries(tools.map(t => [t.id, t.id === toolId ? values : toolValues[t.id] ?? {}])),
            sourceVersions: { ...(catalog ? {pump_catalog_v2:catalog.id} : {}), ...(stationCatalog ? {station_catalog:stationCatalog.id} : {}) }
          })
        }),
        data = await response.json();
      if (!response.ok) throw new ToolRequestError(data.error, data.location);
      setTests(data.tests);
      setLastTest({
        result: data.traceTransport ? {...data.result,trace:unpackTrace(data.traceTransport)} : data.result,
        document: doc,
        tool: toolId,
        dataset: data.dataset
      });
      setDataset("test");
      setMessage("Проба выполнена. Запись данных представлена как план команды.");
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ToolRequestError) setErrorAt(e.location ?? null);
    } finally {
      setBusy(false);
    }
  }
  const selectedAddress = [...at.path, at.node].join("/");
  function previewSelect(id: string) {
    if (!doc) return;
    const address = addressFromTrace(doc, root, id);
    if (address) navigate(address);
    setProps(true);
  }
  const localTrace = viewed ? traceNode(viewed.trace, at.path) : {} as Trace;
  function newTool() {
    if (!doc) return;
    const name = window.prompt("Название нового инструмента");
    if (!name?.trim()) return;
    const added = addProductTool(doc, name.trim());
    change(added.document);
    setToolValues(v => ({
      ...v,
      [toolId]: values
    }));
    setToolId(added.id);
    setValues({});
    setAt({
      graph: added.document.product!.root,
      path: [],
      node: added.id
    });
    setFocus({
      graph: added.document.product!.root,
      path: [],
      node: added.id,
      base: added.document.product!.root,
      serial: Date.now()
    });
  }
  if (!doc || !remote) return <main className="gn-editor"><header><button onClick={back}>←</button><h1>Нодовый редактор</h1></header><p role="status">{error || "Загрузка определений…"}</p></main>;
  return <main className="gn-editor nt-editor" aria-busy={busy}><header><button aria-label="Открыть меню" onClick={openMain}>☰</button><button onClick={() => {
        if (!dirty || window.confirm("Выйти с несохранённым черновиком?")) back();
      }}>←</button><h1>Нодовый редактор</h1><small>Workspace 2 · черновик {remote.revision}{dirty ? " · изменён" : ""}</small><div className="gn-actions"><button disabled={busy} onClick={() => action("save")}>Сохранить</button><button disabled={busy} onClick={() => action("publish")}>Опубликовать</button><button onClick={() => setProps(!props)}>☰ Свойства</button></div></header>{navigation}
    <div className="gn-toolbar"><select aria-label="Инструмент" value={toolId} onChange={e => {
        const t = tools.find(t => t.id === e.target.value)!;
        navigate({
          graph: root,
          path: [],
          node: t.id
        });
      }}>{tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><select aria-label="Найти параметр" value="" onChange={e => {
        if (e.target.value) {
          navigate(JSON.parse(e.target.value));
          setProps(true);
        }
      }}><option value="">Найти параметр…</option>{doc.types.filter(t => t.parameter).flatMap(t => usesInStation(doc, t.id, root).map(u => <option key={u.path.join("/") + u.node} value={JSON.stringify({
          graph: u.diagram,
          path: u.path,
          node: u.node
        })}>{u.name}</option>))}</select><button onClick={newTool}>＋ Инструмент</button><button onClick={() => {
          const sources = visualizationSources(doc);
          setError("");
          const stationSources = stationToolSources(doc);
          setTemplate({kind:"hydraulic",selectionId:sources.selections[0]?.id??"",settingsId:sources.settings[0]?.id??"",dnId:stationSources.dn[0]?.id,collectorsId:stationSources.collectors[0]?.id});
        }}>Готовые инструменты</button><button onClick={() => setMetadata(true)}>Определение</button><button disabled={!trial.result?.view?.node} onClick={() => previewSelect(trial.result!.view.node)}>Свойства формы</button><button onClick={() => setLibrary(!library)}>＋ Библиотека</button><button onClick={() => {
        if (at.graph === root) {
          const instance = doc.diagrams.find(g => g.id === root)?.nodes.find(n => n.id === toolId),
            inside = doc.types.find(t => t.id === instance?.type)?.instrument;
          if (inside) navigate({
            graph: inside,
            path: [toolId],
            node: "form"
          });
        }
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
      }}>Новый параметр</button><button disabled={!graph || !node || at.graph===root} title={at.graph===root?"Для вложенной группы раскройте инструмент":"Создать внутренний Instrument"} onClick={() => setPack(true)}>Собрать Instrument</button><button disabled={!history.length} onClick={() => {
        setDoc(history.at(-1)!);
        setHistory(history.slice(0, -1));
      }}>↶</button><button disabled={busy} onClick={run}>▷ Проверить</button><button onClick={() => setVersions(true)}>Версии</button><button onClick={() => setPreview(!preview)}>Предпросмотр</button></div>
    {(error || message) && <div className={error ? "gn-error" : "gn-status"} role={error ? "alert" : "status"}>{error || message}{error && errorAt && <button onClick={() => locate(errorAt.graph, errorAt.node ?? "", errorAt.path)}>Перейти к ошибке</button>}{error.includes("другом окне") && <button onClick={() => {
        if (window.confirm("Загрузить сохранённую ревизию?")) void request().then(accept);
      }}>Загрузить актуальную</button>}</div>}
    <nav className="nt-breadcrumbs" aria-label="Путь ноды">{graphBreadcrumbs(doc, root, at).map((c, i) => <span key={i}>{i > 0 && " → "}<button onClick={() => navigate(c.address)}>{c.label}</button></span>)}<small>{type?.instrument ? "Экземпляр Instrument" : at.path.length ? "Внутренний узел общего определения" : "Узел инструмента"}</small></nav>
    <div className="gn-body">{graph && <Canvas overviewLabel="Показать все инструменты" root={root} doc={doc} active={at} focus={focus} storageKey={"product/" + project.project.id} eligible={out ? targets : null} connectionCheck={(g, e) => productConnectionProblem(doc, g, e)} highlight={chain?.ids} describe={target => {
        const g = doc.diagrams.find(g => g.id === target.graph),
          n = g?.nodes.find(n => n.id === target.node),
          t = doc.types.find(t => t.id === n?.type),
          r = viewed?.trace[[...target.path, target.node].join("/")],
          b = viewed?.bindings.find(b => b.node === [...target.path, target.node].join("/")),
          productTool = target.graph === root && !!t?.instrument,
          prefix = [...target.path, target.node].join("/"),
          evaluated = !!viewed && Object.keys(viewed.trace).some(key => key.startsWith(prefix + "/")),
          toolIssues = viewed?.issues.filter(issue => issue.node === prefix || issue.node.startsWith(prefix + "/")) ?? [];
        return {
          name: t?.parameter?.field.name ?? (t?.instrument && typeof n?.values.title === "string" ? n.values.title : n?.id === "source" && t?.fields.some(f => f.key === "context") ? target.path.length ? "Данные инструмента" : "Контекст продукта" : t?.operation === "source" && n?.values.source === "base-values" ? "Базовые значения проекта" : t?.operation === "field" ? "Поле «" + String(n?.values.label || (r?.inputs.binding as {
            field?: Field;
          })?.field?.name || n?.name) + "»" : t?.operation === "grid" ? "Расположение полей" : n?.name),
          summary: b ? b.field.kind + " · " + compactValue(b.field.optionNames?.[String(b.value)] ?? b.value) + (b.field.unit ? " " + b.field.unit : "") + " · " + SOURCE_NAMES[b.mode ?? "user"] : productTool ? t?.description || n?.tool?.category : undefined,
          status: productTool ? n?.tool?.enabled === false ? "Отключён в продукте" : stale ? "Устаревший результат" : toolIssues.length ? "Проверка: " + toolIssues.length + " сообщений" : evaluated ? "Рассчитан для текущих данных" : "Не вычислен в этом предпросмотре" : b ? viewed?.issues.some(i => i.node === b.node) ? "Ошибка проверки" : "Проверено" : stale ? "Устаревший результат" : undefined
        };
      }} inspect={(target, f, direction) => {
        const record = traceNode(viewed?.trace ?? {}, target.path)[target.node];
        const v = direction === "output" ? record?.outputs[f.key] : record?.inputs[f.key];
        return [f.name, f.kind + " · " + f.meaning + " " + f.unit, compactValue(v), "Источник · " + (record?.sources[f.key] ?? "Выход ноды"), dataStatus].join("\n");
      }} connect={(g, edge) => {
        const old = g.edges.find(e => e.to === edge.to && e.input === edge.input);
        if (old && !window.confirm("Вход занят. Заменить источник?")) return;
        const t = doc.types.find(t => t.id === g.nodes.find(n => n.id === edge.from)?.type),
          f = t?.fields.find(f => f.key === edge.out);
        updateGraph({
          ...g,
          edges: [...g.edges.filter(e => e !== old), {
            ...edge,
            kind: f?.meaning === "parameterBinding" ? "binding" : f?.meaning === "saveCommand" ? "command" : "data"
          }]
        });
      }} select={choose} context={(target, x, y) => {
        syncOwner(target);
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
    {props && graph && node && type && <Properties taskMode graph={graph} node={node} type={type} trace={localTrace} update={updateNode} edit={() => setEditing(type)} send={key => setTransfer({
        from: node.id,
        out: key
      })} go={node => navigate({
        ...at,
        node
      })} unlink={e => unlink(graph, e)} test={run} pick={() => {}} group={() => {if(at.graph===root)setError("Вложенные группы создаются внутри инструмента. Сначала раскройте Instrument.");else setPack(true);}} extra={<><p>{type.instrument ? "Общее определение Instrument" : type.parameter ? "Параметр" : type.operation ? "Операция · " + type.name : "Функция"}</p>{type.instrument && <button onClick={() => navigate({
          graph: type.instrument!,
          path: [...at.path, node.id],
          node: ""
        })}>Раскрыть Instrument</button>}{type.instrument && <button onClick={() => setEditing(type)}>Входы и выходы инструмента</button>}{at.graph === root && type.instrument && <ToolProperties node={node} update={updateNode} />}{type.parameter ? <ParameterProperties key={type.id + at.path.join("/")} doc={doc} root={root} at={at} type={type} result={viewed} values={dataset === "test" ? lastTest?.dataset.values ?? {} : dataset === "saved" ? stored?.values ?? {} : values} defaults={dataset === "test" ? (lastTest?.result.trace.source?.outputs.context as {
          defaults?: Values;
        })?.defaults ?? defaults : dataset === "saved" ? savedDefaults ?? defaults : defaults} change={change} go={(address, base) => {
          if (base && base !== root) {
            const selected = tools.find(t => t.diagram === base);
            if (selected) setToolId(selected.id);
            navigate(address, base);
          } else navigate(address);
        }} /> : <><NodeProperties graph={graph} node={node} type={type} update={updateNode} />{type.operation === "field" && <><label><input type="checkbox" aria-label="Показывать в форме" checked={node.values.visible !== false} onChange={e => updateNode({
                values: {
                  ...node.values,
                  visible: e.target.checked
                }
              })} />Показывать в форме</label><label><input type="checkbox" checked={node.values.enabled !== false} onChange={e => updateNode({
                values: {
                  ...node.values,
                  enabled: e.target.checked
                }
              })} />Доступно для ввода</label>{chain?.parameter && <button onClick={() => navigate(chain.parameter!)}>Свойства параметра</button>}</>}{["field", "form"].includes(type.operation ?? "") && <OriginControl graph={graph} node={node} trace={localTrace} update={updateNode} all={type.operation === "form"} />}{Object.keys(type.formulas).length > 0 && <><h4>Выражения</h4>{Object.entries(type.formulas).map(([key, expr]) => <p key={key}>{key} = {expr}</p>)}<button onClick={() => setEditing(type)}>Изменить выражение и входы</button></>}</>}
      <details><summary>К источнику</summary>{chain?.sources.map((d, i) => <button key={i} onClick={() => navigate(d.address)}>{d.label}</button>)}</details><details><summary>К получателям</summary>{chain?.consumers.map((d, i) => <button key={i} onClick={() => navigate(d.address)}>{d.label}</button>)}</details><DataTree value={localTrace[node.id]} label="Данные выбранной ноды" missing={!localTrace[node.id]} status={dataStatus} />{node.id === "source" && <p>context.values — входы инструмента; context.stored — сохранённые значения; context.defaults — базовая публикация; context.role — роль исполнения.</p>}
      {viewed?.issues.filter(i => i.node === [...at.path, node.id].join("/")).map(i => <p key={diagnosticKey(i)} role={i.severity === "error" ? "alert" : "status"}>{i.message}<button onClick={() => previewSelect(i.node)}>Перейти к ошибке</button></p>)}</>} />}
    {preview && <aside className="nt-preview" style={{
        width
      }}><header><strong>Предпросмотр · {tool?.name}</strong><input aria-label="Ширина предпросмотра" type="range" min="280" max="800" value={width} onChange={e => setWidth(Number(e.target.value))} /><button onClick={() => setPreview(false)}>×</button></header>
      {catalogNeeded && <section><strong>Новый каталог насосов</strong><p role="status">{catalogLoading ? catalog ? "Обновляем каталог · используется снимок " + catalog.id.slice(0, 12) : "Загрузка…" : catalogError ? (catalog ? "Не удалось обновить каталог · используется снимок " + catalog.id.slice(0, 12) + ". " : "Ошибка · ") + catalogError : catalog ? catalog.status === "empty" ? "Каталог пуст" : "Загружен снимок " + catalog.id.slice(0, 12) : "Не загружен"}</p><button disabled={catalogLoading} onClick={() => {
            setCatalogLoading(true);
            setCatalogError("");
            loadCatalog(undefined).then(s => {
              setCatalog(s);
              setCatalogError("");
            }).catch(e => setCatalogError(e.message)).finally(() => setCatalogLoading(false));
          }}>Обновить снимок каталога</button>{catalog && <small>{catalog.items.length} исполнений · {catalog.schemaVersion}</small>}</section>}
      {stationCatalogNeeded && <section><strong>Справочники комплектации</strong><p role="status">{stationCatalogLoading ? "Загрузка справочников…" : stationCatalogError ? (stationCatalog ? "Используется предыдущий снимок. " : "") + stationCatalogError : stationCatalog ? "Закреплён снимок " + stationCatalog.id.slice(0, 12) : "Не загружены"}</p><button type="button" disabled={stationCatalogLoading || dataset === "saved"} onClick={() => { setStationCatalogLoading(true); setStationCatalogError(""); loadStationCatalog(undefined, baseVersions).then(setStationCatalog).catch(e => setStationCatalogError(e.message)).finally(() => setStationCatalogLoading(false)); }}>Обновить справочники комплектации</button></section>}
      <label>Данные для просмотра<select aria-label="Данные для просмотра" value={dataset} onChange={e => setDataset(e.target.value as typeof dataset)}><option value="preview">Предпросмотр на тестовых значениях</option><option value="saved">Черновик на сохранённых входах проекта</option><option value="test">Результат последней тестовой пробы</option></select></label><p role="status">{dataStatus}</p><small>Граф · {dataset === "test" ? lastTest?.dataset.version + " / " + lastTest?.dataset.revision : "черновик " + remote.revision + (dirty ? " (изменён)" : "")} · роль {dataset === "test" ? lastTest?.dataset.role : dataset === "saved" ? sessionRole : role}{dataset !== "saved" ? " (симуляция)" : " (сессия)"}</small><details><summary>Версии источников</summary><DataTree value={dataset === "test" ? lastTest?.dataset.sourceVersions : {...(dataset === "saved" ? stored?.baseVersions ?? baseVersions : baseVersions), ...(catalog ? {pump_catalog_v2:catalog.id} : {}), ...(stationCatalog ? {station_catalog:stationCatalog.id} : {})}} label="Используемые версии источников" /></details>
      {dataset !== "saved" && <label>Роль тестовой симуляции<select aria-label="Роль тестовой симуляции" value={role} onChange={e => setRole(e.target.value as UserRole)}>{["base", "plus", "pro", "admin"].map(r => <option key={r}>{r}</option>)}</select></label>}{dataset === "test" && <button onClick={run}>Повторить пробу</button>}
      {dataset !== "test" && trial.error ? <p role="alert">{trial.error}</p> : viewed ? <ToolForm view={viewed.view} issues={viewed.issues} readOnly={dataset !== "preview"} change={(key, value, clearKeys = []) => setValues(v => ({
          ...v,
          ...Object.fromEntries(clearKeys.map(key => [key, null])),
          [key]: value
        }))} writes={writes => {
          if (dataset !== "preview" || !viewed) return;
          try {
            const current = Object.fromEntries(tools.map(t => [t.id, t.id === toolId ? values : toolValues[t.id] ?? {}]));
            const next = applyParameterWrites(current, viewed.bindings, writes, toolId);
            setToolValues(next);
            setValues(next[toolId]);
            setError("");
          } catch(e) { setError((e as Error).message); }
        }} selected={selectedAddress} select={previewSelect} /> : <p>Нет результата для выбранного набора данных.</p>}
      {viewed && <><details><summary>Дерево формы · включая скрытые поля</summary><FormTree view={viewed.view} selected={selectedAddress} select={previewSelect} /></details><DataTree value={viewed.value} label="Действующие данные инструмента" />{viewed.issues.map(i => <p key={diagnosticKey(i)} role={i.severity === "error" ? "alert" : "status"}>{i.message}<button onClick={() => previewSelect(i.node)}>Перейти к ошибке</button></p>)}</>}
      <details><summary>Тестовые значения · расширенный ввод</summary><textarea aria-label="Тестовые значения JSON" key={JSON.stringify(values)} defaultValue={JSON.stringify(values, null, 2)} onBlur={e => {
            try {
              const v = JSON.parse(e.target.value);
              if (!v || typeof v !== "object" || Array.isArray(v)) throw Error();
              setValues(v);
              setError("");
            } catch {
              setError("Нужен JSON-объект входов");
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
      })}>Создать функцию</button>{doc.types.filter(t => !t.id.endsWith(".in") && !t.id.endsWith(".out") && (!t.parameter || t.id === "pump.selectionParameter") && t.name.toLowerCase().includes(search.toLowerCase()) && t.instrument !== graph.id).map(t => <button key={t.id} onClick={() => addType(t)}>{t.name}<small>{t.category}</small></button>)}</section>}
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
    {template && <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Готовый инструмент"><header><h2>Готовый инструмент</h2><button onClick={() => setTemplate(null)}>Закрыть</button></header>
      <label>Инструмент<select value={template.kind} onChange={e => setTemplate({...template,kind:e.target.value as NonNullable<typeof template>["kind"]})}><option value="hydraulic">Гидравлическая кривая</option><option value="card">Карточка насоса</option><option value="dn">Расчёт DN</option><option value="collectors">Конструктор коллекторов</option><option value="specification">Спецификация</option></select></label>
      {["hydraulic", "card", "dn"].includes(template.kind) && <label>Источник выбранного насоса<select value={template.selectionId} onChange={e => setTemplate({...template,selectionId:e.target.value})}><option value="">Выберите инструмент подбора…</option>{visualizationSources(doc).selections.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}
      {["hydraulic", "dn"].includes(template.kind) && <label>Источник настроек проекта<select value={template.settingsId} onChange={e => setTemplate({...template,settingsId:e.target.value})}><option value="">{template.kind === "dn" ? "Выберите настройки проекта…" : "Без изменения рабочей точки на графике"}</option>{visualizationSources(doc).settings.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}
      {template.kind === "dn" && <label>Подбор насоса второго контура<select value={template.secondarySelectionId ?? ""} onChange={e => setTemplate({...template,secondarySelectionId:e.target.value})}><option value="">Не подключён</option>{visualizationSources(doc).selections.filter(s => s.id !== template.selectionId).map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}
      {template.kind === "collectors" && <label>Источник расчёта DN<select value={template.dnId ?? ""} onChange={e => setTemplate({...template,dnId:e.target.value})}><option value="">Выберите расчёт DN…</option>{stationToolSources(doc).dn.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}
      {template.kind === "specification" && <label>Источник коллекторов и параметров установки<select value={template.collectorsId ?? ""} onChange={e => setTemplate({...template,collectorsId:e.target.value})}><option value="">Выберите конструктор коллекторов…</option>{stationToolSources(doc).collectors.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}
      <p>Создаётся отдельный инструмент на общем полотне с редактируемыми внутренними нодами и связями с выбранными источниками.</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || (template.kind === "collectors" ? !template.dnId : template.kind === "specification" ? !template.collectorsId : !template.selectionId || template.kind === "dn" && !template.settingsId)} onClick={() => {
        try {
          const added=template.kind === "hydraulic" || template.kind === "card" ? addVisualizationTool(doc,template.kind,{selectionId:template.selectionId,settingsId:template.settingsId||undefined}) : addStationTool(doc,template.kind,template);
          change(added.document);
          setToolId(added.id);
          setValues({});
          setAt({graph:added.document.product!.root,path:[],node:added.id});
          setFocus({graph:added.document.product!.root,base:added.document.product!.root,path:[],node:added.id,serial:Date.now()});
          setTemplate(null);setProps(true);setPreview(true);
        } catch(e) { setError((e as Error).message); }
      }}>Добавить инструмент</button>
    </section></div>}
    {metadata && tool && <div className="gn-shade"><section className="gn-dialog"><header><h2>Определение инструмента</h2><button onClick={() => setMetadata(false)}>Закрыть</button></header><p>Устойчивый ID · {tool.id}</p><label>Название<input value={tool.name} onChange={e => change(updateToolMetadata(doc, tool.id, {
            name: e.target.value
          }))} /></label><label>Категория<input value={tool.category} onChange={e => change(updateToolMetadata(doc, tool.id, {
            category: e.target.value
          }))} /></label><button onClick={() => {
          setTestJson(JSON.stringify(tool.tests, null, 2));
          setMetadata(false);
        }}>Редактировать проверочные примеры</button></section></div>}
    {testJson !== null && tool && <div className="gn-shade"><section className="gn-dialog"><header><h2>Проверочные примеры</h2><button onClick={() => setTestJson(null)}>Закрыть</button></header><p>Входные values, ожидаемые expected по пути результата, errors с ключами ошибок, tolerance для дробных чисел.</p><textarea rows={18} value={testJson} onChange={e => setTestJson(e.target.value)} /><button onClick={() => {
          try {
            const tests = JSON.parse(testJson) as ToolTest[];
            if (!Array.isArray(tests)) throw Error("Нужен массив примеров");
            change(updateToolMetadata(doc, tool.id, {
              tests
            }));
            setTestJson(null);
          } catch (e) {
            setError((e as Error).message);
          }
        }}>Сохранить примеры в черновик</button></section></div>}
    {tests && <div className="gn-shade"><section className="gn-dialog nt-tests"><header><h2>Проверки определения</h2><button onClick={() => setTests(null)}>Закрыть</button></header><table><tbody>{tests.map(t => <tr key={t.id}><td>{t.passed ? "✓" : "Ошибка"}</td><td>{t.name}</td><td>{t.message}<details><summary>Ожидаемое и фактическое</summary><pre>{JSON.stringify({
                      inputs: t.inputs,
                      expected: t.expected,
                      actual: t.actual
                    }, null, 2)}</pre></details>{!t.passed && t.node && <button onClick={() => {
                  setTests(null);
                  previewSelect(t.node!);
                }}>Перейти к узлу</button>}</td></tr>)}</tbody></table><p>Команда записи · Workspace 2 · пробный запуск</p></section></div>}
    {versions && <div className="gn-shade"><section className="gn-dialog"><header><h2>Публикации Workspace 2</h2><button onClick={() => setVersions(false)}>Закрыть</button></header>{remote.versions.map(v => <p key={v.id}>{v.created} · {v.author}<br />{v.id}{v.id === remote.active ? " · Действующая" : <button onClick={() => action("rollback", v.id)}>Восстановить</button>}</p>)}</section></div>}
  </main>;
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
  const fields = type.fields.filter(f => f.direction !== "output" && !graph.edges.some(e => e.to === node.id && e.input === f.key) && !(type.operation === "field" && ["visible", "enabled", "showOrigin"].includes(f.key) || type.operation === "form" && f.key === "showOrigin") && !["object", "array", "reference"].includes(f.kind));
  return <details open className="nt-settings"><summary>Настройки экземпляра</summary>{fields.map(f => {
      const value = Object.hasOwn(node.values, f.key) ? node.values[f.key] : f.initial;
      const set = (value: unknown) => update({
        values: {
          ...node.values,
          [f.key]: value
        }
      });
      const names: Record<string, string> = {
        label: "Подпись поля",
        hint: "Подсказка",
        width: "Ширина поля в колонках",
        columns: "Количество колонок",
        title: "Заголовок",
        collapsible: "Сворачиваемый раздел",
        widget: "Вид элемента ввода",
        source: "Источник данных",
        visible: "Показывать в форме",
        enabled: "Доступно для ввода"
      };
      const editorField = {
        ...f,
        optionNames: f.optionNames ?? (f.key === "widget" ? {
          auto: "Автоматически",
          number: "Число",
          text: "Текст",
          select: "Список",
          toggle: "Переключатель"
        } : f.key === "source" ? {
          "workspace2": "Данные Workspace 2",
          "base-values": "Базовые значения проекта"
        } : undefined)
      };
      return <ValueEditor key={f.key} field={editorField} value={value} label={names[f.key] ?? f.name} change={set} />;
    })}</details>;
}
function OriginControl({
  graph,
  node,
  trace,
  update,
  all
}: {
  graph: Diagram;
  node: GraphNode;
  trace: Trace;
  update: (patch: Partial<GraphNode>) => void;
  all: boolean;
}) {
  const linked = graph.edges.some(e => e.to === node.id && e.input === "showOrigin");
  return <><label><input type="checkbox" aria-label="Показывать источник значения" checked={(linked ? trace[node.id]?.inputs.showOrigin : node.values.showOrigin) !== false} disabled={linked} title={linked ? "Значение задаётся связью — её можно изменить в расширенных свойствах" : ""} onChange={e => update({
        values: {
          ...node.values,
          showOrigin: e.target.checked
        }
      })} />Показывать источник значения</label>{all && <small>Управляет подписями всех полей инструмента, включая вложенные разделы. Индивидуальные настройки полей сохраняются.</small>}</>;
}
function ToolProperties({
  node,
  update
}: {
  node: GraphNode;
  update: (patch: Partial<GraphNode>) => void;
}) {
  const set = (patch: NonNullable<GraphNode["tool"]>) => update({
    tool: {
      ...node.tool,
      ...patch
    }
  });
  return <fieldset><legend>Инструмент продукта</legend><small>ID · {node.id}</small><label>Категория<input value={node.tool?.category ?? "Ввод"} onChange={e => set({
        category: e.target.value
      })} /></label><label>Порядок<input type="number" value={node.tool?.order ?? 0} onChange={e => set({
        order: Number(e.target.value)
      })} /></label><label><input type="checkbox" checked={node.tool?.enabled !== false} onChange={e => set({
        enabled: e.target.checked
      })} />Доступен в продукте</label></fieldset>;
}
