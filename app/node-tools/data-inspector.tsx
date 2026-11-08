"use client";

import { useMemo, useState } from "react";
import type { View } from "./schema";
import "./inspector.css";

export function compactValue(value: unknown): string {
  if (value === undefined) return "Значение отсутствует";
  if (value === null) return "Пустое значение (null)";
  if (Array.isArray(value)) return "Список · " + value.length;
  if (typeof value === "object") return "Объект · " + Object.keys(value).length;
  if (value === true) return "Да (true)";
  if (value === false) return "Нет (false)";
  const text = String(value);
  return text.length > 100 ? text.slice(0, 100) + "…" : text === "" ? "Пустая строка" : text;
}

const childPath = (path: string, key: string, array: boolean) => array ? path + "[" + key + "]" : /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(key) ? (path ? path + "." : "") + key : path + "[" + JSON.stringify(key) + "]";
type Row = { key: string; path: string; value: unknown; circular: boolean; children?: Row[]; total?: number };

/** Bound collection rendering and search work; the full size is retained in every row. */
function dataRows(value: unknown, path: string, limit: number): { row: Row; limited: boolean } {
  let remaining = 10000, limited = false;
  function visit(key: string, value: unknown, path: string, ancestors: Set<object>, depth: number): Row {
    const row: Row = { key, value, path, circular: false };
    if (!value || typeof value !== "object") return row;
    if (ancestors.has(value)) return { ...row, circular: true };
    const keys = Object.keys(value), seen = new Set(ancestors);
    row.total = keys.length;
    seen.add(value);
    if (depth >= 24 || remaining <= 0) { limited = true; row.children = []; return row; }
    const shown = keys.slice(0, Math.min(limit, remaining));
    remaining -= shown.length;
    if (shown.length < keys.length) limited = true;
    row.children = shown.map(key => visit(key, (value as Record<string, unknown>)[key], childPath(path, key, Array.isArray(value)), seen, depth + 1));
    return row;
  }
  return { row: visit(path || "Данные", value, path, new Set(), 0), limited };
}

export function DataTree({
  value, label = "Текущие данные", path = "", missing = false, status, limit = 50
}: {
  value: unknown; label?: string; path?: string; missing?: boolean; status?: string; limit?: number;
}) {
  const [search, setSearch] = useState(""), [copied, setCopied] = useState("");
  const data = useMemo(() => dataRows(missing ? undefined : value, path, Math.max(1, Math.min(200, limit))), [value, path, missing, limit]);
  const query = search.trim().toLocaleLowerCase();
  const matches = (row: Row): boolean => !query || row.key.toLocaleLowerCase().includes(query) || row.path.toLocaleLowerCase().includes(query) || !!row.children?.some(matches);
  async function copy(text: string, kind: string) {
    try { await navigator.clipboard.writeText(text); setCopied(kind + " скопирован"); }
    catch { setCopied("Копирование недоступно в этом браузере"); }
  }
  const valueText = (value: unknown) => value === undefined ? "undefined" : JSON.stringify(value, (_key, item) => typeof item === "bigint" ? String(item) : item, 2);
  function actions(row: Row) {
    return <span className="nt-data-actions">
      <button type="button" title={row.path || "Корень данных"} aria-label={"Копировать путь " + (row.path || "корня")} onClick={e => { e.preventDefault(); void copy(row.path || "$", "Путь"); }}>Путь</button>
      <button type="button" disabled={row.circular} aria-label={"Копировать значение " + (row.path || "корня")} onClick={e => {
        e.preventDefault();
        try { void copy(valueText(row.value) ?? "undefined", "Значение"); } catch { setCopied("Значение содержит циклическую ссылку"); }
      }}>Значение</button>
    </span>;
  }
  function render(row: Row, depth: number): React.ReactNode {
    if (!matches(row)) return null;
    const title = <><span className="nt-data-key">{depth === 0 ? label : row.key}</span><span className="nt-data-value">{row.circular ? "Циклическая ссылка" : compactValue(row.value)}</span>{actions(row)}</>;
    if (!row.children) return <div className="nt-data-leaf" key={row.path}>{title}</div>;
    const children = row.children.filter(matches);
    return <details key={row.path} className="nt-data-branch" open={query || depth === 0 ? true : undefined}>
      <summary>{title}</summary>
      <div className="nt-data-children">{children.length ? children.map(child => render(child, depth + 1)) : <small>{row.total ? "Нет совпадений в показанной выборке" : "Коллекция пуста"}</small>}
      {row.total! > row.children.length && <small className="nt-data-limited">Показано {row.children.length} из {row.total}. Полное значение доступно через «Значение».</small>}</div>
    </details>;
  }
  return <section className="nt-data-tree" aria-label={label}>
    {status && <p className="nt-data-status">{status}</p>}
    <input type="search" value={search} placeholder="Найти атрибут или путь…" aria-label="Поиск по данным" onChange={e => setSearch(e.target.value)} />
    {query && data.limited && <small>Поиск в показанной выборке. Крупные коллекции ограничены {Math.max(1, Math.min(200, limit))} элементами на уровень.</small>}
    {matches(data.row) ? render(data.row, 0) : <p>Атрибут не найден в показанных данных.</p>}
    <span className="nt-data-copy-status" role="status">{copied}</span>
  </section>;
}

/** The complete form tree retains hidden representations for selection and restoration. */
export function FormTree({ view, selected, select }: { view?: View; selected?: string; select: (node: string) => void }) {
  function render(node: View, hidden = false): React.ReactNode {
    const isHidden = hidden || node.visible === false;
    const current = selected === node.node || selected === node.binding?.node;
    const label = node.label || node.binding?.field.name || ({ form: "Форма", section: "Раздел", grid: "Расположение полей", condition: "Условие отображения", field: "Поле", message: "Сообщение",table:"Таблица",select:"Список выбора","pump-card":"Карточка насоса","hydraulic-chart":"Гидравлическая кривая","pump-detail":"Карточка насоса","dn-calculator":"Расчёт DN","collector-constructor":"Конструктор коллекторов","specification":"Спецификация" }[node.kind]);
    return <li key={node.node}>
      <button type="button" aria-current={current ? "true" : undefined} className={current ? "nt-tree-selected" : ""} onClick={() => select(node.node)}>{label}{isHidden && <small> · Скрыто</small>}{node.enabled === false && <small> · Недоступно</small>}</button>
      {!!node.children?.length && <ul>{node.children.map(child => render(child, isHidden))}</ul>}
    </li>;
  }
  return <nav className="nt-form-tree" aria-label="Дерево формы">{view ? <ul>{render(view)}</ul> : <p>Форма ещё не построена.</p>}</nav>;
}
