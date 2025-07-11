import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import base64

load_dotenv()

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

# Initialize Firebase app if not already initialized
if not firebase_admin._apps:
    cred = credentials.Certificate(firebase_key_json)
    firebase_admin.initialize_app(cred)

# Create Firestore client
db = firestore.client()
reports_collection = db.collection("reports")
