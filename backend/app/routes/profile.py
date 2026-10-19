from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.security import get_user, get_db
from app.services.materials import include_syllabus_details

router = APIRouter(tags=["perfil e painel"])


class ProfileUpdate(BaseModel):
    full_name: str = Field(default="", max_length=160)
    school_name: str | None = Field(default=None, max_length=160)


@router.get("/dashboard")
def dashboard(user=Depends(get_user), db=Depends(get_db)):
    syllabi = db.table("syllabi").select("id", count="exact", head=True).eq("user_id", user["id"]).execute()
    materials = db.table("materials").select("id,title,kind,subject,created_at,updated_at,syllabus_id").eq("user_id", user["id"]).order("updated_at", desc=True).limit(5).execute()
    return {"syllabi_count": syllabi.count or 0, "materials_count": db.table("materials").select("id", count="exact", head=True).eq("user_id", user["id"]).execute().count or 0, "recent_materials": include_syllabus_details(materials.data, user["id"], db)}


@router.get("/profile")
def get_profile(user=Depends(get_user), db=Depends(get_db)):
    rows = db.table("profiles").select("full_name,school_name,created_at,updated_at").eq("id", user["id"]).execute().data
    if not rows:
        raise HTTPException(404, "Perfil não encontrado.")
    return rows[0]


@router.patch("/profile")
def update_profile(body: ProfileUpdate, user=Depends(get_user), db=Depends(get_db)):
    rows = db.table("profiles").update(body.model_dump()).eq("id", user["id"]).select("full_name,school_name,created_at,updated_at").execute().data
    if not rows:
        raise HTTPException(404, "Perfil não encontrado.")
    return rows[0]
