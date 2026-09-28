import { X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { countActiveFilters } from '../hooks'
import { type GenreWithCount, type MovieFilters, STATUS_FILME, type StatusFilme } from '../types'
import { formatInteger } from '../utils'

// nota mínima em estrelas (a API recebe estrelas x 2)
const MIN_RATING_OPTIONS = [1, 2, 3, 3.5, 4, 4.5]

interface CatalogFiltersProps {
  filters: MovieFilters
  genres: GenreWithCount[]
  update: (changes: Partial<MovieFilters>) => void
  reset: () => void
  open: boolean
  onClose: () => void
}

// Barra lateral de filtros. No celular vira uma gaveta (botão "Filtros").
export function CatalogFilters({ filters, genres, update, reset, open, onClose }: CatalogFiltersProps) {
  const selected = new Set(filters.genero ?? [])
  const toggleGenre = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update({ genero: [...next] })
  }

  return (
    <>
      {open && <div className="catalog__backdrop" onClick={onClose} aria-hidden />}
      <aside
        className={`catalog__sidebar ${open ? 'catalog__sidebar--open' : ''}`}
        aria-label="Filtros do catálogo"
      >
        <div className="catalog__sidebar-header">
          <strong>Filtros</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar filtros">
            <X size={18} />
          </button>
        </div>

        <section className="filter-group">
          <h2 className="filter-group__title">Gêneros</h2>
          <div className="chip-list">
            {genres.map((genre) => (
              <button
                key={genre.id}
                type="button"
                className={`chip ${selected.has(genre.id) ? 'chip--active' : ''}`}
                aria-pressed={selected.has(genre.id)}
                title={`${formatInteger(genre.total_filmes)} filmes`}
                onClick={() => toggleGenre(genre.id)}
              >
                {genre.nome}
              </button>
            ))}
          </div>
          {selected.size > 1 && (
            <p className="field__hint">Mostrando filmes com todos os gêneros selecionados.</p>
          )}
        </section>

        <YearRange
          min={filters.ano_min}
          max={filters.ano_max}
          onApply={(ano_min, ano_max) => update({ ano_min, ano_max })}
        />

        <section className="filter-group">
          <label className="filter-group__title" htmlFor="filter-rating">
            Nota média mínima
          </label>
          <select
            id="filter-rating"
            className="select"
            value={filters.nota_min != null ? String(filters.nota_min / 2) : ''}
            onChange={(event) =>
              update({ nota_min: event.target.value ? Number(event.target.value) * 2 : undefined })
            }
          >
            <option value="">Qualquer nota</option>
            {MIN_RATING_OPTIONS.map((stars) => (
              <option key={stars} value={stars}>
                {String(stars).replace('.', ',')}★ ou mais
              </option>
            ))}
          </select>
        </section>

        <section className="filter-group">
          <label className="filter-group__title" htmlFor="filter-status">
            Status
          </label>
          <select
            id="filter-status"
            className="select"
            value={filters.status ?? ''}
            onChange={(event) =>
              update({ status: (event.target.value || undefined) as StatusFilme | undefined })
            }
          >
            <option value="">Todos</option>
            {STATUS_FILME.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </section>

        {countActiveFilters(filters) > 0 && (
          <button type="button" className="btn btn--ghost" onClick={reset}>
            Limpar filtros
          </button>
        )}
      </aside>
    </>
  )
}

interface YearRangeProps {
  min?: number
  max?: number
  onApply: (min: number | undefined, max: number | undefined) => void
}

// O ano só é aplicado ao sair do campo ou apertar Enter; se fosse a cada
// tecla, digitar "2018" faria buscas por 2, 20, 201 e 2018.
function YearRange({ min, max, onApply }: YearRangeProps) {
  const [from, setFrom] = useState(min?.toString() ?? '')
  const [to, setTo] = useState(max?.toString() ?? '')

  // atualiza os campos se o filtro mudar por fora (ex.: removeu o chip)
  const [synced, setSynced] = useState({ min, max })
  if (synced.min !== min || synced.max !== max) {
    setSynced({ min, max })
    setFrom(min?.toString() ?? '')
    setTo(max?.toString() ?? '')
  }

  const apply = (event?: FormEvent) => {
    event?.preventDefault()
    const parse = (value: string) => (/^\d{4}$/.test(value) ? Number(value) : undefined)
    let start = parse(from)
    let end = parse(to)
    if (start && end && start > end) [start, end] = [end, start] // se inverteu, destroca
    if (start !== min || end !== max) onApply(start, end)
  }

  return (
    <form className="filter-group" onSubmit={apply}>
      <h2 className="filter-group__title">Ano de lançamento</h2>
      <div className="year-range">
        <input
          className="input"
          inputMode="numeric"
          placeholder="De"
          aria-label="Ano inicial"
          maxLength={4}
          value={from}
          onChange={(event) => setFrom(event.target.value.replace(/\D/g, ''))}
          onBlur={() => apply()}
        />
        <span>–</span>
        <input
          className="input"
          inputMode="numeric"
          placeholder="Até"
          aria-label="Ano final"
          maxLength={4}
          value={to}
          onChange={(event) => setTo(event.target.value.replace(/\D/g, ''))}
          onBlur={() => apply()}
        />
      </div>
      <button type="submit" className="sr-only">
        Aplicar anos
      </button>
    </form>
  )
}
