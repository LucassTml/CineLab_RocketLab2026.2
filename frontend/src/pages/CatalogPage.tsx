import { Info, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useAuth } from '../auth'
import { EmptyState, ErrorState } from '../components/Feedback'
import { CatalogFilters } from '../components/Filters'
import { MovieGrid, MovieGridSkeleton } from '../components/MovieCard'
import { Pagination } from '../components/Pagination'
import { SearchBar } from '../components/SearchBar'
import {
  countActiveFilters,
  useCatalogParams,
  useCompany,
  useDocumentTitle,
  useGenres,
  useMovies,
  usePerson,
} from '../hooks'
import type { MovieFilters, SortField, SortOrder } from '../types'
import { formatInteger } from '../utils'

// opções do select de ordenação (campo + direção)
const SORT_OPTIONS: { value: `${SortField}:${SortOrder}`; label: string }[] = [
  { value: 'popularidade:desc', label: 'Mais populares' },
  { value: 'nota:desc', label: 'Mais bem avaliados' },
  { value: 'avaliacoes:desc', label: 'Mais avaliados' },
  { value: 'ano:desc', label: 'Lançamentos recentes' },
  { value: 'ano:asc', label: 'Lançamentos antigos' },
  { value: 'titulo:asc', label: 'Título (A–Z)' },
  { value: 'titulo:desc', label: 'Título (Z–A)' },
  { value: 'nota:asc', label: 'Pior avaliados' },
]
const DEFAULT_ORDER: Record<SortField, SortOrder> = {
  relevancia: 'asc',
  popularidade: 'desc',
  nota: 'desc',
  avaliacoes: 'desc',
  ano: 'desc',
  titulo: 'asc',
}

