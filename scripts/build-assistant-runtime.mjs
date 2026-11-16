import { readFile, writeFile } from "node:fs/promises";
import { collectKnowledge } from "./build-assistant-knowledge.mjs";
const root = new URL("../", import.meta.url);
const prepared = await collectKnowledge();
const accepted = JSON.parse(await readFile(new URL("docs/assistant/source-lock.json", root), "utf8"));
if (JSON.stringify(accepted) !== JSON.stringify(prepared.lock)) throw new Error("Review changed knowledge sources before building the assistant runtime.");
const manifest = JSON.parse(prepared.files.get("manifest.json"));
const content = JSON.stringify({
  reviewedOn: manifest.reviewedOn,
  instructions: (await readFile(new URL("docs/assistant/assistant-instructions.md", root), "utf8")).replace(/\r\n?/g, "\n"),
  documents: manifest.documents.map(doc => ({ id: doc.id, title: doc.title, roles: doc.roles, profiles: doc.profiles, text: prepared.files.get(doc.file).split("\n## Источники\n")[0] })),
}, null, 2) + "\n";
const output = new URL("app/assistant-knowledge.json", root);
if (process.argv[2] === "--check") {
  if (await readFile(output, "utf8") !== content) throw new Error("Assistant runtime knowledge is stale.");
} else {
  if (process.argv.length > 2) throw new Error("Usage: node scripts/build-assistant-runtime.mjs [--check]");
  await writeFile(output, content);
}
console.log(`Assistant runtime: ${manifest.documents.length} reviewed articles; no API requests.`);
