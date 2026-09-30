import { Clapperboard, MessageSquare, Star, Users } from 'lucide-react'
import { type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useAmbient } from '../components/Ambient'
import { ErrorState, LoadingState } from '../components/Feedback'
import { Poster } from '../components/MovieCard'
import { MovieLink } from '../components/Spread'
import { StarRating } from '../components/Stars'
import { genreLabel } from '../genres'
import { useDocumentTitle, useStats } from '../hooks'
import { revealRef, useCountUp, useInView } from '../motion'
import type { MovieSummary, RatingBucket } from '../types'
import { formatDecimal, formatInteger, formatRelative, formatStars, pad2, toStars } from '../utils'

// Os gráficos são feitos com CSS mesmo (sem biblioteca). Cada gráfico tem uma
// série só, então não precisa de legenda. O valor de cada barra aparece no
// tooltip e todos os números estão na tabela "Ver dados em tabela".
// As barras crescem e os números contam quando o bloco aparece na tela.

interface KpiProps {
  icon: ReactNode
  label: string
  value: number
  index: number
  format?: (n: number) => string
  suffix?: string
  sub?: string
}

function Kpi({ icon, label, value, index, format = (n) => formatInteger(Math.round(n)), suffix, sub }: KpiProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const shown = useCountUp(value, inView, 1300)
  return (
    <div
      className="kpi"
      ref={ref}
      data-reveal=""
      data-in={inView ? '' : undefined}
      style={{ '--i': index } as CSSProperties}
    >
      <span className="kpi__label">
        {icon} {label}
      </span>
      <span className="kpi__value">
        {format(shown)}
        {suffix}
      </span>
      {sub && <span className="kpi__sub">{sub}</span>}
    </div>
  )
}

interface Column {
  key: string
  label: string
  value: number
  tip: string
}

