import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";

// File URLs keep a shared dependency small. Recursively embedded data URLs
// duplicate the whole graph at every import and exhaust memory on assembly tests.
const temporaryParent = resolve(tmpdir());
const temporaryRoot = await mkdtemp(join(temporaryParent, "pumpstation-test-modules-"));
const written = new Set();
process.once("exit", () => {
  if (dirname(resolve(temporaryRoot)) === temporaryParent) rmSync(temporaryRoot, { recursive: true, force: true });
});

export async function loadTs(url, replacements = {}) {
  const cache = new Map();
  async function moduleUrl(url) {
    const key = url.href;
    if (cache.has(key)) return cache.get(key);
    const source = replacements[key] ?? await readFile(url, "utf8");
    let output = url.pathname.endsWith(".json") ? `export default ${source}` : ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const matches = [...output.matchAll(/from\s+["'](\.[^"']+)["']/g)];
    for (const match of matches) {
      const path = /\.(json|ts)$/.test(match[1]) ? match[1] : `${match[1]}.ts`;
      output = output.replace(match[0], `from ${JSON.stringify(await moduleUrl(new URL(path, url)))}`);
    }
    // Like data URLs, identical compiled content shares one module instance,
    // including when it is reached through separate loadTs calls.
    const outputPath = join(temporaryRoot, `${createHash("sha256").update(output).digest("hex")}.mjs`);
    const result = pathToFileURL(outputPath).href;
    if (!written.has(outputPath)) { await writeFile(outputPath, output); written.add(outputPath); }
    cache.set(key, result);
    return result;
  }
  return import(await moduleUrl(url));
}
