"use client";

import { useState } from "react";
import { accepts, type Field } from "../engineering/schema";
import { parseNumber } from "./runtime";
import { DataTree } from "./data-inspector";
export function ValueEditor({
  field,
  value,
  label,
  change,
  allowEmpty = true
}: {
  field: Field;
  value: unknown;
  label: string;
  allowEmpty?: boolean;
  change: (value: unknown) => void;
}) {
  const [error, setError] = useState("");
  function write(next: unknown) {
    if (!accepts({
      ...field,
      required: allowEmpty ? false : field.required
    }, next)) {
      setError("Проверьте обязательность, тип и допустимое значение");
      return;
    }
    change(next);
    setError("");
  }
  function commit(raw: string) {
    try {
      const next = ["float", "int", "number"].includes(field.kind) ? parseNumber(raw, {
        ...field,
        required: false
      }) : ["object", "array"].includes(field.kind) ? raw.trim() ? JSON.parse(raw) : null : raw;
      if (!accepts({
        ...field,
        required: false
      }, next)) throw Error("Проверьте тип, варианты и допустимый диапазон");
      write(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return <div className="nt-value-editor"><label>{label}{field.kind === "enum" ? <select aria-label={label} value={value == null ? "" : String(value)} onChange={e => write(e.target.value || null)}><option value="">Пустое значение</option>{field.options?.map(v => <option key={v} value={v}>{field.optionNames?.[v] ?? v}</option>)}</select> : field.kind === "boolean" ? <select aria-label={label} value={value == null ? "null" : String(value)} onChange={e => write(e.target.value === "null" ? null : e.target.value === "true")}><option value="null">Пустое значение</option><option value="true">Да</option><option value="false">Нет</option></select> : ["object", "array"].includes(field.kind) ? <textarea aria-label={label} key={JSON.stringify(value)} defaultValue={value == null ? "" : JSON.stringify(value, null, 2)} onBlur={e => commit(e.target.value)} /> : <input aria-label={label} inputMode={["float", "int", "number"].includes(field.kind) ? "decimal" : undefined} key={JSON.stringify(value)} defaultValue={value == null ? "" : String(value)} onBlur={e => commit(e.target.value)} onKeyDown={e => {
        if (e.key === "Enter") e.currentTarget.blur();
      }} />}</label><small>{field.kind}{field.unit ? " · " + field.unit : ""} · {field.required ? "обязательно" : "необязательно"}{field.min != null ? " · от " + field.min : ""}{field.max != null ? " · до " + field.max : ""}</small>{(allowEmpty || !field.required) && <button type="button" onClick={() => write(null)}>Очистить значение</button>}{error && <p role="alert">{error}</p>}{["object", "array"].includes(field.kind) && <DataTree value={value} label="Структура значения" />}</div>;
}
