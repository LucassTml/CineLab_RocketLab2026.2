// Hooks da aplicação:
// - consultas e mutações com React Query (cache no navegador)
// - filtros do catálogo guardados na URL
// - debounce e título da aba

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { api } from './api'
import {
  type MovieFilters,
  type MoviePayload,
  type ReviewPayload,
  type ReviewSort,
  STATUS_FILME,
  type SortField,
  type SortOrder,
  type StatusFilme,
} from './types'

// ---------------------------------------------------------------------------
// React Query
// ---------------------------------------------------------------------------

export const queryKeys = {
  movies: (filters: MovieFilters) => ['movies', filters] as const,
  allMovies: ['movies'] as const,
  movie: (id: string) => ['movie', id] as const,
  similar: (id: string) => ['movie', id, 'similar'] as const,
  reviews: (id: string, page: number, sort: ReviewSort) =>
    ['movie', id, 'reviews', page, sort] as const,
  genres: ['genres'] as const,
  years: ['years'] as const,
  featured: ['featured'] as const,
  stats: ['stats'] as const,
  person: (id: string) => ['person', id] as const,
  company: (id: string) => ['company', id] as const,
}

export function useMovies(filters: MovieFilters) {
  return useQuery({
    queryKey: queryKeys.movies(filters),
    queryFn: ({ signal }) => api.listMovies(filters, signal),
    placeholderData: keepPreviousData, // mantém a página anterior enquanto carrega a próxima
  })
}

export function useMovie(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.movie(id ?? ''),
    queryFn: ({ signal }) => api.getMovie(id!, signal),
    enabled: Boolean(id),
  })
}

export function useSimilarMovies(id: string) {
  return useQuery({
    queryKey: queryKeys.similar(id),
    queryFn: ({ signal }) => api.similarMovies(id, signal),
    staleTime: 5 * 60_000,
  })
}

export function useReviews(id: string, page: number, sort: ReviewSort, pageSize = 5) {
  return useQuery({
    queryKey: queryKeys.reviews(id, page, sort),
    queryFn: ({ signal }) => api.listReviews(id, { page, page_size: pageSize, sort }, signal),
    placeholderData: keepPreviousData,
  })
}

export function useGenres() {
  return useQuery({ queryKey: queryKeys.genres, queryFn: api.listGenres, staleTime: 10 * 60_000 })
}

// quantidade de filmes por ano (histograma do filtro de ano)
export function useYears() {
  return useQuery({ queryKey: queryKeys.years, queryFn: api.listYears, staleTime: 10 * 60_000 })
}

// Os mais populares: alimentam o carrossel de destaques, as sugestões da busca
// rápida e o mosaico de pôsteres do login.
export function useFeatured(enabled = true) {
  return useQuery({
    queryKey: queryKeys.featured,
    queryFn: ({ signal }) =>
      api.listMovies({ sort: 'popularidade', order: 'desc', page_size: 24 }, signal),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: api.stats })
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.person(id ?? ''),
    queryFn: () => api.getPerson(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  })
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.company(id ?? ''),
    queryFn: () => api.getCompany(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  })
}

// Depois de salvar algo, invalido as consultas afetadas para o React Query
// buscar de novo (catálogo, dashboard, gêneros...).
function useInvalidateLists() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.allMovies })
    void client.invalidateQueries({ queryKey: queryKeys.stats })
    void client.invalidateQueries({ queryKey: queryKeys.genres })
    void client.invalidateQueries({ queryKey: queryKeys.years })
    void client.invalidateQueries({ queryKey: queryKeys.featured })
  }
}

export function useCreateMovie() {
  const client = useQueryClient()
  const invalidate = useInvalidateLists()
  return useMutation({
    mutationFn: (payload: MoviePayload) => api.createMovie(payload),
    onSuccess: (movie) => {
      client.setQueryData(queryKeys.movie(movie.id), movie)
      invalidate()
    },
  })
}

export function useUpdateMovie(id: string) {
  const client = useQueryClient()
  const invalidate = useInvalidateLists()
  return useMutation({
    mutationFn: (payload: Partial<MoviePayload>) => api.updateMovie(id, payload),
    onSuccess: (movie) => {
      client.setQueryData(queryKeys.movie(id), movie)
      invalidate()
    },
  })
}

export function useDeleteMovie() {
  const client = useQueryClient()
  const invalidate = useInvalidateLists()
  return useMutation({
    mutationFn: (id: string) => api.deleteMovie(id),
    onSuccess: (_data, id) => {
      // refetchType none: a página do filme ainda está aberta e buscaria de novo (404)
      void client.invalidateQueries({ queryKey: queryKeys.movie(id), refetchType: 'none' })
      invalidate()
    },
  })
}

