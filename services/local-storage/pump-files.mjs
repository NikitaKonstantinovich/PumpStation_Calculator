import { mkdir, realpath, rename, stat, statfs, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Internal service binding; no public HTTP listener or user-supplied filesystem path.
export function pumpFileService(directory) {
  const root = resolve(directory);
  const ready = mkdir(root, { recursive: true }).then(() => realpath(root));
  return async request => {
    const key = new URL(request.url).pathname.slice(1);
    if (!/^(image|drawing|model)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.[a-z0-9_]{1,8}$/i.test(key)) return new Response(null, { status: 404 });
    if (!['PUT', 'GET', 'HEAD', 'DELETE'].includes(request.method)) return new Response(null, { status: 405 });
    let temporary;
    try {
      const base = await ready, folder = resolve(base, key.split('/')[0]);
      await mkdir(folder, { recursive: true });
      if (await realpath(folder) !== folder) return new Response(null, { status: 403 });
      const file = resolve(base, key);
      if (dirname(file) !== folder) return new Response(null, { status: 403 });
      if (request.method === 'PUT') {
        const size = Number(request.headers.get('X-File-Size'));
        if (!Number.isSafeInteger(size) || size <= 0 || size > 100 * 1024 * 1024 || !request.body) return new Response(null, { status: 400 });
        const disk = await statfs(base);
        if (disk.bavail * disk.bsize < size + 64 * 1024 * 1024) return Response.json({ error: 'Недостаточно места в каталоге файлов.' }, { status: 507 });
        temporary = `${file}.upload`;
        let received = 0;
        await pipeline(Readable.fromWeb(request.body), new Transform({ transform(chunk, _encoding, callback) { received += chunk.length; callback(received > size ? new Error('Upload too large') : null, chunk); } }), createWriteStream(temporary, { flags: 'wx' }));
        if (received !== size) throw new Error('Incomplete upload');
        await rename(temporary, file); temporary = undefined;
        return new Response(null, { status: 201 });
      }
      const actual = await realpath(file);
      if (dirname(actual) !== folder) return new Response(null, { status: 403 });
      if (request.method === 'DELETE') { await unlink(actual); return new Response(null, { status: 204 }); }
      const info = await stat(actual);
      if (!info.isFile()) return new Response(null, { status: 404 });
      return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(actual)), { headers: { 'Content-Length': String(info.size) } });
    } catch (error) {
      if (temporary) await unlink(temporary).catch(() => {});
      if (error?.code === 'ENOENT') return new Response(null, { status: 404 });
      if (error?.code === 'ENOSPC') return Response.json({ error: 'Недостаточно места в каталоге файлов.' }, { status: 507 });
      console.error('Pump file storage:', error?.code ?? error?.name, error?.message);
      return Response.json({ error: 'Не удалось сохранить или прочитать файл.' }, { status: 500 });
    }
  };
}
