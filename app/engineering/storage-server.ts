import { rowHistory, summarizeTrace } from "./trial-trace";
import { compileTree, ROOT } from "./hierarchy";
import { engineeringOperation, withEvaluationProgram } from "./runtime";
import { db } from "../auth-server";
import { DiagramError, executableSlice, runPlan, validateDocument } from "./engine";
import { initialDocument, signatures, compilePublication, upgradeDocument } from "./templates";
import { equipmentTypes, trialResources } from "./equipment-server";
import { nativeOperations } from "./native-server";
import { GraphError } from "./publication-server";
export { GraphError } from "./publication-server";
import type { Document, EditorState, Version } from "./schema";
async function original() {
  return initialDocument(await equipmentTypes());
}
export async function editorState(): Promise<EditorState> {
  const row = await db().prepare("SELECT revision,active,draft FROM engineering_state WHERE id=1").first<{
    revision: number;
    active: string;
    draft: string | null;
  }>();
  if (!row) throw Error("Требуется миграция 0015");
  const versions = await db().prepare("SELECT id,author,created FROM engineering_versions ORDER BY rowid DESC").all<Version>();
  const sources = await Promise.all(Object.entries(nativeOperations).map(async ([id, fn]) => {
    const code = fn.toString();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
    const version = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    return [id, "// " + id + " · SHA-256 " + version + "\n" + code];
  }));
  return {
    revision: row.revision,
    active: row.active,
    draft: row.draft ? upgradeDocument(JSON.parse(row.draft)) : await original(),
    versions: versions.results ?? [],
    sources: Object.fromEntries(sources)
  };
}
export type EditorCommand = {
  action: "impact" | "save" | "publish" | "rollback" | "test";
  revision: number;
  document?: Document;
  version?: string;
  diagram?: string;
  useCatalog?: boolean;
  output?: string;
  inputs?: Record<string, unknown>;
};
export async function command(body: EditorCommand, author: string) {
  const database = db();
  if (!body || !["save", "impact", "publish", "rollback", "test"].includes(body.action)) throw new GraphError("Неизвестная команда");
  if (!Number.isSafeInteger(body.revision)) throw new GraphError("Требуется ревизия");
  const revision = body.revision;
  const conflict = () => new GraphError("Черновик изменился в другом окне. Ваши правки сохранены на экране. Загрузите актуальную ревизию перед повтором.", 409);
  if (body.action === "rollback") {
    const version = await database.prepare("SELECT id,document FROM engineering_versions WHERE id=?").bind(body.version ?? "").first<{
      id: string;
      document: string | null;
    }>();
    if (!version) throw new GraphError("Версия не найдена", 404);
    const changed = await database.prepare("UPDATE engineering_state SET active=?,draft=?,revision=revision+1 WHERE id=1 AND revision=?").bind(version.id, version.document, revision).run();
    if (changed.meta?.changes !== 1) throw conflict();
    return editorState();
  }
  const document = body.document;
  if (!document) throw new GraphError("Нет графа");
  try {
    validateDocument(document, signatures, initialDocument().types, body.action === "publish" || body.action === "impact");
    if (body.action === "impact" || body.action === "publish") compilePublication(document, "validate");
  } catch (error) {
    throw new GraphError((error as Error).message, 400, error instanceof DiagramError ? {
      diagram: error.diagram,
      node: error.node
    } : undefined);
  }
  if (body.action === "impact") {
    const row = await database.prepare("SELECT document,revision FROM engineering_versions JOIN engineering_state ON active=engineering_versions.id WHERE engineering_state.id=1").first<{
      document: string | null;
      revision: number;
    }>();
    if (!row || row.revision !== revision) throw conflict();
    const previous: Document = row.document ? upgradeDocument(JSON.parse(row.document)) : initialDocument();
    const changed = new Set(document.types.filter(t => JSON.stringify(t) !== JSON.stringify(previous.types.find(old => old.id === t.id))).map(t => t.id));
    return {
      uses: document.diagrams.flatMap(g => g.nodes.filter(n => changed.has(n.type)).map(n => ({
        diagram: g.id,
        graph: g.name,
        node: n.id,
        name: n.name,
        links: g.edges.filter(e => e.from === n.id || e.to === n.id)
      })))
    };
  }
  if (body.action === "test") {
    const diagram = document.diagrams.find(g => g.id === body.diagram);
    if (!diagram) throw new GraphError("Неизвестная схема");
    try {
      const publication = compilePublication(document, "draft");
      const full = compileTree(document, diagram);
      const output = body.output ?? (diagram.id === ROOT ? "stationComposition" : undefined);
      if (output && !full.steps.find(s => s.id === "result")?.fields.some(f => f.key === output)) throw Error("Неизвестный выход " + output);
      const plan = output ? executableSlice(full, [output]) : full;
      let inputs = body.inputs ?? {};
      if (body.useCatalog && diagram.id === ROOT) {
        const resources = await trialResources();
        inputs = {
          ...inputs,
          resources,
          catalogue: resources.pumps,
          cabinets: resources.smartCabinets,
          collectorCatalog: resources.components?.collectorCatalog
        };
      }
      const result = withEvaluationProgram(publication, () => runPlan(plan, inputs, (id, values, direct) => {
        if (!Object.hasOwn(nativeOperations, id)) throw Error("Недоступная операция");
        const fn = nativeOperations[id as keyof typeof nativeOperations] as (...args: unknown[]) => unknown;
        const args = signatures.find(s => s.id === id)!.args.map(f => values[f.key]);
        return direct || id === diagram.id ? fn(...args) : engineeringOperation(id, fn, args);
      }, true));
      return {
        ...result,
        ...(diagram.id === ROOT ? {
          rows: rowHistory(result.trace),
          trace: summarizeTrace(result.trace)
        } : {}),
        value: output ? result.trace.result.inputs[output] : Object.hasOwn(result.trace.result.inputs, "value") ? result.value : result.trace.result.inputs
      };
    } catch (error) {
      throw new GraphError((error as Error).message);
    }
  }
  const json = JSON.stringify(document);
  if (body.action === "save") {
    const response = await database.prepare("UPDATE engineering_state SET revision=revision+1,draft=? WHERE id=1 AND revision=?").bind(json, revision).run();
    if (response.meta?.changes !== 1) throw conflict();
  } else {
    const id = crypto.randomUUID(),
      program = compilePublication(document, id);
    const [insert] = await database.batch([database.prepare("INSERT INTO engineering_versions(id,document,program,author) SELECT ?,?,?,? FROM engineering_state WHERE id=1 AND revision=?").bind(id, json, JSON.stringify(program), author, revision), database.prepare("UPDATE engineering_state SET revision=revision+1,draft=?,active=? WHERE id=1 AND revision=?").bind(json, id, revision)]);
    if (insert.meta?.changes !== 1) throw conflict();
  }
  return editorState();
}
