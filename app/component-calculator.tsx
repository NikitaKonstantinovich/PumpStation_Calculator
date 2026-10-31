"use client";

import { useEffect, useMemo, useState } from "react";
import { InsertionDialog, type InsertPreviewRequest } from "./model-editor/insertion-dialog";
import type { AccountUser } from "./user-types";
import type { InsertRequest, insertCatalogMetadata } from "./component-insert-calculations";
import { emptyInsertFilters, filterInsertRows, insertSelectionCounts, selectInsertRows, type InsertFilters, type InsertResultRow } from "./component-calculator-selection";

type Meta = ReturnType<typeof insertCatalogMetadata>;
type ResponseData = { error?: string; meta?: Meta; catalogVersion?: string; rows?: InsertResultRow[]; created?: number; updated?: number; failed?: Array<{ key: string; reason: string }>; stale?: boolean };
const materialName = (value: string) => value === "aisi304" ? "AISI304" : "СТ20";
const geometryName: Record<string, string> = { straight: "Прямое", concentric: "Концентрическое", eccentric: "Эксцентрическое" };
const connectionName: Record<string, string> = { flanged: "фланец", collar: "воротник", threaded: "резьба" };
const format = (value: number | null | undefined, digits = 2) => value == null ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const pageSize = 25;

export function ComponentCalculator({ actor, onBack, onSaved }: { actor: AccountUser; onBack: () => void; onSaved: () => void }) {
  const [preview, setPreview] = useState<InsertPreviewRequest | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null), [error, setError] = useState("");
  const [input, setInput] = useState<InsertRequest>({ dnFrom: 50, dnTo: 150, materials: ["aisi304", "st20"], withSensorNipple: false, includeEccentric: true, seating: { flanged: { mode: "source" }, collar: { mode: "source" } } });
  const [snapshot, setSnapshot] = useState<{ input: InsertRequest; version: string } | null>(null);
  const [rows, setRows] = useState<InsertResultRow[]>([]), [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<InsertFilters>(emptyInsertFilters), [page, setPage] = useState(1);
  const [busy, setBusy] = useState<"calculate" | "export" | null>(null), [stale, setStale] = useState(false);
  const [report, setReport] = useState<ResponseData | null>(null);
  useEffect(() => {
    if (actor.role !== "admin") return;
    const controller = new AbortController();
    fetch("/api/component-calculator", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json() as ResponseData;
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить данные расчёта.");
      if (!controller.signal.aborted && data.meta) setMeta(data.meta);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные."); });
    return () => controller.abort();
  }, [actor.role]);
  const filtered = useMemo(() => filterInsertRows(rows, filters), [rows, filters]);
  const counts = insertSelectionCounts(selected, filtered);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages);
  const shown = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const dirty = snapshot !== null && JSON.stringify(input) !== JSON.stringify(snapshot.input);
  const onlyEccentricMaterials = input.materials.filter(material => {
    const available = meta?.reducerAvailability?.filter(part => part.material === material && part.dn >= input.dnFrom && part.dn <= input.dnTo) ?? [];
    return available.some(part => part.geometry === "eccentric") && !available.some(part => part.geometry === "concentric");
  });
  const hasFilters = Object.values(filters).some(value => value.trim().length > 0);
  const applyFilter = (key: keyof InsertFilters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const values = (key: "dnLarge" | "dnSmall" | "pn") => [...new Set(rows.map(row => row[key]).filter((value): value is number => value !== null))].sort((a, b) => a - b);
  const calculate = async () => {
    if (busy) return;
    setBusy("calculate"); setError(""); setReport(null);
    try {
      const response = await fetch("/api/component-calculator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "calculate", input }) });
      const data = await response.json() as ResponseData;
      if (!response.ok) throw new Error(data.error ?? "Не удалось рассчитать вставки.");
      if (!data.rows || !data.catalogVersion) throw new Error("Сервер не вернул результаты расчёта.");
      setRows(data.rows); setSnapshot({ input: structuredClone(input), version: data.catalogVersion });
      if (data.meta) setMeta(data.meta);
      setSelected(new Set()); setStale(false); setPage(1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка расчёта."); }
    finally { setBusy(null); }
  };
  const exportRows = async () => {
    if (busy || !snapshot || stale || dirty || !selected.size) return;
    setBusy("export"); setError(""); setReport(null);
    try {
      const response = await fetch("/api/component-calculator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", input: snapshot.input, catalogVersion: snapshot.version, keys: [...selected] }) });
      const data = await response.json() as ResponseData;
      if (!response.ok) { if (response.status === 409) setStale(true); throw new Error(data.error ?? "Не удалось выгрузить вставки."); }
      setReport(data);
      if (data.stale) setStale(true);
      if (data.rows) {
        const updates = new Map(data.rows.map(row => [row.identityKey, row]));
        setRows(current => current.map(row => updates.get(row.identityKey) ?? row));
        setSelected(current => new Set([...current].filter(key => !updates.has(key) || updates.get(key)!.exportable)));
      }
      if ((data.created ?? 0) + (data.updated ?? 0) > 0) onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ошибка выгрузки."); }
    finally { setBusy(null); }
  };
  if (actor.role !== "admin") return <main className="users-page"><div className="users-page__content"><h1>Доступ ограничен</h1><p>Расчёт комплектующих доступен только для admin.</p><button className="button" onClick={onBack}>В рабочее пространство</button></div></main>;
  return <main className="component-calculator">
    <header className="users-page__header"><button className="button" onClick={onBack} disabled={!!busy}>← Рабочее пространство</button><span>{actor.name} <span className="user-role">admin</span></span></header>
    <div className="component-calculator__title"><span className="users-eyebrow">БАЗА КОМПЛЕКТУЮЩИХ</span><h1>Расчёт комплектующих</h1><p>Вставки · Рассчитайте варианты, выберите позиции и выгрузите их в «Ответные части и американки».</p></div>
    <div className="component-calculator__layout">
      <form className="component-calculator__parameters" onSubmit={event => { event.preventDefault(); void calculate(); }}>
        <h2>Параметры вставок</h2>
        <fieldset disabled={!!busy || !meta}><legend>Больший DN, включительно</legend><div className="component-calculator__range">
          <label><span>От</span><input type="number" required min={1} max={10000} step={1} value={input.dnFrom || ""} onChange={event => setInput({ ...input, dnFrom: Number(event.target.value) })}/></label>
          <label><span>До</span><input type="number" required min={input.dnFrom || 1} max={10000} step={1} value={input.dnTo || ""} onChange={event => setInput({ ...input, dnTo: Number(event.target.value) })}/></label>
        </div><small>Используются номинальные DN из каталога.</small></fieldset>
        <fieldset disabled={!!busy || !meta}><legend>Материалы</legend>{(meta?.materials ?? ["aisi304", "st20"]).map(material => <label className="component-calculator__check" key={material}><input type="checkbox" checked={input.materials.includes(material as InsertRequest["materials"][number])} onChange={event => setInput({ ...input, materials: event.target.checked ? [...input.materials, material as InsertRequest["materials"][number]] : input.materials.filter(value => value !== material) })}/><span>{materialName(material)}</span></label>)}</fieldset>
        <fieldset disabled={!!busy || !meta}><legend>Опции</legend><label className="component-calculator__check"><input type="checkbox" checked={input.withSensorNipple} onChange={event => setInput({ ...input, withSensorNipple: event.target.checked })}/><span>Приварить сгон DN15 (1/2″) для датчика/реле давления, с заглушкой</span></label><label className="component-calculator__check"><input type="checkbox" checked={input.includeEccentric} onChange={event => setInput({ ...input, includeEccentric: event.target.checked })}/><span>Учитывать эксцентрические переходы</span></label></fieldset>
        <p className="component-calculator__hint">Прямые вставки и концентрические переходы включены всегда. Эксцентрические добавляются этой опцией; после её изменения нажмите «Рассчитать».</p>
        {onlyEccentricMaterials.map(material => <p key={material} className="users-notice">В исходном каталоге для {materialName(material)} в выбранном диапазоне DN есть только эксцентрические переходы. {input.includeEccentric ? "Они включены в параметры расчёта." : "Чтобы они появились в результатах, включите опцию выше и нажмите «Рассчитать»."}</p>)}
        <p className="text-xs text-slate-600">Для Ст20 включена окраска основной детали. Тариф перехода выбирается по большему DN; подробности — в составе расчёта.</p>
        <fieldset className="component-calculator__seating" disabled={!!busy || !meta}>
          <legend>Посадка основной детали</legend>
          <p><strong>Приварные фланцы:</strong> отступ торца основы от наружной плоскости — 5 мм с каждого конца. Только для прямых вставок внутренний зазор между фланцами — не менее 1,1 × большей полной длины крепежа затвора 017W и обратного клапана 010C. Проверяется крепёж для обоих фланцев.</p>
          <p><strong>Воротники:</strong> приварка встык, без захода деталей и без прибавки на сварочный зазор. Каждый воротник добавляет свою полную осевую длину. Норма сварочных работ на один конец — 2 × π × наружный диаметр.</p>
          <small>Правила действуют для каждого соответствующего конца, включая смешанные соединения. Длина перехода берётся из каталога. Переходная вставка устанавливается у насоса: дополнительные трубы и проверка длины крепежа 017W/010C не применяются. Общая длина учитывает осевые добавки концевых деталей. Размеры и схема сборки сохраняются в расчёте.</small>
        </fieldset>
        <p className="component-calculator__hint">Все подтверждённые PN и исполнения подбираются по исходным данным.</p>
        {meta?.connectionNotes?.map(note => <p key={note} className="component-calculator__hint">{note}</p>)}
        <button className="button button--primary" disabled={!!busy || !meta || !input.materials.length}>{busy === "calculate" ? "Расчёт…" : "Рассчитать"}</button>
        {!meta && !error && <p role="status">Загрузка исходных данных…</p>}
        {!!meta?.engineeringIssues.length && <details className="component-calculator__sources"><summary>Исходные данные требуют уточнения</summary><ul>{meta.engineeringIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
      </form>
      <section className="component-calculator__results" aria-label="Результаты расчёта">
        <div className="component-calculator__results-title"><h2>Результаты <span>{rows.length}</span></h2><span>{rows.filter(row => row.exportable).length} доступны для выгрузки</span></div>
        {snapshot && <p className="component-calculator__hint">Во всём результате: прямые — {rows.filter(row => row.geometry === "straight").length}, концентрические — {rows.filter(row => row.geometry === "concentric").length}, эксцентрические — {rows.filter(row => row.geometry === "eccentric").length}. По текущим фильтрам: {filtered.length} из {rows.length}.</p>}
        {error && <p role="alert" className="users-error">{error}</p>}
        {(dirty || stale) && <p role="status" className="users-notice">{stale ? "Исходные данные изменились. Нажмите «Рассчитать» заново." : "Параметры изменены. Нажмите «Рассчитать», чтобы обновить результаты."}</p>}
        {report && <div role="status" className="users-notice"><strong>Создано: {report.created ?? 0} · Обновлено: {report.updated ?? 0} · Не сохранено: {report.failed?.length ?? 0}</strong>{!!report.failed?.length && <ul>{report.failed.map((failure, index) => <li key={`${failure.key}-${index}`}>{rows.find(row => row.identityKey === failure.key)?.name ?? "Позиция"}: {failure.reason}</li>)}</ul>}</div>}
        <div className="component-calculator__filters">
          <label className="component-calculator__search"><span>Поиск по названию</span><input type="search" value={filters.query} onChange={event => applyFilter("query", event.target.value)} placeholder="Вставка Dn100…"/></label>
          {([['dnLarge', 'Больший DN'], ['dnSmall', 'Меньший DN'], ['pn', 'PN']] as const).map(([key, label]) => <label key={key}><span>{label}</span><select value={filters[key]} onChange={event => applyFilter(key, event.target.value)}><option value="">Все</option>{values(key).map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}
          <label><span>Материал</span><select value={filters.material} onChange={event => applyFilter("material", event.target.value)}><option value="">Все</option>{[...new Set(rows.map(row => row.material))].map(value => <option key={value} value={value}>{materialName(value)}</option>)}</select></label>
          <label><span>Исполнение</span><select value={filters.geometry} onChange={event => applyFilter("geometry", event.target.value)}><option value="">Все</option>{Object.entries(geometryName).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Сгон</span><select value={filters.nipple} onChange={event => applyFilter("nipple", event.target.value)}><option value="">Все</option><option value="yes">Со сгоном</option><option value="no">Без сгона</option></select></label>
          <label><span>Статус в базе</span><select value={filters.status} onChange={event => applyFilter("status", event.target.value)}><option value="">Все</option><option value="new">new</option><option value="existing">Существующая / конфликт</option></select></label>
        </div>
        <div className="component-calculator__actions"><button className="button" disabled={!!busy || !hasFilters} onClick={() => { setFilters({ ...emptyInsertFilters }); setPage(1); }}>Сбросить фильтры</button><button className="button" disabled={!!busy} onClick={() => setSelected(current => selectInsertRows(current, filtered, "all"))}>Выбрать все</button><button className="button" disabled={!!busy} onClick={() => setSelected(current => selectInsertRows(current, filtered, "none"))}>Снять выделение</button><button className="button" disabled={!!busy} onClick={() => setSelected(current => selectInsertRows(current, filtered, "new"))}>Выбрать новые</button><button className="button button--primary" disabled={!!busy || !counts.total || stale || dirty} onClick={() => void exportRows()}>{busy === "export" ? "Выгрузка…" : "Выгрузить"}</button></div>
        <p className="component-calculator__selection" aria-live="polite">Выбрано всего: <b>{counts.total}</b> · Скрыто фильтрами: <b>{counts.hidden}</b>. Выбор действует на все страницы текущего фильтра; выгрузка — на все выбранные строки.</p>
        {/* A focusable scroll region lets keyboard users inspect wide results even when all rows are disabled. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="component-calculator__table-scroll" tabIndex={0} role="region" aria-label="Таблица вставок, доступна горизонтальная прокрутка"><table className="component-calculator__table"><thead><tr><th>Выбор</th><th>Статус</th><th>Название</th><th>Больший DN</th><th>Меньший DN</th><th>Резьба слева / справа</th><th>Длина основы, мм</th><th>Общая длина, мм</th><th>PN</th><th>Исполнение</th><th>Материал</th><th>Сгон</th><th>Описание</th><th>Цена, ₽</th><th>Швы, м</th><th>Состояние расчёта</th></tr></thead><tbody>
          {shown.map(row => <tr key={row.identityKey}><td><input type="checkbox" aria-label={`Выбрать ${row.name}, PN${row.pn ?? "?"}, ${connectionName[row.leftConnection]} / ${connectionName[row.rightConnection]}`} checked={selected.has(row.identityKey)} disabled={!!busy || !row.exportable} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(row.identityKey); else next.delete(row.identityKey); return next; })}/></td><td>{row.conflict ? <span className="component-calculator__conflict">Конфликт</span> : row.isNew ? <span className="component-calculator__new">new</span> : "В базе"}</td><th scope="row">{row.name}</th><td>{row.dnLarge}</td><td>{row.dnSmall ?? "—"}</td><td>{row.threadLeft ?? "—"} / {row.threadRight ?? "—"}</td><td>{format(row.baseLengthMm)}</td><td>{format(row.totalLengthMm)}</td><td>{row.pn ?? "—"}</td><td>{geometryName[row.geometry]}</td><td>{materialName(row.material)}</td><td>{row.withSensorNipple ? "Да" : "Нет"}</td><td><div className="component-calculator__description">{row.description}<small>{connectionName[row.leftConnection]} / {connectionName[row.rightConnection]}</small><button className="button" disabled={!snapshot || stale || busy !== null} onClick={() => { if (snapshot) setPreview({ input: snapshot.input, catalogVersion: snapshot.version, identityKey: row.identityKey }); }}>3D-шаблон</button><details><summary>Состав и расчёт</summary>{row.selection && <p>{row.selection.reason}<small>Выбран один вариант из {row.selection.candidateCount}. {row.selection.source}</small></p>}<ul>{row.bom.map((item, index) => <li key={index}>{item.name}: {format(item.quantity, 4)} {item.unit} × {format(item.unitPrice)} ₽ = {format(item.cost)} ₽<small>{item.source}</small></li>)}</ul><ul>{row.welds.map((weld, index) => <li key={index}>{weld.name}: {format(weld.lengthMm == null ? null : weld.lengthMm / 1000, 4)} м, {format(weld.cost)} ₽</li>)}</ul><dl>{row.dimensions.map((dimension, index) => <div key={index}><dt>{dimension.name}: {format(dimension.value)} {dimension.unit}</dt><dd>{dimension.source ?? "Источник не задан"}</dd></div>)}</dl></details></div></td><td>{format(row.price)}</td><td>{format(row.weldLengthMm == null ? null : row.weldLengthMm / 1000, 4)}</td><td><div className="component-calculator__state">{row.complete ? row.assumptions?.some(item => item.code === "sensor-pn25-pressure") ? "Рассчитано с предупреждением" : row.assumptions?.length ? "Рассчитано с допущением" : "Рассчитано" : "Неполный расчёт"}{row.assumptions?.map((assumption, index) => <p key={`${assumption.code}-${index}`}>{assumption.message}<small>{assumption.source}</small></p>)}{row.assemblyDecisions?.map(decision => <p key={decision.ruleId}>{decision.message}<small>{decision.source}</small></p>)}{row.conflict && <p>{row.conflict}</p>}{!!row.warnings.length && <ul>{row.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</div></td></tr>)}
          {!shown.length && <tr><td colSpan={16} className="component-calculator__empty">{snapshot ? "По выбранным условиям позиции не найдены." : "Задайте параметры и нажмите «Рассчитать». Запись в базу выполняется кнопкой «Выгрузить»."}</td></tr>}
        </tbody></table></div>
        <footer className="component-calculator__pagination"><span>На странице: {shown.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} из {filtered.length}</span><button className="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>← Назад</button><span>Страница {currentPage} из {pages}</span><button className="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Далее →</button></footer>
      {preview && <InsertionDialog preview={preview} onClose={() => setPreview(null)}/>}</section>
    </div>
  </main>;
}
