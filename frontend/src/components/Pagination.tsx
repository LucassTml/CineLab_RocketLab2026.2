import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { formatInteger, getPageItems } from '../utils'

interface PaginationProps {
  page: number
  pages: number
  onChange: (page: number) => void
}

export function Pagination({ page, pages, onChange }: PaginationProps) {
  const [jump, setJump] = useState('')
  if (pages <= 1) return null

  const go = (target: number) => {
    const clamped = Math.min(pages, Math.max(1, target))
    if (clamped !== page) onChange(clamped)
  }
  const submitJump = (event: FormEvent) => {
    event.preventDefault()
    const target = Number(jump)
    if (Number.isInteger(target)) go(target)
    setJump('')
  }

  return (
    <nav className="pagination" aria-label="Paginação">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => go(1)}
        disabled={page === 1}
        aria-label="Primeira página"
      >
        <ChevronsLeft size={16} />
      </button>
      <button
        type="button"
        className="pagination__btn"
        onClick={() => go(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
      >
        <ChevronLeft size={16} />
      </button>

      {getPageItems(page, pages).map((item) =>
        typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            className="pagination__btn"
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Página ${item}`}
            onClick={() => go(item)}
          >
            {formatInteger(item)}
          </button>
        ) : (
          <span key={item} className="pagination__ellipsis" aria-hidden>
            ...
          </span>
        ),
      )}

      <button
        type="button"
        className="pagination__btn"
        onClick={() => go(page + 1)}
        disabled={page === pages}
        aria-label="Próxima página"
      >
        <ChevronRight size={16} />
      </button>
      <button
        type="button"
        className="pagination__btn"
        onClick={() => go(pages)}
        disabled={page === pages}
        aria-label="Última página"
      >
        <ChevronsRight size={16} />
      </button>

      <form className="pagination__jump" onSubmit={submitJump}>
        <label htmlFor="page-jump">Ir para</label>
        <input
          id="page-jump"
          className="input"
          type="number"
          min={1}
          max={pages}
          inputMode="numeric"
          placeholder={String(page)}
          value={jump}
          onChange={(event) => setJump(event.target.value)}
        />
        <button type="submit" className="sr-only">
          Ir
        </button>
      </form>
    </nav>
  )
}
