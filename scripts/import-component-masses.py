"""Apply sourced mass attributes to the active local binding catalog."""

import argparse
import json
import math
import sqlite3
from pathlib import Path


SUPPLEMENT = Path(__file__).resolve().parents[1] / "data" / "component-masses.json"
METHODS = {
    "catalog": "По документации",
    "calculated": "Расчётная масса",
    "estimated": "Оценочная масса",
}
UNITS = {"kg": ("MASS_KG", "Масса, кг", "кг"),
         "kg/m": ("MASS_KG_PER_M", "Линейная масса, кг/м", "кг/м")}


def attributes(entries):
    columns = set()
    for entry in entries:
        value, unit, method, source = (entry[key] for key in ("value", "unit", "method", "source"))
        variant = entry.get("variant")
        if (type(value) not in (int, float) or not math.isfinite(value) or value <= 0
                or unit not in UNITS or method not in METHODS or not source.strip()):
            raise ValueError(f"Некорректная запись массы {entry!r}")
        column, label, symbol = UNITS[unit]
        header = [label]
        if variant:
            column = f"{column}:{variant}"
            header.insert(0, variant)
        if column in columns:
            raise ValueError(f"Повторяющаяся характеристика {column}")
        columns.add(column)
        alternatives = entry.get("alternatives", [])
        for alternative in alternatives:
            other = alternative["value"]
            if (type(other) not in (int, float) or not math.isfinite(other)
                    or not 0 < other <= value or not alternative["source"].strip()):
                raise ValueError(f"Некорректное альтернативное значение массы {alternative!r}")
        comment = f"{METHODS[method]}. {source}"
        if alternatives:
            comment += " Другие значения: " + " | ".join(
                f"{item['value']} {symbol} ({item['source']})" for item in alternatives)
        yield column, label, json.dumps(header, ensure_ascii=False), symbol, value, comment


def pending_attributes(db, supplement):
    active = db.execute("""SELECT id,source_sha256 FROM catalog_imports
        WHERE is_active=1 ORDER BY imported_at DESC,id DESC LIMIT 1""").fetchone()
    if not active or active[1] != supplement["sourceSha256"]:
        raise ValueError("Действующий импорт не совпадает с исходным каталогом масс")

    matches = set()
    pending = []
    for component_id, family_id, source_id in db.execute("""SELECT c.id,c.family_id,c.source_id
        FROM components c JOIN component_families f ON f.id=c.family_id
        JOIN component_catalogs cat ON cat.id=f.catalog_id WHERE cat.import_id=?""", (active[0],)):
        entries = supplement["items"].get(source_id)
        if not entries:
            continue
        if source_id in matches:
            raise ValueError(f"Неоднозначный идентификатор {source_id}")
        matches.add(source_id)
        for column, label, header, symbol, value, comment in attributes(entries):
            current = db.execute("""SELECT a.id,a.header_path_json,a.unit,a.data_type,v.id,v.numeric_value,v.comment
                FROM attribute_definitions a LEFT JOIN component_attribute_values v
                ON v.attribute_definition_id=a.id AND v.component_id=?
                WHERE a.family_id=? AND a.source_column=?""", (component_id, family_id, column)).fetchone()
            if current and (json.loads(current[1]), current[2], current[3]) != (json.loads(header), symbol, "number"):
                raise ValueError(f"Конфликт определения массы {source_id} {column}")
            if current and current[4] is not None:
                if current[5:] == (value, comment):
                    continue
                if (current[5] is None or current[5] > value
                        or not any((current[6] or "").startswith(f"{method}. ") for method in METHODS.values())):
                    raise ValueError(f"Конфликт существующего значения массы {source_id} {column}")
            pending.append((component_id, family_id, column, label, header, symbol, value, comment))
    return pending, len(matches)


def insert_attributes(db, pending):
    for component_id, family_id, column, label, header, symbol, value, comment in pending:
        db.execute("""INSERT INTO attribute_definitions
            (family_id,source_column,key,label,header_path_json,data_type,unit,sort_order)
            VALUES (?,?,?,?,?,'number',?,10000) ON CONFLICT(family_id,source_column) DO NOTHING""",
                   (family_id, column, column, label, header, symbol))
        db.execute("""INSERT INTO component_attribute_values
            (component_id,attribute_definition_id,value_type,numeric_value,comment)
            SELECT ?,id,'number',?,? FROM attribute_definitions WHERE family_id=? AND source_column=?
            ON CONFLICT(component_id,attribute_definition_id) DO UPDATE SET
                numeric_value=excluded.numeric_value,comment=excluded.comment""",
                   (component_id, value, comment, family_id, column))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--backup", type=Path, help="Create a backup at this new path before applying")
    args = parser.parse_args()
    uri = args.database.resolve(strict=True).as_uri()
    supplement = json.loads(SUPPLEMENT.read_text(encoding="utf-8"))
    with sqlite3.connect(uri + ("?mode=rw" if args.backup else "?mode=ro"), uri=True, timeout=30) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE" if args.backup else "BEGIN")
        pending, matched = pending_attributes(db, supplement)
        if args.backup and pending:
            with args.backup.open("xb"):
                pass
            with sqlite3.connect(uri + "?mode=ro", uri=True, timeout=30) as source, sqlite3.connect(args.backup) as backup:
                source.backup(backup)
            insert_attributes(db, pending)
            if pending_attributes(db, supplement) != ([], matched):
                raise ValueError("Повторная проверка внесённых масс не пройдена")
            if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise ValueError("Проверка целостности SQLite не пройдена")
        print(json.dumps({"matched": matched, "components": len({row[0] for row in pending}),
                          "attributes": len(pending), "apply": bool(args.backup)}))


if __name__ == "__main__":
    main()
