// Estrelas: StarRating só mostra a nota, StarRatingInput é o campo do formulário.

import { Star } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'

import { formatDecimal } from '../utils'

// Mostra a nota com preenchimento parcial (ex.: 3,65 estrelas).
// São 5 estrelas cinzas e, por cima, 5 douradas cortadas na largura da nota.
export function StarRating({ value, size = 16 }: { value: number | null; size?: number }) {
  const percent = value == null ? 0 : Math.max(0, Math.min(100, (value / 5) * 100))
  const stars = Array.from({ length: 5 }, (_, i) => (
    <Star key={i} size={size} fill="currentColor" strokeWidth={0} aria-hidden />
  ))
  const label = value == null ? 'Sem avaliações' : `${formatDecimal(value)} de 5 estrelas`

  return (
    <span className="stars" role="img" aria-label={label} title={label}>
      {stars}
      <span className="stars__fill" style={{ width: `${percent}%` }} data-testid="stars-fill">
        {stars}
      </span>
    </span>
  )
}

const LABELS: Record<number, string> = {
  0.5: 'Péssimo',
  1: 'Muito ruim',
  1.5: 'Ruim',
  2: 'Fraco',
  2.5: 'Mediano',
  3: 'Bom',
  3.5: 'Muito bom',
  4: 'Ótimo',
  4.5: 'Excelente',
  5: 'Obra-prima',
}

interface StarRatingInputProps {
  value: number | null
  onChange: (stars: number) => void
  invalid?: boolean
}

// Nota de 0,5 a 5 com meias estrelas (cada estrela tem 2 metades clicáveis).
// No teclado funciona como um slider: setas mudam de 0,5 em 0,5.
export function StarRatingInput({ value, onChange, invalid }: StarRatingInputProps) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = value ?? 0
    const keys: Record<string, number> = {
      ArrowRight: current + 0.5,
      ArrowUp: current + 0.5,
      ArrowLeft: current - 0.5,
      ArrowDown: current - 0.5,
      Home: 0.5,
      End: 5,
    }
    if (event.key in keys) {
      event.preventDefault()
      onChange(Math.min(5, Math.max(0.5, keys[event.key])))
    }
  }

  return (
    <div className="star-input">
      <div
        className="star-input__stars"
        role="slider"
        tabIndex={0}
        aria-label="Nota em estrelas"
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value ? `${formatDecimal(value)} estrelas, ${LABELS[value]}` : 'Sem nota'}
        aria-invalid={invalid || undefined}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, shown - (star - 1)))
          return (
            <span key={star} className="star-input__star">
              <Star fill="currentColor" strokeWidth={0} aria-hidden />
              <span className="star-input__fill" style={{ width: `${fill * 100}%` }}>
                <Star fill="currentColor" strokeWidth={0} aria-hidden />
              </span>
              {[star - 0.5, star].map((half) => (
                <button
                  key={half}
                  type="button"
                  tabIndex={-1}
                  className={`star-input__half star-input__half--${half % 1 ? 'left' : 'right'}`}
                  aria-label={`${formatDecimal(half)} estrelas`}
                  onMouseEnter={() => setHover(half)}
                  onClick={() => onChange(half)}
                />
              ))}
            </span>
          )
        })}
      </div>
      <span className="star-input__value" aria-hidden>
        {shown ? `${formatDecimal(shown)} · ${LABELS[shown]}` : 'Clique para avaliar'}
      </span>
    </div>
  )
}
