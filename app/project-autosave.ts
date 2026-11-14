const CAMERA_QUIET_MS = 300;
let cameraQuietAt = 0;

export function noteCameraMotion() {
  cameraQuietAt = Date.now() + CAMERA_QUIET_MS;
}

export function delayAutosaveForCamera(deadline: number) {
  const now = Date.now();
  return Math.max(0, Math.min(cameraQuietAt, deadline) - now);
}