export function useAddReview(movieId: string) {
  const client = useQueryClient()
  const invalidate = useInvalidateLists()
  return useMutation({
    mutationFn: (payload: ReviewPayload) => api.addReview(movieId, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.movie(movieId) }) // média e lista
      invalidate()
    },
  })
}

export function useDeleteReview(movieId: string) {
  const client = useQueryClient()
  const invalidate = useInvalidateLists()
  return useMutation({
    mutationFn: (reviewId: string) => api.deleteReview(movieId, reviewId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.movie(movieId) })
      invalidate()
    },
  })
}

// ---------------------------------------------------------------------------
// Filtros do catálogo na URL (?q=...&genero=...&page=2)
// Assim o botão voltar funciona e dá para compartilhar o link.
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 24
const SORT_FIELDS: SortField[] = ['relevancia', 'popularidade', 'titulo', 'ano', 'nota', 'avaliacoes']

function toNumber(value: string | null, integer = true): number | undefined {
  if (value == null || value === '') return undefined
  const number = Number(value)
  if (integer ? !Number.isInteger(number) : !Number.isFinite(number)) return undefined
  return number
}

// lê a URL ignorando valores inválidos (se alguém editar a URL na mão)
export function parseCatalogParams(search: URLSearchParams): MovieFilters {
  const sort = search.get('sort') as SortField | null
  const order = search.get('order')
  const status = search.get('status') as StatusFilme | null
  const page = toNumber(search.get('page'))
  const pageSize = toNumber(search.get('page_size'))

  return {
    q: search.get('q')?.trim() || undefined,
    genero: search.getAll('genero').filter(Boolean),
    ano_min: toNumber(search.get('ano_min')),
    ano_max: toNumber(search.get('ano_max')),
    nota_min: toNumber(search.get('nota_min'), false),
    status: status && STATUS_FILME.includes(status) ? status : undefined,
    pessoa: search.get('pessoa') || undefined,
    produtora: search.get('produtora') || undefined,
    sort: sort && SORT_FIELDS.includes(sort) ? sort : undefined,
    order: order === 'asc' || order === 'desc' ? (order as SortOrder) : undefined,
    page: page && page > 0 ? page : 1,
    page_size: pageSize && pageSize > 0 && pageSize <= 100 ? pageSize : DEFAULT_PAGE_SIZE,
  }
}

// escreve na URL só o que não for padrão, para o link ficar curto
export function serializeCatalogParams(filters: MovieFilters): URLSearchParams {
  const search = new URLSearchParams()
  const entries: [string, unknown][] = [
    ['q', filters.q],
    ['ano_min', filters.ano_min],
    ['ano_max', filters.ano_max],
    ['nota_min', filters.nota_min],
    ['status', filters.status],
    ['pessoa', filters.pessoa],
    ['produtora', filters.produtora],
    ['sort', filters.sort],
    ['order', filters.order],
    ['page', filters.page && filters.page > 1 ? filters.page : undefined],
    [
      'page_size',
      filters.page_size && filters.page_size !== DEFAULT_PAGE_SIZE ? filters.page_size : undefined,
    ],
  ]
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  filters.genero?.forEach((genreId) => search.append('genero', genreId))
  return search
}

export function countActiveFilters(filters: MovieFilters): number {
  return (
    (filters.genero?.length ?? 0) +
    Number(filters.ano_min != null) +
    Number(filters.ano_max != null) +
    Number(filters.nota_min != null) +
    Number(Boolean(filters.status)) +
    Number(Boolean(filters.pessoa)) +
    Number(Boolean(filters.produtora))
  )
}

export function useCatalogParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseCatalogParams(searchParams), [searchParams])

  const update = useCallback(
    (changes: Partial<MovieFilters>) => {
      const next: MovieFilters = { ...filters, ...changes }
      // mudou filtro/ordem -> volta para a página 1
      if (!('page' in changes)) next.page = 1
      setSearchParams(serializeCatalogParams(next))
    },
    [filters, setSearchParams],
  )

  const reset = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  return { filters, update, reset }
}

// ---------------------------------------------------------------------------
// Outros
// ---------------------------------------------------------------------------

// Só devolve o valor depois de `delay` ms sem mudar (usado na busca).
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} | CineLab` : 'CineLab'
  }, [title])
}
