import { INITIAL_VERSION, type Publication } from "./runtime";
const cached = new Map<string, Publication>();
export async function loadProgram(version?: string): Promise<Publication> {
  if (version === INITIAL_VERSION) return {
    version,
    plans: {},
    args: {}
  };
  if (version && cached.has(version)) return cached.get(version)!;
  const response = await fetch("/api/engineering/runtime" + (version ? "?version=" + encodeURIComponent(version) : ""), {
    cache: "no-store"
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error ?? "Не удалось открыть версию инженерной логики");
  cached.set(body.version, body);
  return body;
}
