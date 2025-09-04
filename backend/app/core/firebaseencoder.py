import base64, json

with open("firebase_key.json", "r") as f:
    encoded = base64.b64encode(f.read().encode()).decode()
    print(encoded)
