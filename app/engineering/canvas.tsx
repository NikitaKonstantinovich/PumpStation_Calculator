"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { classification, layout, WIDTH, type Address, type Frame } from "./canvas-layout";
import { ROOT } from "./hierarchy";
import type { Diagram, Document, Edge } from "./schema";
type Camera = Frame & {
  open: string[];
};
export type Focus = Address & {
  base: string;
  serial: number;
};
type Props = {
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
  overview
}: Props) {
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
    const p = gesture.current;
    if (p?.moved && p.node) move(p.graph, p.node, p.nx + (e.clientX - p.x) / p.scale, p.ny + (e.clientY - p.y) / p.scale);
    setDrag(null);
    gesture.current = null;
  }
  function layer(g: Diagram, path: string[], frame: Frame): ReactNode {
    const cards = g.nodes.map(n => model.card(g, drag?.g === g.id && drag.n === n.id ? {
      ...n,
      x: drag.x,
      y: drag.y
    } : n));
    const byId = new Map(cards.map(c => [c.n.id, c]));
    return <><svg className="gn-wires" aria-label="Связи">{g.edges.map((e, i) => {
          const a = byId.get(e.from),
            b = byId.get(e.to);
          if (!a || !b) return null;
          const d = curve(a.n.x + WIDTH, a.n.y + 71 + 27 * a.outs.findIndex(f => f.key === e.out), b.n.x, b.n.y + 71 + 27 * b.ins.findIndex(f => f.key === e.input));
          return <g key={i}><path data-kind={e.kind??(a.type.fields.find(f=>f.key===e.out)?.meaning==="parameterBinding"?"binding":a.type.fields.find(f=>f.key===e.out)?.meaning==="saveCommand"?"command":"data")} className="gn-wire" d={d} /><path className="gn-hit" d={d} onDoubleClick={() => unlink(g, e)} onContextMenu={event => {
              event.preventDefault();
              event.stopPropagation();
              unlink(g, e);
            }}><title>{a.n.name} → {b.n.name}</title></path></g>;
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
        return <div key={n.id} className={"gn-node station-card " + (sel ? "selected " : "") + (eligible?.has(n.id) && g.id === active.graph ? "eligible " : "") + (expanded ? "expanded" : "")} role="button" tabIndex={0} aria-label={n.name} onKeyDown={e => {
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
            fontSize: Math.min(31, Math.max(16, 11 / (frame.k * cam.k)))
          }}><small>{child ? "Instrument · " : ""}{classification(type)}</small><strong>{n.name}</strong></header>
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
          }}>{layer(child, [...path, n.id], next)}</div> : <><div className="gn-ports"><div>{ins.map(f => <div title={f.name} className="gn-in" key={f.key}><i />{f.name}</div>)}</div><div>{outs.map(f => <div title={f.name} className="gn-out" key={f.key}>{f.name}<i /></div>)}</div></div>{!child && Object.keys(type.formulas).length > 0 && <small className="station-formula">{Object.values(type.formulas).join(" · ")}</small>}</>}
      </div>;
      })}</>;
  }
  const graph = model.diagrams.get(base) ?? doc.diagrams[0];
  return <div className="gn-canvas" ref={el} onPointerDown={e => start(e, graph, origin)} onPointerMove={motion} onPointerUp={end} onPointerCancel={() => {
    gesture.current = null;
    setDrag(null);
  }}>
    <div className="gn-world" style={{
      transform: "translate(" + cam.x + "px," + cam.y + "px) scale(" + cam.k + ")"
    }}>{layer(graph, [], origin)}</div>
    <div className="gn-controls" onPointerDown={e => e.stopPropagation()}><button onClick={() => {
        overview();
        fit(root);
      }}>{overviewLabel}</button><span>{Math.round(cam.k * 100)}%</span><small className="station-legend">Ввод · Обработка и отображение · Вывод</small></div>
  </div>;
}
