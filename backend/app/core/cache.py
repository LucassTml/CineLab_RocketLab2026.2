# Cache simples em memória com tempo de expiração.
# Usado nas consultas pesadas (dashboard, gêneros, filmes semelhantes).
# Toda escrita chama invalidate_query_cache(), então não aparece dado velho.

import time
from collections.abc import Awaitable, Callable
from threading import Lock
from typing import Any

from app.core.config import get_settings


class TTLCache:
    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.monotonic():
                del self._data[key]
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + self._ttl, value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    async def get_or_set(self, key: str, factory: Callable[[], Awaitable[Any]]) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = await factory()
        self.set(key, value)
        return value


query_cache = TTLCache(ttl_seconds=get_settings().cache_ttl_seconds)


def invalidate_query_cache() -> None:
    query_cache.clear()
