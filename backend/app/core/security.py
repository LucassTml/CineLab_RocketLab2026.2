# Autenticação do administrador com JWT.
# /auth/login confere usuário e senha do .env e devolve um token; as rotas de
# escrita usam a dependência AdminUser, que valida o header Authorization.

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

# auto_error=False para devolver 401 com mensagem própria em vez do 403 padrão
bearer_scheme = HTTPBearer(auto_error=False)


def verify_credentials(username: str, password: str) -> bool:
    settings = get_settings()
    # compare_digest compara em tempo constante (evita timing attack)
    user_ok = secrets.compare_digest(username.encode(), settings.admin_username.encode())
    pass_ok = secrets.compare_digest(password.encode(), settings.admin_password.encode())
    return user_ok and pass_ok


def create_access_token(subject: str) -> tuple[str, datetime]:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "role": "admin", "exp": expires_at}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_access_token(token: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Sessão expirada. Faça login novamente.") from exc
    except jwt.InvalidTokenError as exc:
        raise _unauthorized("Token inválido.") from exc

    subject = payload.get("sub")
    if payload.get("role") != "admin" or not isinstance(subject, str):
        raise _unauthorized("Token sem permissão de administrador.")
    return subject


async def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Autenticação necessária.")
    return decode_access_token(credentials.credentials)


AdminUser = Annotated[str, Depends(require_admin)]
