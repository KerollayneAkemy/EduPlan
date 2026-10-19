from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import auth, syllabi, materials, profile

app = FastAPI(title="EduPlan API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth.router, prefix="/api")
app.include_router(syllabi.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
app.include_router(profile.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "eduplan-api"}
