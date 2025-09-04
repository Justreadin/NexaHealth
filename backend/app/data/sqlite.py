import json
import sqlite3
from pathlib import Path

# Paths
JSON_FILE = Path("app/data/unified_drugs_with_pils_v3.json")
DB_FILE = Path("app/data/drugs.db")

# Connect to SQLite
conn = sqlite3.connect(DB_FILE)
c = conn.cursor()

# Create table (flatten nested fields where necessary)
c.execute("""
CREATE TABLE IF NOT EXISTS drugs (
    nexahealth_id INTEGER PRIMARY KEY,
    unified_id TEXT,
    product_name TEXT,
    generic_name TEXT,
    dosage_form TEXT,
    strength TEXT,
    description TEXT,
    composition TEXT,
    pack_size TEXT,
    atc_code TEXT,
    category TEXT,
    nafdac_reg_no TEXT,
    product_id INTEGER,
    manufacturer_name TEXT,
    manufacturer_country TEXT,
    approval_date TEXT,
    expiry_date TEXT,
    approval_status TEXT,
    verification_status TEXT,
    smpc_url TEXT,
    pil_storage TEXT
)
""")

# Load JSON and insert into DB
with open(JSON_FILE, encoding="utf-8") as f:
    drugs = json.load(f)

for d in drugs:
    identifiers = d.get("identifiers", {})
    manufacturer = d.get("manufacturer", {})
    approval = d.get("approval", {})
    verification = d.get("verification", {})
    documents = d.get("documents", {})
    smpc = documents.get("smpc", {})
    pil = documents.get("pil", {})

    c.execute("""
    INSERT INTO drugs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        d.get("nexahealth_id"),
        d.get("unified_id"),
        d.get("product_name"),
        d.get("generic_name"),
        d.get("dosage_form"),
        d.get("strength"),
        d.get("description"),
        d.get("composition"),
        d.get("pack_size"),
        d.get("atc_code"),
        d.get("category"),
        identifiers.get("nafdac_reg_no"),
        identifiers.get("product_id"),
        manufacturer.get("name"),
        manufacturer.get("country"),
        approval.get("approval_date"),
        approval.get("expiry_date"),
        approval.get("status"),
        verification.get("status"),
        smpc.get("url"),
        pil.get("storage"),
    ))

conn.commit()
conn.close()
print("✅ JSON successfully converted to SQLite!")
