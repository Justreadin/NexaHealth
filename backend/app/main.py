# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.core.middleware import AuthMiddleware
from app.core.db import firebase_manager

load_dotenv()

app = FastAPI(
    title="NexaHealth API",
    debug=True,
    version="0.1.0"
)

# Update your CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:*",
        "http://127.0.0.1:*",
        "http://localhost:5501",
        "http://127.0.0.1:5501",
        "https://nexahealth.vercel.app",
        "https://www.nexahealth.life",

    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600
)
# Add authentication middleware
app.middleware("http")(AuthMiddleware.authenticate)

# Import routers after middleware setup
from app.routers import (
    auth, guest, verify, report, map, nearby, 
    ai_companion, feedback, pils, dashboard, test_verify, test_report, test_pil,
    count, referral
)

app.include_router(auth.router)
app.include_router(guest.router)
app.include_router(verify.router)
app.include_router(report.router)
app.include_router(map.router)
app.include_router(nearby.router)
app.include_router(ai_companion.router)
app.include_router(feedback.router)
app.include_router(pils.router)
app.include_router(dashboard.router)
app.include_router(test_verify.router)
app.include_router(test_report.router)
app.include_router(test_pil.router)
app.include_router(count.router) 
app.include_router(referral.router)

# Static files
from fastapi.staticfiles import StaticFiles
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/")
@app.head("/")
async def root():
    return {"message": "NexaHealth - Your AI Health Companion"}

@app.get("/health")
async def health_check():
    try:
        # Verify Firebase connection
        firebase_manager._verify_firebase_connection()
        return {"status": "healthy", "services": ["firebase", "database"]}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}