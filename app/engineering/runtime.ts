import { runPlan, type Plan, type StepCache } from "./engine";
export type Publication = {
  version: string;
  plans: Record<string, Plan>;
  args: Record<string, string[]>;
};
export const INITIAL_VERSION = "engineering-v1";
const initial: Publication = {
  version: INITIAL_VERSION,
  plans: {},
  args: {}
};
// One browser document owns one active project. Workers use request-local context.
let browserPublication = initial;
let requestPublication: () => Publication | undefined = () => undefined;
export function provideRequestPublication(get: () => Publication | undefined) {
  requestPublication = get;
}
export function setBrowserPublication(value: Publication) {
  if ("document" in globalThis) browserPublication = value;
}
const nativeRegistry = new Map<string, (inputs: Record<string, unknown>) => unknown>();
export function registerOperation<A extends unknown[], R>(id: string, keys: string[], fn: (...args: A) => R) {
  nativeRegistry.set(id, inputs => engineeringOperation(id, fn, keys.map(k => inputs[k]) as A));
}
let executing: Publication | undefined;
export function withEvaluationProgram<T>(p: Publication, run: () => T): T {
  const before = executing;
  executing = p;
  try {
    return run();
  } finally {
    executing = before;
  }
}
export function currentPublication() {
  if (executing) return executing;
  return !("document" in globalThis) ? requestPublication() ?? initial : browserPublication;
}
const activeOperations = new Set<string>();
const browserSteps = new WeakMap<Plan, StepCache>();
export function engineeringOperation<A extends unknown[], R>(id: string, native: (...args: A) => R, args: A): R {
  const publication = currentPublication(),
    plan = publication.plans[id];
  // Identity programs are compiled to a direct native invocation.
  if (!plan) return native(...args);
  const keys = publication.args[id];
  const values = Object.fromEntries(keys.map((key, i) => [key, args[i]]));
  if (activeOperations.has(id)) throw Error("Цикл вызовов инструментов: " + [...activeOperations, id].join(" → "));
  activeOperations.add(id);
  let cache: StepCache | undefined;
  if ("document" in globalThis) {
    cache = browserSteps.get(plan) ?? new Map();
    browserSteps.set(plan, cache);
  }
  try {
    return runPlan(plan, values, (operation, inputs) => {
      if (operation === id) return native(...(keys.map(key => inputs[key]) as A));
      const fn = nativeRegistry.get(operation);
      if (!fn) throw Error("Операция недоступна в этом профиле: " + operation);
      return fn(inputs);
    }, false, cache).value as R;
  } finally {
    activeOperations.delete(id);
  }
}
