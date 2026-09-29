import { cubicTurningPoints, pchipSegments, pchipValue, type CurvePoint, type PchipSegment } from "./pchip";

export type CurveMethod = "pchip" | "linear" | "polynomial";
export const CURVE_METHODS: {value: CurveMethod; label: string; description: string}[] = [
  {value: "pchip", label: "PCHIP — через точки", description: "Плавная кривая через исходные точки с сохранением их формы."},
  {value: "linear", label: "Ломаная — по точкам", description: "Исходные точки соединены прямыми отрезками."},
  {value: "polynomial", label: "Полиномиальное сглаживание", description: "Полином до 3-й степени приближает исходные данные и может отклоняться от точек. Рабочая точка рассчитана по этой кривой."},
];

// Least squares in normalized Q, using twice-reorthogonalized QR rather than
// normal equations. Large physical flow units never enter the Vandermonde matrix.
function polynomialSegment(points: CurvePoint[]): PchipSegment | null {
  const start = points[0][0], width = points[points.length - 1][0] - start;
  const xs = points.map(([q]) => (q - start) / width);
  const scale = Math.max(1, ...points.map(([, h]) => Math.abs(h)));
  const ys = points.map(([, h]) => h / scale);
  for (let degree = Math.min(3, points.length - 1); degree >= 1; degree--) {
    const basis: number[][] = [], r = Array.from({length: degree + 1}, () => Array<number>(degree + 1).fill(0));
    let singular = false;
    for (let j = 0; j <= degree; j++) {
      const column = xs.map(x => x ** j);
      for (let pass = 0; pass < 2; pass++) for (let k = 0; k < j; k++) {
        const projection = column.reduce((sum, value, i) => sum + value * basis[k][i], 0);
        r[k][j] += projection;
        column.forEach((value, i) => { column[i] = value - projection * basis[k][i]; });
      }
      const norm = Math.hypot(...column);
      if (norm < 1e-12) { singular = true; break; }
      r[j][j] = norm;
      basis.push(column.map(value => value / norm));
    }
    if (singular) continue;
    const coefficients = Array<number>(4).fill(0);
    for (let j = degree; j >= 0; j--) {
      let value = basis[j].reduce((sum, q, i) => sum + q * ys[i], 0);
      for (let k = j + 1; k <= degree; k++) value -= r[j][k] * coefficients[k];
      coefficients[j] = value / r[j][j];
    }
    const [d, c, b, a] = coefficients.map(value => value * scale);
    if (![a, b, c, d].every(Number.isFinite)) return null;
    return {start, width, a, b, c, d};
  }
  return null;
}

export function curveSegments(points: CurvePoint[], method: CurveMethod = "pchip"): PchipSegment[] {
  const pchip = pchipSegments(points);
  if (!pchip.length || method === "pchip") return pchip;
  if (method === "linear") return pchip.map((s, i) => ({...s, a: 0, b: 0, c: points[i + 1][1] - s.d}));
  const fit = polynomialSegment(points);
  if (!fit) return [];
  // A fit giving negative pump head inside the source range is unavailable.
  const values = [0, ...cubicTurningPoints(fit.a, fit.b, fit.c), 1].map(t => pchipValue(fit, t));
  return Math.min(...values) < -1e-9 ? [] : [fit];
}

export function curveMaxHead(points: CurvePoint[], method: CurveMethod = "pchip") {
  return Math.max(0, ...curveSegments(points, method).flatMap(s =>
    [0, ...cubicTurningPoints(s.a, s.b, s.c), 1].map(t => pchipValue(s, t))));
}
