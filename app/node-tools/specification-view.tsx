"use client";
import { useEffect, useRef, useState } from "react";
import type { DnEntity, SettingsEntity, SpecItem, SpecSection } from "../project-config";
import { SpecificationHydraulicOption } from "../specification-hydraulic-options";
import { SpecificationInsertion } from "../specification-insertions";
import { specificationItemPresentation, specificationIssueId, specificationSection } from "../specification-presentation";
import { coreSpecificationHasPrice } from "../specification-readiness";
import { withEvaluationProgram } from "../engineering/runtime";
import { specificationExportRows, specificationExportBlob, type SpecificationExportFormat } from "../specification-export";
import { SPECIFICATION_GROUPS, type SpecificationData, type SpecificationBindings, type SpecificationManualRow } from "./specification-nodes";
import type { ParameterBinding, ParameterWrite, View } from "./schema";

type SpecificationView = View & { specification?: SpecificationData; specificationBindings?: SpecificationBindings };
const money = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const lineTotal = (item: SpecItem) => coreSpecificationHasPrice(item) && Number.isFinite(item.quantity) && item.quantity > 0 ? item.price! * item.quantity : 0;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sectionNames: Record<SpecSection, string> = { pump: "Насосы", control: "Шкаф управления", frame: "Рама", suction: "Всасывающая линия", discharge: "Напорная линия", electrical: "Электрика" };
export function NodeSpecificationView({ view, disabled = false, change, writes }: { view: SpecificationView; disabled?: boolean; change: (key: string, value: unknown) => void; writes?: (updates: ParameterWrite[]) => void }) {
  const warningDialogRef = useRef<HTMLDialogElement>(null), exportMenuRef = useRef<HTMLDetailsElement>(null), exportingRef = useRef(false);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState("");
  const [warning, setWarning] = useState({ name: "", message: "", severity: "warning" });
  const bindings = view.specificationBindings ?? {}, data = view.specification;
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !exportMenuRef.current?.contains(event.target)) exportMenuRef.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && exportMenuRef.current?.open) { exportMenuRef.current.open = false; exportMenuRef.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  if (!data || data.status !== "ready" || !data.project || !data.readiness) return <div className="dn-calculator__empty"><b>Спецификация</b><p>{data?.message || "Подключите результаты расчёта DN и конструктора коллекторов."}</p></div>;
  const project = data.project, readiness = data.readiness, items = data.items;
  const settings = project.entities["station-settings"] as SettingsEntity, dn = project.entities["station-dn"] as DnEntity;
  const writable = (binding: ParameterBinding | undefined) => Boolean(!disabled && binding?.editable && binding.active && (binding.mode ?? "user") === "user" && (writes || !binding.toolId));
  const update = (binding: ParameterBinding | undefined, value: unknown) => {
    if (!binding || !writable(binding)) return;
    if (writes) writes([{ binding, value }]);
    else if (!binding.toolId) change(binding.key, value);
  };
  const onSettingsChange = writable(bindings.hydraulic) ? (patch: Partial<SettingsEntity>) => { if (patch.hydraulicOptions) update(bindings.hydraulic, patch.hydraulicOptions); } : undefined;
  const onDnChange = writable(bindings.dn) ? (patch: Partial<DnEntity>) => update(bindings.dn, { ...record(bindings.dn!.value), ...patch }) : undefined;
  const exportSpecification = async (format: SpecificationExportFormat) => {
    if (exportingRef.current) return;
    exportingRef.current = true; setExporting(true); setExportError(""); exportMenuRef.current?.removeAttribute("open"); exportMenuRef.current?.querySelector("summary")?.focus();
    try {
      const rows = withEvaluationProgram({ version: "node-specification-export-primitives", plans: {}, args: {} }, () => specificationExportRows(items, SPECIFICATION_GROUPS, readiness));
      const blob = await specificationExportBlob(rows, format);
      const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `Спецификация.${format}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError("Не удалось выгрузить спецификацию. Попробуйте ещё раз."); }
    finally { exportingRef.current = false; setExporting(false); }
  };
  const summary = (rows: SpecItem[]) => <span className="spec-table__section-summary" title="Сумма известных цен представленных позиций; полнота состава указана выше"><i>{rows.length} поз.</i><strong>{money(rows.reduce((sum, row) => sum + lineTotal(row), 0))} ₽</strong></span>;
  const renderItem = (item: SpecItem, index: number) => {
    const hasPrice = coreSpecificationHasPrice(item), presentation = specificationItemPresentation(item);
    const missing = specificationSection(item) === "control" && item.description === "Шкаф управления не найден в базе", oversized = specificationSection(item) === "control" && Boolean(item.description?.startsWith("Предупреждение:"));
    const selectionWarning = !missing && (Boolean(item.technicalStatus && item.technicalStatus !== "ready") || item.status === "confirmation" || Boolean(item.description?.startsWith("Предупреждение:")));
    return <div data-issue-id={specificationIssueId(item)} className={`spec-table__row spec-table__row--item ${selectionWarning ? "spec-table__row--warning" : item.status === "selected" ? "spec-table__row--selected" : ""} ${missing ? "spec-table__row--cabinet-missing" : ""} ${oversized ? "spec-table__row--cabinet-oversized" : ""}`} role="row" key={`${item.position}-${index}`}>
      <span className="spec-table__cell spec-table__cell--position">{item.position}</span>
      <span className="spec-table__cell spec-table__cell--name"><b>{item.name}{presentation.hasWarning && <button type="button" className={`spec-table__warning spec-table__warning--${presentation.severity} ${selectionWarning ? "spec-table__warning--power" : ""}`} aria-label={`${presentation.severity === "error" ? "Ошибка" : "Предупреждение"}: ${item.name}`} title="Показать сообщение" onClick={() => { setWarning({ name: item.name, message: presentation.warningText, severity: presentation.severity }); warningDialogRef.current?.showModal(); }}><i aria-hidden="true">!</i></button>}</b><small>{presentation.details}</small></span>
      <span className="spec-table__cell spec-table__cell--quantity">{item.quantity > 0 ? item.quantity : "—"}</span><span className="spec-table__cell spec-table__cell--unit">{item.unit ?? "шт."}</span>
      <span className={`spec-table__cell spec-table__cell--price ${hasPrice ? "" : "spec-table__cell--empty"}`}>{hasPrice ? money(item.price!) : ""}</span>
      <span className={`spec-table__cell spec-table__cell--sum ${hasPrice ? "" : "spec-table__cell--empty"}`}>{hasPrice && item.quantity > 0 ? money(lineTotal(item)) : ""}</span>
      <span className="spec-table__cell spec-table__cell--description">{presentation.description || "—"}</span>
      <SpecificationHydraulicOption item={item} settings={settings} onChange={onSettingsChange}/><SpecificationInsertion item={item} database={data.database} designs={dn.insertionDesigns} onChange={onDnChange}/>
    </div>;
  };
  const manualRows = data.manualRows;
  const changeManual = (id: string, patch: Partial<SpecificationManualRow>) => update(bindings.manual, manualRows.map(row => row.id === id ? { ...row, ...patch, ...(Object.hasOwn(patch, "confirmed") ? {} : { confirmed: false }) } : row));
  return <div className="spec-sheet nt-specification">
    <dialog ref={warningDialogRef} className={`spec-warning-dialog spec-warning-dialog--${warning.severity}`} aria-label="Ошибки и предупреждения по позиции"><header><div><small>{warning.severity === "error" ? "ТРЕБУЕТ ИСПРАВЛЕНИЯ" : "ТРЕБУЕТ ПРОВЕРКИ"}</small><h2>{warning.name}</h2></div><button type="button" className="icon-button" aria-label="Закрыть сообщение" onClick={() => warningDialogRef.current?.close()}>×</button></header><p>{warning.message}</p><button type="button" className="button button--primary" onClick={() => warningDialogRef.current?.close()}>Понятно</button></dialog>
    <div className="spec-sheet__summary"><span><b>{readiness.ready ? "Спецификация готова" : "Черновик"}</b> · {items.length} позиций</span><div className="spec-sheet__actions"><span className="spec-sheet__total"><small>{readiness.costComplete ? "Полная стоимость состава" : "Известная часть стоимости"}</small><b>{money(readiness.knownTotal)} ₽</b></span><details ref={exportMenuRef} className="chart-export spec-export" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}><summary aria-disabled={exporting} aria-busy={exporting} onClick={event => { if (exporting) event.preventDefault(); }}>{exporting ? "Выгрузка…" : "Выгрузить"} <span aria-hidden="true">⌄</span></summary><div className="chart-export__menu spec-export__menu" aria-label="Форматы выгрузки спецификации"><button type="button" disabled={exporting} onClick={() => void exportSpecification("csv")}>CSV</button><button type="button" disabled={exporting} onClick={() => void exportSpecification("xlsx")}>XLSX</button></div></details></div>{exportError && <p className="spec-export__error" role="alert">{exportError}</p>}</div>
    <div className="spec-sheet__note" data-issue-id="spec/readiness"><p>Состав: <b>{readiness.compositionComplete ? "полный" : "не завершён"}</b> · Техническая проверка: <b>{readiness.technicalReady ? "пройдена" : "не завершена"}</b> · Стоимость: <b>{readiness.costComplete ? "полная" : "неполная"}</b>.</p>{!readiness.ready && <details><summary>Причины незавершённости ({readiness.findings.length})</summary><ul>{readiness.findings.map(finding => <li key={finding.id} data-issue-id={finding.id}>{finding.message}</li>)}</ul></details>}</div>
    <div className="spec-table" role="table" aria-label="Спецификация насосной установки"><div className="spec-table__row spec-table__row--head" role="row"><span>№</span><span>Наименование</span><span>Кол-во</span><span>Ед.</span><span>Цена, ₽</span><span>Сумма, ₽</span><span>Описание</span></div>{SPECIFICATION_GROUPS.map(group => { const groupRows = items.filter(item => group.sections.some(section => section.id === specificationSection(item))); return <div className="spec-table__group" key={group.title}><div className="spec-table__section spec-table__section--main"><b>{group.title}</b>{summary(groupRows)}</div>{group.sections.map(section => { const rows = items.filter(item => specificationSection(item) === section.id); return <div className="spec-table__subsection" key={section.id}>{section.title && <div className="spec-table__section spec-table__section--sub"><b>{section.title}</b>{summary(rows)}</div>}{rows.map(renderItem)}</div>; })}</div>; })}</div>
    {bindings.manual && <details className="spec-sheet__note"><summary>Ручные позиции ({manualRows.length})</summary><p>Дополнительные позиции сохраняются в параметре инструмента. Они не заменяют обязательные автоматически рассчитанные узлы.</p><fieldset className="access-fields" disabled={!writable(bindings.manual)} aria-label="Редактирование ручных позиций">{manualRows.map((row, index) => <fieldset key={row.id} className="settings-form"><legend>Позиция {index + 1}</legend><label>Наименование<input aria-label={`Наименование ручной позиции ${index + 1}`} value={row.name} onChange={event => changeManual(row.id, { name: event.target.value })}/></label><label>Раздел<select value={row.section} onChange={event => changeManual(row.id, { section: event.target.value as SpecSection })}>{Object.entries(sectionNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="settings-form__numbers"><label>Количество<input type="number" min="0" max="1000000000" step="any" value={row.quantity} onChange={event => changeManual(row.id, { quantity: Number.isFinite(event.target.valueAsNumber) ? Math.max(0, event.target.valueAsNumber) : 0 })}/></label><label>Единица<input value={row.unit} onChange={event => changeManual(row.id, { unit: event.target.value })}/></label><label>Закупочная цена, ₽<input type="number" min="0" max="1000000000000" step="any" value={row.price ?? ""} onChange={event => changeManual(row.id, { price: Number.isFinite(event.target.valueAsNumber) ? Math.max(0, event.target.valueAsNumber) : null })}/></label></div><label>Характеристики<input value={row.details} onChange={event => changeManual(row.id, { details: event.target.value })}/></label><label>Примечание<input value={row.description} onChange={event => changeManual(row.id, { description: event.target.value })}/></label><label><input type="checkbox" checked={row.confirmed} onChange={event => changeManual(row.id, { confirmed: event.target.checked })}/> Применимость и количество проверены</label><button type="button" className="button" onClick={() => update(bindings.manual, manualRows.filter(item => item.id !== row.id))}>Удалить позицию</button></fieldset>)}<button type="button" className="button" disabled={manualRows.length >= 500} onClick={() => update(bindings.manual, [...manualRows, { id: crypto.randomUUID(), name: "", details: "", quantity: 1, unit: "шт.", price: null, section: "electrical", description: "", confirmed: false } satisfies SpecificationManualRow])}>Добавить ручную позицию</button></fieldset></details>}
  </div>;
}
