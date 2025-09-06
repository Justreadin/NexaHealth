import json
import time
import os
import logging
import multiprocessing as mp
import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core.exceptions import DeadlineExceeded, ServiceUnavailable

# --- Logging ---
logging.basicConfig(
    filename="firestore_upload.log",
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# --- Firebase Init (done once per worker) ---
cred = credentials.Certificate(
    r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\core\firebase_key.json"
)

def init_worker():
    if not firebase_admin._apps:  # prevent re-init
        firebase_admin.initialize_app(cred)
    global db
    db = firestore.client()

# --- Config ---
MAX_BATCH_DOCS = 250       # Firestore doc limit
MAX_BATCH_SIZE = 9 * 1024 * 1024  # 9 MiB safety margin
RETRY_LIMIT = 5
CHECKPOINT_FILE = "checkpoint.txt"

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
            logging.error(f"Failed after retries: {e}")
            return False

def upload_chunk(chunk, start_index, total_docs):
    """Upload one chunk of documents to Firestore"""
    batch = db.batch()
    count, current_size, uploaded = 0, 0, 0

    for idx, drug in enumerate(chunk, start=start_index):
        doc_id = str(drug["unified_id"])
        doc_ref = db.collection("drugs").document(doc_id)
        batch.set(doc_ref, drug)

        doc_size = len(json.dumps(drug).encode("utf-8"))
        current_size += doc_size
        count += 1

        if count >= MAX_BATCH_DOCS or current_size >= MAX_BATCH_SIZE:
            if safe_commit(batch):
                uploaded += count
                msg = f"✅ Committed {count} docs (total {idx+1}/{total_docs})"
                print(msg)
                logging.info(msg)
                # Save checkpoint
                with open(CHECKPOINT_FILE, "w") as cp:
                    cp.write(str(idx+1))
            batch = db.batch()
            count, current_size = 0, 0
            time.sleep(0.1)

    if count > 0:
        if safe_commit(batch):
            uploaded += count
            msg = f"✅ Final commit of {count} docs (total {start_index+len(chunk)}/{total_docs})"
            print(msg)
            logging.info(msg)
            with open(CHECKPOINT_FILE, "w") as cp:
                cp.write(str(start_index+len(chunk)))
    return uploaded

if __name__ == "__main__":
    # --- Load JSON ---
    with open(
        r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\data\unified_drugs_with_pils_v.json",
        "r",
        encoding="utf-8",
    ) as f:
        drugs = json.load(f)

    total_docs = len(drugs)
    print(f"📦 Total docs to upload: {total_docs}")

    # --- Resume ---
    start_index = 0
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, "r") as cp:
            start_index = int(cp.read().strip())
        print(f"⏩ Resuming from index {start_index}")

    # Slice docs to upload
    docs_to_upload = drugs[start_index:]

    # --- Parallel Upload ---
    workers = 4  # adjust based on CPU + Firestore limits
    chunk_size = len(docs_to_upload) // workers
    chunks = [
        docs_to_upload[i:i+chunk_size] for i in range(0, len(docs_to_upload), chunk_size)
    ]

    with mp.get_context("spawn").Pool(workers, initializer=init_worker) as pool:
        results = [
            pool.apply_async(upload_chunk, (chunk, start_index + i*chunk_size, total_docs))
            for i, chunk in enumerate(chunks)
        ]
        total_uploaded = sum(r.get() for r in results)

    print(f"🎉 Upload complete: {total_uploaded} docs uploaded.")
    logging.info(f"🎉 Upload complete: {total_uploaded} docs uploaded.")
