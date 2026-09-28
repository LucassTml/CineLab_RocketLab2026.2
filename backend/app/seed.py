"""Carrega os CSVs da atividade no banco.

Uso (dentro de backend/, com as migrações já aplicadas):

    python -m app.seed                      # procura os CSVs em ../data
    python -m app.seed --data-dir PASTA     # pode repetir o --data-dir
    python -m app.seed --reset              # apaga tudo e carrega de novo

Os CSVs são lidos em lotes de 10 mil linhas (são ~230 MB no total) e
inseridos numa transação só. Os dados tinham alguns problemas, tratados nas
funções clean_* e em remove_corrupted_people / rebuild_review_summaries.
"""

from __future__ import annotations

import argparse
import csv
import logging
import re
import sys
import time
from collections.abc import Callable, Iterable, Iterator
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, Table, bindparam, create_engine, event, func, select, text

from app.core.config import get_settings
from app.db.base import Base
from app.movies import models  # noqa: F401  Registra as tabelas no metadata.

logger = logging.getLogger("seed")

BATCH_SIZE = 10_000

# Nome do CSV -> tabela de destino, na ordem em que precisam ser carregados.
CSV_TABLE_ORDER: list[tuple[str, str]] = [
    ("dim_genres.csv", "dim_genres"),
    ("dim_companies.csv", "dim_companies"),
    ("dim_people.csv", "dim_people"),
    ("dim_movies.csv", "dim_movies"),
    ("fact_movies_performance.csv", "fact_movies_performance"),
    ("bridge_movie_genre.csv", "bridge_movie_genre"),
    ("bridge_movie_company.csv", "bridge_movie_company"),
    ("bridge_movie_person.csv", "bridge_movie_person"),
    ("movies_reviews.csv", "movie_reviews"),
    ("dim_reviews.csv", "dim_reviews"),
]

# Ordem inversa de dependência, usada no --reset.
RESET_ORDER = [
    "movie_reviews",
    "dim_reviews",
    "fact_movies_performance",
    "bridge_movie_person",
    "bridge_movie_company",
    "bridge_movie_genre",
    "dim_movies",
    "dim_people",
    "dim_companies",
    "dim_genres",
]


# --- limpeza dos valores ---
def clean_text(value: str | None) -> str | None:
    # tira espaços e transforma "" em None
    if value is None:
        return None
    value = value.strip()
    return value or None


def clean_synopsis(value: str | None) -> str | None:
    # ~4.800 sinopses vieram com escape duplo: "Um ""filme"" bom." vira
    # Um "filme" bom. (conferi que todo texto que começa com aspas segue esse padrão)
    text_value = clean_text(value)
    if text_value is None or not text_value.startswith('"'):
        return text_value
    body = text_value[1:]
    # quantidade ímpar de aspas no final = a última é a de fechamento
    # (alguns textos vieram cortados e não têm aspa de fechamento)
    trailing_quotes = len(body) - len(body.rstrip('"'))
    if trailing_quotes % 2 == 1:
        body = body[:-1]
    return clean_text(body.replace('""', '"'))


_LOWER_AFTER_QUOTE = re.compile(r'(^|(?<=\s))"([a-z])')
# numerais romanos que vieram como "Ii", "Iii"...
_ROMAN_CANDIDATE = re.compile(r"\b[IVX][ivx]+\b")
_ROMAN_NUMERAL = re.compile(r"X{0,3}(?:IX|IV|V?I{0,3})")
# "Vi" e "Xi" também são palavras ("Me Vi", "Xi Jinping"), então ficam de fora
_ROMAN_AMBIGUOUS = {"VI", "XI"}


def _upper_roman(match: re.Match[str]) -> str:
    word = match.group(0)
    upper = word.upper()
    if upper in _ROMAN_AMBIGUOUS or not _ROMAN_NUMERAL.fullmatch(upper):
        return word
    return upper


def clean_title(value: str | None) -> str | None:
    # Além do escape duplo, a capitalização da origem deixou minúscula a letra
    # depois das aspas ("biography: ""stone Cold""") e estragou numerais
    # romanos ("Grizzly Ii"). Corrige as duas coisas.
    title = clean_synopsis(value)
    if title is None:
        return None
    if title != clean_text(value):
        title = _LOWER_AFTER_QUOTE.sub(lambda m: m.group(1) + '"' + m.group(2).upper(), title)
        title = title[0].upper() + title[1:]
    return _ROMAN_CANDIDATE.sub(_upper_roman, title)


