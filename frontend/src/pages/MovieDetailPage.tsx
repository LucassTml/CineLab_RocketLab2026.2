import { ArrowLeft, Calendar, Clock, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '../api'
import { useAuth } from '../auth'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../components/Feedback'
import { MovieGrid, Poster } from '../components/MovieCard'
import { RatingSummaryCard, ReviewSection } from '../components/Reviews'
import { useDeleteMovie, useDocumentTitle, useMovie, useSimilarMovies } from '../hooks'
import type { Company, MovieDetail, Performance, Person } from '../types'
import { formatDate, formatInteger, formatMoney, formatRuntime, resizeTmdbImage } from '../utils'

const CAST_PREVIEW = 18

// clicar no nome filtra o catálogo pelos filmes da pessoa
function PeopleChips({ people }: { people: Person[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? people : people.slice(0, CAST_PREVIEW)
  return (
    <div className="people-list">
      {visible.map((person) => (
        <Link key={person.id} to={`/?pessoa=${person.id}`} className="chip" title="Ver filmes">
          {person.nome}
        </Link>
      ))}
      {people.length > CAST_PREVIEW && (
        <button type="button" className="link-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Mostrar menos' : `Mostrar todos (${people.length})`}
        </button>
      )}
    </div>
  )
}

function CompanyChips({ companies }: { companies: Company[] }) {
  return (
    <div className="people-list">
      {companies.map((company) => (
        <Link key={company.id} to={`/?produtora=${company.id}`} className="chip">
          {company.nome}
        </Link>
      ))}
    </div>
  )
}

function PerformanceSection({ data }: { data: Performance }) {
  const hasMoney = data.orcamento_usd != null || data.receita_usd != null
  if (!hasMoney && data.popularidade == null) return null
  const profitClass = (value: number | null) =>
    value == null || value === 0 ? '' : value > 0 ? 'kv__value--positive' : 'kv__value--negative'

  const items: { label: string; value: string; className?: string }[] = [
    ...(hasMoney
      ? [
          { label: 'Orçamento', value: formatMoney(data.orcamento_usd, 'USD') },
          { label: 'Bilheteria', value: formatMoney(data.receita_usd, 'USD') },
          // resultado só quando tem orçamento e receita
          ...(data.orcamento_usd != null && data.receita_usd != null
            ? [
                {
                  label: 'Resultado',
                  value: formatMoney(data.lucro_usd, 'USD'),
                  className: profitClass(data.lucro_usd),
                },
                {
                  label: 'Resultado (R$)',
                  value: formatMoney(data.lucro_brl, 'BRL'),
                  className: profitClass(data.lucro_brl),
                },
              ]
            : []),
        ]
      : []),
    ...(data.popularidade != null
      ? [{ label: 'Popularidade TMDB', value: formatInteger(Math.round(data.popularidade)) }]
      : []),
  ]

  return (
    <section className="section">
      <h2 className="section__title">Desempenho</h2>
      <div className="kv-grid">
        {items.map((item) => (
          <div key={item.label} className="kv">
            <div className="kv__label">{item.label}</div>
            <div className={`kv__value ${item.className ?? ''}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SimilarMovies({ movieId }: { movieId: string }) {
  const similar = useSimilarMovies(movieId)
  if (!similar.data?.length) return null
  return (
    <section className="section" style={{ marginTop: 40 }}>
      <h2 className="section__title">Filmes semelhantes</h2>
      <MovieGrid movies={similar.data} />
    </section>
  )
}

function MovieInfo({ movie }: { movie: MovieDetail }) {
  const runtime = formatRuntime(movie.duracao_minutos)
  const date = formatDate(movie.data_lancamento)
  return (
    <div className="detail__info">
      <div className="stack" style={{ gap: 10 }}>
        <h1 className="detail__title">
          {movie.titulo}{' '}
          {movie.ano_lancamento && <span className="detail__year">({movie.ano_lancamento})</span>}
        </h1>
        <div className="meta-list">
          {date && (
            <span className="meta-list__item">
              <Calendar size={16} /> {date}
            </span>
          )}
          {runtime && (
            <span className="meta-list__item">
              <Clock size={16} /> {runtime}
            </span>
          )}
          {movie.status_filme && <span className="status-badge">{movie.status_filme}</span>}
        </div>
      </div>

      {movie.diretores.length > 0 && (
        <p className="credits">
          Dirigido por{' '}
          {movie.diretores.map((person, index) => (
            <span key={person.id}>
              {index > 0 && (index === movie.diretores.length - 1 ? ' e ' : ', ')}
              <Link to={`/?pessoa=${person.id}`}>{person.nome}</Link>
            </span>
          ))}
        </p>
      )}

      {movie.generos.length > 0 && (
        <div className="chip-list">
          {movie.generos.map((genre) => (
            <Link key={genre.id} to={`/?genero=${genre.id}`} className="chip">
              {genre.nome}
            </Link>
          ))}
        </div>
      )}

      {movie.sinopse ? (
        <p className="synopsis">{movie.sinopse}</p>
      ) : (
        <p className="subtle">Sinopse não informada.</p>
      )}
    </div>
  )
}

export function MovieDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const movie = useMovie(id)
  const deleteMovie = useDeleteMovie()
  const [confirmOpen, setConfirmOpen] = useState(false)
  useDocumentTitle(movie.data?.titulo)

  if (movie.isPending) return <LoadingState label="Carregando filme..." />
  if (movie.isError) {
    if (movie.error instanceof ApiError && movie.error.status === 404) {
      return (
        <div className="container">
          <EmptyState
            title="Filme não encontrado"
            description="Ele pode ter sido removido do catálogo."
            action={
              <Link to="/" className="btn">
                <ArrowLeft size={16} /> Voltar ao catálogo
              </Link>
            }
          />
        </div>
      )
    }
    return (
      <div className="container">
        <ErrorState error={movie.error} onRetry={() => void movie.refetch()} />
      </div>
    )
  }

  const data = movie.data
  const backdrop = resizeTmdbImage(data.url_backdrop, 'w1280')

  const handleDelete = async () => {
    try {
      await deleteMovie.mutateAsync(data.id)
      toast.success(`“${data.titulo}” foi removido do catálogo.`)
      navigate('/', { replace: true })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível remover o filme.')
      setConfirmOpen(false)
    }
  }

  const crew = data.roteiristas
  return (
    <article>
      {backdrop && (
        <div className="detail-hero" aria-hidden>
          <img className="detail-hero__backdrop" src={backdrop} alt="" />
        </div>
      )}
      <div className="container">
        <div className={`detail ${backdrop ? '' : 'detail--no-hero'}`}>
          <aside className="detail__aside">
            <Poster src={data.url_poster} title={data.titulo} size="w500" className="detail__poster" />
            {isAdmin && (
              <div className="detail__admin">
                <Link to={`/filmes/${data.id}/editar`} className="btn btn--sm">
                  <Pencil size={14} /> Editar
                </Link>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 size={14} /> Remover
                </button>
              </div>
            )}
          </aside>

          <MovieInfo movie={data} />

          <div className="detail__main">
            <div className="detail__columns">
              <div>
                {data.elenco.length > 0 && (
                  <section className="section">
                    <h2 className="section__title">Elenco</h2>
                    <PeopleChips people={data.elenco} />
                  </section>
                )}
                {crew.length > 0 && (
                  <section className="section">
                    <h2 className="section__title">Roteiro</h2>
                    <PeopleChips people={crew} />
                  </section>
                )}
                {data.produtoras.length > 0 && (
                  <section className="section">
                    <h2 className="section__title">Produtoras</h2>
                    <CompanyChips companies={data.produtoras} />
                  </section>
                )}
                {data.desempenho && <PerformanceSection data={data.desempenho} />}
                <div className="section">
                  <ReviewSection movieId={data.id} total={data.avaliacoes.total} />
                </div>
              </div>
              <RatingSummaryCard summary={data.avaliacoes} performance={data.desempenho} />
            </div>
            <SimilarMovies movieId={data.id} />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Remover filme?"
        description={
          <>
            <strong>{data.titulo}</strong> e suas {formatInteger(data.avaliacoes.total)} avaliação(ões)
            serão removidos permanentemente.
          </>
        }
        confirmLabel="Remover filme"
        busy={deleteMovie.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </article>
  )
}
