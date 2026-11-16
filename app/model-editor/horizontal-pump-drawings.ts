import cmi from "../../data/cmi-spatial-profiles.json";
import cuc from "../../data/horizontal-pump-cuc-drawings.json";
import edh from "../../data/horizontal-pump-edh-drawings.json";
import mh from "../../data/horizontal-pump-mh-drawings.json";
import vcm from "../../data/horizontal-pump-vcm-drawings.json";
import type { PumpSpatialData } from "../pump-catalog";

type Drawing = {
  page: number;
  boundsMm: PumpSpatialData["boundsMm"];
  outletMm: [number, number, number];
  legacyId?: string;
  variantDrawingSha256?: string;
};
type DrawingSet = {
  source: { url: string; sha256: string };
  variants: Record<string, Drawing>;
};

const drawings = new Map<string, PumpSpatialData>();
for (const set of [cmi, cuc, edh, mh, vcm] as unknown as DrawingSet[]) {
  for (const [id, drawing] of Object.entries(set.variants)) {
    const source = `${set.source.url}#page=${drawing.page}${drawing.variantDrawingSha256 ? ` · чертёж артикула SHA-256 ${drawing.variantDrawingSha256}` : ""}`;
    const spatial: PumpSpatialData = {
      version: 1, units: "mm", coordinateSystem: "inlet", boundsMm: drawing.boundsMm,
      ports: [
        { id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0], source },
        { id: "outlet", point: drawing.outletMm, axis: [0, 0, 1], source },
      ],
      source,
      rule: "Точки подключения по заводскому размерному чертежу исполнения.",
      issues: ["Плоскости подключения заданы по чертежу. Монтажные зазоры и глубина резьбового зацепления требуют проверки."],
    };
    drawings.set(id, spatial);
    if (drawing.legacyId) drawings.set(drawing.legacyId, spatial);
  }
}

export function horizontalPumpDrawing(id: string | undefined) {
  return id ? drawings.get(id) : undefined;
}
