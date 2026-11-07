"use client";
import { useEffect, useRef, useState } from "react";
import type { View } from "./schema";
import { pumpDetailValue, safePumpDetailAssetUrl, type PumpDetailAsset, type PumpDetailCurve, type PumpDetailData } from "./pump-detail-data";

function CurveTable({ curve }: { curve: PumpDetailCurve }) {
  const [shown, setShown] = useState(50);
  return <details className="nt-used-curve"><summary>{curve.title} · точек: {curve.points.length}</summary>
    {curve.points.length ? <><div className="nt-curve-scroll"><table aria-label={"Точки характеристики «" + curve.title + "»"}><thead><tr><th scope="col">Q, м³/ч</th><th scope="col">{curve.unit}</th></tr></thead><tbody>{curve.points.slice(0, shown).map(([q, value], index) => <tr key={index}><td>{pumpDetailValue(q)}</td><td>{pumpDetailValue(value)}</td></tr>)}</tbody></table></div>
      <p>Показано {Math.min(shown, curve.points.length)} из {curve.points.length} точек</p>{shown < curve.points.length && <button type="button" onClick={() => setShown(count => count + 50)}>Показать ещё 50 точек</button>}</> : <p>Характеристика не указана в источнике.</p>}
  </details>;
}
function Drawing({ asset }: { asset: PumpDetailAsset }) {
  const [zoom, setZoom] = useState(100), [failed, setFailed] = useState(false);
  const zoomRef = useRef(100), canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const previous = zoomRef.current, next = Math.max(50, Math.min(400, previous + (event.deltaY < 0 ? 10 : -10)));
      if (next === previous) return;
      const bounds = canvas.getBoundingClientRect(), pointerX = event.clientX - bounds.left, pointerY = event.clientY - bounds.top;
      const ratio = Math.max(100, next) / Math.max(100, previous);
      zoomRef.current = next; setZoom(next);
      requestAnimationFrame(() => { canvas.scrollLeft = (canvas.scrollLeft + pointerX) * ratio - pointerX; canvas.scrollTop = (canvas.scrollTop + pointerY) * ratio - pointerY; });
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, [failed]);
  const extent = Math.max(100, zoom), imageSize = zoom / extent * 100;
  return <figure className="pump-sketch"><div className="pump-sketch__meta"><b>{asset.name}</b><span>Ctrl + колесо · {zoom}%</span><a href={asset.url} download>Скачать изображение</a></div>
    {failed ? <p role="alert">Не удалось загрузить чертёж. <a href={asset.url} target="_blank" rel="noreferrer">Открыть файл</a></p> : <div ref={canvasRef} className="pump-sketch__canvas" style={{ overflow: "auto", maxHeight: 650 }} aria-label="Габаритный чертёж. Ctrl + колесо изменяет масштаб">
      <div className="pump-sketch__zoom-surface" style={{ width: `${extent}%`, height: `${extent}%` }}>
      {/* Preserve the source image rather than fitting it into a raster canvas. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={asset.name} onError={() => setFailed(true)} style={{ width: `${imageSize}%`, maxWidth: "none", height: "auto" }}/>
      </div>
    </div>}
  </figure>;
}
export function PumpDetailCard({ view }: { view: View }) {
  const detail = (view as View & { detail?: PumpDetailData }).detail;
  if (!detail || detail.status !== "ready") return <section className="nt-pump-card" aria-label="Карточка насоса"><h3>{view.label || "Карточка насоса"}</h3><p role="status" className={detail?.status === "stale" ? "nt-selection-stale" : undefined}>{detail?.message || "Выберите и подтвердите исполнение в инструменте подбора насосов."}</p></section>;
  const assets = detail.assets.filter(asset => safePumpDetailAssetUrl(asset.url) === asset.url), drawing = assets.find(asset => asset.kind === "drawing" && asset.image);
  return <article className="pump-card nt-pump-card" aria-label={`Карточка насоса ${detail.title}`}>
    <header className="pump-card__header"><span className="pump-card__eyebrow">{detail.subtitle}</span><h2>{detail.title}</h2><p>{detail.message}</p>
      <div className="pump-card__highlights">{detail.highlights.map(row => <span key={row.label}><small>{row.label}</small><b>{row.value}</b></span>)}</div>
    </header>
    {!!detail.warnings.length && <aside className="pump-card__notice" aria-label="Замечания источника">{detail.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</aside>}
    <div className="pump-card__characteristics">{detail.sections.map(section => <section className="pump-card__section" key={section.id}><h3>{section.title}</h3><dl>{section.rows.map((row, index) => <div className="pump-card__row" key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></section>)}
      <section className="pump-card__section"><h3>Точки характеристик</h3><p>Исходные данные одного насоса при частоте {pumpDetailValue(detail.identity?.frequencyHz)}{detail.identity?.frequencyHz != null ? " Гц" : ""}. Пересчёт частоты графика не меняет эти значения.</p>{detail.curves.map(curve => <CurveTable key={`${detail.identity?.variantId}/${detail.identity?.snapshotId}/${curve.id}`} curve={curve}/>)}</section>
      <section className="pump-card__section"><h3>Файлы насоса</h3>{assets.length ? <ul>{assets.map(asset => <li key={`${asset.kind}/${asset.url}`}><a href={asset.url} target="_blank" rel="noreferrer">{asset.kind === "image" ? "Изображение" : asset.kind === "drawing" ? "Чертёж" : "3D-модель"}: {asset.name}</a></li>)}</ul> : <p>Файлы не указаны в подключённом снимке каталога.</p>}</section>
    </div>
    <section className="pump-card__drawing" aria-label="Эскиз с габаритами"><h3>Эскиз с габаритами</h3>{drawing ? <Drawing key={drawing.url} asset={drawing}/> : assets.some(asset => asset.kind === "drawing") ? <p>Чертёж доступен по ссылке в разделе «Файлы насоса».</p> : <p>Подтверждённый чертёж не указан в подключённом снимке каталога.</p>}</section>
    {detail.record && <details><summary>Исходная запись и сведения об источниках</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(detail.record, null, 2)}</pre></details>}
  </article>;
}
