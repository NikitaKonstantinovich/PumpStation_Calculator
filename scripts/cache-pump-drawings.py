"""Cache the drawing URLs explicitly present in the imported pump catalogue."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path
from urllib.parse import urlparse, urlsplit, urlunsplit, quote

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/pump-catalog/remote-drawings.json'


def fetch(url):
    if urlparse(url).hostname not in {'onis.ru', 'www.onis.ru', 'vandjord.com', 'www.vandjord.com'}:
        return url, {'error': 'Source drawing host is not supported'}
    try:
        parts = urlsplit(url)
        request_url = urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe='/%:@'), parts.query, parts.fragment))
        if os.name == 'nt':
            # Schannel uses the Windows trust store; do not disable TLS verification.
            response = subprocess.run(['curl.exe', '--fail', '--location', '--silent', '--show-error',
                                       '--proto', '=https', '--proto-redir', '=https', '--max-time', '25',
                                       '--max-filesize', str(10 * 1024 * 1024), request_url], capture_output=True, timeout=30)
            if response.returncode:
                raise ValueError(response.stderr.decode('utf-8', errors='replace').strip())
            content = response.stdout
        else:
            req = urllib.request.Request(request_url, headers={'User-Agent': 'Mozilla/5.0 PumpCatalogueImport/1.0'})
            with urllib.request.urlopen(req, timeout=20) as response:
                content = response.read(10 * 1024 * 1024 + 1)
        if len(content) > 10 * 1024 * 1024:
            raise ValueError('Drawing exceeds 10 MiB')
        if content.startswith(b'\x89PNG\r\n\x1a\n'):
            suffix = '.png'
        elif content.startswith(b'\xff\xd8\xff'):
            suffix = '.jpg'
        elif content.startswith(b'RIFF') and content[8:12] == b'WEBP':
            suffix = '.webp'
        else:
            raise ValueError('Response is not a supported image')
        sha = hashlib.sha256(content).hexdigest()
        relative = '/reference-pump-assets/' + sha[:20] + suffix
        path = ROOT / 'public' / relative.lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(content)
        return url, {'path': relative, 'sha256': sha}
    except Exception as exc:
        return url, {'error': str(exc)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--retry-pattern', help='Retry only errors matching this expression')
    args = parser.parse_args()
    pumps = json.loads((ROOT / 'public/pumps.json').read_text(encoding='utf-8'))
    urls = sorted(set(p['drawing'] for p in pumps if str(p.get('drawing', '')).startswith('http')))
    results = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    pending = [url for url in urls if not results.get(url, {}).get('path')]
    if args.retry_pattern:
        pending = [url for url in pending if re.search(args.retry_pattern, results.get(url, {}).get('error', ''))]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(fetch, url) for url in pending]
        for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
            url, result = future.result()
            results[url] = result
            if i % 50 == 0:
                MANIFEST.write_text(json.dumps(results, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
                print(f'Processed {i}/{len(pending)} drawing URLs', flush=True)
    MANIFEST.write_text(json.dumps(results, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'urls': len(results), 'cached': sum('path' in r for r in results.values()),
                      'failed': sum('error' in r for r in results.values())}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
