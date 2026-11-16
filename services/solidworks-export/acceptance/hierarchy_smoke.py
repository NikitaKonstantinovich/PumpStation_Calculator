"""Real SOLIDWORKS acceptance: local subassemblies, shared parts, diagnostics and BOM."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prepare


def main():
    parser = argparse.ArgumentParser()
    for arg in ("root", "job", "runner", "template", "part-template"):
        parser.add_argument("--" + arg, type=Path, required=True)
    args = parser.parse_args()
    args.job.mkdir(parents=True, exist_ok=False)
    identity = list(prepare.IDENTITY)
    instances = []
    def add(name, g, transform=None, owner=None, **extra):
        instances.append(dict(id=str(len(instances)+1), componentId=str(len(instances)+1), name=name,
            detailName=name, transform=transform or identity, hidden=False, group="Приёмка",
            geometry=g, **({"subassembly": owner} if owner else {}), **extra))

    collector = dict(id="collector-suction", name="Коллектор всасывающий", transform=[0,1,0,-1,0,0,0,0,1,.8,.4,.3,1,0,0,0])
    main = dict(lengthMm=600, outerMm=114.3, innerMm=108.3)
    branches = [dict(id=f"branch-{i}", componentId="pipe", name=f"Патрубок {i}",
        origin=[x,0,0], axis=[0,1,0], endMm=120, outerMm=60.3, innerMm=54.3) for i,x in enumerate([-150,150])]
    add("Труба коллектора", dict(kind="collector-main", **main, branches=branches), collector["transform"], collector, material="st20")
    for branch in branches:
        add(branch["name"], dict(kind="collector-branch", main=main, branch=branch), collector["transform"], collector, material="st20")
    # Same sgons in distinct ports must use one physical document.
    for i,x in enumerate([-100,100]):
        branch=dict(origin=[x,0,0],axis=[0,0,1],endMm=110,outerMm=21.3,innerMm=16.3,
            blankLengthMm=60,thread=dict(designation="G1/2",pitchMm=1.814,lengthMm=10,depthMm=.5))
        add(f"Сгон КИП {i+1}",dict(kind="collector-branch",main=main,branch=branch),collector["transform"],collector,material="st20")
    flange=dict(kind="flange",lengthMm=20,outerMm=165,innerMm=65,boltCircleMm=125,boltHoles=4,boltHoleMm=18)
    for i,x in enumerate([-.3,.3]):
        local=list(identity); local[9]=x
        add(f"Свободный фланец DN65 PN16 · {i+1}",flange,prepare.compose_transform(collector["transform"],local),collector)
    for i,x in enumerate([1.5,2]):
        transform=list(identity); transform[9]=x
        owner=dict(id=f"insert-{i}",name=f"Вставка {i+1}",transform=transform)
        add(f"Труба вставки · {i+1}",dict(kind="tube",lengthMm=200,outerMm=60.3,innerMm=54.3),transform,owner,material="st20")
        add(f"Свободный фланец DN65 PN16 · {i+1}",flange,transform,owner)
    for i,where in enumerate(["насоса 1","насоса 2","левой стойки","правой стойки"]):
        transform=list(identity); transform[9]=i*.15; transform[11]=.7
        add(f"Болт M16×130 DIN 933 Ц для {where}",dict(kind="rod",hardware="bolt",nominalMm=16,lengthMm=130,outerMm=16,headMm=10,flatsMm=24),transform)
    assets=json.loads((args.root/"frontend/data/valve-control-mounts.json").read_text("utf-8"))
    for i,where in enumerate(["левой стойки","правой стойки"]):
        transform=list(identity);transform[9]=i*.2;transform[11]=.9
        add(f"Гайка-заклёпка RIVKLE 34355080130 M8 для {where}",dict(kind="rivet-nut",hardware="rivet-nut",nominalMm=8,
            headLengthMm=1.5,headOuterMm=16,bodyLengthMm=16,bodyOuterMm=11,innerMm=8),transform)
    for i in range(2):
        transform=list(identity); transform[9]=i*.2; transform[11]=.8
        add("Концевой выключатель TZ-8111 · "+("открыто" if i==0 else "закрыто"),dict(kind="native",hash=assets["switch"]["sourceHash"]),transform)
    payload=dict(manifest=dict(instances=instances))
    (args.job/"request.json").write_text(json.dumps(payload,ensure_ascii=False),"utf-8")
    prepare.prepare(args.root,args.job)
    resolved=json.loads((args.job/"resolved.json").read_text("utf-8"))
    assert not resolved["omissions"], resolved["omissions"]
    subprocess.run([str(args.runner),str(args.job),str(args.template),str(args.part_template)],check=True)
    verify=json.loads((args.job/"verification.json").read_text("utf-8-sig"))
    assert verify["count"]==len(instances)
    assert not json.loads((args.job/"runner-omissions.json").read_text("utf-8-sig"))
    rows=verify["instances"]
    def files(prefix): return {r["file"] for r in rows if r["name"].startswith(prefix)}
    for prefix in ["Патрубок","Сгон","Свободный фланец","Труба вставки","Болт","Концевой","Гайка-заклёпка"]:
        assert len(files(prefix))==1,(prefix,files(prefix))
    assert len(list((args.job/"snapshot").glob("*.SLDASM")))==4
    bom=json.loads((args.job/"bill-of-materials.json").read_text("utf-8-sig"))
    assert bom["complete"] and sum(p["quantity"] for p in bom["items"])==len(instances)
    diagnostics=json.loads((args.job/"import-diagnostics.json").read_text("utf-8-sig"))
    assert any(d["attempted"] for d in diagnostics)
    assert all(d["faultsAfter"]==0 and d["solids"]>0 for d in diagnostics)
    print(f"PASS: {len(instances)} instances, {len(bom['items'])} shared parts, 3 subassemblies, diagnostics and BOM",flush=True)
    # Import a real nested native assembly and ensure diagnostics never write to its sources.
    nested=args.job/"nested-import";nested.mkdir()
    sources={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in (args.job/"snapshot").iterdir() if p.is_file()}
    source=next(p for p in sources if p.suffix.lower()==".sldasm" and p.name.startswith("Коллектор"))
    part=dict(id="nested",name="Импортированная подсборка",detailName="Импортированная подсборка",path=str(source),
        documentKey=sources[source],sourceHash=sources[source],transform=identity,hidden=False,origin="library")
    (nested/"resolved.json").write_text(json.dumps(dict(instances=[part])),"utf-8")
    subprocess.run([str(args.runner),str(nested),str(args.template),str(args.part_template)],check=True)
    assert not json.loads((nested/"runner-omissions.json").read_text("utf-8-sig"))
    nested_diagnostics=json.loads((nested/"import-diagnostics.json").read_text("utf-8-sig"))
    assert len(nested_diagnostics)>=4 and all(d["faultsAfter"]==0 for d in nested_diagnostics)
    assert all(hashlib.sha256(p.read_bytes()).hexdigest()==digest for p,digest in sources.items())
    print("PASS: nested native assembly diagnosed; catalogue source hashes unchanged",flush=True)


if __name__=="__main__": main()
