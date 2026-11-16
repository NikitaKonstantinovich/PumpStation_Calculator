import { env } from "cloudflare:workers";

type StorageEnvironment = { PROJECT_STORE?: Fetcher; PROJECT_LIMIT_BYTES?: string };
export const projectLimit = () => Number((env as StorageEnvironment).PROJECT_LIMIT_BYTES || 10_000_000);
export async function storageOperation(owner: string, command: Record<string,unknown>) {
  const store = (env as StorageEnvironment).PROJECT_STORE;
  if (!store) return Response.json({error:"Локальная база PostgreSQL проектов не подключена."},{status:503});
  const response=await store.fetch("http://project-store.internal/", {method:"POST",body:JSON.stringify({...command,owner})});
  return new Response(response.body,{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store"}});
}
