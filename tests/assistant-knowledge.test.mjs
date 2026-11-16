import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute, sep, basename } from "node:path";
import { buildKnowledge, collectKnowledge } from "../scripts/build-assistant-knowledge.mjs";

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, "pumpstation-kb-test-"));
  t.after(async () => {
    const target = await realpath(root);
    const path = relative(parent, target);
    assert.ok(!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`) && basename(target).startsWith("pumpstation-kb-test-"));
    await rm(target, { recursive: true, force: true });
  });
  await mkdir(join(root, "docs/assistant/knowledge"), { recursive: true });
  await mkdir(join(root, "app"));
  const registry = {
    schemaVersion: 1, language: "ru", reviewedOn: "2026-10-30", scope: "local-working-tree", releaseVersion: "test", exclusions: [],
    documents: [{ id: "KB-001", path: "docs/assistant/knowledge/01-test.md", title: "Проверка", topic: "selection", roles: ["base"], profiles: ["full"], tools: [] }],
  };
  await writeFile(join(root, "docs/assistant/registry.json"), JSON.stringify(registry));
  await writeFile(join(root, "docs/assistant/knowledge/01-test.md"), "# Проверка\n\nТекст для пользователя.\n\n## Источники\n\n- [Правило](../../../app/rules.ts)\n");
  await writeFile(join(root, "app/rules.ts"), "// Internal source text must not be indexed.\n");
  await writeFile(join(root, "docs/assistant/assistant-instructions.md"), "# Instructions\n");
  await writeFile(join(root, "docs/assistant/evaluation-cases.json"), JSON.stringify({ schemaVersion: 1, cases: [{ id: "one", role: "base", profile: "full", question: "Как?", expectedDocumentIds: ["KB-001"], mustCover: ["Правило"], mustNot: [] }] }));
  return { root, registry };
}

test("build publishes only curated text with citation metadata and deterministic output", async (t) => {
  const { root } = await fixture(t);
  await buildKnowledge({ root, mode: "accept-reviewed-sources" });
  const article = join(root, "docs/assistant/knowledge/01-test.md");
  await writeFile(article, `\uFEFF${(await readFile(article, "utf8")).replaceAll("\n", "\r\n")}`);
  await buildKnowledge({ root });
  await buildKnowledge({ root, mode: "check" });
  const content = await readFile(join(root, "work/assistant-knowledge/files/KB-001.md"), "utf8");
  assert.ok(content.includes("Документ: KB-001"));
  assert.ok(content.includes("файл проекта: app/rules.ts"));
  assert.ok(!content.includes("Internal source text"));
  assert.ok(!content.includes("../../../"));
  const manifest = JSON.parse(await readFile(join(root, "work/assistant-knowledge/manifest.json"), "utf8"));
  assert.equal(manifest.documents[0].citation.path, "docs/assistant/knowledge/01-test.md");
  assert.equal(manifest.documents[0].sources[0].sha256.length, 64);
  await writeFile(join(root, "work/assistant-knowledge/files/KB-999.md"), "obsolete");
  await assert.rejects(buildKnowledge({ root }), /Unexpected old files/);
});

test("changed implementation cannot be rebuilt using an old review lock", async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(buildKnowledge({ root }), /Review the articles/);
  await buildKnowledge({ root, mode: "accept-reviewed-sources" });
  await writeFile(join(root, "app/rules.ts"), "// Changed calculation\n");
  await assert.rejects(buildKnowledge({ root }), /Knowledge sources changed/);
});

test("secrets and unregistered articles are rejected before any output is written", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "docs/assistant/knowledge/extra.md"), "Unreviewed article");
  await assert.rejects(collectKnowledge(root), /articles and registry differ/);
  await rm(join(root, "docs/assistant/knowledge/extra.md"));
  const path = join(root, "docs/assistant/knowledge/01-test.md");
  await writeFile(path, `${await readFile(path, "utf8")}\n${"sk-" + "x".repeat(40)}\n`);
  await assert.rejects(collectKnowledge(root), /Possible secret/);
});

test("source links cannot reach credentials or escape the repository", async (t) => {
  const { root } = await fixture(t);
  const article = join(root, "docs/assistant/knowledge/01-test.md");
  await writeFile(article, "# Проверка\n\n## Источники\n\n[secret](../../../.env.ai.local)\n");
  await assert.rejects(collectKnowledge(root), /not approved/);
  await writeFile(article, "# Проверка\n\n## Источники\n\n[outside](../../../../outside.md)\n");
  await assert.rejects(collectKnowledge(root), /escapes repository/);
});

test("admin articles and expected retrieval sources enforce explicit audiences", async (t) => {
  const { root, registry } = await fixture(t);
  registry.documents[0].topic = "administration";
  await writeFile(join(root, "docs/assistant/registry.json"), JSON.stringify(registry));
  await assert.rejects(collectKnowledge(root), /admin-only/);
  registry.documents[0].roles = ["admin"];
  await writeFile(join(root, "docs/assistant/registry.json"), JSON.stringify(registry));
  await assert.rejects(collectKnowledge(root), /Inaccessible expected source/);
});

test("real corpus remains consistent with reviewed sources without generated files", async () => {
  const root = resolve(import.meta.dirname, "..");
  const { lock, summary: result } = await collectKnowledge(root);
  assert.deepEqual(JSON.parse(await readFile(join(root, "docs/assistant/source-lock.json"), "utf8")), lock);
  assert.ok(result.documentCount >= 15);
  assert.ok(result.evaluationCaseCount >= 30);
  assert.equal(result.uploaded, false);
  assert.equal(result.modelAnswersTested, false);
});
