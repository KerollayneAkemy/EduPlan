import io
import os
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape
from fastapi import HTTPException
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, LongTable, TableStyle

MAX_FILE = 3 * 1024 * 1024


def extract(name, data):
    if not data or len(data) > MAX_FILE:
        raise HTTPException(422, "Envie um arquivo de até 3 MB, não vazio.")
    suffix = Path(name).suffix.lower()
    try:
        if suffix == ".txt":
            text = data.decode("utf-8-sig")
            if "\x00" in text:
                raise ValueError()
        elif suffix == ".pdf" and data.startswith(b"%PDF"):
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted or len(reader.pages) > 150:
                raise ValueError()
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        elif suffix == ".docx" and data.startswith(b"PK"):
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if sum(i.file_size for i in z.infolist()) > 20_000_000:
                    raise ValueError()
            doc = Document(io.BytesIO(data))
            text = "\n".join(p.text for p in doc.paragraphs)
            text += "\n" + "\n".join(" | ".join(c.text for c in row.cells) for t in doc.tables for row in t.rows)
        else:
            raise ValueError()
    except Exception:
        raise HTTPException(422, "Arquivo incompatível ou danificado. Use PDF com texto (até 150 páginas), DOCX ou TXT UTF-8, sem senha.") from None
    if not text.strip():
        raise HTTPException(422, "Não há texto extraível. PDFs digitalizados precisam de OCR externo. Envie PDF com texto, DOCX ou TXT.")
    if len(text) > 250000:
        raise HTTPException(422, "O documento excede 250 mil caracteres. Divida-o em arquivos menores.")
    return text.strip()


def clean(text):
    # Remove emphasis delimiters, preserving blank answer lines such as ______.
    text = re.sub(r"(?<!_)__([^_\n]+)__(?!_)", r"\1", text)
    return text.replace("**", "").replace("`", "")


def blocks(text):
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = clean(lines[i].strip())
        if "|" in line and i+1 < len(lines) and re.match(r"^\s*\|?\s*:?-{3,}", lines[i+1]):
            rows = [[c.strip() for c in line.strip("|").split("|")]]
            i += 2
            while i < len(lines) and "|" in lines[i]:
                rows.append([clean(c.strip()) for c in lines[i].strip().strip("|").split("|")])
                i += 1
            width = max(len(r) for r in rows)
            yield "table", [r + [""] * (width-len(r)) for r in rows]
            continue
        if line:
            yield ("heading" if line.startswith("#") else "text"), line.lstrip("# ") if line.startswith("#") else line
        i += 1


def sections(material, audience):
    parts = [(material["title"], material["student"])] if audience != "teacher" else []
    if audience != "student" and material.get("teacher"):
        parts.append(("Orientações e gabarito do professor", material["teacher"]))
    return parts


def pdf_ready():
    return os.getenv("ARIAL_LICENSE_CONFIRMED") == "true" and Path(os.getenv("ARIAL_FONT_PATH", "__missing__")).is_file()


def export(material, fmt, audience="all", layout=None):
    layout = layout or {}
    margins = [layout.get(k, default) for k, default in [("top", 3), ("left", 3), ("bottom", 2), ("right", 2)]]
    spacing = layout.get("spacing", 1.5)
    parts = sections(material, audience)
    if fmt == "txt":
        return ("\n\n" + "="*45 + "\n\n").join(title + "\n\n" + text for title, text in parts).encode("utf-8"), "text/plain; charset=utf-8"
    out = io.BytesIO()
    if fmt == "docx":
        doc = Document()
        section = doc.sections[0]
        section.page_width, section.page_height = Cm(21), Cm(29.7)
        section.top_margin, section.left_margin, section.bottom_margin, section.right_margin = [Cm(m) for m in margins]
        for style_name in ["Normal", "Title", "Heading 1", "Heading 2"]:
            style = doc.styles[style_name]
            style.font.name = "Arial"
            style.font.size = Pt(12)
            style.font.color.rgb = RGBColor(0, 0, 0)
            style.paragraph_format.line_spacing = spacing
            style.paragraph_format.space_after = Pt(6)
        for n, (title, text) in enumerate(parts):
            if n:
                doc.add_page_break()
            doc.add_paragraph(title, "Title")
            for kind, value in blocks(text):
                if kind == "table":
                    table = doc.add_table(rows=0, cols=len(value[0]))
                    table.style = "Table Grid"
                    for row in value:
                        for cell, content in zip(table.add_row().cells, row):
                            cell.text = content
                else:
                    doc.add_paragraph(value, "Heading 1" if kind == "heading" else "Normal")
        doc.save(out)
        return out.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if fmt != "pdf":
        raise HTTPException(422, "Formato não suportado.")
    if not pdf_ready():
        raise HTTPException(503, "PDF indisponível: configure uma fonte Arial licenciada no servidor. Word e TXT continuam disponíveis; nenhuma fonte foi substituída.")
    pdfmetrics.registerFont(TTFont("EduArial", os.environ["ARIAL_FONT_PATH"]))
    normal = ParagraphStyle("body", fontName="EduArial", fontSize=12, leading=12*spacing, spaceAfter=6, textColor=colors.black, splitLongWords=True)
    heading = ParagraphStyle("heading", parent=normal, spaceBefore=12, spaceAfter=10, keepWithNext=True)
    cm = 72/2.54
    document = SimpleDocTemplate(out, pagesize=A4, topMargin=margins[0]*cm, leftMargin=margins[1]*cm, bottomMargin=margins[2]*cm, rightMargin=margins[3]*cm)
    story = []
    for n, (title, text) in enumerate(parts):
        if n:
            story.append(PageBreak())
        story.append(Paragraph(escape(title), heading))
        for kind, value in blocks(text):
            if kind == "table":
                table = LongTable([[Paragraph(escape(c), normal) for c in row] for row in value],
                    colWidths=[document.width/len(value[0])]*len(value[0]), repeatRows=1, splitInRow=1)
                table.setStyle(TableStyle([("GRID", (0,0),(-1,-1), .5, colors.black), ("VALIGN",(0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),6), ("RIGHTPADDING",(0,0),(-1,-1),6)]))
                story.extend([table, Spacer(1, 8)])
            else:
                story.append(Paragraph(escape(value), heading if kind == "heading" else normal))
    document.build(story)
    return out.getvalue(), "application/pdf"
