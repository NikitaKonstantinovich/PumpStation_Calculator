import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { importComponentDimensions } from "./import-collar-dimensions.mjs";
import { mergeSensorNipples, sensorManagedColumns } from "../app/component-sensor-nipples.ts";

const index = process.argv.indexOf("--database");
if (index < 0 || !process.argv[index + 1]) throw new Error("Usage: node --experimental-strip-types scripts/import-sensor-nipples.mjs --database path.sqlite");
const path = await realpath(process.argv[index + 1]);
const reference = JSON.parse(await readFile(new URL("../data/sensor-nipple-reference.json", import.meta.url), "utf8"));
const db = new DatabaseSync(path);
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000");
  const backupDir = join(dirname(path), "backups");
  await mkdir(backupDir, { recursive: true });
  const backup = join(backupDir, `before-sensor-nipples-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  db.prepare("VACUUM INTO ?").run(backup);
  const result = importComponentDimensions(db, reference, mergeSensorNipples, { catalogId: "сгоны-резьба", columns: sensorManagedColumns, confirmedColumn: "CALC_SENSOR_WALL", reviewColumn: "CALC_SENSOR_REVIEW" });
  console.log(JSON.stringify({ ...result, backup, integrity: db.prepare("PRAGMA quick_check").get() }));
} finally { db.close(); }
