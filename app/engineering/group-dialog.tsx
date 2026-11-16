"use client";

import { useState } from "react";
import { encapsulate, type Boundary } from "./hierarchy";
import type { Diagram, Document } from "./schema";
export function GroupDialog({
  doc,
  graph,
  initial,
  close,
  save
}: {
  doc: Document;
  graph: Diagram;
  initial: string;
  close: () => void;
  save: (document: Document, id: string) => void;
}) {
  const [name, setName] = useState(""),
    [ids, setIds] = useState<string[]>([initial].filter(id => id && id !== "source" && id !== "result")),
    [extra, setExtra] = useState<string[]>([]),
    [error, setError] = useState("");
  const ports: {
    p: Boundary;
    required: boolean;
    label: string;
  }[] = [];
  for (const n of graph.nodes.filter(n => ids.includes(n.id))) {
    const type = doc.types.find(t => t.id === n.type)!;
    for (const f of type.fields) for (const direction of ["input", "output"] as const) {
      if (f.direction !== "both" && f.direction !== direction) continue;
      const related = graph.edges.filter(e => direction === "input" ? e.to === n.id && e.input === f.key : e.from === n.id && e.out === f.key);
      if (direction === "input" && related.some(e => ids.includes(e.from))) continue;
      ports.push({
        p: {
          key: n.id + "_" + f.key + (f.direction === "both" ? "_" + direction : ""),
          node: n.id,
          field: f.key,
          direction
        },
        required: related.some(e => !ids.includes(direction === "input" ? e.from : e.to)),
        label: n.name + " · " + f.name
      });
    }
  }
  return <div className="gn-shade"><section className="gn-dialog" role="dialog" aria-label="Собрать Instrument"><header><h2>Собрать Instrument</h2><button onClick={close}>Закрыть</button></header>
  <label>Название<input value={name} onChange={e => setName(e.target.value)} /></label>
  <fieldset><legend>Внутренние узлы</legend>{graph.nodes.filter(n => !["source", "result"].includes(n.id)).map(n => <label className="gn-check" key={n.id}><input type="checkbox" checked={ids.includes(n.id)} onChange={e => setIds(e.target.checked ? [...ids, n.id] : ids.filter(id => id !== n.id))} />{n.name}</label>)}</fieldset>
  <fieldset><legend>Внешние порты</legend>{ports.map(({
          p,
          required,
          label
        }) => <label className="gn-check" key={p.key}><input type="checkbox" checked={required || extra.includes(p.key)} disabled={required} onChange={e => setExtra(e.target.checked ? [...extra, p.key] : extra.filter(k => k !== p.key))} />{p.direction === "input" ? "Вход" : "Выход"} · {label}{required ? " · подключён" : ""}</label>)}</fieldset>
  {error && <p role="alert">{error}</p>}<button disabled={!name.trim() || !ids.length} onClick={() => {
        try {
          const r = encapsulate(doc, graph, ids, name.trim(), ports.filter(i => i.required || extra.includes(i.p.key)).map(i => i.p));
          save(r.document, r.id);
        } catch (e) {
          setError((e as Error).message);
        }
      }}>Создать Instrument</button></section></div>;
}
