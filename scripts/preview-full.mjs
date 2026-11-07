// Local full build, with large meshes served through the authorized Worker ASSETS binding.
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { fork } from "node:child_process";
import { localModelAssets } from "./local-model-assets.mjs";
import { pumpFileService } from "../services/local-storage/pump-files.mjs";
import { equipmentAssetService } from "../services/local-storage/equipment-assets.mjs";
import { nodeCatalogService } from "../services/local-storage/node-catalog.mjs";
import { syncRuntimeModelAssets } from "./local-runtime-models.mjs";
import { loadLocalAIEnv } from "./local-ai-env.mjs";
import { localAIProvider } from "./local-ai-provider.mjs";
import { connectStore, numberSetting, projectService } from "../services/local-storage/store.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !["--build-dir", "--state-dir", "--port"].includes(arg))) throw new Error("Options: --build-dir, --state-dir, --port");
const built = resolve(root, option("--build-dir", "work/local-full/dist"));
const statePath = option("--state-dir", process.env.PROJECT_STATE_DIR);
if (!statePath) throw new Error("Укажите отдельный PROJECT_STATE_DIR или --state-dir для локального профиля.");
const state = resolve(root, statePath);
const port = Number(option("--port", "3000"));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
const release = JSON.parse(await readFile(resolve(built, "release.json"), "utf8"));
if (release.profile !== "full") throw new Error("A full build is required; beta is not changed");
const config = JSON.parse(await readFile(resolve(built, "server/wrangler.json"), "utf8"));
const server = resolve(built, "server");
const paths = (await readdir(server, { recursive: true })).filter(p => /\.m?js$/.test(p)).sort((a,b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));
const bindings = { ...config.vars, APP_BASE_URL: `http://localhost:${port}`, PUBLIC_APP_ORIGIN: "" };
bindings.PROJECT_LIMIT_BYTES = String(numberSetting(process.env.PROJECT_LIMIT_BYTES, 10_000_000));
const library = process.env.PROJECT_MODEL_LIBRARY;
if (!library) throw new Error("Задайте PROJECT_MODEL_LIBRARY — постоянный каталог опубликованных моделей.");
console.log('Runtime CAD assets:',await syncRuntimeModelAssets({library}));
const projects = await connectStore();
Object.assign(bindings, await loadLocalAIEnv());
for (const name of ["MODEL_CONVERTER_URL", "MODEL_CONVERTER_TOKEN", "CAD_EXPORT_URL", "CAD_EXPORT_TOKEN", "RESEND_API_KEY", "EMAIL_FROM"]) if (process.env[name]) bindings[name] = process.env[name];
const worker = new Miniflare({
  name: config.name, host: "127.0.0.1", port,
  modules: paths.map(path => ({ type: "ESModule", path: resolve(server, path) })), modulesRoot: server,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings,
  d1Databases: Object.fromEntries(config.d1_databases.map(d => [d.binding, d.database_id])), d1Persist: resolve(state, "v3/d1"),
  serviceBindings: { PROJECT_STORE: projectService(projects), NODE_CATALOG: nodeCatalogService(process.env.NODE_PUMP_CATALOG_PATH || resolve(root,"../database/catalog-v2/pumps.sqlite")), PUMP_FILES: pumpFileService(process.env.PUMP_FILES_DIR || resolve(dirname(state), "pump-files"), {allowReveal:true}), EQUIPMENT_ASSETS: equipmentAssetService({equipmentRoot:process.env.EQUIPMENT_ROOT || resolve(root,"../Equipment"),publicRoot:resolve(built,"client"),manifestPath:resolve(library,"manifest.json"),allowReveal:true}), AI_PROVIDER: localAIProvider, ASSETS: localModelAssets(resolve(library), async request => (await worker.getBindings()).BUNDLED_ASSETS.fetch(request)) },
  assets: { directory: resolve(built, "client"), binding: "BUNDLED_ASSETS", routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } },
});
console.log(`Full editor ready: ${await worker.ready}; build: ${built}; migrations unchanged`);
let calculationWorker, stopping=false;
function startCalculationWorker() {
  if(stopping)return;
  calculationWorker=fork(resolve(built,'calculation-worker.mjs'),[],{windowsHide:true});
  calculationWorker.once('exit',code=>{
    if(!stopping){console.error('Перезапуск обработчика расчётов, код',code);setTimeout(startCalculationWorker,5000);}
  });
}
if(process.env.PROJECT_WORKER_MODE!=="external")startCalculationWorker();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { stopping=true; calculationWorker?.kill(); await worker.dispose(); await projects.end(); process.exit(0); });
