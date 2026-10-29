import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { importComponentDimensions } from "./import-collar-dimensions.mjs";
import { mergeInsertAnalogs, analogColumns, ANALOG_FIELDS } from "../app/component-insert-analog-source.ts";

const index = process.argv.indexOf("--database");
if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: node --experimental-strip-types scripts/import-insert-analogs.mjs --database path.sqlite");
const path = await realpath(process.argv[index + 1]);
const reference = JSON.parse(await readFile(new URL("../data/insert-analog-dimensions.json", import.meta.url), "utf8"));
const database = new DatabaseSync(path);
try {
  database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000");
  const backupDir = join(dirname(path), "backups"); await mkdir(backupDir, { recursive: true });
  const backup = join(backupDir, `before-insert-analogs-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  database.prepare("VACUUM INTO ?").run(backup);
  const prices = JSON.stringify(database.prepare("SELECT * FROM component_prices ORDER BY id").all());
  const options = { catalogId: "переходы", columns: analogColumns, confirmedColumn: ANALOG_FIELDS.length[0], reviewColumn: ANALOG_FIELDS.review[0] };
  const result = importComponentDimensions(database, reference, mergeInsertAnalogs, options);
  if (JSON.stringify(database.prepare("SELECT * FROM component_prices ORDER BY id").all()) !== prices) throw new Error("Unexpected price change");
  const repeated = importComponentDimensions(database, reference, mergeInsertAnalogs, options);
  console.log(JSON.stringify({ ...result, repeated, backup, integrity: database.prepare("PRAGMA quick_check").get(), foreignKeys: database.prepare("PRAGMA foreign_key_check").all() }, null, 2));
} finally { database.close(); }
