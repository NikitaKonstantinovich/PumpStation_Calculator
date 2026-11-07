"use client";
import { useId, useState } from "react";
import { CURVE_METHODS, type CurveMethod } from "../curve-methods";
import { PumpChartPlot } from "../pump-chart-plot";
import { PumpChartGridSettings } from "../pump-chart-grid-settings";
import { PumpFrequencyControl } from "../pump-frequency-control";
import { frequencyLabel, type PumpFrequencySettings } from "../pump-frequency";
import { jpegToPdf } from "../pdf-export";
import type { ChartGridSettings } from "../pump-chart-grid";
import type { ParameterBinding, ParameterWrite, View } from "./schema";

type ExportFormat = "png" | "jpeg" | "pdf";
const blobFromCanvas = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("Не удалось подготовить изображение")), type, quality));
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportHydraulicChart(chart: HTMLElement, format: ExportFormat, name: string): Promise<void> {
  const source = chart.querySelector("svg"); if (!(source instanceof SVGSVGElement)) throw Error("График не найден");
  const text = (selector: string) => [...chart.querySelectorAll(selector)].map(element => [...element.childNodes].map(node => node.textContent?.trim()).filter(Boolean).join(" ")).filter(Boolean).join("   ·   ");
  const canvas = document.createElement("canvas"); canvas.width = 1500; canvas.height = 1000;
  const context = canvas.getContext("2d"); if (!context) throw Error("Не удалось подготовить изображение");
  context.fillStyle = "#fff"; context.fillRect(0, 0, 1500, 1000); context.fillStyle = "#203744"; context.font = "600 36px Segoe UI, Arial"; context.fillText("Гидравлическая характеристика", 75, 72);
  context.fillStyle = "#637582"; context.font = "24px Segoe UI, Arial"; context.fillText(text(".pump-chart__legend span"), 75, 115);
  const clone = source.cloneNode(true) as SVGSVGElement; clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width", "1350"); clone.setAttribute("height", "648");
  clone.querySelectorAll("circle").forEach(circle => circle.setAttribute("r", circle.classList.contains("pump-chart__actual-halo") ? "5.2" : "2.8"));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = ".pump-chart__grid{fill:none;stroke:#e4e9ec;stroke-width:1}.pump-chart__line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.pump-chart__line--blue{stroke:#1976bd}.pump-chart__line--orange{stroke:#e78732}.pump-chart__line--nominal{stroke:#8b98a4;stroke-width:2;stroke-dasharray:6 5}.pump-chart__line--muted{opacity:.24;stroke-width:2}.pump-chart__line--unavailable{opacity:.35;stroke-dasharray:7 6;stroke-width:2}.pump-chart__ticks text{fill:#71808b;font-size:9px;font-family:Segoe UI,Arial}.pump-chart__marker--requested{fill:#fff;stroke:#e78732;stroke-width:1.2}.pump-chart__marker--actual{fill:#1976bd;stroke:#fff;stroke-width:1.2}.pump-chart__actual-halo{fill:rgba(25,118,189,.14);stroke:#1976bd;stroke-width:.5}";
  clone.prepend(style);
  const svg = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }), url = URL.createObjectURL(svg), image = new Image();
  try { await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(Error("Не удалось отрисовать график")); image.src = url; }); context.drawImage(image, 75, 155, 1350, 648); } finally { URL.revokeObjectURL(url); }
  context.fillStyle = "#6d7e8a"; context.font = "22px Segoe UI, Arial"; context.fillText("H, м", 75, 150); context.fillText("Q, м³/ч", 1325, 840);
  context.fillStyle = "#344b5a"; context.font = "600 22px Segoe UI, Arial"; context.fillText(text(".pump-chart__points span"), 75, 875); context.font = "600 24px Segoe UI, Arial"; context.fillText(text(".pump-chart__metrics span"), 75, 930);
  context.fillStyle = "#637582"; context.font = "20px Segoe UI, Arial"; context.fillText("Способ построения: " + (chart.getAttribute("data-curve-label") ?? "PCHIP — через точки"), 75, 975);
  if (format === "pdf") { const jpeg = await blobFromCanvas(canvas, "image/jpeg", .95); download(jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), 1500, 1000), name + ".pdf"); }
  else download(await blobFromCanvas(canvas, format === "png" ? "image/png" : "image/jpeg", .95), name + (format === "png" ? ".png" : ".jpg"));
}
const editable = (binding?: ParameterBinding) => !!binding && binding.active && binding.editable && (binding.mode ?? "user") === "user";

