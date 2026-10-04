import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

// Execute the actual route SQL against SQLite, with D1 transaction semantics.
const database = new DatabaseSync(":memory:");
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return database.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: database.prepare(this.sql).all(...this.values) }; }
  async run() { return this.all(); }
}
const DB = {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    database.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); database.exec("COMMIT"); return results; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  },
};
globalThis.__usersTestEnv = { DB };
const serverUrl = new URL("../app/auth-server.ts", import.meta.url);
const serverSource = (await readFile(serverUrl, "utf8")).replace('import { env } from "cloudflare:workers";', "const env = globalThis.__usersTestEnv;");
const replacements = { [serverUrl.href]: serverSource };
const auth = await loadTs(serverUrl, replacements);
const api = await loadTs(new URL("../app/api/users/route.ts", import.meta.url), replacements);
const login = await loadTs(new URL("../app/api/auth/route.ts", import.meta.url), replacements);
// Start with the previous installation's schema, to exercise upgrade behavior.
database.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,email_verified_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
await auth.ensureAuthSchema();
await auth.ensureAuthSchema();
const password = "test-password-123";
const passwordHash = await auth.hashPassword(password);
database.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?)").run("admin", "admin@example.test", "Администратор", passwordHash, "admin");
database.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").run("reader", "reader@example.test", "Пользователь", passwordHash);
const adminToken = await auth.createSession("admin"), userToken = await auth.createSession("reader");
const request = (method, token, body, headers = {}) => new Request("http://localhost/api/users", {
  method, headers: { "Content-Type": "application/json", ...(token ? { Cookie: `ps_session=${token}` } : {}), ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const form = { email: "created@example.test", name: "Новый пользователь", role: "user", password, confirmed: true };

test("schema upgrades old accounts to user without granting admin", () => {
  assert.equal(database.prepare("SELECT role FROM users WHERE id='reader'").get().role, "user");
  assert.ok(database.prepare("PRAGMA table_info(sessions)").all().some(column => column.name === "last_seen_at"));
});

test("anonymous and ordinary users cannot list, create or edit accounts", async () => {
  for (const method of ["GET", "POST", "PATCH"]) {
    assert.equal((await api[method](request(method, null, method === "GET" ? null : form))).status, 401);
    assert.equal((await api[method](request(method, userToken, method === "GET" ? null : form))).status, 403);
  }
});

test("admin list excludes credentials and presence requires a fresh unexpired session", async () => {
  database.prepare("UPDATE sessions SET last_seen_at=datetime('now','-3 minutes') WHERE user_id='reader'").run();
  let response = await api.GET(request("GET", adminToken)), result = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.users.find(user => user.id === "admin").online, true);
  assert.equal(result.users.find(user => user.id === "reader").online, false);
  assert.doesNotMatch(JSON.stringify(result), /password|pbkdf2|token_hash/);
  const heartbeat = await login.POST(request("POST", userToken, { action: "heartbeat" }));
  assert.equal((await heartbeat.json()).user.role, "user");
  result = await (await api.GET(request("GET", adminToken))).json();
  assert.equal(result.users.find(user => user.id === "reader").online, true);
  const second = await auth.createSession("reader");
  database.prepare("UPDATE sessions SET expires_at=datetime('now','-1 second') WHERE token_hash=?").run(await auth.sha256(second));
  await login.POST(request("POST", userToken, { action: "logout" }));
  result = await (await api.GET(request("GET", adminToken))).json();
  assert.equal(result.users.find(user => user.id === "reader").online, false);
});

test("creation requires confirmation, validates fields and rejects cross-origin writes", async () => {
  for (const patch of [{ confirmed: false }, { password: "short" }, { role: "owner" }, { email: "bad" }, { name: " " }]) {
    assert.equal((await api.POST(request("POST", adminToken, { ...form, ...patch }))).status, 400);
  }
  assert.equal((await api.POST(request("POST", adminToken, form, { Origin: "https://another.test" }))).status, 403);
  assert.equal((await api.POST(request("POST", adminToken, form, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
});

let created;
test("admin manually creates a normalized, hashed account that can immediately sign in", async () => {
  const response = await api.POST(request("POST", adminToken, { ...form, email: " CREATED@EXAMPLE.TEST " }));
  assert.equal(response.status, 201); created = (await response.json()).user;
  assert.equal(created.email, form.email); assert.equal(created.online, false); assert.equal(created.verified, true);
  const stored = database.prepare("SELECT password_hash FROM users WHERE id=?").get(created.id).password_hash;
  assert.notEqual(stored, password); assert.equal(await auth.verifyPassword(password, stored), true);
  assert.equal((await login.POST(request("POST", null, { action: "login", email: created.email, password }))).status, 200);
  assert.equal((await api.POST(request("POST", adminToken, form))).status, 409);
});

test("name edits preserve password/sessions; stale edits cannot overwrite changes", async () => {
  const token = await auth.createSession(created.id);
  let response = await api.PATCH(request("PATCH", adminToken, { ...form, password: "", id: created.id, revision: 0, name: "Новое имя" }));
  assert.equal(response.status, 200); created = (await response.json()).user; assert.equal(created.revision, 1);
  assert.ok(await auth.currentUser(request("GET", token)));
  response = await api.PATCH(request("PATCH", adminToken, { ...form, id: created.id, revision: 0, name: "Устаревшее имя" }));
  assert.equal(response.status, 409);
  assert.equal((await auth.currentUser(request("GET", token))).name, "Новое имя");
  assert.equal((await login.POST(request("POST", null, { action: "login", email: created.email, password }))).status, 200);
});

test("duplicate email rolls back all writes and credential changes revoke sessions and tokens", async () => {
  const token = await auth.createSession(created.id);
  await auth.issueToken(created.id, "reset_password");
  const update = { ...form, id: created.id, revision: created.revision, password: "changed-password-456", role: "admin" };
  assert.equal((await api.PATCH(request("PATCH", adminToken, { ...update, email: "admin@example.test" }))).status, 409);
  assert.ok(await auth.currentUser(request("GET", token)));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM auth_tokens WHERE user_id=? AND used_at IS NULL").get(created.id).count, 1);
  const response = await api.PATCH(request("PATCH", adminToken, update));
  assert.equal(response.status, 200); created = (await response.json()).user;
  assert.equal(await auth.currentUser(request("GET", token)), null);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM auth_tokens WHERE user_id=? AND used_at IS NULL").get(created.id).count, 0);
  assert.equal((await login.POST(request("POST", null, { action: "login", email: created.email, password }))).status, 401);
  assert.equal((await login.POST(request("POST", null, { action: "login", email: created.email, password: update.password }))).status, 200);
});

test("an administrator cannot remove their own admin access", async () => {
  assert.equal((await api.PATCH(request("PATCH", adminToken, { ...form, id: "admin", revision: 0, email: "admin@example.test", role: "user", password: "" }))).status, 400);
  assert.equal((await auth.currentUser(request("GET", adminToken))).role, "admin");
});

test("self credential changes require a new sign in", async () => {
  const response = await api.PATCH(request("PATCH", adminToken, { ...form, id: "admin", revision: 0, email: "admin-new@example.test", role: "admin", password: "" }));
  assert.equal(response.status, 200); assert.equal((await response.json()).signedOut, true);
  assert.equal((await api.GET(request("GET", adminToken))).status, 401);
});

test("public registration cannot request admin access", async () => {
  const response = await login.POST(request("POST", null, { action: "register", name: "Регистрация", email: "registered@example.test", password, passwordConfirmation: password, role: "admin" }));
  assert.equal(response.status, 200);
  assert.equal(database.prepare("SELECT role FROM users WHERE email='registered@example.test'").get().role, "user");
});
