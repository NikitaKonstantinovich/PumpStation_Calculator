"""Resolve trusted native CAD and construct analytic B-rep parts, never export STL."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
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


def data_file(root, name):
    """Use the service release's catalogues together with its generator code."""
    service = Path(__file__).resolve()
    for path in (service.with_name("data") / name, root / "frontend/data" / name):
        if path.is_file():
            return path
    return root / "frontend/data" / name


def library(root):
    entries = list(model_assets(root).load_library(root).values())
    service = Path(__file__).resolve()
    paths = [root / "frontend/public/model-assets/library.json", root / "frontend/data/instrument-mounts.json",
             root / "frontend/data/tank-models.json", root / "frontend/data/valve-control-mounts.json",
             root / "frontend/data/line-valve-models.json", root / "frontend/data/line-gasket-models.json",
             root / "frontend/data/collar-cad-models.json", root / "frontend/data/frame-cabinet-models.json",
             service.parents[2] / "data/frame-cabinet-models.json", service.with_name("frame-cabinet-models.json"),
             root / "Equipment/Pumps/PreparedForAssembly/export-library.json"]
    frame_directory = Path("Equipment/Frames/Generated/bent-410-v1")
    frame_manifest = root / frame_directory / "manifest.json"
    if frame_manifest.is_file():
        for frame in json.loads(frame_manifest.read_text(encoding="utf-8-sig")):
            if frame.get("verified") is not True:
                continue
            native = Path(frame["native"])
            if native.name != frame["native"] or native.suffix.lower() != ".sldprt":
                continue
            entries.append({"source": (frame_directory / native).as_posix(), "sourceHash": frame["nativeHash"]})
    if os.environ.get("CAD_EXPORT_LIBRARY"):
        paths.append(Path(os.environ["CAD_EXPORT_LIBRARY"]))
    for name in ("instrument-mounts.json", "tank-models.json", "tank-channel-models.json",
                 "valve-control-mounts.json", "line-valve-models.json", "line-gasket-models.json",
                 "collar-cad-models.json", "frame-cabinet-models.json"):
        paths.append(data_file(root, name))
    for path in dict.fromkeys(paths):
        if path.is_file(): entries.extend(records(json.loads(path.read_text(encoding="utf-8-sig"))))
    return entries