export function HydraulicChartView({ view, disabled, change, writes }: {
  view: View;
  disabled: boolean;
  change: (key: string, value: unknown) => void;
  writes?: (updates: ParameterWrite[]) => void;
}) {
  const id = useId().replace(/[^\w-]/g, ""), [exportError, setExportError] = useState(""), [exporting, setExporting] = useState(false);
  const chart = view.chart, bindings = view.chartBindings;
  if (!chart || chart.model.status !== "ready" || !chart.model.pump || !chart.model.selectedPump || !chart.model.request || !chart.axes || !chart.system) return <div className="pump-chart__empty" role="status">{chart?.model.message || "Выберите и подтвердите насос в инструменте «Подбор насосов»"}</div>;
  const model = chart.model, selected = model.selectedPump!, pump = model.pump!, request = model.request!, frequency = model.frequency!, axes = chart.axes;
  const method = CURVE_METHODS.find(entry => entry.value === model.method)!, frequencyCaption = model.frequencySettings.enabled ? ` · f=${frequencyLabel(frequency.frequencyHz)} Гц (ном. ${frequencyLabel(frequency.nominalHz)} Гц)` : "";
  const label = method.label + frequencyCaption;
  const update = (binding: ParameterBinding | undefined, value: unknown) => { if (!disabled && editable(binding)) { change(binding!.key, value); setExportError(""); } };
  const frequencyChange = (settings: PumpFrequencySettings) => update(bindings?.frequency, { ...settings, pumpId: selected.id });
  const gridChange = (settings: ChartGridSettings) => update(bindings?.grid, settings);
  const pointEditable = !disabled && !!writes && editable(view.pointBindings?.flow) && editable(view.pointBindings?.head);
  return <section className="pump-chart pump-chart--with-settings nt-hydraulic-chart" aria-label="Гидравлическая характеристика выбранного насоса" data-curve-method={model.method} data-curve-label={label} style={{ height: "auto", display: "block", padding: "10px 0" }}>
    <div className="pump-chart__top">
      <label className="pump-chart__method"><span>Кривая</span><select aria-label="Способ отображения кривой" value={model.method} disabled={disabled || !editable(bindings?.method)} title={method.description} onChange={event => update(bindings?.method, event.target.value as CurveMethod)}>{CURVE_METHODS.map(entry => <option key={entry.value} value={entry.value} disabled={entry.value === "polynomial" && !model.polynomialAvailable}>{entry.label}</option>)}</select></label>
      <div className="pump-chart__legend"><span><i className="pump-chart__dot pump-chart__dot--blue" />{selected.manufacturer} {selected.execution || selected.model}</span><span><i className="pump-chart__dot pump-chart__dot--orange" />Система</span>{model.referencePump && <span><i className="pump-chart__dot pump-chart__dot--nominal" />Номинальная: {frequencyLabel(frequency.nominalHz)} Гц</span>}<span><i className="pump-chart__point-symbol pump-chart__point-symbol--requested" />Запрашиваемая</span><span><i className="pump-chart__point-symbol pump-chart__point-symbol--actual" />Фактическая</span></div>
      <details className="chart-export"><summary>Export <span>⌄</span></summary><div className="chart-export__menu">{(["png", "pdf", "jpeg"] as ExportFormat[]).map(format => <button type="button" key={format} disabled={axes.issues.length > 0 || exporting} onClick={event => {
        const button = event.currentTarget, element = button.closest<HTMLElement>(".nt-hydraulic-chart"); if (!element) return;
        setExportError(""); setExporting(true);
        void exportHydraulicChart(element, format, `hydraulic-curve-${selected.model.replace(/[^a-zа-я0-9]+/gi, "-")}-${model.method}${model.frequencySettings.enabled ? `-${frequency.frequencyHz.toFixed(2)}Hz` : ""}`).catch(() => setExportError("Не удалось экспортировать график. Попробуйте ещё раз.")).finally(() => { setExporting(false); button.closest("details")?.removeAttribute("open"); });
      }}>{format.toUpperCase()}</button>)}</div></details>
      <p className="pump-chart__method-note">{method.description}</p>{exportError && <p className="pump-chart__export-error" role="alert">{exportError}</p>}
    </div>
    {model.warnings.map(message => <p key={message} role="status">{message}</p>)}
    <div className="pump-chart__canvas" aria-label="График насосной кривой" style={{ minHeight: 260, aspectRatio: "500 / 240" }}>
      <span className="pump-chart__axis pump-chart__axis--y">H, м</span><span className="pump-chart__axis pump-chart__axis--x">Q, м³/ч</span>
      <PumpChartPlot pump={pump} referencePump={model.referencePump} count={model.count} method={model.method} label={label} input={request} xScale={axes.flow} yScale={axes.head} grid={axes.grid} system={chart.system} actualPoint={chart.point} clipId={`node-chart-${id}`} onInputChange={pointEditable ? patch => {
        if (typeof patch.flowRate === "number" && typeof patch.head === "number") writes!([{ binding: view.pointBindings!.flow, value: patch.flowRate }, { binding: view.pointBindings!.head, value: patch.head }]);
      } : undefined} />
    </div>
    <div className="pump-chart__points"><span><i className="pump-chart__point-symbol pump-chart__point-symbol--requested" /><small>Запрашиваемая точка</small><b>Q = {request.flowRate.toFixed(1)} м³/ч · H = {request.head.toFixed(1)} м</b></span><span><i className="pump-chart__point-symbol pump-chart__point-symbol--actual" /><small>Фактическая точка</small><b>{chart.point ? `Q = ${chart.point.flow.toFixed(1)} м³/ч · H = ${chart.point.head.toFixed(1)} м` : "Пересечение не найдено"}</b></span></div>
    <div className="pump-chart__metrics"><span><small>Насосов</small><b>{model.count} раб.</b></span><span title={model.frequencySettings.enabled ? "Оценка по кубу отношения частот; потери двигателя и ПЧ не учтены" : undefined}><small>{model.frequencySettings.enabled ? "Мощность, оценка" : "Мощность"}</small><b>{pump.power == null ? "—" : `${Number((pump.power * model.count).toPrecision(6)).toLocaleString("ru-RU")} кВт`}</b></span><span><small>{model.frequencySettings.enabled ? "КПД, каталог" : "КПД"}</small><b>{selected.efficiency == null ? "—" : `${selected.efficiency}%`}</b></span></div>
    {pointEditable && <p className="pump-chart__method-note">Двойной щелчок по графику изменяет расход и напор в «Настройках проекта». Выбор насоса потребуется подтвердить заново.</p>}
    <fieldset disabled={disabled || !editable(bindings?.frequency)} style={{ margin: 0, padding: 0, border: 0 }}><PumpFrequencyControl key={selected.id} pump={selected} value={model.frequencySettings} onChange={frequencyChange} /></fieldset>
    <fieldset disabled={disabled || !editable(bindings?.grid)} style={{ margin: 0, padding: 0, border: 0 }}><PumpChartGridSettings value={axes.grid} onChange={gridChange} issues={axes.issues} /></fieldset>
  </section>;
}
