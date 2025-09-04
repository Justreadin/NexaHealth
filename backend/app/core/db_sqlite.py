# core/db_sqlite.py

import sqlite3
from pathlib import Path

DB_FILE = Path(__file__).parent.parent / "data" / "guest_sessions.db"
DB_FILE.parent.mkdir(parents=True, exist_ok=True)

def get_connection():
    return sqlite3.connect(DB_FILE, check_same_thread=False)
