from pathlib import PurePosixPath
import uuid

from app.services.documents import extract_text

ALLOWED_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class UploadProblem(ValueError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def validate_and_extract(filename: str, content_type: str, content: bytes, max_upload_mb: int) -> tuple[str, str]:
    raw_name = PurePosixPath((filename or "ementa").replace("\\", "/")).name
    suffix = PurePosixPath(raw_name).suffix.lower()
    stem = PurePosixPath(raw_name).stem
    stem = "".join(char for char in stem if char.isprintable() and char not in "/\\")[:150].strip(" .") or "ementa"
    safe_name = f"{stem}{suffix}"
    extension = suffix.removeprefix(".")
    expected_type = ALLOWED_TYPES.get(extension)
    if expected_type is None or expected_type != content_type:
        raise UploadProblem(415, "Envie um arquivo PDF ou DOCX válido.")
    if len(content) > max_upload_mb * 1024 * 1024:
        raise UploadProblem(413, f"O arquivo deve ter no máximo {max_upload_mb} MB.")
    try:
        text = extract_text(safe_name, content)
    except ValueError as exc:
        raise UploadProblem(422, str(exc)) from exc
    return safe_name, text


def save_syllabus(*, filename: str, content_type: str, content: bytes, max_upload_mb: int, fields: dict, user: dict, db):
    safe_name, text = validate_and_extract(filename, content_type, content, max_upload_mb)
    storage_path = f"{user['id']}/{uuid.uuid4()}-{safe_name}"
    db.storage.from_("syllabi").upload(storage_path, content, {"content-type": content_type, "upsert": "false"})
    row = {"user_id": user["id"], **fields, "file_name": safe_name, "storage_path": storage_path, "extracted_text": text}
    return db.table("syllabi").insert(row).select("id,subject,education_level,school_year,academic_year,semester,file_name,created_at").execute().data[0]
