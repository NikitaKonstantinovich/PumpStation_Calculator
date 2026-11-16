import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { Miniflare } from "miniflare";
import { addPumpProductFixture } from "./fixtures/pump-product.mjs";
import { loadTs } from "./load-ts.mjs";

// Run from the frontend checkout with PSC_TEST_DIST pointing at a full build.
const dist = resolve(process.env.PSC_TEST_DIST ?? "dist");
const server = join(dist, "server");
assert.equal(JSON.parse(await readFile(join(dist, "release.json"), "utf8")).profile, "full");
const modules = (await readdir(server, { recursive: true })).filter(path => path.endsWith(".js"));
modules.sort((a, b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));

const token = "project-browser-fixture";
const failure = "Тестовый отказ записи нового проекта.";
const catalog = {
  sourceId: "pump_catalog_v2", id: "a".repeat(64), schemaVersion: "fixture-v1",
  sourceStatus: "isolated test", status: "empty", created: "2026-11-12T00:00:00Z", items: [], issues: []
};
const rows = new Map();
const saves = [];
let gate;
let rejectNew = false;
const projectStore = async request => {
  const input = await request.json();
  if (input.action === "list") {
    return Response.json({ projects: [...rows.values()].map(row => ({ ...row.config.project, revision: row.revision })), next: null });
  }
  if (input.action === "load") {
    const row = rows.get(input.id);
    return row ? Response.json({ ...row.config.project, ...row }) : Response.json({ error: "Проект не найден" }, { status: 404 });
  }
  assert.equal(input.action, "save");
  const id = input.config.project.id;
  const existing = rows.get(id);
  saves.push({ id, revision: input.baseRevision, operation: input.operation });
  if (!existing && gate) await gate.promise;
  if (!existing && rejectNew) return Response.json({ error: failure }, { status: 503 });
  if ((existing?.revision ?? 0) !== input.baseRevision) return Response.json({ error: "Конфликт ревизии" }, { status: 409 });
  const revision = input.baseRevision + 1;
  rows.set(id, { config: input.config, revision });
  return Response.json({ revision });
};
const worker = new Miniflare({
  host: "127.0.0.1", port: 0, modulesRoot: server,
  modules: modules.map(path => ({ type: "ESModule", path: join(server, path) })),
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], serviceBindings: { PROJECT_STORE: projectStore, NODE_CATALOG: async () => Response.json(catalog) },
  assets: { directory: join(dist, "client"), binding: "ASSETS", routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } }
});
const sql = new DatabaseSync(":memory:");
let browser, profile, profileRoot, socket, closed;

async function until(check, description) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await check();
    if (value) return value;
    await delay(75);
  }
  throw Error(description);
}

