import { Clapperboard, MessageSquare, Star, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { ErrorState, LoadingState } from '../components/Feedback'
import { Poster } from '../components/MovieCard'
import { StarRating } from '../components/Stars'
import { useDocumentTitle, useStats } from '../hooks'
import type { MovieSummary, RatingBucket } from '../types'
import { formatDecimal, formatInteger, formatRelative, formatStars, toStars } from '../utils'

// Os gráficos são feitos com CSS mesmo (sem biblioteca). Cada gráfico tem uma
// série só, então não precisa de legenda. O valor de cada barra aparece no
// tooltip e todos os números estão na tabela "Ver dados em tabela".

function Kpi({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi__label">
        {icon} {label}
      </span>
      <span className="kpi__value">{value}</span>
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
  const max = Math.max(...columns.map((column) => column.value), 0)
  const peak = columns.findIndex((column) => column.value === max)
  return (
    <>
      <div className="vbar-chart" role="list" aria-label={ariaLabel}>
        {columns.map((column, index) => (
          <div
            key={column.key}
            className="vbar hit"
            role="listitem"
            tabIndex={0}
            aria-label={column.tip}
            data-tip={column.tip}
          >
            <div
              className={`vbar__fill ${variant === 'star' ? 'vbar__fill--star' : ''}`}
              style={{ height: max ? `${(column.value / max) * 100}%` : 0 }}
            >
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
    </>
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
        <li key={movie.id}>
          <Link to={`/filmes/${movie.id}`} className="ranked-item">
            <span className="ranked-item__pos">{index + 1}</span>
            <Poster src={movie.url_poster} title={movie.titulo} size="w92" />
            <span style={{ minWidth: 0 }}>
              <span className="ranked-item__title" style={{ display: 'block' }}>
                {movie.titulo}
              </span>
              <span className="ranked-item__sub">
                {movie.ano_lancamento} · {formatInteger(movie.total_avaliacoes)} avaliação(ões)
              </span>
            </span>
            <span className="ranked-item__score">{score(movie)}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const stats = useStats()

  if (stats.isPending) return <LoadingState label="Calculando estatísticas..." />
  if (stats.isError) {
    return (
      <div className="container">
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      </div>
    )
  }

  const data = stats.data
  const topGenres = data.generos.slice(0, 12)
  const maxGenre = Math.max(...topGenres.map((genre) => genre.total_filmes), 1)
  const coverage = data.total_filmes ? (data.filmes_avaliados / data.total_filmes) * 100 : 0

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral do catálogo e das avaliações.</p>
        </div>
      </header>

      <div className="kpi-grid">
        <Kpi
          icon={<Clapperboard size={16} />}
          label="Filmes no catálogo"
          value={formatInteger(data.total_filmes)}
          sub={`${formatInteger(data.total_produtoras)} produtoras`}
        />
        <Kpi
          icon={<MessageSquare size={16} />}
          label="Avaliações"
          value={formatInteger(data.total_avaliacoes)}
          sub={`${formatInteger(data.filmes_avaliados)} filmes avaliados (${formatDecimal(coverage)}%)`}
        />
        <Kpi
          icon={<Star size={16} />}
          label="Média geral"
          value={data.media_geral != null ? `${formatStars(data.media_geral)} ★` : '-'}
          sub={data.media_geral != null ? `${formatDecimal(data.media_geral)} de 10` : undefined}
        />
        <Kpi
          icon={<Users size={16} />}
          label="Pessoas"
          value={formatInteger(data.total_pessoas)}
          sub="atores, diretores e roteiristas"
        />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <h2 className="chart-title">Distribuição das notas</h2>
          <p className="chart-sub">Quantidade de avaliações por nota (meias estrelas)</p>
          <ColumnChart
            columns={distributionColumns(data.distribuicao)}
            variant="star"
            ariaLabel="Avaliações por nota"
            tableHeaders={['Nota', 'Avaliações']}
          />
        </section>

        <section className="card">
          <h2 className="chart-title">Filmes por ano de lançamento</h2>
          <p className="chart-sub">Quantidade de filmes cadastrados em cada ano</p>
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
        </section>

        <section className="card dashboard-grid__wide">
          <h2 className="chart-title">Gêneros com mais filmes</h2>
          <p className="chart-sub">
            Quantidade de filmes por gênero; a média das avaliações aparece no tooltip e na tabela
          </p>
          <div className="hbar-chart" role="list" aria-label="Filmes por gênero">
            {topGenres.map((genre) => {
              const tip = `${genre.nome}: ${formatInteger(genre.total_filmes)} filmes · média ${
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
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <span className="hbar__label">{genre.nome}</span>
                  <span className="hbar__track">
                    <span
                      className="hbar__fill"
                      style={{ display: 'block', width: `${(genre.total_filmes / maxGenre) * 100}%` }}
                    />
                  </span>
                  <span className="hbar__value">{formatInteger(genre.total_filmes)}</span>
                </Link>
              )
            })}
          </div>
          <DataTable
            headers={['Gênero', 'Filmes', 'Avaliações', 'Média (★)']}
            rows={data.generos.map((genre) => [
              genre.nome,
              formatInteger(genre.total_filmes),
              formatInteger(genre.total_avaliacoes),
              genre.media != null ? formatStars(genre.media) : '-',
            ])}
          />
        </section>

        <section className="card">
          <h2 className="chart-title">Mais bem avaliados</h2>
          <p className="chart-sub">
            Média bayesiana: filmes com poucas notas são puxados para a média geral, então uma
            única nota 10 não lidera o ranking.
          </p>
          <RankedList
            movies={data.mais_bem_avaliados}
            score={(movie) => (
              <span className="rating-inline">
                <StarRating value={toStars(movie.nota_media)} size={12} />
                <strong>{formatStars(movie.nota_media)}</strong>
              </span>
            )}
          />
        </section>

        <section className="card">
          <h2 className="chart-title">Mais avaliados</h2>
          <p className="chart-sub">Filmes com o maior número de resenhas</p>
          <RankedList
            movies={data.mais_avaliados}
            score={(movie) => (
              <strong>{formatInteger(movie.total_avaliacoes)}</strong>
            )}
          />
        </section>

        <section className="card dashboard-grid__wide">
          <h2 className="chart-title">Últimas avaliações</h2>
          <ul className="ranked-list">
            {data.ultimas_avaliacoes.map((review) => (
              <li key={review.id}>
                <Link to={`/filmes/${review.filme_id}`} className="ranked-item">
                  <span />
                  <Poster src={review.filme_poster} title={review.filme_titulo} size="w92" />
                  <span style={{ minWidth: 0 }}>
                    <span className="ranked-item__title" style={{ display: 'block' }}>
                      {review.filme_titulo}
                    </span>
                    <span className="ranked-item__sub">
                      {review.nome} · {formatRelative(review.criado_em)} - “{review.comentario}”
                    </span>
                  </span>
                  <span className="rating-inline">
                    <StarRating value={toStars(review.nota)} size={12} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
