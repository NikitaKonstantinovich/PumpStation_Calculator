"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { InsertRequest } from "../component-insert-calculations";
import { emptyEditor, type Assembly } from "./model";
import { insertionComponent } from "./insertion-template";
import { parseInsertionTemplate, type InsertionTemplate } from "./insertion-types";
import type { ViewportHandle } from "./viewport";
import "./editor.css";
const Viewport = lazy(() => import("./viewport"));
const noop = () => {};
export type InsertPreviewRequest = { input: InsertRequest; catalogVersion: string; identityKey: string };
type SavedItem = { id: string; name: string; dnLarge: number; dnSmall: number; pn: number; connections: string; geometry: string; sensor: boolean };
const connectionLabel = (value: string) => ({ flanged: "фланец", collar: "воротник", threaded: "резьба", butt: "стык" })[value] ?? value;
const connectionsLabel = (value: string) => value.split("/").map(connectionLabel).join(" / ");
const geometryLabel = (value: string) => ({ straight: "прямая", concentric: "концентрическая", eccentric: "эксцентрическая" })[value] ?? value;

export function InsertionDetails({ template }: { template: InsertionTemplate }) {
  return <div className="insertion-details">
    <b>{template.status === "incomplete" ? "Неполная геометрия" : "Компоновочный шаблон"}</b>
    <p>Основа {template.geometry.baseLengthMm} мм · Общая длина {template.geometry.totalLengthMm} мм · PN{template.source.pn}</p>
    {template.issues.length > 0 && <details open><summary>Требует уточнения ({template.issues.length})</summary><ul>{template.issues.map(s => <li key={s}>{s}</li>)}</ul></details>}
    <details><summary>Принятые правила и предупреждения</summary><ul>{template.warnings.map(s => <li key={s}>{s}</li>)}</ul></details>
    <details><summary>Состав ({template.geometry.pieces.length})</summary>{template.geometry.pieces.map(p => <div key={p.id}><b>{p.name}</b><p>{p.auxiliary ? "Вспомогательная деталь: исключена из цены и общей длины. " : ""}{({ cad: "CAD", parametric: "Параметрическая геометрия", outline: "Компоновочный контур", missing: "Условный маркер" })[p.fidelity]}</p><small>{p.componentId} · {p.source}</small></div>)}</details>
    <details><summary>Внешние подключения ({template.geometry.ports.length})</summary>{template.geometry.ports.map(p => <p key={p.id}><b>{({ left: "Левый конец", right: "Правый конец", sensor: "Датчик" })[p.id] ?? p.id}</b> · DN{p.dn} PN{p.pn} · {connectionLabel(p.connection)}{p.thread ? ` ${p.thread}${p.gender ? `, ${p.gender === "male" ? "наружная" : "внутренняя"}` : ""}` : ""}<br/>[{p.point.map(n => Number(n.toFixed(3))).join("; ")}] мм · направление [{p.axis.join("; ")}]{p.occupiedBy ? ` · занято: ${p.occupiedBy === "sensor-plug" ? "заглушка" : p.occupiedBy}` : ""}{p.provisional ? " · предварительное положение" : ""}</p>)}</details>
    <small>{template.source.recordId ? `Запись базы: ${template.source.recordId}, ревизия ${template.source.revision}` : "Предпросмотр расчёта: позиция ещё не сохранена в базе."}</small>
  </div>;
}

