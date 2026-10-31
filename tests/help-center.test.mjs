import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
import { collectHelpDocuments } from "../scripts/build-help-content.mjs";

const library = await loadTs(new URL("../app/help-library-server.ts", import.meta.url));
const links = await loadTs(new URL("../app/help-types.ts", import.meta.url));
const policy = await loadTs(new URL("../app/release-policy.ts", import.meta.url));
const authUrl = new URL("../app/auth-server.ts", import.meta.url);
const route = await loadTs(new URL("../app/api/help/route.ts", import.meta.url), {
  [authUrl.href]: `export const json=(data,status=200,headers)=>Response.json(data,{status,headers}); export const currentUser=async request=>request.headers.has('x-test-role')?{id:'fixture',role:request.headers.get('x-test-role')}:null;`,
});

test("all roles can read the complete help library including administrative instructions", async () => {
  for (const role of ["base", "plus", "pro", "admin"]) {
    const headers = { "x-test-role": role };
    const response = await route.GET(new Request("https://app.example/api/help", { headers }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control"), /private, no-store/);
    assert.equal(response.headers.get("Vary"), "Cookie");
    const data = await response.json();
    assert.equal(data.documents.length, data.total);
    assert.ok(data.documents.some((doc) => doc.id === "KB-014"));
    assert.ok(!data.documents.some((doc) => Object.hasOwn(doc, "markdown")));
    const article = await route.GET(new Request("https://app.example/api/help?document=KB-014", { headers }));
    assert.equal(article.status, 200);
    assert.match((await article.json()).document.markdown, /Административные инструменты/);
  }
  assert.equal((await route.GET(new Request("https://app.example/api/help"))).status, 401);
  assert.equal((await route.GET(new Request("https://app.example/api/help?document=KB-001"))).status, 401);
});

test("unknown IDs, oversized queries and non-reading beta requests fail closed", async () => {
  const headers = { "x-test-role": "base" };
  assert.equal((await route.GET(new Request("https://app.example/api/help?document=../../.env.ai.local", { headers }))).status, 404);
  assert.equal((await route.GET(new Request(`https://app.example/api/help?q=${"x".repeat(201)}`, { headers }))).status, 400);
  assert.equal(policy.betaApiAllowed("/api/help", "GET"), true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(policy.betaApiAllowed("/api/help", method), false);
  assert.equal(policy.betaApiAllowed("/api/projects", "GET"), false);
});

test("search matches article text and preserves all internal source links", () => {
  const found = library.helpIndex("покупные патрубки");
  assert.ok(found.documents.length > 0);
  for (const doc of found.documents) {
    const text = library.helpDocument(doc.id).markdown.toLocaleLowerCase("ru-RU");
    assert.ok(text.includes("покупные") && text.includes("патрубки"));
    assert.ok(doc.excerpt.length <= 182);
  }
  assert.equal(library.helpIndex("несуществующееслововдокументации").documents.length, 0);
  assert.equal(found.links["docs/assistant/knowledge/14-admin.md"], "KB-014");
});

test("document navigation supports history, relative links and anchors without active URLs", () => {
  const mapping = { "docs/a.md": "a", "docs/b.md": "b", "README.md": "start" };
  assert.equal(links.resolveHelpLink("b.md#второй-раздел", "docs/a.md", mapping), links.helpUrl("documentation", "b", "второй-раздел"));
  assert.equal(links.resolveHelpLink("../README.md", "docs/a.md", mapping), links.helpUrl("documentation", "start"));
  assert.equal(links.resolveHelpLink("javascript:alert(1)", "docs/a.md", mapping), null);
  assert.equal(links.resolveHelpLink("//evil.example", "docs/a.md", mapping), null);
  assert.equal(links.resolveHelpLink("../../.env.ai.local", "docs/a.md", mapping), null);
  assert.equal(links.resolveHelpLink("../app/auth-server.ts", "docs/a.md", mapping), null);
  assert.equal(links.resolveHelpLink("https://example.com/manual.pdf", "docs/a.md", mapping), "https://example.com/manual.pdf");
  assert.equal(links.headingAnchor("Давление и PN"), "давление-и-pn");
  assert.deepEqual(links.helpLocation("?view=help&tab=support"), { tab: "support", documentId: null, anchor: "" });
});

test("generated help contains all source documentation and excludes assistant control files", async () => {
  const expected = await collectHelpDocuments();
  const built = JSON.parse(await readFile(new URL("../app/help-documents.json", import.meta.url), "utf8"));
  assert.deepEqual(built, expected);
  assert.equal(new Set(built.documents.map((doc) => doc.id)).size, built.documents.length);
  assert.equal(built.documents.filter((doc) => doc.kind === "guide").length, 16);
  assert.ok(built.documents.some((doc) => doc.kind === "archive"));
  assert.ok(built.documents.every((doc) => !/assistant-instructions|source-lock|\.env|evaluation-cases/.test(doc.path)));
});
