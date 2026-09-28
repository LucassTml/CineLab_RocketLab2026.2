# Regras de negócio e consultas de filmes e avaliações.
# As rotas (app/api/v1) só chamam as funções daqui.

import math
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import Select, column, delete, func, literal_column, select, table
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import invalidate_query_cache, query_cache
from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.movies.models import (
    DimCompany,
    DimGenre,
    DimMovie,
    DimPerson,
    DimReview,
    FactMoviePerformance,
    MovieReview,
    bridge_movie_company,
    bridge_movie_genre,
    bridge_movie_person,
)
from app.movies.schemas import (
    PERSON_TYPE_TO_FIELD,
    CompanyRead,
    GenreRead,
    MovieCreate,
    MovieDetail,
    MovieFilters,
    MovieSummary,
    MovieUpdate,
    Page,
    PerformanceRead,
    PersonRead,
    RatingBucket,
    RatingSummary,
    ReviewCreate,
    ReviewRead,
)

MOVIE_NOT_FOUND = "Filme não encontrado."
REVIEW_NOT_FOUND = "Avaliação não encontrada."


# ---------------------------------------------------------------------------
# Busca textual
# ---------------------------------------------------------------------------
# movies_search é a tabela FTS5 criada na migração 0002 (mantida por triggers).
# "rank" é a coluna de relevância do FTS5 (quanto menor, mais relevante).
movies_search = table("movies_search", column("sk_movie_id"), column("titulo"), column("rank"))

_WORD = re.compile(r"\w+", re.UNICODE)
MAX_WORDS = 12


def build_fts_query(raw: str | None) -> str | None:
    """Monta a consulta FTS5 a partir do texto digitado.

    Cada palavra vira um prefixo entre aspas ("matr"* acha Matrix) e as
    palavras de um termo são combinadas com AND. Vírgula (ou ; e |) separa
    termos diferentes, então "matrix, toy story" busca os dois filmes.
    As aspas também evitam que o usuário use a sintaxe do FTS (NOT, NEAR, *).
    """
    if not raw:
        return None

    groups = []
    used = 0
    for term in re.split(r"[,;|]", raw):
        words = _WORD.findall(term)[: MAX_WORDS - used]
        if not words:
            continue
        used += len(words)
        groups.append(" AND ".join(f'"{word}"*' for word in words))
        if used >= MAX_WORDS:
            break
    if not groups:
        return None
    return " OR ".join(f"({group})" for group in groups)


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------
def star_bucket(nota: float) -> int:
    # Barra do histograma (1 a 10, uma por meia estrela) em que a nota 0-10 cai.
    return min(10, max(1, math.ceil(nota)))


def build_distribution(notas: Iterable[float]) -> list[RatingBucket]:
    counts = [0] * 10
    for nota in notas:
        counts[star_bucket(nota) - 1] += 1
    return [RatingBucket(estrelas=(i + 1) / 2, total=total) for i, total in enumerate(counts)]


def _review_to_read(review: MovieReview) -> ReviewRead:
    return ReviewRead(
        id=review.sk_movie_review_id,
        filme_id=review.sk_movie_id,
        nome=review.nome,
        nota=review.nota,
        comentario=review.comentario,
        criado_em=review.created_at,
    )


# ---------------------------------------------------------------------------
# Catálogo
# ---------------------------------------------------------------------------
def _with_catalog_joins(stmt: Select[Any], only_reviewed: bool) -> Select[Any]:
    # Todo filme tem uma linha em fact_movies_performance (os CSVs têm e o
    # create_movie cria), por isso dá para usar INNER JOIN. Com LEFT JOIN o
    # SQLite não usava o índice de popularidade e a página inicial levava ~700 ms.
    stmt = stmt.join(FactMoviePerformance, FactMoviePerformance.sk_movie_id == DimMovie.sk_movie_id)
    reviews_on = DimReview.sk_movie_id == DimMovie.sk_movie_id
    if only_reviewed:
        return stmt.join(DimReview, reviews_on)
    return stmt.outerjoin(DimReview, reviews_on)


