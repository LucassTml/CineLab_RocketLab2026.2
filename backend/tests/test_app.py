from datetime import UTC, datetime, timedelta

import httpx
import jwt

from app.core.config import get_settings
from app.main import app


async def test_health_check() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# --- login do administrador ---


async def test_login_returns_token(client) -> None:
    response = await client.post(
        "/auth/login", json={"username": "admin", "password": "senha-de-teste"}
    )
    body = response.json()

    assert response.status_code == 200
    assert body["token_type"] == "bearer"
    assert body["username"] == "admin"
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json() == {"username": "admin", "role": "admin"}


async def test_login_rejects_wrong_credentials(client) -> None:
    for payload in (
        {"username": "admin", "password": "errada"},
        {"username": "outro", "password": "senha-de-teste"},
    ):
        response = await client.post("/auth/login", json=payload)
        assert response.status_code == 401


async def test_protected_route_rejects_bad_tokens(client) -> None:
    settings = get_settings()
    expired = jwt.encode(
        {"sub": "admin", "role": "admin", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    forged = jwt.encode(
        {"sub": "admin", "role": "admin", "exp": datetime.now(UTC) + timedelta(hours=1)},
        "outro-segredo-qualquer-com-tamanho-suficiente",
        algorithm="HS256",
    )

    for header, detail in (
        (None, "Autenticação necessária."),
        (f"Bearer {expired}", "Sessão expirada. Faça login novamente."),
        (f"Bearer {forged}", "Token inválido."),
        ("Bearer lixo", "Token inválido."),
    ):
        headers = {"Authorization": header} if header else {}
        response = await client.get("/auth/me", headers=headers)
        assert response.status_code == 401
        assert response.json()["detail"] == detail


async def test_read_routes_are_public(client) -> None:
    for path in ("/movies", "/genres", "/years", "/stats"):
        assert (await client.get(path)).status_code == 200, path
