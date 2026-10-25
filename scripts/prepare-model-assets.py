"""Prepare browser copies of the existing normalized STEP library; never edits source CAD.

Index only: python scripts/prepare-model-assets.py
Meshes:    python scripts/prepare-model-assets.py --pump-id 9 90 318
Use an environment with cadquery-ocp installed for mesh generation (--all is optional).
The generated manifest/assets are committed so production needs neither Python nor STEP files.
"""
import argparse
import json
import re
from pathlib import Path
from model_assets import load_library, source_path, file_hash, convert_step, valid_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
LIBRARY = ROOT / "Equipment/Pumps/3D_Normalized"
OUTPUT = FRONTEND / "public/model-assets"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pump-id", nargs="*", default=[])
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    selected = {key.removeprefix("pump:"): value for key, value in load_library(ROOT).items() if key.startswith("pump:")}
    unknown = set(args.pump_id) - set(selected)
    if unknown:
        raise SystemExit("No normalized model for pump IDs: " + ", ".join(sorted(unknown)))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    profiles = {}
    for pump_id, item in sorted(selected.items()):
        profile = dict(item)
        source = source_path(ROOT, item["source"])
        digest = file_hash(source)
        profile["sourceHash"] = digest
        filename = "pump-" + pump_id + "-" + digest[:12] + ".stl"
        old = previous.get("profiles", {}).get(pump_id, {})
        old_url = old.get("meshUrl", "")
        if old.get("sourceHash") == digest and re.fullmatch(r"/model-assets/[a-zA-Z0-9_-]+\.stl", old_url):
            old_target = OUTPUT / old_url.split("/")[-1]
            if valid_stl(old_target) and (not old.get("meshHash") or file_hash(old_target) == old["meshHash"]):
                filename = old_target.name
                if old.get("meshHash"):
                    profile["meshHash"] = old["meshHash"]
        target = OUTPUT / filename
        if (args.all or pump_id in args.pump_id) and not valid_stl(target):
            temporary = target.with_suffix(".pending.stl")
            try:
                metadata = convert_step(source, temporary)
                if file_hash(source) != digest:
                    raise ValueError("Source changed during conversion")
                temporary.replace(target)
                profile["bounds"] = metadata["bounds"]
            finally:
                temporary.unlink(missing_ok=True)
            print("Prepared", pump_id, target.name, target.stat().st_size, "bytes", flush=True)
        if valid_stl(target):
            profile["meshUrl"] = "/model-assets/" + filename
        profiles[pump_id] = profile
    (OUTPUT / "manifest.json").write_text(json.dumps({"version": 1, "profiles": profiles, "equipment": previous.get("equipment", {})}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Profiles:", len(profiles), "meshes:", sum("meshUrl" in p for p in profiles.values()), flush=True)


if __name__ == "__main__":
    main()
