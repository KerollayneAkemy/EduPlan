from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from app.security import get_user, get_db
from app.services.ingestion import save_syllabus, UploadProblem

router = APIRouter(prefix="/syllabi", tags=["ementas"])
@router.get("")
def list_syllabi(search: str | None = Query(default=None, max_length=120), user=Depends(get_user), db=Depends(get_db)):
    query = db.table("syllabi").select("id,subject,education_level,school_year,academic_year,semester,file_name,created_at").eq("user_id", user["id"])
    if search:
        query = query.or_(f"subject.ilike.%{search}%,file_name.ilike.%{search}%")
    return query.order("created_at", desc=True).execute().data


@router.post("", status_code=201)
async def create_syllabus(file: UploadFile = File(...), subject: str = Form(..., min_length=1, max_length=120), education_level: str = Form(..., min_length=1, max_length=80), school_year: str = Form(..., min_length=1, max_length=60), academic_year: int = Form(..., ge=2000, le=2200), semester: int = Form(...), user=Depends(get_user), db=Depends(get_db)):
    if semester not in (1, 2):
        raise HTTPException(422, "O semestre deve ser 1 ou 2.")
    from app.config import settings
    raw = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"O arquivo deve ter no máximo {settings.max_upload_mb} MB.")
    try:
        return save_syllabus(filename=file.filename or "ementa", content_type=file.content_type or "", content=raw, max_upload_mb=settings.max_upload_mb, fields={"subject":subject,"education_level":education_level,"school_year":school_year,"academic_year":academic_year,"semester":semester}, user=user, db=db)
    except UploadProblem as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc


@router.get("/{syllabus_id}")
def get_syllabus(syllabus_id: str, user=Depends(get_user), db=Depends(get_db)):
    rows = db.table("syllabi").select("id,subject,education_level,school_year,academic_year,semester,file_name,created_at,extracted_text").eq("id", syllabus_id).eq("user_id", user["id"]).execute().data
    if not rows:
        raise HTTPException(404, "Ementa não encontrada.")
    return rows[0]


@router.delete("/{syllabus_id}", status_code=204)
def delete_syllabus(syllabus_id: str, user=Depends(get_user), db=Depends(get_db)):
    rows = db.table("syllabi").select("id,storage_path").eq("id", syllabus_id).eq("user_id", user["id"]).execute().data
    if not rows:
        raise HTTPException(404, "Ementa não encontrada.")
    db.storage.from_("syllabi").remove([rows[0]["storage_path"]])
    db.table("syllabi").delete().eq("id", syllabus_id).eq("user_id", user["id"]).execute()
