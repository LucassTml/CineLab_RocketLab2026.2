// Comunicação com o backend (FastAPI).
// Em dev o Vite faz proxy de /api para localhost:8000 (ver vite.config.ts).

import type {
  CompanySuggestion,
  GenreWithCount,
  MovieDetail,
  MovieFilters,
  MoviePayload,
  MovieSummary,
  Page,
  PersonSuggestion,
  PersonType,
  Review,
  ReviewPayload,
  ReviewSort,
  StatsOverview,
  TokenResponse,
} from './types'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1'

type QueryValue = string | number | boolean | null | undefined | Array<string | number>
export type QueryParams = Record<string, QueryValue>

// disparado quando a API responde 401 (token expirado); o AuthProvider faz logout
export const UNAUTHORIZED_EVENT = 'cinelab:unauthorized'

let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

// arrays viram parâmetros repetidos (genero=a&genero=b), que é o que o FastAPI espera
export function buildQuery(params: QueryParams = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)))
    else search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

// Transforma o corpo de erro do FastAPI em ApiError. No 422 o detail é uma
// lista com o campo de cada erro; guardo por campo para mostrar no formulário.
export function parseErrorBody(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return new ApiError(status, detail)

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of detail as { loc: (string | number)[]; msg: string }[]) {
      const field = String(issue.loc?.[issue.loc.length - 1] ?? 'geral')
      fieldErrors[field] = issue.msg.replace(/^Value error, /, '')
    }
    return new ApiError(status, Object.values(fieldErrors)[0] ?? 'Dados inválidos.', fieldErrors)
  }

  const messages: Record<number, string> = {
    401: 'Faça login como administrador para continuar.',
    404: 'Não encontrado.',
    500: 'Erro interno no servidor.',
  }
  return new ApiError(status, messages[status] ?? `Erro inesperado (HTTP ${status}).`)
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  params?: QueryParams
  body?: unknown
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, body, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}${buildQuery(params)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(0, 'Não foi possível conectar à API. O backend está rodando?')
  }

  if (response.status === 401 && authToken) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw parseErrorBody(response.status, errorBody)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const id = encodeURIComponent

// uma função por endpoint
export const api = {
  login: (username: string, password: string) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: { username, password } }),

  listMovies: (filters: MovieFilters, signal?: AbortSignal) =>
    request<Page<MovieSummary>>('/movies', { params: filters as QueryParams, signal }),
  getMovie: (movieId: string, signal?: AbortSignal) =>
    request<MovieDetail>(`/movies/${id(movieId)}`, { signal }),
  similarMovies: (movieId: string, signal?: AbortSignal) =>
    request<MovieSummary[]>(`/movies/${id(movieId)}/similar`, { signal }),
  createMovie: (payload: MoviePayload) =>
    request<MovieDetail>('/movies', { method: 'POST', body: payload }),
  updateMovie: (movieId: string, payload: Partial<MoviePayload>) =>
    request<MovieDetail>(`/movies/${id(movieId)}`, { method: 'PATCH', body: payload }),
  deleteMovie: (movieId: string) =>
    request<void>(`/movies/${id(movieId)}`, { method: 'DELETE' }),

  listReviews: (
    movieId: string,
    params: { page: number; page_size: number; sort: ReviewSort },
    signal?: AbortSignal,
  ) => request<Page<Review>>(`/movies/${id(movieId)}/reviews`, { params, signal }),
  addReview: (movieId: string, payload: ReviewPayload) =>
    request<Review>(`/movies/${id(movieId)}/reviews`, { method: 'POST', body: payload }),
  deleteReview: (movieId: string, reviewId: string) =>
    request<void>(`/movies/${id(movieId)}/reviews/${id(reviewId)}`, { method: 'DELETE' }),

  listGenres: () => request<GenreWithCount[]>('/genres'),
  searchPeople: (q: string, tipo?: PersonType, signal?: AbortSignal) =>
    request<PersonSuggestion[]>('/people', { params: { q, tipo, limit: 8 }, signal }),
  getPerson: (personId: string) => request<PersonSuggestion>(`/people/${id(personId)}`),
  searchCompanies: (q: string, signal?: AbortSignal) =>
    request<CompanySuggestion[]>('/companies', { params: { q, limit: 8 }, signal }),
  getCompany: (companyId: string) => request<CompanySuggestion>(`/companies/${id(companyId)}`),

  stats: () => request<StatsOverview>('/stats'),
}
