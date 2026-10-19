from io import BytesIO

import pytest
from docx import Document
from reportlab.pdfgen import canvas

from app.services.documents import extract_text


def make_docx(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    result = BytesIO()
    document.save(result)
    return result.getvalue()


def test_extracts_docx_text():
    assert extract_text("ementa.docx", make_docx("Ecossistemas e biodiversidade")) == "Ecossistemas e biodiversidade"


def test_rejects_unsupported_document():
    with pytest.raises(ValueError, match="Formato não suportado"):
        extract_text("ementa.txt", b"texto")


def test_reports_docx_without_readable_text():
    with pytest.raises(ValueError, match="não contém texto legível"):
        extract_text("ementa.docx", make_docx("   "))


def test_reports_corrupt_docx():
    with pytest.raises(ValueError, match="Não foi possível ler"):
        extract_text("ementa.docx", b"arquivo incompleto")


def test_extracts_searchable_pdf_text():
    result = BytesIO()
    pdf = canvas.Canvas(result)
    pdf.drawString(72, 720, "Conteúdo previsto na ementa")
    pdf.save()
    assert "Conteúdo previsto na ementa" in extract_text("ementa.pdf", result.getvalue())
