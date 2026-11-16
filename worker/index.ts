import { AsyncLocalStorage } from "node:async_hooks";
import { provideRequestPublication, type Publication } from "../app/engineering/runtime";
import {readProgram} from "../app/engineering/publication-server";
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { guardReleaseRequest } from "../app/release-server";
import { publicShellAsset } from "../app/release-policy";
import { withPublicOrigin } from "./public-origin";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PUBLIC_APP_ORIGIN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const engineeringScope=new AsyncLocalStorage<Publication>();
provideRequestPublication(()=>engineeringScope.getStore());
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      request = withPublicOrigin(request, env.PUBLIC_APP_ORIGIN);
      const denied = await guardReleaseRequest(request);
      if (denied) {
        // Discard the rejected upload without buffering it or invoking a route.
        // workerd's local HTTP transport can reset a reused connection when an
        // early rejection leaves a request body unread (PUT/PATCH in particular).
        if (request.body) await request.body.pipeTo(new WritableStream());
        return denied;
      }
    } catch {
      return Response.json({ error: "Не удалось проверить доступ." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/" && !url.pathname.startsWith("/api/") && url.pathname !== "/_vinext/image") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) {
        const response = new Response(asset.body, asset);
        if (!publicShellAsset(url.pathname)) {
          response.headers.set("Cache-Control", "private, no-store");
          response.headers.set("Vary", "Cookie");
        }
        response.headers.set("X-Content-Type-Options", "nosniff");
        return response;
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if(/^\/api\/(?:projects|collectors|component-calculator|component-insertions-3d|model-preparation|control-cabinets)(?:\/|$)/.test(url.pathname)){
      try{const program=await readProgram(request.headers.get("x-engineering-version"));
        if(Object.keys(program.plans).length)await import("../app/engineering/native-server");
        return engineeringScope.run(program,()=>handler.fetch(request,env,ctx));
      }catch{return Response.json({error:"Не удалось загрузить опубликованный инженерный граф."},{status:503});}
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
