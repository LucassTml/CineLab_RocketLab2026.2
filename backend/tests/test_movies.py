# Testes dos requisitos de filmes: cadastro, catálogo paginado, detalhes,
# busca, edição e remoção. No fim, as rotas de gêneros/pessoas/produtoras.

import sqlite3

import pytest

from app.movies.service import build_fts_query
from tests.conftest import TEST_DB, create_movie, set_popularity


# --- cadastro ---
async def test_create_movie_with_basic_info(client, auth_headers) -> None:
    movie = await create_movie(
        client,
        auth_headers,
        titulo="Ainda Estou Aqui",
        ano_lancamento=2024,
        data_lancamento="2024-11-07",
        genero_ids=["g-drama"],
        diretores=["Walter Salles"],
        elenco=["Fernanda Torres", "Selton Mello"],
        produtoras=["VideoFilmes"],
        sinopse="Rio de Janeiro, 1971.",
    )

    assert movie["titulo"] == "Ainda Estou Aqui"
    assert movie["ano_lancamento"] == 2024
    assert [g["nome"] for g in movie["generos"]] == ["Drama"]
    assert [d["nome"] for d in movie["diretores"]] == ["Walter Salles"]
    assert {a["nome"] for a in movie["elenco"]} == {"Fernanda Torres", "Selton Mello"}
    assert [p["nome"] for p in movie["produtoras"]] == ["VideoFilmes"]
    assert movie["id_filme"].startswith("cl-")
    assert movie["avaliacoes"] == {
        "media": None,
        "total": 0,
        "distribuicao": [{"estrelas": (i + 1) / 2, "total": 0} for i in range(10)],
        "media_estrelas": None,
    }


async def test_create_movie_requires_authentication(client) -> None:
    response = await client.post("/movies", json={"titulo": "X", "ano_lancamento": 2020})
    assert response.status_code == 401


async def test_create_movie_validates_fields(client, auth_headers) -> None:
    cases = [
        {"ano_lancamento": 2020},  # sem título
        {"titulo": "X"},  # sem ano
        {"titulo": "X", "ano_lancamento": 1700},  # ano fora do intervalo
        {"titulo": "X", "ano_lancamento": 2020, "data_lancamento": "2019-01-01"},  # ano ≠ data
        {"titulo": "X", "ano_lancamento": 2020, "url_poster": "ftp://x"},  # URL inválida
        {"titulo": "X", "ano_lancamento": 2020, "status_filme": "Cancelado"},  # status inválido
        {"titulo": "   ", "ano_lancamento": 2020},  # título em branco
    ]
    for payload in cases:
        response = await client.post("/movies", json=payload, headers=auth_headers)
        assert response.status_code == 422, payload


async def test_create_movie_rejects_unknown_genre(client, auth_headers) -> None:
    response = await client.post(
        "/movies",
        json={"titulo": "X", "ano_lancamento": 2020, "genero_ids": ["nao-existe"]},
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert "nao-existe" in response.json()["detail"]


async def test_create_movie_rejects_duplicate_external_id(client, auth_headers) -> None:
    await create_movie(client, auth_headers, id_filme="12345")
    response = await client.post(
        "/movies",
        json={"titulo": "Outro", "ano_lancamento": 2020, "id_filme": "12345"},
        headers=auth_headers,
    )
    assert response.status_code == 409


async def test_people_are_reused_case_insensitively(client, auth_headers) -> None:
    first = await create_movie(client, auth_headers, diretores=["Greta Gerwig"])
    second = await create_movie(client, auth_headers, titulo="Outro", diretores=["greta gerwig"])

    assert first["diretores"][0]["id"] == second["diretores"][0]["id"]


async def test_create_movie_keeps_one_performance_row(client, auth_headers) -> None:
    """O catálogo usa INNER JOIN com a tabela de fatos; todo filme precisa de uma linha."""

    movie = await create_movie(client, auth_headers)
    with sqlite3.connect(TEST_DB) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM fact_movies_performance WHERE sk_movie_id = ?", (movie["id"],)
        ).fetchone()[0]
    assert count == 1
    assert movie["desempenho"] is None  # sem métricas, o bloco não é exibido


# --- listagem paginada ---
async def test_catalog_is_paginated(client, auth_headers) -> None:
    for index in range(5):
        movie = await create_movie(client, auth_headers, titulo=f"Filme {index}")
        set_popularity(movie["id"], float(index))

    page1 = (await client.get("/movies", params={"page_size": 2})).json()
    page3 = (await client.get("/movies", params={"page_size": 2, "page": 3})).json()

    assert page1["total"] == 5
    assert page1["pages"] == 3
    assert [m["titulo"] for m in page1["items"]] == ["Filme 4", "Filme 3"]  # mais populares
    assert [m["titulo"] for m in page3["items"]] == ["Filme 0"]


