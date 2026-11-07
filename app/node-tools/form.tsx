"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseNumber } from "./runtime";
import { accepts } from "../engineering/schema";
import { DataTree } from "./data-inspector";
import { diagnosticKey, type Diagnostic, type ParameterBinding, type View } from "./schema";
import { TABLE_COLUMNS } from "./pump-nodes";
import { HydraulicChartView } from "./hydraulic-view";
import { PumpDetailCard } from "./pump-detail-card";
import type { ParameterWrite } from "./schema";
const validationKey = (b: ParameterBinding) => JSON.stringify([b.key, b.mode, b.value, b.field, b.editable, b.active]);
function Input({
  binding: b,
  label,
  hint,
  widget,
  showOrigin = true,
  disabled,
  issues,
  change,
  validity
}: {
  validity: (key: string, valid: boolean) => void;
  binding: ParameterBinding;
  label: string;
  hint?: string;
  widget?: string;
  showOrigin?: boolean;
  disabled: boolean;
  issues: Diagnostic[];
  change: (key: string, value: unknown) => void;
}) {
  const uid = useId(),
    [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState(""),
    [basis, setBasis] = useState(() => validationKey(b) + disabled);
  const field = b.field,
    value = b.value,
    numeric = ["number", "float", "int"].includes(field.kind),
    structured = ["object", "array"].includes(field.kind);
  const pendingKey=validationKey(b);
  useEffect(()=>()=>validity(pendingKey,true),[pendingKey,validity]);
  const signature = pendingKey + disabled;
  if (basis !== signature) {
    setBasis(signature);
    setDraft(null);
    setError("");
  }
  function commit() {
    if (draft === null) return;
    try {
      const next = numeric ? parseNumber(draft, field) : structured ? draft.trim() ? JSON.parse(draft) : null : draft;
      if (!accepts(field, next)) throw Error(field.name + " · требуется значение");
      change(b.key, next);
      setDraft(null);
      setError("");
      validity(validationKey(b), true);
    } catch (e) {
      setError((e as Error).message);
      validity(validationKey(b), false);
    }
  }
  const messages = issues.filter(i => i.key === b.key);
  return <label className={"nt-field " + (field.kind === "boolean" ? "nt-toggle" : "")} htmlFor={uid} data-parameter={b.key}>
    <span>{label || field.name}{field.required && <span aria-label="обязательное поле"> *</span>}</span>
    {structured ? <><textarea id={uid} disabled={disabled} value={draft ?? (value == null ? "" : JSON.stringify(value, null, 2))} onChange={e => {
        setDraft(e.target.value);
        validity(validationKey(b), false);
      }} onBlur={commit} /><DataTree value={value} label={label || field.name} /></> : field.kind === "boolean" || widget === "toggle" ? <input id={uid} type="checkbox" checked={value === true} disabled={disabled} onChange={e => change(b.key, e.target.checked)} /> : field.kind === "enum" || widget === "select" ? <select id={uid} value={value == null ? "" : String(value)} disabled={disabled} onChange={e => change(b.key, e.target.value || null)}><option value="">Выберите…</option>{field.options?.map(v => <option key={v} value={v}>{field.optionNames?.[v] ?? v}</option>)}</select> : <span className="nt-number"><input id={uid} type="text" inputMode={numeric ? "decimal" : undefined} value={draft ?? (value == null ? "" : String(value))} disabled={disabled} onChange={e => {
        setDraft(e.target.value);
        validity(validationKey(b), false);
      }} onBlur={commit} onKeyDown={e => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }} />{field.unit && <small>{field.unit}</small>}</span>}
    {hint && <small>{hint}</small>}{showOrigin && <small className="nt-origin">{b.origin}</small>}
    {(error || messages.length > 0) && <small role="alert">{error || messages.map(m => m.message).join(" · ")}</small>}
  </label>;
}
function DynamicSelect({ view: v, disabled, showOrigin, change }: { view: View; disabled: boolean; showOrigin: boolean; change: (key: string, value: unknown, clearKeys?: string[]) => void }) {
  const id = useId(), b = v.binding;
  if (!b) return <p role="alert">Подключите параметр фильтра</p>;
  return <label className="nt-field" htmlFor={id} data-parameter={b.key}><span>{v.label || b.field.name}</span>
    <select id={id} disabled={disabled || !b.editable || !b.active} value={b.value == null ? "" : String(b.value)} onChange={e => {
      const next = e.target.value || null;
      if ((b.value == null ? null : String(b.value)) === next) return;
      const clearKeys = [...new Set((v.clearBindings ?? []).filter(target => target.key !== b.key && target.toolId === b.toolId && target.mode === "user" && target.editable && target.active && !target.field.required).map(target => target.key))];
      change(b.key, next, clearKeys);
    }}>
      <option value="">{v.hint || "Все"}</option>{v.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>{showOrigin && <small className="nt-origin">{b.origin}</small>}{v.issues?.map(issue => <small role="alert" key={issue.key + issue.message}>{issue.message}</small>)}
  </label>;
}
const cellValue = (value: unknown) => value == null ? "Неизвестно" : typeof value === "boolean" ? value ? "Да" : "Нет" : typeof value === "number" ? value.toLocaleString("ru", { maximumFractionDigits: 3 }) : typeof value === "string" ? value : "Составные данные";
function CandidateTable({ view: v, disabled, showOrigin, change }: { view: View; disabled: boolean; showOrigin: boolean; change: (key: string, value: unknown) => void }) {
  const group = useId(), b = v.binding, state = v.selection;
  if (!b || !state) return <p role="alert">Подключите результаты подбора и параметр выбранного насоса</p>;
  const blocked = disabled || !b.editable || !b.active;
  return <section className="nt-candidates" aria-label={v.label || "Результаты подбора"} data-parameter={b.key}>
    <header><h3>{v.label || "Результаты подбора"}</h3><small>Показано {v.rows?.length ?? 0} из {v.total ?? v.rows?.length ?? 0}</small></header>
    <p role="status" className={state.stale ? "nt-selection-stale" : "nt-selection-status"}>{state.message}{state.stale && state.variantId ? " · " + state.variantId : ""}</p>
    {b.value != null && <button type="button" disabled={blocked} onClick={() => change(b.key, null)}>Сбросить выбор</button>}
    {v.hint && <p>{v.hint}</p>}
    {!!v.rows?.length && <div className="nt-candidate-scroll"><table><thead><tr><th scope="col">Выбор</th>{v.columnsSpec?.map(column => <th scope="col" key={column.key}>{column.label}{column.unit && <small>{column.unit}</small>}</th>)}</tr></thead><tbody>{v.rows.map(row => <tr key={String(row.variantId)} className={state.variantId === row.variantId ? state.stale ? "nt-candidate-stale" : "nt-candidate-selected" : ""}>
      <td><input type="radio" name={group} aria-label={"Выбрать " + String(row.execution || row.model || row.variantId) + " · " + row.variantId} checked={state.variantId === row.variantId} disabled={blocked || row.selectable !== true} onChange={() => change(b.key, { variantId: row.variantId, snapshotId: state.snapshotId, requestKey: state.requestKey })}/>{row.selectable !== true && <small>{String(row.pointIssue || "Нет подтверждённой рабочей точки")}</small>}</td>
      {v.columnsSpec?.map(column => <td key={column.key}>{cellValue(row[column.key])}</td>)}
    </tr>)}</tbody></table></div>}
    {showOrigin && <small className="nt-origin">{b.origin}</small>}
  </section>;
}
const curveValue = (value: unknown) => typeof value === "number" ? String(value).replace(".", ",") : cellValue(value);
function PumpCard({ view: v }: { view: View }) {
  const row = v.rows?.[0], [shownPoints, setShownPoints] = useState(50);
  const points = Array.isArray(row?.curvePoints) ? row.curvePoints as { flow: unknown; head: unknown }[] : [];
  return <section className="nt-pump-card"><h3>{v.label}</h3>{v.hint && <p role="status">{v.hint}</p>}{row && <><dl>{["manufacturer", "series", "model", "execution", "article", "power", "frequencyHz", "inletDn", "outletDn", "variantId"].map(key => <div key={key}><dt>{TABLE_COLUMNS[key]?.label ?? key}{TABLE_COLUMNS[key]?.unit ? " · " + TABLE_COLUMNS[key].unit : ""}</dt><dd>{cellValue(row[key])}</dd></div>)}</dl>
    <details className="nt-used-curve"><summary>Используемая Q/H характеристика</summary>
      <dl><div><dt>Набор характеристик</dt><dd>{cellValue(row.curveSetId)}</dd></div><div><dt>Частота · Гц</dt><dd>{cellValue(row.frequencyHz)}</dd></div><div><dt>Снимок каталога</dt><dd>{cellValue(row.snapshotId)}</dd></div></dl>
      <p>Исходные точки из закреплённого снимка каталога.</p>
      {points.length ? <><div className="nt-curve-scroll"><table aria-label="Точки Q/H характеристики"><thead><tr><th scope="col">Q, м³/ч</th><th scope="col">H, м</th></tr></thead><tbody>{points.slice(0, shownPoints).map((point, index) => <tr key={index}><td>{curveValue(point.flow)}</td><td>{curveValue(point.head)}</td></tr>)}</tbody></table></div><small>Показано {Math.min(points.length, shownPoints)} из {points.length} точек</small>{shownPoints < points.length && <button type="button" onClick={() => setShownPoints(count => count + 50)}>Показать ещё 50 точек</button>}</> : <p>Точки характеристики отсутствуют</p>}
    </details></>}</section>;
}
export function ToolForm({
  view,
  issues,
  change,
  writes,
  save,
  selected,
  select,
  readOnly = false
}: {
  view?: View;
  issues: Diagnostic[];
  change: (key: string, value: unknown, clearKeys?: string[]) => void;
  writes?: (writes: ParameterWrite[]) => void;
  save?: () => void;
  selected?: string;
  select?: (node: string) => void;
  readOnly?: boolean;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const container = useRef<HTMLDivElement>(null),
    scrolled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selected || scrolled.current === selected) return;
    const target = [...(container.current?.querySelectorAll<HTMLElement>("[data-view-node]") ?? [])].find(element => element.dataset.viewNode === selected || element.dataset.bindingNode === selected);
    if (!target) return;
    scrolled.current = selected;
    let parent = target.parentElement;
    while (parent && parent !== container.current) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    target.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  }, [selected, view]);
  function visibleKeys(v: View | undefined, disabled = readOnly): string[] {
    if (!v || v.visible === false) return [];
    const blocked = disabled || v.enabled === false;
    return [...(v.binding && !blocked && v.binding.editable && v.binding.active ? [validationKey(v.binding)] : []), ...(v.children ?? []).flatMap(child => visibleKeys(child, blocked))];
  }
  const blockedDraft = visibleKeys(view).some(key => pending[key]);
  const validity = useCallback((key: string, valid: boolean) => {
    setPending(old => old[key] === !valid ? old : {
      ...old,
      [key]: !valid
    });
  }, []);
  function render(v: View, disabled = false, inheritedShowOrigin = true): React.ReactNode {
    if (v.visible === false) return null;
    const blocked = disabled || v.enabled === false;
    const showOrigin = inheritedShowOrigin && v.showOrigin !== false;
    const choose = (e: React.MouseEvent) => {
      if (select) {
        e.stopPropagation();
        select(v.node);
      }
    };
    const classes = selected && (selected === v.node || selected === v.binding?.node) ? "nt-selected" : "";
    if (["table", "select", "pump-card", "hydraulic-chart", "pump-detail"].includes(v.kind)) return <div key={v.node} data-view-node={v.node} data-binding-node={v.binding?.node} className={classes} role={select ? "button" : undefined} tabIndex={select ? 0 : undefined} onKeyDown={event=>{if(select && event.target===event.currentTarget && event.key==="Enter")select(v.node);}} onClick={choose}>
      {v.kind === "table" ? <CandidateTable view={v} disabled={blocked} showOrigin={showOrigin} change={change}/> : v.kind === "select" ? <DynamicSelect view={v} disabled={blocked} showOrigin={showOrigin} change={change}/> : v.kind === "hydraulic-chart" ? <HydraulicChartView view={v} disabled={blocked} change={change} writes={writes}/> : v.kind === "pump-detail" ? <PumpDetailCard view={v}/> : <PumpCard view={v}/>}
    </div>;
    if (v.kind === "field") {
      if (!v.binding) return <p role="alert">Подключите параметр поля</p>;
      return <div key={v.node} data-view-node={v.node} data-binding-node={v.binding.node} className={classes} style={{
        gridColumn: "span " + Math.min(2, Math.max(1, v.width ?? 1))
      }} role={select ? "button" : undefined} tabIndex={select ? 0 : undefined} onKeyDown={e => {
        if (select && e.target === e.currentTarget && e.key === "Enter") select(v.node);
      }} onClick={choose}><Input validity={validity} binding={v.binding} label={v.label} hint={v.hint} widget={v.widget} showOrigin={showOrigin} disabled={blocked || !v.binding.editable || !v.binding.active} issues={issues} change={change} /></div>;
    }
    if (v.kind === "condition") return <div key={v.node} data-view-node={v.node} className="nt-condition">{v.children?.map(c => render(c, blocked, showOrigin))}</div>;
    if (v.kind === "message") return <p key={v.node} data-view-node={v.node} className={classes}>{v.label}{v.issues?.map(i => <small key={diagnosticKey(i)}>{i.message}</small>)}</p>;
    const children = v.children?.map(c => render(c, blocked, showOrigin));
    if (v.kind === "section" && v.collapsible) return <details key={v.node} data-view-node={v.node} className={"nt-section " + classes}><summary onClick={choose}>{v.label}</summary>{children}</details>;
    if (v.kind === "section") return <section key={v.node} data-view-node={v.node} className={"nt-section " + classes}><h3>{select ? <button type="button" onClick={choose}>{v.label}</button> : v.label}</h3>{children}</section>;
    if (v.kind === "grid") return <div key={v.node} data-view-node={v.node} className={"nt-grid " + classes} style={{
      gridTemplateColumns: "repeat(" + Math.min(3, Math.max(1, v.columns ?? 1)) + ",minmax(0,1fr))"
    }}>{children}</div>;
    return <form key={v.node} data-view-node={v.node} className="nt-form" onSubmit={e => {
      e.preventDefault();
      if (!blockedDraft) save?.();
    }}><h2>{select ? <button type="button" onClick={choose}>{v.label}</button> : v.label}</h2>{children}{v.command && save && <button type="submit" disabled={blockedDraft}>Сохранить значения</button>}</form>;
  }
  return <div ref={container} className="nt-form-root">{view ? render(view, readOnly) : <p>Подключите выход интерфейса инструмента.</p>}</div>;
}
