"""Export connection evidence without replacing the pump/price/drawing catalogue."""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
with sqlite3.connect(f"file:{root / 'database/pumps.sqlite'}?mode=ro", uri=True) as db:
    result = {}
    for model, kind, value, pressure, source in db.execute(
        "SELECT model_id, connection_type, connection_value, max_pressure_bar, source_header FROM pump_connections ORDER BY model_id, id"
    ):
        result.setdefault(str(model), []).append({"kind": kind, "value": value, "maxPressure": pressure, "source": source})
(root / "frontend/app/pump-connections.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Exported connections for {len(result)} pumps")
