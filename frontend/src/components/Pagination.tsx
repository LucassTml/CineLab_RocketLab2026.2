import { ArrowLeft, ArrowRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { formatInteger, getPageItems } from '../utils'

interface PaginationProps {
  page: number
  pages: number
  onChange: (page: number) => void
}

// Anterior / números / próxima, com um campo para pular direto para uma página.
// A página atual tem um traço embaixo; "primeira" e "última" estão nos números.
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
        className="pagination__step"
        onClick={() => go(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
      >
        <ArrowLeft size={15} /> <span>Anterior</span>
      </button>

      <div className="pagination__pages">
        {getPageItems(page, pages).map((item) =>
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              className="pagination__page"
              aria-current={item === page ? 'page' : undefined}
              aria-label={`Página ${item}`}
              onClick={() => go(item)}
            >
              {formatInteger(item)}
            </button>
          ) : (
            <span key={item} className="pagination__ellipsis" aria-hidden>
              …
            </span>
          ),
        )}
      </div>

      <button
        type="button"
        className="pagination__step"
        onClick={() => go(page + 1)}
        disabled={page === pages}
        aria-label="Próxima página"
      >
        <span>Próxima</span> <ArrowRight size={15} />
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
