import { readFile, writeFile } from "node:fs/promises";
const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const [library, manifest, reducers, collars] = await Promise.all([read("public/model-assets/library.json"), read("public/model-assets/manifest.json"), read("data/component-cad-dimensions.json"), read("data/collar-cad-models.json")]);
const rows = [];
for (const r of reducers.rows) {
  const model = library.models.find(m => m.sourceHash === r.modelSha256 && m.status === "ready"), profile = manifest.equipment?.[`equipment:${r.componentId}`];
  if (!model || profile?.sourceHash !== r.modelSha256 || profile.ports?.[0]?.point?.some(v => v !== 0)) continue;
  rows.push({ kind: "reducer", componentId: r.componentId, sourceSha256: reducers.sourceSha256, match: { geometry: r.geometry, outerDiameter: r.outerDiameter, outerDiameterSmall: r.outerDiameterSmall, wallThickness: r.wallThickness, wallThicknessSmall: r.wallThicknessSmall, lengthMm: r.dimensions.lengthMm }, hash: model.sourceHash, bounds: model.bounds, rotation: [0, 90, 0], position: [0, 0, 0], source: r.modelPath });
}
for (const r of collars.models) {
  const model = library.models.find(m => m.sourceHash === r.modelSha256 && m.status === "ready"), d = r.dimensions[0];
  if (!model || r.dimensions.length !== 1 || !r.conversion.bodies?.[0]?.profile) continue;
  // Exported analytic meridian has the lip mating face at native X=L, neck at X=0.
  const profile = r.conversion.bodies[0].profile;
  const lipAtEnd = profile.some(s => s.kind === "line" && Math.abs(s.a[0] - d.lengthMm) < .001 && Math.abs(s.b[0] - d.lengthMm) < .001 && Math.max(s.a[1], s.b[1]) === d.lipOuterDiameterMm / 2);
  if (!lipAtEnd || Math.abs(model.bounds[0]) > .001 || Math.abs(model.bounds[3] - d.lengthMm) > .001) continue;
  rows.push({ kind: "collar", match: { outerDiameter: d.outerDiameterMm, wallThickness: d.wallThicknessMm, lengthMm: d.lengthMm, lipOuterDiameterMm: d.lipOuterDiameterMm, thicknessMm: d.lipThicknessMm }, hash: model.sourceHash, bounds: model.bounds, rotation: [0, 0, 180], position: [d.lengthMm, 0, 0], source: r.modelPath });
}
await writeFile(new URL("../data/insertion-model-bindings.json", import.meta.url), JSON.stringify({ version: 1, rows }, null, 2) + "\n");
console.log(`Prepared ${rows.length} dimension-checked insertion model candidates.`);
