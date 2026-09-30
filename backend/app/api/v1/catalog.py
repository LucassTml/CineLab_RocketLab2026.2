# Rotas de apoio: gêneros, pessoas e produtoras.
# Usadas nos filtros do catálogo e no autocomplete do formulário.

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import query_cache
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.movies.models import (
    DimCompany,
    DimGenre,
    DimMovie,
    DimPerson,
    bridge_movie_company,
    bridge_movie_genre,
    bridge_movie_person,
)
from app.movies.schemas import CompanyRead, GenreWithCount, PersonRead

router = APIRouter(tags=["catálogo"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
SearchText = Annotated[str, Query(min_length=2, max_length=100)]
Limit = Annotated[int, Query(ge=1, le=30)]

# quantos nomes olhar antes de ordenar (evita varrer as 420 mil pessoas)
CANDIDATES = 200


class PersonSuggestion(PersonRead):
    total_filmes: int


class CompanySuggestion(CompanyRead):
    total_filmes: int


class YearCount(BaseModel):
    ano: int
    total_filmes: int


async def _movie_counts(session: AsyncSession, key_column, ids: list[str]) -> dict[str, int]:
    if not ids:
        return {}
    rows = await session.execute(
        select(key_column, func.count()).where(key_column.in_(ids)).group_by(key_column)
    )
    return {key: count for key, count in rows}


async def _search_by_name(session, name_column, id_attr, bridge_key, base, q, limit):
    """Autocomplete: nomes com alguma palavra começando por q.

    Ordena por número de filmes, então "nolan" traz primeiro quem tem mais
    filmes no catálogo. autoescape faz % e _ serem texto normal no LIKE.
    No SQLite o LIKE já ignora maiúsculas/minúsculas, então uso startswith e
    contains em vez de istartswith/icontains: o lower() que eles colocam em
    cada nome deixava a busca nas 420 mil pessoas duas vezes mais lenta.
    """
    candidates = (
        await session.scalars(
            base.where(
                or_(
                    name_column.startswith(q, autoescape=True),
                    name_column.contains(f" {q}", autoescape=True),
                    name_column.contains(f"-{q}", autoescape=True),
                )
            ).limit(CANDIDATES)
        )
    ).all()
    counts = await _movie_counts(session, bridge_key, [getattr(c, id_attr) for c in candidates])
    q_lower = q.casefold()

    def sort_key(item):
        name = getattr(item, name_column.key)
        return (
            -counts.get(getattr(item, id_attr), 0),
            not name.casefold().startswith(q_lower),
            name,
        )

    return sorted(candidates, key=sort_key)[:limit], counts


@router.get("/genres", response_model=list[GenreWithCount], summary="Gêneros")
async def list_genres(session: SessionDep):
    async def compute():
        rows = await session.execute(
            select(
                DimGenre.sk_genre_id,
                DimGenre.nome_genero,
                func.count(bridge_movie_genre.c.sk_movie_id),
            )
            .outerjoin(bridge_movie_genre, bridge_movie_genre.c.sk_genre_id == DimGenre.sk_genre_id)
            .group_by(DimGenre.sk_genre_id)
            .order_by(DimGenre.nome_genero)
        )
        return [GenreWithCount(id=i, nome=n, total_filmes=c) for i, n, c in rows]

    return await query_cache.get_or_set("genres", compute)


@router.get("/years", response_model=list[YearCount], summary="Filmes por ano")
async def list_years(session: SessionDep):
    # usado no histograma do filtro de ano (barras atrás do controle deslizante)
    async def compute():
        rows = await session.execute(
            select(DimMovie.ano_lancamento, func.count())
            .where(DimMovie.ano_lancamento.is_not(None))
            .group_by(DimMovie.ano_lancamento)
            .order_by(DimMovie.ano_lancamento)
        )
        return [YearCount(ano=ano, total_filmes=total) for ano, total in rows]

    return await query_cache.get_or_set("years", compute)


@router.get("/people", response_model=list[PersonSuggestion], summary="Busca pessoas")
async def search_people(
    session: SessionDep,
    q: SearchText,
    tipo: Literal["Ator", "Diretor", "Roteirista"] | None = None,
    limit: Limit = 10,
):
    base = select(DimPerson)
    if tipo:
        base = base.where(DimPerson.tipo_pessoa == tipo)
    people, counts = await _search_by_name(
        session,
        DimPerson.nome_pessoa,
        "sk_person_id",
        bridge_movie_person.c.sk_person_id,
        base,
        q.strip(),
        limit,
    )
    return [
        PersonSuggestion(
            id=p.sk_person_id,
            nome=p.nome_pessoa,
            tipo=p.tipo_pessoa,
            total_filmes=counts.get(p.sk_person_id, 0),
        )
        for p in people
    ]


@router.get("/people/{person_id}", response_model=PersonSuggestion, summary="Uma pessoa")
async def get_person(person_id: Annotated[str, Path(max_length=64)], session: SessionDep):
    person = await session.get(DimPerson, person_id)
    if person is None:
        raise NotFoundError("Pessoa não encontrada.")
    counts = await _movie_counts(session, bridge_movie_person.c.sk_person_id, [person_id])
    return PersonSuggestion(
        id=person.sk_person_id,
        nome=person.nome_pessoa,
        tipo=person.tipo_pessoa,
        total_filmes=counts.get(person_id, 0),
    )


@router.get("/companies", response_model=list[CompanySuggestion], summary="Busca produtoras")
async def search_companies(session: SessionDep, q: SearchText, limit: Limit = 10):
    companies, counts = await _search_by_name(
        session,
        DimCompany.nome_produtora,
        "sk_company_id",
        bridge_movie_company.c.sk_company_id,
        select(DimCompany),
        q.strip(),
        limit,
    )
    return [
        CompanySuggestion(
            id=c.sk_company_id, nome=c.nome_produtora, total_filmes=counts.get(c.sk_company_id, 0)
        )
        for c in companies
    ]


@router.get("/companies/{company_id}", response_model=CompanySuggestion, summary="Uma produtora")
async def get_company(company_id: Annotated[str, Path(max_length=64)], session: SessionDep):
    company = await session.get(DimCompany, company_id)
    if company is None:
        raise NotFoundError("Produtora não encontrada.")
    counts = await _movie_counts(session, bridge_movie_company.c.sk_company_id, [company_id])
    return CompanySuggestion(
        id=company.sk_company_id,
        nome=company.nome_produtora,
        total_filmes=counts.get(company_id, 0),
    )
