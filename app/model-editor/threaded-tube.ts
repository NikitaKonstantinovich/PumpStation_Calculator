import type { InsertionShape } from "./insertion-types";
import { validShapeThread } from "./insertion-types";

/** Closed hollow tube with the same illustrative right-hand groove as collector sgons. */
export function threadedTubeMesh(shape: InsertionShape): { positions: number[]; indices: number[] } {
  if (!shape.thread || !validShapeThread(shape)) throw new Error("Invalid threaded tube");
  const { pitchMm: pitch, lengthMm: length, depthMm: depth } = shape.thread;
  const end = shape.lengthMm!, start = end - length, n = 64, steps = Math.ceil(length / pitch * 12);
  const positions: number[] = [], indices: number[] = [];
  const ring = (x: number, inner = false) => {
    const base = positions.length / 3, h = x - start;
    const envelope = Math.max(0, Math.min(1, h / (pitch * .4), (length - h) / (pitch * .4)));
    for (let i = 0; i < n; i++) {
      const phi = 2 * Math.PI * i / n;
      const radius = inner ? shape.innerMm! / 2 : shape.outerMm! / 2 - depth * envelope * (.5 - .5 * Math.cos(2 * Math.PI * h / pitch - phi));
      positions.push(x, radius * Math.cos(phi), radius * Math.sin(phi));
    }
    return base;
  };
  const band = (a: number, b: number, reverse = false) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const [x, y, z] of [[a+i,a+j,b+i],[b+i,a+j,b+j]]) indices.push(x, reverse ? z : y, reverse ? y : z);
    }
  };
  const first = ring(0); let previous = first;
  for (let j = 0; j <= steps; j++) { const next = ring(start + length * j / steps); band(previous, next); previous = next; }
  const innerStart = ring(0, true), innerEnd = ring(end, true);
  band(innerStart, innerEnd, true); band(first, innerStart, true); band(previous, innerEnd);
  return { positions, indices };
}
