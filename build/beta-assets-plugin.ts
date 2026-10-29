import type { Plugin } from "vite";

// Validate module ownership, not just names/strings in minified output. Fail the
// build if an internal catalogue or business module leaks into the login shell.
export function betaAssets(): Plugin {
  let appRoot = "";
  return {
    name: "beta-private-assets",
    enforce: "post",
    apply: "build",
    configResolved(config) { appRoot = `${config.root.replaceAll("\\", "/")}/app/`; },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client" || process.env.PSC_RELEASE_PROFILE === "full") return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const privateModules = chunk.moduleIds.filter(id => {
          const path = id.replaceAll("\\", "/").split("?")[0];
          return path.startsWith(appRoot) && /\.(?:tsx?|json)$/.test(path) && !/\/(?:page|layout|beta-entry|account-ui|release-policy|user-types|theme|use-theme)\.[^/]+$/.test(path);
        });
        if (privateModules.length && !chunk.fileName.startsWith("_next/static/chunks/beta-workspace-")) this.error(`Private module in public chunk ${chunk.fileName}: ${privateModules.join(", ")}`);
        if (!chunk.fileName.includes("/beta-workspace-") && chunk.imports.some(path => path.includes("/beta-workspace-"))) this.error(`Public shell eagerly imports protected workspace: ${chunk.fileName}`);
      }
    },
  };
}
