import type { Trace } from "../engineering/engine";

export type TracePath = (string | number)[];
export type PackedTrace = { value: Trace; links: { at: TracePath; from: TracePath }[] };
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Container = JsonValue[] | { [key: string]: JsonValue };
const MAX_DEPTH = 256;
const put = (target: object, key: string | number, value: unknown) => Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
const pathKey = (path: TracePath) => JSON.stringify(path);

/** The transport accepts the same primitive values as JSON, with no executable properties. */
function primitive(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") throw Error("Трасса содержит несовместимое с JSON значение bigint");
  return undefined;
}
function entries(value: object): [string | number, unknown][] {
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw Error("Трасса содержит объект вне формата JSON");
  const keys: (string | number)[] = Array.isArray(value) ? Array.from({ length: value.length }, (_, i) => i) : Object.keys(value);
  return keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && !Object.hasOwn(descriptor, "value")) throw Error("В трассе недопустимы свойства с обработчиками");
    return [key, descriptor?.value];
  });
}
function root(value: unknown): asserts value is Trace {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Некорректный корень трассы");
}

/** Repeated objects become aliases; the first occurrence remains a complete JSON tree. */
export function packTrace(trace: Trace): PackedTrace {
  root(trace);
  const seen = new WeakMap<object, TracePath>(), active = new WeakSet<object>(), links: PackedTrace["links"] = [];
  function copy(value: unknown, path: TracePath): JsonValue | undefined {
    if (!value || typeof value !== "object") return primitive(value);
    if (path.length > MAX_DEPTH) throw Error("Превышена допустимая глубина трассы");
    if (active.has(value)) throw Error("Циклическую трассу нельзя передать в формате JSON");
    const first = seen.get(value);
    if (first) { links.push({ at: path, from: first }); return null; }
    seen.set(value, path); active.add(value);
    const result: Container = Array.isArray(value) ? [] : {};
    for (const [key, child] of entries(value)) {
      const encoded = copy(child, [...path, key]);
      if (encoded !== undefined || Array.isArray(value)) put(result, key, encoded ?? null);
    }
    active.delete(value); return result;
  }
  return { value: copy(trace, []) as unknown as Trace, links };
}

/** Restore aliases only inside a fresh JSON tree, never through inherited properties. */
export function unpackTrace(payload: PackedTrace): Trace {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.links)) throw Error("Некорректный пакет трассы");
  root(payload.value);
  const sources = new Map<string, Container>(), active = new WeakSet<object>();
  function copy(value: unknown, path: TracePath): JsonValue | undefined {
    if (!value || typeof value !== "object") return primitive(value);
    if (path.length > MAX_DEPTH) throw Error("Превышена допустимая глубина трассы");
    if (active.has(value)) throw Error("Циклический пакет трассы");
    active.add(value);
    const result: Container = Array.isArray(value) ? [] : {};
    sources.set(pathKey(path), result);
    for (const [key, child] of entries(value)) {
      const encoded = copy(child, [...path, key]);
      if (encoded !== undefined || Array.isArray(value)) put(result, key, encoded ?? null);
    }
    active.delete(value); return result;
  }
  const value = copy(payload.value, []) as unknown as Trace, destinations = new Set<string>();
  function validPath(path: unknown): asserts path is TracePath {
    if (!Array.isArray(path) || path.length > MAX_DEPTH || path.some(key => typeof key !== "string" && !(typeof key === "number" && Number.isSafeInteger(key) && key >= 0))) throw Error("Некорректный путь ссылки трассы");
  }
  function own(container: unknown, key: string | number): unknown {
    if (!container || typeof container !== "object" || (Array.isArray(container) ? typeof key !== "number" : typeof key !== "string")) throw Error("Путь ссылки не соответствует структуре трассы");
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw Error("Путь ссылки отсутствует в трассе");
    return descriptor.value;
  }
  for (const link of payload.links) {
    if (!link || typeof link !== "object") throw Error("Некорректная ссылка трассы");
    validPath(link.at); validPath(link.from);
    const key = pathKey(link.at), source = sources.get(pathKey(link.from));
    if (!link.at.length || destinations.has(key) || !source) throw Error("Некорректное назначение или источник ссылки трассы");
    let parent: unknown = value;
    for (const part of link.at.slice(0, -1)) parent = own(parent, part);
    const last = link.at[link.at.length - 1];
    if (own(parent, last) !== null) throw Error("Ссылка трассы должна заменять пустой заполнитель");
    put(parent as object, last, source); destinations.add(key);
  }
  // Malformed aliases may create indirect cycles even if no individual path is ancestral.
  const checked = new WeakSet<object>();
  function check(current: unknown) {
    if (!current || typeof current !== "object" || checked.has(current)) return;
    if (active.has(current)) throw Error("Ссылки создают цикл в трассе");
    active.add(current);
    for (const [, child] of entries(current)) check(child);
    active.delete(current); checked.add(current);
  }
  check(value); return value;
}
