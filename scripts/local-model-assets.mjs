import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';

/** Internal ASSETS binding for a local preview. The application Worker must
 * authorize the request before calling it. This does not open an HTTP listener.
 * Large CAD meshes stay outside Cloudflare's 25 MiB static-asset manifest. */
export function localModelAssets(directory, fallback) {
  const root = realpath(resolve(directory));
  return async request => {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/model-assets/')) return fallback(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const name = pathname.slice('/model-assets/'.length);
    if (!/^(?:(?:library|manifest)\.json|[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.stl)$/.test(name)) return new Response(null, { status: 404 });
    try {
      const folder=await root;
      const version=new URL(request.url).searchParams.get("version");
      if(version && !/^[0-9a-f]{64}$/.test(version))return new Response(null,{status:400});
      const file=name.endsWith(".json") && version ? name.replace(".json","-"+version+".json") : name;
      const path=await realpath(resolve(folder,file));
      if (dirname(path) !== folder) return new Response(null, { status: 404 });
      const info = await stat(path);
      if (!info.isFile()) return new Response(null, { status: 404 });
      const headers = { 'Content-Type': name.endsWith('.json') ? 'application/json; charset=utf-8' : 'model/stl',
        'Content-Length': String(info.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
      return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(path)), { headers });
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return new Response(null, { status: 404 });
      throw error;
    }
  };
}
