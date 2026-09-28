// Formulário de cadastro/edição de filme.

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Save, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'

import { api, ApiError } from '../api'
import { useDebouncedValue, useGenres } from '../hooks'
import { type MovieDetail, type MoviePayload, type PersonType, STATUS_FILME } from '../types'
import { formatInteger, resizeTmdbImage } from '../utils'
import {
  EMPTY_MOVIE_FORM,
  formValuesToPayload,
  MAX_SYNOPSIS,
  movieSchema,
  type MovieFormValues,
  movieToFormValues,
} from '../validation'
import { Poster } from './MovieCard'

const peopleFetcher = (tipo: PersonType) => (q: string, signal?: AbortSignal) =>
  api.searchPeople(q, tipo, signal)

interface MovieFormProps {
  initial?: MovieDetail
  submitLabel: string
  cancelTo: string
  onSubmit: (payload: MoviePayload) => Promise<void>
}

export function MovieForm({ initial, submitLabel, cancelTo, onSubmit }: MovieFormProps) {
  const genres = useGenres()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<MovieFormValues>({
    resolver: zodResolver(movieSchema),
    defaultValues: initial ? movieToFormValues(initial) : EMPTY_MOVIE_FORM,
  })

  // avisa antes de fechar a aba com alterações não salvas
  useEffect(() => {
    if (!isDirty || isSubmitting) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty, isSubmitting])

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(formValuesToPayload(values))
    } catch (error) {
      // erro de validação da API: mostra no campo certo
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          if (field in EMPTY_MOVIE_FORM) setError(field as keyof MovieFormValues, { message })
          else setError('root', { message })
        }
      } else {
        setError('root', {
          message: error instanceof ApiError ? error.message : 'Não foi possível salvar o filme.',
        })
      }
    }
  })

  // campos usados na pré-visualização
  const [titulo, ano, poster, backdrop, sinopse] = useWatch({
    control,
    name: ['titulo', 'ano_lancamento', 'url_poster', 'url_backdrop', 'sinopse'],
  })
  const fieldError = (name: keyof MovieFormValues) =>
    errors[name]?.message ? <span className="field__error">{errors[name]?.message}</span> : null

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-layout">
        <div>
          {errors.root?.message && (
            <p className="form-error" role="alert" style={{ marginBottom: 16 }}>
              {errors.root.message}
            </p>
          )}

          <section className="card form-section">
            <h2 className="form-section__title">Informações básicas</h2>
            <div className="field">
              <label className="field__label" htmlFor="titulo">
                Título<span className="required">*</span>
              </label>
              <input
                id="titulo"
                className="input"
                aria-invalid={Boolean(errors.titulo)}
                autoFocus={!initial}
                {...register('titulo')}
              />
              {fieldError('titulo')}
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="ano_lancamento">
                  Ano de lançamento<span className="required">*</span>
                </label>
                <input
                  id="ano_lancamento"
                  className="input"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2024"
                  aria-invalid={Boolean(errors.ano_lancamento)}
                  {...register('ano_lancamento')}
                />
                {fieldError('ano_lancamento')}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="data_lancamento">
                  Data de lançamento
                </label>
                <input
                  id="data_lancamento"
                  className="input"
                  type="date"
                  aria-invalid={Boolean(errors.data_lancamento)}
                  {...register('data_lancamento')}
                />
                {fieldError('data_lancamento')}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="duracao_minutos">
                  Duração (min)
                </label>
                <input
                  id="duracao_minutos"
                  className="input"
                  inputMode="numeric"
                  placeholder="120"
                  aria-invalid={Boolean(errors.duracao_minutos)}
                  {...register('duracao_minutos')}
                />
                {fieldError('duracao_minutos')}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="status_filme">
                  Status
                </label>
                <select id="status_filme" className="select" {...register('status_filme')}>
                  {STATUS_FILME.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sinopse">
                Sinopse
              </label>
              <textarea
                id="sinopse"
                className="textarea"
                rows={5}
                maxLength={MAX_SYNOPSIS}
                aria-invalid={Boolean(errors.sinopse)}
                {...register('sinopse')}
              />
              <span className="counter">
                {formatInteger(sinopse?.length ?? 0)}/{formatInteger(MAX_SYNOPSIS)}
              </span>
              {fieldError('sinopse')}
            </div>
          </section>

          <section className="card form-section">
            <h2 className="form-section__title">Gêneros</h2>
            <Controller
              control={control}
              name="genero_ids"
              render={({ field }) => (
                <div className="chip-list" role="group" aria-label="Gêneros">
                  {(genres.data ?? []).map((genre) => {
                    const checked = field.value.includes(genre.id)
                    return (
                      <button
                        key={genre.id}
                        type="button"
                        className={`chip ${checked ? 'chip--active' : ''}`}
                        aria-pressed={checked}
                        onClick={() =>
                          field.onChange(
                            checked
                              ? field.value.filter((value) => value !== genre.id)
                              : [...field.value, genre.id],
                          )
                        }
                      >
                        {genre.nome}
                      </button>
                    )
                  })}
                </div>
              )}
            />
          </section>

          <section className="card form-section">
            <h2 className="form-section__title">Equipe e elenco</h2>
            <Controller
              control={control}
              name="diretores"
              render={({ field }) => (
                <TagInput
                  id="diretores"
                  label="Direção"
                  values={field.value}
                  onChange={field.onChange}
                  sourceKey="Diretor"
                  fetchSuggestions={peopleFetcher('Diretor')}
                  hint="Sugestões mostram pessoas já cadastradas; nomes novos são criados."
                />
              )}
            />
            <Controller
              control={control}
              name="roteiristas"
              render={({ field }) => (
                <TagInput
                  id="roteiristas"
                  label="Roteiro"
                  values={field.value}
                  onChange={field.onChange}
                  sourceKey="Roteirista"
                  fetchSuggestions={peopleFetcher('Roteirista')}
                />
              )}
            />
            <Controller
              control={control}
              name="elenco"
              render={({ field }) => (
                <TagInput
                  id="elenco"
                  label="Elenco"
                  values={field.value}
                  onChange={field.onChange}
                  sourceKey="Ator"
                  fetchSuggestions={peopleFetcher('Ator')}
                />
              )}
            />
            <Controller
              control={control}
              name="produtoras"
              render={({ field }) => (
                <TagInput
                  id="produtoras"
                  label="Produtoras"
                  values={field.value}
                  onChange={field.onChange}
                  sourceKey="produtoras"
                  fetchSuggestions={(q, signal) => api.searchCompanies(q, signal)}
                />
              )}
            />
          </section>

          <section className="card form-section">
            <h2 className="form-section__title">Imagens</h2>
            <div className="field">
              <label className="field__label" htmlFor="url_poster">
                URL do pôster
              </label>
              <input
                id="url_poster"
                className="input"
                type="url"
                placeholder="https://image.tmdb.org/t/p/w500/..."
                aria-invalid={Boolean(errors.url_poster)}
                {...register('url_poster')}
              />
              {fieldError('url_poster')}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="url_backdrop">
                URL da imagem de fundo
              </label>
              <input
                id="url_backdrop"
                className="input"
                type="url"
                placeholder="https://image.tmdb.org/t/p/w1280/..."
                aria-invalid={Boolean(errors.url_backdrop)}
                {...register('url_backdrop')}
              />
              {fieldError('url_backdrop')}
            </div>
          </section>
        </div>

        <aside className="form-preview" aria-label="Pré-visualização">
          <div>
            <p className="field__label" style={{ marginBottom: 8 }}>
              Pré-visualização
            </p>
            {/* key: recria o pôster quando a URL muda (limpa o erro de imagem) */}
            <Poster key={poster} src={poster || null} title={titulo || 'Sem título'} size="w342" />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <strong>{titulo || 'Título do filme'}</strong>
            <span className="subtle">{ano || 'Ano'}</span>
            {backdrop && (
              <div className="form-preview__backdrop">
                <img src={resizeTmdbImage(backdrop, 'w780') ?? backdrop} alt="Imagem de fundo" />
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="form-actions">
        <Link to={cancelTo} className="btn btn--ghost">
          Cancelar
        </Link>
        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          <Save size={16} /> {isSubmitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

interface Suggestion {
  id: string
  nome: string
  total_filmes: number
}

interface TagInputProps {
  id: string
  label: string
  values: string[]
  onChange: (values: string[]) => void
  sourceKey: string
  fetchSuggestions: (query: string, signal?: AbortSignal) => Promise<Suggestion[]>
  placeholder?: string
  hint?: string
}

// Campo de nomes com autocomplete (direção, elenco, produtoras).
// Sugere nomes que já existem para não duplicar pessoas; dá para digitar um
// nome novo e apertar Enter (ou vírgula), e o backend cria a pessoa.
function TagInput({
  id,
  label,
  values,
  onChange,
  sourceKey,
  fetchSuggestions,
  placeholder = 'Digite um nome e pressione Enter',
  hint,
}: TagInputProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const term = useDebouncedValue(text.trim(), 250)

  const suggestions = useQuery({
    queryKey: ['tag-suggest', sourceKey, term],
    queryFn: ({ signal }) => fetchSuggestions(term, signal),
    enabled: open && term.length >= 2,
    staleTime: 5 * 60_000,
  })
  const taken = new Set(values.map((value) => value.toLocaleLowerCase('pt-BR')))
  const options = (suggestions.data ?? []).filter(
    (option) => !taken.has(option.nome.toLocaleLowerCase('pt-BR')),
  )
  const showList = open && term.length >= 2 && options.length > 0

  const add = (name: string) => {
    const clean = name.replace(/\s+/g, ' ').trim()
    if (clean && !taken.has(clean.toLocaleLowerCase('pt-BR'))) onChange([...values, clean])
    setText('')
    setActive(-1)
  }
  const remove = (index: number) => onChange(values.filter((_, i) => i !== index))

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      if (!text.trim() && event.key === 'Enter') return // campo vazio: deixa o Enter enviar o form
      event.preventDefault()
      add(active >= 0 && options[active] ? options[active].nome : text)
    } else if (event.key === 'Backspace' && !text && values.length) {
      remove(values.length - 1)
    } else if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault()
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault()
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="field tag-input">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="tag-input__box" onClick={() => inputRef.current?.focus()}>
        {values.map((value, index) => (
          <span key={value} className="chip">
            {value}
            <button
              type="button"
              className="chip__remove"
              aria-label={`Remover ${value}`}
              onClick={() => remove(index)}
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          className="tag-input__field"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={values.length ? '' : placeholder}
          value={text}
          autoComplete="off"
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // se sair do campo com algo digitado, adiciona (para não perder o nome)
            if (text.trim()) add(text)
            setOpen(false)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && (
        <ul id={listId} className="search__dropdown" role="listbox">
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="search__option"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => add(option.nome)}
            >
              <span className="search__option-text">
                <span className="search__option-title">{option.nome}</span>
                <span className="search__option-sub">
                  {formatInteger(option.total_filmes)} filme(s) no catálogo
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}
