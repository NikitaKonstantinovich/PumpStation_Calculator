// Replaced by Vite in both server and client builds. Unknown/unbuilt = restricted.
declare const __PSC_RELEASE_PROFILE__: string;
export const RELEASE_PROFILE = typeof __PSC_RELEASE_PROFILE__ !== "undefined" && __PSC_RELEASE_PROFILE__ === "full" ? "full" : "beta";
export const IS_BETA = RELEASE_PROFILE === "beta";
export const RELEASE_VERSION = "0.1.0-beta.1";
export const RELEASE_LABEL = "beta 0.1";
export const BETA_TOOLS = ["input", "chart", "sketch", "components"] as const;
export type BetaTool = typeof BETA_TOOLS[number];
export const isBetaTool = (value: unknown): value is BetaTool => BETA_TOOLS.some(tool => tool === value);
export const betaToolFromUrl = (search: string): BetaTool | null => {
  const params = new URLSearchParams(search);
  return isBetaTool(params.get("panel")) ? params.get("panel") as BetaTool : null;
};

export function betaApiAllowed(path: string, method: string): boolean {
  return (path === "/api/auth" && ["GET", "POST"].includes(method)) ||
    // The users route independently authenticates and requires the admin role.
    (path === "/api/users" && ["GET", "POST", "PATCH"].includes(method)) ||
    (path === "/api/components" && method === "GET") ||
    (path === "/api/release" && method === "GET");
}

// Only the application shell is public. Data, drawings and private JS chunks
// must traverse the Worker and authenticate, including HEAD and range requests.
export function publicShellAsset(path: string): boolean {
  return path === "/favicon.svg" || path === "/robots.txt" ||
    (/^\/_next\/static\/(?:chunks|css|media)\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?)$/.test(path) && !path.startsWith("/_next/static/chunks/beta-workspace-"));
}
export function betaDataAsset(path: string): boolean {
  return ["/pumps.json", "/binding-components.json", "/control-cabinet-database.json"].includes(path) ||
    /^\/(?:aquastrong-drawings|aquastrong-select-drawings|cnp-drawings-archive|cnp-model-drawings|cnp-nis-td-drawings|cnp-td-dimension-drawings|reference-pump-assets)\/.+\.(?:png|jpe?g|webp|svg|pdf)$/i.test(path) ||
    /^\/_next\/static\/chunks\/beta-workspace-[^/]+\.js$/.test(path);
}
