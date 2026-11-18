import asyncio
import io
import os
import zipfile
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from cryptography.fernet import Fernet
from docx import Document
from pypdf import PdfReader, PdfWriter
from backend.documents import extract, export, MAX_FILE, clean
from backend.prompts import relevant, SYSTEM, TASKS
from backend.services import Account, Store, selected_key, authenticate, presentation_text
import backend.services as services
import app as web

MATERIAL = {"title": "Frações e situações do cotidiano", "student": "# Atividade\nLeia e resolva com atenção.\n\n| Parte | Quantidade |\n| --- | --- |\n| Maçãs | 3 |\n| Pães | 6 |\n\nExplique sua estratégia.", "teacher": "# Gabarito\nObserve a justificativa. Não atribua nota sem critérios."}


def test_txt_utf8_and_separation():
    data, mime = export(MATERIAL, "txt")
    assert "Frações" in data.decode("utf-8")
    assert "Orientações e gabarito" in data.decode("utf-8")
    assert "Gabarito" not in export(MATERIAL, "txt", "student")[0].decode()
    assert mime.startswith("text/plain")


def test_blank_answer_lines_are_preserved():
    assert clean('Resposta: ____________________') == 'Resposta: ____________________'
    assert clean('__Título__ e **ênfase**') == 'Título e ênfase'


def test_legacy_material_markdown_is_cleaned_for_exports():
    legacy = "### Título\n*texto em itálico*\n---\n```\n[Material](https://exemplo.test)\n```"
    result = clean(legacy)
    assert '#' not in result and '*' not in result and '`' not in result
    assert '---' not in result and 'Título' in result and 'texto em itálico' in result
    data, _ = export({"title": "Teste", "student": legacy, "teacher": ""}, "txt")
    exported = data.decode("utf-8")
    assert '#' not in exported and '*' not in exported and '`' not in exported
    docx, _ = export({"title": "Teste", "student": legacy, "teacher": ""}, "docx")
    exported_docx = "\n".join(p.text for p in Document(io.BytesIO(docx)).paragraphs)
    assert '#' not in exported_docx and '*' not in exported_docx and '`' not in exported_docx


def test_model_presentation_removes_markdown_markers():
    text = presentation_text('# Título\n**Texto**\n* Item\n| Coluna A | Coluna B |\n| --- | --- |\n---\n```\n[Guia](https://exemplo.test)\n```')
    assert '#' not in text and '*' not in text and '`' not in text and '|' not in text
    assert 'Título' in text and '- Item' in text and 'Coluna A • Coluna B' in text and 'Guia' in text


def test_docx_dimensions_font_tables_and_pagebreak():
    data, mime = export(MATERIAL, "docx")
    d = Document(io.BytesIO(data))
    assert d.styles["Normal"].font.name == "Arial"
    assert d.styles["Normal"].font.size.pt == 12
    assert d.styles["Normal"].paragraph_format.line_spacing == 1.5
    assert d.sections[0].page_width.cm == pytest.approx(21, abs=.01)
    assert d.sections[0].top_margin.cm == pytest.approx(3, abs=.01)
    assert d.sections[0].right_margin.cm == pytest.approx(2, abs=.01)
    assert d.tables[0].cell(1,0).text == "Maçãs"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert b'w:type="page"' in z.read("word/document.xml")
    assert "Frações" in extract("a.docx", data)


def test_pdf_requires_explicit_arial(monkeypatch):
    monkeypatch.delenv("ARIAL_FONT_PATH", raising=False)
    with pytest.raises(HTTPException) as e:
        export(MATERIAL, "pdf")
    assert e.value.status_code == 503
    assert "Arial" in e.value.detail


@pytest.mark.skipif(not os.getenv("TEST_ARIAL_PATH"), reason="Arial local não informada")
def test_pdf_real_arial_layout(monkeypatch):
    monkeypatch.setenv("ARIAL_FONT_PATH", os.environ["TEST_ARIAL_PATH"])
    monkeypatch.setenv("ARIAL_LICENSE_CONFIRMED", "true")
    data, mime = export(MATERIAL, "pdf")
    reader = PdfReader(io.BytesIO(data))
    assert len(reader.pages) == 2
    assert float(reader.pages[0].mediabox.width) == pytest.approx(595.28, abs=.1)
    assert "Maçãs" in reader.pages[0].extract_text()
    assert "Gabarito" not in reader.pages[0].extract_text()
    assert "Gabarito" in reader.pages[1].extract_text()
    assert mime == "application/pdf"


def test_file_validation_and_empty_pdf():
    for name, content in [("a.exe",b"hello"),("a.pdf",b"not pdf"),("a.txt",b"\xff"),("a.txt",b"x"*(MAX_FILE+1))]:
        with pytest.raises(HTTPException): extract(name,content)
    writer=PdfWriter();writer.add_blank_page(width=600,height=800);f=io.BytesIO();writer.write(f)
    with pytest.raises(HTTPException) as e: extract("scan.pdf",f.getvalue())
    assert "OCR" in e.value.detail
    assert extract("acentos.txt", "Ação e educação".encode()) == "Ação e educação"


def test_retrieval_bounded_and_relevant():
    source = "Conteúdo de geografia. "*2000 + "FRAÇÕES equivalentes denominador numerador. "*20
    result = relevant(source, "frações denominador", 4000)
    assert "FRAÇÕES" in result and len(result) <= 4000
    assert "parcial" in result


