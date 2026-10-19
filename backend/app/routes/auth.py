from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from supabase import create_client
from app.config import settings
from app.security import get_user, bearer
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter(prefix="/auth", tags=["autenticação"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=160)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=16, max_length=4096)


class PasswordUpdate(BaseModel):
    password: str = Field(min_length=8, max_length=128)


@router.post("/signup", status_code=201)
def signup(body: Credentials):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "Autenticação ainda não configurada no servidor.")
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    try:
        result = client.auth.sign_up({"email": body.email, "password": body.password, "options": {"data": {"full_name": body.full_name}}})
        return {"user": result.user.model_dump() if result.user else None, "session": result.session.model_dump() if result.session else None}
    except Exception as exc:
        raise HTTPException(400, "Não foi possível criar a conta. Verifique o e-mail e tente novamente.") from exc


@router.post("/login")
def login(body: Credentials):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "Autenticação ainda não configurada no servidor.")
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    try:
        result = client.auth.sign_in_with_password({"email": body.email, "password": body.password})
        return {"user": result.user.model_dump(), "session": result.session.model_dump() if result.session else None}
    except Exception as exc:
        raise HTTPException(401, "E-mail ou senha inválidos.") from exc


@router.post("/forgot-password", status_code=202)
def forgot_password(body: EmailStr):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "Autenticação ainda não configurada no servidor.")
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    try:
        client.auth.reset_password_email(str(body))
    except Exception as exc:
        raise HTTPException(502, "Não foi possível solicitar a recuperação agora. Tente novamente mais tarde.") from exc
    return {"message": "Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha."}


@router.post("/logout", status_code=204)
def logout(body: RefreshRequest, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(401, "Faça login para continuar.")
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "Autenticação ainda não configurada no servidor.")
    try:
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        client.auth.set_session(credentials.credentials, body.refresh_token)
        client.auth.sign_out(options={"scope": "local"})
    except Exception as exc:
        raise HTTPException(401, "Sessão inválida ou expirada.") from exc
    return None


@router.post("/refresh")
def refresh(body: RefreshRequest):
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "Autenticação ainda não configurada no servidor.")
    try:
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        result = client.auth.refresh_session(body.refresh_token)
        if not result.session:
            raise ValueError("missing refreshed session")
        return {"user": result.user.model_dump(), "session": result.session.model_dump()}
    except Exception as exc:
        raise HTTPException(401, "Não foi possível renovar a sessão. Entre novamente.") from exc


@router.post("/update-password")
def update_password(body: PasswordUpdate, user=Depends(get_user)):
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(503, "Autenticação ainda não configurada no servidor.")
    try:
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        client.auth.admin.update_user_by_id(user["id"], {"password": body.password})
    except Exception as exc:
        raise HTTPException(502, "Não foi possível atualizar a senha agora. Solicite uma nova recuperação de senha.") from exc
    return {"message": "Senha atualizada."}


@router.get("/me")
def me(user=Depends(get_user)):
    return user
