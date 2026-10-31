import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRECTORY = "docs/assistant";
const OUTPUT = "work/assistant-knowledge";
const ROLES = ["base", "plus", "pro", "admin"];
const PROFILES = ["full", "beta"];
const hash = (text) => createHash("sha256").update(text).digest("hex");
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const within = (root, path) => {
  const part = relative(root, path);
  return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`);
};

async function readRepositoryFile(root, path) {
  requireValue(typeof path === "string" && !isAbsolute(path) && !path.split(/[\\/]/).includes(".."), "Invalid repository path.");
  const file = await realpath(resolve(root, path));
  requireValue(within(await realpath(root), file), `Source is outside repository: ${path}`);
  // Git may use CRLF on Windows and LF elsewhere; content revisions must agree.
  return (await readFile(file, "utf8")).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function checkAudience(values, allowed, label) {
  requireValue(Array.isArray(values) && values.length > 0 && new Set(values).size === values.length && values.every((value) => allowed.includes(value)), `Invalid ${label}.`);
}

function checkText(text, path) {
  // Inspect only curated articles, never local credentials or arbitrary workspace files.
  requireValue(!/\bsk-(?:proj-)?[a-zA-Z0-9_-]{24,}\b/.test(text), `Possible secret in ${path}; remove it before indexing.`);
  requireValue(!/\b(?:OPENAI_API_KEY|RESEND_API_KEY|MODEL_CONVERTER_TOKEN)\s*=\s*\S+/.test(text), `Secret assignment in ${path}.`);
  requireValue(!/[A-Z]:[\\/](?:Users|PumpStation)/i.test(text), `Personal local path in ${path}.`);
}

export async function collectKnowledge(root = ROOT) {
  const hashes = new Map();
  const read = async (path) => {
    const text = await readRepositoryFile(root, path);
    const digest = hash(text);
    requireValue(!hashes.has(path) || hashes.get(path) === digest, `Source changed during collection: ${path}`);
    hashes.set(path, digest);
    return text;
  };
  const registry = JSON.parse(await read(`${DIRECTORY}/registry.json`));
  requireValue(registry.schemaVersion === 1 && registry.language === "ru" && registry.scope === "local-working-tree", "Unsupported knowledge registry.");
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(registry.reviewedOn), "A review date is required.");
  requireValue(Array.isArray(registry.documents) && registry.documents.length > 0, "No knowledge documents registered.");
  const documents = [];
  const files = new Map();
  const ids = new Set();
  const paths = new Set();
  for (const entry of registry.documents) {
    requireValue(/^KB-\d{3}$/.test(entry.id) && !ids.has(entry.id), "Invalid or duplicate document ID.");
    ids.add(entry.id);
    requireValue(/^docs\/assistant\/knowledge\/[a-z0-9-]+\.md$/.test(entry.path) && !paths.has(entry.path), "Invalid or duplicate knowledge path.");
    paths.add(entry.path);
    requireValue(typeof entry.title === "string" && /^[a-z0-9-]+$/.test(entry.topic), `Invalid metadata for ${entry.id}.`);
    checkAudience(entry.roles, ROLES, `${entry.id} roles`);
    checkAudience(entry.profiles, PROFILES, `${entry.id} profiles`);
    requireValue(entry.topic !== "administration" || (entry.roles.length === 1 && entry.roles[0] === "admin"), "Administrative articles must be admin-only.");
    const body = await read(entry.path);
    checkText(body, entry.path);
    requireValue(body.startsWith(`# ${entry.title}\n`) && body.includes("\n## Источники\n"), `Title or sources missing in ${entry.id}.`);
    const sourceSection = body.split("\n## Источники\n")[1];
    const sources = [];
    const links = [...body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    requireValue(links.length > 0, `No source links in ${entry.id}.`);
    let searchableBody = body;
    for (const [markdown, label, href] of links) {
      requireValue(!href.includes(":") && !href.includes("#") && !href.includes("?"), `Unsupported source link in ${entry.id}.`);
      const resolved = resolve(root, dirname(entry.path), href);
      requireValue(within(resolve(root), resolved), `Source link escapes repository in ${entry.id}.`);
      const path = relative(resolve(root), resolved).split(sep).join("/");
      requireValue(/^(?:README\.md|docs\/[a-z0-9-]+\.md|data\/pump-catalog\/[A-Za-z0-9-]+\.md|app\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.tsx?)$/.test(path), `Source type is not approved: ${path}`);
      requireValue(!/(?:audit|development-plan|solidworks-assembly-algorithm|current-state)/.test(path), `Historical or planning source is not approved: ${path}`);
      await read(path);
      if (sourceSection.includes(markdown) && !sources.includes(path)) sources.push(path);
      // Relative repository links are not usable as remote File Search citations.
      searchableBody = searchableBody.replaceAll(markdown, `${label} (файл проекта: ${path})`);
    }
    requireValue(sources.length > 0, `No provenance in ${entry.id}.`);
    const content = `Документ: ${entry.id}\nПроверен: ${registry.reviewedOn}\nОбласть: локальные исходники; выпуск ${registry.releaseVersion}\nПрофили: ${entry.profiles.join(", ")}\nРоли читателя: ${entry.roles.join(", ")}\n\n${searchableBody}`;
    const file = `files/${entry.id}.md`;
    files.set(file, content);
    documents.push({ ...entry, file, language: registry.language, reviewedOn: registry.reviewedOn, sha256: hash(content), bytes: Buffer.byteLength(content), sources: sources.map((path) => ({ path, sha256: hashes.get(path) })), citation: { id: entry.id, title: entry.title, path: entry.path, url: `/?view=help&tab=documentation&doc=${entry.id}` } });
  }
  // New prose must be reviewed and explicitly added to the registry, not silently skipped.
  const actual = (await readdir(resolve(root, DIRECTORY, "knowledge"))).filter((name) => name.endsWith(".md"));
  requireValue(actual.length === paths.size && actual.every((name) => paths.has(`${DIRECTORY}/knowledge/${name}`)), "Knowledge articles and registry differ.");
  const evaluation = JSON.parse(await read(`${DIRECTORY}/evaluation-cases.json`));
  requireValue(evaluation.schemaVersion === 1 && evaluation.cases?.length > 0, "Evaluation cases are required.");
  const caseIds = new Set();
  for (const item of evaluation.cases) {
    requireValue(typeof item.id === "string" && !caseIds.has(item.id), "Duplicate evaluation ID.");
    caseIds.add(item.id);
    requireValue(PROFILES.includes(item.profile) && ROLES.includes(item.role) && typeof item.question === "string" && item.question.length > 0, `Invalid evaluation context: ${item.id}`);
    requireValue(item.expectedDocumentIds?.length > 0 && item.mustCover?.length > 0 && Array.isArray(item.mustNot), `Incomplete evaluation: ${item.id}`);
    for (const id of item.expectedDocumentIds) {
      const doc = documents.find((entry) => entry.id === id);
      requireValue(doc && doc.roles.includes(item.role) && doc.profiles.includes(item.profile), `Inaccessible expected source in evaluation ${item.id}.`);
    }
  }
  const instructions = await read(`${DIRECTORY}/assistant-instructions.md`);
  checkText(instructions, "assistant-instructions.md");
  const lock = { schemaVersion: 1, reviewedOn: registry.reviewedOn, scope: registry.scope, textNormalization: "UTF-8, no BOM, LF", files: Object.fromEntries([...hashes].sort(([a], [b]) => a.localeCompare(b))) };
  const snapshot = hash(JSON.stringify(lock));
  const manifest = { schemaVersion: 1, language: registry.language, reviewedOn: registry.reviewedOn, scope: registry.scope, releaseVersion: registry.releaseVersion, snapshot, exclusions: registry.exclusions, documents };
  const summary = { documentCount: documents.length, evaluationCaseCount: evaluation.cases.length, provenanceFileCount: new Set(documents.flatMap((doc) => doc.sources.map((source) => source.path))).size, totalBytes: documents.reduce((total, doc) => total + doc.bytes, 0), liveRetrievalTested: false, modelAnswersTested: false, uploaded: false };
  files.set("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  files.set("validation.json", `${JSON.stringify(summary, null, 2)}\n`);
  return { lock, files, summary };
}

export async function buildKnowledge({ root = ROOT, mode = "build" } = {}) {
  requireValue(["build", "check", "accept-reviewed-sources"].includes(mode), "Unknown build mode.");
  const prepared = await collectKnowledge(root);
  const lockPath = `${DIRECTORY}/source-lock.json`;
  if (mode === "accept-reviewed-sources") {
    await writeFile(resolve(root, lockPath), `${JSON.stringify(prepared.lock, null, 2)}\n`);
    return { ...prepared.summary, action: "Reviewed source hashes recorded; run the build next." };
  }
  let existing;
  try { existing = JSON.parse(await readRepositoryFile(root, lockPath)); }
  catch { throw new Error("Review the articles and run --accept-reviewed-sources before building."); }
  requireValue(JSON.stringify(existing) === JSON.stringify(prepared.lock), "Knowledge sources changed. Review affected articles, then explicitly run --accept-reviewed-sources.");
  const output = resolve(root, OUTPUT);
  if (mode === "build") await mkdir(resolve(output, "files"), { recursive: true });
  requireValue(within(await realpath(root), await realpath(resolve(output, "files"))), "Output must stay inside repository.");
  const outputNames = await readdir(resolve(output, "files"));
  requireValue(outputNames.every((name) => prepared.files.has(`files/${name}`)), "Unexpected old files in output. Review them before rebuilding; automatic deletion is disabled.");
  for (const [path, content] of prepared.files) {
    const target = resolve(output, path);
    if (mode === "check") {
      requireValue(await readRepositoryFile(root, `${OUTPUT}/${path}`) === content, `Stale output: ${path}`);
    } else {
      // Do not follow an existing file symlink outside the repository.
      try { requireValue(within(await realpath(root), await realpath(target)), "Output file escapes repository."); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      await writeFile(target, content);
    }
  }
  return { ...prepared.summary, action: mode === "check" ? "Generated knowledge verified." : `Knowledge built in ${OUTPUT}.` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argument = process.argv[2];
  const mode = argument === undefined ? "build" : argument === "--check" ? "check" : argument === "--accept-reviewed-sources" ? "accept-reviewed-sources" : "invalid";
  if (process.argv.length > 3) {
    console.error("Usage: node scripts/build-assistant-knowledge.mjs [--check|--accept-reviewed-sources]");
    process.exitCode = 1;
  } else {
    buildKnowledge({ mode }).then((summary) => console.log(JSON.stringify(summary, null, 2))).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
