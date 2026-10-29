import { json } from "../../auth-server";
import { BETA_TOOLS, RELEASE_LABEL, RELEASE_PROFILE, RELEASE_VERSION } from "../../release-policy";

export function GET() {
  return json({ version: RELEASE_VERSION, label: RELEASE_LABEL, profile: RELEASE_PROFILE, tools: RELEASE_PROFILE === "beta" ? BETA_TOOLS : null }, 200, { "Cache-Control": "no-store" });
}
