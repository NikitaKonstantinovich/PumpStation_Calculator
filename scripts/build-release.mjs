import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
const profile = process.argv[2];
if (!["beta", "full"].includes(profile)) throw new Error("Expected beta or full");
const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const result = spawnSync(process.execPath, [npm, "run", "build"], { stdio: "inherit", env: { ...process.env, PSC_RELEASE_PROFILE: profile }, windowsHide: true });
if (result.error) throw result.error;
if (!result.status && profile === 'full') {
  const {build} = await import('esbuild');
  const {copyFile} = await import('node:fs/promises');
  await build({entryPoints:['services/local-storage/calculation-worker.mjs'],outfile:'dist/calculation-worker.mjs',bundle:true,platform:'node',format:'esm',external:['pg']});
  await copyFile('services/local-storage/schema.sql','dist/schema.sql');
}
process.exitCode = result.status ?? 1;
