# Testes da carga dos CSVs (com CSVs pequenos que têm os mesmos problemas dos reais).

import csv
import sqlite3
from decimal import Decimal
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.seed import (
    clean_name,
    clean_synopsis,
    clean_title,
    run_seed,
    to_int,
    to_positive_int,
)
from tests.conftest import TEST_DB

M1, M2 = "m" * 64, "n" * 64


def _write(path: Path, header: list[str], rows: list[list[object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


@pytest.fixture
def csv_dir(tmp_path: Path) -> Path:
    _write(tmp_path / "dim_genres.csv", ["nome_genero", "sk_genre_id"], [["Drama", "g1"]])
    _write(tmp_path / "dim_companies.csv", ["nome_produtora", "sk_company_id"], [["Pixar", "c1"]])
    _write(
        tmp_path / "dim_people.csv",
        ["nome_pessoa", "tipo_pessoa", "sk_person_id"],
        [
            ["Diretora Real", "Diretor", "p1"],
            ["Ator Real", "Ator", "p2"],
            ["7.8", "Ator", "p3"],  # nota no lugar do nome -> registro deslocado
            ["English", "Diretor", "p4"],  # idioma no lugar do diretor
            ["Cowboy", "Diretor", "p5"],  # palavra-chave do filme deslocado
            ["Sem Filmes", "Ator", "p6"],  # já vinha sem vínculos: deve ser mantida
        ],
    )
    _write(
        tmp_path / "dim_movies.csv",
        [
            "sk_movie_id",
            "id_filme",
            "titulo",
            "data_lancamento",
            "ano_lancamento",
            "duracao_minutos",
            "status_filme",
            "sinopse",
            "url_poster",
            "url_backdrop",
        ],
        [
            [
                M1,
                "1",
                "Grizzly Ii",
                "2020-01-02",
                "2020",
                "0",
                "Lançado",
                '"Um ""filme"" bom."',
                "",
                "",
            ],
            [
                M2,
                "2",
                '"""blessed"""',
                "2021-05-06",
                "2021",
                "95",
                "Lançado",
                "Normal",
                "http://p",
                "",
            ],
        ],
    )
    _write(
        tmp_path / "fact_movies_performance.csv",
        [
            "sk_movie_id",
            "orcamento_usd",
            "receita_usd",
            "lucro_usd",
            "orcamento_brl",
            "receita_brl",
            "lucro_brl",
            "popularidade",
            "nota_tmdb",
            "qtd_tmdb",
            "nota_imdb",
            "qtd_imdb",
        ],
        [
            [M1, "100.0", "250.5", "150.5", "", "", "0.0", "1.5", "7.1", "2375.0", "", ""],
            [M2, "", "", "0.0", "", "", "0.0", "", "", "", "", ""],
        ],
    )
    _write(tmp_path / "bridge_movie_genre.csv", ["sk_movie_id", "sk_genre_id"], [[M1, "g1"]])
    _write(tmp_path / "bridge_movie_company.csv", ["sk_movie_id", "sk_company_id"], [[M1, "c1"]])
    _write(
        tmp_path / "bridge_movie_person.csv",
        ["sk_movie_id", "sk_person_id"],
        [[M1, "p1"], [M1, "p2"], [M1, "p4"], [M2, "p3"], [M2, "p5"], [M2, "p2"]],
    )
    _write(
        tmp_path / "movies_reviews.csv",
        ["sk_movie_review_id", "sk_movie_id", "nome", "nota", "comentario"],
        [["r1", M1, "Ana", "9.0", "Ótimo"], ["r2", M1, "Bia", "6.0", "Ok"]],
    )
    # Resumo divergente de propósito (2 avaliações reais, média 7.5).
    _write(
        tmp_path / "dim_reviews.csv",
        ["sk_review_id", "sk_movie_id", "qtd_avaliacoes_usuarios", "nota_media_usuarios"],
        [[M1, M1, "5", "2.0"]],
    )
    return tmp_path


def test_cleaning_helpers() -> None:
    assert clean_synopsis('"Um ""filme"" bom."') == 'Um "filme" bom.'
    assert clean_synopsis('"Texto truncado com ""aspas""') == 'Texto truncado com "aspas"'
    assert clean_synopsis("  ") is None
    assert clean_title('"""blessed"""') == '"Blessed"'
    assert clean_title("Grizzly Ii: Revenge") == "Grizzly II: Revenge"
    assert clean_title("Como Te Ves, Me Vi") == "Como Te Ves, Me Vi"  # "Vi" ambíguo fica
    assert clean_name("Abraham Hamilton Iii") == "Abraham Hamilton III"
    assert to_int("2375.0") == 2375
    assert to_positive_int("0") is None


def test_run_seed_loads_and_cleans_data(csv_dir: Path) -> None:
    with sqlite3.connect(TEST_DB) as conn:  # a fixture de limpeza deixa gêneros de base
        conn.execute("DELETE FROM dim_genres")

    counts = run_seed(get_settings().database_url, [csv_dir])

    with sqlite3.connect(TEST_DB) as conn:
        movie = conn.execute(
            "SELECT titulo, duracao_minutos, sinopse, url_poster FROM dim_movies "
            "WHERE sk_movie_id=?",
            (M1,),
        ).fetchone()
        assert movie == ("Grizzly II", None, 'Um "filme" bom.', None)
        assert conn.execute(
            "SELECT titulo FROM dim_movies WHERE sk_movie_id=?", (M2,)
        ).fetchone() == ('"Blessed"',)

        perf = conn.execute(
            "SELECT orcamento_usd, receita_usd, qtd_tmdb FROM fact_movies_performance "
            "WHERE sk_movie_id=?",
            (M1,),
        ).fetchone()
        assert (Decimal(str(perf[0])), Decimal(str(perf[1])), perf[2]) == (
            Decimal("100"),
            Decimal("250.5"),
            2375,
        )

        # M2 tinha ator numérico -> todo o registro de pessoas é descartado.
        links = set(conn.execute("SELECT sk_movie_id, sk_person_id FROM bridge_movie_person"))
        assert links == {(M1, "p1"), (M1, "p2")}
        people = {row[0] for row in conn.execute("SELECT sk_person_id FROM dim_people")}
        assert people == {"p1", "p2", "p6"}  # p6 já não tinha filmes e foi mantida

        # Resumo recalculado a partir das avaliações individuais.
        summary = conn.execute(
            "SELECT qtd_avaliacoes_usuarios, nota_media_usuarios FROM dim_reviews"
        ).fetchall()
        assert summary == [(2, 7.5)]

        # O índice de busca foi alimentado pelos triggers durante a carga.
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM movies_search WHERE movies_search MATCH 'grizzly'"
            ).fetchone()[0]
            == 1
        )

    assert counts["dim_movies"] == 2
    assert counts["bridge_movie_person"] == 2
    assert counts["dim_reviews"] == 1


def test_run_seed_refuses_to_duplicate_and_supports_reset(csv_dir: Path) -> None:
    with sqlite3.connect(TEST_DB) as conn:
        conn.execute("DELETE FROM dim_genres")
    url = get_settings().database_url

    run_seed(url, [csv_dir])
    with pytest.raises(SystemExit):
        run_seed(url, [csv_dir])
    counts = run_seed(url, [csv_dir], reset=True)

    assert counts["dim_movies"] == 2


def test_run_seed_reports_missing_files(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="dim_genres.csv"):
        run_seed(get_settings().database_url, [tmp_path])
