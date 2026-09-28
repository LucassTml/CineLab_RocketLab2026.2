# Login do administrador.

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import AdminUser, create_access_token, verify_credentials

router = APIRouter(prefix="/auth", tags=["autenticação"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    username: str


@router.post("/login", response_model=TokenResponse, summary="Login do administrador")
async def login(data: LoginRequest) -> TokenResponse:
    """Devolve um JWT. No /docs, cole o token no botão Authorize."""
    if not verify_credentials(data.username, data.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha inválidos.")
    token, expires_at = create_access_token(data.username)
    return TokenResponse(access_token=token, expires_at=expires_at, username=data.username)


@router.get("/me", summary="Usuário logado")
async def me(username: AdminUser) -> dict[str, str]:
    return {"username": username, "role": "admin"}
