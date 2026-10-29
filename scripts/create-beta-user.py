"""Create one verified local tester. Does not overwrite accounts or change roles."""
import argparse
import base64
from datetime import datetime, timezone
import getpass
import hashlib
from pathlib import Path
import re
import secrets
import sqlite3
import sys
import uuid

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--role', choices=['base', 'plus', 'pro', 'admin'], default='base')
    parser.add_argument('--state-dir', default='.wrangler/beta-state')
    parser.add_argument('--password-stdin', action='store_true', help='Read one password line from stdin without echo (automation only)')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    state = Path(args.state_dir)
    if not state.is_absolute(): state = root / state
    email, name = args.email.strip().lower(), args.name.strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254 or not 2 <= len(name) <= 120:
        raise SystemExit('Invalid email or name; no changes made.')
    candidates = [p for p in state.rglob('*.sqlite') if re.fullmatch(r'[0-9a-f]{64}\.sqlite', p.name)]
    if len(candidates) != 1: raise SystemExit('Expected one local D1 database. Run npm run preview:beta first, then stop it before creating users.')
    connection = sqlite3.connect(candidates[0])
    connection.execute('PRAGMA foreign_keys=ON')
    columns = {row[1] for row in connection.execute('PRAGMA table_info(users)')}
    if not {'id', 'email', 'name', 'password_hash', 'email_verified_at', 'role', 'access_level'} <= columns:
        raise SystemExit('User migrations are missing; no changes made.')
    if connection.execute('SELECT 1 FROM users WHERE lower(email)=?', (email,)).fetchone():
        raise SystemExit('This account already exists; no changes made.')
    password = sys.stdin.readline().rstrip('\r\n') if args.password_stdin else getpass.getpass('Password (10-256 characters): ')
    if not 10 <= len(password) <= 256: raise SystemExit('Invalid password length; no changes made.')
    if not args.password_stdin and password != getpass.getpass('Repeat password: '): raise SystemExit('Passwords do not match; no changes made.')
    salt = secrets.token_bytes(16)
    encoded = lambda value: base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 310_000, dklen=32)
    password_hash = f'pbkdf2_sha256$310000${encoded(salt)}${encoded(digest)}'
    backup = state.parent / 'beta-backups'
    backup.mkdir(parents=True, exist_ok=True)
    backup_path = backup / f'before-create-user-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%f}.sqlite'
    with sqlite3.connect(backup_path) as destination: connection.backup(destination)
    with connection:
        connection.execute('INSERT INTO users (id,email,name,password_hash,email_verified_at,role,access_level) VALUES (?,?,?,?,CURRENT_TIMESTAMP,?,?)', (str(uuid.uuid4()), email, name, password_hash, 'admin' if args.role == 'admin' else 'user', 'base' if args.role == 'admin' else args.role))
    connection.close()
    print(f'Created local tester: {email} ({args.role}). Backup: {backup_path}')

if __name__ == '__main__': main()
