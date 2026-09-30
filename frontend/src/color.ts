// Cor predominante do pôster de um filme.
// É essa cor que "se espalha" pela tela quando um filme é aberto e que tinge o
// fundo da página dele.
//
// Como funciona: a imagem é desenhada bem pequena (24 x 36 pixels) num
// <canvas>. Cada pixel entra numa de 12 faixas de matiz (vermelho, laranja,
// amarelo...) com um peso: cor viva e luminosidade média pesam mais, e quase
// preto, quase branco ou cinza não contam. A faixa mais pesada vence, e a cor
// final é a média dela, ajustada para funcionar como fundo escuro.
// O canvas só pode ler pixels de imagens liberadas por CORS. O TMDB libera,
// mas só quando o pedido já vem em modo CORS (veja readPixels). Imagem de
// outro site (URL digitada no cadastro) não é lida: a cor sai do título.

import { useEffect, useState } from 'react'

import { resizeTmdbImage } from './utils'

export interface TintSource {
  titulo: string
  url_poster: string | null
}

// pôster preto e branco: um cinza quente em vez de uma cor inventada
const NEUTRAL = '#5c5851'
const SAMPLE_W = 24
const SAMPLE_H = 36

const pending = new Map<string, Promise<string | null>>()
const resolved = new Map<string, string | null>()

export function canReadPixels(url: string): boolean {
  try {
    return new URL(url, window.location.href).hostname === 'image.tmdb.org'
  } catch {
    return false
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const light = (max + min) / 2
  if (max === min) return [0, 0, light]
  const delta = max - min
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue: number
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4
  return [hue * 60, sat, light]
}

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// Recebe os pixels no formato do canvas (R, G, B, A, R, G, B, A...) e devolve
// a cor em hex, ou null se a imagem praticamente não tiver cor.
export function dominantColor(pixels: ArrayLike<number>): string | null {
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, h: 0, s: 0, l: 0 }))
  let counted = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue // pixel transparente
    counted += 1
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2])
    if (l < 0.08 || l > 0.93 || s < 0.16) continue
    const weight = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.5)
    const bucket = buckets[Math.floor(h / 30) % 12]
    bucket.weight += weight
    bucket.h += h * weight
    bucket.s += s * weight
    bucket.l += l * weight
  }
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a))
  if (!counted || best.weight < counted * 0.015) return null
  return hslToHex(
    best.h / best.weight,
    clamp(best.s / best.weight, 0.3, 0.7),
    clamp(best.l / best.weight, 0.36, 0.52),
  )
}

// Cor "estável" a partir de um texto (filme sem pôster ou pôster de outro site).
export function hashColor(text: string): string {
  let hash = 7
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return hslToHex(hash % 360, 0.34, 0.42)
}

// Texto em cima da cor do filme: preto ou branco, o que tiver mais contraste.
export function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.2 ? '#141414' : '#f7f5f0'
}

// Baixa a imagem com fetch e desenha pequena num canvas.
// Por que fetch com cache 'no-store' e não um <img crossorigin>: o TMDB só
// manda o cabeçalho de CORS quando o pedido vem em modo CORS, e a resposta não
// avisa que depende disso (sem "Vary: Origin"). Se o navegador já tem o pôster
// guardado de um <img> comum, ele reaproveita essa cópia sem CORS e a imagem
// falha. Foi o que apagou todas as capas numa primeira versão; por isso as
// capas da tela são <img> comuns e só esta leitura, que ignora o cache, usa CORS.
async function readPixels(url: string): Promise<Uint8ClampedArray | null> {
  if (!canReadPixels(url) || typeof createImageBitmap !== 'function') return null
  const response = await fetch(url, { mode: 'cors', cache: 'no-store', credentials: 'omit' })
  if (!response.ok) return null
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_W
  canvas.height = SAMPLE_H
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(bitmap, 0, 0, SAMPLE_W, SAMPLE_H)
  bitmap.close()
  return context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data
}

// Cada URL é processada uma vez só (o resultado fica guardado).
export function extractColor(url: string): Promise<string | null> {
  const cached = pending.get(url)
  if (cached) return cached

  const promise = readPixels(url)
    .then((pixels) => (pixels ? (dominantColor(pixels) ?? NEUTRAL) : null))
    .catch(() => null) // sem rede ou imagem inválida: fica a cor do título
    .then((color) => {
      resolved.set(url, color)
      return color
    })

  pending.set(url, promise)
  return promise
}

// A cor sai sempre do pôster pequeno (w92): carrega rápido e é a mesma URL em
// qualquer lugar do site, então o card e a página do filme dão a mesma cor.
const tintUrl = (movie: TintSource) => resizeTmdbImage(movie.url_poster, 'w92')

export async function movieTint(movie: TintSource): Promise<string> {
  const url = tintUrl(movie)
  return (url ? await extractColor(url) : null) ?? hashColor(movie.titulo)
}

// Igual ao movieTint, mas só devolve se a cor já estiver calculada.
export function peekTint(movie: TintSource): string | undefined {
  const url = tintUrl(movie)
  if (!url) return hashColor(movie.titulo)
  if (!resolved.has(url)) return undefined
  return resolved.get(url) ?? hashColor(movie.titulo)
}

// Hook: undefined enquanto a cor está sendo calculada.
export function useMovieTint(movie: TintSource | null | undefined): string | undefined {
  const key = movie ? `${movie.url_poster ?? ''}|${movie.titulo}` : ''
  const [state, setState] = useState(() => ({ key, color: movie ? peekTint(movie) : undefined }))
  if (state.key !== key) setState({ key, color: movie ? peekTint(movie) : undefined })

  useEffect(() => {
    if (!movie) return
    let active = true
    void movieTint(movie).then((color) => {
      if (active) setState((current) => (current.key === key ? { key, color } : current))
    })
    return () => {
      active = false
    }
    // a chave (pôster + título) já representa o filme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state.key === key ? state.color : undefined
}