export function CatalogPage() {
  const { isAdmin } = useAuth()
  const { filters, update, reset } = useCatalogParams()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useDocumentTitle(filters.q ? `Busca: ${filters.q}` : 'Catálogo')

  // quando tem busca, o padrão é ordenar por relevância
  const sort: SortField = filters.sort ?? (filters.q ? 'relevancia' : 'popularidade')
  const order = filters.order ?? DEFAULT_ORDER[sort]
  const query: MovieFilters = { ...filters, sort, order: sort === 'relevancia' ? undefined : order }

  const movies = useMovies(query)
  const genres = useGenres()
  const person = usePerson(filters.pessoa)
  const company = useCompany(filters.produtora)
  const onlyRated = sort === 'nota' || sort === 'avaliacoes' || filters.nota_min != null

  const changePage = (page: number) => {
    update({ page })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const genreName = (id: string) => genres.data?.find((genre) => genre.id === id)?.nome ?? '...'
  const activeChips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.q ? [{ key: 'q', label: `Busca: “${filters.q}”`, remove: () => update({ q: undefined, sort: undefined }) }] : []),
    ...(filters.genero ?? []).map((id) => ({
      key: `g-${id}`,
      label: genreName(id),
      remove: () => update({ genero: filters.genero?.filter((g) => g !== id) }),
    })),
    ...(filters.ano_min != null || filters.ano_max != null
      ? [
          {
            key: 'ano',
            label: `${filters.ano_min ?? '...'} – ${filters.ano_max ?? '...'}`,
            remove: () => update({ ano_min: undefined, ano_max: undefined }),
          },
        ]
      : []),
    ...(filters.nota_min != null
      ? [{ key: 'nota', label: `≥ ${String(filters.nota_min / 2).replace('.', ',')}★`, remove: () => update({ nota_min: undefined }) }]
      : []),
    ...(filters.status ? [{ key: 'status', label: filters.status, remove: () => update({ status: undefined }) }] : []),
    ...(filters.pessoa
      ? [{ key: 'pessoa', label: person.data ? `${person.data.tipo}: ${person.data.nome}` : 'Pessoa', remove: () => update({ pessoa: undefined }) }]
      : []),
    ...(filters.produtora
      ? [{ key: 'produtora', label: company.data ? `Produtora: ${company.data.nome}` : 'Produtora', remove: () => update({ produtora: undefined }) }]
      : []),
  ]

  const data = movies.data
  return (
    <div className="container">
      <header className="catalog-hero">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">Catálogo de filmes</h1>
            <p className="page-subtitle">
              Explore, pesquise e avalie {data ? formatInteger(data.total) : 'os'} filmes
              {countActiveFilters(filters) > 0 || filters.q ? ' encontrados' : ' cadastrados'}.
            </p>
          </div>
          {isAdmin && (
            <Link to="/filmes/novo" className="btn btn--primary">
              <Plus size={18} /> Novo filme
            </Link>
          )}
        </div>
        <SearchBar
          value={filters.q ?? ''}
          onSubmit={(q) => update({ q: q || undefined, sort: undefined, order: undefined })}
          onSelectPerson={(p) => update({ pessoa: p.id })}
        />
      </header>

      <div className="catalog">
        <CatalogFilters
          filters={filters}
          genres={genres.data ?? []}
          update={update}
          reset={reset}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        <section aria-label="Resultados">
          <div className="toolbar">
            <button
              type="button"
              className="btn toolbar__filters-btn"
              onClick={() => setDrawerOpen(true)}
            >
              <SlidersHorizontal size={16} /> Filtros
              {countActiveFilters(filters) > 0 && ` (${countActiveFilters(filters)})`}
            </button>
            <span className="toolbar__count" aria-live="polite">
              {data ? (
                <>
                  {formatInteger(data.total)} {data.total === 1 ? 'filme' : 'filmes'}
                  {data.pages > 1 && (
                    <small>
                      {' '}
                      · página {formatInteger(data.page)} de {formatInteger(data.pages)}
                    </small>
                  )}
                </>
              ) : (
                ' '
              )}
            </span>
            <div className="toolbar__controls">
              <label className="sr-only" htmlFor="sort">
                Ordenar por
              </label>
              <select
                id="sort"
                className="select"
                value={sort === 'relevancia' ? 'relevancia' : `${sort}:${order}`}
                onChange={(event) => {
                  const [field, direction] = event.target.value.split(':') as [SortField, SortOrder?]
                  update({ sort: field, order: direction })
                }}
              >
                {filters.q && <option value="relevancia">Mais relevantes</option>}
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="page-size">
                Filmes por página
              </label>
              <select
                id="page-size"
                className="select"
                value={filters.page_size}
                onChange={(event) => update({ page_size: Number(event.target.value) })}
              >
                {[24, 48, 96].map((size) => (
                  <option key={size} value={size}>
                    {size} por página
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeChips.length > 0 && (
            <div className="active-filters" aria-label="Filtros ativos">
              {activeChips.map((chip) => (
                <span key={chip.key} className="chip chip--active">
                  {chip.label}
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label={`Remover filtro ${chip.label}`}
                    onClick={chip.remove}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              <button type="button" className="link-button" onClick={reset}>
                Limpar tudo
              </button>
            </div>
          )}

          {onlyRated && (
            <p className="notice">
              <Info size={16} /> Mostrando apenas filmes que já receberam avaliações.
            </p>
          )}

          {movies.isError ? (
            <ErrorState error={movies.error} onRetry={() => void movies.refetch()} />
          ) : movies.isPending ? (
            <MovieGridSkeleton count={Math.min(filters.page_size ?? 24, 24)} />
          ) : data && data.items.length > 0 ? (
            <div className={movies.isPlaceholderData ? 'is-fetching' : undefined}>
              <MovieGrid movies={data.items} />
              <Pagination page={data.page} pages={data.pages} onChange={changePage} />
            </div>
          ) : (
            <EmptyState
              title="Nenhum filme encontrado"
              description={
                data && data.total > 0
                  ? 'Esta página não existe. Volte para a primeira página.'
                  : 'Tente outros termos de busca ou remova alguns filtros.'
              }
              action={
                <button type="button" className="btn" onClick={reset}>
                  Limpar busca e filtros
                </button>
              }
            />
          )}
        </section>
      </div>
    </div>
  )
}
