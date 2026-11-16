import { env } from "cloudflare:workers";

export function catalogService() {
  return (env as unknown as { NODE_CATALOG?: Fetcher }).NODE_CATALOG;
}