try {
  for (const name of (await readdir("drizzle")).filter(name => name.endsWith(".sql")).sort()) {
    sql.exec(await readFile(join("drizzle", name), "utf8"));
  }
  const db = await worker.getD1Database("DB");
  const schema = sql.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,rowid").all();
  await db.batch(schema.map(row => db.prepare(row.sql)));
  await db.prepare("INSERT INTO node_tool_state(id) VALUES(1)").run();
  const engineeringVersion = "engineering-v1";
  await db.prepare("INSERT INTO engineering_versions(id,program,author) VALUES(?,?,?)").bind(engineeringVersion, JSON.stringify({ version: engineeringVersion, plans: {}, args: {} }), "Fixture").run();
  await db.prepare("INSERT INTO engineering_state(id,active) VALUES(1,?)").bind(engineeringVersion).run();
  await db.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role,access_level) VALUES('fixture','fixture@example.test','Fixture','fixture',CURRENT_TIMESTAMP,'admin','base')").run();
  await db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at) VALUES('fixture','fixture',?,datetime('now','+1 hour'),CURRENT_TIMESTAMP)").bind(createHash("sha256").update(token).digest("base64url")).run();

  const origin = (await worker.ready).origin;
  const request = (path, body, method = body ? "POST" : "GET") => fetch(new URL(path, origin), { method, headers: { Cookie: "ps_session=" + token, Origin: origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = async (path, body, method) => {
    const response = await request(path, body, method);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };
  const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
  const { prepareDocument } = await loadTs(new URL("../app/node-tools/authoring.ts", import.meta.url));
  const { migrateProduct } = await loadTs(new URL("../app/node-tools/product-state.ts", import.meta.url));
  const state = await json("/api/admin/node-tools");
  await json("/api/admin/node-tools", { action: "publish", revision: state.revision, document: addPumpProductFixture(prepareDocument(state.draft)) });
  const remote = await json("/api/workspace2?algorithm=pump-station");
  const original = createProject("Исходный проект", { baseValues: (await json("/api/base-values/effective")).applied });
  original.project.graphVersion = engineeringVersion;
  original.workspace2 = migrateProduct(remote.program, undefined, remote.defaults, remote.baseVersions, remote.role, remote.resources, remote.sourceVersions).data;
  original.workspace2.tools.settings.values = {
    "main.flowRate": 12, "main.head": 20, "main.workingPumpCount": 1, "main.reservePumpCount": 0
  };
  await json("/api/projects", { config: original, baseRevision: 0, operation: randomUUID() }, "PUT");

  await mkdir("work", { recursive: true });
  profileRoot = await realpath("work");
  profile = await mkdtemp(join(profileRoot, "project-new-browser-"));
  assert.equal(dirname(resolve(profile)), profileRoot);
  browser = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless", "--disable-gpu", "--disable-extensions", "--no-first-run", "--remote-debugging-port=0",
    "--user-data-dir=" + profile, "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  let launchError;
  browser.on("error", error => { launchError = error; });
  closed = new Promise(resolve => browser.once("close", resolve));
  const devTools = await until(async () => {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw Error("Chrome closed before exposing DevTools.");
    const active = await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "");
    const port = active.split("\n")[0].trim();
    if (!port) return;
    const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then(r => r.json()).catch(() => []);
    return targets.find(target => target.type === "page")?.webSocketDebuggerUrl;
  }, "Chrome DevTools did not start.");
  socket = new WebSocket(devTools);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const command = pending.get(message.id);
    if (!command) return;
    pending.delete(message.id);
    if (message.error) command.reject(Error(message.error.message));
    else command.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const command of pending.values()) command.reject(Error("Chrome DevTools connection closed."));
    pending.clear();
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.result.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const pageProject = () => evaluate("new URL(location.href).searchParams.get('project')");
  const newButton = 'document.querySelector(\'button[aria-label="Новый проект"]\')';
  const workspaceReady = () => until(() => evaluate("!globalThis.fixtureBeforeReload && Boolean(" + newButton + ")"), "The node workspace did not open.");
  const start = new URL("/?" + new URLSearchParams({ view: "workspace2", algorithm: "pump-station", project: original.project.id }), origin);
  assert.equal((await send("Network.setCookie", { name: "ps_session", value: token, url: origin, httpOnly: true })).success, true);
  await send("Page.navigate", { url: new URL('/?project=' + original.project.id, origin).href });
  await workspaceReady();
  assert.equal(await pageProject(), original.project.id);
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"), 'workspace2');
  assert.equal(await evaluate("document.body.innerText.includes('Первое рабочее пространство')"), false);
  await send("Page.navigate", { url: new URL('/?view=geometry-nodes&project=' + original.project.id, origin).href });
  await until(() => evaluate("document.querySelector('.al-library h1')?.textContent === 'Библиотека алгоритмов'"), 'The retired editor did not open the algorithm library.');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"), 'algorithm-library');
  await send("Page.navigate", { url: start.href });
  await workspaceReady();

  gate = Promise.withResolvers();
  await evaluate(newButton + ".click()");
  const draft = await until(async () => {
    assert.equal(await pageProject(), original.project.id, "The URL must keep the original project until the first write is acknowledged.");
    return saves.find(save => save.id !== original.project.id);
  }, "The New button never attempted a first write.");
  assert.equal(draft.revision, 0);
  assert.equal(await pageProject(), original.project.id, "The URL must keep the original project until the first write is acknowledged.");
  gate.resolve();
  gate = undefined;
  await until(async () => await pageProject() === draft.id, "The saved project did not open.");
  await evaluate("globalThis.fixtureBeforeReload = true");
  await send("Page.reload", { ignoreCache: true });
  await workspaceReady();
  assert.equal(await pageProject(), draft.id);
  const created = await json("/api/projects?id=" + encodeURIComponent(draft.id));
  assert.equal(created.revision, 1);
  assert.deepEqual(created.config.workspace2.tools.settings.values, {});
  assert.deepEqual(created.config.workspace2.tools.pumpFixture.values, {});
  assert.equal(created.config.workspace2.product.sourceVersions.pump_catalog_v2, catalog.id);
  assert.equal((await json("/api/projects?id=" + encodeURIComponent(original.project.id))).config.workspace2.tools.settings.values["main.flowRate"], 12);

  rejectNew = true;
  await evaluate(newButton + ".click()");
  await until(() => evaluate("document.body.innerText.includes(" + JSON.stringify(failure) + ")"), "The first-write rejection was not reported in the UI.");
  assert.equal(await pageProject(), draft.id, "A rejected write must keep the open project.");
  assert.equal(rows.size, 2, "No project may appear in the store after a rejected write.");
  const rejected = saves.at(-1);

  rejectNew = false;
  await evaluate(newButton + ".click()");
  const retryId = await until(async () => {
    const id = await pageProject();
    return id && id !== draft.id ? id : null;
  }, "The New button did not recover after a rejected write.");
  assert.equal(retryId, rejected.id);
  assert.deepEqual(saves.at(-1), rejected, "The retry must reuse the same first-write operation.");
  assert.equal((await json("/api/projects?id=" + encodeURIComponent(retryId))).revision, 1);
  assert.equal(rows.size, 3);

  const partial = created.config;
  partial.workspace2.tools.settings.values["main.flowRate"] = 10;
  await json("/api/projects", { config: partial, baseRevision: 1, operation: randomUUID() }, "PUT");
  const savedDraft = await json("/api/projects?id=" + encodeURIComponent(draft.id));
  assert.deepEqual(savedDraft.config.workspace2.tools.settings.values, { "main.flowRate": 10 });
  partial.workspace2.tools.settings.values["main.workingPumpCount"] = 1.5;
  const invalid = await request("/api/projects", { config: partial, baseRevision: 2, operation: randomUUID() }, "PUT");
  assert.equal(invalid.status, 400, await invalid.text());
  assert.equal((await json("/api/projects?id=" + encodeURIComponent(draft.id))).revision, 2);
  const legacy = createProject('Сохранённый проект прежнего интерфейса');
  legacy.project.graphVersion = engineeringVersion;
  legacy.entities['system-input'].flowRate = 27;
  rows.set(legacy.project.id, {config: legacy, revision: 1});
  await send('Page.navigate', {url: new URL('/?view=workspace&project=' + legacy.project.id, origin).href});
  await until(() => evaluate("document.querySelector('.projects-main h1')?.textContent === 'Мои проекты' && document.body.innerText.includes('Открыть в продукте')"), 'The legacy project did not open in the project list.');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"), 'projects');
  assert.equal(rows.get(legacy.project.id).config.entities['system-input'].flowRate, 27);
  assert.equal(rows.get(legacy.project.id).revision, 1);
  assert.equal(rows.get(legacy.project.id).config.workspace2, undefined);
  console.log("PASS · current project routing, retired editor redirect, legacy project preservation, new project save/reload/retry and partial draft validation");
} finally {
  gate?.resolve();
  socket?.close();
  browser?.kill();
  if (closed) await Promise.race([closed, delay(5000)]);
  if (profile) {
    const target = await realpath(profile);
    assert.equal(dirname(target), profileRoot);
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
  }
  sql.close();
  await worker.dispose();
}
