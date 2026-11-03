export type ChartAxisSettings = { min: number; max: number | null; step: number | null };
export type ChartGridSettings = {
  flow: ChartAxisSettings; head: ChartAxisSettings;
  vertical: boolean; horizontal: boolean; labels: boolean;
  color: string | null; width: number; pattern: "solid" | "dashed" | "dotted";
};
export type ChartAxisScale = { min: number; max: number; step: number; ticks: number[]; issue?: string };
export const defaultChartGridSettings = (): ChartGridSettings => ({
  flow: { min: 0, max: null, step: null }, head: { min: 0, max: null, step: null },
  vertical: true, horizontal: true, labels: true, color: null, width: 1, pattern: "solid",
});
export function automaticChartAxis(maximum: number): ChartAxisScale {
  const step = Math.max(1, Math.ceil(maximum / 10));
  const divisions = maximum < 10 ? Math.max(1, Math.ceil(maximum)) : 10;
  return { min: 0, max: divisions * step, step, ticks: Array.from({ length: divisions + 1 }, (_, index) => index * step) };
}
export function chartAxisScale(maximum: number, settings: ChartAxisSettings, label: string): ChartAxisScale {
  const fallback = automaticChartAxis(maximum);
  const fail = (message: string) => ({ ...fallback, issue: `${label}: ${message}` });
  if (!Number.isFinite(settings.min) || settings.min < 0) return fail("минимум должен быть неотрицательным числом.");
  if (settings.max !== null && (!Number.isFinite(settings.max) || settings.max <= settings.min)) return fail("максимум должен быть больше минимума.");
  if (settings.step !== null && (!Number.isFinite(settings.step) || settings.step <= 0)) return fail("шаг должен быть больше нуля.");
  if (settings.min === 0 && settings.max === null && settings.step === null) return fallback;
  const auto = automaticChartAxis(Math.max(1, (settings.max ?? maximum) - settings.min));
  const step = settings.step ?? auto.step;
  const max = settings.max ?? settings.min + Math.ceil(Math.max(step, maximum - settings.min) / step) * step;
  const divisions = Math.ceil((max - settings.min) / step - 1e-10);
  if (!Number.isFinite(divisions) || divisions > 200) return fail("слишком частая сетка; увеличьте шаг, чтобы было не более 200 интервалов.");
  const ticks = Array.from({ length: Math.max(1, divisions) }, (_, index) => Number((settings.min + index * step).toPrecision(12)));
  ticks.push(max);
  return { min: settings.min, max, step, ticks };
}
export function chartGridStyle(settings: ChartGridSettings) {
  return { stroke: settings.color ?? undefined, strokeWidth: settings.width,
    strokeDasharray: settings.pattern === "dashed" ? "5 4" : settings.pattern === "dotted" ? "1 3" : undefined };
}
export const chartTickLabel = (value: number, step: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: Math.min(10, Math.max(3, Math.ceil(-Math.log10(step)) + 1)) });
