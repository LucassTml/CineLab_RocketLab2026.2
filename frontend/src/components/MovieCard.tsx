// Pôster, card de filme, grade do catálogo e fileira com rolagem lateral.

import { ChevronLeft, ChevronRight, Film, Star } from 'lucide-react'
import { type CSSProperties, useCallback, useState } from 'react'

import { genreLabel } from '../genres'
import { revealRef, useScroller } from '../motion'
import type { MovieSummary } from '../types'
import { formatInteger, formatRuntime, formatStars, resizeTmdbImage } from '../utils'
import { MovieLink } from './Spread'

interface PosterProps {
  src: string | null | undefined
  title: string
  size?: 'w92' | 'w185' | 'w342' | 'w500'
  className?: string
  eager?: boolean
}

// Alguns filmes não têm pôster (ou o link quebrou): aí mostra um cartão com o
// título. A imagem entra desfocada e "foca" quando termina de carregar.
export function Poster({ src, title, size = 'w342', className = '', eager = false }: PosterProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const url = resizeTmdbImage(src, size)

  // imagem que já estava em cache pode terminar antes do onLoad ser ligado
  const checkCached = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setLoaded(true)
  }, [])

  if (!url || failed) {
    return (
      <div className={`poster poster--fallback ${className}`} role="img" aria-label={title}>
        <Film size={24} strokeWidth={1.5} aria-hidden />
        <span>{title}</span>
      </div>
    )
  }
  return (
    <div className={`poster ${loaded ? 'is-loaded' : ''} ${className}`}>
      <img
        ref={checkCached}
        src={url}
        alt={`Pôster de ${title}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

// index: posição na grade (atraso da entrada em cascata e lado da inclinação).
// No hover o card sobe e gira um pouco, deixando um contorno tracejado no lugar.
export function MovieCard({ movie, index = 0 }: { movie: MovieSummary; index?: number }) {
  const rated = movie.nota_media != null
  const genre = movie.generos[0]
  return (
    <MovieLink
      movie={movie}
      className="movie-card"
      data-reveal=""
      ref={revealRef}
      style={{ '--i': index % 6, '--tilt': index % 2 ? '1.8deg' : '-2.2deg' } as CSSProperties}
    >
      <span className="movie-card__ghost" aria-hidden />
      <div className="movie-card__body">
        <div className="movie-card__poster" data-spread>
          <Poster src={movie.url_poster} title={movie.titulo} size="w342" />
          {movie.status_filme && movie.status_filme !== 'Lançado' && (
            <span className="movie-card__badge">{movie.status_filme}</span>
          )}
        </div>
        <h3 className="movie-card__title">{movie.titulo}</h3>
        <p className="movie-card__meta">
          {movie.ano_lancamento ?? '-'}
          {movie.diretores.length > 0 && <> · {movie.diretores[0]}</>}
          {!rated && <span className="movie-card__unrated"> · sem notas</span>}
        </p>
        <div className="movie-card__foot">
          {/* alguns filmes vieram sem gênero nos CSVs: aí mostra a duração */}
          <span className="movie-card__genre">
            {genre ? genreLabel(genre) : formatRuntime(movie.duracao_minutos)}
          </span>
          {rated && (
            <span
              className="movie-card__score"
              title={`${formatInteger(movie.total_avaliacoes)} avaliação(ões)`}
            >
              <Star size={11} fill="currentColor" strokeWidth={0} aria-hidden />
              {formatStars(movie.nota_media)}
            </span>
          )}
        </div>
      </div>
    </MovieLink>
  )
}

export function MovieGrid({ movies }: { movies: MovieSummary[] }) {
  return (
    <div className="movie-grid">
      {movies.map((movie, index) => (
        <MovieCard key={movie.id} movie={movie} index={index} />
      ))}
    </div>
  )
}

export function MovieGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="movie-grid" role="status" aria-label="Carregando filmes">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="movie-card movie-card--skeleton" aria-hidden>
          <div className="movie-card__body">
            <div className="poster skeleton" />
            <div className="skeleton skeleton--text" style={{ width: '85%' }} />
            <div className="skeleton skeleton--text" style={{ width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface ScrollButtonsProps {
  canPrev: boolean
  canNext: boolean
  onScroll: (direction: 1 | -1) => void
}

export function ScrollButtons({ canPrev, canNext, onScroll }: ScrollButtonsProps) {
  return (
    <div className="scroll-buttons">
      <button
        type="button"
        className="icon-btn icon-btn--line"
        onClick={() => onScroll(-1)}
        disabled={!canPrev}
        aria-label="Voltar"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--line"
        onClick={() => onScroll(1)}
        disabled={!canNext}
        aria-label="Avançar"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

interface MovieRowProps {
  id?: string
  eyebrow?: string
  title: string
  movies: MovieSummary[]
}

// Fileira de cards com setas (filmes semelhantes).
export function MovieRow({ id, eyebrow, title, movies }: MovieRowProps) {
  const { ref, canPrev, canNext, scrollBy } = useScroller<HTMLDivElement>()
  return (
    <section className="movie-row" id={id} aria-label={title}>
      <div className="section-head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="section-title">{title}</h2>
        </div>
        <ScrollButtons canPrev={canPrev} canNext={canNext} onScroll={scrollBy} />
      </div>
      <div className="movie-row__track" ref={ref}>
        {movies.map((movie, index) => (
          <MovieCard key={movie.id} movie={movie} index={index} />
        ))}
      </div>
    </section>
  )
}
