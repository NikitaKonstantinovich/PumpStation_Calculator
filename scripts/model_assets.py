"""Shared STEP library and tessellation used by the CLI and background service.

CAD coordinates are preserved. STEP length units are converted to millimetres by
OpenCascade, never by fitting the mesh to a catalogue bounding box.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import struct
import subprocess

CONVERTER_VERSION = "v1"  # Increment when units/tessellation settings change.


def run_cad_command(command, log, timeout):
    """A Windows venv launcher owns another Python process: kill both on timeout."""
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    with subprocess.Popen(command, stdout=log, stderr=log, **options) as process:
        try:
            return process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.wait(timeout=10)
            raise


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_path(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or Path(relative).is_absolute():
        raise ValueError("Исходная модель находится вне библиотеки")
    if path.suffix.lower() not in (".step", ".stp"):
        raise ValueError("Поддерживаются исходные файлы STEP/STP")
    if not path.is_file():
        raise FileNotFoundError("Исходный STEP-файл не найден на сервере конвертации")
    return path


def load_library(root, registry=None):
    """Pump index plus explicit equipment links; no ambiguous filename matching."""
    result = {}
    index = root / "Equipment/Pumps/3D_Normalized/normalization-index.json"
    priority = {"catalog_execution_match": 0, "catalog_model_match": 1, "execution_review": 2}
    models = json.loads(index.read_text(encoding="utf-8"))["models"] if index.exists() else []
    for item in sorted(models, key=lambda m: (priority.get(m.get("catalogueMappingClassification"), 9), m["source"])):
        pump_id = str(item.get("pumpId") or "")
        key = "pump:" + pump_id
        if not pump_id or key in result:
            continue
        warnings = ["Монтажная пригодность модели не подтверждена"]
        mapping = item.get("catalogueMappingClassification", "unknown")
        if mapping == "execution_review":
            warnings.append("Исполнение STEP требует проверки соответствия каталогу")
        if item.get("previousCdmAudit", {}).get("geometryAssessment") not in (None, "valid_solids"):
            warnings.append("В исходной CAD-геометрии отмечены дефекты или отдельные поверхности")
        review = item["status"] != "normalized_verified"
        if review:
            warnings.append("Направление потока не подтверждено: PORT_A/PORT_B не назначены входом и выходом")
        ports = [{"id": "port-a" if review else "inlet", "point": [0, 0, 0], "axis": [-1, 0, 0], "provisional": True}]
        if item.get("outletNormalizedMm"):
            ports.append({"id": "port-b" if review else "outlet", "point": item["outletNormalizedMm"], "provisional": True})
        result[key] = {"pumpId": pump_id, "key": key, "bounds": item["normalizedBboxMm"], "ports": ports,
                       "source": item["outputFile"], "sourceHash": item["outputSha256"], "units": "mm",
                       "mapping": mapping, "warnings": warnings}
    registries = [registry] if registry else [root / "frontend/data/cdm-flow-registry.json", root / "frontend/data/line-valve-registry.json", root / "frontend/data/onis-model-registry.json", root / "Equipment/model-library.json"]
    for registry in registries:
        if not registry.exists():
            continue
        custom = json.loads(registry.read_text(encoding="utf-8"))
        if custom.get("version") != 1 or not isinstance(custom.get("models"), list):
            raise ValueError("Некорректный формат реестра Equipment/model-library.json")
        for entry in custom["models"]:
            if not isinstance(entry.get("key"), str) or not entry["key"].startswith(("pump:", "equipment:")):
                raise ValueError("В реестре ожидается ключ pump:<id> или equipment:<id>")
            if not isinstance(entry.get("source"), str) or entry.get("units") != "mm":
                raise ValueError("Реестр должен задавать source и единицы метаданных units=mm")
            for port in entry.get("ports", []):
                for field in ("point", "axis"):
                    value = port.get(field)
                    if field == "axis" and value is None:
                        continue
                    if not isinstance(value, list) or len(value) != 3 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in value):
                        raise ValueError("Некорректные координаты/ось патрубка в реестре")
            result[entry["key"]] = {**entry, "ports": entry.get("ports", []),
                "mapping": entry.get("mapping", "manual_catalogue_link"),
                "warnings": entry.get("warnings", []) + ["Монтажная пригодность модели не подтверждена"]}
    return result


def valid_stl(path):
    try:
        with Path(path).open("rb") as stream:
            header = stream.read(84)
        return len(header) == 84 and struct.unpack("<I", header[80:84])[0] > 0 and Path(path).stat().st_size == 84 + 50 * struct.unpack("<I", header[80:84])[0]
    except OSError:
        return False


def convert_step(source, target):
    from OCP.STEPControl import STEPControl_Reader
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.StlAPI import StlAPI_Writer
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib

    reader = STEPControl_Reader()
    if int(reader.ReadFile(str(source))) != 1:
        raise ValueError("Не удалось прочитать STEP: файл повреждён или имеет неподдерживаемую структуру")
    reader.SetSystemLengthUnit(1.0)  # OCCT length unit is expressed in mm.
    if not reader.TransferRoots():
        raise ValueError("В STEP нет доступной для преобразования геометрии")
    shape = reader.OneShape()
    if shape.IsNull():
        raise ValueError("STEP содержит пустую геометрию")
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, box, False, False)
    low, high = box.CornerMin(), box.CornerMax()
    bounds = [low.X(), low.Y(), low.Z(), high.X(), high.Y(), high.Z()]
    if len(bounds) != 6 or not all(math.isfinite(v) and abs(v) < 1e7 for v in bounds):
        raise ValueError("Некорректные габариты STEP")
    mesh = BRepMesh_IncrementalMesh(shape, .6, False, .45, True)
    if not mesh.IsDone():
        raise ValueError("Не удалось построить полигональную сетку STEP")
    writer = StlAPI_Writer()
    writer.ASCIIMode = False
    if not writer.Write(shape, str(target)) or not valid_stl(target):
        raise ValueError("Не удалось записать непустой бинарный STL")
    return {"bounds": bounds, "units": "mm", "converterVersion": CONVERTER_VERSION}
