import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const helpSections = [
  { id: "start", title: "Начало работы", description: "Проекты, подбор насосов, кривые и основные понятия." },
  { id: "products", title: "Продукты и алгоритмы", description: "Рабочее пространство продукта, нодовый редактор и версии графов." },
  { id: "calculation", title: "Расчёт станции", description: "DN, коллекторы, обвязка, шкафы и спецификация." },
  { id: "models", title: "3D и компоновка", description: "Модели оборудования, сборки и монтажные соединения." },
  { id: "management", title: "Настройки и доступ", description: "Базовые значения, версии расчёта и пользователи." },
  { id: "engineering", title: "Размеры и исходные данные", description: "Каталоги, фланцы, вставки и принятые инженерные решения." },
  { id: "operations", title: "Установка и эксплуатация", description: "Запуск приложения, профили выпуска и подготовка моделей." },
];

// Files in docs/ also include research, task reports and source evidence.
// Publish a reference only after it has been reviewed against the current UI or code.
const references = {
  start: ["README", "ai-assistant", "node-pump-selection-manual", "hydraulic-curves"],
  products: ["node-tools-workspace2", "algorithm-library", "node-spacing-sources"],
  calculation: ["collector-constructor", "component-calculator", "diagnostics", "discharge-spec", "frame-selection",
    "bent-frame-calculation", "horizontal-channel-frame", "pipe-painting", "pressure-checks", "sealing-selection",
    "specification-consistency", "specification-hydraulics-instruments", "specification-insertions", "suction-instruments",
    "suction-pressure", "threaded-inserts", "valve-fasteners", "sensor-nipple-pn25-warning"],
  models: ["3d-editor", "3d-flange-fasteners", "3d-line-assemblies", "collector-3d", "collector-instrument-mounting",
    "end-suction-ports", "fire-insertion-instruments", "insertion-3d", "node-pump-drawings", "onis-3d-models",
    "solidworks-export", "steel-flange-display", "tank-connection-3d", "valve-control-mounting"],
  management: ["base-values", "user-administration", "item-entry", "equipment-admin"],
  engineering: ["bene-inox-pn16-flanges", "newkey-din2503-dimensions", "newkey-dn125-pn25", "newkey-dn150-pn25",
    "newkey-dn40-pn25", "reducer-ready-bore-seating", "st20-concentric-reducers", "standard-stainless-pn16-flanges", "werk-pn16-flanges"],
  operations: ["beta-0.1", "help-center", "local-project-storage", "model-converter"],
};

export async function collectHelpDocuments(directory = root) {
  const read = async (path) => (await readFile(resolve(directory, path), "utf8")).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const registry = JSON.parse(await read("docs/assistant/registry.json"));
  const guideSections = { assistant: "start", access: "start", projects: "start", selection: "start", curves: "start", glossary: "start", model: "models", "base-values": "management", administration: "management" };
  const inputs = registry.documents.map((doc) => ({ id: doc.id, path: doc.path, section: guideSections[doc.topic] ?? "calculation", kind: "guide" }));
  for (const [section, names] of Object.entries(references)) {
    for (const name of names) inputs.push({ id: `doc-${name.toLowerCase()}`, path: `docs/${name}.md`, section, kind: "reference" });
  }
  inputs.push(
    { id: "app-readme", path: "README.md", section: "operations", kind: "reference" },
    { id: "catalog-readme", path: "data/pump-catalog/README.md", section: "engineering", kind: "reference" },
    { id: "cnp-physical-data", path: "data/pump-catalog/CNP-PHYSICAL-DATA.md", section: "engineering", kind: "reference" },
  );
  const ids = new Set();
  const documents = [];
  for (const input of inputs) {
    if (ids.has(input.id) || !/^(?:docs\/(?:[a-zA-Z0-9.-]+\.md|assistant\/knowledge\/[a-z0-9-]+\.md)|README\.md|data\/pump-catalog\/[A-Z-]+\.md)$/.test(input.path)) throw new Error(`Invalid help document registry: ${input.path}`);
    ids.add(input.id);
    const markdown = await read(input.path);
    if (/\bsk-(?:proj-)?[a-zA-Z0-9_-]{24,}\b/.test(markdown)) throw new Error(`Possible secret in documentation: ${input.path}`);
    const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!title) throw new Error(`Missing document title: ${input.path}`);
    documents.push({ ...input, title, markdown, sha256: createHash("sha256").update(markdown).digest("hex") });
  }
  return { schemaVersion: 1, sections: helpSections, documents };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(root, "app/help-documents.json");
  const content = `${JSON.stringify(await collectHelpDocuments(), null, 2)}\n`;
  if (process.argv[2] === "--check") {
    if (await readFile(output, "utf8") !== content) throw new Error("Help content is stale. Run node scripts/build-help-content.mjs.");
  } else {
    if (process.argv.length > 2) throw new Error("Usage: node scripts/build-help-content.mjs [--check]");
    await writeFile(output, content);
  }
  console.log(`Help documentation: ${JSON.parse(content).documents.length} articles in ${helpSections.length} sections.`);
}
