// Barra lateral de filtros do catálogo (no celular vira uma gaveta).
// - Gêneros: lista com a quantidade de filmes; o quadradinho marca os ativos
// - Ano: histograma de filmes por ano com um controle de duas pontas
// - Nota mínima: botões segmentados (o fundo desliza até a opção escolhida)
// - Status: etiquetas

import { X } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'

import { genreLabel } from '../genres'
import { countActiveFilters } from '../hooks'
import { type GenreWithCount, type MovieFilters, STATUS_FILME, type YearCount } from '../types'
import { formatInteger } from '../utils'

const GENRES_PREVIEW = 8

// nota mínima em estrelas (a API recebe estrelas x 2)
const RATING_OPTIONS: { stars: number | undefined; label: string }[] = [
  { stars: undefined, label: 'Todas' },
  { stars: 2, label: '2★' },
  { stars: 3, label: '3★' },
  { stars: 3.5, label: '3,5★' },
  { stars: 4, label: '4★' },
  { stars: 4.5, label: '4,5★' },
]

function FilterGroup({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="filter-group">
      <div className="filter-group__head">
        <h3 className="filter-group__title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

interface CatalogFiltersProps {
  filters: MovieFilters
  genres: GenreWithCount[]
  years: YearCount[]
  search: ReactNode
  update: (changes: Partial<MovieFilters>) => void
  reset: () => void
  open: boolean
  onClose: () => void
}

export function CatalogFilters({
  filters,
  genres,
  years,
  search,
  update,
  reset,
  open,
  onClose,
}: CatalogFiltersProps) {
  const [showAll, setShowAll] = useState(false)
  const selected = new Set(filters.genero ?? [])
  const sorted = [...genres].sort((a, b) => b.total_filmes - a.total_filmes)
  // gênero marcado continua aparecendo mesmo com a lista recolhida
  const visible = showAll
    ? sorted
    : sorted.filter((genre, index) => index < GENRES_PREVIEW || selected.has(genre.id))
  const activeCount = countActiveFilters(filters)
  const ratingIndex = RATING_OPTIONS.findIndex(
    (option) => option.stars === (filters.nota_min != null ? filters.nota_min / 2 : undefined),
  )

  // gaveta do celular fecha com Esc
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const toggleGenre = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update({ genero: [...next] })
  }

  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Filtros do catálogo">
        <div className="sidebar__head">
          <h2 className="sidebar__title">Filtros</h2>
          {activeCount > 0 && (
            <button type="button" className="link-button" onClick={reset}>
              Limpar ({activeCount})
            </button>
          )}
          <button type="button" className="icon-btn sidebar__close" onClick={onClose} aria-label="Fechar filtros">
            <X size={18} />
          </button>
        </div>

        {search}

        <FilterGroup title="Gêneros">
          <ul className="facets">
            {visible.map((genre, index) => (
              <li
                key={genre.id}
                className={index >= GENRES_PREVIEW ? 'is-extra' : undefined}
                style={{ '--i': Math.max(0, index - GENRES_PREVIEW) } as CSSProperties}
              >
                <button
                  type="button"
                  className={`facet ${selected.has(genre.id) ? 'is-active' : ''}`}
                  aria-pressed={selected.has(genre.id)}
                  onClick={() => toggleGenre(genre.id)}
                >
                  <span className="facet__bullet" aria-hidden />
                  <span className="facet__name">{genreLabel(genre.nome)}</span>
                  <span className="facet__count">{formatInteger(genre.total_filmes)}</span>
                </button>
              </li>
            ))}
          </ul>
          {sorted.length > GENRES_PREVIEW && (
            <button
              type="button"
              className="link-button facets__more"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Mostrar menos' : `Ver os ${sorted.length} gêneros`}
            </button>
          )}
          {selected.size > 1 && (
            <p className="field__hint">Mostrando filmes com todos os gêneros marcados.</p>
          )}
        </FilterGroup>

        {years.length > 1 && (
          <YearFilter
            years={years}
            min={filters.ano_min}
            max={filters.ano_max}
            onChange={(ano_min, ano_max) => update({ ano_min, ano_max })}
          />
        )}

        <FilterGroup title="Nota mínima">
          <div
            className="segmented"
            role="group"
            aria-label="Nota mínima"
            style={{ '--n': RATING_OPTIONS.length, '--i': ratingIndex } as CSSProperties}
          >
            {ratingIndex >= 0 && <span className="segmented__thumb" aria-hidden />}
            {RATING_OPTIONS.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className="segmented__option"
                aria-pressed={index === ratingIndex}
                onClick={() => update({ nota_min: option.stars != null ? option.stars * 2 : undefined })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup title="Status">
          <div className="tags">
            {STATUS_FILME.map((status) => (
              <button
                key={status}
                type="button"
                className={`tag ${filters.status === status ? 'is-active' : ''}`}
                aria-pressed={filters.status === status}
                onClick={() => update({ status: filters.status === status ? undefined : status })}
              >
                {status}
              </button>
            ))}
          </div>
        </FilterGroup>
      </aside>
    </>
  )
}

interface YearFilterProps {
  years: YearCount[]
  min?: number
  max?: number
  onChange: (min: number | undefined, max: number | undefined) => void
}

// As barras mostram quantos filmes há em cada ano; as que estão dentro do
// intervalo escolhido ficam claras. O filtro só é aplicado 400 ms depois de
// parar de arrastar (senão cada ano no caminho faria uma busca).
function YearFilter({ years, min, max, onChange }: YearFilterProps) {
  const lower = years[0].ano
  const upper = years[years.length - 1].ano
  const [range, setRange] = useState<[number, number]>([min ?? lower, max ?? upper])
  const timer = useRef(0)

  // o filtro mudou por fora (chip removido, "limpar"): acompanha
  const signature = `${min}|${max}|${lower}|${upper}`
  const [synced, setSynced] = useState(signature)
  if (synced !== signature) {
    setSynced(signature)
    setRange([min ?? lower, max ?? upper])
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const change = (from: number, to: number) => {
    const next: [number, number] = [Math.min(from, to), Math.max(from, to)]
    setRange(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const start = next[0] > lower ? next[0] : undefined
      const end = next[1] < upper ? next[1] : undefined
      if (start !== min || end !== max) onChange(start, end)
    }, 400)
  }

  const [from, to] = range
  const peak = Math.max(...years.map((year) => year.total_filmes), 1)
  const ratio = (value: number) => (value - lower) / Math.max(1, upper - lower)
  const all = from === lower && to === upper

  return (
    <FilterGroup
      title="Ano de lançamento"
      aside={<span className="filter-group__value">{all ? 'Todos' : `${from} – ${to}`}</span>}
    >
      <div className="year-filter" style={{ '--n': years.length } as CSSProperties}>
        <div className="year-filter__bars" aria-hidden>
          {years.map((year) => (
            <span
              key={year.ano}
              className={year.ano >= from && year.ano <= to ? 'is-in' : undefined}
              style={{ height: `${Math.max(5, (year.total_filmes / peak) * 100)}%` }}
              title={`${year.ano}: ${formatInteger(year.total_filmes)} filmes`}
            />
          ))}
        </div>
        <div
          className="range"
          style={{ '--f': ratio(from), '--t': ratio(to) } as CSSProperties}
        >
          <input
            type="range"
            min={lower}
            max={upper}
            step={1}
            value={from}
            aria-label="Ano inicial"
            onChange={(event) => change(Math.min(Number(event.target.value), to), to)}
          />
          <input
            type="range"
            min={lower}
            max={upper}
            step={1}
            value={to}
            aria-label="Ano final"
            onChange={(event) => change(from, Math.max(Number(event.target.value), from))}
          />
        </div>
        <div className="year-filter__values" aria-hidden>
          <span>{from}</span>
          <span className="year-filter__dash" />
          <span>{to}</span>
        </div>
      </div>
    </FilterGroup>
  )
}
