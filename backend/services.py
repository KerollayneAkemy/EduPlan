import os
import re
import json
from dataclasses import dataclass
import httpx
from fastapi import HTTPException
from cryptography.fernet import Fernet, InvalidToken
from google import genai
from google.genai import types, errors
from pydantic import BaseModel, Field


def env(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(503, "O serviço ainda precisa ser configurado pelo responsável pelo projeto.")
    return value


@dataclass
class Account:
    id: str
    token: str


class Store:
    def __init__(self, account=None, admin=False):
        self.account = account
        self.url = env("SUPABASE_URL").rstrip("/")
        key = env("SUPABASE_SERVICE_ROLE_KEY" if admin else "SUPABASE_ANON_KEY")
        self.headers = {"apikey": key}
        # Modern Supabase secret keys are API keys, not JWTs.
        # User sessions still require their verified bearer token for RLS.
        if not admin:
            self.headers["Authorization"] = f"Bearer {account.token}"
        elif not key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {key}"

    async def request(self, method, path, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.request(method, self.url + path, headers=headers, **kwargs)
        except httpx.HTTPError:
            raise HTTPException(503, "Falha de conexão com o armazenamento. Tente novamente.") from None
        if response.status_code >= 400:
            raise HTTPException(503, "Não foi possível salvar ou consultar os dados. Verifique a configuração e tente novamente.")
        return response

    async def rows(self, table, **filters):
        params = {"select": "*", **filters}
        if self.account:
            params["user_id"] = "eq." + self.account.id
        return (await self.request("GET", "/rest/v1/" + table, params=params)).json()

    async def one(self, table, id):
        rows = await self.rows(table, id="eq." + str(id), limit="1")
        if not rows:
            raise HTTPException(404, "Item não encontrado nesta conta.")
        return rows[0]

    async def insert(self, table, data, upsert=False):
        data = {**data, "user_id": self.account.id} if self.account else data
        prefer = "return=representation" + (",resolution=merge-duplicates" if upsert else "")
        return (await self.request("POST", "/rest/v1/" + table, json=data, headers={"Prefer": prefer})).json()[0]

    async def patch(self, table, id, data):
        return (await self.request("PATCH", "/rest/v1/" + table,
            params={"id": "eq." + str(id), "user_id": "eq." + self.account.id}, json=data,
            headers={"Prefer": "return=representation"})).json()

    async def rpc(self, name, data):
        response = await self.request("POST", "/rest/v1/rpc/" + name, json=data)
        # PostgREST returns an empty response for PostgreSQL functions returning void.
        return response.json() if response.content.strip() else None


async def fetch_authenticated_user(token):
    """Validate a Supabase access token without exposing it beyond this request."""
    async with httpx.AsyncClient(timeout=15) as client:
        return await client.get(env("SUPABASE_URL") + "/auth/v1/user",
            headers={"apikey": env("SUPABASE_ANON_KEY"), "Authorization": "Bearer " + token})


async def authenticate(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Entre com sua conta Google para continuar.")
    token = authorization[7:]
    try:
        result = await fetch_authenticated_user(token)
    except httpx.HTTPError:
        raise HTTPException(503, "Não foi possível verificar sua sessão. Verifique a conexão.") from None
    if result.status_code != 200:
        raise HTTPException(401, "Sua sessão expirou. Entre novamente.")
    return Account(result.json()["id"], token)


def cipher():
    try:
        return Fernet(env("KEY_ENCRYPTION_SECRET").encode())
    except ValueError:
        raise HTTPException(503, "A proteção das chaves precisa ser configurada pelo responsável.") from None


async def selected_key(account):
    rows = await Store(admin=True).rows("ai_secrets", user_id="eq." + account.id)
    if rows and rows[0]["mode"] == "personal":
        try:
            return cipher().decrypt(rows[0]["encrypted_key"].encode()).decode(), "personal"
        except (InvalidToken, AttributeError):
            raise HTTPException(503, "Não foi possível abrir sua chave. Salve-a novamente nas configurações.") from None
    return env("GEMINI_API_KEY"), "project"


class Material(BaseModel):
    title: str = Field(max_length=200)
    student: str = Field(max_length=40000)
    teacher: str = Field(max_length=20000)


class Answer(BaseModel):
    reply: str = Field(max_length=12000)
    material: Material | None = None


def presentation_text(value: str) -> str:
    """Remove Markdown markers from model output while retaining readable structure."""
    value = re.sub(r"^\s*#{1,6}\s*", "", value, flags=re.MULTILINE)
    value = value.replace("**", "").replace("`", "")
    value = re.sub(r"^\s*\*\s+", "- ", value, flags=re.MULTILINE).replace("*", "×")
    lines = []
    for line in value.splitlines():
        stripped = line.strip()
        if stripped and re.fullmatch(r"\|?[\s:|-]+\|?", stripped):
            continue
        if "|" in line:
            line = " • ".join(cell.strip() for cell in line.strip().strip("|").split("|") if cell.strip())
        lines.append(line)
    return "\n".join(lines).strip()


async def generate(key, system, contents):
    try:
        async with genai.Client(api_key=key, http_options=types.HttpOptions(timeout=85000)).aio as client:
            result = await client.models.generate_content(model=env("GEMINI_MODEL"), contents=contents,
                config=types.GenerateContentConfig(system_instruction=system, temperature=0.35,
                    max_output_tokens=6000, response_mime_type="application/json", response_schema=Answer))
        answer = Answer.model_validate_json(result.text or "{}")
        answer.reply = presentation_text(answer.reply)
        if answer.material:
            answer.material.title = presentation_text(answer.material.title)
            answer.material.student = presentation_text(answer.material.student)
            answer.material.teacher = presentation_text(answer.material.teacher)
        return answer
    except errors.APIError as exc:
        if exc.code in (400, 401, 403):
            raise HTTPException(422, "A chave da IA ou o modelo não foi aceito. Confira a chave selecionada em Configurações; você pode escolher a chave do projeto.") from None
        if exc.code == 429:
            raise HTTPException(429, "A chave selecionada atingiu o limite da API. Aguarde ou escolha outra chave nas configurações. Nenhuma troca automática foi feita.") from None
        raise HTTPException(503, "A IA está indisponível neste momento. Tente novamente.") from None
    except Exception:
        raise HTTPException(503, "A IA não concluiu uma resposta válida. Tente novamente; nenhuma chave foi trocada.") from None