def summary_select(only_reviewed: bool = False) -> Select[Any]:
    # Colunas usadas nos cards: filme + popularidade + média e nº de avaliações.
    return _with_catalog_joins(
        select(
            DimMovie,
            FactMoviePerformance.popularidade,
            DimReview.nota_media_usuarios,
            DimReview.qtd_avaliacoes_usuarios,
        ),
        only_reviewed,
    )


def _apply_filters(stmt: Select[Any], filters: MovieFilters) -> Select[Any]:
    # Vários gêneros = o filme precisa ter todos (E).
    # Obs: IN (subquery) ficou ~2x mais rápido que EXISTS nos testes.
    for genre_id in filters.genero:
        stmt = stmt.where(
            DimMovie.sk_movie_id.in_(
                select(bridge_movie_genre.c.sk_movie_id).where(
                    bridge_movie_genre.c.sk_genre_id == genre_id
                )
            )
        )
    if filters.ano_min is not None:
        stmt = stmt.where(DimMovie.ano_lancamento >= filters.ano_min)
    if filters.ano_max is not None:
        stmt = stmt.where(DimMovie.ano_lancamento <= filters.ano_max)
    if filters.status is not None:
        stmt = stmt.where(DimMovie.status_filme == filters.status)
    if filters.nota_min is not None:
        stmt = stmt.where(DimReview.nota_media_usuarios >= filters.nota_min)
    if filters.min_avaliacoes:
        stmt = stmt.where(DimReview.qtd_avaliacoes_usuarios >= filters.min_avaliacoes)
    if filters.pessoa:
        stmt = stmt.where(
            DimMovie.sk_movie_id.in_(
                select(bridge_movie_person.c.sk_movie_id).where(
                    bridge_movie_person.c.sk_person_id == filters.pessoa
                )
            )
        )
    if filters.produtora:
        stmt = stmt.where(
            DimMovie.sk_movie_id.in_(
                select(bridge_movie_company.c.sk_movie_id).where(
                    bridge_movie_company.c.sk_company_id == filters.produtora
                )
            )
        )
    return stmt


def _needs_reviews(filters: MovieFilters) -> bool:
    # Ranking por nota só faz sentido entre filmes avaliados. Além disso o
    # INNER JOIN deixa o SQLite usar o índice (nota, qtd) de dim_reviews.
    return (
        filters.sort in ("nota", "avaliacoes")
        or filters.nota_min is not None
        or bool(filters.min_avaliacoes)
    )


def _ordering(filters: MovieFilters, rank_column: Any | None) -> list[Any]:
    sort = filters.sort
    if sort == "relevancia" and rank_column is None:
        sort = "popularidade"  # sem busca não existe relevância
    descending = (filters.order or ("asc" if sort == "titulo" else "desc")) == "desc"

    def direction(col: Any, nullable: bool = False) -> Any:
        # DESC já coloca NULL no fim. "ASC NULLS LAST" impede o uso do índice,
        # então só uso onde a coluna pode ser nula.
        if descending:
            return col.desc()
        return col.asc().nulls_last() if nullable else col.asc()

    popularity = FactMoviePerformance.popularidade
    match sort:
        case "relevancia":
            columns = [rank_column.asc(), popularity.desc()]
        case "titulo":
            columns = [direction(DimMovie.titulo)]
        case "ano" | "lancamento":
            columns = [direction(DimMovie.ano_lancamento), direction(DimMovie.data_lancamento)]
        case "nota":
            columns = [
                direction(DimReview.nota_media_usuarios),
                direction(DimReview.qtd_avaliacoes_usuarios),
            ]
        case "avaliacoes":
            columns = [
                direction(DimReview.qtd_avaliacoes_usuarios),
                direction(DimReview.nota_media_usuarios),
            ]
        case _:
            columns = [direction(popularity, nullable=True)]
    # desempate pelo id para a paginação não repetir filmes entre páginas
    return [*columns, DimMovie.sk_movie_id]


