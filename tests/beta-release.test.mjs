import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const database = new DatabaseSync(":memory:");
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return database.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: database.prepare(this.sql).all(...this.values) }; }
  async run() { return this.all(); }
}
globalThis.__betaTestEnv = { DB: {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    database.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); database.exec("COMMIT"); return results; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  },
} };
const authUrl = new URL("../app/auth-server.ts", import.meta.url);
const replacements = {
  [authUrl.href]: (await readFile(authUrl, "utf8")).replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__betaTestEnv;'),
  [new URL("../app/model-converter-server.ts", import.meta.url).href]: 'export function converterRequest() { throw new Error("Disabled converter was invoked"); }',
};
const auth = await loadTs(authUrl, replacements);
await auth.ensureAuthSchema();
const guard = await loadTs(new URL("../app/release-server.ts", import.meta.url), replacements);
const login = await loadTs(new URL("../app/api/auth/route.ts", import.meta.url), replacements);
const policy = await loadTs(new URL("../app/release-policy.ts", import.meta.url));
const state = await loadTs(new URL("../app/beta-state.ts", import.meta.url));
const sessions = {};
const password = "beta-unit-test-password";
const hash = await auth.hashPassword(password);
for (const role of ["base", "plus", "pro", "admin"]) {
  database.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role,access_level) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,?)").run(role, `${role}@example.test`, role, hash, role === "admin" ? "admin" : "user", role === "admin" ? "base" : role);
  sessions[role] = await auth.createSession(role);
  database.prepare("INSERT INTO user_projects(id,user_id,name,config_json) VALUES(?,?,?,?)").run(`legacy-${role}`, role, "Полный проект", '{"model":"keep","spec":"keep","settings":{"stationType":"combined"}}');
}
const request = (path, method = "GET", role, body) => new Request(`https://beta.test${path}`, { method, headers: { ...(role ? { Cookie: `ps_session=${sessions[role]}` } : {}), "Content-Type": "application/json" }, ...(!["GET", "HEAD"].includes(method) ? { body: JSON.stringify(body ?? { role: "admin", profile: "full" }) } : {}) });
const snapshot = () => JSON.stringify(database.prepare("SELECT * FROM user_projects ORDER BY id").all());

test("unconfigured release is beta and URL/storage cannot enable extra tools", () => {
  assert.equal(policy.IS_BETA, true);
  assert.deepEqual(policy.BETA_TOOLS, ["input", "chart", "sketch", "components", "assistant"]);
  for (const tool of ["model", "settings", "input2", "users", "projects", "component-calculator"]) assert.equal(policy.betaToolFromUrl(`?panel=${tool}&profile=full&role=admin`), null);
  const poisoned = state.parseBetaInput({ ...state.emptyBetaInput(), flowRate: 20, head: 30, calculated: true, role: "admin", settings: { stationType: "combined" }, windows: [{ activeTool: "model" }], profile: "full" });
  assert.equal(poisoned.calculated, true);
  for (const field of ["role", "settings", "windows", "profile"]) assert.ok(!(field in poisoned));
  assert.equal(state.parseBetaInput({ flowRate: Infinity, workingPumpCount: 400, calculated: true }).calculated, false);
  assert.notEqual(state.betaStorageKey("alice"), state.betaStorageKey("bob"));
});

test("every disabled API method is denied for all roles before side effects", async () => {
  const before = snapshot();
  const routes = ["projects", "collectors", "control-cabinets", "component-calculator", "model-preparation", "model-preparation/assets/[filename]"];
  for (const route of routes) {
    const api = await loadTs(new URL(`../app/api/${route}/route.ts`, import.meta.url), replacements);
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      assert.equal((await guard.guardReleaseRequest(request(`/api/${route}`, method))).status, 401);
      for (const role of Object.keys(sessions)) {
        const response = await guard.guardReleaseRequest(request(`/api/${route}?profile=full`, method, role));
        assert.equal(response.status, 403, `${role} ${method} ${route}`);
        assert.equal((await response.json()).code, "FEATURE_DISABLED_IN_BETA");
        if (api[method]) assert.equal((await api[method](request(`/api/${route}`, method, role), { params: Promise.resolve({ filename: "part.stl" }) })).status, 403);
      }
    }
  }
  assert.equal(snapshot(), before, "Original projects must remain byte-for-byte intact");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users").get().count, 4);
});

