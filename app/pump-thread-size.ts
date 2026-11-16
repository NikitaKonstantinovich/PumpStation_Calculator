// Nominal size mapping already used by build-pump-nozzles.mjs. This is a DN,
// not an actual bore/outer diameter, and does not establish a thread standard.
const THREAD_DN: Record<string, number> = {
  "1/4": 8, "3/8": 10, "1/2": 15, "3/4": 20, "1": 25,
  "11/4": 32, "11/2": 40, "2": 50, "21/2": 65, "3": 80, "4": 100,
};

/** Call only when the nozzle connection is explicitly threaded. */
export function pumpThreadDn(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const size = value.trim().replaceAll("¼", "1/4").replaceAll("½", "1/2").replaceAll("¾", "3/4")
    .replace(/\s/g, "").match(/^(?:G|Rp|Rc|R)?(\d+(?:\/\d+)?)["″”]?$/i)?.[1];
  return size ? THREAD_DN[size] ?? null : null;
}