async def test_catalog_page_beyond_last_is_empty(client, auth_headers) -> None:
    await create_movie(client, auth_headers)
    data = (await client.get("/movies", params={"page": 99})).json()
    assert data["items"] == []
    assert data["total"] == 1


async def test_catalog_card_has_average_and_directors(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers, diretores=["Ana"], genero_ids=["g-action"])
    for nota in (8, 6):
        await client.post(
            f"/movies/{movie['id']}/reviews",
            json={"nome": "X", "nota": nota, "comentario": "ok"},
            headers=auth_headers,
        )

    card = (await client.get("/movies")).json()["items"][0]
    assert card["nota_media"] == 7.0
    assert card["total_avaliacoes"] == 2
    assert card["diretores"] == ["Ana"]
    assert card["generos"] == ["Action"]


async def test_catalog_sorting(client, auth_headers) -> None:
    b = await create_movie(client, auth_headers, titulo="Bravo", ano_lancamento=2010)
    a = await create_movie(client, auth_headers, titulo="Alfa", ano_lancamento=2022)
    await create_movie(client, auth_headers, titulo="Charlie", ano_lancamento=2015)
    await client.post(
        f"/movies/{b['id']}/reviews",
        json={"nome": "X", "nota": 9, "comentario": "ok"},
        headers=auth_headers,
    )
    await client.post(
        f"/movies/{a['id']}/reviews",
        json={"nome": "X", "nota": 4, "comentario": "ok"},
        headers=auth_headers,
    )

    async def titles(**params) -> list[str]:
        return [m["titulo"] for m in (await client.get("/movies", params=params)).json()["items"]]

    assert await titles(sort="titulo") == ["Alfa", "Bravo", "Charlie"]
    assert await titles(sort="titulo", order="desc") == ["Charlie", "Bravo", "Alfa"]
    assert await titles(sort="ano") == ["Alfa", "Charlie", "Bravo"]
    # Ordenar por nota lista só os filmes avaliados.
    assert await titles(sort="nota") == ["Bravo", "Alfa"]
    assert await titles(sort="nota", order="asc") == ["Alfa", "Bravo"]


# --- filtros ---
async def test_catalog_filters(client, auth_headers) -> None:
    await create_movie(
        client, auth_headers, titulo="Ação 2018", ano_lancamento=2018, genero_ids=["g-action"]
    )
    await create_movie(
        client,
        auth_headers,
        titulo="Ação Drama 2021",
        ano_lancamento=2021,
        genero_ids=["g-action", "g-drama"],
        status_filme="Pós-Produção",
    )
    await create_movie(
        client, auth_headers, titulo="Drama 2023", ano_lancamento=2023, genero_ids=["g-drama"]
    )

    async def titles(**params) -> set[str]:
        return {m["titulo"] for m in (await client.get("/movies", params=params)).json()["items"]}

    assert await titles(genero="g-action") == {"Ação 2018", "Ação Drama 2021"}
    # Vários gêneros combinam com E.
    assert await titles(genero=["g-action", "g-drama"]) == {"Ação Drama 2021"}
    assert await titles(ano_min=2020) == {"Ação Drama 2021", "Drama 2023"}
    assert await titles(ano_min=2019, ano_max=2022) == {"Ação Drama 2021"}
    assert await titles(status="Pós-Produção") == {"Ação Drama 2021"}


async def test_filter_by_person_and_rating(client, auth_headers) -> None:
    nolan = await create_movie(
        client, auth_headers, titulo="Tenet", diretores=["Christopher Nolan"]
    )
    await create_movie(client, auth_headers, titulo="Barbie", diretores=["Greta Gerwig"])
    await client.post(
        f"/movies/{nolan['id']}/reviews",
        json={"nome": "X", "nota": 9, "comentario": "ok"},
        headers=auth_headers,
    )
    person_id = nolan["diretores"][0]["id"]

    by_person = (await client.get("/movies", params={"pessoa": person_id})).json()
    rated = (await client.get("/movies", params={"nota_min": 8})).json()

    assert [m["titulo"] for m in by_person["items"]] == ["Tenet"]
    assert [m["titulo"] for m in rated["items"]] == ["Tenet"]


