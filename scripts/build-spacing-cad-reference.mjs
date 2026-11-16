import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run explicitly against the reviewed source repository; never read CAD paths from requests.
const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../../../../",import.meta.url)));
const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, ""));
const indexPath = "Equipment/Pumps/3D_Normalized/normalization-index.json";
const index = read(indexPath), pumps = new Map(read("frontend/public/pumps.json").map(p => [String(p.id), p]));
const rows = [];
for (const row of index.models) {
  const pump = pumps.get(String(row.pumpId)), box = row.normalizedBboxMm;
  if (!pump || row.previousCdmAudit?.motorPowerMatchesCatalog === false || !["normalized_verified", "normalized_direction_review"].includes(row.status) || row.units !== "mm" || row.verticalNormalized !== "+Z" || !row.originalGeometryDefinitionsPreserved || !Array.isArray(box) || box.length !== 6 || !box.every(Number.isFinite) || !(box[1] < 0 && box[4] > 0) || !(pump.power > 0)) continue;
  // TD PORT_A/PORT_B ambiguity does not change the transverse envelope. It remains a reference,
  // and is never used to assign hydraulic roles or to approve automatic CAD assembly.
  rows.push({legacyId:String(row.pumpId),manufacturer:pump.manufacturer,model:pump.model,powerKw:pump.power,leftMm:-box[1],rightMm:box[4],source:row.source,sourceSha256:row.sourceSha256,outputSha256:row.outputSha256,status:row.status});
}
rows.sort((a,b) => a.legacyId.localeCompare(b.legacyId) || a.source.localeCompare(b.source));
const data = {version:"cad-transverse-v1",indexSha256:createHash("sha256").update(readFileSync(resolve(root,indexPath))).digest("hex"),scope:"Reference only: CAD normalization does not certify the current motor execution",rows};
writeFileSync(new URL("../data/pump-spacing-cad.json",import.meta.url),JSON.stringify(data,null,2)+"\n");
console.log(`Saved ${rows.length} reviewed transverse CAD references`);
