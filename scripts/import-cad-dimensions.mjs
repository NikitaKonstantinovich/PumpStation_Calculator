import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importComponentDimensions } from "./import-collar-dimensions.mjs";

export const cadImportOptions = { catalogId: "переходы", columns: ["CALC_CAD_REDUCER_LENGTH", "CALC_CAD_CYLINDER_LARGE", "CALC_CAD_CYLINDER_SMALL", "CALC_CAD_SOURCE", "CALC_CAD_REVIEW"], confirmedColumn: "CALC_CAD_REDUCER_LENGTH", reviewColumn: "CALC_CAD_REVIEW" };
export async function verifyCadModelSources(reference, root) {
  for (const row of reference.rows) {
    const path = await realpath(join(root, row.modelPath)), rel = relative(await realpath(root), path);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("CAD model is outside project root");
    const hash = createHash("sha256").update(await readFile(path)).digest("hex");
    if (hash !== row.modelSha256) throw new Error(`CAD model changed; measure and review before importing: ${row.modelPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf("--database");
  if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: node --experimental-strip-types scripts/import-cad-dimensions.mjs --database path.sqlite");
  const reference = JSON.parse(await readFile(new URL("../data/component-cad-dimensions.json", import.meta.url), "utf8"));
  const { mergeCadDimensions, validateCadReference } = await import("../app/component-cad-dimensions.ts");
  validateCadReference(reference);
  await verifyCadModelSources(reference, fileURLToPath(new URL("../../", import.meta.url)));
  const path = await realpath(process.argv[index + 1]), db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000");
    const folder = join(dirname(path), "backups"); await mkdir(folder, { recursive: true });
    const backup = join(folder, `before-insert-cad-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
    db.prepare("VACUUM INTO ?").run(backup);
    console.log(JSON.stringify({ ...importComponentDimensions(db, reference, mergeCadDimensions, cadImportOptions), backup, integrity: db.prepare("PRAGMA quick_check").get() }));
  } finally { db.close(); }
}
