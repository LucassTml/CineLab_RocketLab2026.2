import { ArrowLeft, ArrowUpRight, Calendar, Clock, Pencil, Star, Trash2 } from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '../api'
import { useAuth } from '../auth'
import { inkFor, useMovieTint } from '../color'
import { useAmbient } from '../components/Ambient'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../components/Feedback'
import { MovieRow, Poster } from '../components/MovieCard'
import { RatingPanel, ReviewSection } from '../components/Reviews'
import { SplitTitle } from '../components/Showcase'
import { useSpreadReady } from '../components/Spread'
import { StarRating } from '../components/Stars'
import { genreLabel } from '../genres'
import { useDeleteMovie, useDocumentTitle, useMovie, useSimilarMovies } from '../hooks'
import {
  prefersReducedMotion,
  revealRef,
  useCountUp,
  useInView,
  useScrollProgress,
} from '../motion'
import type { Company, MovieDetail, Performance, Person } from '../types'
import {
  formatDate,
  formatDecimal,
  formatInteger,
  formatMoney,
  formatRuntime,
  formatStars,
  initials,
  resizeTmdbImage,
  toStars,
} from '../utils'

const CAST_PREVIEW = 12
const FALLBACK_TINT = '#8a7f6a'

const scrollToId = (id: string) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })

// Linha fina no topo da tela mostrando quanto da página já foi lida.
function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0
      ref.current?.style.setProperty('--progress', progress.toFixed(4))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])
  return <div className="reading-progress" ref={ref} aria-hidden />
}

// "Voltar" volta no histórico (o catálogo reabre com os mesmos filtros e na
// mesma posição); se a página foi aberta direto pelo link, vai para o catálogo.
function BackLink() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <Link
      to="/"
      className="back-link"
      onClick={(event) => {
        if (location.key === 'default') return
        event.preventDefault()
        navigate(-1)
      }}
    >
      <ArrowLeft size={15} /> Voltar
    </Link>
  )
}

function NameLinks({ items, kind, limit = 8 }: { items: (Person | Company)[]; kind: 'pessoa' | 'produtora'; limit?: number }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, limit)
  return (
    <>
      {visible.map((item, index) => (
        <span key={item.id}>
          {index > 0 && ', '}
          <Link to={`/?${kind}=${item.id}`}>{item.nome}</Link>
        </span>
      ))}
      {items.length > limit && (
        <button type="button" className="link-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? ' mostrar menos' : ` e mais ${items.length - limit}`}
        </button>
      )}
    </>
  )
}

interface DetailHeroProps {
  movie: MovieDetail
  onImage: () => void
  onDelete: () => void
}

