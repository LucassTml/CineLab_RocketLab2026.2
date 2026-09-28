// Estados de tela (vazio, erro, carregando) e o diálogo de confirmação.

import { LoaderCircle, RotateCcw, SearchX, TriangleAlert } from 'lucide-react'
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
      <div className="state__icon">{icon ?? <SearchX size={26} />}</div>
      <p className="state__title">{title}</p>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Algo deu errado ao carregar.'
  return (
    <div className="state" role="alert">
      <div className="state__icon">
        <TriangleAlert size={26} />
      </div>
      <p className="state__title">Não foi possível carregar</p>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          <RotateCcw size={16} /> Tentar de novo
        </button>
      )}
    </div>
  )
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <LoaderCircle size={28} className="spinner" aria-hidden />
      <p>{label}</p>
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

// Usa o <dialog> nativo do HTML (já trava o foco e fecha com Esc).
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
              <TriangleAlert size={22} />
            </div>
            <h2 id="confirm-title" className="state__title">
              {title}
            </h2>
            <div className="muted">{description}</div>
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
