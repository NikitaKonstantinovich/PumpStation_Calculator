// Local full build, with large meshes served through the authorized Worker ASSETS binding.
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { localModelAssets } from "./local-model-assets.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !["--build-dir", "--state-dir", "--port"].includes(arg))) throw new Error("Options: --build-dir, --state-dir, --port");
const built = resolve(root, option("--build-dir", "work/local-full/dist"));
const state = resolve(root, option("--state-dir", ".wrangler/state"));
const port = Number(option("--port", "3000"));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
const release = JSON.parse(await readFile(resolve(built, "release.json"), "utf8"));
if (release.profile !== "full") throw new Error("A full build is required; beta is not changed");
const config = JSON.parse(await readFile(resolve(built, "server/wrangler.json"), "utf8"));
const server = resolve(built, "server");
const paths = (await readdir(server, { recursive: true })).filter(p => /\.m?js$/.test(p)).sort((a,b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));
const bindings = { ...config.vars, APP_BASE_URL: `http://localhost:${port}`, PUBLIC_APP_ORIGIN: "" };
for (const name of ["MODEL_CONVERTER_URL", "MODEL_CONVERTER_TOKEN", "RESEND_API_KEY", "EMAIL_FROM"]) if (process.env[name]) bindings[name] = process.env[name];
const worker = new Miniflare({
  name: config.name, host: "127.0.0.1", port,
  modules: paths.map(path => ({ type: "ESModule", path: resolve(server, path) })), modulesRoot: server,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings,
  d1Databases: Object.fromEntries(config.d1_databases.map(d => [d.binding, d.database_id])), d1Persist: resolve(state, "v3/d1"),
  serviceBindings: { ASSETS: localModelAssets(resolve(root, "public/model-assets"), async request => (await worker.getBindings()).BUNDLED_ASSETS.fetch(request)) },
  assets: { directory: resolve(built, "client"), binding: "BUNDLED_ASSETS", routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } },
});
console.log(`Full editor ready: ${await worker.ready}; build: ${built}; migrations unchanged`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await worker.dispose(); process.exit(0); });
