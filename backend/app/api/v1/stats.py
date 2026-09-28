# Dados do dashboard. Tudo é calculado numa chamada só e fica em cache
# (o cache é limpo sempre que algum filme ou avaliação muda).

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import query_cache
from app.db.session import get_db
from app.movies.models import (
    DimCompany,
    DimGenre,
    DimMovie,
    DimPerson,
    DimReview,
    FactMoviePerformance,
    MovieReview,
    bridge_movie_genre,
)
from app.movies.schemas import MovieSummary, RatingBucket
from app.movies.service import build_summaries, star_bucket, summary_select

router = APIRouter(prefix="/stats", tags=["dashboard"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]

# Peso da média bayesiana (ver compute_overview)
BAYES_M = 3
TOP = 10


class GenreStat(BaseModel):
    id: str
    nome: str
    total_filmes: int
    total_avaliacoes: int
    media: float | None


class YearStat(BaseModel):
    ano: int
    total_filmes: int


class LatestReview(BaseModel):
    id: str
    filme_id: str
    filme_titulo: str
    filme_poster: str | None
    nome: str
    nota: float
    comentario: str
    criado_em: datetime

    @field_validator("criado_em")
    @classmethod
    def _utc(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=UTC)


class RankedMovie(MovieSummary):
    nota_ponderada: float


class StatsOverview(BaseModel):
    total_filmes: int
    total_avaliacoes: int
    filmes_avaliados: int
    total_pessoas: int
    total_produtoras: int
    media_geral: float | None
    distribuicao: list[RatingBucket]
    generos: list[GenreStat]
    filmes_por_ano: list[YearStat]
    mais_bem_avaliados: list[RankedMovie]
    mais_avaliados: list[MovieSummary]
    ultimas_avaliacoes: list[LatestReview]


async def _count(session: AsyncSession, model) -> int:
    return (await session.execute(select(func.count()).select_from(model))).scalar_one()


async def compute_overview(session: AsyncSession) -> StatsOverview:
    total_reviews, global_avg = (
        await session.execute(select(func.count(), func.avg(MovieReview.nota)))
    ).one()

    # histograma geral: agrupo pela nota e distribuo nas 10 barras em Python
    buckets = [0] * 10
    for nota, count in await session.execute(
        select(MovieReview.nota, func.count()).group_by(MovieReview.nota)
    ):
        buckets[star_bucket(nota) - 1] += count

    genre_movies = await session.execute(
        select(
            DimGenre.sk_genre_id,
            DimGenre.nome_genero,
            func.count(bridge_movie_genre.c.sk_movie_id),
        )
        .outerjoin(bridge_movie_genre, bridge_movie_genre.c.sk_genre_id == DimGenre.sk_genre_id)
        .group_by(DimGenre.sk_genre_id)
    )
    genre_reviews = {
        genre_id: (count, avg)
        for genre_id, count, avg in await session.execute(
            select(bridge_movie_genre.c.sk_genre_id, func.count(), func.avg(MovieReview.nota))
            .join(MovieReview, MovieReview.sk_movie_id == bridge_movie_genre.c.sk_movie_id)
            .group_by(bridge_movie_genre.c.sk_genre_id)
        )
    }
    genres = []
    for genre_id, name, movies in genre_movies:
        count, avg = genre_reviews.get(genre_id, (0, None))
        genres.append(
            GenreStat(
                id=genre_id,
                nome=name,
                total_filmes=movies,
                total_avaliacoes=count,
                media=round(avg, 2) if avg is not None else None,
            )
        )
    genres.sort(key=lambda g: g.total_filmes, reverse=True)

    years = [
        YearStat(ano=year, total_filmes=count)
        for year, count in await session.execute(
            select(DimMovie.ano_lancamento, func.count())
            .where(DimMovie.ano_lancamento.is_not(None))
            .group_by(DimMovie.ano_lancamento)
            .order_by(DimMovie.ano_lancamento)
        )
    ]

    # Ranking com média bayesiana (mesma ideia do top 250 do IMDb):
    #   (v*R + m*C) / (v + m)
    # v = nº de avaliações, R = média do filme, C = média geral, m = peso.
    # Assim um filme com uma única nota 10 não fica em primeiro.
    top_rated = []
    if global_avg is not None:
        v = DimReview.qtd_avaliacoes_usuarios
        weighted = (v * DimReview.nota_media_usuarios + BAYES_M * float(global_avg)) / (v + BAYES_M)
        rows = (
            await session.execute(
                summary_select(only_reviewed=True)
                .add_columns(weighted.label("ponderada"))
                .order_by(weighted.desc(), FactMoviePerformance.popularidade.desc())
                .limit(TOP)
            )
        ).all()
        summaries = await build_summaries(session, [row[:4] for row in rows])
        top_rated = [
            RankedMovie(**summary.model_dump(), nota_ponderada=round(row[4], 2))
            for summary, row in zip(summaries, rows, strict=True)
        ]

    most_reviewed = (
        await session.execute(
            summary_select(only_reviewed=True)
            .order_by(
                DimReview.qtd_avaliacoes_usuarios.desc(),
                DimReview.nota_media_usuarios.desc(),
                DimMovie.sk_movie_id,
            )
            .limit(TOP)
        )
    ).all()

    latest = [
        LatestReview(
            id=review.sk_movie_review_id,
            filme_id=review.sk_movie_id,
            filme_titulo=title,
            filme_poster=poster,
            nome=review.nome,
            nota=review.nota,
            comentario=review.comentario,
            criado_em=review.created_at,
        )
        for review, title, poster in await session.execute(
            select(MovieReview, DimMovie.titulo, DimMovie.url_poster)
            .join(DimMovie, DimMovie.sk_movie_id == MovieReview.sk_movie_id)
            .order_by(MovieReview.created_at.desc(), MovieReview.sk_movie_review_id.desc())
            .limit(8)
        )
    ]

    return StatsOverview(
        total_filmes=await _count(session, DimMovie),
        total_avaliacoes=total_reviews,
        filmes_avaliados=await _count(session, DimReview),
        total_pessoas=await _count(session, DimPerson),
        total_produtoras=await _count(session, DimCompany),
        media_geral=round(global_avg, 2) if global_avg is not None else None,
        distribuicao=[RatingBucket(estrelas=(i + 1) / 2, total=t) for i, t in enumerate(buckets)],
        generos=genres,
        filmes_por_ano=years,
        mais_bem_avaliados=top_rated,
        mais_avaliados=await build_summaries(session, most_reviewed),
        ultimas_avaliacoes=latest,
    )


@router.get("", response_model=StatsOverview, summary="Números do dashboard")
async def overview(session: SessionDep):
    return await query_cache.get_or_set("stats", lambda: compute_overview(session))
