import { describe, expect, it } from 'vitest'

import { countActiveFilters, parseCatalogParams, serializeCatalogParams } from '../hooks'
import {
  formatDate,
  formatRelative,
  formatRuntime,
  formatStars,
  getPageItems,
  resizeTmdbImage,
  starsToNota,
  toStars,
} from '../utils'
import { EMPTY_MOVIE_FORM, formValuesToPayload, movieSchema } from '../validation'

describe('conversão de notas', () => {
  it('converte a escala 0-10 da API em estrelas e vice-versa', () => {
    expect(toStars(7.3)).toBe(3.65)
    expect(toStars(null)).toBeNull()
    expect(starsToNota(4.5)).toBe(9)
    expect(starsToNota(0.5)).toBe(1)
    expect(formatStars(7.3)).toBe('3,7')
  })
})

describe('formatação', () => {
  it('formata duração em horas e minutos', () => {
    expect(formatRuntime(137)).toBe('2h 17min')
    expect(formatRuntime(45)).toBe('45min')
    expect(formatRuntime(120)).toBe('2h')
    expect(formatRuntime(null)).toBeNull()
  })

  it('formata datas civis sem deslocar o dia pelo fuso horário', () => {
    expect(formatDate('2024-11-07')).toBe('7 de novembro de 2024')
    expect(formatDate(null)).toBeNull()
  })

  it('descreve tempo relativo', () => {
    const now = new Date('2026-09-26T12:00:00Z')
    expect(formatRelative('2026-09-23T12:00:00Z', now)).toBe('há 3 dias')
    expect(formatRelative('2026-09-26T11:59:50Z', now)).toBe('agora')
  })

  it('pede pôsteres menores ao CDN do TMDB', () => {
    expect(resizeTmdbImage('https://image.tmdb.org/t/p/w500/abc.jpg', 'w185')).toBe(
      'https://image.tmdb.org/t/p/w185/abc.jpg',
    )
    expect(resizeTmdbImage(null, 'w185')).toBeNull()
  })
})

describe('getPageItems', () => {
  it('mostra todas as páginas quando cabem', () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('usa reticências longe das pontas', () => {
    expect(getPageItems(50, 3986)).toEqual([1, 'ellipsis-start', 49, 50, 51, 'ellipsis-end', 3986])
  })

  it('mantém a largura perto do início e do fim', () => {
    expect(getPageItems(2, 100)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 100])
    expect(getPageItems(99, 100)).toEqual([1, 'ellipsis-start', 96, 97, 98, 99, 100])
  })
})

describe('parâmetros do catálogo na URL', () => {
  it('lê filtros válidos da query string', () => {
    const filters = parseCatalogParams(
      new URLSearchParams('q=matrix&genero=a&genero=b&ano_min=2018&sort=nota&order=asc&page=3'),
    )
    expect(filters).toMatchObject({
      q: 'matrix',
      genero: ['a', 'b'],
      ano_min: 2018,
      sort: 'nota',
      order: 'asc',
      page: 3,
      page_size: 24,
    })
  })

  it('ignora valores inválidos editados à mão na URL', () => {
    const filters = parseCatalogParams(
      new URLSearchParams('page=-4&page_size=9999&sort=hack&order=x&ano_min=abc&status=Cancelado'),
    )
    expect(filters.page).toBe(1)
    expect(filters.page_size).toBe(24)
    expect(filters.sort).toBeUndefined()
    expect(filters.order).toBeUndefined()
    expect(filters.ano_min).toBeUndefined()
    expect(filters.status).toBeUndefined()
  })

  it('omite valores padrão ao serializar (URLs curtas)', () => {
    const search = serializeCatalogParams({ q: 'toy', page: 1, page_size: 24, genero: ['x'] })
    expect(search.toString()).toBe('q=toy&genero=x')
  })

  it('ida e volta preserva os filtros', () => {
    const original = { q: 'a, b', genero: ['g1', 'g2'], nota_min: 7, page: 2, page_size: 48 }
    const roundTrip = parseCatalogParams(serializeCatalogParams(original))
    expect(roundTrip).toMatchObject(original)
  })

  it('conta filtros ativos', () => {
    expect(countActiveFilters({ genero: ['a', 'b'], ano_min: 2000, q: 'x' })).toBe(3)
    expect(countActiveFilters({})).toBe(0)
  })
})

const valid = { ...EMPTY_MOVIE_FORM, titulo: 'Filme', ano_lancamento: '2024' }

function errorsOf(values: object): Record<string, string> {
  const result = movieSchema.safeParse(values)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('validação do formulário de filme', () => {
  it('aceita o mínimo obrigatório (título e ano)', () => {
    expect(errorsOf(valid)).toEqual({})
  })

  it('exige título e ano com 4 dígitos no intervalo válido', () => {
    expect(errorsOf({ ...valid, titulo: '  ' })).toHaveProperty('titulo')
    expect(errorsOf({ ...valid, ano_lancamento: '24' })).toHaveProperty('ano_lancamento')
    expect(errorsOf({ ...valid, ano_lancamento: '1700' })).toHaveProperty('ano_lancamento')
  })

  it('confere se a data é do mesmo ano de lançamento', () => {
    expect(errorsOf({ ...valid, data_lancamento: '2023-05-01' })).toHaveProperty('data_lancamento')
    expect(errorsOf({ ...valid, data_lancamento: '2024-05-01' })).toEqual({})
  })

  it('valida duração e URLs', () => {
    expect(errorsOf({ ...valid, duracao_minutos: '0' })).toHaveProperty('duracao_minutos')
    expect(errorsOf({ ...valid, url_poster: 'ftp://x' })).toHaveProperty('url_poster')
    expect(errorsOf({ ...valid, url_poster: 'https://x.com/p.jpg' })).toEqual({})
  })
})

describe('conversão para o payload da API', () => {
  it('converte números e troca textos vazios por null', () => {
    const payload = formValuesToPayload({
      ...valid,
      titulo: '  Filme  ',
      duracao_minutos: '120',
      diretores: ['Ana'],
    })
    expect(payload).toMatchObject({
      titulo: 'Filme',
      ano_lancamento: 2024,
      duracao_minutos: 120,
      data_lancamento: null,
      sinopse: null,
      url_poster: null,
      diretores: ['Ana'],
    })
  })
})
