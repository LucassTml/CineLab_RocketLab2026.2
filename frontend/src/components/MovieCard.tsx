// Pôster, card de filme e a grade do catálogo.

import { Film, Star } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { MovieSummary } from '../types'
import { formatInteger, formatStars, resizeTmdbImage } from '../utils'

interface PosterProps {
  src: string | null | undefined
  title: string
  size?: 'w92' | 'w185' | 'w342' | 'w500'
  className?: string
}

// Alguns filmes não têm pôster (ou o link quebrou): aí mostra um cartão com o título.
export function Poster({ src, title, size = 'w342', className = '' }: PosterProps) {
  const [failed, setFailed] = useState(false)
  const url = resizeTmdbImage(src, size)

  if (!url || failed) {
    return (
      <div className={`poster poster--fallback ${className}`} role="img" aria-label={title}>
        <Film size={28} aria-hidden />
        <span>{title}</span>
      </div>
    )
  }
  return (
    <div className={`poster ${className}`}>
      <img
        src={url}
        alt={`Pôster de ${title}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export function MovieCard({ movie }: { movie: MovieSummary }) {
  const rated = movie.nota_media != null
  return (
    <Link to={`/filmes/${movie.id}`} className="movie-card">
      <div className="movie-card__poster">
        <Poster src={movie.url_poster} title={movie.titulo} size="w342" />
        {rated && (
          <span
            className="movie-card__score"
            title={`${formatInteger(movie.total_avaliacoes)} avaliação(ões)`}
          >
            <Star size={12} fill="currentColor" strokeWidth={0} aria-hidden />
            {formatStars(movie.nota_media)}
          </span>
        )}
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
    </Link>
  )
}

export function MovieGrid({ movies }: { movies: MovieSummary[] }) {
  return (
    <div className="movie-grid">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  )
}

export function MovieGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="movie-grid" role="status" aria-label="Carregando filmes">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="movie-card" aria-hidden>
          <div className="poster skeleton" />
          <div className="skeleton skeleton--text" style={{ width: '85%' }} />
          <div className="skeleton skeleton--text" style={{ width: '50%' }} />
        </div>
      ))}
    </div>
  )
}
