"""Busca de filmes por título (FTS5) e índices para o catálogo.

movies_search é uma tabela virtual FTS5 com uma cópia do título. O tokenizer
remove_diacritics ignora acentos e os triggers em dim_movies mantêm a tabela
atualizada sozinha. Os índices foram escolhidos testando as consultas do
catálogo com os dados reais (ordenar por popularidade, nota, ano e filtrar
por gênero/produtora).

Revision ID: 0002_search_and_indexes
Revises: 0001_initial_movie_schema
Create Date: 2026-09-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_search_and_indexes"
down_revision: str | Sequence[str] | None = "0001_initial_movie_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_fact_movies_performance_popularidade", "fact_movies_performance", ["popularidade"]
    )
    op.drop_index("ix_dim_movies_ano_lancamento", table_name="dim_movies")
    op.create_index("ix_dim_movies_ano_data", "dim_movies", ["ano_lancamento", "data_lancamento"])
    op.create_index(
        "ix_dim_reviews_nota_qtd", "dim_reviews", ["nota_media_usuarios", "qtd_avaliacoes_usuarios"]
    )
    op.create_index(
        "ix_dim_reviews_qtd_nota", "dim_reviews", ["qtd_avaliacoes_usuarios", "nota_media_usuarios"]
    )
    op.create_index("ix_bridge_movie_genre_sk_genre_id", "bridge_movie_genre", ["sk_genre_id"])
    op.create_index(
        "ix_bridge_movie_company_sk_company_id", "bridge_movie_company", ["sk_company_id"]
    )
    op.create_index("ix_movie_reviews_created_at", "movie_reviews", ["created_at"])

    op.execute(
        """
        CREATE VIRTUAL TABLE movies_search USING fts5(
            sk_movie_id UNINDEXED,
            titulo,
            tokenize = 'unicode61 remove_diacritics 2'
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_dim_movies_search_insert AFTER INSERT ON dim_movies
        BEGIN
            INSERT INTO movies_search (sk_movie_id, titulo)
            VALUES (new.sk_movie_id, new.titulo);
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_dim_movies_search_update AFTER UPDATE OF titulo ON dim_movies
        BEGIN
            UPDATE movies_search SET titulo = new.titulo WHERE sk_movie_id = old.sk_movie_id;
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_dim_movies_search_delete AFTER DELETE ON dim_movies
        BEGIN
            DELETE FROM movies_search WHERE sk_movie_id = old.sk_movie_id;
        END
        """
    )
    # Indexa filmes que já existiam antes desta migração.
    op.execute(
        "INSERT INTO movies_search (sk_movie_id, titulo) SELECT sk_movie_id, titulo FROM dim_movies"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_dim_movies_search_delete")
    op.execute("DROP TRIGGER IF EXISTS trg_dim_movies_search_update")
    op.execute("DROP TRIGGER IF EXISTS trg_dim_movies_search_insert")
    op.execute("DROP TABLE IF EXISTS movies_search")
    op.drop_index("ix_movie_reviews_created_at", table_name="movie_reviews")
    op.drop_index("ix_bridge_movie_company_sk_company_id", table_name="bridge_movie_company")
    op.drop_index("ix_bridge_movie_genre_sk_genre_id", table_name="bridge_movie_genre")
    op.drop_index("ix_dim_reviews_qtd_nota", table_name="dim_reviews")
    op.drop_index("ix_dim_reviews_nota_qtd", table_name="dim_reviews")
    op.drop_index("ix_dim_movies_ano_data", table_name="dim_movies")
    op.create_index("ix_dim_movies_ano_lancamento", "dim_movies", ["ano_lancamento"])
    op.drop_index("ix_fact_movies_performance_popularidade", table_name="fact_movies_performance")
