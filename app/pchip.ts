export type CurvePoint = [number, number];

// H(t) = a*t³ + b*t² + c*t + d, t = (Q - start) / width.
export type PchipSegment = {
  start: number; width: number; a: number; b: number; c: number; d: number;
};

function endpointSlope(width: number, nextWidth: number, slope: number, nextSlope: number) {
  const tangent = ((2 * width + nextWidth) * slope - width * nextSlope) / (width + nextWidth);
  if (Math.sign(tangent) !== Math.sign(slope)) return 0;
  if (Math.sign(slope) !== Math.sign(nextSlope) && Math.abs(tangent) > 3 * Math.abs(slope)) return 3 * slope;
  return tangent;
}

// Fritsch–Butland weighted harmonic tangents with one-sided endpoint limiting:
// https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html
export function pchipSegments(points: CurvePoint[]): PchipSegment[] {
  if (points.length < 2 || points.some(([q, h], i) =>
    !Number.isFinite(q) || !Number.isFinite(h) || (i > 0 && q <= points[i - 1][0]))) return [];
  const widths = points.slice(1).map(([q], i) => q - points[i][0]);
  const slopes = widths.map((width, i) => (points[i + 1][1] - points[i][1]) / width);
  const last = slopes.length - 1;
  const tangents = [last === 0 ? slopes[0] : endpointSlope(widths[0], widths[1], slopes[0], slopes[1])];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = slopes[i - 1], next = slopes[i];
    const w1 = 2 * widths[i] + widths[i - 1], w2 = widths[i] + 2 * widths[i - 1];
    tangents.push(previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)
      ? 0 : (w1 + w2) / (w1 / previous + w2 / next));
  }
  tangents.push(last === 0 ? slopes[0] : endpointSlope(widths[last], widths[last - 1], slopes[last], slopes[last - 1]));
  return widths.map((width, i) => {
    const delta = points[i + 1][1] - points[i][1];
    const c = width * tangents[i], endTangent = width * tangents[i + 1];
    return {start: points[i][0], width, a: c + endTangent - 2 * delta, b: 3 * delta - 2 * c - endTangent, c, d: points[i][1]};
  });
}

export function pchipValue(segment: PchipSegment, t: number) {
  return ((segment.a * t + segment.b) * t + segment.c) * t + segment.d;
}

// Split a cubic into monotone intervals so roots and tangencies cannot be
// missed, including two crossings within the same source interval.
export function cubicTurningPoints(a: number, b: number, c: number): number[] {
  const scale = Math.max(Math.abs(3 * a), Math.abs(2 * b), Math.abs(c));
  if (scale === 0) return [];
  const A = 3 * a / scale, B = 2 * b / scale, C = c / scale;
  let roots: number[];
  if (Math.abs(A) < 1e-14) {
    roots = Math.abs(B) < 1e-14 ? [] : [-C / B];
  } else {
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) return [];
    // This form avoids cancellation when one root is close to zero.
    const q = -0.5 * (B + (B >= 0 ? 1 : -1) * Math.sqrt(discriminant));
    roots = q === 0 ? [-B / (2 * A)] : [q / A, C / q];
  }
  return [...new Set(roots.filter(t => t > 0 && t < 1))].sort((x, y) => x - y);
}
