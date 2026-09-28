// Tudo de avaliações na página do filme: média com histograma, formulário e lista.

import { zodResolver } from '@hookform/resolvers/zod'
import { MessageSquare, Send, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '../api'
import { useAuth } from '../auth'
import { useAddReview, useDeleteReview, useReviews } from '../hooks'
import type { Performance, RatingSummary, Review, ReviewSort } from '../types'
import {
  formatDecimal,
  formatInteger,
  formatRelative,
  formatStars,
  starsToNota,
  toStars,
} from '../utils'
import { MAX_COMMENT, type ReviewFormValues, reviewSchema } from '../validation'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from './Feedback'
import { Pagination } from './Pagination'
import { StarRating, StarRatingInput } from './Stars'

interface RatingSummaryCardProps {
  summary: RatingSummary
  performance: Performance | null
}

// Média do filme + histograma das notas (10 barras, uma por meia estrela).
// O valor de cada barra aparece no tooltip.
export function RatingSummaryCard({ summary, performance }: RatingSummaryCardProps) {
  const max = Math.max(...summary.distribuicao.map((bucket) => bucket.total), 0)
  const hasRatings = summary.total > 0

  return (
    <div className="card rating-box">
      <h2 className="section__title">Média dos usuários</h2>
      {hasRatings ? (
        <>
          <div className="rating-box__score">
            <span className="rating-box__value">{formatStars(summary.media)}</span>
            <span className="rating-box__max">/ 5</span>
          </div>
          <StarRating value={toStars(summary.media)} size={22} />
          <p className="muted">
            {formatDecimal(summary.media)}/10 · {formatInteger(summary.total)}{' '}
            {summary.total === 1 ? 'avaliação' : 'avaliações'}
          </p>
          <div>
            <div className="histogram" role="list" aria-label="Distribuição das notas">
              {summary.distribuicao.map((bucket) => {
                const label = `${formatDecimal(bucket.estrelas)}★: ${formatInteger(bucket.total)} ${
                  bucket.total === 1 ? 'avaliação' : 'avaliações'
                }`
                return (
                  <div
                    key={bucket.estrelas}
                    role="listitem"
                    tabIndex={0}
                    aria-label={label}
                    data-tip={label}
                    className={`histogram__bar hit ${bucket.total ? 'histogram__bar--filled' : ''}`}
                    style={{ height: max ? `${Math.max(3, (bucket.total / max) * 100)}%` : '3%' }}
                  />
                )
              })}
            </div>
            <div className="histogram__axis" aria-hidden>
              <span>
                <Star size={10} fill="currentColor" strokeWidth={0} />
              </span>
              <span>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={10} fill="currentColor" strokeWidth={0} />
                ))}
              </span>
            </div>
          </div>
        </>
      ) : (
        <p className="muted">Ainda sem avaliações. Que tal ser o primeiro a avaliar?</p>
      )}

      {performance && (performance.nota_tmdb != null || performance.nota_imdb != null) && (
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="section__title">Outras bases</h3>
          {performance.nota_tmdb != null && (
            <p className="row">
              <strong>TMDB</strong> {formatDecimal(performance.nota_tmdb)}/10
              <span className="subtle">({formatInteger(performance.qtd_tmdb)} votos)</span>
            </p>
          )}
          {performance.nota_imdb != null && (
            <p className="row">
              <strong>IMDb</strong> {formatDecimal(performance.nota_imdb)}/10
              <span className="subtle">({formatInteger(performance.qtd_imdb)} votos)</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const REVIEWER_KEY = 'cinelab:reviewer'
function readReviewer(): string {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? ''
  } catch {
    return ''
  }
}

function ReviewForm({ movieId }: { movieId: string }) {
  const addReview = useAddReview(movieId)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { nome: readReviewer(), estrelas: undefined, comentario: '' },
  })
  const commentLength = useWatch({ control, name: 'comentario' })?.length ?? 0

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addReview.mutateAsync({
        nome: values.nome,
        nota: starsToNota(values.estrelas),
        comentario: values.comentario,
      })
      try {
        localStorage.setItem(REVIEWER_KEY, values.nome) // lembra o nome para a próxima vez
      } catch {
        // sem localStorage, sem problema
      }
      reset({ nome: values.nome, estrelas: undefined, comentario: '' })
      toast.success('Avaliação publicada!')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
    }
  })

  return (
    <form className="card review-form" onSubmit={onSubmit} noValidate>
      <h3 className="form-section__title">Adicionar avaliação</h3>
      <div className="field">
        <span className="field__label" id="rating-label">
          Nota<span className="required">*</span>
        </span>
        <Controller
          control={control}
          name="estrelas"
          render={({ field }) => (
            <StarRatingInput
              value={field.value ?? null}
              onChange={field.onChange}
              invalid={Boolean(errors.estrelas)}
            />
          )}
        />
        {errors.estrelas && <span className="field__error">{errors.estrelas.message}</span>}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="review-name">
          Nome<span className="required">*</span>
        </label>
        <input
          id="review-name"
          className="input"
          autoComplete="name"
          aria-invalid={Boolean(errors.nome)}
          {...register('nome')}
        />
        {errors.nome && <span className="field__error">{errors.nome.message}</span>}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="review-text">
          Resenha<span className="required">*</span>
        </label>
        <textarea
          id="review-text"
          className="textarea"
          placeholder="O que achou do filme?"
          aria-invalid={Boolean(errors.comentario)}
          maxLength={MAX_COMMENT}
          {...register('comentario')}
        />
        <span className="counter">
          {formatInteger(commentLength)}/{formatInteger(MAX_COMMENT)}
        </span>
        {errors.comentario && <span className="field__error">{errors.comentario.message}</span>}
      </div>
      <div className="row">
        <span className="spacer" />
        <button type="submit" className="btn btn--primary" disabled={addReview.isPending}>
          <Send size={16} /> {addReview.isPending ? 'Publicando...' : 'Publicar avaliação'}
        </button>
      </div>
    </form>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function ReviewItem({ review, onDelete }: { review: Review; onDelete?: () => void }) {
  return (
    <article className="review">
      <div className="review__avatar" aria-hidden>
        {initials(review.nome)}
      </div>
      <div>
        <header className="review__header">
          <span className="review__name">{review.nome}</span>
          <span className="rating-inline">
            <StarRating value={toStars(review.nota)} size={14} />
            <span>{formatDecimal(review.nota)}/10</span>
          </span>
          <time className="review__date" dateTime={review.criado_em} title={new Date(review.criado_em).toLocaleString('pt-BR')}>
            {formatRelative(review.criado_em)}
          </time>
        </header>
        <p className="review__text">{review.comentario}</p>
      </div>
      {onDelete && (
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          aria-label={`Remover avaliação de ${review.nome}`}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
      )}
    </article>
  )
}

const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'maior_nota', label: 'Maior nota' },
  { value: 'menor_nota', label: 'Menor nota' },
  { value: 'antigas', label: 'Mais antigas' },
]

