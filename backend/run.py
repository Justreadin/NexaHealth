# run.py
import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))  # fallback to 8000 for local dev
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
