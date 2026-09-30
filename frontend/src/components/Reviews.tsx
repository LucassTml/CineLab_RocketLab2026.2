// Tudo de avaliações na página do filme: painel com a média e o histograma,
// formulário (admin) e a lista de resenhas.

import { zodResolver } from '@hookform/resolvers/zod'
import { MessageSquare, Send, Star, Trash2 } from 'lucide-react'
import { type CSSProperties, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '../api'
import { useAuth } from '../auth'
import { useAddReview, useDeleteReview, useReviews } from '../hooks'
import { revealRef, useCountUp, useInView } from '../motion'
import type { Performance, RatingSummary, Review, ReviewSort } from '../types'
import {
  formatDecimal,
  formatInteger,
  formatRelative,
  initials,
  starsToNota,
  toStars,
} from '../utils'
import { MAX_COMMENT, type ReviewFormValues, reviewSchema } from '../validation'
import { Dropdown } from './Dropdown'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from './Feedback'
import { Pagination } from './Pagination'
import { StarRating, StarRatingInput } from './Stars'

interface RatingPanelProps {
  summary: RatingSummary
  performance: Performance | null
}

// Média do filme + histograma (10 barras, uma por meia estrela). As barras
// crescem quando o painel aparece na tela; o valor de cada uma fica no tooltip.
export function RatingPanel({ summary, performance }: RatingPanelProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const stars = toStars(summary.media) ?? 0
  const shown = useCountUp(stars, inView, 1300)
  const max = Math.max(...summary.distribuicao.map((bucket) => bucket.total), 0)
  const hasRatings = summary.total > 0
  const bases = [
    { name: 'TMDB', value: performance?.nota_tmdb, votes: performance?.qtd_tmdb },
    { name: 'IMDb', value: performance?.nota_imdb, votes: performance?.qtd_imdb },
  ].filter((base) => base.value != null)

  return (
    <div className="rating-panel" ref={ref} data-shown={inView || undefined}>
      <p className="section-label">Nota do público</p>
      {hasRatings ? (
        <>
          <div className="rating-panel__score">
            <span className="rating-panel__value">{formatDecimal(shown)}</span>
            <span className="rating-panel__max">/ 5</span>
          </div>
          <StarRating value={toStars(summary.media)} size={18} />
          <p className="rating-panel__count">
            {formatDecimal(summary.media)}/10 · {formatInteger(summary.total)}{' '}
            {summary.total === 1 ? 'avaliação' : 'avaliações'}
          </p>
          <div>
            <div className="histogram" role="list" aria-label="Distribuição das notas">
              {summary.distribuicao.map((bucket, index) => {
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
                    className={`histogram__bar hit ${bucket.total ? 'is-filled' : ''}`}
                    style={
                      {
                        '--h': max ? Math.max(0.04, bucket.total / max) : 0.04,
                        '--i': index,
                      } as CSSProperties
                    }
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
        <p className="rating-panel__empty">Ainda sem avaliações. A primeira pode ser a sua.</p>
      )}

      {bases.length > 0 && (
        <div className="bases">
          <p className="section-label">Outras bases</p>
          {bases.map((base, index) => (
            <div key={base.name} className="base" style={{ '--v': (base.value ?? 0) / 10, '--i': index } as CSSProperties}>
              <div className="base__head">
                <strong>{base.name}</strong>
                <span>
                  {formatDecimal(base.value)}
                  <small>/10</small>
                </span>
              </div>
              <span className="base__track" aria-hidden>
                <span className="base__fill" />
              </span>
              <span className="base__votes">{formatInteger(base.votes)} votos</span>
            </div>
          ))}
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
    <form className="review-form" onSubmit={onSubmit} noValidate>
      <p className="review-form__title">Sua avaliação</p>
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
      <div className="review-form__actions">
        <button type="submit" className="btn btn--tint" disabled={addReview.isPending}>
          <Send size={15} /> {addReview.isPending ? 'Publicando...' : 'Publicar avaliação'}
        </button>
      </div>
    </form>
  )
}

function ReviewItem({ review, index, onDelete }: { review: Review; index: number; onDelete?: () => void }) {
  return (
    <article className="review" data-reveal="" ref={revealRef} style={{ '--i': index } as CSSProperties}>
      <div className="review__avatar" aria-hidden>
        {initials(review.nome)}
      </div>
      <div className="review__main">
        <header className="review__header">
          <span className="review__name">{review.nome}</span>
          <span className="review__rating">
            <StarRating value={toStars(review.nota)} size={13} />
            <span>{formatDecimal(review.nota)}/10</span>
          </span>
          <time
            className="review__date"
            dateTime={review.criado_em}
            title={new Date(review.criado_em).toLocaleString('pt-BR')}
          >
            {formatRelative(review.criado_em)}
          </time>
        </header>
        <p className="review__text">{review.comentario}</p>
      </div>
      {onDelete && (
        <button
          type="button"
          className="icon-btn icon-btn--danger review__delete"
          aria-label={`Remover avaliação de ${review.nome}`}
          onClick={onDelete}
        >
          <Trash2 size={15} />
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
    <section className="detail-section" id="avaliacoes" aria-labelledby="reviews-title">
      <div className="detail-section__head">
        <h2 className="section-label" id="reviews-title">
          Avaliações <span className="section-label__count">{formatInteger(total)}</span>
        </h2>
        {total > 1 && (
          <Dropdown
            label="Ordenar"
            value={sort}
            options={REVIEW_SORTS}
            align="end"
            onChange={(value) => {
              setSort(value)
              setPage(1)
            }}
          />
        )}
      </div>

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
          icon={<MessageSquare size={22} strokeWidth={1.5} />}
          title="Nenhuma resenha ainda"
          description="As avaliações publicadas aparecem aqui."
        />
      ) : (
        <div className={reviews.isPlaceholderData ? 'is-fetching' : undefined}>
          <div className="review-list">
            {reviews.data.items.map((review, index) => (
              <ReviewItem
                key={review.id}
                review={review}
                index={index}
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