test("beta users administration requires a server-authenticated admin", async () => {
  const users = await loadTs(new URL("../app/api/users/route.ts", import.meta.url), replacements);
  const before = snapshot();
  for (const method of ["GET", "POST", "PATCH"]) {
    assert.equal(await guard.guardReleaseRequest(request("/api/users", method)), null, "users route owns authorization");
    assert.equal((await users[method](request("/api/users", method))).status, 401);
    for (const role of ["base", "plus", "pro"]) {
      const response = await users[method](request("/api/users?role=admin&profile=full", method, role));
      assert.equal(response.status, 403, `${role} ${method}`);
    }
  }
  for (const method of ["PUT", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await guard.guardReleaseRequest(request("/api/users", method))).status, 401);
    for (const role of Object.keys(sessions)) assert.equal((await guard.guardReleaseRequest(request("/api/users", method, role))).status, 403);
  }
  const response = await users.GET(request("/api/users", "GET", "admin"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const listed = (await response.json()).users;
  assert.equal(listed.length, 4);
  assert.deepEqual(Object.keys(listed[0]).sort(), ["email", "id", "name", "online", "revision", "role", "verified"]);
  const form = { email: "invited@example.test", name: "Beta tester", role: "base", password, confirmed: true };
  const created = await users.POST(request("/api/users", "POST", "admin", form));
  assert.equal(created.status, 201);
  const added = (await created.json()).user;
  try {
    const updated = await users.PATCH(request("/api/users", "PATCH", "admin", { ...form, id: added.id, revision: added.revision, name: "Updated tester", password: "" }));
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).user.name, "Updated tester");
    assert.equal(snapshot(), before);
  } finally { database.prepare("DELETE FROM users WHERE id=?").run(added.id); }
});

test("catalogues and drawings authenticate; disabled files stay forbidden to admins", async () => {
  for (const path of ["/pumps.json", "/binding-components.json", "/control-cabinet-database.json", "/reference-pump-assets/pump.png", "/_next/static/chunks/beta-workspace-abc.js"]) {
    for (const method of ["GET", "HEAD"]) {
      assert.equal((await guard.guardReleaseRequest(request(path, method))).status, 401, path);
      for (const role of Object.keys(sessions)) assert.equal(await guard.guardReleaseRequest(request(path, method, role)), null);
    }
  }
  for (const path of ["/collector-catalog.json", "/component-insert-source.json", "/model-assets/manifest.json", "/control-cabinets.json", "/_vinext/image?url=/model-assets/part.stl", "/.env", "/new-secret.json"]) assert.equal((await guard.guardReleaseRequest(request(path, "GET", "admin"))).status, 403, path);
  for (const path of ["/", "/favicon.svg", "/_next/static/chunks/page-abc.js", "/_next/static/css/index.abc.css"]) assert.equal(await guard.guardReleaseRequest(request(path)), null);
  assert.equal((await guard.guardReleaseRequest(request("/api/components", "POST", "admin"))).status, 403);
  for (const path of ["/_next/static/chunks/%62eta-workspace-abc.js", "/_next/static/chunks/%2e%2e%2fbeta-workspace-abc.js"]) {
    assert.equal((await guard.guardReleaseRequest(request(path))).status, 401);
  }
});

