import { spawn } from 'node:child_process';

export function revealFile(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('explorer.exe', ['/select,', path], { shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
export async function fileLocation(request, path, { allowReveal = false, platform = process.platform, reveal = revealFile } = {}) {
  const canReveal = allowReveal && platform === 'win32';
  if (request.method === 'POST') {
    if (!canReveal) return Response.json({error:'Открытие Проводника доступно только при локальном запуске на Windows.',path,canReveal:false},{status:409});
    await reveal(path);
    return Response.json({opened:true,path,canReveal:true});
  }
  return Response.json({path,canReveal});
}
