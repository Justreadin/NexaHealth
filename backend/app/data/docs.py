import json

file_path = r"C:\Users\USER\PycharmProjects\NexaHealth_Live\backend\app\data\unified_drugs_with_pils_v.json"

# Count raw lines in the file
with open(file_path, "r", encoding="utf-8") as f:
    line_count = sum(1 for _ in f)

print(f"📄 Total lines in file: {line_count}")

# Count JSON objects
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

if isinstance(data, list):
    print(f"🧾 Total JSON objects: {len(data)}")
else:
    print("⚠️ JSON is not a list — top-level structure is a dictionary.")