// Lista de avaliações do filme + formulário (só para o admin).
export function ReviewSection({ movieId, total }: { movieId: string; total: number }) {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ReviewSort>('recentes')
  const [toDelete, setToDelete] = useState<Review | null>(null)
  const reviews = useReviews(movieId, page, sort)
  const deleteReview = useDeleteReview(movieId)

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await deleteReview.mutateAsync(toDelete.id)
      toast.success('Avaliação removida.')
      setToDelete(null)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível remover.')
    }
  }

  return (
    <section className="section" id="avaliacoes" aria-labelledby="reviews-title">
      <h2 className="section__title" id="reviews-title">
        <span>Avaliações ({formatInteger(total)})</span>
        {total > 1 && (
          <select
            className="select"
            style={{ width: 'auto', minHeight: 32, textTransform: 'none', letterSpacing: 0 }}
            aria-label="Ordenar avaliações"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as ReviewSort)
              setPage(1)
            }}
          >
            {REVIEW_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </h2>

      {isAdmin ? (
        <ReviewForm movieId={movieId} />
      ) : (
        <p className="hint">
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Entre como administrador</Link>{' '}
          para adicionar avaliações.
        </p>
      )}

      {reviews.isPending ? (
        <LoadingState label="Carregando avaliações..." />
      ) : reviews.isError ? (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
      ) : reviews.data.items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={26} />}
          title="Nenhuma resenha ainda"
          description="As avaliações publicadas aparecem aqui."
        />
      ) : (
        <div className={reviews.isPlaceholderData ? 'is-fetching' : undefined}>
          <div className="review-list">
            {reviews.data.items.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                onDelete={isAdmin ? () => setToDelete(review) : undefined}
              />
            ))}
          </div>
          <Pagination page={reviews.data.page} pages={reviews.data.pages} onChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Remover avaliação?"
        description={
          toDelete && (
            <>
              A avaliação de <strong>{toDelete.nome}</strong> será removida e a média do filme,
              recalculada.
            </>
          )
        }
        busy={deleteReview.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </section>
  )
}
