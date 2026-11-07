"use client";

import { useId, useState } from "react";
import { parseNumber } from "./runtime";
import { accepts } from "../engineering/schema";
import type { Diagnostic, ParameterBinding, View } from "./schema";
function Input({
  binding: b,
  label,
  hint,
  widget,
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
  disabled: boolean;
  issues: Diagnostic[];
  change: (key: string, value: unknown) => void;
}) {
  const uid = useId(),
    [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState("");
  const field = b.field,
    value = b.value,
    numeric = ["number", "float", "int"].includes(field.kind);
  function commit() {
    if (draft === null) return;
    try {
      const next = numeric ? parseNumber(draft, field) : draft;
      if (!accepts(field, next)) throw Error(field.name + " · требуется значение");
      change(b.key, next);
      setDraft(null);
      setError("");
      validity(b.key, true);
    } catch (e) {
      setError((e as Error).message);
      validity(b.key, false);
    }
  }
  const messages = issues.filter(i => i.key === b.key);
  return <label className={"nt-field " + (field.kind === "boolean" ? "nt-toggle" : "")} htmlFor={uid} data-parameter={b.key}>
    <span>{label || field.name}{field.required && <span aria-label="обязательное поле"> *</span>}</span>
    {field.kind === "boolean" || widget === "toggle" ? <input id={uid} type="checkbox" checked={value === true} disabled={disabled} onChange={e => change(b.key, e.target.checked)} /> : field.kind === "enum" || widget === "select" ? <select id={uid} value={value == null ? "" : String(value)} disabled={disabled} onChange={e => change(b.key, e.target.value || null)}><option value="">Выберите…</option>{field.options?.map(v => <option key={v} value={v}>{field.optionNames?.[v] ?? v}</option>)}</select> : <span className="nt-number"><input id={uid} type="text" inputMode={numeric ? "decimal" : undefined} value={draft ?? (value == null ? "" : String(value))} disabled={disabled} onChange={e => {
        setDraft(e.target.value);
        validity(b.key, false);
      }} onBlur={commit} onKeyDown={e => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }} />{field.unit && <small>{field.unit}</small>}</span>}
    {hint && <small>{hint}</small>}<small className="nt-origin">{b.origin}</small>
    {(error || messages.length > 0) && <small role="alert">{error || messages.map(m => m.message).join(" · ")}</small>}
  </label>;
}
export function ToolForm({
  view,
  issues,
  change,
  save,
  selected,
  select
}: {
  view?: View;
  issues: Diagnostic[];
  change: (key: string, value: unknown) => void;
  save?: () => void;
  selected?: string;
  select?: (node: string) => void;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  function visibleKeys(v: View | undefined): string[] {
    if (!v || v.visible === false) return [];
    return [...(v.binding ? [v.binding.key] : []), ...(v.children ?? []).flatMap(visibleKeys)];
  }
  const blockedDraft = visibleKeys(view).some(key => pending[key]);
  function validity(key: string, valid: boolean) {
    setPending(old => ({
      ...old,
      [key]: !valid
    }));
  }
  function render(v: View, disabled = false): React.ReactNode {
    if (v.visible === false) return null;
    const blocked = disabled || v.enabled === false;
    const choose = (e: React.MouseEvent) => {
      if (select) {
        e.stopPropagation();
        select(v.node);
      }
    };
    const classes = selected && (selected === v.node || selected === v.binding?.node) ? "nt-selected" : "";
    if (v.kind === "field") {
      if (!v.binding) return <p role="alert">Подключите параметр поля</p>;
      return <div key={v.node} className={classes} style={{
        gridColumn: "span " + Math.min(2, Math.max(1, v.width ?? 1))
      }} role={select ? "button" : undefined} tabIndex={select ? 0 : undefined} onKeyDown={e => {
        if (select && e.target === e.currentTarget && e.key === "Enter") select(v.node);
      }} onClick={choose}><Input validity={validity} binding={v.binding} label={v.label} hint={v.hint} widget={v.widget} disabled={blocked || !v.binding.editable || !v.binding.active} issues={issues} change={change} /></div>;
    }
    if (v.kind === "condition") return <div key={v.node} className="nt-condition">{v.children?.map(c => render(c, blocked))}</div>;
    if (v.kind === "message") return <p key={v.node} className={classes}>{v.label}{v.issues?.map(i => <small key={i.key}>{i.message}</small>)}</p>;
    const children = v.children?.map(c => render(c, blocked));
    if (v.kind === "section" && v.collapsible) return <details key={v.node} className={"nt-section " + classes}><summary onClick={choose}>{v.label}</summary>{children}</details>;
    if (v.kind === "section") return <section key={v.node} className={"nt-section " + classes}><h3>{select ? <button type="button" onClick={choose}>{v.label}</button> : v.label}</h3>{children}</section>;
    if (v.kind === "grid") return <div key={v.node} className={"nt-grid " + classes} style={{
      gridTemplateColumns: "repeat(" + Math.min(3, Math.max(1, v.columns ?? 1)) + ",minmax(0,1fr))"
    }}>{children}</div>;
    return <form key={v.node} className="nt-form" onSubmit={e => {
      e.preventDefault();
      if (!blockedDraft) save?.();
    }}><h2>{v.label}</h2>{children}{v.command && save && <button type="submit" disabled={blockedDraft}>Сохранить значения</button>}</form>;
  }
  return view ? render(view) : <p>Подключите выход интерфейса инструмента.</p>;
}
