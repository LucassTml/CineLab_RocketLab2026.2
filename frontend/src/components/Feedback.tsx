// Estados de tela (vazio, erro, carregando) e o diálogo de confirmação.

import { RotateCcw, SearchX, TriangleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

import { ApiError } from '../api'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="state">
      <div className="state__icon">{icon ?? <SearchX size={22} strokeWidth={1.5} />}</div>
      <p className="state__title">{title}</p>
      {description && <p className="state__text">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Algo deu errado ao carregar.'
  return (
    <div className="state" role="alert">
      <div className="state__icon">
        <TriangleAlert size={22} strokeWidth={1.5} />
      </div>
      <p className="state__title">Não foi possível carregar</p>
      <p className="state__text">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          <RotateCcw size={15} /> Tentar de novo
        </button>
      )}
    </div>
  )
}

// Uma linha fina com um traço correndo (no lugar do spinner redondo).
export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status">
      <span className="loader" aria-hidden />
      <p className="state__text">{label}</p>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Usa o <dialog> nativo do HTML (já prende o foco e fecha com Esc).
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Remover',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || typeof dialog.showModal !== 'function') return // jsdom (testes) não tem showModal
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      {open && (
        <>
          <div className="dialog__body">
            <div className="dialog__icon">
              <TriangleAlert size={20} strokeWidth={1.6} />
            </div>
            <h2 id="confirm-title" className="dialog__title">
              {title}
            </h2>
            <div className="dialog__text">{description}</div>
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="btn btn--danger" onClick={onConfirm} disabled={busy}>
              {busy ? 'Removendo...' : confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
