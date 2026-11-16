"""Merge a reviewed batch of pump mounting heights without changing pump identities."""
import argparse
import copy
import hashlib
import json
import math
import runpy
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[2]
IDENTITY = ("variantId", "modelId", "designation", "article", "manufacturer", "series", "motor")
fastener_rules = runpy.run_path(str(Path(__file__).with_name("prepare-pump-fasteners.py")))
bolt_for_bore = fastener_rules["bolt"]
cad_reference_message = fastener_rules["cad_reference_message"]

def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def positive(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0

def check_source(source):
    path = (ROOT / source["path"]).resolve(strict=True)
    if not path.is_relative_to(ROOT) or hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError(f"Reviewed source changed or is outside the workspace: {path}")
    for key in ("catalogue", "drawing", "normalization", "stepCheck", "originalStep", "generalCatalogueConflict"):
        linked = source.get(key)
        if isinstance(linked, dict) and "path" in linked and "sha256" in linked:
            check_source(linked)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("records", type=Path, nargs="+")
    parser.add_argument("--version", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    reviewed_path = APP/"data/pump-fastener-dimension-reviews.json"
    generated_path = APP/"data/pump-fasteners-reviewed.json"
    reviewed = read(reviewed_path)
    generated = read(generated_path)
    base = {row["variantId"]:row for row in read(APP/"data/pump-mountings-reviewed.json")["rows"]}
    current = {row["variantId"]:row for row in generated["rows"]}
    recorded = {row["variantId"]:row for row in reviewed["rows"]}
    count_before = sum(positive((row.get("fasteners") or {}).get("clampHeightMm")) for row in current.values())
    seen, added, references = set(), [], []
    for file in args.records:
        for entry in read(file)["records"]:
            key = entry["variantId"]
            if key in seen:
                raise ValueError(f"Duplicate review in input: {key}")
            seen.add(key)
            identity = {k:base[key][k] for k in IDENTITY}
            row = current[key]
            for field in IDENTITY:
                if identity[field] != row[field] or field in entry and identity[field] != entry[field]:
                    raise ValueError(f"Execution identity mismatch in {key}: {field}")
            source = copy.deepcopy(entry["evidence"])
            if not source.get("kind") or not source.get("scope"):
                raise ValueError(f"No explicit evidence scope: {key}")
            check_source(source)
            old = row.get("fasteners") or {}
            old_height = old.get("clampHeightMm")
            cad_only = entry.get("mode") == "cad_reference_only"
            previous_review = recorded.get(key)
            replaces_mode = entry.get("replacesMode")
            replaces_height = entry.get("replacesClampHeightMm")
            replaces_bore = entry.get("replacesHoleDiameterMm")
            if replaces_height is not None:
                if (cad_only or replaces_mode is not None or replaces_bore is not None
                        or row.get("mounting") or base[key].get("mounting")
                        or not positive(replaces_height) or old_height != replaces_height
                        or not previous_review or previous_review.get("fasteners", {}).get("clampHeightMm") != replaces_height
                        or not source.get("ownerDecision") or entry.get("clampHeightMm") == replaces_height
                        or "holeDiameterMm" in entry or "holeCount" in entry):
                    raise ValueError(f"Expected an approved correction of only the established height for {key}")
                source["previousHeightReview"] = {"clampHeightMm":old_height, "evidence":previous_review["evidence"]}
            elif positive(old_height):
                raise ValueError(f"A height is already established for {key}")
            elif replaces_bore is not None:
                diameter = entry.get("holeDiameterMm")
                if (cad_only or replaces_mode is not None or row.get("mode") or previous_review is not None
                        or row.get("mounting") or base[key].get("mounting") or row["status"] != "diameter_only"
                        or not positive(replaces_bore) or old.get("holeDiameterMm") != replaces_bore
                        or not positive(diameter) or diameter == replaces_bore or not bolt_for_bore(diameter)
                        or entry.get("clampHeightMm") is not None or "holeCount" in entry or not source.get("ownerDecision")):
                    raise ValueError(f"Expected an approved correction of only the established bore for {key}")
                source["previousHoleEvidence"] = row.get("evidence")
            elif replaces_mode is not None:
                if (cad_only or replaces_mode != "cad_reference_only" or row.get("mode") != replaces_mode
                        or not previous_review or previous_review.get("mode") != replaces_mode or not source.get("ownerDecision")):
                    raise ValueError(f"Expected an approved replacement of an existing CAD reference for {key}")
                source["previousCadReference"] = previous_review["evidence"]
            elif previous_review is not None:
                raise ValueError(f"Do not overwrite an existing explicit review: {key}")
            if replaces_bore is not None:
                facts = {**old, "holeDiameterMm":diameter, "boltDiameterMm":bolt_for_bore(diameter)}
                status, missing = row["status"], row["missing"]
            elif cad_only:
                if entry.get("clampHeightMm") is not None or not source.get("referenceDimensionsMm"):
                    raise ValueError(f"Expected reference dimensions only for {key}")
                if row.get("mounting"):
                    raise ValueError(f"Reference would replace a mounting review: {key}")
                if old.get("holeDiameterMm") is not None:
                    source["previousHoleEvidence"] = row.get("evidence")
                facts = {**old, "clampHeightMm":None}
                status = row["status"]
                missing = [*row["missing"], cad_reference_message(source)]
                references.append(key)
            else:
                height = entry["clampHeightMm"]
                if not positive(height):
                    raise ValueError(f"Expected a positive mounting height for {key}")
                diameter, count = entry.get("holeDiameterMm"), entry.get("holeCount")
                if diameter is not None and not positive(diameter) or count is not None and (type(count) is not int or count <= 0):
                    raise ValueError(f"Invalid hole details for {key}")
                for field, value in (("holeDiameterMm", diameter), ("holeCount", count)):
                    if old.get(field) is not None and value is not None and old[field] != value:
                        raise ValueError(f"Conflicting {field} for {key}: {old[field]} / {value}")
                if diameter is None:
                    diameter = old.get("holeDiameterMm")
                    if diameter is not None and row.get("evidence"):
                        source["previousHoleEvidence"] = row["evidence"]
                thread = bolt_for_bore(diameter)
                if replaces_height is not None:
                    facts = {**old, "clampHeightMm":height}
                    status, missing = row["status"], row["missing"]
                else:
                    facts = {"holeCount":count if count is not None else old.get("holeCount"),
                             "holeDiameterMm":diameter,"boltDiameterMm":thread,"clampHeightMm":height}
                    status = "dimensions_ready" if thread else "height_only"
                    missing = [] if thread else ["Нет подтверждённого диаметра крепёжного болта"]
                    if not row.get("mounting") and base[key]["status"] != "catalogue_grid":
                        missing.append("Применимость монтажной сетки на раме 410 мм не проверена")
                    added.append(key)
            review = {**identity,"mounting":row.get("mounting"),"fasteners":facts,"evidence":source,
                      **({"mode":"cad_reference_only"} if cad_only else {})}
            recorded[key] = review
            if replaces_mode is not None:
                row.pop("mode")
            row.update(review,status=status,missing=missing)
    generated["version"] = args.version
    reviewed["version"] = args.version
    reviewed["rows"] = list(recorded.values())
    print(json.dumps({"previous":count_before,"added":len(added),"known":count_before+len(added),"references":len(references)}))
    if args.apply:
        for path, value in ((reviewed_path,reviewed),(generated_path,generated)):
            staged = path.with_suffix(".json.tmp")
            staged.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
            staged.replace(path)

if __name__ == "__main__":
    main()
