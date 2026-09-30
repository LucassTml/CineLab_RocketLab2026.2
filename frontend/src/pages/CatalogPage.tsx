import { Info, Plus, SlidersHorizontal, X } from 'lucide-react'
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigationType } from 'react-router'

import { useAuth } from '../auth'
import { useAmbient } from '../components/Ambient'
import { Dropdown } from '../components/Dropdown'
import { EmptyState, ErrorState } from '../components/Feedback'
import { CatalogFilters } from '../components/Filters'
import { MovieGrid, MovieGridSkeleton } from '../components/MovieCard'
import { Pagination } from '../components/Pagination'
import { SearchBar } from '../components/SearchBar'
import { FeaturedCarousel, GenreStrip } from '../components/Showcase'
import { genreLabel } from '../genres'
import {
  countActiveFilters,
  DEFAULT_PAGE_SIZE,
  serializeCatalogParams,
  useCatalogParams,
  useCompany,
  useDocumentTitle,
  useFeatured,
  useGenres,
  useMovies,
  usePerson,
  useYears,
} from '../hooks'
import { prefersReducedMotion } from '../motion'
import type { MovieFilters, SortField, SortOrder } from '../types'
import { formatInteger } from '../utils'

type SortValue = `${SortField}:${SortOrder}` | 'relevancia'

// opções da ordenação (campo + direção)
const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'popularidade:desc', label: 'Mais populares' },
  { value: 'nota:desc', label: 'Mais bem avaliados' },
  { value: 'avaliacoes:desc', label: 'Mais avaliados' },
  { value: 'ano:desc', label: 'Mais recentes' },
  { value: 'ano:asc', label: 'Mais antigos' },
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
const PAGE_SIZES = [24, 48, 96].map((size) => ({ value: String(size), label: `${size} filmes` }))

