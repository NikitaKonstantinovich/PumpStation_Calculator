import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import ts from "typescript";
import { loadTs } from "./load-ts.mjs";

const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const source = await readFile(new URL("../app/full-workspace.tsx", import.meta.url), "utf8");
class ProjectRequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
let sequence = 0;

// Run Home's actual effects, event handlers and JSX with controlled I/O. Child
// tools are leaves: these tests exercise shell recovery, not their calculations.
async function workspace(search, options, check) {
  const saved = createProject("Сохранённый расчёт", { id: "saved-project" });
  saved.workspace2 = { schema: 1, algorithmId: "pump-station", tools: {} };
  const file = { ...saved.project, config: saved, revision: 3 };
  const cards = options.empty ? [] : [{ ...saved.project, revision: 3 }];
  const calls = [], sessions = [], effects = [], slots = [], cleanups = [];
  const account = { id: "owner", name: "Fixture", role: "admin", email: "fixture@example.test" };
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage };
  const window = new EventTarget();
  window.location = new URL("http://localhost:3000/" + search);
  window.history = Object.fromEntries(["replaceState", "pushState"].map(method => [method, (_state, _title, path) => { window.location = new URL(path, window.location); }]));
  window.alert = message => { throw Error(message); };
  globalThis.window = window;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  let cursor = 0, changed = true, tree, signedOut = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    lazy: () => "LazyTool", Suspense: "Suspense",
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; changed = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, fn };
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) { slots[index] = { deps }; effects.push(() => { cleanups[index]?.(); cleanups[index] = fn(); }); }
    },
  };
  const projectApi = async (params = "", body) => {
    calls.push({ params, body });
    if (body) {
      if(options.saveGate)await options.saveGate;
      if(options.rejectSave)throw new ProjectRequestError("Временно не удалось сохранить проект",503);
      return { revision: 1 };
    }
    if (!params) {
      if (options.listError) throw new ProjectRequestError("Список недоступен", options.listError);
      return { projects: cards, next: null };
    }
    if (params === "?id=saved-project") { if(options.projectGate)await options.projectGate; return file; }
    throw new ProjectRequestError("Проект или версия не найдены", options.projectError ?? 404);
  };
  class ProjectSession {
    constructor(_owner, config, revision) { this.latest = config; this.revision = revision; this.dirty = false; sessions.push(this); }
    connect() { return () => {}; }
    dispose() {}
    update(config) { this.latest = config; }
    async flush() { return true; }
  }
  const program = { version: "engineering-v1", plans: {}, args: {} };
  const dependencies = {
    ...react, Link: "Link", NodeWorkspace: "NodeWorkspace", AppNavigation: "AppNavigation",
    ProjectSession, ProjectRequestError, projectApi, createProject,
    DEFAULT_ALGORITHM: "pump-station", INITIAL_VERSION: "engineering-v1",
    algorithmForProject: data => data?.algorithmId ?? "pump-station",
    parseAccessibleProject: config => config, projectAccessError: () => null,
    loadProgram: async () => { if (options.programError) throw Error("Версия расчёта недоступна"); return program; },
    setBrowserPublication: () => {}, currentPublication: () => program,
    fetchPublishedBaseValues: async () => undefined,
    loadTools: async () => {
      options.runtimeCalls=(options.runtimeCalls??0)+1;
      if(options.runtimeGate)await options.runtimeGate;
      if(options.rejectRuntime)throw Error("Каталог временно недоступен");
      return { algorithm: { name: "Насосная установка" }, program: {}, defaults: {}, baseVersions: {}, sourceVersions: {} };
    },
    paintLoadingStep: async () => {},
    PRODUCT_OPEN_STEPS: ["save", "project", "catalogs", "prepare"],
    PROJECT_OPEN_STEPS: ["save", "project", "rules", "open"],
    PROJECT_CREATE_STEPS: ["save", "settings", "prepare", "persist"],
    useTheme: () => ["dark", () => {}, {}, () => {}],
    resetComponentsDatabase: () => {}, withUpdatedTimestamp: value => value,
  };
  const ast = ts.createSourceFile("full-workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let transformed = source;
  for (const node of [...ast.statements].reverse()) {
    if (!ts.isImportDeclaration(node)) continue;
    const clause = node.importClause;
    const names = clause?.isTypeOnly ? [] : [clause?.name?.text, ...(clause?.namedBindings?.elements ?? []).filter(item => !item.isTypeOnly).map(item => item.name.text)].filter(Boolean);
    for (const name of names) dependencies[name] ??= name;
    transformed = transformed.slice(0, node.getStart()) + (names.length ? `const {${names.join(",")}} = globalThis.__workspaceLoadingFixture;` : "") + transformed.slice(node.end);
  }
  globalThis.__workspaceLoadingFixture = dependencies;
  const compiled = ts.transpileModule(transformed, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replaceAll('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
  try {
    const { default: Home } = await import(`data:text/javascript;base64,${Buffer.from(compiled + `\n// fixture ${sequence++}`).toString("base64")}`);
    const onAccountChange = user => { signedOut = user === null; };
    const settle = async () => {
      for (let i = 0; i < 20; i++) {
        if (changed) { changed = false; cursor = 0; tree = Home({ account, onAccountChange }); }
        for (const effect of effects.splice(0)) effect();
        await setImmediate();
        if (!changed && !effects.length) return;
      }
      throw Error("Workspace did not settle");
    };
    const nodes = value => {
      if (Array.isArray(value)) return value.flatMap(nodes);
      if (!value || typeof value !== "object") return [value];
      if (typeof value.type === "function") return nodes(value.type(value.props));
      return [value, ...nodes(value.props?.children)];
    };
    const ui = {
      settle, calls, sessions, window, file,
      get signedOut() { return signedOut; },
      find: type => nodes(tree).find(node => node?.type === type),
      text: () => nodes(tree).filter(node => typeof node === "string").join(" "),
      button: label => nodes(tree).find(node => node?.type === "button" && nodes(node.props.children).filter(child => typeof child === "string").join(" ") === label),
    };
    await settle();
    await check(ui);
  } finally {
    for (const cleanup of cleanups) cleanup?.();
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
    delete globalThis.__workspaceLoadingFixture;
  }
}

test("missing project redirects to the loaded list; tools and a saved project still open", async () => {
  await workspace("?view=workspace2&algorithm=pump-station&project=PS-NEW", {}, async ui => {
    assert.match(ui.text(), /Сохранённый расчёт/);
    assert.match(ui.text(), /Проект или версия не найдены/);
    assert.equal(ui.window.location.searchParams.get("project"), null);
    assert.equal(ui.window.location.searchParams.get("view"), "projects");
    assert.equal(ui.sessions.length, 0);
    ui.find("AppNavigation").props.navigate("component-calculator"); await ui.settle();
    assert.ok(ui.find("ComponentCalculator"));
    assert.equal(ui.window.location.searchParams.get("project"), null);
    ui.find("AppNavigation").props.navigate("projects"); await ui.settle();
    ui.button("Открыть проект").props.onClick(); await ui.settle();
    assert.ok(ui.find("NodeWorkspace"));
    assert.equal(ui.sessions[0].latest.project.id, "saved-project");
    assert.doesNotMatch(ui.text(), /Проект или версия не найдены/);
    assert.equal(ui.calls.some(call => call.body), false, "Recovery must not fabricate or overwrite a project");
  });
});

test("stale project parameters never block direct tool links", async () => {
  for (const [view, component] of [["base-values", "BaseValuesPanel"], ["component-calculator", "ComponentCalculator"], ["node-editor", "LazyTool"]]) {
    await workspace(`?view=${view}&project=deleted-id`, {}, ui => {
      assert.ok(ui.find(component), view);
      assert.equal(ui.window.location.searchParams.get("view"), view);
      assert.equal(ui.window.location.searchParams.get("project"), null);
    });
  }
});

test("empty project list opens a fresh product without saving the placeholder ID", async () => {
  await workspace("?view=workspace2&project=PS-NEW", { empty: true }, async ui => {
    assert.match(ui.text(), /нет сохранённых проектов/);
    ui.find("AppNavigation").props.navigateAlgorithm("pump-station", "Насосная установка"); await ui.settle();
    assert.ok(ui.find("NodeWorkspace"));
    assert.notEqual(ui.sessions[0].latest.project.id, "PS-NEW");
    assert.equal(ui.window.location.searchParams.get("project"), ui.sessions[0].latest.project.id);
    assert.doesNotMatch(ui.text(), /Проект или версия не найдены/);
  });
});

test("project list failure is reported without showing a false empty list or blocking tools", async () => {
  await workspace("?view=projects", { listError: 503 }, async ui => {
    assert.match(ui.text(), /Список недоступен/);
    assert.doesNotMatch(ui.text(), /нет сохранённых проектов/);
    ui.find("AppNavigation").props.navigate("base-values"); await ui.settle();
    assert.ok(ui.find("BaseValuesPanel"));
  });
});

test("New after a missing link saves a fresh project before opening it", async () => {
  await workspace("?view=workspace2&project=PS-NEW", { empty: true }, async ui => {
    ui.button("＋ Новый проект").props.onClick(); await ui.settle();
    const write = ui.calls.find(call => call.body)?.body;
    assert.ok(write);
    assert.equal(write.baseRevision, 0);
    assert.notEqual(write.config.project.id, "PS-NEW");
    assert.equal(ui.sessions[0].revision, 1);
    assert.equal(ui.window.location.searchParams.get("project"), write.config.project.id);
    assert.ok(ui.find("NodeWorkspace"));
  });
});

test("opening an algorithm editor without an active project omits the placeholder", async () => {
  await workspace("?view=algorithm-library&project=PS-NEW", {}, async ui => {
    ui.find("LazyTool").props.openEditor("pump-station"); await ui.settle();
    assert.equal(ui.window.location.searchParams.get("view"), "node-editor");
    assert.equal(ui.window.location.searchParams.get("project"), null);
  });
});

test("transient project failures keep their retry URL and allow navigation", async () => {
  await workspace("?view=workspace2&project=temporarily-unavailable", { projectError: 503 }, async ui => {
    assert.match(ui.text(), /Не удалось загрузить проект/);
    assert.equal(ui.window.location.searchParams.get("project"), "temporarily-unavailable");
    ui.button("Мои проекты").props.onClick(); await ui.settle();
    assert.match(ui.text(), /Сохранённый расчёт/);
    assert.equal(ui.window.location.searchParams.get("project"), null);
  });
});

test("expired authentication is not mistaken for a missing project", async () => {
  await workspace("?view=workspace2&project=private-project", { projectError: 401 }, ui => {
    assert.equal(ui.signedOut, true);
    assert.equal(ui.sessions.length, 0);
    assert.equal(ui.window.location.searchParams.get("project"), "private-project");
  });
});

test("project list failure does not prevent a valid direct project from opening", async () => {
  await workspace("?view=workspace2&project=saved-project", { listError: 503 }, ui => {
    assert.ok(ui.find("NodeWorkspace"));
    assert.equal(ui.sessions[0].revision, 3);
  });
});

test("a saved project's runtime failure still leaves independent tools usable", async () => {
  await workspace("?view=workspace2&project=saved-project", { programError: true }, async ui => {
    assert.match(ui.text(), /Версия расчёта недоступна/);
    ui.find("AppNavigation").props.navigate("equipment-admin"); await ui.settle();
    assert.ok(ui.find("EquipmentAdminPanel"));
    assert.equal(ui.sessions.length, 0);
  });
});

test("product opening shows progress immediately and ignores duplicate clicks", async () => {
  const gate=Promise.withResolvers(), options={empty:true,runtimeGate:gate.promise};
  await workspace("?view=projects", options, async ui => {
    const menu=ui.find("AppNavigation");
    menu.props.navigateAlgorithm("pump-station","Насосная установка");
    menu.props.navigateAlgorithm("pump-station","Насосная установка");
    await ui.settle();
    const progress=ui.find("WorkspaceLoading");
    assert.equal(progress.props.modal,true);
    assert.equal(progress.props.title,"Насосная установка");
    assert.equal(progress.props.step,1);
    assert.equal(options.runtimeCalls,1,"Do not launch duplicate workspace loads");
    assert.equal(ui.sessions.length,0);
    gate.resolve();await ui.settle();
    assert.ok(ui.find("NodeWorkspace"));
    assert.equal(ui.find("WorkspaceLoading"),undefined);
  });
});

test("opening failure stays visible and Retry recovers without reloading the page", async () => {
  const options={empty:true,rejectRuntime:true};
  await workspace("?view=projects",options,async ui=>{
    ui.find("AppNavigation").props.navigateAlgorithm("pump-station","Насосная установка");await ui.settle();
    assert.equal(ui.find("WorkspaceLoading").props.error,"Каталог временно недоступен");
    assert.equal(ui.sessions.length,0);
    options.rejectRuntime=false;
    ui.find("WorkspaceLoading").props.retry();await ui.settle();
    assert.ok(ui.find("NodeWorkspace"));
    assert.equal(ui.find("WorkspaceLoading"),undefined);
  });
});

test("saved project opening reports the project request and releases its progress window", async () => {
  const gate=Promise.withResolvers(),options={};
  await workspace("?view=projects",options,async ui=>{
    options.projectGate=gate.promise;
    ui.button("Открыть проект").props.onClick();await ui.settle();
    assert.equal(ui.find("WorkspaceLoading").props.step,1);
    assert.equal(ui.find("WorkspaceLoading").props.modal,true);
    gate.resolve();await ui.settle();
    assert.ok(ui.find("NodeWorkspace"));
    assert.equal(ui.find("WorkspaceLoading"),undefined);
  });
});

test("new project progress waits for persistence and retry keeps the same operation", async () => {
  const gate=Promise.withResolvers(),options={empty:true,saveGate:gate.promise,rejectSave:true};
  await workspace("?view=projects",options,async ui=>{
    ui.button("＋ Новый проект").props.onClick();await ui.settle();
    assert.equal(ui.find("WorkspaceLoading").props.step,3);
    assert.equal(ui.sessions.length,0,"The project must not open before persistence");
    const first=ui.calls.find(call=>call.body).body;
    gate.resolve();await ui.settle();
    assert.match(ui.find("WorkspaceLoading").props.error,/не удалось сохранить/);
    options.rejectSave=false;
    ui.find("WorkspaceLoading").props.retry();await ui.settle();
    assert.deepEqual(ui.calls.filter(call=>call.body).at(-1).body,first);
    assert.ok(ui.find("NodeWorkspace"));
  });
});
