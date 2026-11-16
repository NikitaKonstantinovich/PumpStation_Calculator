// Preserve an immutable build for the local server. Do not overwrite another running snapshot.
import { cp, mkdir, readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
const source = resolve("dist"), target = resolve(process.argv[2] ?? "work/local-full/dist");
const release = JSON.parse(await readFile(resolve(source,"release.json"),"utf8"));
if (release.profile !== "full") throw new Error("Run npm run build:full first");
try { await access(target); throw new Error("Target already exists; use a new snapshot path"); } catch (e) { if (e.code !== "ENOENT") throw e; }
await mkdir(target,{recursive:true});
await cp(source,target,{recursive:true,filter:path=>path !== resolve(source,"client/model-assets")});
console.log(`Snapshot ready: ${target}. Large models use the local ASSETS binding.`);
