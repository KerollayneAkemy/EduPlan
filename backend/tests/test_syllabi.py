from io import BytesIO
from docx import Document
import pytest

from fastapi import HTTPException

from app.config import settings
from app.routes import syllabi as syllabus_routes
from app.services.ingestion import UploadProblem, save_syllabus, validate_and_extract
from conftest import OTHER_ID, USER_ID


def make_docx():
    document = Document()
    document.add_paragraph("Conteúdos de matemática")
    result = BytesIO()
    document.save(result)
    return result.getvalue()


def test_rejects_mismatched_extension_and_content_type():
    with pytest.raises(UploadProblem) as error:
        validate_and_extract("ementa.txt", "text/plain", b"conteudo", 15)
    assert error.value.status_code == 415


def test_rejects_upload_over_configured_size(monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    with pytest.raises(UploadProblem) as error:
        validate_and_extract("ementa.pdf", "application/pdf", b"x" * (1024 * 1024 + 1), settings.max_upload_mb)
    assert error.value.status_code == 413


def test_upload_extracts_and_persists_syllabus(test_context):
    result = save_syllabus(filename="ementa.docx", content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", content=make_docx(), max_upload_mb=15, fields={"subject":"Matemática","education_level":"Ensino Fundamental","school_year":"5º ano","academic_year":2026,"semester":1}, user={"id":USER_ID}, db=test_context)
    assert result["subject"] == "Matemática"
    assert test_context.tables["syllabi"][0]["extracted_text"] == "Conteúdos de matemática"
    assert test_context.tables["syllabi"][0]["storage_path"].startswith(f"{USER_ID}/")


def test_cannot_view_or_delete_another_users_syllabus(test_context):
    test_context.tables["syllabi"].append({"id":"55555555-5555-4555-8555-555555555555","user_id":OTHER_ID,"subject":"História","file_name":"private.docx","storage_path":f"{OTHER_ID}/private.docx","extracted_text":"Privado"})
    with pytest.raises(HTTPException) as missing:
        syllabus_routes.get_syllabus("55555555-5555-4555-8555-555555555555", user={"id":USER_ID}, db=test_context)
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as missing:
        syllabus_routes.delete_syllabus("55555555-5555-4555-8555-555555555555", user={"id":USER_ID}, db=test_context)
    assert missing.value.status_code == 404
    assert len(test_context.tables["syllabi"]) == 1
