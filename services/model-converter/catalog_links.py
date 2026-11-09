"""Explicit catalog CAD links; never match pumps by similar display names."""
import json
from pathlib import Path
import sqlite3
from contextlib import closing


def catalog_links(path, keys):
    """Return candidates, not approvals. Published source hashes must match later."""
    if not path:
        return {}
    result = {}
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)) as catalog:
        catalog.row_factory = sqlite3.Row
        for key in set(keys):
            if not key.startswith("pump:"):
                continue
            variant_id = key.removeprefix("pump:")
            variant = catalog.execute("""SELECT v.model_id, m.power_kw FROM variants v
                LEFT JOIN motor_configurations m ON m.variant_id=v.id WHERE v.id=?""", (variant_id,)).fetchone()
            if not variant:
                continue
            explicit = catalog.execute("SELECT binding_id FROM variant_cad_candidates WHERE variant_id=?", (variant_id,)).fetchall()
            rows = catalog.execute("""SELECT b.*, a.sha256, v.declared_CAD_motor_power_kw AS cad_power
                FROM cad_bindings b JOIN assets a ON a.id=b.asset_id
                LEFT JOIN cad_dimension_verifications v ON v.binding_id=b.id
                WHERE b.model_id=?""", (variant["model_id"],)).fetchall()
            candidates = []
            explicit_ids = {r[0] for r in explicit}
            for row in rows:
                if explicit_ids and row["id"] not in explicit_ids:
                    continue
                if not explicit_ids and not row["is_default"]:
                    continue
                if any(word in (row["execution_match_status"] or "").lower() for word in ("rejected", "mismatch", "wrong_motor")):
                    continue
                if row["cad_power"] is not None and (variant["power_kw"] is None or abs(row["cad_power"] - variant["power_kw"]) > .01):
                    continue
                profile = json.loads(row["profile_json"] or "{}")
                source_key, digest = profile.get("key"), row["sha256"]
                if not source_key or not source_key.startswith("pump:") or not digest or profile.get("sourceHash") != digest:
                    continue
                candidates.append({"sourceKey": source_key, "sourceHash": digest,
                    "variantId": variant_id, "modelId": variant["model_id"], "bindingId": row["id"],
                    "scope": "variant_candidate" if explicit_ids else "model_default",
                    "executionStatus": row["execution_match_status"], "assemblyApproved": bool(row["assembly_approved"])})
            # Different geometry candidates are ambiguous. Leave the placeholder.
            if candidates and len({c["sourceHash"] for c in candidates}) == 1:
                result[key] = candidates[0]
    return result


def apply_catalog_links(library, links):
    """Resolve only against the project's immutable model release."""
    for key, link in links.items():
        if key in library:
            continue
        profile = library.get(link["sourceKey"])
        if not profile or profile.get("sourceHash") != link["sourceHash"]:
            continue
        warnings = list(profile.get("warnings", []))
        if link["scope"] == "model_default" or not link["assemblyApproved"]:
            warnings.append("3D-модель связана через модель каталога; точное исполнение и монтажная пригодность требуют проверки")
        library[key] = {**profile, "warnings": list(dict.fromkeys(warnings)), "catalogBinding": dict(link)}
    return library
