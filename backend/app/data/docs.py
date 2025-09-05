import json

# Load your big JSON file
with open(r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\data\unified_drugs_with_pils_v3.json", "r", encoding="utf-8") as f:
    drugs = json.load(f)

# Check how many docs are in the file
print(f"Total docs to upload: {len(drugs)}")
