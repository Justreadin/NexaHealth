import os
import json
import firebase_admin
from firebase_admin import credentials, firestore, auth
from dotenv import load_dotenv
import base64
from google.auth.transport import requests
from google.oauth2 import service_account
import logging
from datetime import datetime, timedelta
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class FirebaseManager:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(FirebaseManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self._initialize_firebase()
            self._initialized = True

    def _initialize_firebase(self, retry_count=0):
        """Initialize Firebase Admin SDK with retry logic"""
        max_retries = 3
        try:
            firebase_key_b64 = os.getenv("FIREBASE_KEY")
            if not firebase_key_b64:
                raise ValueError("FIREBASE_KEY is not set in env.")

            firebase_key_json_str = base64.b64decode(firebase_key_b64).decode('utf-8')
            firebase_key_json = json.loads(firebase_key_json_str)

            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_key_json)
                firebase_admin.initialize_app(cred)
                logger.info("Firebase initialized")

            self._verify_firebase_connection()

        except Exception as e:
            logger.error(f"Firebase init error (try {retry_count + 1}): {str(e)}")
            if retry_count < max_retries - 1:
                self._initialize_firebase(retry_count + 1)
            else:
                raise

    def _verify_firebase_connection(self):
        try:
            auth.list_users(max_results=1)
            logger.debug("Firebase connection OK")
        except Exception as e:
            raise RuntimeError(f"Firebase connection failed: {e}")

    def refresh_firebase_token(self):
        try:
            firebase_key_b64 = os.getenv("FIREBASE_KEY")
            firebase_key_json_str = base64.b64decode(firebase_key_b64).decode('utf-8')
            firebase_key_json = json.loads(firebase_key_json_str)

            creds = service_account.Credentials.from_service_account_info(
                firebase_key_json,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            creds.refresh(requests.Request())
            logger.info("Firebase token refreshed")
            return creds.token
        except Exception as e:
            logger.error(f"Token refresh failed: {str(e)}")
            raise

    def get_firestore_client(self):
        try:
            self._verify_firebase_connection()
            return firestore.client()
        except Exception:
            self.refresh_firebase_token()
            return firestore.client()

# Initialize Firebase Manager
firebase_manager = FirebaseManager()
db = firebase_manager.get_firestore_client()

# Utility: Firestore Server Timestamp
def get_server_timestamp():
    return firestore.SERVER_TIMESTAMP


users_collection = db.collection("users")
reports_collection = db.collection("reports")
stats_collection = db.collection("stats")

# -------------------------------
# 🔒 ROLE-BASED UTILITY FUNCTIONS
# -------------------------------

def get_user_role(user_id: str) -> Optional[str]:
    """
    Returns the **primary** role. If multiple exist, pick the highest.
    """
    print("🔥 USING get_user_role FROM db.py ✅")
    doc = users_collection.document(user_id).get()
    if doc.exists:
        data = doc.to_dict()
        roles = data.get("roles", [])

        if not roles:
            return "user"  # default fallback

        # Order of priority
        priority = ["admin", "pharmacy", "user"]
        for role in priority:
            if role in roles:
                return role

    return None

def user_has_role(user_id: str, role: str) -> bool:
    doc = users_collection.document(user_id).get()
    if doc.exists:
        roles = doc.to_dict().get("roles", [])
        return role in roles
    return False


def is_admin(user: dict) -> bool:
    return user and user.get("role") == "admin"

def is_pharmacist(user: dict) -> bool:
    return user and user.get("role") == "pharmacy"

def is_user(user: dict) -> bool:
    return user and user.get("role") == "user"

def set_user_role(user_id: str, role: str):
    """Assign role inside 'roles' array instead of old 'role' field"""
    if role not in ["user", "pharmacy", "admin"]:
        raise ValueError("Invalid role")
    
    doc_ref = users_collection.document(user_id)
    doc = doc_ref.get()
    
    if doc.exists:
        data = doc.to_dict()
        roles = data.get("roles", [])
        if role not in roles:
            roles.append(role)
        doc_ref.set({"roles": roles}, merge=True)
    else:
        doc_ref.set({"roles": [role]}, merge=True)

# Optional: Fetch full user data
def get_user_profile(user_id: str) -> Optional[dict]:
    doc = users_collection.document(user_id).get()
    if doc.exists:
        return doc.to_dict()
    return None

def initialize_stats_collection():
    """Ensure required stats documents exist"""
    required_stats = [
        "verifications",
        "reports"
    ]
    
    for stat in required_stats:
        doc_ref = stats_collection.document(stat)
        if not doc_ref.get().exists:
            doc_ref.set({
                "count": 0,
                "created_at": get_server_timestamp(),
                "updated_at": get_server_timestamp()
            })

# Initialize stats collection on import
initialize_stats_collection()

# Exported
__all__ = [
    'db', 'get_server_timestamp',
    'users_collection', 'reports_collection',
    'stats_collection',
    'firebase_manager',
    'get_user_role', 'set_user_role',
    'get_user_profile',
    'is_admin', 'is_pharmacy', 'is_user'
]
