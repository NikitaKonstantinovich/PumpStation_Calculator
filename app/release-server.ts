import { currentUser, json } from "./auth-server";
import { geometryAccessError } from "./geometry-access-server";
import { IS_BETA, betaApiAllowed, betaDataAsset, publicShellAsset } from "./release-policy";

export const disabledInBeta = () => json({ error: "Эта возможность недоступна в beta 0.1.", code: "FEATURE_DISABLED_IN_BETA" }, 403, { "Cache-Control": "no-store" });

// Used by routes as well as the Worker, so a new entry point cannot bypass it.
export async function guardDisabledBetaFeature(request: Request): Promise<Response | null> {
  if (!IS_BETA) return null;
  if (!await currentUser(request)) return json({ error: "Требуется вход." }, 401, { "Cache-Control": "no-store" });
  return disabledInBeta();
}

export async function guardReleaseRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, "") || "/";
  if(path==="/"&&new URL(request.url).searchParams.get("view")==="geometry-nodes"){
    const user=await currentUser(request);
    if(!user)return json({error:"Требуется вход."},401,{"Cache-Control":"no-store"});
    if(user.role!=="admin"||IS_BETA)return json({error:"Редактор доступен администратору в полной версии."},403,{"Cache-Control":"no-store"});
  }
  if (path === "/" || publicShellAsset(path)) return null;
  if (path.startsWith("/api/")) {
    if (IS_BETA && !betaApiAllowed(path, request.method)) return guardDisabledBetaFeature(request);
    return null; // Allowed APIs still perform their own authentication.
  }
  // All other files are private in either profile; fail closed on DB errors.
  const user = await currentUser(request);
  if (!user) return json({ error: "Требуется вход." }, 401, { "Cache-Control": "no-store" });
  if (IS_BETA && (!betaDataAsset(path) || !["GET", "HEAD"].includes(request.method))) return disabledInBeta();
  if (path.startsWith("/model-assets/")) return geometryAccessError(user);
  return null;
}
