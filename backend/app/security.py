from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

from app.config import settings

bearer = HTTPBearer(auto_error=False)


def get_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Faça login para continuar.")
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Autenticação ainda não configurada no servidor.")
    try:
        client = create_client(settings.supabase_url, settings.supabase_anon_key)
        user = client.auth.get_user(credentials.credentials).user
        if not user:
            raise ValueError("missing user")
        return {"id": str(user.id), "email": user.email}
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.") from exc


def get_db():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Banco de dados ainda não configurado no servidor.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