class SourceProblem(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def source(root, entry):
    # A previous import failure is not proof that SOLIDWORKS cannot heal this source.
    # Verify the file and its hash, then let ImportDiagnosis determine the result.
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


def frame_profile(g):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeWire
    from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
    from OCP.GC import GC_MakeArcOfCircle
    from OCP.gp import gp_Pnt, gp_Vec

    length = number(g.get("lengthMm"), "длина С-профиля")
    slots = g.get("slots")
    radius = 5.5
    if length not in (600, 800) or not isinstance(slots, list) or len(slots) > 32:
        raise ValueError("Некорректная длина или число пазов С-профиля")

    def extrude(start, segments, direction):
        wire = BRepBuilderAPI_MakeWire()
        current = gp_Pnt(*start)
        for end, *via in segments:
            target = gp_Pnt(*end)
            if via:
                curve = GC_MakeArcOfCircle(current, gp_Pnt(*via[0]), target).Value()
                edge = BRepBuilderAPI_MakeEdge(curve)
            else:
                edge = BRepBuilderAPI_MakeEdge(current, target)
            wire.Add(edge.Edge())
            current = target
        face = BRepBuilderAPI_MakeFace(wire.Wire()).Face()
        return BRepPrimAPI_MakePrism(face, gp_Vec(*direction)).Shape()

    # The editor uses local X for depth, Y for the section width, Z along the rail.
    # The folded sheet is 2 mm thick, with outer R4 and inner R2 bends.
    outer = 4 / math.sqrt(2)
    inner = 2 / math.sqrt(2)
    section = [
        [(0, 16)], [(4, 20), (4 - outer, 16 + outer)], [(16, 20)],
        [(20, 16), (16 + outer, 16 + outer)], [(20, 10)], [(18, 10)],
        [(18, 16)], [(16, 18), (16 + inner, 16 + inner)], [(4, 18)],
        [(2, 16), (4 - inner, 16 + inner)], [(2, -16)],
        [(4, -18), (4 - inner, -16 - inner)], [(16, -18)],
        [(18, -16), (16 + inner, -16 - inner)], [(18, -10)], [(20, -10)],
        [(20, -16)], [(16, -20), (16 + outer, -16 - outer)], [(4, -20)],
        [(0, -16), (4 - outer, -16 - outer)],
    ]
    body = extrude((0, -16, 0), [[(*point, 0) for point in segment] for segment in section], (0, 0, length))
    previous_end = -radius
    for slot in slots:
        if not isinstance(slot, list) or len(slot) != 2:
            raise ValueError("Некорректный паз С-профиля")
        lo, hi = (number(value, "координата паза С-профиля") for value in slot)
        if not radius < lo <= hi < length - radius or lo - previous_end <= 2 * radius:
            raise ValueError("Пазы С-профиля пересекаются или выходят на кромку")
        previous_end = hi
        segments = [[(-1, radius, lo), (-1, 0, lo - radius)]]
        if hi > lo:
            segments.append([(-1, radius, hi)])
        segments.append([(-1, -radius, hi), (-1, 0, hi + radius)])
        if hi > lo:
            segments.append([(-1, -radius, lo)])
        cutter = extrude((-1, -radius, lo), segments, (4, 0, 0))
        result = BRepAlgoAPI_Cut(body, cutter)
        if not result.IsDone():
            raise ValueError("Не удалось построить паз С-профиля")
        body = result.Shape()
    return body


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
    if kind == "reducer":
        from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire
        from OCP.gp import gp_Circ
        length = number(g.get("lengthMm"), "длина перехода")
        outer, inner = number(g.get("outerMm"), "большой диаметр"), number(g.get("innerMm"), "большой проход")
        small, bore = number(g.get("smallOuterMm"), "малый диаметр"), number(g.get("smallInnerMm"), "малый проход")
        offset = g.get("offset")
        if not isinstance(offset, list) or len(offset) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in offset) or offset[0] != 0:
            raise ValueError("Не определён эксцентриситет перехода")
        if not 0 < inner < outer or not 0 < bore < small < outer or math.hypot(*offset) > (outer-small)/2+.01:
            raise ValueError("Некорректные диаметры или эксцентриситет перехода")
        def loft(d1, d2):
            builder = BRepOffsetAPI_ThruSections(True, True)
            for x, y, z, diameter in ((0,0,0,d1),(length,offset[1],offset[2],d2)):
                circle = gp_Circ(gp_Ax2(gp_Pnt(x,y,z),gp_Dir(1,0,0)),diameter/2)
                builder.AddWire(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(circle).Edge()).Wire())
            builder.Build()
            if not builder.IsDone(): raise ValueError("Не построен переход")
            return builder.Shape()
        body = cut(loft(outer,small),loft(inner,bore))
    elif kind == "tank-envelope":
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeRevol
        from OCP.gp import gp_Ax1
        radius = number(g.get("diameterMm"), "диаметр бака")/2
        height = number(g.get("heightMm"), "высота бака")
        # Same dimensioned outline and datum as the browser WAV 8 model.
        polygon = BRepBuilderAPI_MakePolygon()
        for r, z in ((0,.087),(.35,.087),(.7,.138),(.94,.241),(1,.322),(1,.74),(.95,.82),(.75,.907),(.35,.955),(0,.961)):
            polygon.Add(gp_Pnt(radius*r,0,height*z))
        polygon.Close()
        body = BRepPrimAPI_MakeRevol(BRepBuilderAPI_MakeFace(polygon.Wire()).Face(),gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,0,1))).Shape()
        for diameter, start, end in ((26.4,0,.058),(100,.058,.087),(16,.961,1)):
            body = fuse(body,cylinder(diameter,height*(end-start),(0,0,height*start),(0,0,1)))
    elif kind in ("tube", "flange", "collar"):
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
    elif kind == "rivet-nut":
        body_length=number(g["bodyLengthMm"],"длина тела гайки-заклёпки")
        body=fuse(tube(g["bodyOuterMm"],g["innerMm"],body_length,(-body_length,0,0)),
                  tube(g["headOuterMm"],g["innerMm"],g["headLengthMm"]))
    elif kind == "rod":
        body = cylinder(g["outerMm"], g["lengthMm"])
        if g.get("headMm"): body = fuse(body, hexagon(g["flatsMm"], g["headMm"], -g["headMm"]))
    elif kind == "hex": body = hexagon(g["flatsMm"], g["lengthMm"], inner=g["innerMm"])
    elif kind == "frame-profile":
        body = frame_profile(g)
    elif kind == "channel-member":
        m, p, section = g["member"], g["profile"], g["section"]
        length = number(m["end"]-m["start"], "длина швеллера")
        width, height, flange = number(p["width"], "ширина полки"), number(p["height"], "высота профиля"), number(p["flange"], "толщина полки")
        if m["axis"] not in ("x", "y") or m["opening"] not in (-1, 1): raise ValueError("Некорректная ориентация швеллера")
        if not isinstance(section, list) or not 4 <= len(section) <= 256: raise ValueError("Некорректное сечение швеллера")
        polygon = BRepBuilderAPI_MakePolygon()
        for offset, z in section:
            if not all(math.isfinite(v) for v in (offset, z)) or not 0 <= offset <= width or not 0 <= z <= height: raise ValueError("Сечение выходит за габарит")
            cross = m["cross"] + (offset if m["opening"] == 1 else width-offset)
            x, y = (m["start"], cross) if m["axis"] == "x" else (cross, m["start"])
            polygon.Add(gp_Pnt(y, z, -x))
        polygon.Close()
        vector = gp_Vec(0, 0, -length) if m["axis"] == "x" else gp_Vec(length, 0, 0)
        body = BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(polygon.Wire()).Face(), vector).Shape()
        if len(g.get("holes", [])) > 1000: raise ValueError("Слишком много отверстий")
        for hole in g.get("holes", []):
            if not hole.get("valid") or hole.get("memberId") != m["id"]: raise ValueError("Неподтверждённое отверстие")
            radius = number(hole["diameterMm"], "диаметр отверстия")/2
            along, cross = (hole["x"], hole["y"]) if m["axis"] == "x" else (hole["y"], hole["x"])
            offset = cross-m["cross"] if m["opening"] == 1 else m["cross"]+width-cross
            if hole["face"] not in ("top", "bottom") or along-radius < m["start"]-1e-6 or along+radius > m["end"]+1e-6 or offset-radius < p["web"]+p["rootRadius"]-1e-6 or offset+radius > width-p["toeRadius"]+1e-6:
                raise ValueError("Отверстие швеллера выходит за пригодную полку")
            z = height-flange-1 if hole["face"] == "top" else -1
            body = cut(body, cylinder(hole["diameterMm"], flange+2, (hole["y"], z, -hole["x"]), (0, 1, 0)))
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


