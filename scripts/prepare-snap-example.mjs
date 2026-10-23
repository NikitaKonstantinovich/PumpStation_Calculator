// Reproducible geometry fixture for manual/browser QA, using the native project format.
import { readFile, writeFile } from "node:fs/promises";
import { loadTs } from "../tests/load-ts.mjs";
const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const { parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const p = parseProjectConfig(JSON.parse(await readFile(new URL("../examples/3d-editor.pumpstation.json", import.meta.url), "utf8")));
p.project.id = "PS-SNAP-EXAMPLE"; p.project.name = "3D редактор — проверка привязок";
const part = (id, name, kind, position, rotation, parameters = {}) => ({ id, name, kind, sourceKey: "manual", sourceNote: "Параметрическая контрольная геометрия", position, rotation, hidden: false, locked: false, opacity: 1, ports: [], parameters: { length: 500, width: 600, height: 20, diameter: 100, routeOffset: 0, ...parameters } });
const frame = part("frame", "Контрольная рама", "frame", [0, 0, -10], [0, 0, 0], { length: 800 });
const horizontal = part("horizontal", "Труба X", "pipe", [0, 0, 100], [0, 0, 0]);
horizontal.ports = [{ id: "end", point: [250, 0, 0], axis: [1, 0, 0], provisional: false }];
const crossing = part("crossing", "Труба Y", "pipe", [0, 0, 100], [0, 0, 90], { diameter: 40 });
const skew = part("skew", "Труба Y выше", "pipe", [-100, 0, 150], [0, 0, 90], { diameter: 40 });
const vertical = part("vertical", "Круглый торец", "pipe", [150, 100, 150], [0, 90, 0], { length: 300 });
p.entities["station-model"].mode = "editor";
p.entities["station-model"].editor = { ...model.emptyEditor(), snap: false, camera: { position: [0, -.01, 1800], target: [0, 0, 0] }, assembly: { version: 1, sourceFingerprint: model.sourceFingerprint(p), components: [frame, horizontal, crossing, skew, vertical] }, referencePoints: [{ id: "tangent-source", componentId: "vertical", point: [-150, 150, 0] }] };
await writeFile(new URL("../examples/3d-snaps.pumpstation.json", import.meta.url), JSON.stringify(p, null, 2) + "\n");
