"""Grant admin to one existing local D1 account; back up before any write."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--email", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
candidates = list((root / ".wrangler/state/v3/d1/miniflare-D1DatabaseObject").glob("[0-9a-f]" * 64 + ".sqlite"))
if len(candidates) != 1:
    raise SystemExit("Expected exactly one local D1 database; no changes made.")
connection = sqlite3.connect(candidates[0])
email = args.email.strip().lower()
rows = connection.execute("SELECT id FROM users WHERE lower(email)=?", (email,)).fetchall()
if len(rows) != 1:
    raise SystemExit("Expected exactly one existing account with this email; no changes made.")
backup_dir = root / ".wrangler/backups"
backup_dir.mkdir(parents=True, exist_ok=True)
backup_path = backup_dir / ("before-user-admin-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".sqlite")
with sqlite3.connect(backup_path) as backup:
    connection.backup(backup)
with connection:
    for table, column, definition in [
        ("users", "role", "TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'))"),
        ("users", "revision", "INTEGER NOT NULL DEFAULT 0"),
        ("sessions", "last_seen_at", "TEXT"),
    ]:
        if column not in {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    connection.execute("UPDATE users SET role='admin',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role!='admin'", (rows[0][0],))
role = connection.execute("SELECT role FROM users WHERE id=?", (rows[0][0],)).fetchone()[0]
connection.close()
print(f"{email}: {role}. Local backup: {backup_path}")
