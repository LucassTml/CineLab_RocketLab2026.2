// Animações ligadas à rolagem e ao tempo, sem biblioteca:
// - revealRef: o elemento entra com animação quando aparece na tela
// - useInView: avisa quando um elemento apareceu (gráficos e contadores)
// - useCountUp: número que "conta" até o valor
// - useScrollProgress: quanto já rolou de um elemento (parallax do topo)
// - useScroller: setas das fileiras com rolagem horizontal
// - usePresence: mantém um menu na tela enquanto ele anima a saída
// Quem ativou "reduzir movimento" no sistema vê tudo pronto, sem animação.

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  )
}

// Um IntersectionObserver só para o site inteiro. Quando um elemento com
// data-reveal aparece, ganha o atributo data-in e o CSS faz a animação.
// (atributo e não classe: o React reescreve o className quando renderiza)
let revealObserver: IntersectionObserver | null | undefined

function getRevealObserver(): IntersectionObserver | null {
  if (revealObserver !== undefined) return revealObserver
  if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
    revealObserver = null
    return null
  }
  revealObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.setAttribute('data-in', '')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.04 },
  )
  return revealObserver
}

// usado como ref: <div data-reveal ref={revealRef}>
export function revealRef(element: Element | null): void | (() => void) {
  if (!element) return
  const observer = getRevealObserver()
  if (!observer) {
    element.setAttribute('data-in', '') // testes (jsdom) e movimento reduzido
    return
  }
  observer.observe(element)
  return () => observer.unobserve(element)
}

export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  // sem IntersectionObserver (testes) já começa visível
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (!element || inView) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [inView])

  return [ref, inView]
}

// Conta de 0 até value (desacelerando no fim) quando active vira true.
export function useCountUp(value: number, active: boolean, duration = 1100): number {
  const [shown, setShown] = useState(0)
  const reduce = prefersReducedMotion()

  useEffect(() => {
    if (!active || reduce) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setShown(value * (1 - (1 - progress) ** 4))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    // aba escondida pausa o requestAnimationFrame: garante o valor final
    const safety = window.setTimeout(() => setShown(value), duration + 150)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(safety)
    }
  }, [value, active, duration, reduce])

  return reduce ? value : shown
}

// Escreve --p (0 a 1) no elemento conforme a página rola por cima dele.
// O CSS usa o valor para mover a imagem mais devagar que o texto (parallax).
export function useScrollProgress(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion()) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)))
      element.style.setProperty('--p', progress.toFixed(4))
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
  }, [ref])
}

// Fileira com rolagem horizontal: diz se dá para ir para os lados e rola
// quase uma "tela" por clique nas setas.
export function useScroller<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const update = useCallback(() => {
    const element = ref.current
    if (!element) return
    const start = element.scrollLeft <= 4
    const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 4
    setEdges((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    )
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => {
      element.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [update])

  const scrollBy = (direction: 1 | -1) => {
    const element = ref.current
    element?.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  return { ref, canPrev: !edges.start, canNext: !edges.end, scrollBy }
}

// Menus: continuam montados por exitMs depois de fechar, com closing = true,
// para o CSS animar a saída.
export function usePresence(open: boolean, exitMs = 200): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  if (open && (!mounted || closing)) {
    setMounted(true)
    setClosing(false)
  }
  if (!open && mounted && !closing) setClosing(true)

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(
      () => {
        setMounted(false)
        setClosing(false)
      },
      prefersReducedMotion() ? 0 : exitMs,
    )
    return () => window.clearTimeout(timer)
  }, [closing, exitMs])

  return { mounted, closing }
}
