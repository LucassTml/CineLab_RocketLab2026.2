// Busca com sugestões de filmes e pessoas enquanto digita.
// - SearchBar: campo do catálogo. Enter busca no catálogo todo (vírgula separa
//   vários filmes); setas + Enter abrem uma sugestão.
// - SearchPalette: busca rápida de qualquer página (Ctrl+K ou "/"), aberta num
//   <dialog> por cima do site. Sem nada digitado, sugere os filmes em alta.
// As duas esperam um pouco sem digitar antes de consultar a API (debounce).

import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CornerDownLeft, Search, Star, User, X } from 'lucide-react'
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router'

import { api } from '../api'
import { genreLabel } from '../genres'
import { useDebouncedValue, useFeatured } from '../hooks'
import type { MovieSummary, PersonSuggestion } from '../types'
import { formatInteger, formatStars } from '../utils'
import { Poster } from './MovieCard'
import { useSpread } from './Spread'

type Option =
  | { kind: 'movie'; movie: MovieSummary }
  | { kind: 'person'; person: PersonSuggestion }

const PERSON_ROLE: Record<string, string> = {
  Ator: 'Elenco',
  Diretor: 'Direção',
  Roteirista: 'Roteiro',
}

function useSuggestions(term: string, enabled: boolean) {
  const movies = useQuery({
    queryKey: ['suggest', 'movies', term],
    queryFn: ({ signal }) => api.listMovies({ q: term, sort: 'relevancia', page_size: 6 }, signal),
    enabled,
    staleTime: 60_000,
  })
  const people = useQuery({
    queryKey: ['suggest', 'people', term],
    queryFn: ({ signal }) => api.searchPeople(term, undefined, signal),
    enabled,
    staleTime: 60_000,
  })
  const options: Option[] = enabled
    ? [
        ...(movies.data?.items ?? []).map((movie) => ({ kind: 'movie' as const, movie })),
        ...(people.data ?? []).slice(0, 4).map((person) => ({ kind: 'person' as const, person })),
      ]
    : []
  return { options, movies }
}

const optionKey = (option: Option) =>
  option.kind + (option.kind === 'movie' ? option.movie.id : option.person.id)

function OptionContent({ option }: { option: Option }) {
  if (option.kind === 'movie') {
    const { movie } = option
    return (
      <>
        <span className="suggest__thumb" data-spread>
          <Poster src={movie.url_poster} title={movie.titulo} size="w92" />
        </span>
        <span className="suggest__text">
          <span className="suggest__title">{movie.titulo}</span>
          <span className="suggest__sub">
            {movie.ano_lancamento ?? '-'}
            {movie.diretores[0] && ` · ${movie.diretores[0]}`}
            {movie.generos[0] && ` · ${genreLabel(movie.generos[0])}`}
          </span>
        </span>
        {movie.nota_media != null && (
          <span className="suggest__score">
            <Star size={11} fill="currentColor" strokeWidth={0} aria-hidden />
            {formatStars(movie.nota_media)}
          </span>
        )}
      </>
    )
  }
  const { person } = option
  return (
    <>
      <span className="suggest__avatar">
        <User size={16} strokeWidth={1.6} />
      </span>
      <span className="suggest__text">
        <span className="suggest__title">{person.nome}</span>
        <span className="suggest__sub">
          {PERSON_ROLE[person.tipo]} · {formatInteger(person.total_filmes)} filme(s)
        </span>
      </span>
      <span className="suggest__hint">filtrar</span>
    </>
  )
}

interface SuggestionListProps {
  id: string
  className: string
  options: Option[]
  active: number
  moviesLabel?: string
  emptyText?: string
  footer?: ReactNode
  onHover: (index: number) => void
  onChoose: (option: Option, element: HTMLElement) => void
}

function SuggestionList({
  id,
  className,
  options,
  active,
  moviesLabel = 'Filmes',
  emptyText,
  footer,
  onHover,
  onChoose,
}: SuggestionListProps) {
  const spread = useSpread()
  const firstPerson = options.findIndex((option) => option.kind === 'person')
  return (
    <ul id={id} className={className} role="listbox" aria-label="Sugestões">
      {options.length === 0 && emptyText && (
        <li className="suggest__empty" role="presentation">
          {emptyText}
        </li>
      )}
      {options.map((option, index) => (
        <li key={optionKey(option)} role="presentation" style={{ '--i': index } as CSSProperties}>
          {index === 0 && option.kind === 'movie' && (
            <div className="suggest__group" role="presentation">
              {moviesLabel}
            </div>
          )}
          {index === firstPerson && (
            <div className="suggest__group" role="presentation">
              Pessoas
            </div>
          )}
          <div
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            className="suggest__option"
            onMouseEnter={() => {
              onHover(index)
              if (option.kind === 'movie') spread?.prime(option.movie)
            }}
            onMouseDown={(event) => event.preventDefault()} // não tira o foco do campo
            onClick={(event) => onChoose(option, event.currentTarget)}
          >
            <OptionContent option={option} />
          </div>
        </li>
      ))}
      {footer}
    </ul>
  )
}

interface SearchBarProps {
  value: string
  onSubmit: (query: string) => void
  onSelectPerson: (person: PersonSuggestion) => void
}

