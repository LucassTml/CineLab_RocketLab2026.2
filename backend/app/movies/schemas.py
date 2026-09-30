# Schemas (Pydantic) de entrada e saída da API.
# Os campos seguem os nomes do banco. Notas ficam na escala 0-10 como nos CSVs;
# o frontend mostra estrelas (nota / 2).

from datetime import UTC, date, datetime
from typing import Generic, Literal, Self, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.movies.models import PERSON_TYPES

STATUS_FILME: tuple[str, ...] = ("Lançado", "Pós-Produção", "Em Produção", "Planejado")
StatusFilme = Literal["Lançado", "Pós-Produção", "Em Produção", "Planejado"]

# 1888 = primeiro filme conhecido (Roundhay Garden Scene)
MIN_YEAR = 1888
MAX_YEAR = 2100

T = TypeVar("T")
MAX_NAMES = 60


def _clean_names(values: list[str]) -> list[str]:
    # tira nomes vazios e repetidos (sem diferenciar maiúsculas)
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in values:
        name = " ".join(raw.split())
        key = name.casefold()
        if name and key not in seen:
            if len(name) > 255:
                raise ValueError(f"Nome muito longo (máx. 255 caracteres): {name[:30]}...")
            seen.add(key)
            cleaned.append(name)
    return cleaned


def _validate_url(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not value.startswith(("http://", "https://")):
        raise ValueError("A URL deve começar com http:// ou https://")
    return value


# --- respostas ---
class GenreRead(BaseModel):
    id: str
    nome: str


class GenreWithCount(GenreRead):
    total_filmes: int


class PersonRead(BaseModel):
    id: str
    nome: str
    tipo: str


class CompanyRead(BaseModel):
    id: str
    nome: str


class PerformanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    orcamento_usd: float | None
    receita_usd: float | None
    lucro_usd: float | None
    orcamento_brl: float | None
    receita_brl: float | None
    lucro_brl: float | None
    popularidade: float | None
    nota_tmdb: float | None
    qtd_tmdb: int | None
    nota_imdb: float | None
    qtd_imdb: int | None


class RatingBucket(BaseModel):
    # uma barra do histograma de notas
    estrelas: float
    total: int


class RatingSummary(BaseModel):
    media: float | None = Field(description="Média na escala 0-10")
    total: int
    distribuicao: list[RatingBucket] = Field(default_factory=list)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def media_estrelas(self) -> float | None:
        return None if self.media is None else round(self.media / 2, 2)


class MovieSummary(BaseModel):
    # item do catálogo (card)
    id: str
    id_filme: str
    titulo: str
    ano_lancamento: int | None
    duracao_minutos: int | None
    status_filme: str | None
    url_poster: str | None
    url_backdrop: str | None
    generos: list[str]
    diretores: list[str]
    popularidade: float | None
    nota_media: float | None = Field(description="Média das avaliações (0-10)")
    total_avaliacoes: int


class MovieDetail(BaseModel):
    id: str
    id_filme: str
    titulo: str
    sinopse: str | None
    data_lancamento: date | None
    ano_lancamento: int | None
    duracao_minutos: int | None
    status_filme: str | None
    url_poster: str | None
    url_backdrop: str | None
    generos: list[GenreRead]
    diretores: list[PersonRead]
    roteiristas: list[PersonRead]
    elenco: list[PersonRead]
    produtoras: list[CompanyRead]
    desempenho: PerformanceRead | None
    avaliacoes: RatingSummary


class ReviewRead(BaseModel):
    id: str
    filme_id: str
    nome: str
    nota: float
    comentario: str
    criado_em: datetime

    @field_validator("criado_em")
    @classmethod
    def _assume_utc(cls, value: datetime) -> datetime:
        # o SQLite salva em UTC mas sem fuso; sem isso o navegador erra o horário
        return value if value.tzinfo else value.replace(tzinfo=UTC)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pages(self) -> int:
        return max(1, -(-self.total // self.page_size))  # arredonda pra cima


# --- entradas ---
class _MovieFields(BaseModel):
    # validações comuns ao cadastro e à edição
    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("url_poster", "url_backdrop", check_fields=False)
    @classmethod
    def _check_url(cls, value: str | None) -> str | None:
        return _validate_url(value)

    @field_validator("sinopse", check_fields=False)
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("diretores", "roteiristas", "elenco", "produtoras", check_fields=False)
    @classmethod
    def _names(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _clean_names(value)

    @field_validator("genero_ids", check_fields=False)
    @classmethod
    def _unique_ids(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else list(dict.fromkeys(value))

    @model_validator(mode="after")
    def _year_matches_date(self) -> Self:
        data = getattr(self, "data_lancamento", None)
        ano = getattr(self, "ano_lancamento", None)
        if data is not None:
            if ano is None:
                self.ano_lancamento = data.year
            elif ano != data.year:
                raise ValueError("O ano de lançamento não corresponde à data de lançamento.")
        return self


class MovieCreate(_MovieFields):
    titulo: str = Field(min_length=1, max_length=500)
    id_filme: str | None = Field(
        default=None,
        max_length=50,
        pattern=r"^[\w.-]+$",
        description="Identificador externo (ex.: id do TMDB). Gerado automaticamente se omitido.",
    )
    # ano obrigatório (pedido no enunciado e evita nulos na ordenação por ano)
    ano_lancamento: int = Field(ge=MIN_YEAR, le=MAX_YEAR)
    data_lancamento: date | None = None
    duracao_minutos: int | None = Field(default=None, ge=1, le=1500)
    status_filme: StatusFilme = "Lançado"
    sinopse: str | None = Field(default=None, max_length=4000)
    url_poster: str | None = Field(default=None, max_length=2048)
    url_backdrop: str | None = Field(default=None, max_length=2048)
    genero_ids: list[str] = Field(default_factory=list, max_length=19)
    diretores: list[str] = Field(default_factory=list, max_length=MAX_NAMES)
    roteiristas: list[str] = Field(default_factory=list, max_length=MAX_NAMES)
    elenco: list[str] = Field(default_factory=list, max_length=MAX_NAMES)
    produtoras: list[str] = Field(default_factory=list, max_length=MAX_NAMES)

    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "titulo": "Ainda Estou Aqui",
                "ano_lancamento": 2024,
                "data_lancamento": "2024-11-07",
                "duracao_minutos": 137,
                "status_filme": "Lançado",
                "sinopse": "Rio de Janeiro, 1971. Eunice Paiva reinventa a família...",
                "genero_ids": [],
                "diretores": ["Walter Salles"],
                "elenco": ["Fernanda Torres", "Selton Mello"],
            }
        },
    )


class MovieUpdate(_MovieFields):
    # PATCH: só muda o que for enviado. Lista ausente mantém, [] limpa.
    titulo: str | None = Field(default=None, min_length=1, max_length=500)
    ano_lancamento: int | None = Field(default=None, ge=MIN_YEAR, le=MAX_YEAR)
    data_lancamento: date | None = None
    duracao_minutos: int | None = Field(default=None, ge=1, le=1500)
    status_filme: StatusFilme | None = None
    sinopse: str | None = Field(default=None, max_length=4000)
    url_poster: str | None = Field(default=None, max_length=2048)
    url_backdrop: str | None = Field(default=None, max_length=2048)
    genero_ids: list[str] | None = Field(default=None, max_length=19)
    diretores: list[str] | None = Field(default=None, max_length=MAX_NAMES)
    roteiristas: list[str] | None = Field(default=None, max_length=MAX_NAMES)
    elenco: list[str] | None = Field(default=None, max_length=MAX_NAMES)
    produtoras: list[str] | None = Field(default=None, max_length=MAX_NAMES)

    @field_validator("titulo", "ano_lancamento", "status_filme")
    @classmethod
    def _required_not_null(cls, value: object) -> object:
        # não deixa apagar campo obrigatório mandando null
        if value is None:
            raise ValueError("Este campo é obrigatório e não pode ser removido.")
        return value


class ReviewCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {"nome": "Ana Souza", "nota": 9, "comentario": "Fotografia impecável."}
        },
    )

    nome: str = Field(min_length=1, max_length=120)
    nota: float = Field(
        ge=1,
        le=10,
        description="Nota de 1 a 10 (o site manda estrelas x 2)",
    )
    comentario: str = Field(min_length=1, max_length=4000)

    @field_validator("nota")
    @classmethod
    def _one_decimal(cls, value: float) -> float:
        return round(value, 1)