// Topo da página: imagem de fundo nítida (com parallax), pôster, título com as
// palavras subindo, ficha rápida e a nota. Os elementos com data-enter entram
// em sequência (o atraso de cada um vem de --d).
function DetailHero({ movie, onImage, onDelete }: DetailHeroProps) {
  const { isAdmin } = useAuth()
  const heroRef = useRef<HTMLElement>(null)
  const [loaded, setLoaded] = useState(false)
  useScrollProgress(heroRef)

  const backdrop = resizeTmdbImage(movie.url_backdrop, 'w1280')
  const runtime = formatRuntime(movie.duracao_minutos)
  const date = formatDate(movie.data_lancamento)
  const { total, media } = movie.avaliacoes

  const checkCached = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete && image.naturalWidth > 0) {
        setLoaded(true)
        onImage()
      }
    },
    [onImage],
  )

  return (
    <header className={`detail-hero ${backdrop ? '' : 'detail-hero--plain'}`} ref={heroRef}>
      {backdrop && (
        <div className="detail-hero__media" aria-hidden>
          <img
            ref={checkCached}
            src={backdrop}
            alt=""
            decoding="async"
            className={loaded ? 'is-loaded' : undefined}
            onLoad={() => {
              setLoaded(true)
              onImage()
            }}
            onError={onImage}
          />
        </div>
      )}

      <div className="container detail-hero__inner">
        <div data-enter="" style={{ '--d': '0ms' } as CSSProperties}>
          <BackLink />
        </div>
        <div className="detail-hero__grid">
          <div className="detail-hero__poster" data-enter="poster">
            <Poster src={movie.url_poster} title={movie.titulo} size="w500" eager />
          </div>

          <div className="detail-hero__text">
            {movie.generos.length > 0 && (
              <p className="eyebrow" data-enter="" style={{ '--d': '80ms' } as CSSProperties}>
                {movie.generos.map((genre) => genreLabel(genre.nome)).join(' · ')}
              </p>
            )}
            <h1 className="detail-title">
              <SplitTitle text={movie.titulo} delay={140} />
              {movie.ano_lancamento != null && (
                <span className="detail-title__year" data-enter="" style={{ '--d': '420ms' } as CSSProperties}>
                  {movie.ano_lancamento}
                </span>
              )}
            </h1>
            <div className="detail-meta" data-enter="" style={{ '--d': '380ms' } as CSSProperties}>
              {date && (
                <span>
                  <Calendar size={14} aria-hidden /> {date}
                </span>
              )}
              {runtime && (
                <span>
                  <Clock size={14} aria-hidden /> {runtime}
                </span>
              )}
              {movie.status_filme && <span className="status-badge">{movie.status_filme}</span>}
            </div>
            {movie.diretores.length > 0 && (
              <p className="detail-credit" data-enter="" style={{ '--d': '440ms' } as CSSProperties}>
                Direção de <NameLinks items={movie.diretores} kind="pessoa" limit={3} />
              </p>
            )}
            <div className="detail-actions" data-enter="" style={{ '--d': '500ms' } as CSSProperties}>
              <a
                href="#avaliacoes"
                className="btn btn--tint"
                onClick={(event) => {
                  event.preventDefault()
                  scrollToId('avaliacoes')
                }}
              >
                <Star size={15} /> {isAdmin ? 'Avaliar filme' : 'Ver avaliações'}
              </a>
              {isAdmin && (
                <>
                  <Link to={`/filmes/${movie.id}/editar`} className="btn btn--ghost">
                    <Pencil size={14} /> Editar
                  </Link>
                  <button type="button" className="btn btn--ghost btn--danger-text" onClick={onDelete}>
                    <Trash2 size={14} /> Remover
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="detail-score" data-enter="" style={{ '--d': '300ms' } as CSSProperties}>
            <span className="detail-score__label">Nota do público</span>
            <span className="detail-score__value">{total ? formatStars(media) : '–'}</span>
            <StarRating value={toStars(media)} size={14} />
            <span className="detail-score__count">
              {formatInteger(total)} {total === 1 ? 'avaliação' : 'avaliações'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

interface SectionLink {
  id: string
  label: string
}

// Barra que gruda no topo com os atalhos das seções. O traço embaixo segue a
// seção que está no meio da tela e, quando a barra gruda, o título do filme
// aparece nela.
function SectionNav({ sections, title }: { sections: SectionLink[]; title: string }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const [stuck, setStuck] = useState(false)
  const linksRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const ids = sections.map((section) => section.id).join(',')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      { rootMargin: '-38% 0px -58% 0px' },
    )
    for (const id of ids.split(',')) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const container = linksRef.current
    const link = container?.querySelector<HTMLElement>(`[data-section="${active}"]`)
    if (!container || !link) return
    container.style.setProperty('--x', `${link.offsetLeft}px`)
    container.style.setProperty('--w', `${link.offsetWidth}px`)
  }, [active, ids])

  return (
    <>
      <div ref={sentinelRef} className="section-nav__sentinel" aria-hidden />
      <nav className={`section-nav ${stuck ? 'is-stuck' : ''}`} aria-label="Seções da página">
        <div className="container section-nav__inner">
          <span className="section-nav__title" aria-hidden>
            {title}
          </span>
          <div className="section-nav__links" ref={linksRef}>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                data-section={section.id}
                className={section.id === active ? 'is-active' : undefined}
                aria-current={section.id === active ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  scrollToId(section.id)
                }}
              >
                {section.label}
              </a>
            ))}
            <span className="section-nav__indicator" aria-hidden />
          </div>
        </div>
      </nav>
    </>
  )
}

function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className="section-label" id={id} data-reveal="" ref={revealRef}>
      {children}
    </h2>
  )
}