IDENTITY = [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]


def physical_geometry(value):
    """Drawing labels, catalogue row IDs and mounting notes are not geometry."""
    if isinstance(value, list): return [physical_geometry(v) for v in value]
    if type(value) in (int,float):
        rounded=round(value,9)
        return int(rounded) if rounded==int(rounded) else rounded
    if not isinstance(value, dict): return value
    metadata = {"id", "componentId", "name", "portId", "circuit", "source", "role", "calculatedLengthMm",
                "blankLengthMm", "seatAtEnd", "maxNutMm", "modelNote"}
    return {k: physical_geometry(v) for k,v in value.items() if k not in metadata}


def canonical_geometry(g):
    """Use a part-local saddle datum; preserve its original world placement separately."""
    shape = physical_geometry(g)
    pose = list(IDENTITY)
    if g["kind"] == "channel-member":
        # Member IDs are metadata, but drilling must first be checked against
        # its owner. Preserve that relation after removing unstable scene IDs.
        if any(h.get("memberId") != g["member"].get("id") for h in g.get("holes", [])):
            raise ValueError("Отверстие относится к другому швеллеру")
        shape["member"]["id"] = "member"
        for hole in shape.get("holes", []): hole["memberId"] = "member"
        return shape, pose
    if g["kind"] != "collector-branch": return shape, pose
    b, m = shape["branch"], shape["main"]
    x,y,z = b["origin"]; ax,ay,az = b["axis"]
    # End-trimmed and non-radial branches retain their full cutting geometry.
    if abs(ax)>1e-9 or abs(x)+b["outerMm"]/2 >= m["lengthMm"]/2: return shape, pose
    b["origin"] = [0, y*ay+z*az, -y*az+z*ay]
    b["axis"] = [0,1,0]
    # Only the outside cylinder defines this saddle, not the collector's bore or length.
    shape["main"] = dict(outerMm=m["outerMm"], lengthMm=2*(b["outerMm"]+1))
    pose = [1,0,0,0,ay,az,0,-az,ay,x/1000,0,0,1,0,0,0]
    return shape, pose


