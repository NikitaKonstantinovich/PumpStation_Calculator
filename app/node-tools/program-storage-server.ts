import { db } from "../auth-server";
import { ToolError } from "./errors";

const FORMAT = "node-program-chunks-v1";
const CHUNK_SIZE = 60000;
export const PROGRAM_STORAGE_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS node_program_archives(version TEXT PRIMARY KEY REFERENCES node_tool_versions(id),document TEXT NOT NULL,header TEXT NOT NULL)",
  "CREATE TRIGGER IF NOT EXISTS node_program_archives_immutable BEFORE UPDATE ON node_program_archives BEGIN SELECT RAISE(ABORT,'Algorithm archives are immutable'); END",
  "CREATE TRIGGER IF NOT EXISTS node_program_archives_no_delete BEFORE DELETE ON node_program_archives BEGIN SELECT RAISE(ABORT,'Algorithm archives are immutable'); END",
  "CREATE TABLE IF NOT EXISTS node_program_chunks(version TEXT NOT NULL REFERENCES node_tool_versions(id),ordinal INTEGER NOT NULL CHECK(ordinal>=0),payload TEXT NOT NULL,PRIMARY KEY(version,ordinal))",
  "CREATE TRIGGER IF NOT EXISTS node_program_chunks_immutable BEFORE UPDATE ON node_program_chunks BEGIN SELECT RAISE(ABORT,'Algorithm program chunks are immutable'); END",
  "CREATE TRIGGER IF NOT EXISTS node_program_chunks_no_delete BEFORE DELETE ON node_program_chunks BEGIN SELECT RAISE(ABORT,'Algorithm program chunks are immutable'); END",
];

/** Keep every stored string below D1's row limit, including growing compiled plans. */
export function prepareProgramStorage(version: string, program: string) {
  const chunks = Array.from({length: Math.ceil(program.length / CHUNK_SIZE)}, (_, i) =>
    JSON.stringify(program.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)));
  return {
    header: JSON.stringify({storage: FORMAT, chunks: chunks.length, length: program.length}),
    statements: chunks.map((payload, ordinal) => db().prepare(
      "INSERT INTO node_program_chunks(version,ordinal,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM node_tool_versions WHERE id=?)"
    ).bind(version, ordinal, payload, version)),
  };
}

export async function readStoredProgram(version: string, prefix: string, characters: number): Promise<string> {
  // Older versions remain immutable. Read an oversized legacy string in SQL
  // substrings rather than selecting the entire value across the D1 boundary.
  if (characters > CHUNK_SIZE) {
    const parts = [prefix];
    for (let start = CHUNK_SIZE + 1; start <= characters; start += CHUNK_SIZE) {
      const row = await db().prepare("SELECT substr(program,?,?) AS part FROM node_tool_versions WHERE id=?")
        .bind(start, CHUNK_SIZE, version).first<{part:string}>();
      if (!row) throw new ToolError("Сохранённая программа алгоритма недоступна", 503);
      parts.push(row.part);
    }
    return parts.join("");
  }
  const header = JSON.parse(prefix);
  if (header.storage !== FORMAT) return prefix;
  if (!Number.isSafeInteger(header.chunks) || header.chunks < 1 || !Number.isSafeInteger(header.length) || header.length < 1)
    throw new ToolError("Повреждено описание сохранённой программы", 503);
  const rows = await db().prepare("SELECT ordinal,payload FROM node_program_chunks WHERE version=? ORDER BY ordinal")
    .bind(version).all<{ordinal:number;payload:string}>();
  if (rows.success === false || !rows.results || rows.results.length !== header.chunks)
    throw new ToolError("Сохранённая программа алгоритма неполна", 503);
  const result = rows.results.map((row, index) => {
    const value = JSON.parse(row.payload);
    if (row.ordinal !== index || typeof value !== "string") throw new ToolError("Повреждена часть программы алгоритма", 503);
    return value;
  }).join("");
  if (result.length !== header.length) throw new ToolError("Сохранённая программа алгоритма неполна", 503);
  return result;
}
