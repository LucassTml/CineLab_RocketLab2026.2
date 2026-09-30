// Vitrine do topo do catálogo:
// - FeaturedCarousel: os filmes mais populares que têm imagem de fundo. Trocam
//   sozinhos (a barrinha de cada item da lista "Em alta" marca o tempo), param
//   com o mouse em cima, e a cor do fundo do site acompanha o filme da vez.
// - GenreStrip: atalhos por gênero, com ícone e quantidade de filmes.
// - SplitTitle: título com as palavras subindo uma de cada vez.

import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react'

import { movieTint, useMovieTint } from '../color'
import { genreIcon, genreLabel } from '../genres'
import { prefersReducedMotion, revealRef, useScrollProgress, useScroller } from '../motion'
import type { GenreWithCount, MovieSummary } from '../types'
import { formatInteger, formatRuntime, formatStars, pad2, resizeTmdbImage, toStars } from '../utils'
import { useAmbient } from './Ambient'
import { Poster, ScrollButtons } from './MovieCard'
import { MovieLink } from './Spread'
import { StarRating } from './Stars'

const SLIDE_MS = 8000

// As palavras ficam dentro de uma "janela" (overflow hidden) e sobem de baixo.
// O texto inteiro vai num span só para leitores de tela.
export function SplitTitle({ text, delay = 0 }: { text: string; delay?: number }) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="split" aria-hidden>
        {words.map((word, index) => (
          <span key={index}>
            <span className="split__word">
              <span style={{ '--d': `${delay + index * 70}ms` } as CSSProperties}>{word}</span>
            </span>
            {index < words.length - 1 && ' '}
          </span>
        ))}
      </span>
    </>
  )
}

