"""Prepare the Dendor DN50–80 bracket and official EKF TZ-8111 for the editor.

Only these assets and their index entries are changed. Native CAD is read-only;
the bracket uses its saved display mesh, not an inferred replacement solid.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path

from model_assets import file_hash, run_cad_command
from native_display_models import display_stl

FRONTEND = Path(__file__).resolve().parents[1]
ROOT = FRONTEND.parent
BRACKET = "Equipment/FabricatedParts/3D/Кронштейны/Кронштейн концевых выключателей для Dendor 017W Dn50-80.SLDPRT"
SWITCH = "Equipment/Instrumentation/3D/Концевые выключатели/Концевой выключатель TZ-8111 PROxima EKF.step"
SOURCE_URL = "https://ekf.market/uploads/products/A284C358836C944D4C3FC62CF63060DC.step"
PRODUCT_URL = "https://ekfgroup.com/ru/catalog/products/koncevoj-vyklyuchatel-tz-8111-ekf-proxima"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cadmpeg", type=Path, required=True)
    args = parser.parse_args()
    output, state = FRONTEND / "public/model-assets", FRONTEND / ".model-library"
    audit = ROOT / "work/limit-switch-models-2026-10-29"
    audit.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location("equipment_batch", FRONTEND / "scripts/prepare-equipment-library.py")
    batch = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(batch)
    original_hash = file_hash(ROOT / BRACKET)
    cadir = audit / "bracket-display.cadir.json"
    with (audit / "bracket-display.log").open("w", encoding="utf-8") as log:
        code = run_cad_command([str(args.cadmpeg.resolve()), "dump", str(ROOT / BRACKET), "-o", str(cadir), "--force"], log, 60)
    if code:
        raise ValueError("Cannot decode bracket: see bracket-display.log")
    if file_hash(ROOT / BRACKET) != original_hash:
        raise ValueError("Native source changed during preparation")
    mesh = output / f"model-{original_hash}-v1.stl"
    bounds = display_stl(json.loads(cadir.read_text(encoding="utf-8")), mesh)
    bracket = {"id": original_hash, "name": "Кронштейн концевых выключателей Dendor 017W DN50–80",
        "source": BRACKET, "sources": [BRACKET], "sourceHash": original_hash,
        "categories": ["Изготовляемые детали", "Концевые выключатели"], "units": "mm", "status": "ready",
        "bounds": bounds, "meshUrl": f"/model-assets/{mesh.name}", "meshHash": file_hash(mesh), "bytes": mesh.stat().st_size,
        "ports": [], "mapping": "native_display_mesh",
        "warnings": ["Сохранённая сетка исходной детали SolidWorks, мм; точность исходной визуализации",
                     "Обычная версия кронштейна DN50–80; монтаж выполняется вручную"],
        "conversion": {"method": "cadmpeg CADIR shaded_strips to binary STL", "cadirHash": file_hash(cadir)}}
    native_path = ROOT / "Equipment/native-display-library.json"
    native = json.loads(native_path.read_text(encoding="utf-8")) if native_path.exists() else {"version": 1, "models": []}
    native["models"] = [m for m in native["models"] if m["source"] != BRACKET] + [bracket]
    batch.atomic_json(native_path, native)

    digest = file_hash(ROOT / SWITCH)
    result = batch.convert_one(ROOT, output, state, digest, [SWITCH], 60)
    if result["status"] != "ready":
        raise ValueError(result)
    switch = batch.make_library({digest: [SWITCH]}, {digest: result}, [], 1)["models"][0]
    switch["categories"].append("Концевые выключатели")
    switch["warnings"] = ["Официальная STEP-модель EKF TZ-8111; размещение и крепление выполняются вручную"]
    switch["provenance"] = {"productUrl": PRODUCT_URL, "downloadUrl": SOURCE_URL}

    # Exact catalogue link for TZ-8111 only. Bracket remains a manual library
    # model: the converter's native inputs and mounting poses are not guessed.
    registry_path = ROOT / "Equipment/model-library.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    key = "equipment:кипиа-004-r0028"
    registry["models"] = [m for m in registry["models"] if m["key"] != key] + [{
        "key": key, "source": SWITCH, "sourceHash": digest, "units": "mm", "ports": [],
        "mapping": "manufacturer_exact_model", "warnings": switch["warnings"], "provenance": switch["provenance"]}]
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    batch.update_profiles(ROOT, output, {digest: [SWITCH]}, {digest: result})

    path = output / "library.json"
    library = json.loads(path.read_text(encoding="utf-8"))
    for model in (bracket, switch):
        existing = next((i for i, m in enumerate(library["models"]) if m["id"] == model["id"]), None)
        if existing is None:
            library["models"].append(model)
            library["summary"]["sourceFiles"] += 1
        else:
            library["models"][existing] = model
    library["generatedAt"] = datetime.now(timezone.utc).isoformat()
    summary = library["summary"]
    summary["uniqueModels"] = len(library["models"])
    for status, field in (("ready", "ready"), ("error", "errors"), ("pending", "pending")):
        summary[field] = sum(m["status"] == status for m in library["models"]) + (len(library.get("inventoryErrors", [])) if status == "error" else 0)
    batch.atomic_json(path, library)
    print(json.dumps({"models": [{"name": m["name"], "id": m["id"], "bounds": m["bounds"], "bytes": m["bytes"]} for m in (bracket, switch)]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
