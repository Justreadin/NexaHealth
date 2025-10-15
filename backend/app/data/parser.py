import json

file_path = "drug_db.json"

def find_json_error(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        buffer = ""
        line_number = 0
        for line in f:
            line_number += 1
            buffer += line
            try:
                # Try to decode whatever is accumulated in the buffer
                json.loads(buffer)
                buffer = ""  # Reset buffer if successful
            except json.JSONDecodeError as e:
                # If error, check if it’s at the end of the buffer
                if e.pos < len(buffer):
                    print(f"JSON error at line {line_number}, char {e.pos}")
                    print(f"Problematic text around the error:\n{buffer[e.pos-50:e.pos+50]}")
                    return
        print("No errors found (or error at EOF)")

find_json_error(file_path)
