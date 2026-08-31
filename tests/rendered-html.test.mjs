import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server renders the protected pump-station entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Pump Station Calculator<\/title>/i);
  assert.match(html, /Pump Station/);
  assert.match(html, /Подготавливаем рабочее пространство/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Building your site/i);
});

test("keeps the production surface free of the starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /title: "Подбор насосов"/);
  assert.match(page, /title: "Гидравлическая кривая"/);
  assert.match(page, /title: "Спецификация"/);
  assert.match(page, /Сборочный комплект гидравлики/);
  assert.match(page, /Цена, ₽/);
  assert.match(page, /Итоговая стоимость/);
  assert.match(page, /settings: \{ title: "Настройки проекта"/);
  assert.match(page, /const PANEL_INFO[^]*settings:[^]*input:/);
  assert.match(page, /Подбор насосов 2/);
  assert.match(page, /Гидравлическая кривая 2/);
  assert.match(page, /Мембранный бак/);
  assert.match(page, /Жокей-насос/);
  assert.match(page, /onClick=\{addPanel\}/);
  assert.match(page, /Свернутые инструменты/);
  assert.match(page, /Закрыть инструмент/);
  assert.match(page, /Свернуть инструмент/);
  assert.match(page, /pumps\.slice\(0,2\)/);
  assert.match(page, /onDoubleClick=/);
  assert.doesNotMatch(page, /pump-chart__svg" onClick=/);
  assert.match(page, /ChartExportFormat = "png" \| "jpeg" \| "pdf"/);
  assert.match(page, /canvas\.width=1500;canvas\.height=1000/);
  assert.match(page, /circle\.classList\.contains\("pump-chart__actual-halo"\)\?"5\.2":"2\.8"/);
  assert.match(page, /actualOperatingPoint/);
  assert.match(page, /pump-chart__marker--requested/);
  assert.match(page, /pump-chart__marker--actual/);
  assert.match(page, /Запрашиваемая точка/);
  assert.match(page, /Фактическая точка/);
  assert.match(page, /Q = \$\{actualPoint\.flow\.toFixed\(1\)\} м³\/ч · H = \$\{actualPoint\.head\.toFixed\(1\)\} м/);
  assert.match(page, /jpegCanvasToPdf/);
  assert.match(page, /Доллар США/);
  assert.match(page, /Китайский юань/);
  assert.match(page, /Скидки производителей/);
  assert.match(page, /settings\.manufacturerDiscounts\.cnp/);
  assert.doesNotMatch(page, /app-header__actions[^\n]*Экспорт JSON/);

  const projectConfig = await readFile(new URL("../app/project-config.ts", import.meta.url), "utf8");
  assert.match(projectConfig, /filter\(item => item\.section !== "pump"/);
  assert.match(projectConfig, /const primaryPump/);
  assert.match(projectConfig, /const secondaryPump/);
  assert.match(projectConfig, /usdRate: 85/);
  assert.match(projectConfig, /cnyRate: 13/);
  assert.match(projectConfig, /manufacturerDiscounts: \{ cnp: 45, aquastrong: 45 \}/);
  assert.match(page, /polynomialFit/);
  assert.match(page, /solveLinearSystem/);
  assert.doesNotMatch(page, /pchipTangents/);
  assert.match(layout, /title: "Pump Station Calculator"/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("provides a persisted DN calculator with SP velocity defaults", async () => {
  const [page, styles, projectConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/project-config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /dn: \{ title: "Расчёт DN"/);
  assert.match(page, /dn:"station-dn"/);
  assert.match(page, /const STANDARD_DN=\[25,32,40,50,65,80,100,125,150,200,250,300/);
  assert.match(page, /const dnVelocityLimit=\(dn:number\)=>dn<=250\?2:3/);
  assert.match(page, /flowRate\/3600\/\(Math\.PI\*\(dn\/1000\)\*\*2\/4\)/);
  assert.match(page, /pumpFlow=stationFlow\/Math\.max\(1,input\.workingPumpCount\)/);
  assert.match(page, /Заполнить по умолчанию/);
  assert.match(page, /settings\.stationType==="fire"\?"st20":"aisi304"/);
  assert.match(page, /При ручном выборе Ду скорость пересчитывается сразу/);
  assert.match(projectConfig, /export type DnEntity/);
  assert.match(projectConfig, /"station-dn": \{ kind: "dn"/);
  assert.match(projectConfig, /collectorMaterial:rawDn\.collectorMaterial==="st20"/);
  assert.match(styles, /\.dn-calculator__grid/);
  assert.match(styles, /\.dn-calculator__status--warning/);

  const standardDn=[25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,800,900,1000,1200];
  const velocity=(flowRate,dn)=>flowRate/3600/(Math.PI*(dn/1000)**2/4);
  const recommended=flowRate=>standardDn.find(dn=>velocity(flowRate,dn)<=(dn<=250?2:3));
  assert.equal(recommended(10),50);
  assert.equal(recommended(100),150);
  assert.equal(recommended(400),300);
});

test("ships the discounted control-cabinet catalogue and selection rules", async () => {
  const [page, styles, rawCabinets, rawPumps] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/control-cabinets.json", import.meta.url), "utf8"),
    readFile(new URL("../public/pumps.json", import.meta.url), "utf8"),
  ]);
  const cabinets = JSON.parse(rawCabinets);
  const pumps = JSON.parse(rawPumps);
  assert.equal(cabinets.length, 98);
  assert.deepEqual(
    Object.fromEntries(["bp", "fp", "fpj"].map(type => [type, cabinets.filter(item => item.type === type).length])),
    { bp: 42, fp: 28, fpj: 28 },
  );
  assert.ok(cabinets.every(item => Number.isFinite(item.price) && item.price > 0));
  assert.equal(cabinets.find(item => item.id === "BP-2-0.37")?.price, 102185.85);
  assert.match(page, /stationType === "fire" && settings\.jockeyPump \? "fpj"/);
  assert.match(page, /stationType === "utility" \|\| settings\.stationType === "fire"/);
  assert.match(page, /stationType === "fire" \? "fp" : "bp"/);
  assert.match(page, /manualControlCabinetItem/);
  assert.match(page, /cabinet\.powerKw\+epsilon>=pump\.power!/);
  assert.match(page, /sort\(\(a,b\)=>a\.powerKw-b\.powerKw\)\[0\]/);
  assert.match(page, /spec-table__row--cabinet-oversized/);
  assert.match(page, /spec-table__warning--power/);
  assert.match(page, /spec-table__row--cabinet-missing/);
  assert.match(page, /role="tooltip"/);
  assert.match(styles, /\.spec-table__row--cabinet-oversized/);
  const bpTwoPumps = cabinets.filter(item => item.type === "bp" && item.pumpCount === 2);
  const nearestAbove = power => bpTwoPumps.filter(item => item.powerKw >= power).sort((a,b)=>a.powerKw-b.powerKw)[0];
  assert.equal(nearestAbove(7.5)?.powerKw, 7.5);
  assert.equal(nearestAbove(8)?.powerKw, 11);
  assert.equal(nearestAbove(45), undefined);
  const chlft1530 = pumps.find(pump => pump.model === "CHLF(T)15-30");
  assert.equal(chlft1530?.power, 3);
  assert.equal(nearestAbove(chlft1530.power)?.id, "BP-2-3,7");
  assert.match(page, /fetch\("\/pumps\.json",\{cache:"no-store"\}\)/);
  assert.match(page, /fetch\("\/control-cabinets\.json",\{cache:"no-store"\}\)/);
  assert.match(page, /\},\[catalogue,controlCabinets,smartCabinets,/);
  assert.match(page, /цена со скидкой/);
});

test("ships the SQL-backed NS Smart cabinet configurator and imported BOM", async () => {
  const [page, configurator, projectConfig, schema, migration, groupingMigration, rawDatabase, importer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cabinet-configurator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/project-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_control_cabinet_configurator.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_control_cabinet_item_groups.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/control-cabinet-database.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/import-control-cabinets.py", import.meta.url), "utf8"),
  ]);
  const database=JSON.parse(rawDatabase),smart=database.cabinets.find(item=>item.id==="SMART-2-0,37-0,75");
  assert.deepEqual(database.statistics,{sourceFiles:22,components:1131,pricedComponents:959,readyCabinets:12,cabinetItems:162});
  assert.equal(smart.cachedTotal,46636.79);
  assert.equal(smart.currentTotal,48216.69);
  assert.equal(smart.items.length,14);
  assert.ok(smart.items.every(item=>item.componentId&&item.component));
  assert.equal(smart.items.filter(item=>item.componentGroup==="dynamic").length,7);
  assert.equal(smart.items.filter(item=>item.componentGroup==="static").length,7);
  assert.match(page, /cabinet: \{ title: "Конфигуратор ШУ"/);
  assert.match(projectConfig, /"station-control-cabinet": \{ kind: "cabinet" \}/);
  assert.match(configurator, /Пожаротушение/);
  assert.match(configurator, /Повышение давления/);
  assert.match(configurator, /Совмещённый/);
  assert.match(configurator, /NS Smart/);
  assert.match(configurator, /input\.workingPumpCount/);
  assert.match(configurator, /pump\?\.power/);
  assert.match(configurator, /SMART_MAX_PUMP_POWER_KW=7\.5/);
  assert.match(configurator, /Мощность насоса превышает 7,5 кВт/);
  assert.match(configurator, /Динамические комплектующие/);
  assert.match(configurator, /Статические комплектующие/);
  assert.match(page, /автоматически подобран из базы ШУ/);
  assert.match(page, /projectControlCabinetItem/);
  assert.match(configurator, /Обновить стоимость/);
  assert.doesNotMatch(configurator, /Сохранить новый шкаф/);
  assert.match(configurator, /smartCabinetSupportsPower/);
  assert.match(configurator, /response\.text\(\)/);
  assert.match(configurator, /Сервер вернул некорректный ответ/);
  assert.match(migration, /0002_control_cabinet_configurator|control_components/);
  for(const table of ["control_components","control_cabinets","control_cabinet_items"]){
    assert.match(schema,new RegExp(`sqliteTable\\("${table}"`));
    assert.match(migration,new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(migration,/uq_control_cabinets_configuration/);
  assert.match(migration,/ON DELETE cascade/i);
  assert.match(schema,/componentGroup: text\("component_group"/);
  assert.match(groupingMigration,/ADD COLUMN `component_group`/);
  assert.match(groupingMigration,/`sort_order` >= 8/);
  assert.match(importer,/Расчет стоимости шкафов\.xlsm/);
  assert.match(importer,/ASSEMBLY_KIT_PRICES/);
});

test("ships pump list prices with currencies and uses project pricing in the specification", async () => {
  const [page, rawPumps] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/pumps.json", import.meta.url), "utf8"),
  ]);
  const pumps = JSON.parse(rawPumps);
  const priced = pumps.filter(pump => Number.isFinite(pump.price));
  assert.equal(pumps.length, 1683);
  assert.ok(pumps.every(pump => Number.isFinite(pump.power) && pump.power > 0));
  assert.deepEqual(
    Object.fromEntries(pumps.filter(pump => pump.series === "CHLF(T)").map(pump => [pump.model, pump.power])),
    {
      "CHLF(T)2-20": 0.37, "CHLF(T)2-30": 0.37, "CHLF(T)2-40": 0.55, "CHLF(T)2-50": 0.55, "CHLF(T)2-60": 0.75,
      "CHLF(T)4-20": 0.37, "CHLF(T)4-30": 0.55, "CHLF(T)4-40": 0.75, "CHLF(T)4-50": 1.1, "CHLF(T)4-60": 1.1,
      "CHLF(T)8-10": 0.75, "CHLF(T)8-20": 0.75, "CHLF(T)8-30": 1.1, "CHLF(T)8-40": 1.5, "CHLF(T)8-50": 2.2,
      "CHLF(T)12-10": 0.75, "CHLF(T)12-20": 1.2, "CHLF(T)12-30": 1.8, "CHLF(T)12-40": 2.4, "CHLF(T)12-50": 3,
      "CHLF(T)15-10": 1.1, "CHLF(T)15-20": 2.2, "CHLF(T)15-30": 3, "CHLF(T)15-40": 4,
      "CHLF(T)20-10": 1.1, "CHLF(T)20-20": 2.2, "CHLF(T)20-30": 4, "CHLF(T)20-40": 4.4,
    },
  );
  assert.equal(priced.length, 1509);
  assert.ok(priced.every(pump => ["USD", "CNY"].includes(pump.priceCurrency)));
  assert.ok(priced.every(pump => typeof pump.priceSource === "string" && pump.priceSource.length > 0));
  assert.equal(priced.filter(pump => pump.manufacturer === "CNP").length, 624);
  assert.equal(priced.filter(pump => pump.manufacturer === "Aquastrong").length, 885);
  assert.match(page, /const pumpPriceRub/);
  assert.match(page, /const pumpListPriceRub/);
  assert.match(page, /Прайсовая цена/);
  assert.match(page, /Цена со скидкой/);
  assert.match(page, /discountedPrice=pumpPriceRub/);
  assert.match(page, /settings\.usdRate/);
  assert.match(page, /settings\.cnyRate/);
  assert.match(page, /price:pumpPriceRub\(pump,settings\)/);
  assert.match(page, /equipmentId:pump\.id/);
  assert.match(page, /const reserveZoneRank/);
  assert.match(page, /Number\.isFinite\(reserve\)&&reserve>=-5/);
  assert.match(page, /zoneDifference\|\|\(pumpPriceRub/);
});

test("binds verified CNP dimensional drawings to pump models", async () => {
  const [page, rawManifest, rawCatalogueManifest, rawPumps] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/cnp-model-drawings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../public/cnp-drawings-archive/catalog-manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../public/pumps.json", import.meta.url), "utf8"),
  ]);
  const drawings = JSON.parse(rawManifest);
  const catalogueDrawings = JSON.parse(rawCatalogueManifest);
  const pumps = JSON.parse(rawPumps);
  const files = new Set(drawings.map(drawing => drawing.file));
  const cnpModels = new Set(pumps.filter(pump => pump.manufacturer === "CNP").map(pump => pump.model));

  assert.equal(drawings.length, 14);
  assert.equal(files.size, 14);
  assert.ok(drawings.every(drawing => cnpModels.has(drawing.model)));
  assert.ok(drawings.every(drawing => drawing.dbModel.replace(/\s/g, "").replace("CHLF", "CHLF(T)") === drawing.model.replace(/\s/g, "")));
  assert.ok(drawings.every(drawing => [10, 48].includes(drawing.seriesId)));
  assert.ok(drawings.every(drawing => /^[a-z0-9-]+\.png$/.test(drawing.file)));
  assert.ok(drawings.every(drawing => /^[a-f0-9]{32}\.png$/.test(drawing.sourceFile)));
  await Promise.all(drawings.map(drawing => access(new URL(`../public/cnp-model-drawings/${drawing.file}`, import.meta.url))));
  assert.ok(files.has("cdm-1-2.png"));
  assert.ok(files.has("chlft2-40.png"));
  assert.equal(catalogueDrawings.length, 21);
  await Promise.all(catalogueDrawings.map(drawing => access(new URL(`../public/cnp-drawings-archive/${drawing.file}`, import.meta.url))));
  const cdmFamilies = new Set(catalogueDrawings.filter(drawing => drawing.family.startsWith("CDM")).map(drawing => drawing.family.replace(/^CDM/, "")));
  const chlftFamilies = new Set(catalogueDrawings.filter(drawing => drawing.family.startsWith("CHLF(T)")).flatMap(drawing => drawing.family.match(/\d+/g)));
  const cnpCdmPumps = pumps.filter(pump => pump.manufacturer === "CNP" && /^CDM\s*\d+-/.test(pump.model));
  const cnpChlftPumps = pumps.filter(pump => pump.manufacturer === "CNP" && /^CHLF\(T\)\d+-/.test(pump.model));
  assert.equal(cnpCdmPumps.length, 363);
  assert.equal(cnpChlftPumps.length, 28);
  assert.ok(cnpCdmPumps.every(pump => cdmFamilies.has(pump.model.match(/^CDM\s*(\d+)-/)[1])));
  assert.ok(cnpChlftPumps.every(pump => chlftFamilies.has(pump.model.match(/^CHLF\(T\)(\d+)-/)[1])));
  assert.match(page, /"CDM 1-2":\{partCode:"CDM1-2YSWPC",file:"cdm-1-2\.png"\}/);
  assert.match(page, /"CHLF\(T\)2-40":\{partCode:"CHLF2-40LSWSC",file:"chlft2-40\.png"\}/);
  assert.match(page, /src:`\/cnp-model-drawings\/\$\{drawing\.file\}`/);
  assert.match(page, /CNP_CATALOG_DIMENSION_DRAWINGS\[cdmFamily\]/);
  assert.match(page, /CNP_CHLFT_CATALOG_DIMENSION_DRAWINGS\[chlftFamily\]/);
  assert.match(page, /src:`\/cnp-drawings-archive\/\$\{chlftDrawing\.file\}`/);
  assert.match(page, /"20":\{page:29,file:"cnp-chlft15-20-dimensions\.png"\}/);
  assert.doesNotMatch(page, /\/pump-sketches\//);
});

test("binds Aquastrong dimensional sheets to catalogue pumps", async () => {
  const [page, rawManifest, rawSelectManifest, rawPumps] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/aquastrong-drawings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../public/aquastrong-select-drawings/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../public/pumps.json", import.meta.url), "utf8"),
  ]);
  const drawings = JSON.parse(rawManifest);
  const selectManifest = JSON.parse(rawSelectManifest);
  const pumps = JSON.parse(rawPumps).filter(pump => pump.manufacturer === "Aquastrong");
  const families = new Set(drawings.map(drawing => drawing.family));
  const familyFor = model => {
    const compact = model.toUpperCase().replace(/\s+/g, "");
    const match = compact.match(/^(EVR)(1|2|3|4|5|10|15|20|32|45|64|90|120|150|200)-/) ?? compact.match(/^(ECH|EDH)(?:\(M\))?(2|4|10|15|20)-/);
    return match ? `${match[1]}${match[2]}` : undefined;
  };

  assert.equal(pumps.length, 886);
  assert.equal(drawings.length, 25);
  assert.equal(families.size, 25);
  assert.ok(pumps.filter(pump => ["EVR", "ECH", "EDH"].includes(pump.series)).every(pump => families.has(familyFor(pump.model))));
  assert.equal(selectManifest.count, 546);
  assert.equal(selectManifest.drawings.length, 546);
  assert.equal(selectManifest.failures.length, 4);
  assert.ok(selectManifest.drawings.every(drawing => ["EPP", "EST", "EEZ"].includes(drawing.series)));
  assert.ok(selectManifest.drawings.every(drawing => pumps.some(pump => pump.model === drawing.model && pump.drawing === `/aquastrong-select-drawings/${drawing.file}`)));
  await Promise.all(selectManifest.drawings.map(drawing => access(new URL(`../public/aquastrong-select-drawings/${drawing.file}`, import.meta.url))));
  assert.ok(drawings.every(drawing => drawing.source === "Equipment/Pumps/AQUASTRONG Многоступенчатые насосы.pdf"));
  await Promise.all(drawings.map(drawing => access(new URL(`../public/aquastrong-drawings/${drawing.file}`, import.meta.url))));
  assert.match(page, /AQUASTRONG_DIMENSION_DRAWINGS/);
  assert.match(page, /if\(pump\.drawing\)return/);
  assert.match(page, /src:`\/aquastrong-drawings\/\$\{drawing\.file\}`/);
  assert.match(page, /"EVR200":\{page:39,file:"aquastrong-evr200\.png"\}/);
  assert.match(page, /"ECH10":\{page:50,file:"aquastrong-ech10\.png"\}/);
  assert.match(page, /"EDH20":\{page:59,file:"aquastrong-edh20\.png"\}/);
  assert.match(page, /download=\{`\$\{pump\.manufacturer\}/);
});

test("zooms pump drawings with Ctrl and the mouse wheel", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function PumpSketchView/);
  assert.match(page, /if\(!event\.ctrlKey\)return/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /Math\.max\(50,Math\.min\(400/);
  assert.match(page, /addEventListener\("wheel",onWheel,\{passive:false\}\)/);
  assert.match(page, /Ctrl \+ колесо · \{zoom\}%/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(styles, /\.pump-sketch__zoom-surface/);
  assert.match(styles, /overscroll-behavior:contain/);
});

test("provides free, mobile and resizable grid workspace layouts", async () => {
  const [page, styles, projectConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/project-config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(projectConfig, /type WorkspaceMode = "free" \| "mobile" \| "grid"/);
  assert.match(projectConfig, /type WorkspaceGrid = \{ columns:number; rows:number; columnSizes:number\[\]; rowSizes:number\[\]; cells:Array<string\|null> \}/);
  assert.match(projectConfig, /mode:"free", grid:\{columns:2,rows:2/);
  assert.match(projectConfig, /hasSavedCells\?savedCells\[index\]\?\?null:fallbackCells\[index\]\?\?null/);
  assert.match(page, /function GridWorkspace/);
  assert.match(page, /Свободные окна/);
  assert.match(page, />Mobile</);
  assert.match(page, /applyGridTemplate\(columns,rows\)/);
  assert.match(page, /\[\[2,2\],\[3,2\],\[2,3\]\]/);
  assert.match(page, /className={`view-grid-menu/);
  assert.match(page, /<summary className="view-modes__button">/);
  assert.match(page, /closest\("details"\)\?\.removeAttribute\("open"\)/);
  assert.match(page, /gridTemplateColumns:grid\.columnSizes\.map\(value=>`minmax\(0,\$\{value\}fr\)`\)/);
  assert.match(page, /addGridColumn/);
  assert.match(page, /addGridRow/);
  assert.match(page, /workspace-grid__divider--column/);
  assert.match(page, /workspace-grid__divider--row/);
  assert.match(page, /Выберите инструмент/);
  assert.match(page, /setPointerCapture/);
  assert.match(styles, /\.floating-panel--mobile/);
  assert.match(styles, /\.workspace-grid__empty/);
  assert.match(styles, /cursor:col-resize/);
  assert.match(styles, /cursor:row-resize/);
  assert.match(styles, /\.workspace__canvas--grid \{ padding:6px; overflow:hidden; \}/);
  assert.match(styles, /\.workspace-grid \{ width:100%; min-width:0; height:100%; min-height:0; \}/);
  assert.match(styles, /\.view-grid-menu__list/);
});

test("provides a component-database tool with category-specific characteristics and prices", async () => {
  const [page, styles, projectConfig, rawDatabase] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/project-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"),
  ]);
  const database = JSON.parse(rawDatabase);
  assert.equal(database.catalogs.length, 25);
  assert.equal(database.items.length, 1794);
  assert.ok(!database.catalogs.some(catalog => catalog.id === "обвязка"));
  assert.ok(database.catalogs.some(catalog => catalog.id === "обратные-клапаны"));
  assert.ok(database.catalogs.some(catalog => catalog.id === "пожарная-арматура"));
  assert.match(projectConfig, /"components" \| "cabinet" \| "model"/);
  assert.match(projectConfig, /"station-components": \{ kind: "components" \}/);
  assert.match(page, /components: \{ title: "База комплектующих"/);
  assert.match(page, /components:"station-components"/);
  assert.match(page, /fetch\("\/binding-components\.json",\{cache:"no-store"\}\)/);
  assert.match(page, /fetch\("\/control-cabinet-database\.json",\{cache:"no-store"\}\)/);
  assert.match(page, /Сборочный комплект гидравлики/);
  assert.match(page, /Комплектующие ШУ/);
  assert.match(page, /Металлоконструкция и рама/);
  assert.match(page, /Группа комплектующих/);
  assert.match(page, /Тип комплектующего/);
  assert.match(page, /COMPONENT_GROUPS\.map/);
  assert.match(page, /catalogs\.map/);
  assert.match(page, /componentFieldLabel/);
  assert.match(page, /\/цен\|стоимост\|ссылк\|url\/i/);
  assert.match(page, /item\.prices\.map/);
  assert.match(page, /Цена<\/th>/);
  assert.match(styles, /\.components-db__table/);
  assert.match(styles, /position:sticky/);
});

test("groups the specification and calculates section, subsection and final totals", async () => {
  const [page, styles, projectConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/project-config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(projectConfig, /"frame" \| "electrical"/);
  assert.match(page, /title: "Насосы"/);
  assert.match(page, /title: "Шкаф управления"/);
  assert.match(page, /title: "Рама"/);
  assert.match(page, /title: "Сборочный комплект гидравлики"/);
  assert.match(page, /title: "Сборочный комплект электрики"/);
  assert.match(page, /title: "Всасывающая линия"/);
  assert.match(page, /title: "Напорная линия"/);
  assert.match(page, /const subtotal=/);
  assert.match(page, /sectionSummary\(groupItems\)/);
  assert.match(page, /sectionSummary\(items\)/);
  assert.match(page, /Итоговая стоимость/);
  assert.match(page, /formatMoney\(knownTotal\)/);
  assert.match(styles, /\.spec-table__section-summary/);
  assert.match(styles, /font-variant-numeric:tabular-nums/);
});

test("ships the complete binding-component catalogue with prices and relations", async () => {
  const rawCatalogue = await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8");
  const catalogue = JSON.parse(rawCatalogue);

  assert.equal(catalogue.schemaVersion, 1);
  assert.equal(catalogue.source.file, "Equipment/Калькулятор по ОБВЯЗКЕ.xlsm");
  assert.match(catalogue.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(catalogue.source.externalLinks.length, 2);
  assert.deepEqual(catalogue.statistics, {
    catalogs: 25,
    tables: 76,
    componentRows: 1794,
    pricedComponentRows: 1765,
    priceEntries: 4226,
    formulaRules: 4785,
    formulaErrorsInSavedValues: 0,
    dataValidations: 23,
    definedNames: 20,
  });

  const itemsById = new Map(catalogue.items.map(item => [item.id, item]));
  assert.equal(itemsById.size, catalogue.items.length);
  assert.ok(catalogue.items.every(item => item.fields.length > 0));
  assert.ok(catalogue.items.flatMap(item => item.prices).every(price => price.currency === "RUB" && Number.isFinite(price.amount) && price.amount > 0));
  assert.ok(catalogue.catalogs.every(catalog => catalog.tables.every(table => table.recordIds.every(id => itemsById.has(id)))));
  assert.ok(!catalogue.catalogs.some(catalog => catalog.id === "обвязка"));
  assert.ok(catalogue.items.filter(item => item.sourceSheet === "Обвязка").every(item => item.prices.length > 0));

  const steelThreadedDn15 = catalogue.items.find(item => item.id === "сгоны-резьба-001-r0005");
  assert.equal(steelThreadedDn15.fields.find(field => field.column === "B")?.value, "DN15");
  assert.equal(steelThreadedDn15.prices[0]?.amount, 44);
  const tank8 = catalogue.items.find(item => item.id === "мембранный-бак-001-r0004");
  assert.equal(tank8.prices[0]?.amount, 2347.28);

  assert.equal(catalogue.relations.formulas.length, 4785);
  assert.ok(catalogue.relations.formulas.every(rule => typeof rule.formula === "string" && rule.formula.length > 0));
  assert.ok(catalogue.relations.formulas.every(rule => !(typeof rule.cachedValue === "string" && rule.cachedValue.startsWith("#"))));
  assert.equal(catalogue.relations.dataValidations.length, 23);
  assert.ok(catalogue.relations.dataValidations.some(rule => rule.range === "C15" && rule.extension === "x14"));
  assert.equal(catalogue.relations.definedNames.length, 20);
});

test("defines the normalized D1 schema for binding components", async () => {
  const [schema, migration, authMigration, hosting] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_burly_jackpot.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_organic_lady_bullseye.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.equal([...schema.matchAll(/sqliteTable\("/g)].length, 24);
  for (const table of [
    "catalog_imports",
    "component_catalogs",
    "component_families",
    "components",
    "attribute_definitions",
    "component_attribute_values",
    "component_prices",
    "formula_rules",
    "formula_dependencies",
    "relation_tables",
    "relation_records",
    "relation_fields",
  ]) {
    assert.ok(migration.includes(`CREATE TABLE \`${table}\``));
  }
  assert.match(migration, /ON DELETE cascade/i);
  assert.match(migration, /ck_component_prices_amount/);
  for (const table of ["users", "auth_tokens", "sessions", "user_projects"]) {
    assert.ok(authMigration.includes(`CREATE TABLE \`${table}\``));
  }
  assert.match(migration, /idx_component_prices_currency_amount/);
  assert.match(migration, /idx_component_attribute_values_number/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});
