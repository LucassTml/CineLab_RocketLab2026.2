# Testes das avaliações (nota + resenha, média do filme) e do dashboard.

from app.core.cache import TTLCache, query_cache
from tests.conftest import create_movie


async def _review(client, headers, movie_id: str, nota: float, nome: str = "Ana") -> dict:
    response = await client.post(
        f"/movies/{movie_id}/reviews",
        json={"nome": nome, "nota": nota, "comentario": "Comentário de teste."},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_add_review_updates_average(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)

    review = await _review(client, auth_headers, movie["id"], 10)
    await _review(client, auth_headers, movie["id"], 5)

    detail = (await client.get(f"/movies/{movie['id']}")).json()
    assert review["nota"] == 10
    assert review["criado_em"].endswith("Z")  # UTC explícito para o navegador
    assert detail["avaliacoes"]["total"] == 2
    assert detail["avaliacoes"]["media"] == 7.5
    assert detail["avaliacoes"]["media_estrelas"] == 3.75


async def test_rating_distribution_uses_half_star_buckets(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    for nota in (1, 2, 9.4, 10):  # 0,5★  1★  5★(9.4 -> (9,10])  5★
        await _review(client, auth_headers, movie["id"], nota)

    buckets = {
        b["estrelas"]: b["total"]
        for b in (await client.get(f"/movies/{movie['id']}")).json()["avaliacoes"]["distribuicao"]
    }
    assert buckets[0.5] == 1
    assert buckets[1.0] == 1
    assert buckets[5.0] == 2
    assert sum(buckets.values()) == 4


async def test_review_validation(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    invalid = [
        {"nome": "Ana", "nota": 0, "comentario": "x"},  # abaixo de meia estrela
        {"nome": "Ana", "nota": 11, "comentario": "x"},
        {"nome": "", "nota": 5, "comentario": "x"},
        {"nome": "Ana", "nota": 5, "comentario": "   "},
        {"nome": "Ana", "comentario": "x"},
    ]
    for payload in invalid:
        response = await client.post(
            f"/movies/{movie['id']}/reviews", json=payload, headers=auth_headers
        )
        assert response.status_code == 422, payload


async def test_review_requires_auth_and_existing_movie(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    payload = {"nome": "Ana", "nota": 8, "comentario": "ok"}

    unauthenticated = await client.post(f"/movies/{movie['id']}/reviews", json=payload)
    missing_movie = await client.post(
        "/movies/nao-existe/reviews", json=payload, headers=auth_headers
    )

    assert unauthenticated.status_code == 401
    assert missing_movie.status_code == 404


async def test_list_reviews_is_paginated_and_sortable(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    for nota in (4, 10, 7):
        await _review(client, auth_headers, movie["id"], nota)

    page = (
        await client.get(
            f"/movies/{movie['id']}/reviews", params={"page_size": 2, "sort": "maior_nota"}
        )
    ).json()
    lowest = (
        await client.get(f"/movies/{movie['id']}/reviews", params={"sort": "menor_nota"})
    ).json()

    assert page["total"] == 3
    assert page["pages"] == 2
    assert [r["nota"] for r in page["items"]] == [10, 7]
    assert lowest["items"][0]["nota"] == 4


async def test_delete_review_recomputes_summary(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    first = await _review(client, auth_headers, movie["id"], 10)
    await _review(client, auth_headers, movie["id"], 4)

    response = await client.delete(
        f"/movies/{movie['id']}/reviews/{first['id']}", headers=auth_headers
    )
    card = (await client.get("/movies")).json()["items"][0]

    assert response.status_code == 204
    assert card["nota_media"] == 4
    assert card["total_avaliacoes"] == 1


async def test_deleting_last_review_clears_average(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    review = await _review(client, auth_headers, movie["id"], 8)

    await client.delete(f"/movies/{movie['id']}/reviews/{review['id']}", headers=auth_headers)

    card = (await client.get("/movies")).json()["items"][0]
    assert card["nota_media"] is None
    assert card["total_avaliacoes"] == 0
    # Sem avaliações, o filme sai do ranking por nota.
    assert (await client.get("/movies", params={"sort": "nota"})).json()["total"] == 0


async def test_delete_review_of_other_movie_is_404(client, auth_headers) -> None:
    movie_a = await create_movie(client, auth_headers, titulo="A")
    movie_b = await create_movie(client, auth_headers, titulo="B")
    review = await _review(client, auth_headers, movie_a["id"], 8)

    response = await client.delete(
        f"/movies/{movie_b['id']}/reviews/{review['id']}", headers=auth_headers
    )
    assert response.status_code == 404


# --- dashboard e cache ---


async def test_stats_overview(client, auth_headers) -> None:
    good = await create_movie(client, auth_headers, titulo="Bom", genero_ids=["g-drama"])
    await create_movie(client, auth_headers, titulo="Sem nota", genero_ids=["g-action"])
    for nota in (10, 8):
        await client.post(
            f"/movies/{good['id']}/reviews",
            json={"nome": "X", "nota": nota, "comentario": "ok"},
            headers=auth_headers,
        )

    stats = (await client.get("/stats")).json()

    assert stats["total_filmes"] == 2
    assert stats["total_avaliacoes"] == 2
    assert stats["filmes_avaliados"] == 1
    assert stats["media_geral"] == 9.0
    assert sum(b["total"] for b in stats["distribuicao"]) == 2
    assert [m["titulo"] for m in stats["mais_bem_avaliados"]] == ["Bom"]
    assert stats["ultimas_avaliacoes"][0]["filme_titulo"] == "Bom"
    drama = next(g for g in stats["generos"] if g["nome"] == "Drama")
    assert (drama["total_filmes"], drama["total_avaliacoes"], drama["media"]) == (1, 2, 9.0)


async def test_stats_cache_is_invalidated_by_writes(client, auth_headers) -> None:
    assert (await client.get("/stats")).json()["total_filmes"] == 0
    assert query_cache.get("stats") is not None  # ficou em cache

    await create_movie(client, auth_headers)

    assert query_cache.get("stats") is None  # a escrita limpou o cache
    assert (await client.get("/stats")).json()["total_filmes"] == 1


def test_ttl_cache_expires() -> None:
    cache = TTLCache(ttl_seconds=-1)  # expira imediatamente
    cache.set("k", 1)
    assert cache.get("k") is None
