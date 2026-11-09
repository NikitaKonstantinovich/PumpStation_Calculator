import { currentUser, json } from "../../../auth-server";
import { IS_BETA } from "../../../release-policy";
import { initializeAlgorithms, toolCommand } from "../../../node-tools/storage-server";
import { algorithmHistory, createAlgorithm, listAlgorithms, restoreAlgorithm, setAlgorithmConnected } from "../../../node-tools/algorithm-store-server";
import { ToolError } from "../../../node-tools/errors";
const reply = (body:unknown,status=200) => json(body,status,{"Cache-Control":"private, no-store"});
async function dispatch(request:Request) {
  try {
    const user = await currentUser(request);
    if (!user) throw new ToolError("Требуется вход",401);
    if (IS_BETA || user.role !== "admin") throw new ToolError("Библиотека доступна только администратору полной версии",403);
    if (request.method !== "GET" && (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)) throw new ToolError("Недопустимый источник запроса",403);
    await initializeAlgorithms();
    const query = new URL(request.url).searchParams;
    if (request.method === "GET") return reply(query.has("algorithm") ? {versions:await algorithmHistory(query.get("algorithm")!)} : {algorithms:await listAlgorithms()});
    const text = await request.text(); if (text.length > 2_000_000) throw new ToolError("Слишком большой запрос",413);
    const body = JSON.parse(text);
    if (body.action === "create") {
      const id = await createAlgorithm(body.name,user.name,body.source);
      return reply({id,algorithms:await listAlgorithms()},201);
    }
    if (typeof body.algorithmId !== "string") throw new ToolError("Выберите алгоритм");
    if (body.action === "connect") await setAlgorithmConnected(body.algorithmId,body.revision,body.connected);
    else if (body.action === "restore") {
      if(body.saveDraft===true){const {toolState}=await import("../../../node-tools/storage-server");const state=await toolState(body.algorithmId);await toolCommand({action:"restore-preserve",algorithmId:body.algorithmId,revision:body.revision,version:body.version,document:state.draft},user.name);}
      else await restoreAlgorithm(body.algorithmId,body.revision,body.version,user.name,body.discardDraft === true);
    }
    else if (body.action === "publishDraft") {
      const {toolState} = await import("../../../node-tools/storage-server");
      const state = await toolState(body.algorithmId);
      await toolCommand({action:"publish",algorithmId:body.algorithmId,revision:body.revision,document:state.draft},user.name);
    } else throw new ToolError("Неизвестная команда библиотеки");
    return reply({algorithms:await listAlgorithms()});
  } catch(error) { return reply({error:(error as Error).message},error instanceof ToolError ? error.status : 400); }
}
export const GET = dispatch;
export const POST = dispatch;
