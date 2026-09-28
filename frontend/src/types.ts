// Tipos das respostas da API (espelham os schemas do backend).
// Notas vêm de 0 a 10; no site viram estrelas (nota / 2).

export const STATUS_FILME = ['Lançado', 'Pós-Produção', 'Em Produção', 'Planejado'] as const
export type StatusFilme = (typeof STATUS_FILME)[number]

export type PersonType = 'Ator' | 'Diretor' | 'Roteirista'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Genre {
  id: string
  nome: string
}

export interface GenreWithCount extends Genre {
  total_filmes: number
}

export interface Person {
  id: string
  nome: string
  tipo: PersonType
}

export interface PersonSuggestion extends Person {
  total_filmes: number
}

export interface Company {
  id: string
  nome: string
}

export interface CompanySuggestion extends Company {
  total_filmes: number
}

export interface RatingBucket {
  estrelas: number
  total: number
}

export interface RatingSummary {
  media: number | null
  media_estrelas: number | null
  total: number
  distribuicao: RatingBucket[]
}

export interface Performance {
  orcamento_usd: number | null
  receita_usd: number | null
  lucro_usd: number | null
  orcamento_brl: number | null
  receita_brl: number | null
  lucro_brl: number | null
  popularidade: number | null
  nota_tmdb: number | null
  qtd_tmdb: number | null
  nota_imdb: number | null
  qtd_imdb: number | null
}

export interface MovieSummary {
  id: string
  id_filme: string
  titulo: string
  ano_lancamento: number | null
  duracao_minutos: number | null
  status_filme: string | null
  url_poster: string | null
  generos: string[]
  diretores: string[]
  popularidade: number | null
  nota_media: number | null
  total_avaliacoes: number
}

export interface MovieDetail {
  id: string
  id_filme: string
  titulo: string
  sinopse: string | null
  data_lancamento: string | null
  ano_lancamento: number | null
  duracao_minutos: number | null
  status_filme: StatusFilme | null
  url_poster: string | null
  url_backdrop: string | null
  generos: Genre[]
  diretores: Person[]
  roteiristas: Person[]
  elenco: Person[]
  produtoras: Company[]
  desempenho: Performance | null
  avaliacoes: RatingSummary
}

export interface MoviePayload {
  titulo: string
  ano_lancamento: number
  data_lancamento: string | null
  duracao_minutos: number | null
  status_filme: StatusFilme
  sinopse: string | null
  url_poster: string | null
  url_backdrop: string | null
  genero_ids: string[]
  diretores: string[]
  roteiristas: string[]
  elenco: string[]
  produtoras: string[]
}

export interface Review {
  id: string
  filme_id: string
  nome: string
  nota: number
  comentario: string
  criado_em: string
}

export interface ReviewPayload {
  nome: string
  nota: number
  comentario: string
}

export type ReviewSort = 'recentes' | 'antigas' | 'maior_nota' | 'menor_nota'

export type SortField = 'relevancia' | 'popularidade' | 'titulo' | 'ano' | 'nota' | 'avaliacoes'
export type SortOrder = 'asc' | 'desc'

// filtros do catálogo (mesmos nomes da query string da API)
export interface MovieFilters {
  q?: string
  genero?: string[]
  ano_min?: number
  ano_max?: number
  nota_min?: number
  status?: StatusFilme
  pessoa?: string
  produtora?: string
  sort?: SortField
  order?: SortOrder
  page?: number
  page_size?: number
}

export interface LatestReview {
  id: string
  filme_id: string
  filme_titulo: string
  filme_poster: string | null
  nome: string
  nota: number
  comentario: string
  criado_em: string
}

export interface GenreStat {
  id: string
  nome: string
  total_filmes: number
  total_avaliacoes: number
  media: number | null
}

export interface RankedMovie extends MovieSummary {
  nota_ponderada: number
}

export interface StatsOverview {
  total_filmes: number
  total_avaliacoes: number
  filmes_avaliados: number
  total_pessoas: number
  total_produtoras: number
  media_geral: number | null
  distribuicao: RatingBucket[]
  generos: GenreStat[]
  filmes_por_ano: { ano: number; total_filmes: number }[]
  mais_bem_avaliados: RankedMovie[]
  mais_avaliados: MovieSummary[]
  ultimas_avaliacoes: LatestReview[]
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_at: string
  username: string
}