def clean_name(value: str | None) -> str | None:
    # "Abraham Hamilton Iii" -> "Abraham Hamilton III"
    name = clean_text(value)
    return None if name is None else _ROMAN_CANDIDATE.sub(_upper_roman, name)


def to_int(value: str | None) -> int | None:
    # "2375.0" -> 2375 (alguns inteiros vieram como float)
    text_value = clean_text(value)
    return None if text_value is None else int(float(text_value))


def to_positive_int(value: str | None) -> int | None:
    # duracao_minutos = 0 em 10 mil filmes = duração desconhecida
    number = to_int(value)
    return number if number and number > 0 else None


def to_float(value: str | None) -> float | None:
    text_value = clean_text(value)
    return None if text_value is None else float(text_value)


def to_decimal(value: str | None) -> Decimal | None:
    text_value = clean_text(value)
    if text_value is None:
        return None
    try:
        return Decimal(text_value)
    except InvalidOperation as exc:
        raise ValueError(f"Valor monetário inválido: {value!r}") from exc


def to_date(value: str | None) -> date | None:
    text_value = clean_text(value)
    return None if text_value is None else date.fromisoformat(text_value)


# Transformação de cada linha do CSV para o dicionário aceito pela tabela.
Row = dict[str, Any]
TRANSFORMS: dict[str, Callable[[Row], Row]] = {
    "dim_genres": lambda r: {
        "sk_genre_id": r["sk_genre_id"],
        "nome_genero": clean_text(r["nome_genero"]),
    },
    "dim_companies": lambda r: {
        "sk_company_id": r["sk_company_id"],
        "nome_produtora": clean_name(r["nome_produtora"]),
    },
    "dim_people": lambda r: {
        "sk_person_id": r["sk_person_id"],
        "nome_pessoa": clean_name(r["nome_pessoa"]),
        "tipo_pessoa": clean_text(r["tipo_pessoa"]),
    },
    "dim_movies": lambda r: {
        "sk_movie_id": r["sk_movie_id"],
        "id_filme": clean_text(r["id_filme"]),
        "titulo": clean_title(r["titulo"]),
        "data_lancamento": to_date(r["data_lancamento"]),
        "ano_lancamento": to_int(r["ano_lancamento"]),
        "duracao_minutos": to_positive_int(r["duracao_minutos"]),
        "status_filme": clean_text(r["status_filme"]),
        "sinopse": clean_synopsis(r["sinopse"]),
        "url_poster": clean_text(r["url_poster"]),
        "url_backdrop": clean_text(r["url_backdrop"]),
    },
    "fact_movies_performance": lambda r: {
        "sk_movie_id": r["sk_movie_id"],
        "orcamento_usd": to_decimal(r["orcamento_usd"]),
        "receita_usd": to_decimal(r["receita_usd"]),
        "lucro_usd": to_decimal(r["lucro_usd"]) or Decimal(0),
        "orcamento_brl": to_decimal(r["orcamento_brl"]),
        "receita_brl": to_decimal(r["receita_brl"]),
        "lucro_brl": to_decimal(r["lucro_brl"]) or Decimal(0),
        "popularidade": to_float(r["popularidade"]),
        "nota_tmdb": to_float(r["nota_tmdb"]),
        "qtd_tmdb": to_int(r["qtd_tmdb"]),
        "nota_imdb": to_float(r["nota_imdb"]),
        "qtd_imdb": to_int(r["qtd_imdb"]),
    },
    "bridge_movie_genre": lambda r: {
        "sk_movie_id": r["sk_movie_id"],
        "sk_genre_id": r["sk_genre_id"],
    },
    "bridge_movie_company": lambda r: {
        "sk_movie_id": r["sk_movie_id"],
        "sk_company_id": r["sk_company_id"],
    },
    "bridge_movie_person": lambda r: {
        "sk_movie_id": r["sk_movie_id"],
        "sk_person_id": r["sk_person_id"],
    },
    "movie_reviews": lambda r: {
        "sk_movie_review_id": r["sk_movie_review_id"],
        "sk_movie_id": r["sk_movie_id"],
        "nome": clean_text(r["nome"]),
        "nota": to_float(r["nota"]),
        "comentario": clean_text(r["comentario"]),
    },
    "dim_reviews": lambda r: {
        "sk_review_id": r["sk_review_id"],
        "sk_movie_id": r["sk_movie_id"],
        "qtd_avaliacoes_usuarios": to_int(r["qtd_avaliacoes_usuarios"]) or 0,
        "nota_media_usuarios": to_float(r["nota_media_usuarios"]),
    },
}


