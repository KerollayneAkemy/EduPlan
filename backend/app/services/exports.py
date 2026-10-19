from html import escape
from io import BytesIO


def build_export(material: dict, format: str) -> tuple[bytes, str, str]:
    output = BytesIO()
    if format == "docx":
        from docx import Document
        from docx.shared import Pt
        doc = Document()
        doc.add_heading(material["title"], 0)
        doc.add_paragraph(f"{material['subject']} • {material['kind']}")
        for line in material["content"].splitlines():
            clean = line.strip()
            if clean.startswith("### "):
                doc.add_heading(clean[4:], level=3)
            elif clean.startswith("## "):
                doc.add_heading(clean[3:], level=2)
            elif clean.startswith("# "):
                doc.add_heading(clean[2:], level=1)
            elif clean:
                doc.add_paragraph(clean)
        doc.styles["Normal"].font.size = Pt(11)
        doc.save(output)
        return output.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
    if format != "pdf":
        raise ValueError("Formato de exportação inválido. Use pdf ou docx.")
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.units import inch
    styles = getSampleStyleSheet()
    story = [Paragraph(escape(material["title"]), styles["Title"]), Paragraph(escape(f"{material['subject']} • {material['kind']}"), styles["Normal"]), Spacer(1, 0.2 * inch)]
    for line in material["content"].splitlines():
        clean = line.strip()
        if not clean:
            story.append(Spacer(1, 0.08 * inch))
        else:
            style = styles["Heading2"] if clean.startswith("## ") else styles["Heading1"] if clean.startswith("# ") else styles["BodyText"]
            clean = clean.lstrip("# ") if style != styles["BodyText"] else clean
            story.append(Paragraph(escape(clean), style))
    SimpleDocTemplate(output, pagesize=letter, rightMargin=0.75*inch, leftMargin=0.75*inch, topMargin=0.75*inch, bottomMargin=0.75*inch).build(story)
    return output.getvalue(), "application/pdf", "pdf"
