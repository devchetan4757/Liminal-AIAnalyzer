from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from app.config import settings
from app.db.session import init_db
from app.routers import analyze, chat, auth, history

app = FastAPI(title="Malware Analysis Chatbot API")
init_db()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# ROUTES
# =========================

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(analyze.router, prefix="/api/analyze", tags=["analyze"])
app.include_router(history.router, prefix="/api/history", tags=["history"])

# =========================
# STATIC FRONTEND
# =========================

app.mount(
    "/assets",
    StaticFiles(directory="../frontend/dist/assets"),
    name="assets"
)

# =========================
# FRONTEND SERVING
# =========================

@app.get("/")
async def root():
    return FileResponse("../frontend/dist/index.html")

@app.head("/")
async def root_head():
    return Response(status_code=200)

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    file_path = os.path.join("../frontend/dist/", full_path)
    if full_path and os.path.exists(file_path):
        return FileResponse(file_path)
    return FileResponse("../frontend/dist/index.html")
