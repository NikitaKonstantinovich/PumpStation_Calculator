"""Prepare every STEP in Equipment for the browser; resume by source and mesh SHA-256.

Each conversion runs in a separate hidden process with a timeout. Original CAD
is read-only. Duplicate contents share one STL; unbound models remain available
for manual placement without inventing catalogue IDs or connection ports.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

from model_assets import CONVERTER_VERSION, convert_step, file_hash, load_library, valid_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
CATEGORY_NAMES = {"Pumps": "Насосы", "Piping": "Трубопроводы", "Valves": "Арматура", "Fittings": "Фитинги", "Electrical": "Электрика", "Instrumentation": "КИПиА", "Tanks": "Баки и ёмкости", "Stations": "Установки", "Seals": "Уплотнения", "Fasteners": "Крепёж", "Frames": "Рамы", "FabricatedParts": "Изготовляемые детали", "Ventilation": "Вентиляция"}


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".pending")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, path)


def inventory(root):
    groups, failures = {}, []
    files = sorted(p for p in (root / "Equipment").rglob("*") if p.is_file() and p.suffix.lower() in (".stp", ".step"))
    for index, path in enumerate(files, 1):
        relative = path.relative_to(root).as_posix()
        try:
            if not path.resolve().is_relative_to((root / "Equipment").resolve()):
                raise ValueError("Source is outside Equipment")
            digest = file_hash(path)
            groups.setdefault(digest, []).append(relative)
        except (OSError, ValueError) as error:
            failures.append({"source": relative, "reason": str(error)})
        if index % 200 == 0 or index == len(files):
            print(f"Index {index}/{len(files)}; unique {len(groups)}", flush=True)
    return groups, failures, len(files)


def convert_one(root, output, state, digest, sources, timeout):
    record = state / "records" / (digest + ".json")
    target = output / f"model-{digest}-{CONVERTER_VERSION}.stl"
    if record.exists():
        try:
            previous = json.loads(record.read_text(encoding="utf-8"))
            if previous.get("converterVersion") == CONVERTER_VERSION and valid_stl(target) and file_hash(target) == previous.get("assetHash"):
                return {**previous, "status": "ready", "reused": True}
        except (ValueError, OSError):
            pass  # Interrupted metadata must not permanently block a valid STEP.
    source = root / sources[0]
    started = time.monotonic()
    try:
        # ASCII snapshot paths avoid native CAD readers' Windows path limitations.
        with tempfile.TemporaryDirectory(prefix="cad-", dir=state) as directory:
            folder = Path(directory).resolve()
            if not folder.is_relative_to(state.resolve()):
                raise ValueError("Temporary directory outside preparation state")
            cad, mesh, metadata = folder / "source.step", folder / "mesh.stl", folder / "metadata.json"
            shutil.copyfile(source, cad)
            if file_hash(cad) != digest:
                raise ValueError("STEP changed after inventory; repeat preparation")
            with (folder / "conversion.log").open("w", encoding="utf-8") as log:
                process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--convert-file", str(cad), str(mesh), str(metadata)], stdout=log, stderr=log, timeout=timeout, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            result = json.loads(metadata.read_text(encoding="utf-8")) if metadata.exists() else {}
            if process.returncode or not valid_stl(mesh):
                raise ValueError(result.get("error", "CAD process failed or produced an empty mesh"))
            if file_hash(source) != digest:
                raise ValueError("Source changed during preparation")
            result.update(status="ready", assetHash=file_hash(mesh), bytes=mesh.stat().st_size, seconds=round(time.monotonic()-started, 2), reused=False)
            os.replace(mesh, target)
            atomic_json(record, result)
            return result
    except subprocess.TimeoutExpired:
        return {"status": "error", "reason": f"Превышено время подготовки: {timeout} с", "seconds": round(time.monotonic()-started, 2)}
    except Exception as error:
        return {"status": "error", "reason": str(error), "seconds": round(time.monotonic()-started, 2)}


def make_library(groups, results, failures, total_files):
    models = []
    for digest, sources in groups.items():
        result = results.get(digest, {"status": "pending"})
        categories = sorted({CATEGORY_NAMES.get(Path(path).parts[1], Path(path).parts[1]) for path in sources})
        item = {"id": digest, "name": Path(sources[0]).stem, "source": sources[0], "sources": sources, "categories": categories,
                "sourceHash": digest, "units": "mm", "status": result["status"], "ports": [],
                "mapping": "library_unbound", "warnings": ["Модель для ручной компоновки; соответствие каталогу и монтажные подключения не назначены"]}
        if result["status"] == "ready":
            item.update(bounds=result["bounds"], meshUrl=f"/model-assets/model-{digest}-{CONVERTER_VERSION}.stl", meshHash=result["assetHash"], bytes=result["bytes"])
        elif result["status"] == "error":
            item["error"] = result["reason"]
        models.append(item)
    return {"version": 1, "generatedAt": datetime.now(timezone.utc).isoformat(), "summary": {"sourceFiles": total_files, "uniqueModels": len(models), "duplicates": total_files-len(failures)-len(models), "ready": sum(m["status"] == "ready" for m in models), "errors": sum(m["status"] == "error" for m in models)+len(failures), "pending": sum(m["status"] == "pending" for m in models)}, "inventoryErrors": failures, "models": models}


def update_profiles(root, output, groups, results):
    path = output / "manifest.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"version": 1, "profiles": {}}
    old.setdefault("equipment", {})
    by_source = {source: digest for digest, sources in groups.items() for source in sources}
    for key, profile in load_library(root).items():
        digest = by_source.get(profile["source"])
        result = results.get(digest, {})
        if result.get("status") != "ready":
            continue
        value = {**profile, "sourceHash": digest, "bounds": result["bounds"], "meshUrl": f"/model-assets/model-{digest}-{CONVERTER_VERSION}.stl", "meshHash": result["assetHash"]}
        if profile.get("sourceHash") and profile["sourceHash"] != digest:
            value["warnings"] = profile.get("warnings", []) + ["Исходный STEP изменился; точки подключения требуют повторной проверки"]
            value["ports"] = [{**p, "provisional": True} for p in profile.get("ports", [])]
        if key.startswith("pump:"):
            old["profiles"][key[5:]] = value
        else:
            old["equipment"][key] = value
    atomic_json(path, old)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=FRONTEND / "public/model-assets")
    parser.add_argument("--state", type=Path, default=FRONTEND / ".model-library")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--convert-file", nargs=3)
    args = parser.parse_args()
    if args.convert_file:
        source, target, metadata = map(Path, args.convert_file)
        try:
            info = convert_step(source, target)
            bounds = info["bounds"]
            if not all(math.isfinite(v) and abs(v) < 1e7 for v in bounds) or any(bounds[i+3] <= bounds[i] for i in range(3)):
                raise ValueError("Модель не имеет корректных объёмных габаритов")
            atomic_json(metadata, info)
        except Exception as error:
            atomic_json(metadata, {"error": str(error)})
            raise SystemExit(1)
        return
    if not 1 <= args.workers <= 8 or args.timeout < 1:
        raise SystemExit("Workers must be 1..8 and timeout positive")
    args.state.mkdir(parents=True, exist_ok=True); args.output.mkdir(parents=True, exist_ok=True)
    groups, failures, count = inventory(args.root)
    results = {}
    # Small components first; large assemblies cannot starve the usable library.
    ordered = sorted(groups, key=lambda digest: (args.root / groups[digest][0]).stat().st_size)
    def save():
        library = make_library(groups, results, failures, count)
        atomic_json(args.output / "library.json", library)
        atomic_json(args.state / "progress.json", library["summary"])
        return library["summary"]
    save()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(convert_one, args.root, args.output, args.state, digest, groups[digest], args.timeout): digest for digest in ordered}
        for future in as_completed(futures):
            digest = futures[future]
            try:
                results[digest] = future.result()
            except Exception as error:
                results[digest] = {"status": "error", "reason": str(error)}
            if len(results) % 25 == 0 or len(results) == len(groups):
                summary = save()
                print(f"Prepared {len(results)}/{len(groups)}; ready {summary['ready']}; errors {summary['errors']}", flush=True)
    update_profiles(args.root, args.output, groups, results)
    print(json.dumps(save(), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