export function FeaturedCarousel({ movies }: { movies: MovieSummary[] }) {
  const slides = movies.filter((movie) => movie.url_backdrop).slice(0, 5)
  const [index, setIndex] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [offscreen, setOffscreen] = useState(false)
  const heroRef = useRef<HTMLElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  useScrollProgress(heroRef)

  const current = slides[Math.min(index, slides.length - 1)]
  const tint = useMovieTint(current)
  useAmbient(
    current ? tint : null,
    current ? resizeTmdbImage(current.url_backdrop, 'w300') : null,
    'soft',
  )

  // já calcula a cor de todos os destaques (a troca de cor sai na hora)
  const ids = slides.map((movie) => movie.id).join()
  useEffect(() => {
    slides.forEach((movie) => void movieTint(movie))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  // fora da tela o carrossel para de trocar (e o fundo do site não muda)
  useEffect(() => {
    const element = heroRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry?.isIntersecting), {
      threshold: 0.25,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!current) return null

  const go = (next: number) => setIndex((next + slides.length) % slides.length)
  const backdrop = resizeTmdbImage(current.url_backdrop, 'w1280')
  const genres = current.generos.slice(0, 3).map(genreLabel).join(', ')
  const meta = [current.ano_lancamento, formatRuntime(current.duracao_minutos), genres].filter(Boolean)

  // setas no teclado dentro da lista trocam o destaque
  const onListKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const steps: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    const next = (index + step + slides.length) % slides.length
    go(next)
    listRef.current?.querySelectorAll('button')[next]?.focus()
  }

  return (
    <section
      ref={heroRef}
      className="featured"
      data-paused={hovering || offscreen || undefined}
      aria-roledescription="carrossel"
      aria-label="Filmes em destaque"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <div className="featured__media" ref={mediaRef}>
        {slides.map((movie, position) => {
          const url = resizeTmdbImage(movie.url_backdrop, 'w1280')
          return (
            url && (
              <img
                key={movie.id}
                className={`featured__image ${position === index ? 'is-current' : ''}`}
                src={url}
                alt=""
                decoding="async"
                loading={position === 0 ? 'eager' : 'lazy'}
              />
            )
          )
        })}
        <div className="featured__shade" />
      </div>

      <div className="container featured__inner">
        {/* key: o bloco é recriado a cada troca e as animações de entrada rodam de novo */}
        <div className="featured__content" key={current.id}>
          <p className="eyebrow featured__eyebrow">
            <span>Em destaque</span>
            <span className="featured__counter">
              {pad2(index + 1)} <span>/ {pad2(slides.length)}</span>
            </span>
          </p>
          <h2 className="featured__title">
            <MovieLink movie={current} image={backdrop} spreadFrom={mediaRef}>
              <SplitTitle text={current.titulo} delay={120} />
            </MovieLink>
          </h2>
          {meta.length > 0 && <p className="featured__meta">{meta.join('  ·  ')}</p>}
          {current.diretores[0] && (
            <p className="featured__credit">
              Direção de <strong>{current.diretores[0]}</strong>
            </p>
          )}
          <div className="featured__actions">
            <MovieLink
              movie={current}
              image={backdrop}
              spreadFrom={mediaRef}
              className="btn btn--light"
            >
              Ver filme <ArrowRight size={16} />
            </MovieLink>
            {current.nota_media != null && (
              <span className="featured__rating">
                <StarRating value={toStars(current.nota_media)} size={14} />
                <span>
                  {formatStars(current.nota_media)} · {formatInteger(current.total_avaliacoes)}{' '}
                  {current.total_avaliacoes === 1 ? 'avaliação' : 'avaliações'}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="featured__side">
          <p className="featured__side-title">Em alta agora</p>
          <ol
            className="featured__list"
            ref={listRef}
            aria-label="Escolher destaque"
            onKeyDown={onListKeyDown}
          >
            {slides.map((movie, position) => (
              <li key={movie.id}>
                <button
                  type="button"
                  className={`featured__item ${position === index ? 'is-current' : ''}`}
                  aria-current={position === index || undefined}
                  onClick={() => go(position)}
                >
                  <span className="featured__num">{pad2(position + 1)}</span>
                  <Poster src={movie.url_poster} title={movie.titulo} size="w92" className="featured__thumb" />
                  <span className="featured__item-text">
                    <span className="featured__item-title">{movie.titulo}</span>
                    <span className="featured__item-sub">
                      {movie.ano_lancamento ?? '-'}
                      {movie.generos[0] && ` · ${genreLabel(movie.generos[0])}`}
                    </span>
                  </span>
                  {/* a barra do item atual enche em SLIDE_MS; quando termina, troca.
                      Com movimento reduzido não troca sozinho. */}
                  <span className="featured__progress" aria-hidden>
                    {position === index && !prefersReducedMotion() && (
                      <span
                        key={index}
                        style={{ animationDuration: `${SLIDE_MS}ms` }}
                        onAnimationEnd={() => go(index + 1)}
                      />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <a href="#catalogo" className="featured__scroll">
        <span>Catálogo</span>
        <span className="featured__scroll-line" aria-hidden />
      </a>
    </section>
  )
}

export function GenreStrip({
  genres,
  onSelect,
}: {
  genres: GenreWithCount[]
  onSelect: (genreId: string) => void
}) {
  const { ref, canPrev, canNext, scrollBy } = useScroller<HTMLDivElement>()
  const sorted = genres
    .filter((genre) => genre.total_filmes > 0)
    .sort((a, b) => b.total_filmes - a.total_filmes)

  return (
    <section className="container genres" aria-labelledby="genres-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Explorar</p>
          <h2 className="section-title" id="genres-title">
            Por gênero
          </h2>
        </div>
        <ScrollButtons canPrev={canPrev} canNext={canNext} onScroll={scrollBy} />
      </div>
      <div className="genres__track" ref={ref}>
        {sorted.map((genre, index) => {
          const Icon = genreIcon(genre.nome)
          return (
            <button
              key={genre.id}
              type="button"
              className="genre-tile"
              data-reveal=""
              ref={revealRef}
              style={{ '--i': index % 8 } as CSSProperties}
              onClick={() => onSelect(genre.id)}
            >
              <span className="genre-tile__top">
                <Icon size={20} strokeWidth={1.5} className="genre-tile__icon" aria-hidden />
                <ArrowUpRight size={15} className="genre-tile__arrow" aria-hidden />
              </span>
              <span className="genre-tile__name">{genreLabel(genre.nome)}</span>
              <span className="genre-tile__count">{formatInteger(genre.total_filmes)} filmes</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