def characteristics(part):
    text = (part.get("detailName") or part["name"]).upper().replace("Ё","Е")
    text = re.sub(r"(?<=\d),(?=\d)",".",text)
    tokens = re.findall(r"(?:ГОСТ(?:\s+Р)?|DIN(?:\s+EN)?|ISO)\s*\d+(?:[-.]\d+)*|PN\s*\d+|AISI\s*\d+[A-Z]?|(?:А|A)[24](?:-\d+)?|(?:СТ(?:АЛЬ)?\.?\s*(?:20|3)|09Г2С|(?:12|08)Х18Н\d+Т?)|\b(?:4\.8|5\.8|8\.8|10\.9|12\.9)\b|ОЦИНК\w*|НЕРЖ\w*|\bЦ\b", text)
    # A manufacturer's execution is significant even when no ГОСТ/DIN is supplied.
    tokens += re.findall(r"RIVKLE\s*[\d][\dA-Z.-]*", text)
    return {**{k:part[k] for k in ("material","standard","strengthClass","coating") if part.get(k)},
            "designation": sorted(set(re.sub(r"\s+","",t) for t in tokens))}


def document_key(part):
    key = {"source":part.get("sourceHash") or Path(part["path"]).stem,
           "configuration":part.get("configuration"), "characteristics":characteristics(part)}
    return hashlib.sha256(json.dumps(key,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def canonical_label(part, g, entry=None):
    label = part.get("detailName") or part["name"]
    num = lambda n: f"{n:g}".replace(".",",")
    if g["kind"] == "collector-branch":
        b=g["branch"]
        label = "Сгон" if b.get("thread") else "Патрубок"
        label += f" Ø{num(b['outerMm'])}×{num((b['outerMm']-b['innerMm'])/2)} мм"
        label += f" L={num(b.get('blankLengthMm',b['endMm']))} мм"
        if b.get("thread"): label += " · " + b["thread"]["designation"]
    elif g["kind"] == "collector-main":
        label = f"Труба коллектора Ø{num(g['outerMm'])}×{num((g['outerMm']-g['innerMm'])/2)} мм L={num(g['lengthMm'])} мм"
    else:
        label = re.sub(r"\s*·\s*(?:КИП\s*\d+.*|(?:открыт|закрыт)\w*|\d+(?:\.\d+)*)$", "", label, flags=re.I)
    hardware=g.get("hardware") or next((kind for pattern,kind in [(r"гайк[аи]-?(?:закл[её]п|клеп)","rivet-nut"),(r"болт", "bolt"),(r"гайк", "nut"),(r"шайб", "washer"),(r"шпильк", "stud")] if re.search(pattern,label,re.I)),None)
    if hardware:
        match=re.search(r"(?:ГОСТ(?:\s+Р)?|DIN(?:\s+EN)?|ISO)\s*\d+(?:[-.]\d+)*",label,re.I)
        fallback=re.search(r"(?:ГОСТ|DIN|ISO)\s*\d+(?:[-.]\d+)*",(entry or {}).get("configuration",""),re.I)
        standard=(match or fallback)
        size=re.search(r"[МM]\s*(\d+(?:[.,]\d+)?)(?:\s*[xх×]\s*(\d+(?:[.,]\d+)?))?",label)
        diameter=g.get("nominalMm") or (float(size[1].replace(",",".")) if size else None)
        length=g.get("lengthMm") if hardware in ("bolt","stud") else None
        if length is None and hardware in ("bolt","stud") and size and size[2]: length=float(size[2].replace(",","."))
        if standard and diameter:
            designation=re.sub(r"(ГОСТ|DIN|ISO)\s*",r"\1 ",standard[0].upper())
            label={"bolt":"Болт","stud":"Шпилька","nut":"Гайка","rivet-nut":"Гайка-заклёпка","washer":"Шайба"}[hardware]
            label+=f" {designation} M{num(diameter)}"+(f"×{num(length)}" if length else "")
            extras=[t for t in characteristics(part)["designation"] if not re.match(r"ГОСТ|DIN|ISO|PN",t)]
            if extras: label+=" · "+" · ".join(extras)
        else:
            label=re.split(r"\s+(?:для|крепления)\s+",label,flags=re.I)[0]
    return label


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
            standards=lambda text: set(re.sub(r"\s+","",m.upper()) for m in re.findall(r"(?:ГОСТ(?:\s+Р)?|DIN(?:\s+EN)?|ISO)\s*\d+(?:[-.]\d+)*",text,re.I))
            requested=standards(part["name"])
            if requested and not requested.issubset(standards(entry.get("configuration","")+" "+entry["source"])): continue
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
    warnings = set()
    source_by_path = {e["source"]: e for e in entries}
    index_path = data_file(root, "solidworks-parts.json")
    parts_index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    gasket_index = data_file(root, "solidworks-gaskets.json")
    if gasket_index.exists(): parts_index.extend(json.loads(gasket_index.read_text(encoding="utf-8")))
    checked = {}
    stamped_path = data_file(root, "stamped-loose-flanges.json")
    stamped = json.loads(stamped_path.read_text(encoding="utf-8")) if stamped_path.is_file() else {"parts":{}, "catalog":{}}
    products = {}
    flange_catalog = data_file(root, "flange-dimensions.json")
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
            physical, local_pose = canonical_geometry(g)
            key = hashlib.sha256(json.dumps(physical if kind not in ("native","catalogue") else g, sort_keys=True).encode()).hexdigest()
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
                label=canonical_label({**part,"detailName":label},g,entry)
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
                    if kind not in {"tube", "flange", "collar", "reducer", "tank-envelope", "hex-cap", "rod", "hex", "rivet-nut", "collector-main", "collector-branch", "frame-profile", "channel-member"}:
                        raise SourceProblem("unsupported_geometry", f"Нет генератора геометрии {kind}.")
                    from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
                    from OCP.IFSelect import IFSelect_RetDone
                    from OCP.Interface import Interface_Static
                    Interface_Static.SetCVal_s("write.step.unit", "MM")
                    body = generate(physical)
                    path = inputs / f"{key}.step"
                    writer = STEPControl_Writer()
                    if writer.Transfer(body, STEPControl_AsIs) != IFSelect_RetDone or writer.Write(str(path)) != IFSelect_RetDone:
                        raise ValueError("Не удалось сохранить STEP детали.")
                cache[key] = str(path)
            native = kind in ("native","catalogue")
            resolved.append({**part, "detailName":canonical_label(part,g), "path": cache[key], "origin":"library" if native else "generated",
                             "browserTransform":part["transform"], "transform":compose_transform(part["transform"],local_pose),
                             "sourceFile":Path(cache[key]).relative_to(root).as_posix() if native else None,
                             "sourceHash":sources.get(cache[key])})
        except (ValueError, TypeError, KeyError, RuntimeError) as error:
            failures.append(dict(id=part["id"], code=getattr(error, "code", "part_creation"), reason=str(error)))
    labels = {}
    for part in resolved:
        part["documentKey"] = document_key(part)
        part["detailName"] = labels.setdefault(part["documentKey"],part["detailName"])
        if re.search(r"болт|гайк[аи]|шпильк|шайб",part["detailName"],re.I) and not re.search(r"ГОСТ|DIN|ISO",part["detailName"],re.I):
            warnings.add(part["detailName"]+": стандарт не задан исходными данными; требуется уточнение.")
    (folder / "sources.json").write_text(json.dumps(sources), encoding="utf-8")
    (folder / "resolved.json").write_text(json.dumps({"instances": resolved, "omissions": failures, "warnings": sorted(warnings)}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True); parser.add_argument("--job", type=Path, required=True)
    args = parser.parse_args()
    try: prepare(args.root.resolve(), args.job.resolve())
    except Exception as error:
        (args.job / "error.json").write_text(json.dumps({"error": str(error)}, ensure_ascii=False), encoding="utf-8")
        raise