export function SearchBar({ value, onSubmit, onSelectPerson }: SearchBarProps) {
  const navigate = useNavigate()
  const spread = useSpread()
  const listId = useId()
  const wrapperRef = useRef<HTMLFormElement>(null)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const term = useDebouncedValue(text.trim(), 250)
  const enabled = open && term.length >= 2
  const { options, movies } = useSuggestions(term, enabled)
  const showDropdown = enabled && (options.length > 0 || movies.isFetched)

  // se a busca mudar por fora (ex.: "limpar tudo"), atualiza o campo
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setText(value)
  }

  // fecha a lista ao clicar fora
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const choose = (option: Option, element?: HTMLElement | null) => {
    setOpen(false)
    setActive(-1)
    if (option.kind === 'movie') {
      if (spread) spread.open(option.movie, element?.querySelector('[data-spread]'))
      else navigate(`/filmes/${option.movie.id}`)
    } else {
      setText('')
      onSelectPerson(option.person)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (active >= 0 && options[active]) {
      choose(options[active], document.getElementById(`${listId}-${active}`))
      return
    }
    setOpen(false)
    onSubmit(text.trim())
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault()
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <form ref={wrapperRef} className="search" role="search" onSubmit={submit}>
      <div className="search__box">
        <Search size={16} className="search__icon" aria-hidden />
        <input
          className="search__input"
          type="search"
          role="combobox"
          aria-label="Buscar filmes por título ou pessoas"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Título, diretor, elenco..."
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          enterKeyHint="search"
        />
        {text && (
          <button
            type="button"
            className="search__clear"
            aria-label="Limpar busca"
            onClick={() => {
              setText('')
              if (value) onSubmit('')
            }}
          >
            <X size={14} />
          </button>
        )}
        <button type="submit" className="search__submit" aria-label="Buscar">
          <ArrowRight size={15} />
        </button>
      </div>
      <p className="search__hint">
        Vários filmes de uma vez: separe por vírgula (<em>matrix, toy story</em>).
      </p>

      {showDropdown && (
        <SuggestionList
          id={listId}
          className="suggest search__dropdown"
          options={options}
          active={active}
          emptyText={`Nenhum resultado para “${term}”.`}
          onHover={setActive}
          onChoose={choose}
          footer={
            movies.data && movies.data.total > movies.data.items.length ? (
              <li className="suggest__footer" role="presentation">
                Enter para ver todos os {formatInteger(movies.data.total)} resultados
              </li>
            ) : null
          }
        />
      )}
    </form>
  )
}

interface SearchPaletteProps {
  open: boolean
  onClose: () => void
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const navigate = useNavigate()
  const spread = useSpread()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const term = useDebouncedValue(text.trim(), 200)
  const searching = term.length >= 2
  const featured = useFeatured(open)
  const { options, movies } = useSuggestions(term, open && searching)
  const list: Option[] = searching
    ? options
    : (featured.data?.items ?? []).slice(0, 6).map((movie) => ({ kind: 'movie' as const, movie }))

  // começa vazio toda vez que abre
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setText('')
      setActive(0)
    }
  }

  // o <dialog> nativo prende o foco e fecha com Esc
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || typeof dialog.showModal !== 'function') return
    if (open && !dialog.open) {
      dialog.showModal()
      inputRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const choose = (option: Option, element?: HTMLElement | null) => {
    if (option.kind === 'movie') {
      // mede o pôster antes de fechar: a cor sai de onde ele estava
      if (spread) spread.open(option.movie, element?.querySelector('[data-spread]'))
      else navigate(`/filmes/${option.movie.id}`)
      onClose()
    } else {
      onClose()
      navigate(`/?pessoa=${option.person.id}`)
    }
  }

  const searchAll = () => {
    const query = text.trim()
    onClose()
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = list.length
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault()
      setActive((index) => (index + 1) % count)
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault()
      setActive((index) => (index - 1 + count) % count)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = list[active]
      if (option && !(event.ctrlKey || event.metaKey)) {
        choose(option, document.getElementById(`${listId}-${active}`))
      } else {
        searchAll()
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Busca rápida"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose() // clique fora do painel
      }}
    >
      {open && (
        <div className="palette__panel">
          <div className="palette__field">
            <Search size={18} aria-hidden />
            <input
              ref={inputRef}
              className="palette__input"
              role="combobox"
              aria-label="Buscar filmes e pessoas"
              aria-expanded={list.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={list.length ? `${listId}-${active}` : undefined}
              placeholder="Buscar filmes, diretores, elenco..."
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              autoComplete="off"
            />
            <kbd>Esc</kbd>
          </div>
          <SuggestionList
            id={listId}
            className="suggest palette__list"
            options={list}
            active={active}
            moviesLabel={searching ? 'Filmes' : 'Em alta agora'}
            emptyText={
              searching && movies.isFetched ? `Nenhum resultado para “${term}”.` : undefined
            }
            onHover={setActive}
            onChoose={choose}
          />
          <footer className="palette__footer">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navegar
            </span>
            <span>
              <kbd>
                <CornerDownLeft size={11} />
              </kbd>{' '}
              abrir
            </span>
            {searching && (
              <button type="button" className="palette__all" onClick={searchAll}>
                Ver todos os resultados
                {movies.data ? ` (${formatInteger(movies.data.total)})` : ''}
                <ArrowRight size={14} />
              </button>
            )}
          </footer>
        </div>
      )}
    </dialog>
  )
}
