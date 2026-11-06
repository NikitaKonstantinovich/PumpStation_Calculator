"use client";

import { useRef, useState, type PointerEvent } from "react";
import { display, type Diagram, type Document, type Edge, type GraphNode } from "./schema";
import type { Trace } from "./engine";
type Props = {
  doc: Document;
  graph: Diagram;
  selected: string;
  trace: Trace;
  eligible: Set<string> | null;
  group: string;
  setGroup: (id: string) => void;
  select: (id: string) => void;
  context: (id: string, x: number, y: number) => void;
  move: (id: string, x: number, y: number) => void;
  unlink: (e: Edge) => void;
};
const WIDTH = 245,
  ROW = 27,
  HEADER = 58;
export function Canvas({
  doc,
  graph,
  selected,
  trace,
  eligible,
  group,
  setGroup,
  select,
  context,
  move,
  unlink
}: Props) {
  const [pan, setPan] = useState({
      x: 26,
      y: 35
    }),
    [zoom, setZoom] = useState(.85),
    [ghost, setGhost] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null);
  const [folded, setFolded] = useState<string[]>([]);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const visible = graph.nodes.filter(n => (!group || n.group === group) && (!n.group || !folded.includes(n.group) || n.group === group));
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const ports = (n: GraphNode, out: boolean) => doc.types.find(t => t.id === n.type)!.fields.filter(f => graph.edges.some(e => out ? e.from === n.id && e.out === f.key : e.to === n.id && e.input === f.key));
  const pos = (n: GraphNode) => ghost?.id === n.id ? ghost : n;
  const begin = (e: PointerEvent<HTMLDivElement>, node?: GraphNode) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as Element).closest("button,path")) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: node?.id ?? "",
      startX: e.clientX,
      startY: e.clientY,
      x: node?.x ?? pan.x,
      y: node?.y ?? pan.y,
      moved: false
    };
  };
  const motion = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX,
      dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.id) setGhost({
      id: d.id,
      x: d.x + dx / zoom,
      y: d.y + dy / zoom
    });else setPan({
      x: d.x + dx,
      y: d.y + dy
    });
  };
  const end = (e: PointerEvent) => {
    const d = drag.current;
    if (d?.id) {
      if (d.moved) move(d.id, Math.round(d.x + (e.clientX - d.startX) / zoom), Math.round(d.y + (e.clientY - d.startY) / zoom));else select(d.id);
    }
    drag.current = null;
    setGhost(null);
  };
  const wire = (e: Edge) => {
    const from = nodeMap.get(e.from),
      to = nodeMap.get(e.to);
    if (!from || !to || !visible.includes(from) || !visible.includes(to)) return null;
    const x = pos(from).x + WIDTH,
      y = pos(from).y + HEADER + ROW * (ports(from, true).findIndex(f => f.key === e.out) + .5);
    const endX = pos(to).x,
      endY = pos(to).y + HEADER + ROW * (ports(to, false).findIndex(f => f.key === e.input) + .5);
    const offset = Math.max(45, Math.abs(endX - x) * .48);
    const path = "M " + x + " " + y + " C " + (x + offset) + " " + y + " " + (endX - offset) + " " + endY + " " + endX + " " + endY;
    return <g key={[e.from, e.out, e.to, e.input].join("|")}><path className="gn-wire" d={path} /><path className="gn-hit" d={path} onContextMenu={ev => {
        ev.preventDefault();
        unlink(e);
      }}><title>{from.name + " → " + to.name}</title></path></g>;
  };
  return <div className="gn-canvas" onPointerDown={e => begin(e)} onPointerMove={motion} onPointerUp={end} onPointerCancel={() => {
    drag.current = null;
    setGhost(null);
  }} onWheel={e => {
    const next = Math.min(1.8, Math.max(.28, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
      r = e.currentTarget.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    setPan({
      x: x - (x - pan.x) * next / zoom,
      y: y - (y - pan.y) * next / zoom
    });
    setZoom(next);
  }}>
    <div className="gn-world" style={{
      transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")"
    }}>
      <svg className="gn-wires" aria-label="Связи графа">{graph.edges.map(wire)}</svg>
      {visible.map(n => {
        const t = doc.types.find(t => t.id === n.type)!,
          ins = ports(n, false),
          outs = ports(n, true);
        return <div key={n.id} className={["gn-node", selected === n.id ? "selected" : "", eligible?.has(n.id) ? "eligible" : ""].join(" ")} style={{
          left: pos(n).x,
          top: pos(n).y,
          width: WIDTH
        }} onPointerDown={e => begin(e, n)} onContextMenu={e => {
          e.preventDefault();
          context(n.id, e.clientX, e.clientY);
        }} role="button" tabIndex={0} aria-label={n.name} onKeyDown={e => {
          if (e.key === "Enter") select(n.id);
          if (e.key === "ContextMenu") {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            context(n.id, r.left, r.bottom);
          }
        }}>
          <header><small>{t.category}</small><strong title={n.name}>{n.name}</strong></header>
          <div className="gn-ports">{[ins, outs].map((fields, side) => <div key={side}>{fields.map(f => {
                const v = side ? trace[n.id]?.outputs[f.key] : trace[n.id]?.inputs[f.key];
                return <div key={f.key} className={side ? "gn-out" : "gn-in"} title={f.name + " · " + display(v)}><i />{f.name}<small> {display(v)}</small></div>;
              })}</div>)}</div>
        </div>;
      })}
    </div>
    <div className="gn-controls"><button onClick={() => setZoom(Math.max(.28, zoom / 1.15))}>−</button><button onClick={() => {
        setZoom(.85);
        setPan({
          x: 26,
          y: 35
        });
      }}>{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(Math.min(1.8, zoom * 1.15))}>+</button></div>
    {Object.keys(graph.groups).length > 0 && <div className="gn-groups">{group && <button onClick={() => setGroup("")}>← Весь граф</button>}{Object.entries(graph.groups).map(([id, name]) => <span key={id}><button onClick={() => setGroup(id)}>{name}</button><button aria-label={"Свернуть или развернуть " + name} onClick={() => setFolded(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id])}>{folded.includes(id) ? "▸" : "▾"}</button></span>)}</div>}
  </div>;
}
