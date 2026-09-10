import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { makeCollectorCatalog } from "../app/collector-catalog.ts";

const source = await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8");
const catalog = makeCollectorCatalog(JSON.parse(source));
catalog.sourceSha256 = JSON.parse(source).source.sha256;
// Hash the entire imported snapshot: price edits invalidate calculations too.
catalog.version = createHash("sha256").update(source).digest("hex");
await writeFile(new URL("../public/collector-catalog.json", import.meta.url), JSON.stringify(catalog, null, 2) + "\n");
console.log(`Collector catalogue: ${catalog.components.length} components, ${catalog.bolts.length} bolt sizes`);