# --- leitura dos CSVs e inserção ---
def find_csv(data_dirs: Iterable[Path], filename: str) -> Path:
    """Procura o arquivo nas pastas informadas (e um nível abaixo)."""

    for directory in data_dirs:
        for candidate in (directory / filename, *directory.glob(f"*/{filename}")):
            if candidate.is_file():
                return candidate
    searched = ", ".join(str(d) for d in data_dirs)
    raise FileNotFoundError(f"Arquivo {filename} não encontrado em: {searched}")


def iter_csv(path: Path) -> Iterator[Row]:
    # utf-8-sig para não quebrar se o arquivo tiver BOM (ex.: salvo pelo Excel)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        yield from csv.DictReader(handle)


def batched(rows: Iterable[Row], size: int) -> Iterator[list[Row]]:
    batch: list[Row] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def load_table(conn: Connection, table: Table, path: Path) -> int:
    transform = TRANSFORMS[table.name]
    total = 0
    for line_number, batch in enumerate(batched(iter_csv(path), BATCH_SIZE)):
        try:
            conn.execute(table.insert(), [transform(row) for row in batch])
        except Exception as exc:
            first_line = line_number * BATCH_SIZE + 2
            raise RuntimeError(
                f"Falha ao carregar {path.name} (lote a partir da linha {first_line}): {exc}"
            ) from exc
        total += len(batch)
    return total


def reset_database(conn: Connection) -> None:
    # limpa o índice de busca antes, senão o trigger de delete fica muito lento
    conn.execute(text("DELETE FROM movies_search"))
    for table_name in RESET_ORDER:
        conn.execute(Base.metadata.tables[table_name].delete())


# Em registros corrompidos aparecem idiomas, países e palavras-chave do TMDB
# no lugar do nome da pessoa. Os nomes de gêneros entram também (lidos do banco).
_IDIOMAS = """
    Afrikaans, Arabic, Armenian, Basque, Bengali, Bulgarian, Cantonese, Catalan, Chinese,
    Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, Georgian,
    German, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Irish, Italian, Japanese,
    Kannada, Kazakh, Korean, Latin, Latvian, Lithuanian, Malay, Malayalam, Mandarin, Marathi,
    Mongolian, Nepali, No Language, Norwegian, Persian, Polish, Portuguese, Punjabi,
    Romanian, Russian, Serbian, Serbo-croatian, Sinhalese, Slovak, Slovenian, Spanish,
    Swahili, Swedish, Tagalog, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese,
    Welsh
"""
_PAISES = """
    Argentina, Australia, Austria, Belgium, Brazil, Canada, Chile, China, Colombia, Croatia,
    Czech Republic, Denmark, Egypt, Finland, France, Germany, Greece, Hong Kong, Hungary,
    India, Indonesia, Iran, Ireland, Israel, Italy, Japan, Mexico, Netherlands, Nigeria,
    Norway, Peru, Philippines, Poland, Portugal, Romania, Russia, Serbia, South Africa,
    South Korea, Spain, Sweden, Switzerland, Taiwan, Thailand, Turkey, Ukraine,
    United Kingdom, United States Of America
"""
_TAGS = """
    Anime, Based On Manga, Based On Novel Or Book, Based On True Story, Behind The Scenes,
    Biography, Christmas, Duringcreditsstinger, Found Footage, Gay Theme, Lgbt, Mockumentary,
    Music Documentary, Sequel, Short Film, Stand-up Comedy, Woman Director
"""
NOT_A_PERSON = {
    nome.strip() for nome in (_IDIOMAS + "," + _PAISES + "," + _TAGS).split(",") if nome.strip()
}


