from datetime import datetime, timedelta
from uuid import UUID
import hashlib
import json
from typing import Dict, Optional
import sqlite3
from app.models.guest_model import GuestSession
from app.core.db import db, get_server_timestamp
from app.core.db_sqlite import get_connection

# Optional in-memory cache
guest_sessions: Dict[UUID, GuestSession] = {}

MAX_GUEST_TRIALS = 5  # Set your trial limit

def create_guest_table():
    """Ensure the SQLite table exists"""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS guest_sessions (
                id TEXT PRIMARY KEY,
                ip_hash TEXT,
                user_agent TEXT,
                created_at TEXT,
                expires_at TEXT,
                request_count INTEGER,
                feature_usage TEXT,
                temp_data TEXT,
                csrf_token TEXT,
                device_id TEXT,
                referrer TEXT,
                screen_resolution TEXT,
                accepted_features TEXT
            )
        """)
create_guest_table()


def save_guest_session(session: GuestSession):
    """Persist session to SQLite"""
    with get_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO guest_sessions (
                id, ip_hash, user_agent, created_at, expires_at, 
                request_count, feature_usage, temp_data, csrf_token,
                device_id, referrer, screen_resolution, accepted_features
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(session.id),
            session.ip_hash,
            session.user_agent,
            session.created_at.isoformat(),
            session.expires_at.isoformat(),
            session.request_count,
            json.dumps(session.feature_usage),
            json.dumps(session.temp_data),
            session.csrf_token,
            session.device_id,
            str(session.referrer) if session.referrer else None,
            session.screen_resolution,
            json.dumps(session.accepted_features) if session.accepted_features else None
        ))


def load_guest_session(session_id: UUID) -> Optional[GuestSession]:
    """Load session from SQLite or memory"""
    if session_id in guest_sessions:
        return guest_sessions[session_id]

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM guest_sessions WHERE id = ?", (str(session_id),)).fetchone()
        if row:
            session = GuestSession(
                id=UUID(row[0]),
                ip_hash=row[1],
                user_agent=row[2],
                created_at=datetime.fromisoformat(row[3]),
                expires_at=datetime.fromisoformat(row[4]),
                request_count=row[5],
                feature_usage=json.loads(row[6]),
                temp_data=json.loads(row[7]),
                csrf_token=row[8],
                device_id=row[9],
                referrer=row[10],
                screen_resolution=row[11],
                accepted_features=json.loads(row[12]) if row[12] else None
            )
            guest_sessions[session.id] = session
            return session
    return None


def initialize_guest_session(session_id: UUID, ip_address: str, user_agent: str) -> GuestSession:
    """Initialize a new guest session if it doesn't exist"""
    session = load_guest_session(session_id)
    if session:
        return session

    ip_hash = create_ip_hash(ip_address, user_agent)
    session = GuestSession(
        id=session_id,
        ip_hash=ip_hash,
        user_agent=user_agent
    )
    guest_sessions[session_id] = session
    save_guest_session(session)
    return session


def increment_guest_usage(session_id: UUID, feature_name: str = 'risk_assessment'):
    """Increment guest usage count for specific feature"""
    session = load_guest_session(session_id)
    if not session:
        raise ValueError("Session not found")

    session.request_count += 1
    session.feature_usage[feature_name] = session.feature_usage.get(feature_name, 0) + 1
    guest_sessions[session_id] = session
    save_guest_session(session)


def check_guest_limit(session_id: UUID) -> bool:
    """Check if guest has exceeded trial limit"""
    session = load_guest_session(session_id)
    if not session:
        return True  # Fail-safe block

    return (
        session.request_count >= MAX_GUEST_TRIALS or
        session.feature_usage.get("risk_assessment", 0) >= MAX_GUEST_TRIALS
    )


def create_ip_hash(ip: str, user_agent: str) -> str:
    return hashlib.sha256(f"{ip}{user_agent}".encode()).hexdigest()


async def migrate_guest_data(user_id: str, guest_session_id: UUID):
    session = load_guest_session(guest_session_id)
    if not session:
        return

    try:
        user_ref = db.collection("users").document(user_id)
        user_ref.update({
            "guest_data": session.temp_data,
            "guest_usage_stats": {
                "total_requests": session.request_count,
                "feature_usage": session.feature_usage
            },
            "guest_converted_at": get_server_timestamp(),
            "original_ip_hash": session.ip_hash,
            "original_user_agent": session.user_agent
        })
    except Exception as e:
        # 🔴 Log but don't break login flow
        import logging
        logging.error(f"[migrate_guest_data] Failed to update Firestore: {e}")
    
    guest_sessions.pop(guest_session_id, None)



def cleanup_expired_sessions():
    """Clean expired sessions from memory (not DB)"""
    now = datetime.utcnow()
    expired = [sid for sid, s in guest_sessions.items() if s.expires_at < now]
    for sid in expired:
        guest_sessions.pop(sid, None)


def delete_guest_session(session_id: UUID):
    """Delete guest session from SQLite database"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM guest_sessions WHERE id = ?", (str(session_id),))
    conn.commit()
    conn.close()

__all__ = [
    'guest_sessions',
    'initialize_guest_session',
    'create_ip_hash',
    'check_guest_limit',
    'increment_guest_usage',
    'migrate_guest_data',
    'cleanup_expired_sessions',
    'delete_guest_session',  # <== Add this
    'MAX_GUEST_TRIALS'
]