async def test_catalog_rejects_invalid_filters(client) -> None:
    assert (
        await client.get("/movies", params={"ano_min": 2020, "ano_max": 2010})
    ).status_code == 422
    assert (await client.get("/movies", params={"page_size": 500})).status_code == 422
    assert (await client.get("/movies", params={"sort": "xyz"})).status_code == 422
    assert (await client.get("/movies", params={"parametro_inexistente": 1})).status_code == 422


# --- busca ---
async def test_search_by_title_prefix_accents_and_case(client, auth_headers) -> None:
    await create_movie(client, auth_headers, titulo="O Fabuloso Destino de Amélie Poulain")
    await create_movie(client, auth_headers, titulo="The Matrix")
    await create_movie(client, auth_headers, titulo="Toy Story")

    async def search(q: str) -> list[str]:
        return [m["titulo"] for m in (await client.get("/movies", params={"q": q})).json()["items"]]

    assert await search("amelie") == ["O Fabuloso Destino de Amélie Poulain"]
    assert await search("MATR") == ["The Matrix"]
    assert await search("story toy") == ["Toy Story"]  # ordem das palavras não importa
    assert set(await search("matrix, toy story")) == {"The Matrix", "Toy Story"}  # vários filmes
    assert await search("inexistente") == []


async def test_search_is_safe_against_fts_syntax(client, auth_headers) -> None:
    await create_movie(client, auth_headers, titulo="Near Dark")
    for q in ['"', "AND", "NOT (", "*", "near dark NEAR/2", "' OR 1=1 --"]:
        response = await client.get("/movies", params={"q": q})
        assert response.status_code == 200, q


async def test_search_index_follows_title_updates_and_deletes(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers, titulo="Titulo Antigo")
    await client.patch(
        f"/movies/{movie['id']}", json={"titulo": "Titulo Novo"}, headers=auth_headers
    )

    assert (await client.get("/movies", params={"q": "antigo"})).json()["total"] == 0
    assert (await client.get("/movies", params={"q": "novo"})).json()["total"] == 1

    await client.delete(f"/movies/{movie['id']}", headers=auth_headers)
    assert (await client.get("/movies", params={"q": "novo"})).json()["total"] == 0


# --- detalhes ---
async def test_get_movie_detail_and_404(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers, roteiristas=["Roteirista A"])

    detail = (await client.get(f"/movies/{movie['id']}")).json()
    missing = await client.get("/movies/nao-existe")

    assert detail["titulo"] == movie["titulo"]
    assert [r["nome"] for r in detail["roteiristas"]] == ["Roteirista A"]
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Filme não encontrado."}


async def test_similar_movies_share_genres(client, auth_headers) -> None:
    base = await create_movie(client, auth_headers, genero_ids=["g-action", "g-drama"])
    await create_movie(
        client, auth_headers, titulo="Dois em comum", genero_ids=["g-action", "g-drama"]
    )
    await create_movie(client, auth_headers, titulo="Um em comum", genero_ids=["g-action"])
    await create_movie(client, auth_headers, titulo="Nenhum", genero_ids=["g-comedy"])

    similar = (await client.get(f"/movies/{base['id']}/similar")).json()
    assert [m["titulo"] for m in similar] == ["Dois em comum", "Um em comum"]


# --- atualização e remoção ---
async def test_update_movie_partially(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers, elenco=["Ator 1"], diretores=["Dir 1"])

    response = await client.patch(
        f"/movies/{movie['id']}",
        json={"titulo": "Novo Título", "diretores": ["Dir 2"], "genero_ids": ["g-comedy"]},
        headers=auth_headers,
    )

    updated = response.json()
    assert response.status_code == 200
    assert updated["titulo"] == "Novo Título"
    assert updated["sinopse"] == movie["sinopse"]  # campo não enviado é mantido
    assert [d["nome"] for d in updated["diretores"]] == ["Dir 2"]
    assert [a["nome"] for a in updated["elenco"]] == ["Ator 1"]  # papel não enviado é mantido
    assert [g["nome"] for g in updated["generos"]] == ["Comedy"]


