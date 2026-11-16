import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Native CAD is a separately installed library. A worktree may be nested below
// the frontend; never assume that ../../Equipment is the library location.
const frontend = fileURLToPath(new URL("../", import.meta.url));
const ancestors = [];
for (let dir = frontend; ; dir = dirname(dir)) {
  ancestors.push(dir);
  if (dirname(dir) === dir) break;
}
export async function localCadPath(relative) {
  const configured = process.env.PSC_CAD_ROOT_URL;
  const roots = [...(configured ? [fileURLToPath(configured)] : []), ...ancestors];
  const candidates = [...new Set(roots.flatMap(root => [resolve(root, relative), resolve(root, "frontend", relative)]))];
  for (const path of candidates) {
    try { await access(path); return path; } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  throw new Error(`Missing CAD fixture: ${relative}. Install the CAD library or set PSC_CAD_ROOT_URL to its file URL. Checked: ${candidates.join(", ")}`);
}
export async function readLocalCad(relative, options) {
  return readFile(await localCadPath(relative), options);
}
