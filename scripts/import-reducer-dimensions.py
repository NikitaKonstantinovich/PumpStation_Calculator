"""Add verified reducer dimensions to an existing local D1, without repricing.

Source revision, material and all four physical dimensions must match. Existing
dimensions from other sources are preserved for manual review. Always backs up
the database before applying the transactional, repeatable enrichment.
"""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import sqlite3

LENGTH_COLUMN = "CALC_INSERT_LENGTH_MM"
SOURCE_COLUMN = "CALC_INSERT_LENGTH_SOURCE"
DIMENSIONS = {"Диаметр, мм": "outerDiameter", "Диаметр меньший, мм": "outerDiameterSmall", "Толщина 1, мм": "wallThickness", "Толщина 2, мм": "wallThicknessSmall"}
REVIEW_COLUMNS = {"status": "CALC_INSERT_LENGTH_STATUS", "reason": "CALC_INSERT_LENGTH_REVIEW", "options": "CALC_INSERT_LENGTH_OPTIONS", "source": "CALC_INSERT_LENGTH_REVIEW_SOURCE", "checkedAt": "CALC_INSERT_LENGTH_CHECKED_AT"}
LENGTH_PATTERN = re.compile(r"^(?:Строительная )?Длина(?: перехода| детали)?, мм$", re.I)


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def reference_maps(standards):
    lengths, reviews = {}, {}
    for reference in standards.get("reducerLengths", []):
        if not isinstance(reference, dict):
            raise ValueError("Invalid sourced reducer length")
        source_id = reference.get("componentId")
        if (not isinstance(source_id, str) or not source_id or source_id in lengths
                or reference.get("material") not in ["st20", "aisi304"] or (reference.get("geometry") and reference["geometry"] not in ["eccentric", "concentric"])
                or not all(positive(reference.get(key)) for key in [*DIMENSIONS.values(), "lengthMm"])
                or not isinstance(reference.get("source"), str) or not reference["source"].strip()):
            raise ValueError(f"Invalid or duplicate sourced reducer length: {source_id}")
        lengths[source_id] = reference
        if reference.get("basis") == "adopted-standard-geometry":
            policy = standards.get("reducerLengthPolicy", {})
            groups = standards.get("referenceGroups", [])
            if (not policy.get("id") or reference.get("adoptionId") != policy["id"] or policy.get("standard") != reference.get("standard")
                    or reference["material"] not in policy.get("materials", []) or not policy.get("source")
                    or not any(group["execution"] == reference.get("execution") and group["outerDiameter"] == reference["outerDiameter"]
                               and group["outerDiameterSmall"] == reference["outerDiameterSmall"] and group["lengthMm"] == reference["lengthMm"]
                               and [reference["wallThickness"], reference["wallThicknessSmall"]] in group["wallPairs"] for group in groups)):
                raise ValueError(f"Invalid adopted reducer geometry: {source_id}")
    for review in standards.get("reducerLengthReviews", []):
        if not isinstance(review, dict):
            raise ValueError("Invalid reducer review")
        source_id, candidates = review.get("componentId"), review.get("candidateLengthsMm")
        if (not isinstance(source_id, str) or not source_id or source_id in reviews
                or review.get("material") not in ["st20", "aisi304"] or review.get("geometry") not in ["eccentric", "concentric"]
                or not all(positive(review.get(key)) for key in DIMENSIONS.values())
                or review.get("status") not in ["confirmed", "ambiguous", "unconfirmed", "invalid"]
                or not isinstance(candidates, list) or not all(positive(value) for value in candidates)
                or len(set(candidates)) != len(candidates)
                or (review["status"] == "confirmed" and len(candidates) != 1)
                or (review["status"] == "ambiguous" and len(candidates) < 2)
                or not isinstance(review.get("reason"), str) or not review["reason"].strip()
                or not isinstance(review.get("source"), str) or not review["source"].strip()
                or not isinstance(review.get("verifiedAt"), str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", review["verifiedAt"])):
            raise ValueError(f"Invalid or duplicate reducer review: {source_id}")
        length = lengths.get(source_id)
        if review["status"] == "confirmed" and (not length or length["lengthMm"] not in candidates
                or any(review[key] != length[key] for key in ["material", *DIMENSIONS.values()])
                or (length.get("geometry") and review["geometry"] != length["geometry"])):
            raise ValueError(f"Reducer review contradicts or lacks verified length: {source_id}")
        reviews[source_id] = review
    return lengths, reviews


def physical_match(family, values, reference):
    material = "aisi304" if re.search(r"AISI\s*304", family, re.I) else "st20" if re.search(r"(?:сталь|ст[.\s]*)\s*20", family, re.I) else None
    geometry = "eccentric" if re.search("эксцентр", family, re.I) else "concentric" if re.search("концентр", family, re.I) else None
    if reference.get("material") != material or (reference.get("geometry") and reference["geometry"] != geometry):
        return False
    try:
        return all(positive(reference.get(key)) and abs(float(str(values.get(label, "")).replace(",", ".")) - reference[key]) < 0.001 for label, key in DIMENSIONS.items())
    except (TypeError, ValueError):
        return False


def numeric_match(family, values, reference):
    if not physical_match(family, values, reference):
        return False
    name = str(values.get("Наименование", family))
    if reference.get("basis") == "adopted-standard-geometry":
        return reference.get("standard") == "ГОСТ 17378-2001" and bool(reference.get("geometry")) and "12Х18Н10Т" not in name.upper()
    if reference["material"] == "st20":
        return bool(re.search(r"ГОСТ\s*17378(?:[-\s]|$)", name, re.I))
    if reference["material"] != "aisi304" or not reference.get("geometry") or not isinstance(reference.get("standard"), str) or not reference["standard"].strip() or "12Х18Н10Т" in name.upper():
        return False
    native = re.findall(r"(?:ГОСТ|DIN|EN|ISO)\s*\d+(?:[-.]\d+)*", f"{name} {values.get('Стандарт', '')}", re.I)
    normalized = lambda value: re.sub(r"\s+", "", value.upper())
    return any(normalized(value) == normalized(reference["standard"]) for value in native)


def write_field(db, component_id, family_id, column, label, value, kind="text"):
    attribute = db.execute("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?", (family_id, column)).fetchone()
    if not attribute:
        db.execute("INSERT INTO attribute_definitions(family_id,source_column,key,label,header_path_json,data_type,unit) VALUES(?,?,?,?,?,?,?)", (family_id, column, column, label, json.dumps([label], ensure_ascii=False), kind, "мм" if kind == "number" else None))
        attribute = db.execute("SELECT id FROM attribute_definitions WHERE family_id=? AND source_column=?", (family_id, column)).fetchone()
    expected = (kind, value if kind == "number" else None, value if kind == "text" else None, None, None, None)
    existing = db.execute("SELECT value_type,numeric_value,text_value,boolean_value,date_value,json_value FROM component_attribute_values WHERE component_id=? AND attribute_definition_id=?", (component_id, attribute[0])).fetchone()
    if existing == expected:
        return False
    db.execute("""INSERT INTO component_attribute_values(component_id,attribute_definition_id,value_type,numeric_value,text_value)
        VALUES(?,?,?,?,?) ON CONFLICT(component_id,attribute_definition_id) DO UPDATE SET
        value_type=excluded.value_type,numeric_value=excluded.numeric_value,text_value=excluded.text_value,boolean_value=NULL,date_value=NULL,json_value=NULL""", (component_id, attribute[0], kind, expected[1], expected[2]))
    return True


def review_fields(review):
    candidates = [int(value) if float(value).is_integer() else value for value in sorted(review["candidateLengthsMm"])]
    return [(REVIEW_COLUMNS["status"], "Статус длины", review["status"]), (REVIEW_COLUMNS["reason"], "Проверка длины", review["reason"]),
            (REVIEW_COLUMNS["options"], "Варианты длины по источнику, мм", json.dumps(candidates, separators=(",", ":"))),
            (REVIEW_COLUMNS["source"], "Источник проверки длины", review["source"]), (REVIEW_COLUMNS["checkedAt"], "Дата проверки длины", review["verifiedAt"])]


def display(value):
    if value is None:
        return "null"
    if isinstance(value, (int, float)) and not isinstance(value, bool) and float(value).is_integer():
        return str(int(value))
    return str(value)


def import_dimensions(db, standards):
    lengths, reviews = reference_maps(standards)
    updated, unchanged, audit_updated, audit_unchanged, skipped = 0, 0, 0, 0, []
    db.execute("BEGIN IMMEDIATE")
    try:
        # Active import and its revision are read under the same lock as writes.
        active = db.execute("SELECT id,source_sha256 FROM catalog_imports WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1").fetchone()
        if not active:
            raise ValueError("No active catalogue import. Import the workbook catalogue first.")
        if active[1] != standards["sourceSha256"]:
            raise ValueError("Workbook revision does not match the verified reducer mapping; no dimensions were written.")
        for source_id in dict.fromkeys([*lengths, *reviews]):
            reference, review = lengths.get(source_id), reviews.get(source_id)
            matches = db.execute("""SELECT c.id,f.id,f.title FROM components c
                JOIN component_families f ON f.id=c.family_id JOIN component_catalogs cat ON cat.id=f.catalog_id
                WHERE cat.import_id=? AND cat.source_id='переходы' AND c.source_id=? AND c.is_active=1""", (active[0], source_id)).fetchall()
            if len(matches) != 1:
                skipped.append({"componentId": source_id, "reason": "missing or ambiguous active component"})
                continue
            component_id, family_id, family = matches[0]
            rows = db.execute("""SELECT a.source_column,a.header_path_json,v.numeric_value,v.text_value FROM component_attribute_values v
                JOIN attribute_definitions a ON a.id=v.attribute_definition_id WHERE v.component_id=?""", (component_id,)).fetchall()
            values = {json.loads(header)[-1]: numeric if numeric is not None else text for _, header, numeric, text in rows if json.loads(header)}
            if review and not physical_match(family, values, review):
                skipped.append({"componentId": source_id, "reason": "material, geometry or physical dimensions differ from review"})
                continue
            approved = reference if reference and numeric_match(family, values, reference) and (not review or review["status"] == "confirmed") else None
            if not review and not approved:
                skipped.append({"componentId": source_id, "reason": "material, standard, geometry or physical dimensions differ from verified mapping"})
                continue
            other_lengths = [(column, header, number, text) for column, header, number, text in rows if column != LENGTH_COLUMN and json.loads(header) and LENGTH_PATTERN.match(json.loads(header)[-1])]
            native_values = [number if number is not None else text for _, _, number, text in other_lengths]
            effective_review = review
            if review and native_values:
                try:
                    native_confirmed = review["status"] == "confirmed" and all(float(str(value).replace(",", ".")) in review["candidateLengthsMm"] for value in native_values)
                except (TypeError, ValueError):
                    native_confirmed = False
                if not native_confirmed:
                    effective_review = {**review, "status": "invalid", "reason": f"Сохранена длина другого источника ({', '.join(display(value) for value in native_values)} мм); она не подтверждается этой проверкой. Требуется уточнение. {review['reason']}"}
            elif review and review["status"] == "confirmed" and not approved:
                effective_review = {**review, "status": "invalid", "reason": f"Подтверждение длины не прошло проверку исходного исполнения и числового справочника. Требуется уточнение. {review['reason']}"}
            if other_lengths:
                skipped.append({"componentId": source_id, "reason": "existing length from a different source is preserved; review required if values conflict"})
            numeric_changed = False
            if review and (not approved or other_lengths):
                # Only previously managed values, and only in exact review scope.
                numeric_changed = db.execute("DELETE FROM component_attribute_values WHERE component_id=? AND attribute_definition_id IN (SELECT id FROM attribute_definitions WHERE source_column IN (?,?))", (component_id, LENGTH_COLUMN, SOURCE_COLUMN)).rowcount > 0
            if approved and not other_lengths:
                number_changed = write_field(db, component_id, family_id, LENGTH_COLUMN, "Длина, мм", approved["lengthMm"], "number")
                source_changed = write_field(db, component_id, family_id, SOURCE_COLUMN, "Источник длины", approved["source"])
                numeric_changed = number_changed or source_changed
                if not numeric_changed:
                    unchanged += 1
            if numeric_changed:
                updated += 1
            if effective_review:
                changes = [write_field(db, component_id, family_id, column, label, value) for column, label, value in review_fields(effective_review)]
                if any(changes):
                    audit_updated += 1
                else:
                    audit_unchanged += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"updated": updated, "unchanged": unchanged, "auditUpdated": audit_updated, "auditUnchanged": audit_unchanged, "skipped": skipped}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--standards", type=Path, default=Path(__file__).resolve().parents[1] / "data/component-insert-standards.json")
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    standards = json.loads(args.standards.read_text(encoding="utf-8"))
    with sqlite3.connect(path.as_uri() + "?mode=rw", uri=True, timeout=30) as db:
        db.execute("PRAGMA foreign_keys=ON")
        backup_dir = path.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        backup = backup_dir / f"before-reducer-dimensions-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}.sqlite"
        with sqlite3.connect(backup) as destination:
            db.backup(destination)
        result = import_dimensions(db, standards)
        result.update(backup=str(backup), integrity=db.execute("PRAGMA quick_check").fetchone()[0])
        print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
