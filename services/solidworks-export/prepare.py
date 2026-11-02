"""Resolve trusted native CAD and construct analytic B-rep parts, never export STL."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def model_assets(root):
    """The service may be staged anywhere; --root is the configured installation."""
    path = root / "frontend/scripts/model_assets.py"
    if not path.is_file():
        raise RuntimeError("На CAD-сервере отсутствует frontend/scripts/model_assets.py. Проверьте комплектность установки и CAD_EXPORT_ROOT.")
    spec = importlib.util.spec_from_file_location("psc_cad_model_assets", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def records(value):
    if isinstance(value, dict):
        if isinstance(value.get("source"), str) and isinstance(value.get("sourceHash"), str):
            yield value
        for child in value.values(): yield from records(child)
    elif isinstance(value, list):
        for child in value: yield from records(child)


def library(root):
    entries = list(model_assets(root).load_library(root).values())
    paths = [root / "frontend/public/model-assets/library.json", root / "frontend/data/instrument-mounts.json",
             root / "frontend/data/tank-models.json", root / "frontend/data/valve-control-mounts.json",
             root / "frontend/data/line-valve-models.json", root / "frontend/data/line-gasket-models.json",
             root / "frontend/data/collar-cad-models.json"]
    if os.environ.get("CAD_EXPORT_LIBRARY"):
        paths.append(Path(os.environ["CAD_EXPORT_LIBRARY"]))
    for path in paths:
        if path.is_file(): entries.extend(records(json.loads(path.read_text(encoding="utf-8-sig"))))
    return entries


class SourceProblem(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def source(root, entry):
    relative = Path(entry["source"])
    path = (root / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to((root / "Equipment").resolve()) or path.suffix.lower() not in (".step", ".stp", ".sldprt", ".sldasm"):
        raise ValueError("CAD-модель должна находиться внутри библиотеки Equipment")
    if not path.is_file():
        raise SourceProblem("source_missing", "Исходный CAD-файл отсутствует в библиотеке.")
    if model_assets(root).file_hash(path) != entry["sourceHash"]:
        raise SourceProblem("source_changed", "SHA-256 исходного файла отличается от выбранной версии.")
    return path


def number(value, name, zero=False):
    if type(value) not in (float, int) or not math.isfinite(value) or value > 100000 or value < 0 or not zero and value == 0:
        raise ValueError(f"Некорректный размер {name}")
    return value


def generate(g):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism
    from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Vec

    def cylinder(outer, length, start=(0, 0, 0), axis=(1, 0, 0)):
        number(outer, "диаметр"); number(length, "длина")
        if any(not isinstance(v, (list, tuple)) or len(v) != 3 or any(type(n) not in (float, int) or not math.isfinite(n) or abs(n) > 100000 for n in v) for v in (start, axis)):
            raise ValueError("Некорректная монтажная база")
        if abs(math.hypot(*axis)-1) > 1e-6: raise ValueError("Ось должна быть единичным вектором")
        return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*start), gp_Dir(*axis)), outer/2, length).Shape()

    def boolean(op, a, b):
        result = op(a, b)
        result.Build()
        if not result.IsDone(): raise ValueError("Ошибка построения твёрдого тела")
        return result.Shape()

    def cut(a, b): return boolean(BRepAlgoAPI_Cut, a, b)
    def fuse(a, b): return boolean(BRepAlgoAPI_Fuse, a, b)

    def tube(outer, inner, length, start=(0, 0, 0), axis=(1, 0, 0)):
        number(inner, "внутренний диаметр", True)
        if inner >= outer: raise ValueError("Толщина стенки должна быть положительной")
        body = cylinder(outer, length, start, axis)
        return cut(body, cylinder(inner, length, start, axis)) if inner else body

    def hexagon(flats, length, start=0, inner=0):
        number(flats, "размер под ключ"); number(length, "длина")
        polygon = BRepBuilderAPI_MakePolygon()
        for i in range(6):
            a, r = i*math.pi/3, flats/math.sqrt(3)
            polygon.Add(gp_Pnt(start, r*math.sin(a), -r*math.cos(a)))
        polygon.Close()
        body = BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(polygon.Wire()).Face(), gp_Vec(length, 0, 0)).Shape()
        return cut(body, cylinder(inner, length, (start, 0, 0))) if inner else body

    kind = g["kind"]
    if kind in ("tube", "flange", "collar"):
        length, outer, inner = number(g.get("lengthMm"), "длина"), number(g.get("outerMm"), "диаметр"), number(g.get("innerMm"), "проход", True)
        if kind == "collar":
            lip = number(g.get("lipThicknessMm"), "толщина бурта")
            if lip >= length: raise ValueError("Бурт длиннее воротника")
            body = fuse(tube(number(g.get("lipOuterMm"), "диаметр бурта"), inner, lip), tube(outer, inner, length-lip, (lip, 0, 0)))
        elif kind == "flange" and g.get("faceHeightMm"):
            face = number(g["faceHeightMm"], "высота выступа")
            if face >= length: raise ValueError("Неверная высота выступа фланца")
            body = fuse(tube(outer, inner, length-face, (face, 0, 0)), tube(number(g.get("faceDiameterMm"), "диаметр выступа"), inner, face))
        else: body = tube(outer, inner, length)
        holes = g.get("boltHoles", 0)
        if type(holes) is not int or not 0 <= holes <= 128: raise ValueError("Некорректное число отверстий")
        if holes:
            circle, bore = number(g.get("boltCircleMm"), "болтовая окружность"), number(g.get("boltHoleMm"), "отверстие")
            if circle-bore <= inner or circle+bore >= outer: raise ValueError("Отверстия фланца выходят за пределы кольца")
            for i in range(holes):
                a = 2*math.pi*(i+.5)/holes
                body = cut(body, cylinder(bore, length+2, (-1, math.sin(a)*circle/2, -math.cos(a)*circle/2)))
    elif kind == "hex-cap":
        length, outer = number(g.get("lengthMm"), "длина"), number(g.get("outerMm"), "диаметр")
        inner = number(g.get("innerMm", outer*.7), "проход")
        cover = min(3, length/3)
        body = hexagon(outer*math.sqrt(3)/2, length)
        if inner >= outer*math.sqrt(3)/2: raise ValueError("Проход выходит за границы заглушки")
        body = cut(body, cylinder(inner, length-cover))
    elif kind == "rod":
        body = cylinder(g["outerMm"], g["lengthMm"])
        if g.get("headMm"): body = fuse(body, hexagon(g["flatsMm"], g["headMm"], -g["headMm"]))
    elif kind == "hex": body = hexagon(g["flatsMm"], g["lengthMm"], inner=g["innerMm"])
    elif kind in ("collector-main", "collector-branch"):
        m = g if kind == "collector-main" else g["main"]
        length = number(m["lengthMm"], "длина магистрали")
        if kind == "collector-main":
            body = tube(m["outerMm"], m["innerMm"], length, (-length/2, 0, 0))
            if not isinstance(g["branches"], list) or len(g["branches"]) > 500: raise ValueError("Слишком много патрубков")
            for b in g["branches"]:
                # Start inside the collector: only the near wall is drilled.
                body = cut(body, cylinder(b["innerMm"], b["endMm"], b["origin"], b["axis"]))
        else:
            b = g["branch"]
            body = tube(b["outerMm"], b["innerMm"], b["endMm"], b["origin"], b["axis"])
            body = cut(body, cylinder(m["outerMm"], length+2, (-length/2-1, 0, 0)))
    else: raise ValueError(f"Нет генератора точной геометрии: {kind}")
    if body.IsNull() or not BRepCheck_Analyzer(body).IsValid(): raise ValueError("Получена некорректная CAD-геометрия")
    # A successful boolean can still produce an empty compound.
    from OCP.TopAbs import TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    if not TopExp_Explorer(body, TopAbs_SOLID).More(): raise ValueError("Деталь не содержит твёрдого тела")
    return body


def compose_transform(parent, child):
    def rotated(v):
        return [sum(v[i]*parent[3*i+j] for i in range(3)) for j in range(3)]
    axes = [n for i in (0,3,6) for n in rotated(child[i:i+3])]
    return axes + [v+w for v,w in zip(rotated(child[9:12]), parent[9:12])] + [1,0,0,0]


def library_part(part, rows):
    g = part["geometry"]
    if g["kind"] == "native":
        entry = next((r for r in rows if r.get("alias") == g.get("hash") and r.get("alias")), None)
        return (entry, entry["placement"]) if entry else None
    # A schematic preview can still have a known exact library part.
    shape = g.get("shape") if g["kind"] == "unavailable" else g
    if not isinstance(shape, dict): return None
    for entry in rows:
        dims = entry.get("dimensions")
        if not dims: continue
        if entry.get("kind")=="gasket":
            if entry["equipmentId"]!=part.get("equipmentId") or not part.get("componentId","").startswith("line-"): continue
            if g["kind"]=="catalogue" and abs(g.get("parameters",{}).get("length",0)-dims["lengthMm"])<.035:
                return entry,entry["placement"]
            if g["kind"]=="tube" and all(abs(g.get(k,0)-v)<.035 for k,v in dims.items()):
                return entry,entry["placement"]
            continue
        hardware = entry.get("hardware")
        if hardware:
            if hardware != g.get("hardware") or entry["nominalMm"] != g.get("nominalMm"): continue
            # These source files represent plated steel. Do not substitute for a stainless SKU.
            if any(tag in part["name"].lower() for tag in ("нерж", "aisi", "а2", "а4", "a2", "a4")): continue
        elif entry.get("kind") != shape["kind"] or entry.get("equipmentId",part.get("equipmentId")) != part.get("equipmentId"):
            continue
        if any(k in shape and abs(shape[k]-dims.get(k,0))>.035 for k in ("faceHeightMm","faceDiameterMm")): continue
        mount = list(entry["placement"])
        for key,value in dims.items():
            if key in ("faceHeightMm","faceDiameterMm") and key not in shape: continue
            if hardware=="nut" and key=="lengthMm":
                if value > g.get("maxNutMm",g["lengthMm"])+.035: break
                if g.get("seatAtEnd"): mount[9]+=(g["lengthMm"]-value)/1000
            elif type(shape.get(key)) not in (float,int) or abs(shape[key]-value)>.035: break
        else: return entry,mount
    return None


def prepare(root, folder):
    payload = json.loads((folder / "request.json").read_text(encoding="utf-8"))
    entries = library(root)
    by_hash = {e["sourceHash"]: e for e in entries}
    inputs = folder / "inputs"; inputs.mkdir(exist_ok=True)
    resolved, cache, failures, sources = [], {}, [], {}
    source_by_path = {e["source"]: e for e in entries}
    index_path = root / "frontend/data/solidworks-parts.json"
    parts_index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    gasket_index = root / "frontend/data/solidworks-gaskets.json"
    if gasket_index.exists(): parts_index.extend(json.loads(gasket_index.read_text(encoding="utf-8")))
    checked = {}
    stamped_path = root / "frontend/data/stamped-loose-flanges.json"
    stamped = json.loads(stamped_path.read_text(encoding="utf-8")) if stamped_path.is_file() else {"parts":{}, "catalog":{}}
    products = {}
    flange_catalog = root / "frontend/data/flange-dimensions.json"
    if flange_catalog.is_file():
        products = {r["componentId"]: r["name"] for r in json.loads(flange_catalog.read_text(encoding="utf-8"))["rows"]}

    for part in payload["manifest"]["instances"]:
        g = part["geometry"]
        label = part.get("detailName") or part["name"]
        product = products.get(part.get("equipmentId"))
        if product and (g["kind"]=="flange" or "фланец" in label.lower()): label=product
        elif g.get("source","").startswith("Equipment/Pumps/") and not label.lower().startswith("насос"): label="Насос "+label
        elif part.get("appearance")=="metal" and not any(mark in label.upper() for mark in ("AISI","НЕРЖ","Х18")): label+=" · нерж."
        elif part.get("appearance")=="red" and part.get("material") and "ст20" not in label.lower(): label+=" · "+part["material"].replace("st20","Ст20")
        part={**part,"detailName":label}
        try:
            kind = g.get("kind")
            key = hashlib.sha256(json.dumps(g, sort_keys=True).encode()).hexdigest()
            stamp_row = stamped["catalog"].get(part.get("equipmentId"))
            if stamp_row is not None and kind=="unavailable":
                raise SourceProblem("unsupported_geometry",g.get("reason") or "Не подтверждена установка штампованного фланца.")
            if stamp_row is not None or g.get("stampedHash"):
                stock = stamped["parts"].get((stamp_row or {}).get("model"))
                if not stock or stock["sourceHash"]!=g.get("stampedHash") or any(
                    type(g.get(k)) not in (int,float) or abs(v-g[k])>.005 for k,v in stock["dimensions"].items()
                ) or g.get("faceHeightMm") or g.get("faceDiameterMm"):
                    raise SourceProblem("unsupported_geometry","Нет проверенного штампованного свободного фланца для этой посадки и сверловки. Обновите страницу и проверьте выбранное исполнение.")
                match = stock,stock["placement"]
                label = stock["name"]+" · PN"+str(10 if part["equipmentId"].startswith("фланцы-005-") else 16)+" · нерж."
            else:
                match = library_part(part, parts_index)
            if match:
                entry, native_pose = match
                digest = entry["sourceHash"]
                if digest not in checked: checked[digest] = source(root, entry)
                path = checked[digest]
                sources[str(path)] = digest
                if (entry.get("alias") or entry.get("kind")=="collar") and "dn" not in label.lower():
                    label=path.stem
                if entry.get("kind")=="gasket": label=entry["name"]
                # Preserve the browser datum alongside the CAD file's own datum.
                resolved.append({**part, "detailName":label, "path":str(path), "browserTransform":part["transform"],
                                 "transform":compose_transform(part["transform"], native_pose),
                                 "configuration":entry.get("configuration"), "sourceFile":entry["source"],
                                 "origin":"library", "sourceHash":digest})
                continue
            if kind == "unavailable":
                raise SourceProblem("unsupported_geometry", g.get("reason", "Нет точной геометрии."))
            if key not in cache:
                if kind in ("native", "catalogue"):
                    entry = by_hash.get(g.get("hash")) if kind == "native" else next((e for e in entries if e.get("equipmentId") == g.get("equipmentId") and e.get("parameters") == g.get("parameters")), None)
                    if not entry:
                        if kind == "native" and g.get("source") in source_by_path:
                            raise SourceProblem("source_changed", "Библиотека содержит другую версию исходной модели.")
                        raise SourceProblem("source_missing", "Нет привязанной детализированной модели в библиотеке.")
                    path = source(root, entry)
                    sources[str(path)] = entry["sourceHash"]
                else:
                    if kind not in {"tube", "flange", "collar", "hex-cap", "rod", "hex", "collector-main", "collector-branch"}:
                        raise SourceProblem("unsupported_geometry", f"Нет генератора геометрии {kind}.")
                    from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
                    from OCP.IFSelect import IFSelect_RetDone
                    from OCP.Interface import Interface_Static
                    Interface_Static.SetCVal_s("write.step.unit", "MM")
                    body = generate(g)
                    path = inputs / f"{key}.step"
                    writer = STEPControl_Writer()
                    if writer.Transfer(body, STEPControl_AsIs) != IFSelect_RetDone or writer.Write(str(path)) != IFSelect_RetDone:
                        raise ValueError("Не удалось сохранить STEP детали.")
                cache[key] = str(path)
            native = kind in ("native","catalogue")
            resolved.append({**part, "path": cache[key], "origin":"library" if native else "generated",
                             "sourceFile":Path(cache[key]).relative_to(root).as_posix() if native else None,
                             "sourceHash":sources.get(cache[key])})
        except (ValueError, TypeError, KeyError, RuntimeError) as error:
            failures.append(dict(id=part["id"], code=getattr(error, "code", "part_creation"), reason=str(error)))
    (folder / "sources.json").write_text(json.dumps(sources), encoding="utf-8")
    (folder / "resolved.json").write_text(json.dumps({"instances": resolved, "omissions": failures}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True); parser.add_argument("--job", type=Path, required=True)
    args = parser.parse_args()
    try: prepare(args.root.resolve(), args.job.resolve())
    except Exception as error:
        (args.job / "error.json").write_text(json.dumps({"error": str(error)}, ensure_ascii=False), encoding="utf-8")
        raise
