from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="NexaHealth API",
    debug=True,
    version="0.1.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:63342",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers after app creation
from app.routers import auth, guest, verify, report, map, risk, nearby, ai_companion, feedback

app.include_router(auth.router)
app.include_router(guest.router)
app.include_router(verify.router)
app.include_router(report.router)
app.include_router(map.router)
app.include_router(risk.router)
app.include_router(nearby.router)
app.include_router(ai_companion.router)
app.include_router(feedback.router)

@app.get("/")
@app.head("/")
async def root():
    return {"message": "NexaHealth - Your AI Health Companion"}