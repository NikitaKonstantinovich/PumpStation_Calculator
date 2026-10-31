"""Publish sourced thread-cutting tariffs without changing old versions/projects.

Usage: python scripts/import-thread-cutting-rates.py --database <local.sqlite> --apply
Default is a read-only preview. Existing tariffs and unrelated draft edits survive.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import uuid

ROOT = Path(__file__).resolve().parents[1]


def publish(database, apply=False):
    database = Path(database).resolve(strict=True)
    rates = json.loads((ROOT / "data/thread-cutting-prices.json").read_text(encoding="utf-8"))
    connection = sqlite3.connect(database.as_uri() + "?mode=" + ("rw" if apply else "ro"), uri=True)
    connection.execute("PRAGMA busy_timeout=10000")
    try:
        state = connection.execute("SELECT active_id,revision,draft_json FROM base_value_state WHERE id=1").fetchone()
        if not state:
            raise ValueError("Сначала инициализируйте раздел базовых значений в приложении.")
        active = json.loads(connection.execute("SELECT values_json FROM base_value_versions WHERE id=?", (state[0],)).fetchone()[0])
        if "threadCutting" in active["welding"]:
            return {"created": False, "reason": "Тарифы уже опубликованы; изменения пользователя сохранены", "active": state[0]}
        draft = json.loads(state[2])
        active["welding"]["threadCutting"] = rates
        draft["welding"].setdefault("threadCutting", rates)
        if not apply:
            return {"preview": True, "rows": len(rates), "active": state[0], "revision": state[1]}
        backup_dir = ROOT / "work" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / ("before-thread-tariffs-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".sqlite")
        with closing(sqlite3.connect(backup)) as destination:
            connection.backup(destination)
        connection.execute("BEGIN IMMEDIATE")
        current = connection.execute("SELECT active_id,revision,draft_json FROM base_value_state WHERE id=1").fetchone()
        if current != state:
            raise ValueError("Базовые значения изменены параллельно; повторите предварительную проверку.")
        version = "thread-cutting-20261029-" + uuid.uuid4().hex[:12]
        author = "Импорт прайсов нарезки резьбы по запросу пользователя 29.10.2026"
        connection.execute("INSERT INTO base_value_versions(id,values_json,author) VALUES(?,?,?)", (version, json.dumps(active, ensure_ascii=False), author))
        connection.execute("UPDATE base_value_state SET active_id=?,draft_json=?,draft_author=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1", (version, json.dumps(draft, ensure_ascii=False), author))
        connection.commit()
        return {"created": True, "rows": len(rates), "active": version, "backup": str(backup)}
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(publish(args.database, args.apply), ensure_ascii=False, indent=2))
