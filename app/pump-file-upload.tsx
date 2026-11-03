"use client";
import { useEffect, useId, useRef, useState } from "react";
import { PUMP_FILE_SETTINGS, checkPumpFile, pumpFileDescription, type PumpFileKind, type PumpFileReference } from "./pump-files";

export function PumpFileUpload({ kind, file, legacyPath, disabled, onChange, onBusy }: {
  kind: PumpFileKind; file?: PumpFileReference; legacyPath?: string; disabled: boolean;
  onChange: (file: PumpFileReference | null) => void; onBusy: (busy: boolean) => void;
}) {
  const inputId = useId(), request = useRef<XMLHttpRequest | null>(null), dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState("");
  useEffect(() => () => request.current?.abort(), []);
  const setting = PUMP_FILE_SETTINGS[kind];
  const upload = async (files: FileList | File[]) => {
    if (disabled || uploading) return;
    setError("");
    if (files.length !== 1) { setError("Загрузите один файл в эту область."); return; }
    const selected = files[0];
    try { checkPumpFile(kind, selected.name, selected.size); } catch (reason) { setError(reason instanceof Error ? reason.message : "Проверьте файл."); return; }
    setUploading(true); setProgress(0); onBusy(true);
    try {
      const uploaded = await new Promise<PumpFileReference>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); request.current = xhr;
        xhr.open("POST", "/api/pumps/files"); xhr.responseType = "json"; xhr.timeout = 10 * 60 * 1000;
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.setRequestHeader("X-Pump-File-Kind", kind); xhr.setRequestHeader("X-File-Name", encodeURIComponent(selected.name)); xhr.setRequestHeader("X-File-Size", String(selected.size));
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => {
          const body = xhr.response as { file?: PumpFileReference; error?: string } | null;
          if (xhr.status === 201 && body?.file) resolve(body.file); else reject(new Error(body?.error ?? "Не удалось загрузить файл."));
        };
        xhr.onerror = () => reject(new Error("Соединение прервано. Повторите загрузку."));
        xhr.ontimeout = () => reject(new Error("Загрузка заняла слишком много времени. Повторите попытку."));
        xhr.onabort = () => reject(new Error("Загрузка отменена."));
        xhr.send(selected);
      });
      onChange(uploaded);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить файл."); }
    finally { request.current = null; setUploading(false); onBusy(false); }
  };
  return <div className={`pump-file-upload${dragging ? " pump-file-upload--dragging" : ""}`} role="group" aria-label={setting.label}
    onDragEnter={event => { event.preventDefault(); if (!disabled && !uploading) { dragDepth.current++; setDragging(true); } }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled || uploading ? "none" : "copy"; }}
    onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void upload(event.dataTransfer.files); }}>
    <h4>{setting.label}</h4><p>Перетащите файл сюда или выберите на компьютере</p>
    <label htmlFor={inputId} className="pump-file-upload__picker">{file || legacyPath ? "Выбрать другой файл" : "Выбрать файл"}</label>
    <input id={inputId} type="file" aria-label={`Загрузить: ${setting.label}`} accept={setting.extensions.map(ext => `.${ext}`).join(",")} disabled={disabled || uploading}
      onChange={event => { const files = event.target.files; if (files?.length) void upload(files); event.target.value = ""; }}/>
    <small>{pumpFileDescription(kind)}</small>
    {uploading && <div role="status"><progress max={100} value={progress} aria-label={`Загрузка: ${setting.label}`}/><span>{progress === 100 ? "Сохранение файла…" : `Загрузка ${progress}%`}</span><button type="button" className="item-entry__refresh" onClick={() => request.current?.abort()}>Отменить загрузку</button></div>}
    {!uploading && (file || legacyPath) && <div className="pump-file-upload__attached"><b>{file?.name ?? legacyPath?.split(/[\\/]/).at(-1)}</b>{file && <><span>{(file.size / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} МБ · Загружен</span><a href={file.url} target="_blank" rel="noreferrer">Открыть файл</a></>}{!file && <span>Ранее сохранённая привязка</span>}<button type="button" className="item-entry__refresh" disabled={disabled} onClick={() => { onChange(null); setError(""); }}>Убрать из записи</button></div>}
    {error && <p role="alert" className="item-entry__error">{error}</p>}
  </div>;
}
