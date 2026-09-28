# Rotas de filmes e avaliações.
# GET é público; criar, editar, remover e avaliar precisam do token de admin.

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AdminUser
from app.db.session import get_db
from app.movies import service
from app.movies.schemas import (
    MovieCreate,
    MovieDetail,
    MovieFilters,
    MovieSummary,
    MovieUpdate,
    Page,
    ReviewCreate,
    ReviewRead,
)

router = APIRouter(prefix="/movies", tags=["filmes"])

SessionDep = Annotated[AsyncSession, Depends(get_db)]
MovieId = Annotated[str, Path(max_length=64, description="sk_movie_id do filme")]


@router.get("", response_model=Page[MovieSummary], summary="Catálogo paginado")
async def list_movies(filters: Annotated[MovieFilters, Query()], session: SessionDep):
    """Lista os filmes com busca (`q`), filtros e ordenação.

    Para buscar vários filmes, separe por vírgula: `matrix, toy story`.
    Com `sort=nota` ou `sort=avaliacoes` só aparecem filmes já avaliados.
    """
    return await service.list_movies(session, filters)


@router.post("", response_model=MovieDetail, status_code=201, summary="Cadastra um filme")
async def create_movie(data: MovieCreate, session: SessionDep, _admin: AdminUser):
    return await service.create_movie(session, data)


@router.get("/{movie_id}", response_model=MovieDetail, summary="Detalhes do filme")
async def get_movie(movie_id: MovieId, session: SessionDep):
    return await service.get_movie_detail(session, movie_id)


@router.patch("/{movie_id}", response_model=MovieDetail, summary="Atualiza um filme")
async def update_movie(
    movie_id: MovieId, data: MovieUpdate, session: SessionDep, _admin: AdminUser
):
    return await service.update_movie(session, movie_id, data)


@router.delete("/{movie_id}", status_code=204, summary="Remove um filme")
async def delete_movie(movie_id: MovieId, session: SessionDep, _admin: AdminUser) -> Response:
    await service.delete_movie(session, movie_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{movie_id}/similar", response_model=list[MovieSummary], summary="Semelhantes")
async def similar_movies(
    movie_id: MovieId, session: SessionDep, limit: Annotated[int, Query(ge=1, le=24)] = 12
):
    return await service.similar_movies(session, movie_id, limit)


@router.get("/{movie_id}/reviews", response_model=Page[ReviewRead], summary="Avaliações")
async def list_reviews(
    movie_id: MovieId,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
    sort: service.ReviewSort = "recentes",
):
    return await service.list_reviews(session, movie_id, page, page_size, sort)


@router.post(
    "/{movie_id}/reviews", response_model=ReviewRead, status_code=201, summary="Nova avaliação"
)
async def add_review(movie_id: MovieId, data: ReviewCreate, session: SessionDep, _admin: AdminUser):
    return await service.add_review(session, movie_id, data)


@router.delete("/{movie_id}/reviews/{review_id}", status_code=204, summary="Remove avaliação")
async def delete_review(
    movie_id: MovieId,
    review_id: Annotated[str, Path(max_length=64)],
    session: SessionDep,
    _admin: AdminUser,
) -> Response:
    await service.delete_review(session, movie_id, review_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