test("registration and verification are closed without mutations; individual login/logout still works", async () => {
  for (const action of ["register", "verify"]) {
    const response = await login.POST(request("/api/auth", "POST", undefined, { action, name: "Outsider", email: "new@example.test", password, passwordConfirmation: password, role: "admin" }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "FEATURE_DISABLED_IN_BETA");
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users").get().count, 4);
  const response = await login.POST(request("/api/auth", "POST", undefined, { action: "login", email: "admin@example.test", password }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; Secure/);
  assert.equal((await login.GET(new Request("https://beta.test/api/auth", { headers: { Cookie: cookie } }))).status, 200);
  await login.POST(new Request("https://beta.test/api/auth", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: '{"action":"logout"}' }));
  assert.equal((await login.GET(new Request("https://beta.test/api/auth", { headers: { Cookie: cookie } }))).status, 401);
});

test("built beta client contains no disabled feature endpoints or 3D engine", async () => {
  await assert.rejects(access(new URL("../dist/client/model-assets/", import.meta.url)), { code: "ENOENT" });
  const root = new URL("../dist/client/_next/static/chunks/", import.meta.url);
  const files = await readdir(root);
  assert.ok(files.some(name => name.startsWith("beta-workspace-")));
  for (const name of files.filter(name => name.endsWith(".js"))) {
    const code = await readFile(new URL(name, root), "utf8");
    if (!name.startsWith("index-")) assert.ok(!/WebGLRenderer|\/api\/projects|\/api\/model-preparation|\/api\/collectors|\/api\/component-calculator|\/api\/control-cabinets/.test(code), name);
  }
});

test("beta password recovery never reveals local development links and uses single-use tokens", async () => {
  const localRequest=new Request("http://localhost/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"forgot",email:"base@example.test"})});
  const unavailable=await login.POST(localRequest);
  assert.equal(unavailable.status,503);
  assert.ok(!("developmentLink" in await unavailable.json()));
  const originalFetch=globalThis.fetch;
  globalThis.__betaTestEnv.RESEND_API_KEY="test-mail-key";
  globalThis.__betaTestEnv.EMAIL_FROM="beta@example.test";
  globalThis.__betaTestEnv.APP_BASE_URL="https://beta.test";
  let message;
  globalThis.fetch=async(url,options)=>{assert.equal(url,"https://api.resend.com/emails");message=JSON.parse(options.body);return new Response("{}",{status:200});};
  try {
    const forgot=await login.POST(request("/api/auth","POST",undefined,{action:"forgot",email:"base@example.test"}));
    assert.equal(forgot.status,200);
    assert.ok(!("developmentLink" in await forgot.json()));
    assert.deepEqual(message.to,["base@example.test"]);
    const token=new URL(message.text.match(/https:\/\/beta\.test\/\?[^\s]+/)[0]).searchParams.get("token");
    const changedPassword="new-beta-test-password";
    const reset=await login.POST(request("/api/auth","POST",undefined,{action:"reset",token,password:changedPassword}));
    assert.equal(reset.status,200);
    assert.equal((await login.GET(request("/api/auth","GET","base"))).status,401,"old sessions must be revoked");
    assert.equal((await login.POST(request("/api/auth","POST",undefined,{action:"reset",token,password:changedPassword}))).status,400);
    assert.equal((await login.POST(request("/api/auth","POST",undefined,{action:"login",email:"base@example.test",password:changedPassword}))).status,200);
  } finally {
    globalThis.fetch=originalFetch;
    delete globalThis.__betaTestEnv.RESEND_API_KEY;
    delete globalThis.__betaTestEnv.EMAIL_FROM;
    delete globalThis.__betaTestEnv.APP_BASE_URL;
  }
});

test("beta layout keeps full workspace controls but strips forbidden panels and entities", () => {
  const defaults=state.defaultBetaState();
  assert.deepEqual(defaults.workspace.windows.map(panel=>panel.activeTool),policy.BETA_TOOLS.filter(tool=>tool!=="assistant"));
  const hostile={input:{...defaults.input,flowRate:20,head:40,calculated:true},role:"admin",profile:"full",entities:{"station-settings":{stationType:"combined"}},workspace:{...defaults.workspace,mode:"grid",windows:[
    {...defaults.workspace.windows[0],entityId:"station-model",x:123},
    {id:"exploit",activeTool:"model",entityId:"station-model"},
    {id:"another",activeTool:"input2",entityId:"system-input-2"},
    {id:"empty",entityId:"station-model"},
  ],grid:{columns:2,rows:2,columnSizes:[2,1],rowSizes:[1,3],cells:["exploit","input","input","empty"]}}};
  const before=JSON.stringify(hostile),parsed=state.parseBetaState(hostile);
  assert.equal(JSON.stringify(hostile),before);
  assert.deepEqual(Object.keys(parsed),["input","workspace"]);
  assert.deepEqual(parsed.workspace.windows.map(panel=>panel.id),["input","empty"]);
  assert.equal(parsed.workspace.windows[0].entityId,"system-input");
  assert.equal(parsed.workspace.windows[1].entityId,"system-input");
  assert.equal(parsed.workspace.windows[0].x,123);
  assert.equal(parsed.workspace.mode,"grid");
  assert.deepEqual(parsed.workspace.grid.cells,[null,"input",null,"empty"]);
  assert.deepEqual(state.parseBetaState(JSON.parse(JSON.stringify(parsed))),parsed);
  const recovered=state.parseBetaState({workspace:{windows:[{id:"model",activeTool:"model"}]}});
  assert.deepEqual(recovered.workspace.windows.map(panel=>panel.activeTool),policy.BETA_TOOLS.filter(tool=>tool!=="assistant"));
});
