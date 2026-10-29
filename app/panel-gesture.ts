import type { PanelState } from "./project-config";

export type PanelGeometry = Pick<PanelState, "x" | "y" | "w" | "h">;
export const PANEL_RESIZE_DIRECTIONS = ["n", "e", "s", "w", "ne", "se", "sw", "nw"] as const;
export type PanelResizeDirection = typeof PANEL_RESIZE_DIRECTIONS[number];
export type PanelGesture = {
  mode: "drag" | "resize";
  resizeDirection?: PanelResizeDirection;
  origin: PanelGeometry;
  pointerX: number;
  pointerY: number;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  minWidth: number;
  minHeight: number;
};

export function panelGeometryAt(gesture: PanelGesture, pointerX: number, pointerY: number, snap = false): PanelGeometry {
  const { origin, scale } = gesture;
  const dx = (pointerX - gesture.pointerX) / scale, dy = (pointerY - gesture.pointerY) / scale;
  const width = gesture.canvasWidth / scale, height = gesture.canvasHeight / scale;
  if (gesture.mode === "resize") {
    const direction = gesture.resizeDirection ?? "se", next = { ...origin };
    // Keep the opposite edge anchored, including when the minimum size is hit.
    if (direction.includes("w")) {
      next.x = Math.max(0, Math.min(origin.x + dx, origin.x + origin.w - gesture.minWidth));
      next.w = origin.x + origin.w - next.x;
    } else if (direction.includes("e")) {
      next.w = Math.max(gesture.minWidth, Math.min(origin.w + dx, Math.max(origin.w, width - origin.x)));
    }
    if (direction.includes("n")) {
      next.y = Math.max(0, Math.min(origin.y + dy, origin.y + origin.h - gesture.minHeight));
      next.h = origin.y + origin.h - next.y;
    } else if (direction.includes("s")) {
      next.h = Math.max(gesture.minHeight, Math.min(origin.h + dy, Math.max(origin.h, height - origin.y)));
    }
    return next;
  }
  // A saved window may extend beyond a smaller viewport. Do not teleport it
  // into the viewport on the first pointer movement; allow it to move inward.
  const right = Math.max(0, width - origin.w), bottom = Math.max(0, height - origin.h);
  let x = Math.max(0, Math.min(origin.x + dx, Math.max(right, origin.x)));
  let y = Math.max(0, Math.min(origin.y + dy, Math.max(bottom, origin.y)));
  if (snap) {
    const distance = 24 / scale;
    if (Math.abs(x - right) <= distance) x = right;
    if (Math.abs(y - bottom) <= distance) y = bottom;
    if (x <= distance) x = 0;
    if (y <= distance) y = 0;
  }
  return { ...origin, x, y };
}
