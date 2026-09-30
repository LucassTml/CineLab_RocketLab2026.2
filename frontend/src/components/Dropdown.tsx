// Menu de seleção usado na ordenação (no lugar do <select> nativo, que não dá
// para estilizar aberto). Segue o padrão "listbox" da WAI-ARIA: o botão abre a
// lista, as setas movem o destaque, Enter escolhe e Esc fecha. O destaque é um
// retângulo que desliza até a opção apontada.

import { Check, ChevronDown } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'

import { usePresence } from '../motion'

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

interface DropdownProps<T extends string> {
  label: string
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  align?: 'start' | 'end'
}

export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  align = 'start',
}: DropdownProps<T>) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const { mounted, closing } = usePresence(open, 160)
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const show = () => {
    setActive(selected)
    setOpen(true)
  }
  const close = (focusButton = true) => {
    setOpen(false)
    if (focusButton) buttonRef.current?.focus()
  }
  const choose = (index: number) => {
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
    close()
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className={`dropdown dropdown--${align}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="dropdown__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            show()
          }
        }}
      >
        <span className="dropdown__label">{label}</span>
        <span className="dropdown__value">{options[selected]?.label}</span>
        <ChevronDown size={14} className="dropdown__chevron" aria-hidden />
      </button>
      {mounted && (
        <ul
          ref={listRef}
          id={id}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          className={`dropdown__menu ${closing ? 'is-closing' : ''}`}
          style={{ '--active': active } as CSSProperties}
          onKeyDown={onListKeyDown}
        >
          <li className="dropdown__highlight" role="presentation" aria-hidden />
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === selected}
              className={`dropdown__option ${index === active ? 'is-active' : ''}`}
              style={{ '--i': index } as CSSProperties}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {index === selected && <Check size={14} aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
