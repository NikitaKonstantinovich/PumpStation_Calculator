"use client";
import { useState } from "react";
import { artifactUrl, useCadBuild } from "./cad-build-state";
import "./cad-export.css";

export function CadExportMenu() {
  const cad = useCadBuild();
  const [open, setOpen] = useState(false);
  const job = cad.job;
  const canSave = cad.ready && !cad.busy;
  return <div className="cad-export">
    <button type="button" disabled={!cad.canBuild} onClick={() => { setOpen(false); void cad.build(); }}>Собрать в SOLIDWORKS</button>
    <div className="cad-export__menu" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" disabled={!canSave} aria-expanded={canSave && open} title={canSave ? "Скачать готовую сборку" : "Сначала соберите модель в SOLIDWORKS"}
        onClick={() => setOpen(!open)}>Сохранить 3D ⌄</button>
      {canSave && open && <div className="cad-export__options">
        <button onClick={() => { setOpen(false); void cad.save("solidworks"); }}>Проект SOLIDWORKS <small>ZIP · сборка и детали</small></button>
        <button onClick={() => { setOpen(false); void cad.save("edrawings"); }}>Сборка eDrawings <small>EASM</small></button>
        {job && <a href={artifactUrl(job, "report")} download>Скачать отчёт о составе</a>}
      </div>}
    </div>
    <div className="cad-export__status" role="status">{cad.error || job?.error || job?.exportError || cad.stage}
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
