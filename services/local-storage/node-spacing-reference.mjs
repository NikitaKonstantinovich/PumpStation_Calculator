import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { reviewedSpacingBinding, reviewedSpacingReference } from "./node-spacing-reviewed.mjs";

const cad = JSON.parse(readFileSync(new URL("../../data/pump-spacing-cad.json",import.meta.url),"utf8"));
const cadByLegacy = new Map();
for (const row of cad.rows) {
  if (!cadByLegacy.has(row.legacyId)) cadByLegacy.set(row.legacyId,[]);
  cadByLegacy.get(row.legacyId).push(row);
}
const positive = x => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Preliminary envelope, explicitly distinct from certified full execution geometry. */
export function spacingReference({variant,model,motor,manufacturer,series,dimensions,evidence,links,motorKey}) {
  const candidates = [], ids = [...new Set(links.map(l=>l.legacyId))];
  const reviewed = reviewedSpacingReference(reviewedSpacingBinding({variant,model,motor,manufacturer,series,dimensions,evidence}),motorKey);
  if (reviewed) candidates.push({leftMm:reviewed.leftMm,rightMm:reviewed.rightMm,source:reviewed.source,basis:reviewed.basis,proof:reviewed.version});
  if (ids.length === 1) {
    const rows = (cadByLegacy.get(ids[0]) ?? []).filter(r=>r.manufacturer===manufacturer && r.powerKw===motor?.power_kw);
    if (rows.length) {
      candidates.push({leftMm:Math.max(...rows.map(r=>r.leftMm)),rightMm:Math.max(...rows.map(r=>r.rightMm)),source:"STEP: "+rows.map(r=>r.source).join("; "),basis:"Поперечный габарит архивных STEP-моделей с той же мощностью. Соответствие текущему заводскому исполнению требует проверки.",proof:{version:cad.version,rows}});
    }
  }
  if (dimensions && evidence?.dimensionSetId && evidence.sourceId) {
    const symbols = new Map();
    for (const row of dimensions.sourceValues ?? []) {
      if (!positive(row.valueMm) || !["symbol_only","semantic_source_key"].includes(row.mappingStatus)) continue;
      const key = row.symbol ?? row.key;
      if (!symbols.has(key)) symbols.set(key,new Set());
      symbols.get(key).add(row.valueMm);
    }
    const values = Object.fromEntries([...symbols].filter(([,assertions])=>assertions.size===1).map(([key,assertions])=>[key,[...assertions][0]]));
    const add = (width,formula) => { if(positive(width)) candidates.push({leftMm:width/2,rightMm:width/2,source:[evidence.document ?? evidence.sourceId,evidence.page ? `стр. ${evidence.page}` : "",evidence.dimensionSetId].filter(Boolean).join(" · "),basis:formula+". Справочная оценка: полный поперечный габарит выбранного двигателя и выступающих деталей требует подтверждения.",proof:{dimensions,evidence}}); };
    // Only reviewed transverse meanings are allowed. Length, height, DN, packaging and
    // an isolated base dimension must never silently become overall pump width.
    if (positive(dimensions.overall_width)) add(dimensions.overall_width,"Ширина из размерного набора каталога");
    if (["CNP/CDM","VANDJORD/CRV","Aquastrong/EVR","ONIS/MV","ONIS/MVS","ONIS/PV"].includes(manufacturer+"/"+series) && positive(values.D1) && positive(values.D2)) add(2*Math.max(values.D1/2,values.D2,positive(values.D3)?values.D3/2:0),"Прежняя методика: 2 × max(D1/2, D2, D3/2)");
    if (["CNP/TD","Wellmix/TD","ONIS/INL"].includes(manufacturer+"/"+series) && ["B1","B2","B3","B4","D"].every(k=>positive(values[k]))) add(2*Math.max(values.B1/2,values.B2,values.B3,values.B4,values.D/2),"Прежняя методика: 2 × max(B1/2, B2, B3, B4, D/2)");
    if (manufacturer==="VANDJORD" && series==="TPV" && ["AC","AD","P","W"].every(k=>positive(values[k]))) add(2*Math.max(values.AC/2,values.AD,values.P/2,values.W/2),"Прежняя методика: 2 × max(AC/2, AD, P/2, W/2); корпус требует проверки");
    if (manufacturer==="Wellmix" && series==="NBW" && ["n","n2"].every(k=>positive(values[k]))) add(Math.max(values.n,values.n2),"Чертёж NBW: max(n — ширина корпуса, n2 — опора); двигатель и коробку проверить");
    if (manufacturer==="Wellmix" && series==="NBS" && ["n2","L2","ØE"].every(k=>positive(values[k]))) add(Math.max(values.n2,values.L2,values["ØE"],values["ØD1"]??0,values["ØD2"]??0),"Чертёж NBS: max(n2, L2, ØE, ØD1, ØD2) — корпус, опора, двигатель и фланцы");
    if (manufacturer==="ONIS" && series==="MH" && ["L8","L9"].every(k=>positive(values[k]))) add(Math.max(values.L8,2*values.L9),"Чертёж MH: max(L8, 2 × L9), с учётом бокового вылета коробки");
    if (manufacturer==="Wellmix" && series==="CUC" && positive(values.B)) add(values.B,"Чертёж CUC: B — поперечный размер корпуса; выступающие вводы коробки проверить");
  }
  if (!candidates.length) return undefined;
  const leftMm = Math.max(...candidates.map(c=>c.leftMm)), rightMm = Math.max(...candidates.map(c=>c.rightMm));
  return {variantId:String(variant.id),modelId:String(model.id),motorKey,orientation:"transverse_to_flow",leftMm,rightMm,source:candidates.map(c=>c.source).join("; "),basis:candidates.map(c=>c.basis).join(" "),version:createHash("sha256").update(JSON.stringify(candidates)).digest("hex")};
}
