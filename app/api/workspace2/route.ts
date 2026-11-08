import { currentUser, json } from "../../auth-server";
import { CatalogError } from "../../node-tools/catalog-server";
import { IS_BETA } from "../../release-policy";
import { toolProgram, toolDefaults, toolResources, ToolError } from "../../node-tools/storage-server";
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
    const program=await toolProgram(q.get("version")),
      sources=q.has("sources")?JSON.parse(q.get("sources")!):undefined;
    const defaults = await toolDefaults(versions);
    let resourceData;
    try { resourceData=await toolResources(program,sources,defaults.baseVersions); }
    catch(e) {
      if(!(e instanceof CatalogError) || e.status<404 || q.get("partial")!=="1") throw e;
      resourceData={sourceVersions:sources??{},sourceErrors:{catalog:e.message}};
    }
    return reply({
      program,
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
