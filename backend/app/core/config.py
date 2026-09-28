from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Só para desenvolvimento. Em produção, definir JWT_SECRET_KEY no .env.
DEFAULT_JWT_SECRET = "dev-only-secret-change-me-in-production-0123456789"


class Settings(BaseSettings):
    """Configurações carregadas de variáveis de ambiente ou do arquivo .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_name: str = "CineLab API (RocketLab 2026.2)"
    project_version: str = "2026.2"
    environment: str = "local"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite+aiosqlite:///./rocketlab.db"
    database_echo: bool = False  # True mostra todo o SQL no terminal
    backend_cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"

    # login do administrador (só existe esse perfil, então não criei tabela de usuários)
    admin_username: str = "admin"
    admin_password: str = "rocketlab"
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 8 * 60

    cache_ttl_seconds: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()
