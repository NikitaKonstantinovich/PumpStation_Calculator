import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const profile = process.env.PSC_RELEASE_PROFILE ?? "beta";
if (!["beta", "full"].includes(profile)) throw new Error("Unknown release profile");
const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
if (config.assets?.run_worker_first !== true || config.assets?.binding !== "ASSETS") throw new Error("Asset authentication requires run_worker_first and ASSETS");
const assets = await readdir("dist/client/_next/static/chunks");
if (profile === "beta") {
  // Full-only CAD copies can exceed the Worker static-asset limit. The beta
  // never serves them; remove only the generated copy, preserving public/.
  const clientRoot = resolve("dist/client");
  const modelAssets = resolve(clientRoot, "model-assets");
  if (dirname(modelAssets) !== clientRoot) throw new Error("Invalid generated model-assets path");
  await rm(modelAssets, { recursive: true, force: true });
  if (!assets.some(name => name.startsWith("beta-workspace") && name.endsWith(".js"))) throw new Error("Private workspace chunk missing");
  for (const name of assets.filter(name => name.endsWith(".js"))) {
    const code = await readFile(`dist/client/_next/static/chunks/${name}`, "utf8");
    if (!name.startsWith("index-") && /THREE\.WebGLRenderer|WebGLRenderer|\/api\/model-preparation|\/api\/control-cabinets|\/api\/projects|\/api\/collectors|\/api\/component-calculator/.test(code)) throw new Error(`Disabled feature shipped in beta client: ${name}`);
    if (!name.startsWith("beta-workspace-") && /from[\s]*['"`][^'"`]*beta-workspace-/.test(code)) throw new Error(`Login shell statically imports a private chunk: ${name}`);
    if (!name.startsWith("beta-workspace-") && /suction-table:|pbkdf2_sha256|manufacturerDiscounts/.test(code)) throw new Error(`Private data in public shell: ${name}`);
  }
}
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await writeFile("dist/release.json", JSON.stringify({ version: pkg.version, label: "beta 0.1", profile, builtAt: new Date().toISOString(), privateAssets: assets.filter(name => name.startsWith("beta-workspace-")) }, null, 2) + "\n");
console.log(`Verified ${profile} release ${pkg.version}; asset authentication enabled.`);
