"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { classification, layout, WIDTH, type Address, type Frame } from "./canvas-layout";
import { ROOT } from "./hierarchy";
import type { Diagram, Document, Edge, Field } from "./schema";
import { connectionFeedback } from "./connection-feedback";
import "./canvas-interactions.css";
type Camera = Frame & {
  open: string[];
};
export type Focus = Address & {
  base: string;
  serial: number;
};
type Props = {
  connectionCheck?: (graph:Diagram,edge:Edge)=>string;
  connect?: (graph: Diagram, edge: Edge, at: Address) => void;
  describe?: (at: Address) => { name?: string; summary?: string; status?: string };
  inspect?: (at: Address, field: Field, direction: "input" | "output") => string;
  highlight?: Set<string>;
  root?:string;
  overviewLabel?:string;
  doc: Document;
  active: Address;
  focus: Focus | null;
  storageKey: string;
  eligible: Set<string> | null;
  select: (at: Address) => void;
  context: (at: Address, x: number, y: number) => void;
  move: (graph: Diagram, node: string, x: number, y: number) => void;
  unlink: (graph: Diagram, edge: Edge) => void;
  overview: () => void;
};
const origin: Frame = {
  x: 0,
  y: 0,
  k: 1
};
const PORT_NAMES: Record<string,string> = {
  values: "Значения проекта",
  defaults: "Базовые значения",
  role: "Роль пользователя",
  scope: "Контур",
  active: "Участвует в расчёте",
  binding: "Поле формы",
  context: "Контекст"
};
const portName = (field: Field) => field.name === field.key ? PORT_NAMES[field.key] ?? field.name : field.name;
const curve = (x: number, y: number, u: number, v: number) => {
  const d = Math.max(32, Math.abs(u - x) * .46);
  return "M" + x + "," + y + " C" + (x + d) + "," + y + " " + (u - d) + "," + v + " " + u + "," + v;
};
export function Canvas({
  doc,
  root=ROOT,
  overviewLabel="Показать всю станцию",
  active,
  focus,
  storageKey,
  eligible,
  select,
  context,
  move,
  unlink,
  overview,
  connect,
  connectionCheck,
  describe,
  inspect,
  highlight
}: Props) {
  const checkConnection=(graph:Diagram,edge:Edge)=>connectionCheck?connectionCheck(graph,edge):connectionFeedback(graph,doc.types,edge);
  const el = useRef<HTMLDivElement>(null);
  const model = useMemo(() => layout(doc), [doc]);
  const [base, setBase] = useState(root);
  const [cam, setCam] = useState<Camera>({
    ...origin,
    open: []
  });
  const saveKey = "gn.camera.2." + storageKey;
  const lastFocus = useRef<Focus | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    scale: number;
    node?: string;
    graph: Diagram;
    nx: number;
    ny: number;
    moved: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{
    g: string;
    n: string;
    x: number;
    y: number;
  } | null>(null);
  const [wire, setWire] = useState<{
    graph: Diagram;
    at: Address;
    out: string;
    x: number;
    y: number;
    u: number;
    v: number;
    target?: string;
    input?: string;
    problem?: string;
  } | null>(null);
  const wireRef = useRef(wire);
  useLayoutEffect(() => { wireRef.current = wire; }, [wire]);
  const [connectionMessage, setConnectionMessage] = useState("");
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWire(null);
        setConnectionMessage("");
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const highlighted = (key: string) => !highlight?.size || [...highlight].some(p => p === key || p.startsWith(key + "/"));
  function wireStart(event: PointerEvent, graph: Diagram, at: Address, field: Field) {
    if (!connect || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = null;
    const bounds = el.current!.getBoundingClientRect();
    const pin = event.currentTarget.querySelector("i")!.getBoundingClientRect();
    el.current!.setPointerCapture(event.pointerId);
    setConnectionMessage("");
    select(at);
    setWire({ graph, at, out: field.key, x: pin.x + pin.width / 2 - bounds.x, y: pin.y + pin.height / 2 - bounds.y, u: event.clientX - bounds.x, v: event.clientY - bounds.y });
  }
  function wireTarget(event: PointerEvent, current: NonNullable<typeof wire>) {
    const pin = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-port-direction]");
    if (!pin || pin.dataset.portDirection !== "input") return {};
    if (pin.dataset.portGraph !== current.at.graph || pin.dataset.portPath !== current.at.path.join("/")) return { problem: "Соедините порты одного уровня. Для границы Instrument используйте его внешний порт" };
    const target = pin.dataset.portNode!, input = pin.dataset.portKey!;
    return { target, input, problem: checkConnection(current.graph, { from: current.at.node, out: current.out, to: target, input }) };
  }
  const fit = useCallback((id = root) => {
    if (!el.current) return;
    const g = model.diagrams.get(id);
    if (!g) return;
    const b = model.size(g),
      w = el.current.clientWidth,
      h = el.current.clientHeight,
      k = Math.max(.04, Math.min(1.15, (w - 52) / b.w, (h - 64) / b.h));
    setBase(id);
    setCam({
      k,
      x: (w - b.w * k) / 2 - b.x * k,
      y: (h - b.h * k) / 2 - b.y * k,
      open: []
    });
  }, [model,root]);
  const initialized = useRef("");
  useLayoutEffect(() => {
    if (initialized.current === saveKey) return;
    const handle = requestAnimationFrame(() => {
      initialized.current = saveKey;
      try {
        const s = JSON.parse(localStorage.getItem(saveKey) ?? "null");
        if (s && s.base === root && [s.x, s.y, s.k].every(Number.isFinite) && s.k > 0 && Array.isArray(s.open)) {
          setCam(s);
          return;
        }
      } catch {/* Fit the station when saved camera data is damaged. */}
      fit(root);
    });
    return () => cancelAnimationFrame(handle);
  }, [fit, saveKey,root]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (base === root) try {
        localStorage.setItem(saveKey, JSON.stringify({
          ...cam,
          base
        }));
      } catch {/* Storage may be unavailable in a private window. */}
    }, 150);
    return () => clearTimeout(timer);
  }, [cam, base, saveKey,root]);
  useLayoutEffect(() => {
    if (!focus || lastFocus.current === focus || !el.current) return;
    const host = el.current;
    const handle = requestAnimationFrame(() => {
      lastFocus.current = focus;
      if (!focus.node && !focus.path.length) {
        fit(focus.base);
        return;
      }
      const {
          graph,
          frame
        } = model.at(focus.base, focus.path),
        n = graph.nodes.find(n => n.id === focus.node);
      const b = model.size(graph),
        w = host.clientWidth,
        h = host.clientHeight;
      const k = (n ? Math.min(1.18, (w - 80) / WIDTH) : Math.min((w - 60) / b.w, (h - 70) / b.h)) / frame.k;
      const x = frame.x + frame.k * (n ? n.x + WIDTH / 2 : b.x + b.w / 2),
        y = frame.y + frame.k * (n ? n.y + model.card(graph, n).h / 2 : b.y + b.h / 2);
      setBase(focus.base);
      setCam({
        x: w / 2 - x * k,
        y: h / 2 - y * k,
        k,
        open: focus.path.map((_, i) => focus.path.slice(0, i + 1).join("/"))
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [focus, fit, model]);
  const zoom = useCallback((factor: number, x: number, y: number, under?: HTMLElement | null) => {
    setCam(prev => {
      const k = Math.max(.025, Math.min(1e7, prev.k * factor)),
        ratio = k / prev.k;
      const open = new Set(prev.open);
      if (under && el.current?.contains(under)) {
        const key = under.dataset.address;
        if (key && under.dataset.child && WIDTH * Number(under.dataset.scale) * k > 375 && factor > 1) open.add(key);
      }
      if (factor < 1) for (const path of open) {
        const parent = path.split("/").slice(0, -1);
        if (WIDTH * model.at(base, parent).frame.k * k < 310) open.delete(path);
      }
      return {
        x: x - (x - prev.x) * ratio,
        y: y - (y - prev.y) * ratio,
        k,
        open: [...open]
      };
    });
  }, [base, model]);
  useEffect(() => {
    const host = el.current;
    if (!host) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = host.getBoundingClientRect();
      zoom(Math.exp(-Math.max(-500, Math.min(500, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * .0025), e.clientX - r.left, e.clientY - r.top, (e.target as HTMLElement).closest<HTMLElement>("[data-address]"));
    };
    host.addEventListener("wheel", wheel, {
      passive: false
    });
    return () => host.removeEventListener("wheel", wheel);
  }, [zoom]);
  function start(e: PointerEvent, graph: Diagram, frame: Frame, n?: Diagram["nodes"][number]) {
    if (e.button !== 0 && e.button !== 1) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      cx: cam.x,
      cy: cam.y,
      scale: frame.k * cam.k,
      node: e.button === 0 ? n?.id : undefined,
      graph,
      nx: n?.x ?? 0,
      ny: n?.y ?? 0,
      moved: false
    };
  }
  function motion(e: PointerEvent) {
    const current = wireRef.current;
    if (current) {
      const bounds = el.current!.getBoundingClientRect();
      setWire({ ...current, target: undefined, input: undefined, problem: undefined, u: e.clientX - bounds.x, v: e.clientY - bounds.y, ...wireTarget(e, current) });
      return;
    }
    const p = gesture.current;
    if (!p) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !p.moved) return;
    p.moved = true;
    if (p.node) setDrag({
      g: p.graph.id,
      n: p.node,
      x: p.nx + dx / p.scale,
      y: p.ny + dy / p.scale
    });else setCam(v => ({
      ...v,
      x: p.cx + dx,
      y: p.cy + dy
    }));
  }
  function end(e: PointerEvent) {
    const current = wireRef.current;
    if (current) {
      const target = wireTarget(e, current);
      if (target.target && target.input && !target.problem) {
        connect?.(current.graph, { from: current.at.node, out: current.out, to: target.target, input: target.input }, current.at);
      } else if (target.problem) setConnectionMessage(target.problem);
      setWire(null);
      return;
    }
    const p = gesture.current;
    if (p?.moved && p.node) move(p.graph, p.node, p.nx + (e.clientX - p.x) / p.scale, p.ny + (e.clientY - p.y) / p.scale);
    setDrag(null);
    gesture.current = null;
  }
  function layer(g: Diagram, path: string[], frame: Frame): ReactNode {
    const candidateLevel = wire?.at.graph === g.id && wire.at.path.join("/") === path.join("/");
    const cards = g.nodes.map(n => {
      const card = model.card(g, drag?.g === g.id && drag.n === n.id ? {
      ...n,
      x: drag.x,
      y: drag.y
      } : n);
      if (!candidateLevel) return card;
      const ins = [...card.ins, ...card.type.fields.filter(f => f.direction !== "output" && !card.ins.some(p => p.key === f.key))];
      return { ...card, ins, h: Math.max(card.h, 64 + 27 * Math.max(ins.length, card.outs.length)) };
    });
    const byId = new Map(cards.map(c => [c.n.id, c]));
    return <><svg className="gn-wires" aria-label="Связи">{g.edges.map((e, i) => {
          const a = byId.get(e.from),
            b = byId.get(e.to);
          if (!a || !b) return null;
          const d = curve(a.n.x + WIDTH, a.n.y + 71 + 27 * a.outs.findIndex(f => f.key === e.out), b.n.x, b.n.y + 71 + 27 * b.ins.findIndex(f => f.key === e.input));
          const out = a.type.fields.find(f => f.key === e.out);
          const source = { graph: g.id, path, node: a.n.id };
          const title = (inspect && out ? inspect(source, {...out, name:portName(out)}, "output") + "\n" : "") + a.n.name + " → " + b.n.name;
          const lit = highlighted([...path, a.n.id].join("/")) && highlighted([...path, b.n.id].join("/"));
          return <g key={i} className={lit ? "" : "gn-flow-dim"}><path data-kind={e.kind??(a.type.fields.find(f=>f.key===e.out)?.meaning==="parameterBinding"?"binding":a.type.fields.find(f=>f.key===e.out)?.meaning==="saveCommand"?"command":"data")} className="gn-wire" d={d} /><path className="gn-hit" d={d} onDoubleClick={() => unlink(g, e)} onContextMenu={event => {
              event.preventDefault();
              event.stopPropagation();
              unlink(g, e);
            }}><title>{title}</title></path></g>;
        })}</svg>{cards.map(({
        n,
        type,
        ins,
        outs,
        child,
        h
      }) => {
        const key = [...path, n.id].join("/"),
          at = {
            path,
            graph: g.id,
            node: n.id
          },
          expanded = !!child && cam.open.includes(key) && path.length < 15;
        const sel = active.node === n.id && active.graph === g.id && active.path.join("/") === path.join("/");
        const next = child ? model.nested(frame, g, n, child) : frame;
        const description = describe?.(at);
        const port = (f: Field, direction: "input" | "output") => {
          const problem = candidateLevel && direction === "input" ? checkConnection(g, { from: wire!.at.node, out: wire!.out, to: n.id, input: f.key }) : "";
          const candidate = candidateLevel && direction === "input";
          const name=portName(f);
          const tooltip = (inspect?.(at, {...f,name}, direction) ?? [name, f.kind, f.unit].filter(Boolean).join(" · ")) + (candidate ? "\n" + (problem || "Совместимый вход") : "");
          return <div title={tooltip} className={(direction === "input" ? "gn-in" : "gn-out") + (connect ? " gn-port-interactive" : "") + (candidate ? problem ? " gn-port-incompatible" : " gn-port-compatible" : "")} key={f.key} data-port-direction={direction} data-port-graph={g.id} data-port-path={path.join("/")} data-port-node={n.id} data-port-key={f.key} onPointerDown={direction === "output" && connect ? e => wireStart(e, g, at, f) : undefined}>{direction === "input" && <i />}{name}{direction === "output" && <i />}</div>;
        };
        return <div key={n.id} className={"gn-node station-card " + (highlighted(key) ? "" : "gn-flow-dim ") + (sel ? "selected " : "") + (eligible?.has(n.id) && g.id === active.graph ? "eligible " : "") + (expanded ? "expanded" : "")} role="button" tabIndex={0} aria-label={description?.name ?? n.name} onKeyDown={e => {
          if (e.key === "Enter") {
            e.stopPropagation();
            select(at);
          }
        }} data-section={type.section} data-address={key} data-child={child?.id} data-scale={frame.k} data-node={n.id} style={{
          left: n.x,
          top: n.y,
          width: WIDTH,
          height: h
        }} onPointerDown={e => {
          start(e, g, frame, n);
          if (e.button === 0) select(at);
        }} onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          context(at, e.clientX, e.clientY);
        }}>
        <header className={frame.k * cam.k < .58 ? "station-overview" : undefined} style={{
            fontSize: Math.min(31, Math.max(16, 11 / (frame.k * cam.k))),
            visibility: expanded && frame.k * cam.k > 2 ? "hidden" : undefined
          }}><small>{child ? "Instrument · " : ""}{classification(type)}</small><strong>{description?.name ?? n.name}</strong>{description?.summary && <span className="gn-node-summary" title={description.summary}>{description.summary}</span>}{description?.status && <span className="gn-node-state" title={description.status}>{description.status}</span>}</header>
        {expanded && child && <svg className="station-boundaries" width={WIDTH} height={h}>{[...ins.map((f, i) => ({
              f,
              i,
              input: true
            })), ...outs.map((f, i) => ({
              f,
              i,
              input: false
            }))].map(({
              f,
              i,
              input
            }) => {
              const n = child.nodes.find(n => n.id === (input ? "source" : "result"));
              if (!n) return null;
              const c = model.card(child, n),
                idx = (input ? c.outs : c.ins).findIndex(p => p.key === f.key);
              if (idx < 0) return null;
              const z = next.k / frame.k,
                x = (next.x - frame.x) / frame.k - cards.find(c => c.n.id === at.node)!.n.x + z * (n.x + (input ? WIDTH : 0)),
                y = (next.y - frame.y) / frame.k - cards.find(c => c.n.id === at.node)!.n.y + z * (n.y + 71 + 27 * idx);
              return <path key={(input ? "in" : "out") + f.key} d={input ? curve(0, 71 + 27 * i, x, y) : curve(x, y, WIDTH, 71 + 27 * i)}><title>{f.name}</title></path>;
            })}</svg>}
        {expanded && child ? <div className="station-inside" style={{
            transform: "translate(" + ((next.x - frame.x) / frame.k - n.x) + "px," + ((next.y - frame.y) / frame.k - n.y) + "px) scale(" + next.k / frame.k + ")"
          }}>{layer(child, [...path, n.id], next)}</div> : <><div className="gn-ports"><div>{ins.map(f => port(f, "input"))}</div><div>{outs.map(f => port(f, "output"))}</div></div>{!child && Object.keys(type.formulas).length > 0 && <small className="station-formula">{Object.values(type.formulas).join(" · ")}</small>}</>}
        {expanded && connect && frame.k * cam.k <= 2 && <div className="gn-ports gn-expanded-ports"><div>{ins.map(f => port(f, "input"))}</div><div>{outs.map(f => port(f, "output"))}</div></div>}
      </div>;
      })}</>;
  }
  const graph = model.diagrams.get(base) ?? doc.diagrams[0];
  const selectedFrame = model.at(base, active.path);
  const levelScale = selectedFrame.graph.id === active.graph ? selectedFrame.frame.k : 1;
  return <div className="gn-canvas" ref={el} onPointerDown={e => start(e, graph, origin)} onPointerMove={motion} onPointerUp={end} onPointerCancel={() => {
    gesture.current = null;
    setDrag(null);
    setWire(null);
  }}>
    <div className="gn-world" style={{
      transform: "translate(" + cam.x + "px," + cam.y + "px) scale(" + cam.k + ")"
    }}>{layer(graph, [], origin)}</div>
    {wire && <><svg className="gn-wire-preview" aria-hidden="true"><path className="gn-wire" d={curve(wire.x, wire.y, wire.u, wire.v)} /></svg><div className="gn-connection-hint" role="status">{wire.problem || (wire.target ? "Отпустите для подключения" : "Перетащите к входному порту. Escape — отмена")}</div></>}
    {!wire && connectionMessage && <div className="gn-connection-hint" role="alert">{connectionMessage}<button onClick={() => setConnectionMessage("")} aria-label="Закрыть сообщение соединения">×</button></div>}
    <div className="gn-controls" onPointerDown={e => e.stopPropagation()}><button onClick={() => {
        overview();
        fit(root);
      }}>{overviewLabel}</button><span title={"Масштаб выбранного уровня. Общий масштаб полотна · " + Math.round(cam.k * 100) + "%"}>{Math.round(cam.k * levelScale * 100)}%</span><small className="station-legend">Ввод · Обработка и отображение · Вывод</small></div>
  </div>;
}
