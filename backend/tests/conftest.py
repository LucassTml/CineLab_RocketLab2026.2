# Configuração dos testes.
# Cada execução usa um banco SQLite temporário criado pelas migrações do Alembic
# (assim os testes também conferem as migrações, a tabela FTS5 e os triggers).
# As variáveis de ambiente precisam ser definidas antes de importar o app.

import os
import sqlite3
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

_TMP_DIR = Path(tempfile.mkdtemp(prefix="cinelab-tests-"))
TEST_DB = _TMP_DIR / "test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB.as_posix()}"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "senha-de-teste"
os.environ["JWT_SECRET_KEY"] = "segredo-exclusivo-dos-testes-com-tamanho-suficiente-123"
os.environ["DATABASE_ECHO"] = "false"

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.cache import invalidate_query_cache  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import RESET_ORDER  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
GENRES = {"g-action": "Action", "g-drama": "Drama", "g-comedy": "Comedy"}


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
def clean_database(migrated_database: None) -> None:
    with sqlite3.connect(TEST_DB) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("DELETE FROM movies_search")
        for table in RESET_ORDER:
            conn.execute(f"DELETE FROM {table}")  # noqa: S608 - nomes fixos
        conn.executemany(
            "INSERT INTO dim_genres (sk_genre_id, nome_genero) VALUES (?, ?)", GENRES.items()
        )
    invalidate_query_cache()


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


@pytest.fixture
async def auth_headers(client: httpx.AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/auth/login", json={"username": "admin", "password": "senha-de-teste"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def create_movie(
    client: httpx.AsyncClient, headers: dict[str, str], **overrides: object
) -> dict:
    payload = {
        "titulo": "Filme de Teste",
        "ano_lancamento": 2020,
        "sinopse": "Uma sinopse.",
        "genero_ids": ["g-drama"],
        "diretores": ["Diretora Exemplo"],
    }
    payload.update(overrides)
    response = await client.post("/movies", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def set_popularity(movie_id: str, popularity: float) -> None:
    # popularidade não é editável pela API, então mexo direto no banco
    with sqlite3.connect(TEST_DB) as conn:
        conn.execute(
            "UPDATE fact_movies_performance SET popularidade = ? WHERE sk_movie_id = ?",
            (popularity, movie_id),
        )