// Não há fotos do elenco nos CSVs, então cada pessoa vira um quadrado com as
// iniciais na cor do filme. Clicar filtra o catálogo pelos filmes dela.
function CastGrid({ people }: { people: Person[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? people : people.slice(0, CAST_PREVIEW)
  return (
    <>
      <ul className="cast">
        {visible.map((person, index) => (
          <li
            key={person.id}
            data-reveal=""
            ref={revealRef}
            style={{ '--i': index % 6 } as CSSProperties}
          >
            <Link to={`/?pessoa=${person.id}`} className="cast__item" title={`Filmes com ${person.nome}`}>
              <span className="cast__avatar" aria-hidden>
                {initials(person.nome)}
              </span>
              <span className="cast__name">{person.nome}</span>
              <span className="cast__more">
                Ver filmes <ArrowUpRight size={12} aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {people.length > CAST_PREVIEW && (
        <button type="button" className="link-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Mostrar menos' : `Ver elenco completo (${people.length})`}
        </button>
      )}
    </>
  )
}

function Facts({ movie }: { movie: MovieDetail }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Direção', value: movie.diretores.length > 0 && <NameLinks items={movie.diretores} kind="pessoa" /> },
    { label: 'Roteiro', value: movie.roteiristas.length > 0 && <NameLinks items={movie.roteiristas} kind="pessoa" /> },
    { label: 'Produção', value: movie.produtoras.length > 0 && <NameLinks items={movie.produtoras} kind="produtora" /> },
    { label: 'Lançamento', value: formatDate(movie.data_lancamento) },
    { label: 'Duração', value: formatRuntime(movie.duracao_minutos) },
    { label: 'Situação', value: movie.status_filme },
    { label: 'Código TMDB', value: movie.id_filme },
  ].filter((row) => row.value)

  return (
    <dl className="facts">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className="facts__row"
          data-reveal=""
          ref={revealRef}
          style={{ '--i': index } as CSSProperties}
        >
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CountMoney({ value, currency, active }: { value: number; currency: 'USD' | 'BRL'; active: boolean }) {
  return <>{formatMoney(useCountUp(value, active, 1400), currency)}</>
}

function hasNumbers(data: Performance | null): data is Performance {
  return Boolean(data && (data.orcamento_usd != null || data.receita_usd != null || data.popularidade != null))
}

// Orçamento x bilheteria em barras (crescem quando aparecem) e os números
// contando até o valor.
function PerformanceSection({ data }: { data: Performance }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const budget = data.orcamento_usd ?? 0
  const revenue = data.receita_usd ?? 0
  const top = Math.max(budget, revenue, 1)
  const both = data.orcamento_usd != null && data.receita_usd != null
  const popularity = useCountUp(Math.round(data.popularidade ?? 0), inView, 1400)

  return (
    <section className="detail-section" id="numeros" aria-labelledby="numbers-title">
      <SectionLabel id="numbers-title">Números</SectionLabel>
      <div className="numbers" ref={ref} data-shown={inView || undefined}>
        {(data.orcamento_usd != null || data.receita_usd != null) && (
          <div className="money-bars">
            {[
              { label: 'Orçamento', value: data.orcamento_usd, share: budget / top },
              { label: 'Bilheteria', value: data.receita_usd, share: revenue / top },
            ].map((bar, index) => (
              <div
                key={bar.label}
                className={`money-bar ${index === 1 ? 'money-bar--revenue' : ''}`}
                style={{ '--w': bar.share, '--i': index } as CSSProperties}
              >
                <span className="money-bar__label">{bar.label}</span>
                <span className="money-bar__track" aria-hidden>
                  <span className="money-bar__fill" />
                </span>
                <span className="money-bar__value">
                  {bar.value == null ? '-' : <CountMoney value={bar.value} currency="USD" active={inView} />}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="kv-grid">
          {both && data.lucro_usd != null && (
            <div className="kv">
              <span className="kv__label">Resultado</span>
              <span className={`kv__value ${data.lucro_usd >= 0 ? 'is-positive' : 'is-negative'}`}>
                <CountMoney value={data.lucro_usd} currency="USD" active={inView} />
              </span>
              <span className="kv__sub">{formatMoney(data.lucro_brl, 'BRL')} em reais</span>
            </div>
          )}
          {both && budget > 0 && (
            <div className="kv">
              <span className="kv__label">Retorno</span>
              <span className="kv__value">{formatDecimal(revenue / budget)}×</span>
              <span className="kv__sub">bilheteria ÷ orçamento</span>
            </div>
          )}
          {data.popularidade != null && (
            <div className="kv">
              <span className="kv__label">Popularidade TMDB</span>
              <span className="kv__value">{formatInteger(Math.round(popularity))}</span>
              <span className="kv__sub">índice do TMDB</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function MovieDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const movie = useMovie(id)
  const similar = useSimilarMovies(id)
  const deleteMovie = useDeleteMovie()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [heroReady, setHeroReady] = useState(false)
  const data = movie.data
  const tint = useMovieTint(data)
  useDocumentTitle(data?.titulo)

  // fundo da página: cor do pôster + pôster desfocado (a mesma da transição)
  useAmbient(
    movie.isError ? null : data ? tint : undefined,
    data ? resizeTmdbImage(data.url_poster, 'w342') : null,
    'full',
  )
  // avisa a transição que já pode revelar a página (dados + imagem do topo)
  useSpreadReady(id, movie.isError || (movie.isSuccess && (heroReady || !movie.data.url_backdrop)))
  const onHeroImage = useCallback(() => setHeroReady(true), [])

  if (movie.isPending) return <LoadingState label="Carregando filme..." />
  if (movie.isError || !data) {
    if (movie.error instanceof ApiError && movie.error.status === 404) {
      return (
        <div className="container page-pad">
          <EmptyState
            title="Filme não encontrado"
            description="Ele pode ter sido removido do catálogo."
            action={
              <Link to="/" className="btn btn--ghost">
                <ArrowLeft size={15} /> Voltar ao catálogo
              </Link>
            }
          />
        </div>
      )
    }
    return (
      <div className="container page-pad">
        <ErrorState error={movie.error} onRetry={() => void movie.refetch()} />
      </div>
    )
  }

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

  const color = tint ?? FALLBACK_TINT
  const numbers = hasNumbers(data.desempenho) ? data.desempenho : null
  const similarMovies = similar.data ?? []
  const sections: SectionLink[] = [
    { id: 'sinopse', label: 'Sinopse' },
    ...(data.elenco.length > 0 ? [{ id: 'elenco', label: 'Elenco' }] : []),
    { id: 'ficha', label: 'Ficha técnica' },
    ...(numbers ? [{ id: 'numeros', label: 'Números' }] : []),
    { id: 'avaliacoes', label: 'Avaliações' },
    ...(similarMovies.length > 0 ? [{ id: 'semelhantes', label: 'Semelhantes' }] : []),
  ]

  return (
    <article className="detail" style={{ '--tint': color, '--tint-ink': inkFor(color) } as CSSProperties}>
      <ReadingProgress />
      <DetailHero movie={data} onImage={onHeroImage} onDelete={() => setConfirmOpen(true)} />
      <SectionNav sections={sections} title={data.titulo} />

      <div className="container detail-body">
        <div className="detail-main">
          <section className="detail-section" id="sinopse" aria-labelledby="synopsis-title">
            <SectionLabel id="synopsis-title">Sinopse</SectionLabel>
            {data.sinopse ? (
              <p className="synopsis" data-reveal="" ref={revealRef}>
                {data.sinopse}
              </p>
            ) : (
              <p className="muted">Sinopse não informada.</p>
            )}
          </section>

          {data.elenco.length > 0 && (
            <section className="detail-section" id="elenco" aria-labelledby="cast-title">
              <SectionLabel id="cast-title">
                Elenco <span className="section-label__count">{formatInteger(data.elenco.length)}</span>
              </SectionLabel>
              <CastGrid people={data.elenco} />
            </section>
          )}

          <section className="detail-section" id="ficha" aria-labelledby="facts-title">
            <SectionLabel id="facts-title">Ficha técnica</SectionLabel>
            <Facts movie={data} />
          </section>

          {numbers && <PerformanceSection data={numbers} />}

          <ReviewSection movieId={data.id} total={data.avaliacoes.total} />
        </div>

        <aside className="detail-aside">
          <RatingPanel summary={data.avaliacoes} performance={data.desempenho} />
        </aside>
      </div>

      {similarMovies.length > 0 && (
        <div className="container detail-similar">
          <MovieRow id="semelhantes" eyebrow="Para ver depois" title="Filmes semelhantes" movies={similarMovies} />
        </div>
      )}

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
