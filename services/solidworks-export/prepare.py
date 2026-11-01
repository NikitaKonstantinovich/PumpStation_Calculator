"""Resolve trusted native CAD and construct analytic B-rep parts, never export STL."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
from model_assets import file_hash, load_library  # noqa: E402


def records(value):
    if isinstance(value, dict):
        if isinstance(value.get("source"), str) and isinstance(value.get("sourceHash"), str):
            yield value
        for child in value.values(): yield from records(child)
    elif isinstance(value, list):
        for child in value: yield from records(child)


def library(root):
    entries = list(load_library(root).values())
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
    if file_hash(path) != entry["sourceHash"]:
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


def prepare(root, folder):
    payload = json.loads((folder / "request.json").read_text(encoding="utf-8"))
    entries = library(root)
    by_hash = {e["sourceHash"]: e for e in entries}
    inputs = folder / "inputs"; inputs.mkdir(exist_ok=True)
    resolved, cache, failures, sources = [], {}, [], {}
    source_by_path = {e["source"]: e for e in entries}

    for part in payload["manifest"]["instances"]:
        g = part["geometry"]
        try:
            kind = g.get("kind")
            key = hashlib.sha256(json.dumps(g, sort_keys=True).encode()).hexdigest()
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
            resolved.append({**part, "path": cache[key]})
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