export function InsertionDialog({ onClose, onAdd, preview, recordId, initialAngle = 0, full = false }: { onClose: () => void; onAdd?: (template: InsertionTemplate) => void; preview?: InsertPreviewRequest; recordId?: string; initialAngle?: number; full?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), viewport = useRef<ViewportHandle>(null);
  const [items, setItems] = useState<SavedItem[]>([]), [id, setId] = useState(recordId ?? ""), [search, setSearch] = useState("");
  const [template, setTemplate] = useState<InsertionTemplate | null>(null), [error, setError] = useState(""), [assetError, setAssetError] = useState("");
  const [angle, setAngle] = useState(initialAngle), [angleDraft, setAngleDraft] = useState(String(initialAngle)), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false);
  const editor = useMemo(() => emptyEditor(), []);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (preview || recordId) return;
    const controller = new AbortController();
    void fetch("/api/component-insertions-3d", { signal: controller.signal, cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data.items as SavedItem[]; }).then(setItems).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [preview, recordId]);
  useEffect(() => {
    if (!preview && !id) return;
    const controller = new AbortController();
    const load = async () => {
      setBusy(true); setError(""); setAssetError(""); setTemplate(null);
      try {
        const r = await fetch(preview ? "/api/component-insertions-3d" : `/api/component-insertions-3d?id=${encodeURIComponent(id)}&angle=${angle}`, { signal: controller.signal, cache: "no-store", ...(preview ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...preview, angle }) } : {}) });
        const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Не удалось подготовить шаблон.");
        const parsed = parseInsertionTemplate(data.template); if (!parsed) throw new Error("Сервер вернул некорректную геометрию шаблона.");
        if (!controller.signal.aborted) setTemplate(parsed);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Ошибка загрузки"); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void load(); return () => controller.abort();
  }, [id, preview, angle, retry]);
  const assembly = useMemo<Assembly>(() => ({ version: 1, sourceFingerprint: "insert-preview", components: template ? [{ ...insertionComponent(template, "insertion-preview"), locked: true }] : [] }), [template]);
  return <dialog ref={dialog} className="insertion-dialog" aria-label="3D-шаблон вставки" onCancel={onClose}>
    <header><b>3D-шаблон вставки</b><button onClick={onClose} aria-label="Закрыть 3D-шаблон">×</button></header>
    {!preview && !recordId && <div><label>Поиск сохранённых вставок<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>Вставка из базы<select value={id} onChange={e => setId(e.target.value)}><option value="">Выберите позицию</option>{items.filter(i => `${i.name} PN${i.pn} ${connectionsLabel(i.connections)} ${geometryLabel(i.geometry)}`.toLowerCase().includes(search.toLowerCase())).map(i => <option key={i.id} value={i.id}>{i.name} · PN{i.pn} · {connectionsLabel(i.connections)} · {geometryLabel(i.geometry)}{i.sensor ? " · сгон" : ""}</option>)}</select></label>{!items.length && <p>Сохранённых вставок нет. Сначала рассчитайте и выгрузите позиции в разделе «Расчёт комплектующих».</p>}</div>}
    {(preview || id) && <div className="insertion-dialog__actions"><label>Поворот эксцентриситета, °<input type="number" min={-360} max={360} value={angleDraft} onChange={e => setAngleDraft(e.target.value)}/></label><button disabled={busy || !angleDraft.trim() || !Number.isFinite(Number(angleDraft)) || Math.abs(Number(angleDraft)) > 360} onClick={() => { setAngle(Number(angleDraft)); setRetry(r => r + 1); }}>Обновить шаблон</button><button onClick={() => viewport.current?.fit()}>Показать всё</button></div>}
    {busy && <p role="status">Подготовка шаблона по серверному расчёту…</p>}{error && <p role="alert">{error}</p>}{assetError && <p role="alert">{assetError}</p>}
    {template && <><h3>{template.source.name}</h3><div className="insertion-dialog__body"><div className="insertion-dialog__stage"><Suspense fallback={<p>Загрузка 3D…</p>}><Viewport ref={viewport} assembly={assembly} selectedId={null} grid={false} snapStep={null} mode="measure" measurement={[]} snaps={editor.objectSnaps} referencePoints={editor.referencePoints} onSelect={noop} onTransform={noop} onPick={noop} onCancel={noop} onLine={noop} onPlane={noop} onCamera={noop} onAssetError={setAssetError}/></Suspense><span className="insertion-dialog__legend">X → ось вставки · Z ↑ · янтарный: компоновочный контур · крест: размер не определён</span></div><InsertionDetails template={template}/></div></>}
    <footer>{onAdd && <button disabled={full || busy || !template || !!error} onClick={() => { if (template) { onAdd(template); onClose(); } }}>{recordId ? "Обновить вставку в сборке" : "Добавить в сборку"}</button>}<button onClick={onClose}>Закрыть</button></footer>
  </dialog>;
}
