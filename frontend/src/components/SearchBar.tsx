import { useQuery } from '@tanstack/react-query'
import { Search, User, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { api } from '../api'
import { useDebouncedValue } from '../hooks'
import type { MovieSummary, PersonSuggestion } from '../types'
import { formatInteger } from '../utils'
import { Poster } from './MovieCard'

interface SearchBarProps {
  value: string
  onSubmit: (query: string) => void
  onSelectPerson: (person: PersonSuggestion) => void
}

type Option =
  | { kind: 'movie'; movie: MovieSummary }
  | { kind: 'person'; person: PersonSuggestion }

const PERSON_ROLE: Record<string, string> = { Ator: 'Elenco', Diretor: 'Direção', Roteirista: 'Roteiro' }

// Barra de busca com sugestões de filmes e pessoas enquanto digita.
// Enter busca no catálogo todo; setas + Enter abrem uma sugestão.
// Espera 250 ms sem digitar antes de consultar a API (debounce).
export function SearchBar({ value, onSubmit, onSelectPerson }: SearchBarProps) {
  const navigate = useNavigate()
  const listId = useId()
  const wrapperRef = useRef<HTMLFormElement>(null)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const term = useDebouncedValue(text.trim(), 250)
  const enabled = open && term.length >= 2

  // se a busca mudar por fora (ex.: botão "limpar tudo"), atualiza o campo
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setText(value)
  }

  const movies = useQuery({
    queryKey: ['suggest', 'movies', term],
    queryFn: ({ signal }) =>
      api.listMovies({ q: term, sort: 'relevancia', page_size: 6 }, signal),
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
  const showDropdown = enabled && (options.length > 0 || movies.isFetched)

  // fecha a lista ao clicar fora
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const choose = (option: Option) => {
    setOpen(false)
    setActive(-1)
    if (option.kind === 'movie') navigate(`/filmes/${option.movie.id}`)
    else {
      setText('')
      onSelectPerson(option.person)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (active >= 0 && options[active]) return choose(options[active])
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

  const optionId = (index: number) => `${listId}-option-${index}`
  const firstPerson = options.findIndex((option) => option.kind === 'person')

  return (
    <form ref={wrapperRef} className="search" role="search" onSubmit={submit}>
      <Search size={20} className="search__icon" aria-hidden />
      <input
        className="search__input"
        type="search"
        role="combobox"
        aria-label="Buscar filmes por título ou pessoas"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        placeholder="Buscar filmes... (separe por vírgula para buscar vários)"
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
          className="icon-btn search__clear"
          aria-label="Limpar busca"
          onClick={() => {
            setText('')
            if (value) onSubmit('')
          }}
        >
          <X size={18} />
        </button>
      )}

      {showDropdown && (
        <ul id={listId} className="search__dropdown" role="listbox" aria-label="Sugestões">
          {options.length === 0 && (
            <li className="search__footer" role="presentation">
              Nenhum resultado para “{term}”.
            </li>
          )}
          {options.map((option, index) => (
            <li key={option.kind + (option.kind === 'movie' ? option.movie.id : option.person.id)} role="presentation">
              {index === 0 && option.kind === 'movie' && (
                <div className="search__group" role="presentation">
                  Filmes
                </div>
              )}
              {index === firstPerson && (
                <div className="search__group" role="presentation">
                  Pessoas
                </div>
              )}
              <div
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className="search__option"
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()} // não tira o foco do input
                onClick={() => choose(option)}
              >
                {option.kind === 'movie' ? (
                  <>
                    <Poster
                      src={option.movie.url_poster}
                      title={option.movie.titulo}
                      size="w92"
                      className="search__thumb"
                    />
                    <span className="search__option-text">
                      <span className="search__option-title">{option.movie.titulo}</span>
                      <span className="search__option-sub">
                        {option.movie.ano_lancamento}
                        {option.movie.diretores.length > 0 && ` · ${option.movie.diretores[0]}`}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="search__avatar">
                      <User size={16} />
                    </span>
                    <span className="search__option-text">
                      <span className="search__option-title">{option.person.nome}</span>
                      <span className="search__option-sub">
                        {PERSON_ROLE[option.person.tipo]} ·{' '}
                        {formatInteger(option.person.total_filmes)} filme(s) - filtrar catálogo
                      </span>
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
          {movies.data && movies.data.total > movies.data.items.length && (
            <li className="search__footer" role="presentation">
              Enter para ver todos os {formatInteger(movies.data.total)} resultados
            </li>
          )}
        </ul>
      )}
    </form>
  )
}