// gráfico de colunas
function ColumnChart({
  columns,
  variant = 'primary',
  ariaLabel,
  tableHeaders,
}: {
  columns: Column[]
  variant?: 'primary' | 'star'
  ariaLabel: string
  tableHeaders: [string, string]
}) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const max = Math.max(...columns.map((column) => column.value), 0)
  const peak = columns.findIndex((column) => column.value === max)
  return (
    <div ref={ref} data-shown={inView || undefined}>
      <div className={`vbar-chart vbar-chart--${variant}`} role="list" aria-label={ariaLabel}>
        {columns.map((column, index) => (
          <div
            key={column.key}
            className={`vbar hit ${index === peak ? 'is-peak' : ''}`}
            role="listitem"
            tabIndex={0}
            aria-label={column.tip}
            data-tip={column.tip}
            style={{ '--i': index } as CSSProperties}
          >
            <div className="vbar__fill" style={{ '--h': max ? column.value / max : 0 } as CSSProperties}>
              {/* só a maior barra mostra o número em cima */}
              {index === peak && max > 0 && (
                <span className="vbar__value">{formatInteger(column.value)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="vbar-axis" aria-hidden>
        {columns.map((column) => (
          <span key={column.key}>{column.label}</span>
        ))}
      </div>
      <DataTable
        headers={tableHeaders}
        rows={columns.map((column) => [column.label, formatInteger(column.value)])}
      />
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <details className="table-toggle">
      <summary>Ver dados em tabela</summary>
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function distributionColumns(buckets: RatingBucket[]): Column[] {
  return buckets.map((bucket) => ({
    key: String(bucket.estrelas),
    label: `${formatDecimal(bucket.estrelas)}★`,
    value: bucket.total,
    tip: `${formatDecimal(bucket.estrelas)}★ - ${formatInteger(bucket.total)} avaliações`,
  }))
}

function RankedList({
  movies,
  score,
}: {
  movies: MovieSummary[]
  score: (movie: MovieSummary) => ReactNode
}) {
  return (
    <ol className="ranked-list">
      {movies.map((movie, index) => (
        <li key={movie.id} data-reveal="" ref={revealRef} style={{ '--i': index } as CSSProperties}>
          <MovieLink movie={movie} className="ranked-item">
            <span className="ranked-item__pos">{pad2(index + 1)}</span>
            <span className="ranked-item__thumb" data-spread>
              <Poster src={movie.url_poster} title={movie.titulo} size="w92" />
            </span>
            <span className="ranked-item__text">
              <span className="ranked-item__title">{movie.titulo}</span>
              <span className="ranked-item__sub">
                {movie.ano_lancamento} · {formatInteger(movie.total_avaliacoes)} avaliação(ões)
              </span>
            </span>
            <span className="ranked-item__score">{score(movie)}</span>
          </MovieLink>
        </li>
      ))}
    </ol>
  )
}

function Panel({ title, sub, wide, children }: { title: string; sub?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`panel ${wide ? 'panel--wide' : ''}`} data-reveal="" ref={revealRef}>
      <h2 className="panel__title">{title}</h2>
      {sub && <p className="panel__sub">{sub}</p>}
      {children}
    </section>
  )
}

function GenreBars({ genres }: { genres: { id: string; nome: string; total_filmes: number; media: number | null }[] }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const max = Math.max(...genres.map((genre) => genre.total_filmes), 1)
  return (
    <div className="hbar-chart" role="list" aria-label="Filmes por gênero" ref={ref} data-shown={inView || undefined}>
      {genres.map((genre, index) => {
        const name = genreLabel(genre.nome)
        const tip = `${name}: ${formatInteger(genre.total_filmes)} filmes · média ${
          genre.media != null ? `${formatStars(genre.media)}★` : '-'
        }`
        return (
          <Link
            key={genre.id}
            to={`/?genero=${genre.id}`}
            className="hbar"
            role="listitem"
            aria-label={tip}
            title={tip}
            style={{ '--i': index, '--w': genre.total_filmes / max } as CSSProperties}
          >
            <span className="hbar__label">{name}</span>
            <span className="hbar__track">
              <span className="hbar__fill" />
            </span>
            <span className="hbar__value">{formatInteger(genre.total_filmes)}</span>
          </Link>
        )
      })}
    </div>
  )
}

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  useAmbient(null)
  const stats = useStats()

  if (stats.isPending) return <LoadingState label="Calculando estatísticas..." />
  if (stats.isError) {
    return (
      <div className="container page-pad">
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      </div>
    )
  }

  const data = stats.data
  const topGenres = data.generos.slice(0, 12)
  const coverage = data.total_filmes ? (data.filmes_avaliados / data.total_filmes) * 100 : 0

  return (
    <div className="container page-pad">
      <header className="page-header">
        <p className="eyebrow" data-enter="">
          Números do catálogo
        </p>
        <h1 className="page-title" data-enter="" style={{ '--d': '80ms' } as CSSProperties}>
          Dashboard
        </h1>
        <p className="page-subtitle" data-enter="" style={{ '--d': '160ms' } as CSSProperties}>
          Visão geral do catálogo e das avaliações.
        </p>
      </header>

      <div className="kpi-grid">
        <Kpi
          index={0}
          icon={<Clapperboard size={15} />}
          label="Filmes no catálogo"
          value={data.total_filmes}
          sub={`${formatInteger(data.total_produtoras)} produtoras`}
        />
        <Kpi
          index={1}
          icon={<MessageSquare size={15} />}
          label="Avaliações"
          value={data.total_avaliacoes}
          sub={`${formatInteger(data.filmes_avaliados)} filmes avaliados (${formatDecimal(coverage)}%)`}
        />
        <Kpi
          index={2}
          icon={<Star size={15} />}
          label="Média geral"
          value={toStars(data.media_geral) ?? 0}
          format={(n) => formatDecimal(n)}
          suffix=" ★"
          sub={data.media_geral != null ? `${formatDecimal(data.media_geral)} de 10` : undefined}
        />
        <Kpi
          index={3}
          icon={<Users size={15} />}
          label="Pessoas"
          value={data.total_pessoas}
          sub="atores, diretores e roteiristas"
        />
      </div>

      <div className="dashboard-grid">
        <Panel title="Distribuição das notas" sub="Quantidade de avaliações por nota (meias estrelas)">
          <ColumnChart
            columns={distributionColumns(data.distribuicao)}
            variant="star"
            ariaLabel="Avaliações por nota"
            tableHeaders={['Nota', 'Avaliações']}
          />
        </Panel>

        <Panel title="Filmes por ano de lançamento" sub="Quantidade de filmes cadastrados em cada ano">
          <ColumnChart
            columns={data.filmes_por_ano.map((year) => ({
              key: String(year.ano),
              label: `'${String(year.ano).slice(2)}`,
              value: year.total_filmes,
              tip: `${year.ano} - ${formatInteger(year.total_filmes)} filmes`,
            }))}
            ariaLabel="Filmes por ano"
            tableHeaders={['Ano', 'Filmes']}
          />
        </Panel>

        <Panel
          wide
          title="Gêneros com mais filmes"
          sub="Quantidade de filmes por gênero; a média das avaliações aparece no tooltip e na tabela"
        >
          <GenreBars genres={topGenres} />
          <DataTable
            headers={['Gênero', 'Filmes', 'Avaliações', 'Média (★)']}
            rows={data.generos.map((genre) => [
              genreLabel(genre.nome),
              formatInteger(genre.total_filmes),
              formatInteger(genre.total_avaliacoes),
              genre.media != null ? formatStars(genre.media) : '-',
            ])}
          />
        </Panel>

        <Panel
          title="Mais bem avaliados"
          sub="Média bayesiana: filmes com poucas notas são puxados para a média geral, então uma única nota 10 não lidera o ranking."
        >
          <RankedList
            movies={data.mais_bem_avaliados}
            score={(movie) => (
              <span className="rating-inline">
                <StarRating value={toStars(movie.nota_media)} size={12} />
                <strong>{formatStars(movie.nota_media)}</strong>
              </span>
            )}
          />
        </Panel>

        <Panel title="Mais avaliados" sub="Filmes com o maior número de resenhas">
          <RankedList
            movies={data.mais_avaliados}
            score={(movie) => <strong>{formatInteger(movie.total_avaliacoes)}</strong>}
          />
        </Panel>

        <Panel wide title="Últimas avaliações">
          <ul className="ranked-list">
            {data.ultimas_avaliacoes.map((review, index) => (
              <li key={review.id} data-reveal="" ref={revealRef} style={{ '--i': index } as CSSProperties}>
                <MovieLink
                  movie={{ id: review.filme_id, titulo: review.filme_titulo, url_poster: review.filme_poster }}
                  className="ranked-item ranked-item--review"
                >
                  <span className="ranked-item__thumb" data-spread>
                    <Poster src={review.filme_poster} title={review.filme_titulo} size="w92" />
                  </span>
                  <span className="ranked-item__text">
                    <span className="ranked-item__title">{review.filme_titulo}</span>
                    <span className="ranked-item__sub">
                      {review.nome} · {formatRelative(review.criado_em)} - “{review.comentario}”
                    </span>
                  </span>
                  <span className="rating-inline">
                    <StarRating value={toStars(review.nota)} size={12} />
                  </span>
                </MovieLink>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
