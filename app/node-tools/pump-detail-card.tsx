"use client";
import { useEffect, useRef, useState } from "react";
import type { View } from "./schema";
import { cardPresentation, CARD_SECTIONS, type PumpDetailSection } from "./pump-card-presentation";
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
  const changeZoom = (next: number) => { zoomRef.current = Math.max(50, Math.min(400, next)); setZoom(zoomRef.current); };
  return <figure className="pump-sketch" style={{ display: "block", height: "auto", minHeight: 0 }}><div className="pump-sketch__meta"><b>{asset.name}{asset.page ? ` · страница PDF ${asset.page}` : ""}</b><span>Ctrl + колесо · {zoom}%</span><button type="button" aria-label="Уменьшить чертёж" disabled={zoom <= 50} onClick={() => changeZoom(zoom - 25)}>−</button><button type="button" aria-label="Увеличить чертёж" disabled={zoom >= 400} onClick={() => changeZoom(zoom + 25)}>+</button><button type="button" onClick={() => changeZoom(100)}>100%</button><a href={asset.url} download={asset.name}>Скачать оригинал</a></div>
    {asset.note && <figcaption className="nt-card-note">{asset.note}</figcaption>}
    {failed ? <p role="alert">Не удалось загрузить чертёж. <a href={asset.url} target="_blank" rel="noreferrer">Открыть файл</a></p> : <div ref={canvasRef} className="pump-sketch__canvas" style={{ display: "block", overflow: "auto", maxHeight: 650 }} aria-label="Габаритный чертёж. Ctrl + колесо изменяет масштаб">
      <div className="pump-sketch__zoom-surface" style={{ width: `${extent}%`, height: `${extent}%` }}>
      {/* Preserve the source image rather than fitting it into a raster canvas. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.previewUrl || asset.url} alt={asset.name} loading="lazy" onError={() => setFailed(true)} style={{ width: `${imageSize}%`, maxWidth: "none", height: "auto" }}/>
      </div>
    </div>}
  </figure>;
}
function Drawings({ assets }: { assets: PumpDetailAsset[] }) {
  const [selected, setSelected] = useState(0);
  const asset = assets[selected] ?? assets[0];
  if (!asset) return null;
  return <>{assets.length > 1 && <label>Чертёж для просмотра<select value={Math.min(selected, assets.length - 1)} onChange={event => setSelected(Number(event.target.value))}>{assets.map((item, index) => <option key={`${item.url}/${item.page}`} value={index}>{item.name}{item.page ? ` · стр. ${item.page}` : ""}</option>)}</select></label>}<Drawing key={`${asset.url}/${asset.previewUrl}`} asset={asset}/></>;
}
function Characteristics({ section, highlightKeys, showOrigin }: { section: PumpDetailSection; highlightKeys: Set<string>; showOrigin: boolean }) {
  const rows = section.rows.filter(row => !highlightKeys.has(row.key) && !(section.id === "electric" && section.table && row.key === "voltage"));
  // Keep voltage with its current/phase pair. A single mode may use the header value once.
  const skipVoltage = section.id === "electric" && section.table?.rows.length === 1 && highlightKeys.has("voltage");
  const headings = section.table?.headings.filter((_, index) => !skipVoltage || index !== 0);
  const tableRows = section.table?.rows.map(cells => cells.filter((_, index) => !skipVoltage || index !== 0));
  return <>{section.note && <p className="nt-card-note">{section.note}</p>}
    {rows.length > 0 && <dl>{rows.map(row => <div className="pump-card__row" key={row.key}><dt>{row.label}</dt><dd>{row.value}{showOrigin && row.origin && <small className="nt-origin">{row.origin}</small>}</dd></div>)}</dl>}
    {section.table && <div className="nt-curve-scroll"><table className="nt-card-table" aria-label={section.title}><thead><tr>{headings!.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{tableRows!.map((cells, index) => <tr key={index}>{cells.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </>;
}
export function PumpDetailCard({ view, showOrigin: inheritedOrigin = true }: { view: View; showOrigin?: boolean }) {
  const detail = (view as View & { detail?: PumpDetailData }).detail;
  if (!detail || detail.status !== "ready") return <section className="nt-pump-card" aria-label="Карточка насоса"><h3>{view.label || "Карточка насоса"}</h3><p role="status" className={detail?.status === "stale" ? "nt-selection-stale" : undefined}>{detail?.message || "Выберите и подтвердите исполнение в инструменте подбора насосов."}</p></section>;
  const options = cardPresentation(view.cardPresentation), showOrigin = inheritedOrigin && view.showOrigin !== false;
  // Older published graphs may still supply calculation/layout sections.
  const visible = (id: string) => Object.hasOwn(CARD_SECTIONS, id) && !options.hiddenSections.includes(id) && (id !== "passport" || options.showPassport) && (id !== "price" || options.showPrice);
  const highlights = options.mainFields.flatMap(key => detail.sections.filter(s => visible(s.id)).flatMap(s => s.rows).filter(row => row.key === key && !(key === "voltage" && (detail.sections.find(s => s.id === "electric")?.table?.rows.length ?? 0) > 1))), highlightKeys = new Set(highlights.map(row => row.key));
  const assets = detail.assets.filter(asset => safePumpDetailAssetUrl(asset.url) === asset.url).map(asset => ({ ...asset, previewUrl: safePumpDetailAssetUrl(asset.previewUrl) === asset.previewUrl && /\.(png|jpe?g|webp)$/i.test(asset.previewUrl ?? "") ? asset.previewUrl : undefined }));
  const drawings = assets.filter(asset => asset.kind === "drawing" && (asset.image || asset.previewUrl));
  const block = (id: string) => {
    const section = detail.sections.find(s => s.id === id);
    if (section) {
      if (!section.note && !section.table && !section.rows.some(row => !highlightKeys.has(row.key))) return null;
      const content = <Characteristics section={section} highlightKeys={highlightKeys} showOrigin={showOrigin}/>;
      return section.additional ? <details key={id} className="pump-card__section nt-card-details" open={options.expandedDetails}><summary>{section.title}</summary>{content}</details> : <section key={id} className="pump-card__section"><h3>{section.title}</h3>{content}</section>;
    }
    if (id === "curves") return <details key={id} className="pump-card__section nt-card-details" open={options.expandedDetails}><summary>{CARD_SECTIONS[id]}</summary><p className="nt-card-note">Один насос при частоте {pumpDetailValue(detail.identity?.frequencyHz)}{detail.identity?.frequencyHz != null ? " Гц" : ""}. Пересчёт частоты графика не меняет исходные точки. Границы таблицы не означают допустимый эксплуатационный диапазон.</p>{detail.curves.filter(curve => curve.points.length).map(curve => <CurveTable key={`${detail.identity?.variantId}/${detail.identity?.snapshotId}/${curve.id}`} curve={curve}/>)}</details>;
    if (id === "files") return <details key={id} className="pump-card__section nt-card-details" open={options.expandedDetails || drawings.length > 0}><summary>{CARD_SECTIONS[id]}</summary>{assets.length ? <ul>{assets.map(asset => <li key={`${asset.kind}/${asset.url}/${asset.page}`}><a href={asset.url} target="_blank" rel="noreferrer">{asset.kind === "image" ? "Изображение" : asset.kind === "drawing" ? "Чертёж" : "3D-модель"}: {asset.name}</a>{asset.page && <span> · страница PDF {asset.page}</span>}{!asset.image && !asset.previewUrl && asset.note && <p className="nt-card-note">{asset.note}</p>}</li>)}</ul> : <p className="nt-card-note">Подтверждённый чертёж не указан в подключённом снимке каталога.</p>}<Drawings key={detail.identity?.variantId} assets={drawings}/></details>;
    if (id === "diagnostics" && detail.warnings.length) return <details key={id} className="pump-card__section nt-card-details" open={options.expandedDetails}><summary>{CARD_SECTIONS[id]} · {detail.warnings.length}</summary><ul>{detail.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>;
    return null;
  };
  return <article className="pump-card nt-pump-card" aria-label={`Карточка насоса ${detail.title}`}>
    <header className="pump-card__header"><span className="pump-card__eyebrow">{detail.subtitle}</span><h2>{detail.title}</h2>{detail.article && <p>Артикул: {detail.article}</p>}
      {highlights.length > 0 && <div className="pump-card__highlights">{highlights.map(row => <span key={row.key}><small>{row.label}</small><b>{row.value}</b>{showOrigin && row.origin && <small>{row.origin}</small>}</span>)}</div>}
    </header>
    {!!detail.critical?.length && <aside className="pump-card__notice" role="alert">{detail.critical.map(message => <p key={message}>{message}</p>)}</aside>}
    <div className="pump-card__characteristics">{options.sectionOrder.filter(visible).map(block)}</div>
  </article>;
}
