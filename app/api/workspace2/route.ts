import { algorithmRow } from "../../node-tools/algorithm-store-server";
import { currentUser, json } from "../../auth-server";
import { CatalogError } from "../../node-tools/catalog-server";
import { IS_BETA } from "../../release-policy";
import { toolProgram, toolDefaults, toolResources, ToolError } from "../../node-tools/storage-server";
import { missingRuntimeOperations, parseRuntimeOperations, NODE_RUNTIME_HEADER, NODE_RUNTIME_UPDATE_MESSAGE } from "../../node-tools/runtime-compatibility";
export async function GET(request: Request) {
  const reply = (v: unknown, status = 200) => json(v, status, {
    "Cache-Control": "private, no-store"
  });
  try {
    const user = await currentUser(request);
    if (!user) return reply({
      error: "Требуется вход"
    }, 401);
    if (IS_BETA) return reply({
      error: "Workspace 2 доступно в полной версии"
    }, 403);
    const q = new URL(request.url).searchParams,
      raw = q.get("base"),
      versions = raw ? JSON.parse(raw) : undefined;
    const program=await toolProgram(q.get("version"),q.get("algorithm") ?? undefined,user.role === "admin" && q.get("editor") === "1"),
      sources=q.has("sources")?JSON.parse(q.get("sources")!):undefined;
    const unsupported = missingRuntimeOperations(program, parseRuntimeOperations(request.headers.get(NODE_RUNTIME_HEADER)));
    if (unsupported.length) return reply({error:NODE_RUNTIME_UPDATE_MESSAGE,code:"NODE_RUNTIME_UPDATE_REQUIRED",unsupported},409);
    const defaults = await toolDefaults(versions);
    let resourceData;
    try { resourceData=await toolResources(program,sources,defaults.baseVersions); }
    catch(e) {
      if(!(e instanceof CatalogError) || e.status<404 || q.get("partial")!=="1") throw e;
      resourceData={sourceVersions:sources??{},sourceErrors:{catalog:e.message}};
    }
    return reply({
      program,
      algorithm: {id:program.algorithmId,name:(await algorithmRow(program.algorithmId)).name},
      ...resourceData,
      ...defaults,
      role: user.role
    });
  } catch (e) {
    return reply({
      error: (e as Error).message
    }, e instanceof ToolError || e instanceof CatalogError ? e.status : 400);
  }
}
