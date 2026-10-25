"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterLibrary, parseModelLibrary, type LibraryModel, type ModelLibrary } from "./library";

const PAGE_SIZE = 25;
export function ModelLibraryDialog({ onClose, onAdd, full }: { onClose: () => void; onAdd: (model: LibraryModel, signal: AbortSignal) => Promise<void>; full: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true);
  const addition = useRef<AbortController | null>(null);
  const [library, setLibrary] = useState<ModelLibrary | null>(null), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [category, setCategory] = useState(""), [status, setStatus] = useState("ready"), [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0), [loading, setLoading] = useState(true), [adding, setAdding] = useState("");
  useEffect(() => { alive.current = true; dialog.current?.showModal(); return () => { alive.current = false; addition.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/model-assets/library.json", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "Библиотека ещё не подготовлена" : "Не удалось загрузить библиотеку моделей");
      return parseModelLibrary(await response.json());
    }).then(data => { if (!controller.signal.aborted) setLibrary(data); }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Не удалось загрузить библиотеку");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const categories = useMemo(() => [...new Set(library?.models.flatMap(model => model.categories) ?? [])].sort((a,b) => a.localeCompare(b, "ru")), [library]);
  const filtered = useMemo(() => filterLibrary(library?.models ?? [], search, category, status), [library, search, category, status]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1), currentPage = Math.min(page, lastPage);
  const counts = useMemo(() => ({ ready: library?.models.filter(m => m.status === "ready").length ?? 0, pending: library?.models.filter(m => m.status === "pending").length ?? 0, error: library?.models.filter(m => m.status === "error").length ?? 0 }), [library]);
  const add = async (model: LibraryModel) => {
    const controller = new AbortController(); addition.current = controller;
    setAdding(model.id); setError("");
    try { await onAdd(model, controller.signal); if (alive.current) onClose(); }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Не удалось добавить модель"); }
    finally { if (alive.current) setAdding(""); }
  };
  const close = () => { addition.current?.abort(); onClose(); };
  return <dialog ref={dialog} className="model-library" aria-label="Библиотека 3D-моделей" onCancel={close}>
    <div className="model-library__heading"><b>Библиотека 3D-моделей</b><button onClick={close} aria-label="Закрыть библиотеку моделей">×</button></div>
    <p>Выберите модель для ручного размещения. Размеры — в миллиметрах; масштаб и исходная ориентация сохранены.</p>
    <div className="model-library__filters">
      <label>Поиск<input value={search} placeholder="Название, DN, производитель…" onChange={e => { setSearch(e.target.value); setPage(0); }}/></label>
      <label>Категория<select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="">Все категории</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Состояние<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="ready">Готовые</option><option value="">Все</option><option value="pending">Подготавливаются</option><option value="error">Ошибка подготовки</option></select></label>
    </div>
    {loading && <p role="status">Загрузка списка моделей…</p>}
    {error && <p role="alert">{error}</p>}
    <p role="status">Готовы: {counts.ready}. Подготавливаются: {counts.pending}. Ошибки: {counts.error}. Найдено: {filtered.length}.</p>
    {full && <p role="alert">Достигнут предел: 500 компонентов в сборке.</p>}
    <div className="model-library__list"><table><thead><tr><th>Модель</th><th>Габариты, мм</th><th>Состояние</th><th>Действие</th></tr></thead><tbody>
      {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(model => <tr key={model.id}>
        <td><b>{model.name}</b><small>{model.categories.join(" · ")}</small><details><summary>Источник{model.sources.length > 1 ? ` (${model.sources.length} совпадающих файлов)` : ""}</summary>{model.sources.map(source => <p key={source}>{source}</p>)}{model.warnings.map(note => <p key={note}>{note}</p>)}</details></td>
        <td>{model.bounds ? [0, 1, 2].map(i => (model.bounds![i + 3] - model.bounds![i]).toLocaleString("ru", { maximumFractionDigits: 2 })).join(" × ") : "—"}{model.bytes && <small>{(model.bytes / 1048576).toLocaleString("ru", { maximumFractionDigits: 1 })} МБ</small>}</td>
        <td>{model.status === "ready" ? "Готова" : model.status === "pending" ? "Подготавливается" : model.error || "Ошибка подготовки"}</td>
        <td><button disabled={full || !!adding || model.status !== "ready"} onClick={() => void add(model)}>{adding === model.id ? "Загрузка модели…" : "Добавить"}</button></td>
      </tr>)}
    </tbody></table>{!filtered.length && !loading && <p>Модели по заданным условиям не найдены.</p>}</div>
    <div className="model-library__footer"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Назад</button><span>Страница {currentPage + 1} из {lastPage + 1}</span><button disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Далее</button><button disabled={loading || !!adding} onClick={() => { setLoading(true); setError(""); setRetry(retry + 1); }}>Обновить список</button><button onClick={close}>Закрыть</button></div>
  </dialog>;
}
