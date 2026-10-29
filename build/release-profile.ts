export function resolveReleaseProfile(command: "serve" | "build", requested?: string, isPreview = false): "beta" | "full" {
  const profile = requested ?? (command === "serve" && !isPreview ? "full" : "beta");
  if (profile !== "beta" && profile !== "full") {
    throw new Error("PSC_RELEASE_PROFILE must be beta or full; refusing an ambiguous release.");
  }
  return profile;
}
