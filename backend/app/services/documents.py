from io import BytesIO


def extract_text(filename: str, content: bytes) -> str:
    suffix = filename.lower().rsplit(".", 1)[-1]
    try:
        if suffix == "pdf":
            from pypdf import PdfReader
            pages = PdfReader(BytesIO(content)).pages
            text = "\n".join(page.extract_text() or "" for page in pages)
        elif suffix == "docx":
            from docx import Document
            text = "\n".join(p.text for p in Document(BytesIO(content)).paragraphs)
        else:
            raise ValueError("Formato não suportado. Envie PDF ou DOCX.")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Não foi possível ler este documento. Confira o arquivo e tente novamente.") from exc
    text = text.strip()
    if not text:
        raise ValueError("O documento não contém texto legível. Envie um PDF pesquisável ou um DOCX com texto.")
    return text[:200_000]
