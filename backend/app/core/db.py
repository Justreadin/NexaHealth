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
        """Initialize Firebase Admin SDK with error handling and retry logic"""
        max_retries = 3
        try:
            # Load the base64-encoded key from environment variable
            firebase_key_b64 = os.getenv("FIREBASE_KEY")
            
            if not firebase_key_b64:
                raise ValueError("FIREBASE_KEY is not set in environment variables.")

            # Decode from base64 to JSON string
            try:
                firebase_key_json_str = base64.b64decode(firebase_key_b64).decode('utf-8')
            except Exception as e:
                raise ValueError(f"Failed to decode FIREBASE_KEY from base64: {e}")

            # Parse JSON string into dictionary
            try:
                firebase_key_json = json.loads(firebase_key_json_str)
            except json.JSONDecodeError:
                raise ValueError("Decoded FIREBASE_KEY is not valid JSON.")

            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_key_json)
                firebase_admin.initialize_app(cred)
                logger.info("Firebase Admin SDK initialized successfully")
                
            # Verify the credentials work
            self._verify_firebase_connection()
            
        except Exception as e:
            logger.error(f"Firebase initialization error (attempt {retry_count + 1}): {str(e)}")
            if retry_count < max_retries - 1:
                logger.info(f"Retrying Firebase initialization... ({retry_count + 1}/{max_retries})")
                self._initialize_firebase(retry_count + 1)
            else:
                logger.error("Max retries reached for Firebase initialization")
                raise
    
    def _verify_firebase_connection(self):
        """Verify that Firebase connection is working by making a test request"""
        try:
            # Try to list users (just the first page) as a test
            auth.list_users(max_results=1)
            logger.debug("Firebase connection verified successfully")
        except Exception as e:
            logger.error(f"Firebase connection verification failed: {str(e)}")
            raise
    
    def refresh_firebase_token(self):
        """Refresh the Firebase authentication token"""
        try:
            firebase_key_b64 = os.getenv("FIREBASE_KEY")
            firebase_key_json_str = base64.b64decode(firebase_key_b64).decode('utf-8')
            firebase_key_json = json.loads(firebase_key_json_str)
            
            creds = service_account.Credentials.from_service_account_info(
                firebase_key_json,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            request = requests.Request()
            creds.refresh(request)
            logger.info("Firebase token refreshed successfully")
            return creds.token
        except Exception as e:
            logger.error(f"Failed to refresh Firebase token: {str(e)}")
            raise
    
    def get_firestore_client(self):
        """Get Firestore client with connection verification"""
        try:
            # Verify connection first
            self._verify_firebase_connection()
            return firestore.client()
        except Exception as e:
            logger.error(f"Firestore connection error: {str(e)}")
            # Try to refresh token and reconnect
            try:
                self.refresh_firebase_token()
                return firestore.client()
            except Exception as refresh_error:
                logger.error(f"Failed to recover Firestore connection: {str(refresh_error)}")
                raise

# Initialize Firebase manager
firebase_manager = FirebaseManager()

# Create Firestore client with proper imports
db = firebase_manager.get_firestore_client()

def get_server_timestamp():
    """Returns Firestore server timestamp"""
    return firestore.SERVER_TIMESTAMP

# Collections
users_collection = db.collection("users")
reports_collection = db.collection("reports")

__all__ = ['db', 'get_server_timestamp', 'users_collection', 'reports_collection', 'firebase_manager']