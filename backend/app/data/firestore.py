import json
import time
import sys
import logging
import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core.exceptions import DeadlineExceeded, ServiceUnavailable

# --- Logging ---
logging.basicConfig(
    filename="firestore_upload.log",
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# --- Firebase Init ---
cred = credentials.Certificate(
    r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\core\firebase_key.json"
)
firebase_admin.initialize_app(cred)
db = firestore.client()

# --- Load JSON ---
with open(
    r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\data\unified_drugs_with_pils_v.json",
    "r",
    encoding="utf-8",
) as f:
    drugs = json.load(f)

# --- Config ---
MAX_BATCH_DOCS = 500       # Firestore doc limit
MAX_BATCH_SIZE = 9 * 1024 * 1024  # 9 MiB safety margin
RETRY_LIMIT = 5

def safe_commit(batch, attempt=1):
    """Commit with retry on transient errors"""
    try:
        batch.commit()
        return True
    except (DeadlineExceeded, ServiceUnavailable) as e:
        if attempt <= RETRY_LIMIT:
            wait_time = 2 ** attempt
            print(f"⚠️ Commit failed (attempt {attempt}), retrying in {wait_time}s...")
            time.sleep(wait_time)
            return safe_commit(batch, attempt + 1)
        else:
            print(f"❌ Failed after {RETRY_LIMIT} retries: {e}")
            return False

# --- Upload ---
batch = db.batch()
count, total_uploaded, current_size = 0, 0, 0

for i, drug in enumerate(drugs, start=1):
    doc_ref = db.collection("drugs").document(str(drug["unified_id"]))
    batch.set(doc_ref, drug)

    # Roughly estimate size in bytes
    doc_size = len(json.dumps(drug).encode("utf-8"))
    current_size += doc_size
    count += 1

    if count >= MAX_BATCH_DOCS or current_size >= MAX_BATCH_SIZE:
        if safe_commit(batch):
            total_uploaded += count
            msg = f"✅ Committed {count} docs (total {total_uploaded}/{len(drugs)})"
            print(msg)
            logging.info(msg)
        batch = db.batch()
        count, current_size = 0, 0
        time.sleep(0.2)

# Commit remaining
if count > 0:
    if safe_commit(batch):
        total_uploaded += count
        msg = f"✅ Final commit of {count} docs (total {total_uploaded}/{len(drugs)})"
        print(msg)
        logging.info(msg)

print("🎉 Upload complete")
logging.info("🎉 Upload complete")
