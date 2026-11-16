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
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, "") || "/", view = url.searchParams.get("view");
  if(path==="/"&&(view==="geometry-nodes"||view==="node-editor")){
    const user=await currentUser(request);
    if(!user)return json({error:"Требуется вход."},401,{"Cache-Control":"no-store"});
    if(user.role!=="admin"||IS_BETA)return json({error:"Редактор доступен администратору в полной версии."},403,{"Cache-Control":"no-store"});
    if(view==="geometry-nodes"){
      url.searchParams.set("view","algorithm-library");
      return new Response(null,{status:307,headers:{Location:url.href,"Cache-Control":"no-store"}});
    }
  }
  if(path==="/"&&new URL(request.url).searchParams.get("view")==="workspace2"){const user=await currentUser(request);if(!user)return json({error:"Требуется вход"},401);if(IS_BETA)return disabledInBeta();}
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
