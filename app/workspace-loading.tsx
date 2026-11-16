"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./workspace-loading.css";

export const PRODUCT_OPEN_STEPS = ["Сохраняем текущий проект", "Загружаем проект и настройки", "Загружаем справочники", "Подготавливаем рабочее пространство"];
export const PROJECT_OPEN_STEPS = ["Сохраняем текущий проект", "Загружаем проект", "Загружаем правила расчёта", "Открываем рабочее пространство"];
export const PROJECT_CREATE_STEPS = ["Сохраняем текущий проект", "Загружаем настройки и каталоги", "Подготавливаем инструменты", "Сохраняем новый проект"];

// Give the browser a paint opportunity before synchronous graph preparation.
// The timeout also lets a background tab finish, where rAF may be suspended.
export function paintLoadingStep(): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
  });
}

export function WorkspaceLoading({ title, steps, step = 0, modal = false, compact = false, error, retry, close }: {
  title: string;
  steps: readonly string[];
  step?: number;
  modal?: boolean;
  compact?: boolean;
  error?: string;
  retry?: () => void;
  close?: () => void;
}) {
  const titleId = useId(), stageId = useId(), dialog = useRef<HTMLDialogElement>(null);
  const [started] = useState(() => Date.now()), [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [started, error]);
  useEffect(() => {
    if (!modal) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [modal]);
  useEffect(() => { if (error) dialog.current?.querySelector("button")?.focus(); }, [error]);
  const current = Math.max(0, Math.min(step, steps.length - 1));
  const content = <>
    <div className="workspace-loading__heading"><span className={error ? "workspace-loading__error-icon" : "workspace-loading__spinner"} aria-hidden="true">{error ? "!" : null}</span><div><small>{error ? "Загрузка прервана" : "Открытие рабочего пространства"}</small><h2 id={titleId}>{title}</h2></div></div>
    {error ? <p role="alert" className="workspace-loading__error">{error}</p> : <>
      <p id={stageId} role="status" className="workspace-loading__stage">{steps[current]}…</p>
      <progress aria-label="Прогресс загрузки" aria-describedby={stageId} max={steps.length} value={steps.length > 1 ? current : undefined}/>
      <div className="workspace-loading__meta"><span>{steps.length > 1 ? `Этап ${current + 1} из ${steps.length}` : "Ожидаем данные"}</span><span>Прошло {elapsed} с</span></div>
      {steps.length > 1 && <ol>{steps.map((label, index) => <li key={label} data-state={index < current ? "done" : index === current ? "active" : "pending"} aria-current={index === current ? "step" : undefined}><span aria-hidden="true">{index < current ? "✓" : index + 1}</span>{label}</li>)}</ol>}
      {elapsed >= 10 && <p className="workspace-loading__hint" role="status">Загрузка занимает больше обычного. Ожидаем завершения текущего этапа.</p>}
    </>}
    {error && (retry || close) && <footer>{retry && <button className="button button--primary" onClick={retry}>Повторить загрузку</button>}{close && <button className="button" onClick={close}>Закрыть</button>}</footer>}
  </>;
  return modal
    ? <dialog className="workspace-loading workspace-loading--dialog" ref={dialog} aria-labelledby={titleId} aria-describedby={error ? undefined : stageId} onCancel={event => { event.preventDefault(); if (error) close?.(); }}>{content}</dialog>
    : <section className={`workspace-loading${compact ? " workspace-loading--compact" : ""}`} aria-labelledby={titleId} aria-busy={!error}>{content}</section>;
}
