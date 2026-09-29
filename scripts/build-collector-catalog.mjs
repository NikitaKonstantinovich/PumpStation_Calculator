import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeCollectorCatalog } from "../app/collector-catalog.ts";
import { mergeBindingSupplement } from "./binding-supplements.mjs";
import { mergeSealingSupplement } from "./sealing-supplement.mjs";
import { mergeInstrumentValve } from "./instrument-valve-supplement.mjs";

const sourceUrl = new URL("../public/binding-components.json", import.meta.url);
const original = await readFile(sourceUrl, "utf8");
const supplier = JSON.parse(await readFile(new URL("../data/lunda-plugs.json", import.meta.url), "utf8"));
const seals = JSON.parse(await readFile(new URL("../data/sealing-supplement.json", import.meta.url), "utf8"));
const valve = JSON.parse(await readFile(new URL("../data/instrument-valve.json", import.meta.url), "utf8"));
const data = mergeInstrumentValve(mergeSealingSupplement(mergeBindingSupplement(JSON.parse(original), supplier), seals), valve);
const source = JSON.stringify(data, null, 2) + "\n";
if (source !== original) await writeFile(sourceUrl, source);
const catalog = makeCollectorCatalog(data);
catalog.sourceSha256 = data.source.sha256;
// Hash the entire imported snapshot: price edits invalidate calculations too.
catalog.version = createHash("sha256").update(source).digest("hex");
await writeFile(new URL("../public/collector-catalog.json", import.meta.url), JSON.stringify(catalog, null, 2) + "\n");
console.log(`Collector catalogue: ${catalog.components.length} components, ${catalog.bolts.length} bolt sizes`);
