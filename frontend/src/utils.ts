// Funções de formatação (padrão brasileiro) e outras utilidades.

const LOCALE = 'pt-BR'
const integerFormat = new Intl.NumberFormat(LOCALE)
const decimalFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatInteger(value: number | null | undefined): string {
  return value == null ? '-' : integerFormat.format(value)
}

export function formatDecimal(value: number | null | undefined): string {
  return value == null ? '-' : decimalFormat.format(value)
}

// nota 0-10 da API -> estrelas 0-5
export function toStars(nota: number | null | undefined): number | null {
  return nota == null ? null : nota / 2
}

// estrelas do formulário -> nota enviada para a API
export function starsToNota(stars: number): number {
  return Math.round(stars * 2 * 10) / 10
}

export function formatStars(nota: number | null | undefined): string {
  const stars = toStars(nota)
  return stars == null ? '-' : decimalFormat.format(stars)
}

// 137 -> "2h 17min"
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}min`
  return rest ? `${hours}h ${rest}min` : `${hours}h`
}

// 190000000 -> "US$ 190 mi"
export function formatMoney(value: number | null | undefined, currency: 'USD' | 'BRL'): string {
  if (value == null) return '-'
  const big = Math.abs(value) >= 1_000_000
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    notation: big ? 'compact' : 'standard',
    maximumFractionDigits: big ? 1 : 0,
  }).format(value)
}

// "2024-11-07" é uma data sem hora; uso UTC para o fuso não mudar o dia
export function formatDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

// "há 3 dias", "agora"
export function formatRelative(isoDateTime: string, now: Date = new Date()): string {
  const seconds = (new Date(isoDateTime).getTime() - now.getTime()) / 1000
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit)
  }
  return 'agora'
}

// Os pôsteres vêm do TMDB em w500. Nos cards peço um tamanho menor (w342, w185...).
export function resizeTmdbImage(url: string | null | undefined, size: string): string | null {
  if (!url) return null
  return url.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${size}/`)
}

// "Fernanda Torres" -> "FT" (avatar das avaliações e do elenco)
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}

// 7 -> "07" (contadores do carrossel e das listas numeradas)
export const pad2 = (value: number) => String(value).padStart(2, '0')

export type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

// Números que aparecem na paginação: 1 ... 49 50 51 ... 3986
export function getPageItems(page: number, pages: number, siblings = 1): PageItem[] {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)

  if (pages <= siblings * 2 + 5) return range(1, pages)

  const left = Math.max(page - siblings, 1)
  const right = Math.min(page + siblings, pages)
  const edge = 3 + siblings * 2

  if (left <= 3) return [...range(1, edge), 'ellipsis-end', pages]
  if (right >= pages - 2) return [1, 'ellipsis-start', ...range(pages - edge + 1, pages)]
  return [1, 'ellipsis-start', ...range(left, right), 'ellipsis-end', pages]
}
