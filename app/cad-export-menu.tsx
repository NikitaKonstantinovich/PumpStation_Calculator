"use client";
import { useState } from "react";
import { artifactUrl, useCadBuild } from "./cad-build-state";
import type { CadFormat } from "./cad-export";
import "./cad-export.css";

export function CadExportMenu() {
  const cad = useCadBuild();
  const [open, setOpen] = useState(false);
  const job = cad.job;
  const building = job?.status === "building" || job?.status === "queued";
  const canSave = cad.ready && !cad.busy;
  const saveHint = canSave ? "Скачать готовую сборку" : "Сначала соберите модель в SOLIDWORKS";
  const fileOption = (format: CadFormat, name: string, detail: string) => {
    const label = <>{name} <small>{detail}</small></>;
    return job?.artifacts?.[format] === "ready"
      ? <a className="cad-export__file" href={artifactUrl(job, format)} download>{label}</a>
      : <button className="cad-export__file" onClick={() => { setOpen(false); void cad.save(format); }}>{label}</button>;
  };
  return <div className="cad-export">
    <button className="cad-export__action" type="button" disabled={!cad.canBuild} aria-busy={building}
      title={building ? "Сервер уже собирает этот проект" : "Собрать текущую компоновку"}
      onClick={() => { setOpen(false); void cad.build(); }}>{building ? "Идёт сборка в SOLIDWORKS…" : "Собрать в SOLIDWORKS"}</button>
    <div className="cad-export__menu" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <button className="cad-export__action" type="button" disabled={!canSave} aria-expanded={canSave && open} title={saveHint}
        onClick={() => setOpen(!open)}>Сохранить 3D ⌄</button>
      {canSave && open && <div className="cad-export__options">
        {fileOption("solidworks", "Проект SOLIDWORKS", "ZIP · сборка и детали")}
        {fileOption("edrawings", "Сборка eDrawings", "EASM")}
        {fileOption("edrawings-exe", "Автономный eDrawings", "EXE · Windows x64, со встроенным просмотрщиком")}
        {job && <a href={artifactUrl(job, "report")} download>Скачать отчёт о составе</a>}
      </div>}
    </div>
    <div className="cad-export__status" role="status">{cad.error || job?.error || job?.exportError || cad.stage}
      {building && <small>Повторный запуск заблокирован. Сохранение откроется после сборки.</small>}
      {job?.status === "failed" && !cad.error && <small>Исправьте причину ошибки и нажмите «Собрать в SOLIDWORKS» повторно.</small>}
      {job?.status === "partial" && !cad.stale && <p>Сборка неполная. Не включено элементов: {job.omissions?.length}. Подробнее — в предупреждениях SOLIDWORKS</p>}
    </div>
  </div>;
}

const labels: Record<string, string> = { source_missing: "Нет исходной модели", source_changed: "Изменился исходный файл",
  unsupported_geometry: "Неподдерживаемая геометрия", import_error: "Ошибка импорта", part_creation: "Ошибка создания детали" };

export function CadWarnings({ onSelect, contains }: { onSelect: (id: string, pieceId?: string) => void; contains: (id: string) => boolean }) {
  const { job, stale, error, stage, ready } = useCadBuild();
  return <section className="cad-warnings" aria-label="Предупреждения SOLIDWORKS">
    <p role="status">{error || job?.error || stage || "Сначала соберите модель в SOLIDWORKS."}</p>
    {job && <>
      <small>Задание {job.id} · {new Date(job.createdAt).toLocaleString("ru-RU")} · Снимок {job.snapshotKey?.slice(0, 12) ?? "старой версии"}</small>
      {stale && <p>Предупреждения относятся к предыдущей компоновке.</p>}
      {job.omissions && (job.status === "partial" || job.status === "completed" || job.omissions.length === job.total) && <p>Собрано {job.completed} из {job.total} элементов. Не включено {job.omissions.length}</p>}
      {job.omissions?.length ? <ul>{job.omissions.map(p => <li key={p.id}>
        <button type="button" disabled={!contains(p.componentId)} onClick={() => onSelect(p.componentId, p.pieceId)}>{p.name}</button>
        <p>{p.specPosition && `Позиция ${p.specPosition} · `}{p.group} · Экземпляр {p.id}</p>
        <p><strong>{labels[p.code] ?? p.code}</strong>. {p.reason} {p.remedy}</p>
      </li>)}</ul> : ready && <p>Все элементы включены.</p>}
      {job.warnings?.map((w, i) => <p key={i}>{w}</p>)}
      {ready && <a href={artifactUrl(job, "report")} download>Скачать отчёт о составе</a>}
    </>}
  </section>;
}