# --- filtros do catálogo (query string) ---
SortField = Literal[
    "relevancia", "popularidade", "titulo", "ano", "lancamento", "nota", "avaliacoes"
]
SortOrder = Literal["asc", "desc"]


class MovieFilters(BaseModel):
    # extra=forbid: parâmetro com nome errado dá 422 em vez de ser ignorado
    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(default=None, max_length=200)
    genero: list[str] = Field(default_factory=list)
    ano_min: int | None = Field(default=None, ge=MIN_YEAR, le=MAX_YEAR)
    ano_max: int | None = Field(default=None, ge=MIN_YEAR, le=MAX_YEAR)
    nota_min: float | None = Field(default=None, ge=0, le=10)
    min_avaliacoes: int | None = Field(default=None, ge=0)
    status: StatusFilme | None = None
    pessoa: str | None = None
    produtora: str | None = None
    sort: SortField = "popularidade"
    order: SortOrder | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=24, ge=1, le=100)

    @model_validator(mode="after")
    def _valid_year_range(self) -> Self:
        if self.ano_min is not None and self.ano_max is not None and self.ano_min > self.ano_max:
            raise ValueError("ano_min não pode ser maior que ano_max.")
        return self


PERSON_TYPE_TO_FIELD: dict[str, str] = dict(
    zip(PERSON_TYPES, ("elenco", "diretores", "roteiristas"), strict=True)
)