def remove_corrupted_people(conn: Connection) -> dict[str, int]:
    """Remove vínculos filme-pessoa corrompidos.

    Em ~2 mil filmes as colunas de pessoas vieram deslocadas (o diretor de
    Toy Story 4 era "Cowboy", outros tinham diretor "English" e ator "7.8").
    Regras usadas:
    1. se o filme tem uma pessoa com nome só de números, todo o registro está
       deslocado, então saem todos os vínculos desse filme;
    2. nomes que são idioma, país, gênero ou palavra-chave: sai só esse vínculo.
    Pessoas que ficaram sem filme por causa disso são apagadas.
    """

    genre_names = set(conn.execute(text("SELECT nome_genero FROM dim_genres")).scalars())
    junk_names = sorted(NOT_A_PERSON | genre_names)
    conn.execute(text("DROP TABLE IF EXISTS temp.junk_people"))
    conn.execute(text("CREATE TEMP TABLE junk_people (sk_person_id TEXT PRIMARY KEY)"))
    # NOT GLOB '*[^0-9.,]*' = nome só com números (ex.: "7.8")
    conn.execute(
        text(
            """
            INSERT INTO junk_people
            SELECT sk_person_id FROM dim_people WHERE nome_pessoa NOT GLOB '*[^0-9.,]*'
            """
        )
    )
    numeric_people = conn.execute(text("SELECT COUNT(*) FROM junk_people")).scalar_one()
    conn.execute(
        text(
            "INSERT OR IGNORE INTO junk_people SELECT sk_person_id FROM dim_people "
            "WHERE nome_pessoa IN :names"
        ).bindparams(bindparam("names", expanding=True)),
        {"names": junk_names},
    )

    conn.execute(text("DROP TABLE IF EXISTS temp.corrupted_movies"))
    conn.execute(
        text(
            """
            CREATE TEMP TABLE corrupted_movies AS
            SELECT DISTINCT b.sk_movie_id FROM bridge_movie_person b
            JOIN dim_people p ON p.sk_person_id = b.sk_person_id
            WHERE p.nome_pessoa NOT GLOB '*[^0-9.,]*'
            """
        )
    )
    # guarda quem pode ficar sem filme (para não apagar quem já vinha sem filme no CSV)
    conn.execute(text("DROP TABLE IF EXISTS temp.touched_people"))
    conn.execute(
        text(
            """
            CREATE TEMP TABLE touched_people AS
            SELECT DISTINCT sk_person_id FROM bridge_movie_person
            WHERE sk_movie_id IN (SELECT sk_movie_id FROM corrupted_movies)
            UNION SELECT sk_person_id FROM junk_people
            """
        )
    )
    links_before = conn.execute(text("SELECT COUNT(*) FROM bridge_movie_person")).scalar_one()
    corrupted_movies = conn.execute(text("SELECT COUNT(*) FROM corrupted_movies")).scalar_one()
    conn.execute(
        text(
            "DELETE FROM bridge_movie_person "
            "WHERE sk_movie_id IN (SELECT sk_movie_id FROM corrupted_movies)"
        )
    )
    conn.execute(
        text(
            "DELETE FROM bridge_movie_person "
            "WHERE sk_person_id IN (SELECT sk_person_id FROM junk_people)"
        )
    )
    links_after = conn.execute(text("SELECT COUNT(*) FROM bridge_movie_person")).scalar_one()
    people_removed = conn.execute(
        text(
            """
            DELETE FROM dim_people
            WHERE sk_person_id IN (SELECT sk_person_id FROM touched_people)
              AND NOT EXISTS (
                  SELECT 1 FROM bridge_movie_person b WHERE b.sk_person_id = dim_people.sk_person_id
              )
            """
        )
    ).rowcount
    for table_name in ("junk_people", "corrupted_movies", "touched_people"):
        conn.execute(text(f"DROP TABLE temp.{table_name}"))
    return {
        "filmes_com_registro_deslocado": corrupted_movies,
        "pessoas_com_nome_numerico": numeric_people,
        "vinculos_removidos": links_before - links_after,
        "pessoas_removidas": people_removed,
    }


def rebuild_review_summaries(conn: Connection) -> dict[str, int]:
    """Recalcula dim_reviews a partir de movie_reviews.

    O dim_reviews.csv não bate com as avaliações individuais (médias diferentes
    e filmes com avaliação sem resumo). Como o site mostra a média junto com a
    lista de avaliações, recalculo tudo e mostro no log o quanto divergia.
    """

    divergence = conn.execute(
        text(
            """
            WITH agg AS (
                SELECT sk_movie_id, COUNT(*) AS qtd, ROUND(AVG(nota), 2) AS media
                FROM movie_reviews GROUP BY sk_movie_id
            )
            SELECT
                (SELECT COUNT(*) FROM agg
                  WHERE sk_movie_id NOT IN (SELECT sk_movie_id FROM dim_reviews)) AS sem_resumo,
                (SELECT COUNT(*) FROM dim_reviews d JOIN agg a USING (sk_movie_id)
                  WHERE d.qtd_avaliacoes_usuarios <> a.qtd
                     OR ABS(COALESCE(d.nota_media_usuarios, -1) - a.media) > 0.01) AS divergentes,
                (SELECT COUNT(*) FROM dim_reviews
                  WHERE sk_movie_id NOT IN (SELECT sk_movie_id FROM agg)) AS sem_avaliacoes
            """
        )
    ).one()

    conn.execute(text("DELETE FROM dim_reviews"))
    # sk_review_id = sk_movie_id, igual ao CSV original
    conn.execute(
        text(
            """
            INSERT INTO dim_reviews
                (sk_review_id, sk_movie_id, qtd_avaliacoes_usuarios, nota_media_usuarios)
            SELECT sk_movie_id, sk_movie_id, COUNT(*), ROUND(AVG(nota), 2)
            FROM movie_reviews
            GROUP BY sk_movie_id
            """
        )
    )
    return {
        "filmes_com_resenha_sem_resumo_no_csv": divergence.sem_resumo,
        "resumos_divergentes_no_csv": divergence.divergentes,
        "resumos_sem_resenhas_no_csv": divergence.sem_avaliacoes,
    }


