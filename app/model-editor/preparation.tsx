"use client";

import { useEffect, useRef, useState } from "react";
import type { ProfileCatalog } from "./model";
import type { ModelRequestItem } from "./specification-models";

export type PreparationJob = {
  id: string; projectId: string; status: "queued" | "searching" | "converting" | "completed" | "completed_with_errors";
  stage: string; total: number; completed: number; converted: number; ready: number; progress: number | null;
  current: string; items: ModelRequestItem[]; missing: { name: string; position: string; reason: string }[];
  errors: { name: string; reason: string }[]; profiles: ProfileCatalog; fatalError?: string; retryOf?: string;
};
export const preparationActive = (job: PreparationJob | null) => !!job && ["queued", "searching", "converting"].includes(job.status);

async function responseJob(response: Response): Promise<PreparationJob | null> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Не удалось получить состояние подготовки моделей");
  return data.job;
}

export function useModelPreparation(projectId: string, items: ModelRequestItem[], ready: boolean, onPrepared: (job: PreparationJob) => Promise<void>) {
  const [job, setJob] = useState<PreparationJob | null>(null);
  const [connecting, setConnecting] = useState(true), [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false), [error, setError] = useState("");
  const [sceneError, setSceneError] = useState("");
  const callback = useRef(onPrepared), poll = useRef<() => void>(() => {}), generation = useRef(0);
  const running = useRef(false), applied = useRef("");
  const readyRef = useRef(ready);
  useEffect(() => { callback.current = onPrepared; }, [onPrepared]);
  useEffect(() => { readyRef.current = ready; }, [ready]);

  useEffect(() => {
    const scope = ++generation.current, controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => scope === generation.current && !controller.signal.aborted;
    const receive = async () => {
      try {
        const next = await responseJob(await fetch(`/api/model-preparation?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal, cache: "no-store" }));
        if (!current()) return;
        if (next && next.projectId !== projectId) throw new Error("Сервис вернул задание другого проекта");
        setJob(next); setError(""); setConnecting(false); setStarting(false); running.current = preparationActive(next);
        if (preparationActive(next)) { timer = setTimeout(receive, 1000); return; }
        if (next && applied.current !== next.id) {
          if (!readyRef.current) { timer = setTimeout(receive, 500); return; }
          setApplying(true); setSceneError("");
          try { await callback.current(next); if (current()) applied.current = next.id; }
          catch (error) { if (current()) setSceneError(error instanceof Error ? error.message : "Не удалось обновить сцену"); }
          finally { if (current()) setApplying(false); }
        }
      } catch (error) {
        if (!current()) return;
        setConnecting(false);
        setError(error instanceof Error ? error.message : "Статус подготовки временно недоступен");
        if (running.current) timer = setTimeout(receive, 3000);
      }
    };
    poll.current = () => { clearTimeout(timer); void receive(); };
    void receive();
    return () => { controller.abort(); clearTimeout(timer); generation.current = scope + 1; };
  }, [projectId]);

  const start = async (retry = false) => {
    if (running.current || connecting || starting || applying || !ready) return;
    const scope = generation.current;
    running.current = true; setStarting(true); setError(""); setSceneError("");
    try {
      const next = await responseJob(await fetch("/api/model-preparation", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, items, requestId: crypto.randomUUID(), ...(retry && job ? { retryJobId: job.id } : {}) }) }));
      if (scope !== generation.current) return;
      if (next?.projectId !== projectId) throw new Error("Сервис вернул задание другого проекта");
      setJob(next); setStarting(false); poll.current();
    } catch (error) {
      if (scope !== generation.current) return;
      setError(error instanceof Error ? error.message : "Не удалось запустить подготовку");
      // POST might have been accepted before the connection broke. Read persisted
      // status before allowing another request; server also deduplicates active jobs.
      setStarting(false); running.current = false; poll.current();
    }
  };
  return { job, connecting, starting, applying, error, sceneError, busy: connecting || starting || applying || preparationActive(job), start,
    refresh: () => poll.current() };
}

export function PreparationProgress({ preparation }: { preparation: ReturnType<typeof useModelPreparation> }) {
  const { job, starting, applying, error, sceneError, busy, start, refresh } = preparation;
  if (!job && !starting && !error) return null;
  const active = starting || preparationActive(job), searching = starting || job?.status === "searching" || job?.status === "queued";
  const phase = applying ? "Обновление сцены" : searching ? "Поиск моделей" : active ? "Конвертация" : !job && error ? "Подготовка недоступна" : job?.errors.length ? "Завершено с ошибками" : "Подготовка завершена";
  return <section className="model-preparation" aria-label="Подготовка 3D-моделей">
    <div className="model-preparation__heading" role="status"><b>{phase}</b><span>{job && !searching ? `${Math.floor(job.progress ?? 0)}%` : ""}</span></div>
    <progress aria-label="Общий прогресс подготовки моделей" max={100} value={searching ? undefined : job?.progress ?? 0}/>
    {job && !searching && <p>Обработано {job.completed} из {job.total} · Успешных конвертаций: {job.converted} · Ошибок: {job.errors.length}</p>}
    {(active || applying) && <p><span className="model-preparation__spinner" aria-hidden="true"/>{applying ? "Загрузка готовых копий и обновление текущей компоновки…" : job?.current || "Ожидание обработки очереди…"}</p>}
    {error && <p role="alert">{error} <button onClick={refresh}>Проверить подключение</button></p>}
    {sceneError && <p role="alert">Модели подготовлены, но сцена обновлена не полностью: {sceneError} <button disabled={busy} onClick={refresh}>Повторить обновление сцены</button></p>}
    {job && !active && !applying && <>
      <p><b>Подготовлено: {job.converted}. Уже готовы: {job.ready}. Нет исходной модели: {job.missing.length}. Ошибки: {job.errors.length}.</b></p>
      {!job.total && !job.errors.length && <p>{job.ready ? "Все доступные копии уже готовы и актуальны." : !job.items.length ? "Спецификация пуста: добавьте оборудование в спецификацию." : "Подходящих исходных моделей для этой спецификации в библиотеке нет."}</p>}
      {job.retryOf && <p>Показан результат повторной попытки для неудачных моделей.</p>}
      {!!job.errors.length && <><ul>{job.errors.map((item, index) => <li key={index}><b>{item.name}</b>: {item.reason}</li>)}</ul><button disabled={busy} onClick={() => void start(true)}>Повторить неудачные конвертации</button></>}
      {!!job.missing.length && <details><summary>Без исходных моделей: {job.missing.length}</summary><ul>{job.missing.map((item, index) => <li key={index}>{item.position} · {item.name}: {item.reason}</li>)}</ul></details>}
    </>}
  </section>;
}
