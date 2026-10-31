// Read-only input: no server APIs, D1 bindings, migrations or catalogue generators.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadTs } from "../tests/load-ts.mjs";
const load = name => loadTs(new URL(`../app/${name}.ts`, import.meta.url));
const { makeInsertCatalog } = await load("component-insert-catalog");
const { generateInsertCalculations } = await load("component-insert-calculations");
const { flangeKinds } = await load("collector-calculations");
const { selectStationInsertion, insertionDesign } = await load("station-insertion-selection");
const text = await readFile(new URL("../public/component-insert-source.json", import.meta.url), "utf8");
const catalog = makeInsertCatalog(JSON.parse(text));
const dns = catalog.nominalDns;
const calculations = [false, true].flatMap(withSensorNipple => generateInsertCalculations({ dnFrom: Math.min(...dns), dnTo: Math.max(...dns), materials: ["st20", "aisi304"], withSensorNipple, includeEccentric: true }, catalog));
const pairs = [...new Map(catalog.parts.filter(p => p.kind === "pipe" || p.kind === "reducer").map(p => [[p.dn, p.kind === "pipe" ? p.dn : p.dnSmall].join(":"), [p.dn, p.kind === "pipe" ? p.dn : p.dnSmall]])).values()].filter(pair => pair.every(dn => dns.includes(dn))).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
const asItem = c => ({ id: c.identityKey, catalogId: "ответные-части", family: c.name, fields: [], prices: [], calculatedInsertion: {
  version: 1, id: c.identityKey, identityKey: c.identityKey, revision: 1, catalogVersion: catalog.version, currentCatalogVersion: catalog.version, pricedAt: "local-preview", calculation: c,
} });
// Optional GET /api/components snapshot can be supplied by its owner for an offline audit.
const savedPath = process.argv.find(arg => arg.startsWith("--saved="))?.slice(8);
const saved = savedPath ? JSON.parse(await readFile(resolve(savedPath), "utf8")) : null;
const savedItems = Array.isArray(saved) ? saved : saved?.items;
if (saved && !Array.isArray(savedItems)) throw new Error("Expected an API components snapshot with items[]");
const rows = [];
for (const material of ["st20", "aisi304"]) for (const pn of [10,16,25]) for (const [large,small] of pairs) {
  const connections = dn => [flangeKinds(material,dn,pn).includes("collar") ? "collar" : "flanged", ...(dn<=50?["threaded"]:[])];
  for (const left of connections(large)) for (const right of connections(small)) for (const sensor of [false,true]) for (const geometry of large===small?["straight"]:["concentric","eccentric"]) {
    const matches=calculations.filter(c=>c.material===material&&c.pn===pn&&c.dnLarge===large&&c.dnSmall===small&&c.leftConnection===left&&c.rightConnection===right&&c.geometry===geometry&&c.withSensorNipple===sensor);
    const preferred=[...matches].sort((a,b)=>Number(b.complete)-Number(a.complete)||a.identityKey.localeCompare(b.identityKey))[0];
    for(const purpose of ["after-vibration",...(large!==small||left!==right?["pump-transition"]:[]),...(large===small&&left!=="threaded"&&right!=="threaded"?["between-valves"]:[])]){
      const requirement={location:`coverage:${purpose}`,purpose,material,pn,from:{dn:small,connection:right},to:{dn:large,connection:left},geometry,withSensorNipple:sensor,design:preferred?insertionDesign(preferred):undefined};
      const selection=selectStationInsertion(matches.map(asItem),requirement);
      const flags=[...new Set([...(selection.exact?["exact-found"]:[]),...selection.findings.map(f=>f.code),
        ...(!matches.length?["missing-product"]:[]),...(preferred&&!preferred.complete&&preferred.dimensions.some(d=>d.value===null)?["missing-dimensions"]:[]),...(preferred&&preferred.price===null?["missing-price"]:[]),
        ...(preferred&&!preferred.complete?["engineering-decision"]:[])])];
      const live=savedItems?selectStationInsertion(savedItems,requirement):null;
      rows.push({purpose,material,pn,fromDn:small,toDn:large,fromConnection:right,toConnection:left,geometry,sensor,totalLengthMm:preferred?.totalLengthMm??null,
        flags,calculatedCandidates:matches.length, savedProduct:live?(live.exact?["exact-found",...live.findings.map(f=>f.code)]:live.findings.map(f=>f.code)):"not-audited",
        reasons:[...selection.findings.map(f=>f.message),...preferred?.warnings??[]]});
    }
  }
}
const flags=["exact-found","missing-product","missing-price","missing-dimensions","incompatible","stale","engineering-decision","incomplete-bom"];
const counts=Object.fromEntries(flags.map(flag=>[flag,rows.filter(row=>row.flags.includes(flag)).length]));
const report={scope:{source:"public/component-insert-source.json",sha256:createHash("sha256").update(text).digest("hex"),catalogVersion:catalog.version,dns,pressures:[10,16,25],materials:["st20","aisi304"],pairs,
  explanation:"Расчётная возможность локального снимка: прямые, концентрические (напор) и эксцентрические (всас) пары из исходных труб/переходов; DN/PN/материал и концы перебраны независимо. Длина и конфигурация взяты из конкретного расчёта, что моделирует явное подтверждение исполнения. Это не полнота рабочей D1 и не подтверждение монтажного места в проекте. Требование сгона зависит от места и числа пожарных насосов; здесь проверены оба исполнения. Флаги могут пересекаться.",savedSnapshot:savedPath??"not-audited; рабочая D1 не читалась"},counts,rows};
const directory=resolve("docs/generated"); await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,"insertion-coverage.json"),JSON.stringify(report,null,2)+"\n");
const columns=["purpose","material","pn","fromDn","toDn","fromConnection","toConnection","geometry","sensor","totalLengthMm","flags","savedProduct","reasons"];
const cell=v=>'"'+String(Array.isArray(v)?v.join(" | "):v??"").replaceAll('"','""')+'"';
await writeFile(resolve(directory,"insertion-coverage.csv"),"\uFEFF"+[columns.join(";"),...rows.map(row=>columns.map(key=>cell(row[key])).join(";"))].join("\r\n")+"\r\n");
console.log(JSON.stringify({rows:rows.length,calculations:calculations.length,dns,counts,savedSnapshot:report.scope.savedSnapshot}));