async def _names_by_movie(session: AsyncSession, stmt: Select[Any]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for movie_id, name in await session.execute(stmt):
        result[movie_id].append(name)
    return result


async def build_summaries(session: AsyncSession, rows: Sequence[Any]) -> list[MovieSummary]:
    """Transforma as linhas de summary_select nos cards do catálogo.

    Gêneros e diretores são buscados de uma vez para a página toda
    (2 consultas no total, e não 2 por filme).
    """
    ids = [row[0].sk_movie_id for row in rows]
    if not ids:
        return []
    genres = await _names_by_movie(
        session,
        select(bridge_movie_genre.c.sk_movie_id, DimGenre.nome_genero)
        .join(DimGenre, DimGenre.sk_genre_id == bridge_movie_genre.c.sk_genre_id)
        .where(bridge_movie_genre.c.sk_movie_id.in_(ids))
        .order_by(DimGenre.nome_genero),
    )
    directors = await _names_by_movie(
        session,
        select(bridge_movie_person.c.sk_movie_id, DimPerson.nome_pessoa)
        .join(DimPerson, DimPerson.sk_person_id == bridge_movie_person.c.sk_person_id)
        .where(bridge_movie_person.c.sk_movie_id.in_(ids), DimPerson.tipo_pessoa == "Diretor")
        .order_by(DimPerson.nome_pessoa),
    )
    return [
        MovieSummary(
            id=movie.sk_movie_id,
            id_filme=movie.id_filme,
            titulo=movie.titulo,
            ano_lancamento=movie.ano_lancamento,
            duracao_minutos=movie.duracao_minutos,
            status_filme=movie.status_filme,
            url_poster=movie.url_poster,
            generos=genres.get(movie.sk_movie_id, []),
            diretores=directors.get(movie.sk_movie_id, []),
            popularidade=popularity,
            nota_media=average,
            total_avaliacoes=count or 0,
        )
        for movie, popularity, average, count in rows
    ]


async def list_movies(session: AsyncSession, filters: MovieFilters) -> Page[MovieSummary]:
    """Catálogo paginado com busca, filtros e ordenação.

    Feito em 3 consultas: (1) contagem, (2) só os ids da página e (3) os
    dados completos desses ids. Buscar só os ids primeiro deixa o SQLite
    percorrer o índice e parar na página certa; ordenar por título, por
    exemplo, caiu de ~700 ms para menos de 1 ms.
    """
    empty = Page[MovieSummary](items=[], total=0, page=filters.page, page_size=filters.page_size)
    only_reviewed = _needs_reviews(filters)

    count_stmt = select(func.count()).select_from(DimMovie)
    if only_reviewed:
        count_stmt = count_stmt.join(DimReview, DimReview.sk_movie_id == DimMovie.sk_movie_id)
    ids_stmt = _with_catalog_joins(select(DimMovie.sk_movie_id), only_reviewed)

    rank_column = None
    if filters.q and filters.q.strip():
        fts_query = build_fts_query(filters.q)
        if fts_query is None:  # digitou só pontuação
            return empty
        search = (
            select(movies_search.c.sk_movie_id, movies_search.c.rank)
            .where(literal_column("movies_search").op("MATCH")(fts_query))
            .subquery("search")
        )
        count_stmt = count_stmt.join(search, search.c.sk_movie_id == DimMovie.sk_movie_id)
        ids_stmt = ids_stmt.join(search, search.c.sk_movie_id == DimMovie.sk_movie_id)
        rank_column = search.c.rank

    total = (await session.execute(_apply_filters(count_stmt, filters))).scalar_one()
    if total == 0:
        return empty

    page_ids = (
        await session.scalars(
            _apply_filters(ids_stmt, filters)
            .order_by(*_ordering(filters, rank_column))
            .limit(filters.page_size)
            .offset((filters.page - 1) * filters.page_size)
        )
    ).all()

    rows = (await session.execute(summary_select().where(DimMovie.sk_movie_id.in_(page_ids)))).all()
    position = {movie_id: i for i, movie_id in enumerate(page_ids)}
    rows.sort(key=lambda row: position[row[0].sk_movie_id])  # o IN não mantém a ordem

    items = await build_summaries(session, rows)
    return Page[MovieSummary](
        items=items, total=total, page=filters.page, page_size=filters.page_size
    )


# ---------------------------------------------------------------------------
# Detalhes do filme
# ---------------------------------------------------------------------------
async def _load_movie(session: AsyncSession, movie_id: str) -> DimMovie:
    # Com sessão assíncrona não dá para usar lazy loading, então os
    # relacionamentos são carregados já na consulta (selectinload).
    movie = await session.scalar(
        select(DimMovie)
        .where(DimMovie.sk_movie_id == movie_id)
        .options(
            selectinload(DimMovie.genres),
            selectinload(DimMovie.people),
            selectinload(DimMovie.companies),
            selectinload(DimMovie.performance),
        )
        .execution_options(populate_existing=True)
    )
    if movie is None:
        raise NotFoundError(MOVIE_NOT_FOUND)
    return movie


async def _ensure_movie_exists(session: AsyncSession, movie_id: str) -> None:
    found = await session.scalar(
        select(DimMovie.sk_movie_id).where(DimMovie.sk_movie_id == movie_id)
    )
    if found is None:
        raise NotFoundError(MOVIE_NOT_FOUND)


async def _rating_summary(session: AsyncSession, movie_id: str) -> RatingSummary:
    notas = (
        await session.scalars(select(MovieReview.nota).where(MovieReview.sk_movie_id == movie_id))
    ).all()
    media = round(sum(notas) / len(notas), 2) if notas else None
    return RatingSummary(media=media, total=len(notas), distribuicao=build_distribution(notas))


def _has_financials(performance: FactMoviePerformance | None) -> bool:
    if performance is None:
        return False
    fields = ("orcamento_usd", "receita_usd", "popularidade", "nota_tmdb", "nota_imdb")
    return any(getattr(performance, field) is not None for field in fields)


async def get_movie_detail(session: AsyncSession, movie_id: str) -> MovieDetail:
    movie = await _load_movie(session, movie_id)

    # separa as pessoas em diretores / roteiristas / elenco
    people: dict[str, list[PersonRead]] = {field: [] for field in PERSON_TYPE_TO_FIELD.values()}
    for person in sorted(movie.people, key=lambda p: p.nome_pessoa):
        people[PERSON_TYPE_TO_FIELD[person.tipo_pessoa]].append(
            PersonRead(id=person.sk_person_id, nome=person.nome_pessoa, tipo=person.tipo_pessoa)
        )

    return MovieDetail(
        id=movie.sk_movie_id,
        id_filme=movie.id_filme,
        titulo=movie.titulo,
        sinopse=movie.sinopse,
        data_lancamento=movie.data_lancamento,
        ano_lancamento=movie.ano_lancamento,
        duracao_minutos=movie.duracao_minutos,
        status_filme=movie.status_filme,
        url_poster=movie.url_poster,
        url_backdrop=movie.url_backdrop,
        generos=[GenreRead(id=g.sk_genre_id, nome=g.nome_genero) for g in movie.genres],
        produtoras=[
            CompanyRead(id=c.sk_company_id, nome=c.nome_produtora) for c in movie.companies
        ],
        desempenho=(
            PerformanceRead.model_validate(movie.performance)
            if _has_financials(movie.performance)
            else None
        ),
        avaliacoes=await _rating_summary(session, movie_id),
        **people,
    )


async def similar_movies(
    session: AsyncSession, movie_id: str, limit: int = 12
) -> list[MovieSummary]:
    # Filmes com mais gêneros em comum; empate decidido pela popularidade.
    async def compute() -> list[MovieSummary]:
        await _ensure_movie_exists(session, movie_id)
        mine = bridge_movie_genre.alias("mine")
        other = bridge_movie_genre.alias("other")
        shared = func.count().label("shared")
        ranked = (
            select(other.c.sk_movie_id, shared)
            .join(mine, mine.c.sk_genre_id == other.c.sk_genre_id)
            .where(mine.c.sk_movie_id == movie_id, other.c.sk_movie_id != movie_id)
            .group_by(other.c.sk_movie_id)
            .subquery("ranked")
        )
        rows = (
            await session.execute(
                summary_select()
                .join(ranked, ranked.c.sk_movie_id == DimMovie.sk_movie_id)
                .order_by(ranked.c.shared.desc(), FactMoviePerformance.popularidade.desc())
                .limit(limit)
            )
        ).all()
        return await build_summaries(session, rows)

    return await query_cache.get_or_set(f"similar:{movie_id}:{limit}", compute)


# ---------------------------------------------------------------------------
# Cadastro, edição e remoção
# ---------------------------------------------------------------------------
async def _resolve_genres(session: AsyncSession, genre_ids: list[str]) -> list[DimGenre]:
    if not genre_ids:
        return []
    genres = (
        await session.scalars(select(DimGenre).where(DimGenre.sk_genre_id.in_(genre_ids)))
    ).all()
    missing = set(genre_ids) - {g.sk_genre_id for g in genres}
    if missing:
        raise InvalidDataError(f"Gênero(s) inexistente(s): {', '.join(sorted(missing))}")
    return list(genres)


async def _get_or_create(session: AsyncSession, model, name_column, names: list[str], **extra):
    """Busca registros pelo nome e cria os que não existem.

    Tenta primeiro o nome exato (usa o índice) e depois ignorando maiúsculas,
    para "greta gerwig" reaproveitar "Greta Gerwig" em vez de duplicar.
    """
    filters = [getattr(model, key) == value for key, value in extra.items()]
    found = {}
    exact = await session.scalars(select(model).where(*filters, name_column.in_(names)))
    for item in exact:
        found[getattr(item, name_column.key).casefold()] = item

    pending = [n for n in names if n.casefold() not in found]
    if pending:
        similar = await session.scalars(
            select(model).where(*filters, func.lower(name_column).in_([n.lower() for n in pending]))
        )
        for item in similar:
            found.setdefault(getattr(item, name_column.key).casefold(), item)

    result = []
    for name in names:
        item = found.get(name.casefold())
        if item is None:
            item = model(**{name_column.key: name}, **extra)
            session.add(item)
            found[name.casefold()] = item
        result.append(item)
    return result


async def _resolve_people(
    session: AsyncSession, names_by_type: dict[str, list[str]]
) -> list[DimPerson]:
    people: list[DimPerson] = []
    for person_type, names in names_by_type.items():
        if names:
            people += await _get_or_create(
                session, DimPerson, DimPerson.nome_pessoa, names, tipo_pessoa=person_type
            )
    return people


def _people_payload(data: MovieCreate | MovieUpdate) -> dict[str, list[str]] | None:
    # {"Diretor": [...], "Ator": [...]} só com os papéis que vieram na requisição
    by_type = {}
    for person_type, field in PERSON_TYPE_TO_FIELD.items():
        names = getattr(data, field)
        if names is not None:
            by_type[person_type] = names
    return by_type or None


async def create_movie(session: AsyncSession, data: MovieCreate) -> MovieDetail:
    public_id = data.id_filme or f"cl-{uuid4().hex[:12]}"
    if await session.scalar(select(DimMovie.sk_movie_id).where(DimMovie.id_filme == public_id)):
        raise ConflictError(f"Já existe um filme com o identificador '{public_id}'.")

    movie = DimMovie(
        id_filme=public_id,
        titulo=data.titulo,
        ano_lancamento=data.ano_lancamento,
        data_lancamento=data.data_lancamento,
        duracao_minutos=data.duracao_minutos,
        status_filme=data.status_filme,
        sinopse=data.sinopse,
        url_poster=data.url_poster,
        url_backdrop=data.url_backdrop,
    )
    movie.genres = await _resolve_genres(session, data.genero_ids)
    movie.people = await _resolve_people(session, _people_payload(data) or {})
    movie.companies = await _get_or_create(
        session, DimCompany, DimCompany.nome_produtora, data.produtoras
    )
    # linha vazia na tabela de fatos (ver comentário em _with_catalog_joins)
    movie.performance = FactMoviePerformance(lucro_usd=0, lucro_brl=0)
    session.add(movie)
    await session.commit()
    invalidate_query_cache()
    return await get_movie_detail(session, movie.sk_movie_id)


async def update_movie(session: AsyncSession, movie_id: str, data: MovieUpdate) -> MovieDetail:
    movie = await _load_movie(session, movie_id)
    changes = data.model_dump(exclude_unset=True)  # PATCH: só o que foi enviado

    for field in (
        "titulo",
        "ano_lancamento",
        "data_lancamento",
        "duracao_minutos",
        "status_filme",
        "sinopse",
        "url_poster",
        "url_backdrop",
    ):
        if field in changes:
            setattr(movie, field, changes[field])

    if movie.data_lancamento and movie.ano_lancamento != movie.data_lancamento.year:
        raise InvalidDataError("O ano de lançamento não corresponde à data de lançamento.")

    if data.genero_ids is not None:
        movie.genres = await _resolve_genres(session, data.genero_ids)
    people_payload = _people_payload(data)
    if people_payload is not None:
        # troca só os papéis enviados (ex.: mandar só diretores mantém o elenco)
        kept = [p for p in movie.people if p.tipo_pessoa not in people_payload]
        movie.people = kept + await _resolve_people(session, people_payload)
    if data.produtoras is not None:
        movie.companies = await _get_or_create(
            session, DimCompany, DimCompany.nome_produtora, data.produtoras
        )

    await session.commit()
    invalidate_query_cache()
    return await get_movie_detail(session, movie_id)


async def delete_movie(session: AsyncSession, movie_id: str) -> None:
    # DELETE direto: as FKs com ON DELETE CASCADE apagam pontes, fato e
    # avaliações (precisa do PRAGMA foreign_keys=ON, ver db/session.py).
    result = await session.execute(delete(DimMovie).where(DimMovie.sk_movie_id == movie_id))
    if result.rowcount == 0:
        raise NotFoundError(MOVIE_NOT_FOUND)
    await session.commit()
    invalidate_query_cache()


# ---------------------------------------------------------------------------
# Avaliações
# ---------------------------------------------------------------------------
ReviewSort = Literal["recentes", "antigas", "maior_nota", "menor_nota"]


async def list_reviews(
    session: AsyncSession, movie_id: str, page: int, page_size: int, sort: ReviewSort
) -> Page[ReviewRead]:
    await _ensure_movie_exists(session, movie_id)
    ordering = {
        "recentes": [MovieReview.created_at.desc()],
        "antigas": [MovieReview.created_at.asc()],
        "maior_nota": [MovieReview.nota.desc(), MovieReview.created_at.desc()],
        "menor_nota": [MovieReview.nota.asc(), MovieReview.created_at.desc()],
    }[sort]
    where = MovieReview.sk_movie_id == movie_id
    total = (
        await session.execute(select(func.count()).select_from(MovieReview).where(where))
    ).scalar_one()
    reviews = await session.scalars(
        select(MovieReview)
        .where(where)
        .order_by(*ordering, MovieReview.sk_movie_review_id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return Page[ReviewRead](
        items=[_review_to_read(r) for r in reviews], total=total, page=page, page_size=page_size
    )


async def refresh_review_summary(session: AsyncSession, movie_id: str) -> None:
    """Recalcula a média e a contagem do filme em dim_reviews.

    Chamado sempre que uma avaliação entra ou sai, na mesma transação, para
    a média mostrada no site bater com a lista de avaliações.
    """
    count, average = (
        await session.execute(
            select(func.count(), func.avg(MovieReview.nota)).where(
                MovieReview.sk_movie_id == movie_id
            )
        )
    ).one()
    summary = await session.scalar(select(DimReview).where(DimReview.sk_movie_id == movie_id))
    if count == 0:
        if summary is not None:
            await session.delete(summary)
        return
    if summary is None:
        # no CSV o sk_review_id é igual ao sk_movie_id, mantive o padrão
        summary = DimReview(sk_review_id=movie_id, sk_movie_id=movie_id)
        session.add(summary)
    summary.qtd_avaliacoes_usuarios = count
    summary.nota_media_usuarios = round(average, 2)


async def add_review(session: AsyncSession, movie_id: str, data: ReviewCreate) -> ReviewRead:
    await _ensure_movie_exists(session, movie_id)
    review = MovieReview(
        sk_movie_id=movie_id, nome=data.nome, nota=data.nota, comentario=data.comentario
    )
    session.add(review)
    await session.flush()
    await refresh_review_summary(session, movie_id)
    await session.commit()
    await session.refresh(review)  # pega o created_at gerado pelo banco
    invalidate_query_cache()
    return _review_to_read(review)


async def delete_review(session: AsyncSession, movie_id: str, review_id: str) -> None:
    result = await session.execute(
        delete(MovieReview).where(
            MovieReview.sk_movie_review_id == review_id, MovieReview.sk_movie_id == movie_id
        )
    )
    if result.rowcount == 0:
        raise NotFoundError(REVIEW_NOT_FOUND)
    await refresh_review_summary(session, movie_id)
    await session.commit()
    invalidate_query_cache()