def test_eight_tasks_and_pedagogical_rules():
    assert len(TASKS)==8
    assert "infantilizar" in TASKS['adaptar'][1]
    assert "critérios" in TASKS['revisar'][1]
    assert "Não invente" in TASKS['relatar'][1]


def test_missing_and_invalid_auth(monkeypatch):
    with pytest.raises(HTTPException) as e: asyncio.run(authenticate(None))
    assert e.value.status_code==401
    monkeypatch.setenv("SUPABASE_URL","https://test.supabase.co");monkeypatch.setenv("SUPABASE_ANON_KEY","public")
    import httpx
    monkeypatch.setattr(services,"fetch_authenticated_user",AsyncMock(return_value=httpx.Response(401,json={})))
    with pytest.raises(HTTPException) as e: asyncio.run(authenticate("Bearer invalid"))
    assert e.value.status_code==401


def test_store_enforces_owner_filter(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL","https://test.supabase.co");monkeypatch.setenv("SUPABASE_ANON_KEY","public")
    import httpx
    store=Store(Account("user-a","jwt-a"))
    store.request=AsyncMock(return_value=httpx.Response(200,json=[]))
    asyncio.run(store.rows("files",user_id="eq.user-b"))
    assert store.request.call_args.kwargs["params"]["user_id"]=="eq.user-a"
    with pytest.raises(HTTPException) as e: asyncio.run(store.one("files","other-file"))
    assert e.value.status_code==404


def test_key_selection_no_fallback(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL","https://test.supabase.co");monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY","server")
    monkeypatch.setenv("GEMINI_API_KEY","project-key")
    secret=Fernet.generate_key();monkeypatch.setenv("KEY_ENCRYPTION_SECRET",secret.decode())
    encrypted=Fernet(secret).encrypt(b"personal-key").decode()
    monkeypatch.setattr(Store,"rows",AsyncMock(return_value=[{"mode":"personal","encrypted_key":encrypted}]))
    assert asyncio.run(selected_key(Account("a","t")))==("personal-key","personal")
    monkeypatch.setattr(Store,"rows",AsyncMock(return_value=[{"mode":"personal","encrypted_key":"broken"}]))
    with pytest.raises(HTTPException):asyncio.run(selected_key(Account("a","t")))
    monkeypatch.setattr(Store,"rows",AsyncMock(return_value=[{"mode":"project","encrypted_key":encrypted}]))
    assert asyncio.run(selected_key(Account("a","t")))==("project-key","project")


def test_public_shell_private_routes_and_no_secrets(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY","never-public-secret")
    with TestClient(web.app) as client:
        assert client.get('/').status_code==200
        assert client.get('/api/state').status_code==401
        assert 'never-public-secret' not in client.get('/api/config').text
        assert "frame-ancestors 'none'" in client.get('/').headers['content-security-policy']


def test_version_and_material_api_ownership(monkeypatch):
    web.app.dependency_overrides[web.account]=lambda:Account("user-a","jwt-a")
    monkeypatch.setenv("SUPABASE_URL","https://test.supabase.co");monkeypatch.setenv("SUPABASE_ANON_KEY","public")
    monkeypatch.setattr(Store,"rows",AsyncMock(return_value=[]))
    try:
        with TestClient(web.app) as client:
            for path in ['versions','materials','files','conversations']:
                assert client.get('/api/'+path+'/00000000-0000-0000-0000-000000000002').status_code==404
    finally:web.app.dependency_overrides.clear()


def test_conversation_reference_is_not_mutable(monkeypatch):
    with TestClient(web.app) as client:
        assert client.patch('/api/conversations/00000000-0000-0000-0000-000000000002',json={'version_id':None}).status_code==405


def test_invalid_key_payload_is_never_echoed():
    web.app.dependency_overrides[web.account]=lambda:Account('a','t')
    try:
        with TestClient(web.app) as client:
            result=client.put('/api/key',json={'mode':'personal','key':'SECRET'})
            assert result.status_code==422
            assert 'SECRET' not in result.text
    finally:web.app.dependency_overrides.clear()


def test_database_security_contract():
    from pathlib import Path
    sql=Path('supabase/migrations/001_eduplan.sql').read_text(encoding='utf-8')
    assert 'foreign key(version_id,user_id)' in sql
    assert 'foreign key(conversation_id,user_id)' in sql
    assert 'unique(syllabus_id,version)' in sql
    assert "from anon, authenticated" in sql
    assert 'pg_advisory_xact_lock' in sql
    assert 'save_exchange' in sql


def test_modern_secret_key_is_not_sent_as_jwt(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://test.supabase.co')
    server_key = 'sb_' + 'secret_example_only'
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', server_key)
    store = Store(admin=True)
    assert store.headers == {'apikey': server_key}
    public_key = 'sb_' + 'publishable_example_only'
    monkeypatch.setenv('SUPABASE_ANON_KEY', public_key)
    store = Store(Account('a', 'user-session-jwt'))
    assert store.headers['Authorization'] == 'Bearer user-session-jwt'
    assert store.headers['apikey'] == public_key


@pytest.mark.parametrize('status,content,expected', [(204,b'',None),(200,b'',None),(200,b'true',True),(200,b'{"version":1}',{'version':1})])
def test_rpc_accepts_void_and_json_responses(monkeypatch,status,content,expected):
    import httpx
    monkeypatch.setenv('SUPABASE_URL','https://test.supabase.co')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','sb_' + 'secret_test')
    store=Store(admin=True)
    store.request=AsyncMock(return_value=httpx.Response(status,content=content))
    assert asyncio.run(store.rpc('test_function',{})) == expected
