from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from app.routers import verify, report, map, risk, nearby, ai_companion, feedback  # Add feedback
from dotenv import load_dotenv

app = FastAPI(title="NexaHealth API")

# Allow CORS from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:63342","https://nexahealth.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(verify.router)
app.include_router(report.router)
app.include_router(map.router)
app.include_router(risk.router)
app.include_router(nearby.router)
app.include_router(ai_companion.router)
app.include_router(feedback.router)  # Add this line

@app.get("/")
@app.head("/")
async def root():
    return {"message": "NexaHealth"}