import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
const storage = new Map();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
const { assistantChatStore } = await loadTs(new URL("../app/assistant-chat-store.ts", import.meta.url));
test("panels share the current user's conversation but never another user's", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => { calls++; assert.deepEqual(JSON.parse(options.body), { messages: [{ role: "user", content: "Как начать?" }] }); return Response.json({ text: "Откройте подбор.", sources: [] }); });
  const first = assistantChatStore("alice"); first.setDraft("Как начать?");
  assert.equal(assistantChatStore("alice"), first);
  assert.equal(assistantChatStore("bob").getSnapshot().draft, "");
  await first.send(); assert.equal(calls, 1); assert.equal(first.getSnapshot().messages.length, 2);
  assert.equal(first.getSnapshot().pending, false); assert.ok(storage.get("psc:assistant:v1:alice").includes("Откройте подбор."));
  assert.equal(assistantChatStore("bob").getSnapshot().messages.length, 0);
});
test("reset cancels pending work and a late result cannot revive the old conversation", async t => {
  let finish;
  t.mock.method(globalThis, "fetch", () => new Promise(resolve => { finish = resolve; }));
  const store = assistantChatStore("reset-test"); const pending = store.send("Первый вопрос");
  assert.equal(store.getSnapshot().pending, true); store.reset();
  finish(Response.json({ text: "Поздний ответ", sources: [] })); await pending;
  assert.deepEqual(store.getSnapshot().messages, []); assert.equal(store.getSnapshot().pending, false);
});
test("current project context is sent explicitly and conversations stay isolated when switching projects", async t => {
  let payload;
  t.mock.method(globalThis,"fetch",async(_url,options)=>{payload=JSON.parse(options.body);return Response.json({text:"600 мм",sources:[{id:"DATA-001",kind:"data",title:"Базовые значения",url:""},{id:"DATA-002",kind:"data",title:"Подмена",url:"https://evil.example"}]});});
  const first=assistantChatStore("same-user","project-one"),second=assistantChatStore("same-user","project-two");
  await first.send("Межосевое расстояние?",false,{projectId:"project-one"});
  assert.deepEqual(payload.context,{projectId:"project-one"});assert.equal(second.getSnapshot().messages.length,0);assert.equal(first.getSnapshot().messages.at(-1).sources.length,1);
});
test("unavailable storage content is ignored and failed requests can be retried", async t => {
  storage.set("psc:assistant:v1:retry-test", "not-json"); let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => ++attempts === 1 ? Response.json({ error: "Попробуйте позже" }, { status: 503 }) : Response.json({ text: "Готово", sources: [] }));
  const store = assistantChatStore("retry-test"); await store.send("Вопрос");
  assert.equal(store.getSnapshot().error, "Попробуйте позже"); assert.equal(store.getSnapshot().messages.length, 1);
  await store.send(undefined, true); assert.equal(store.getSnapshot().messages.length, 2); assert.equal(store.getSnapshot().error, "");
});
