globalThis.__PSC_RELEASE_PROFILE__ = "full";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

globalThis.__converterTest = { env: {}, user: { id: "owner-1" }, calls: [], response: () => Response.json({ job: null }) };
const server = new URL("../app/model-converter-server.ts", import.meta.url);
const source = (await readFile(server, "utf8"))
  .replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__converterTest.env;')
  .replace("await fetch(", "await globalThis.__converterTest.fetch(");
globalThis.__converterTest.fetch = async (url, options) => { globalThis.__converterTest.calls.push({ url, options }); return globalThis.__converterTest.response(); };
const { converterRequest } = await loadTs(server, {
  [server.href]: source,
  [new URL("../app/auth-server.ts", import.meta.url).href]: 'export async function currentUser() { return globalThis.__converterTest.user; } export const json = (data,status=200,headers) => Response.json(data,{status,headers});',
});

test("conversion proxy requires authentication and reports missing configuration", async () => {
  const state = globalThis.__converterTest;
  state.user = null;
  assert.equal((await converterRequest(new Request("https://app.test/api/model-preparation"), "/v1/jobs")).status, 401);
  state.user = { id: "owner-1" };
  const response = await converterRequest(new Request("https://app.test/api/model-preparation"), "/v1/jobs");
  assert.equal(response.status, 503); assert.match((await response.json()).error, /MODEL_CONVERTER_URL/);
  assert.equal(state.calls.length, 0);
});

test("proxy binds ownership to session and forwards job without exposing token to browser", async () => {
  const state = globalThis.__converterTest;
  Object.assign(state.env, { MODEL_CONVERTER_URL: "https://converter.test/", MODEL_CONVERTER_TOKEN: "test-server-token" });
  state.response = () => Response.json({ job: { id: "job-1" } }, { status: 202 });
  const response = await converterRequest(new Request("https://app.test/api/model-preparation", { headers: { origin: "https://app.test" } }), "/v1/jobs", { projectId: "station", items: [] });
  assert.equal(response.status, 202);
  const call = state.calls.at(-1);
  assert.equal(call.url, "https://converter.test/v1/jobs");
  assert.equal(call.options.headers["X-Model-Owner"], "owner-1");
  assert.equal(call.options.headers.Authorization, "Bearer test-server-token");
  assert.equal(call.options.redirect, "manual");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(await response.text(), /test-server-token/);
  assert.equal((await converterRequest(new Request("https://app.test/api/model-preparation", { headers: { origin: "https://elsewhere.test" } }), "/v1/jobs", {})).status, 403);
});

test("asset streaming preserves bytes and service redirects never receive credentials", async () => {
  const state = globalThis.__converterTest;
  state.response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "model/stl" } });
  const response = await converterRequest(new Request("https://app.test/model.stl"), "/v1/assets/model.stl");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  assert.equal(response.headers.get("Content-Type"), "model/stl");
  assert.match(response.headers.get("Cache-Control"), /private/);
  state.response = () => new Response(null, { status: 302, headers: { Location: "https://elsewhere.test" } });
  const redirected = await converterRequest(new Request("https://app.test/api"), "/v1/jobs");
  assert.equal(redirected.status, 502);
  assert.match((await redirected.json()).error, /перенаправление/);
});