def run_seed(database_url: str, data_dirs: list[Path], reset: bool = False) -> dict[str, int]:
    """Faz a carga completa e devolve quantas linhas foram inseridas por tabela."""

    paths = {table: find_csv(data_dirs, filename) for filename, table in CSV_TABLE_ORDER}

    sync_url = database_url.replace("+aiosqlite", "")
    engine = create_engine(sync_url)

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # synchronous=OFF deixa a carga bem mais rápida (se cair, é só rodar com --reset)
        cursor.execute("PRAGMA synchronous=OFF")
        cursor.execute("PRAGMA cache_size=-128000")
        cursor.close()

    counts: dict[str, int] = {}
    try:
        with engine.begin() as conn:
            movies = Base.metadata.tables["dim_movies"]
            existing = conn.execute(select(func.count()).select_from(movies)).scalar_one()
            if existing and not reset:
                raise SystemExit(
                    f"O banco já possui {existing} filmes. Use --reset para recarregar do zero."
                )
            if existing:
                logger.info("Limpando dados existentes (--reset)...")
                reset_database(conn)

            for table_name, path in paths.items():
                started = time.perf_counter()
                table = Base.metadata.tables[table_name]
                counts[table_name] = load_table(conn, table, path)
                logger.info(
                    "%-26s %9s linhas  (%s, %.1fs)",
                    table_name,
                    f"{counts[table_name]:,}".replace(",", "."),
                    path.name,
                    time.perf_counter() - started,
                )

            cleanup = remove_corrupted_people(conn)
            counts["bridge_movie_person"] -= cleanup["vinculos_removidos"]
            counts["dim_people"] -= cleanup["pessoas_removidas"]
            logger.info(
                "Pessoas corrompidas: %s filmes com registro deslocado, %s vínculos e %s "
                "pessoas removidos (%s nomes numéricos).",
                cleanup["filmes_com_registro_deslocado"],
                cleanup["vinculos_removidos"],
                cleanup["pessoas_removidas"],
                cleanup["pessoas_com_nome_numerico"],
            )

            report = rebuild_review_summaries(conn)
            counts["dim_reviews"] = conn.execute(
                text("SELECT COUNT(*) FROM dim_reviews")
            ).scalar_one()
            logger.info(
                "dim_reviews recalculado a partir de movie_reviews: %s resumos "
                "(CSV original: %s divergentes, %s filmes com resenhas sem resumo, "
                "%s resumos sem nenhuma resenha).",
                counts["dim_reviews"],
                report["resumos_divergentes_no_csv"],
                report["filmes_com_resenha_sem_resumo_no_csv"],
                report["resumos_sem_resenhas_no_csv"],
            )
            conn.execute(text("INSERT INTO movies_search(movies_search) VALUES ('optimize')"))

        # ANALYZE ajuda o SQLite a escolher os índices certos nas consultas
        with engine.connect() as conn:
            conn.execute(text("ANALYZE"))
            conn.commit()
    finally:
        engine.dispose()
    return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Popula o banco com os CSVs da atividade.")
    parser.add_argument(
        "--data-dir",
        action="append",
        type=Path,
        dest="data_dirs",
        help="Diretório com os CSVs (pode ser repetido). Padrão: ../data",
    )
    parser.add_argument(
        "--reset", action="store_true", help="Apaga os dados existentes antes da carga."
    )
    parser.add_argument("--database-url", default=None, help="Sobrescreve DATABASE_URL do .env.")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    data_dirs = args.data_dirs or [Path("../data")]
    database_url = args.database_url or get_settings().database_url

    started = time.perf_counter()
    try:
        run_seed(database_url, data_dirs, reset=args.reset)
    except FileNotFoundError as exc:
        logger.error("%s", exc)
        sys.exit(1)
    logger.info("Carga concluída em %.1fs.", time.perf_counter() - started)


if __name__ == "__main__":
    main()
