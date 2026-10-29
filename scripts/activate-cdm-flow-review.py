"""Activate only verified CDM drafts, preserving unrelated manifest entries."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def activate(directory, root):
    corrections=json.loads((directory/'corrections.json').read_text(encoding='utf8'))
    verification=json.loads((directory/'verification.json').read_text(encoding='utf8'))
    verified={r['sourceHash'] for r in verification if r['status']=='verified'}
    if verified!={r['sourceHash'] for r in corrections} or len(verification)!=len(corrections):
        raise ValueError('Not every corrected STEP was verified')
    before=json.loads((directory/'manifest-before.json').read_text(encoding='utf8'))
    draft=json.loads((directory/'manifest-draft.json').read_text(encoding='utf8'))
    registry=json.loads((directory/'registry-draft.json').read_text(encoding='utf8'))
    target=root/'frontend/public/model-assets/manifest.json'
    current_raw=target.read_bytes();current=json.loads(current_raw)
    for entry in registry['models']:
        pid=entry['pumpId'];profile=draft['profiles'][pid]
        if current['profiles'].get(pid) not in (before['profiles'][pid],profile):
            raise ValueError(f'CDM profile {pid} changed concurrently; preserved')
        if digest(root/profile['source'])!=profile['sourceHash']:
            raise ValueError(f'STEP checksum failed: {pid}')
        if digest(root/'frontend/public'/profile['meshUrl'].lstrip('/'))!=profile['meshHash']:
            raise ValueError(f'STL checksum failed: {pid}')
        current['profiles'][pid]=profile
    registry_path=root/'frontend/data/cdm-flow-registry.json'
    registry_bytes=(directory/'registry-draft.json').read_bytes()
    if registry_path.exists() and registry_path.read_bytes()!=registry_bytes:
        raise ValueError('Existing CDM registry differs; preserved')
    if target.read_bytes()!=current_raw:raise ValueError('Manifest changed concurrently')
    registry_path.write_bytes(registry_bytes)
    temporary=target.with_name('manifest.cdm-pending.json')
    temporary.write_text(json.dumps(current,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    temporary.replace(target)
    result={'reviewedProfiles':len(registry['models']),'correctedCopies':len(corrections),
            'registryHash':digest(registry_path),'manifestHash':digest(target)}
    (directory/'activation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    args=parser.parse_args();activate(args.directory,args.root)
