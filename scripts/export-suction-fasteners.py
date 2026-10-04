"""Read mounting dimensions from the source workbook; never modify the workbook."""
import json
from pathlib import Path
from openpyxl import load_workbook

root = Path(__file__).resolve().parents[2]
source_name = "Калькулятор по ОБВЯЗКЕ.xlsm"
path = root / "Equipment" / source_name
if not path.is_file():
    raise FileNotFoundError(f"Не найден исходный файл крепежа: {path}")
workbook = load_workbook(path, read_only=True, data_only=True)
sheet = workbook["Полезная инфа"]
assert "Количество отверстий" in sheet["B49"].value
assert "017W" in sheet["B73"].value
assert "10" in sheet["B121"].value
assert "012F" in sheet["B145"].value
rows = []
for row in range(51, 71):
    dn = int(sheet[f"B{row}"].value.removeprefix("DN"))
    for pn, count_col, diameter_col, thickness_col in [(10,"C","G","L"),(16,"D","H","M"),(25,"E","I","N")]:
        rows.append({
            "dn": dn, "pn": pn, "holes": sheet[f"{count_col}{row}"].value,
            "boltDiameter": sheet[f"{diameter_col}{row}"].value,
            "steelFlangeThickness": sheet[f"{thickness_col}{row}"].value,
            "wafer017WLength": sheet[f"C{row+24}"].value or None,
            "wafer010CLength": sheet[f"C{row+72}"].value or None,
            "flange012FThickness": sheet[f"D{row+96}"].value or None,
            "checkValveSource": f"{path.name}: Полезная инфа!C{row+72}, D{row+96}; пакет 10С: F{row+72}:H{row+72}",
            "source": f"{path.name}: Полезная инфа!{count_col}{row}, {diameter_col}{row}, {thickness_col}{row}, C{row+24}",
        })
workbook.close()
(root / "frontend/app/suction-fasteners.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n",encoding="utf-8")
print(f"Exported {len(rows)} DN/PN mounting references")
