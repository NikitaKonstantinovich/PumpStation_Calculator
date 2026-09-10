import { readFile } from "node:fs/promises";
import ts from "typescript";

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
    const result = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
    cache.set(key, result); return result;
  }
  return import(await moduleUrl(url));
}
