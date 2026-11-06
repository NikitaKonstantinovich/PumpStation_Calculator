import { db } from "../auth-server";
import { INITIAL_VERSION, type Publication } from "./runtime";
export class GraphError extends Error {
  constructor(message: string, readonly status = 400, readonly location?: {
    diagram: string;
    node?: string;
  }) {
    super(message);
  }
}
const defaultProgram: Publication = {
  version: INITIAL_VERSION,
  plans: {},
  args: {}
};
export async function readProgram(id?: string | null): Promise<Publication> {
  if (id === INITIAL_VERSION) return defaultProgram;
  const database = db(),
    query = id ? "SELECT program FROM engineering_versions WHERE id=?" : "SELECT program FROM engineering_versions JOIN engineering_state ON active=engineering_versions.id WHERE engineering_state.id=1";
  const statement = database.prepare(query);
  let row;
  try {
    row = await (id ? statement.bind(id) : statement).first<{
      program: string;
    }>();
  } catch (error) {
    if (!id && /no such table: (?:main\.)?engineering_(state|versions)/i.test(String(error))) return defaultProgram;
    throw error;
  }
  if (!row) throw new GraphError("Версия инженерного графа отсутствует.", 404);
  return JSON.parse(row.program) as Publication;
}