export function CatalogPage() {
  const { isAdmin } = useAuth()
  const { filters, update, reset } = useCatalogParams()
  const navigationType = useNavigationType()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const catalogRef = useRef<HTMLDivElement>(null)
  useDocumentTitle(filters.q ? `Busca: ${filters.q}` : 'Catálogo')

  // quando tem busca, o padrão é ordenar por relevância
  const sort: SortField = filters.sort ?? (filters.q ? 'relevancia' : 'popularidade')
  const order = filters.order ?? DEFAULT_ORDER[sort]
  const query: MovieFilters = { ...filters, sort, order: sort === 'relevancia' ? undefined : order }

  const movies = useMovies(query)
  const genres = useGenres()
  const years = useYears()
  const person = usePerson(filters.pessoa)
  const company = useCompany(filters.produtora)
  const activeCount = countActiveFilters(filters)
  const filtering = activeCount > 0 || Boolean(filters.q)
  // a vitrine (destaques + gêneros) só aparece na primeira página sem filtro
  const showcase = !filtering && filters.page === 1
  const featured = useFeatured(showcase)
  const onlyRated = sort === 'nota' || sort === 'avaliacoes' || filters.nota_min != null

  // sem vitrine o fundo fica neutro (com vitrine, o carrossel cuida da cor)
  useAmbient(showcase ? undefined : null)

  // Mudou filtro, ordem ou página: sobe até o começo da lista, para os
  // resultados novos aparecerem (menos quando é o "voltar" do navegador).
  const signature = serializeCatalogParams(filters).toString()
  const lastSignature = useRef(signature)
  useLayoutEffect(() => {
    if (lastSignature.current === signature) return
    lastSignature.current = signature
    const element = catalogRef.current
    if (!element || navigationType === 'POP') return
    const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - 80)
    const distance = window.scrollY - top
    if (distance > 0) {
      // longe demais: pula direto (rolar 5 mil pixels "suave" fica estranho)
      const smooth = distance < 2400 && !prefersReducedMotion()
      window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    }
  }, [signature, navigationType])

  const genreName = (id: string) => {
    const genre = genres.data?.find((item) => item.id === id)
    return genre ? genreLabel(genre.nome) : '...'
  }
  const chips: { key: string; label: string; remove: () => void }[] = []
  if (filters.q) {
    chips.push({ key: 'q', label: `“${filters.q}”`, remove: () => update({ q: undefined, sort: undefined }) })
  }
  for (const id of filters.genero ?? []) {
    chips.push({
      key: `g-${id}`,
      label: genreName(id),
      remove: () => update({ genero: filters.genero?.filter((genre) => genre !== id) }),
    })
  }
  if (filters.ano_min != null || filters.ano_max != null) {
    chips.push({
      key: 'ano',
      label: `${filters.ano_min ?? '...'} – ${filters.ano_max ?? '...'}`,
      remove: () => update({ ano_min: undefined, ano_max: undefined }),
    })
  }
  if (filters.nota_min != null) {
    chips.push({
      key: 'nota',
      label: `Nota ≥ ${String(filters.nota_min / 2).replace('.', ',')}★`,
      remove: () => update({ nota_min: undefined }),
    })
  }
  if (filters.status) {
    chips.push({ key: 'status', label: filters.status, remove: () => update({ status: undefined }) })
  }
  if (filters.pessoa) {
    chips.push({
      key: 'pessoa',
      label: person.data ? `${person.data.tipo}: ${person.data.nome}` : 'Pessoa',
      remove: () => update({ pessoa: undefined }),
    })
  }
  if (filters.produtora) {
    chips.push({
      key: 'produtora',
      label: company.data ? `Produtora: ${company.data.nome}` : 'Produtora',
      remove: () => update({ produtora: undefined }),
    })
  }

  // título da lista conforme o que está filtrado
  let title = 'Todos os filmes'
  if (filters.q) title = `Resultados para “${filters.q}”`
  else if (filters.pessoa && person.data) title = person.data.nome
  else if (filters.genero?.length === 1 && activeCount === 1) title = genreName(filters.genero[0])
  else if (filtering) title = 'Filmes filtrados'

  const data = movies.data
  const sortValue: SortValue = sort === 'relevancia' ? 'relevancia' : `${sort}:${order}`
  const sortOptions = filters.q
    ? [{ value: 'relevancia' as SortValue, label: 'Mais relevantes' }, ...SORT_OPTIONS]
    : SORT_OPTIONS

  return (
    <>
      {showcase && featured.data && <FeaturedCarousel movies={featured.data.items} />}
      {showcase && genres.data && (
        <GenreStrip genres={genres.data} onSelect={(id) => update({ genero: [id] })} />
      )}

      <div
        className={`container catalog ${showcase ? '' : 'catalog--top'}`}
        ref={catalogRef}
        id="catalogo"
      >
        <CatalogFilters
          filters={filters}
          genres={genres.data ?? []}
          years={years.data ?? []}
          update={update}
          reset={reset}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          search={
            <SearchBar
              value={filters.q ?? ''}
              onSubmit={(q) => update({ q: q || undefined, sort: undefined, order: undefined })}
              onSelectPerson={(p) => update({ pessoa: p.id })}
            />
          }
        />

        <section className="catalog__main" aria-labelledby="catalog-title">
          <header className="catalog__head">
            <div className="catalog__heading">
              <p className="eyebrow">{filtering ? 'Resultado' : 'Catálogo completo'}</p>
              <h1 className="catalog__title" id="catalog-title" key={title}>
                {title}
              </h1>
              <p className="catalog__count" aria-live="polite">
                {data ? (
                  <>
                    <strong>{formatInteger(data.total)}</strong> {data.total === 1 ? 'filme' : 'filmes'}
                    {data.pages > 1 && (
                      <> · página {formatInteger(data.page)} de {formatInteger(data.pages)}</>
                    )}
                  </>
                ) : (
                  ' '
                )}
              </p>
            </div>
            <div className="catalog__tools">
              <button type="button" className="btn btn--ghost catalog__filters-btn" onClick={() => setDrawerOpen(true)}>
                <SlidersHorizontal size={15} /> Filtros
                {activeCount > 0 && <span className="count-badge">{activeCount}</span>}
              </button>
              <Dropdown
                label="Ordenar"
                value={sortValue}
                options={sortOptions}
                align="end"
                onChange={(value) => {
                  const [field, direction] = value.split(':') as [SortField, SortOrder?]
                  update({ sort: field, order: direction })
                }}
              />
              <Dropdown
                label="Exibir"
                value={String(filters.page_size ?? DEFAULT_PAGE_SIZE)}
                options={PAGE_SIZES}
                align="end"
                onChange={(value) => update({ page_size: Number(value) })}
              />
              {isAdmin && (
                <Link to="/filmes/novo" className="btn btn--light">
                  <Plus size={16} /> Novo filme
                </Link>
              )}
            </div>
          </header>

          {chips.length > 0 && (
            <div className="active-filters" aria-label="Filtros ativos">
              {chips.map((chip, index) => (
                <span key={chip.key} className="chip" style={{ '--i': index } as CSSProperties}>
                  {chip.label}
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label={`Remover filtro ${chip.label}`}
                    onClick={chip.remove}
                  >
                    <X size={13} />
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
              <Info size={15} /> Mostrando apenas filmes que já receberam avaliações.
            </p>
          )}

          {movies.isError ? (
            <ErrorState error={movies.error} onRetry={() => void movies.refetch()} />
          ) : movies.isPending ? (
            <MovieGridSkeleton count={Math.min(filters.page_size ?? DEFAULT_PAGE_SIZE, 12)} />
          ) : data && data.items.length > 0 ? (
            <div className={movies.isPlaceholderData ? 'is-fetching' : undefined}>
              <MovieGrid movies={data.items} />
              <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
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
                <button type="button" className="btn btn--ghost" onClick={reset}>
                  Limpar busca e filtros
                </button>
              }
            />
          )}
        </section>
      </div>
    </>
  )
}
