// Built beta Worker on loopback, optionally behind the configured HTTPS proxy.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Miniflare } from "miniflare";
const release = JSON.parse(await readFile("dist/release.json", "utf8"));
if (release.profile !== "beta") throw new Error("Run npm run build:beta first");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const port = Number(option("--port", "3010"));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && !["--port", "--state-dir", "--migrations", "--public-origin"].includes(arg))) throw new Error("Supported options: --port, --state-dir, --migrations apply|skip, --public-origin https://domain; server stays on loopback");
const publicOrigin = option("--public-origin", "");
if (publicOrigin) {
  const url = new URL(publicOrigin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("--public-origin must be an HTTPS origin");
}
const migrationMode = option("--migrations", "apply");
if (!["apply", "skip"].includes(migrationMode)) throw new Error("--migrations must be apply or skip");
const state = resolve(option("--state-dir", ".wrangler/beta-state"));
const config = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
config.main = resolve("dist/server/index.js");
config.assets.directory = resolve("dist/client");
config.d1_databases.forEach(binding => { binding.migrations_dir = resolve("drizzle"); });
config.vars = { ...config.vars, APP_BASE_URL: publicOrigin || `http://localhost:${port}`, PUBLIC_APP_ORIGIN: publicOrigin };
await mkdir(".wrangler", { recursive: true });
const configPath = resolve(`.wrangler/beta-preview-${port}.json`);
await writeFile(configPath, JSON.stringify(config, null, 2));
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", CI: "true" };
if (migrationMode === "apply") {
  const migration = spawnSync(process.execPath, [wrangler, "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", state], { stdio: "inherit", env, windowsHide: true });
  if (migration.status !== 0) throw new Error("Local migrations failed; preview was not started");
} else console.log("Using existing database; automatic migrations skipped by explicit launch option.");
console.log(`Loopback: http://localhost:${port}/ | persistent state: ${state}`);
if (publicOrigin) console.log(`HTTPS proxy origin: ${publicOrigin}`);
// Serve the immutable built Worker directly in workerd. Wrangler's development
// proxy can restart mid-request on Windows; it is unnecessary for release QA.
const paths = (await readdir("dist/server", { recursive: true })).filter(path => /\.m?js$/.test(path));
paths.sort((a,b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));
const bindings = { ...config.vars };
for (const name of ["RESEND_API_KEY", "EMAIL_FROM"]) if (process.env[name]) bindings[name] = process.env[name];
const worker = new Miniflare({
  name: config.name,
  host: "127.0.0.1", port,
  modules: paths.map(path => ({ type: "ESModule", path: resolve("dist/server", path) })),
  modulesRoot: resolve("dist/server"),
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  bindings,
  d1Databases: Object.fromEntries(config.d1_databases.map(database => [database.binding, database.database_id])),
  d1Persist: resolve(state, "v3/d1"),
  assets: { directory: config.assets.directory, binding: "ASSETS", routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } },
});
console.log(`Built beta ready: ${await worker.ready}`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await worker.dispose(); process.exit(0); });