async def test_update_rejects_removing_required_fields(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    for payload in ({"titulo": None}, {"ano_lancamento": None}):
        response = await client.patch(f"/movies/{movie['id']}", json=payload, headers=auth_headers)
        assert response.status_code == 422


async def test_update_and_delete_require_authentication(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    assert (await client.patch(f"/movies/{movie['id']}", json={"titulo": "x"})).status_code == 401
    assert (await client.delete(f"/movies/{movie['id']}")).status_code == 401


async def test_delete_movie_cascades_to_reviews_and_links(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers)
    await client.post(
        f"/movies/{movie['id']}/reviews",
        json={"nome": "X", "nota": 7, "comentario": "ok"},
        headers=auth_headers,
    )

    response = await client.delete(f"/movies/{movie['id']}", headers=auth_headers)

    assert response.status_code == 204
    assert (await client.get(f"/movies/{movie['id']}")).status_code == 404
    with sqlite3.connect(TEST_DB) as conn:
        for table in (
            "movie_reviews",
            "dim_reviews",
            "bridge_movie_genre",
            "fact_movies_performance",
        ):
            remaining = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE sk_movie_id = ?",  # noqa: S608
                (movie["id"],),
            ).fetchone()[0]
            assert remaining == 0, table


async def test_delete_missing_movie_returns_404(client, auth_headers) -> None:
    response = await client.delete("/movies/nao-existe", headers=auth_headers)
    assert response.status_code == 404


# --- montagem da consulta de busca ---


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("matrix", '("matrix"*)'),
        ("  Toy   Story ", '("Toy"* AND "Story"*)'),
        ("matrix, toy story", '("matrix"*) OR ("toy"* AND "story"*)'),
        ("amélie", '("amélie"*)'),
        ("Schindler's List", '("Schindler"* AND "s"* AND "List"*)'),
        # Operadores FTS digitados viram texto comum entre aspas.
        ('NOT "x" (NEAR', '("NOT"* AND "x"* AND "NEAR"*)'),
        (",,;|", None),
        ("", None),
        (None, None),
        ("!!!", None),
    ],
)
def test_build_fts_query(raw: str | None, expected: str | None) -> None:
    assert build_fts_query(raw) == expected


def test_build_fts_query_limits_word_count() -> None:
    query = build_fts_query(" ".join(f"w{i}" for i in range(50)))
    assert query is not None
    assert query.count("*") == 12


# --- gêneros, pessoas e produtoras ---


async def test_genres_list_with_counts(client, auth_headers) -> None:
    await create_movie(client, auth_headers, genero_ids=["g-drama", "g-action"])

    genres = (await client.get("/genres")).json()

    assert [g["nome"] for g in genres] == ["Action", "Comedy", "Drama"]
    assert {g["nome"]: g["total_filmes"] for g in genres} == {"Action": 1, "Comedy": 0, "Drama": 1}


async def test_people_autocomplete_ranks_by_movie_count(client, auth_headers) -> None:
    await create_movie(client, auth_headers, titulo="A", diretores=["Nolan Lawlor"])
    await create_movie(client, auth_headers, titulo="B", diretores=["Christopher Nolan"])
    await create_movie(client, auth_headers, titulo="C", diretores=["Christopher Nolan"])
    await create_movie(client, auth_headers, titulo="D", elenco=["Nolan Ator"])

    directors = (await client.get("/people", params={"q": "nolan", "tipo": "Diretor"})).json()
    anyone = (await client.get("/people", params={"q": "nol"})).json()

    assert [(p["nome"], p["total_filmes"]) for p in directors] == [
        ("Christopher Nolan", 2),
        ("Nolan Lawlor", 1),
    ]
    assert {p["nome"] for p in anyone} == {"Christopher Nolan", "Nolan Lawlor", "Nolan Ator"}
    assert (await client.get("/people", params={"q": "n"})).status_code == 422  # mín. 2 letras


async def test_people_and_company_lookup_by_id(client, auth_headers) -> None:
    movie = await create_movie(client, auth_headers, diretores=["Ana"], produtoras=["Estúdio X"])
    person_id = movie["diretores"][0]["id"]
    company_id = movie["produtoras"][0]["id"]

    person = (await client.get(f"/people/{person_id}")).json()
    companies = (await client.get("/companies", params={"q": "estúdio"})).json()
    company = (await client.get(f"/companies/{company_id}")).json()

    assert person == {"id": person_id, "nome": "Ana", "tipo": "Diretor", "total_filmes": 1}
    assert [c["nome"] for c in companies] == ["Estúdio X"]
    assert company["total_filmes"] == 1
    assert (await client.get("/people/nao-existe")).status_code == 404


async def test_like_wildcards_are_escaped(client, auth_headers) -> None:
    await create_movie(client, auth_headers, diretores=["Ana Maria"])
    assert (await client.get("/people", params={"q": "%%"})).json() == []
    assert (await client.get("/people", params={"q": "__"})).json() == []
