// Transição ao abrir um filme.
// 1. A cor do pôster (ver color.ts) se espalha a partir do card até cobrir a
//    tela, enquanto o pôster cresce, endireita e desfoca por cima dela.
// 2. O título aparece no meio, como a cartela de abertura de um filme.
// 3. Com a tela coberta, o site troca para a página do filme (os dados já
//    começaram a ser buscados no clique) e o fundo ambiente recebe a mesma cor
//    e a mesma imagem.
// 4. Quando a página avisa que está pronta (useSpreadReady), a cobertura some
//    num fade e revela a página, que já tem o mesmo fundo por trás.
// As animações usam a Web Animations API (element.animate), que devolve uma
// promessa quando termina, então a sequência fica fácil de encadear.
// Com "reduzir movimento" ligado nada disso acontece: só troca de página.

import { useQueryClient } from '@tanstack/react-query'
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate } from 'react-router'

import { api } from '../api'
import { hashColor, movieTint, peekTint } from '../color'
import { queryKeys } from '../hooks'
import { prefersReducedMotion } from '../motion'
import { resizeTmdbImage } from '../utils'
import { useAmbientApi } from './Ambient'

export interface SpreadMovie {
  id: string
  titulo: string
  url_poster: string | null
  url_backdrop?: string | null
  ano_lancamento?: number | null
}

interface Box {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
}

interface Overlay {
  movie: SpreadMovie
  color: string
  image: string | null
  box: Box
}

interface SpreadApi {
  prime: (movie: SpreadMovie) => void
  prefetch: (movie: SpreadMovie) => void
  open: (movie: SpreadMovie, source?: Element | null, image?: string | null) => void
  ready: (movieId: string) => void
}

const SpreadContext = createContext<SpreadApi | null>(null)

const EXPAND_MS = 820
const MIN_COVER_MS = 280 // tempo mínimo com o título na tela
const MAX_WAIT_MS = 1600 // página demorando: revela assim mesmo (ela mostra o "carregando")
const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)'
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

const loadDetailPage = () => import('../pages/MovieDetailPage')
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

// Chama fn quando a animação terminar. O timer é uma garantia: com a aba em
// segundo plano o navegador para de desenhar os quadros e a promessa
// "finished" só resolveria quando a pessoa voltasse para a aba.
function afterAnimation(animation: Animation | undefined, fn: () => void, ms: number) {
  let done = false
  const run = () => {
    if (done) return
    done = true
    fn()
  }
  if (!animation) {
    run()
    return
  }
  animation.finished.then(run, run)
  window.setTimeout(run, ms + 150)
}

// imagem que ainda não está na tela (o topo da página do filme)
function preload(url: string | null) {
  if (!url) return
  const image = new Image()
  image.src = url
}

// Centro, tamanho real (sem a rotação do hover) e ângulo do elemento, somando
// as rotações dos elementos acima dele (o card inclinado).
function measure(element: Element): Box {
  const rect = element.getBoundingClientRect()
  const html = element as HTMLElement
  let angle = 0
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    const transform = getComputedStyle(node).transform
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(transform)
      angle += (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
    }
  }
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    w: html.offsetWidth || rect.width,
    h: html.offsetHeight || rect.height,
    angle,
  }
}

type Stage = 'idle' | 'opening' | 'covering' | 'revealing'

export function SpreadProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ambient = useAmbientApi()
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage>('idle')
  const target = useRef<string | null>(null)
  const coveredAt = useRef(0)
  const revealTimer = useRef(0)
  // o navigate muda a cada troca de página; guardo o último num ref para as
  // funções abaixo não mudarem (e não re-renderizarem todos os cards)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  // hover: calcula a cor e baixa o código da página do filme
  const prime = useCallback((movie: SpreadMovie) => {
    void movieTint(movie)
    void loadDetailPage()
  }, [])

  // botão do mouse apertado (o clique vem logo depois): já busca os dados
  const prefetch = useCallback(
    (movie: SpreadMovie) => {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.movie(movie.id),
        queryFn: ({ signal }) => api.getMovie(movie.id, signal),
      })
      preload(resizeTmdbImage(movie.url_backdrop, 'w1280'))
    },
    [queryClient],
  )

  const finish = useCallback(() => {
    setOverlay(null)
    stage.current = 'idle'
    target.current = null
  }, [])

  const reveal = useCallback(() => {
    if (stage.current !== 'covering') return
    stage.current = 'revealing'
    window.clearTimeout(revealTimer.current)
    // libera as animações de entrada da página (ficam pausadas enquanto cobre)
    delete document.documentElement.dataset.spread
    titleRef.current?.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-18px)' },
      ],
      { duration: 420, easing: 'ease-in', fill: 'forwards' },
    )
    const fade = rootRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 760,
      delay: 140,
      easing: 'ease-out',
      fill: 'forwards',
    })
    afterAnimation(fade, finish, 900)
  }, [finish])

  const ready = useCallback(
    (movieId: string) => {
      if (stage.current !== 'covering' || target.current !== movieId) return
      const elapsed = performance.now() - coveredAt.current
      window.clearTimeout(revealTimer.current)
      revealTimer.current = window.setTimeout(reveal, Math.max(0, MIN_COVER_MS - elapsed))
    },
    [reveal],
  )

  const open = useCallback(
    (movie: SpreadMovie, source?: Element | null, image?: string | null) => {
      if (stage.current !== 'idle') return // já tem uma transição rodando (clique duplo)
      prefetch(movie)
      if (!source || prefersReducedMotion()) {
        navigateRef.current(`/filmes/${movie.id}`)
        return
      }
      stage.current = 'opening'
      target.current = movie.id
      const box = measure(source) // mede já: o elemento pode sumir (busca fechando)
      void loadDetailPage()
      // normalmente a cor já foi calculada no hover; senão espera no máximo 150 ms
      void Promise.race([
        movieTint(movie),
        wait(150).then(() => peekTint(movie) ?? hashColor(movie.titulo)),
      ]).then((color) => {
        setOverlay({ movie, color, box, image: image ?? resizeTmdbImage(movie.url_poster, 'w342') })
      })
    },
    [prefetch],
  )

  // Abre a cobertura: roda antes da tela ser pintada (useLayoutEffect), então
  // o primeiro quadro já sai do tamanho do card.
  useLayoutEffect(() => {
    if (!overlay || stage.current !== 'opening') return
    const { box, movie } = overlay
    const vw = window.innerWidth
    const vh = window.innerHeight
    const options: KeyframeAnimationOptions = { duration: EXPAND_MS, easing: EASE, fill: 'forwards' }

    const fill = fillRef.current?.animate(
      [{ clipPath: startClip(box) }, { clipPath: 'inset(0px 0px 0px 0px)' }],
      options,
    )
    const scale = Math.max(vw / box.w, vh / box.h) * 1.1
    imageRef.current?.animate(
      [
        { transform: `translate(0px, 0px) rotate(${box.angle}deg) scale(1)`, filter: 'blur(0px)', opacity: 1 },
        {
          transform: `translate(${vw / 2 - box.cx}px, ${vh / 2 - box.cy}px) rotate(0deg) scale(${scale})`,
          filter: 'blur(10px)',
          opacity: 0.42,
        },
      ],
      options,
    )
    titleRef.current?.animate(
      [
        { opacity: 0, transform: 'translateY(22px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 700, delay: EXPAND_MS * 0.5, easing: EASE_OUT, fill: 'both' },
    )

    const covered = () => {
      stage.current = 'covering'
      coveredAt.current = performance.now()
      document.documentElement.dataset.spread = 'covering'
      ambient?.set(
        { color: overlay.color, image: resizeTmdbImage(movie.url_poster, 'w342'), mode: 'full' },
        { instant: true },
      )
      navigateRef.current(`/filmes/${movie.id}`)
      revealTimer.current = window.setTimeout(reveal, MAX_WAIT_MS)
    }
    afterAnimation(fill, covered, EXPAND_MS)
  }, [overlay, ambient, reveal])

  const value = useMemo(() => ({ prime, prefetch, open, ready }), [prime, prefetch, open, ready])

  return (
    <SpreadContext.Provider value={value}>
      {children}
      {overlay && (
        <div className="spread" ref={rootRef} aria-hidden>
          <div
            ref={fillRef}
            className="spread__fill"
            style={{ '--c': overlay.color, clipPath: startClip(overlay.box) } as CSSProperties}
          />
          {overlay.image && (
            <img
              ref={imageRef}
              className="spread__image"
              src={overlay.image}
              alt=""
              style={{
                left: overlay.box.cx - overlay.box.w / 2,
                top: overlay.box.cy - overlay.box.h / 2,
                width: overlay.box.w,
                height: overlay.box.h,
                transform: `rotate(${overlay.box.angle}deg)`,
              }}
            />
          )}
          <div ref={titleRef} className="spread__title">
            {overlay.movie.ano_lancamento != null && (
              <span className="spread__year">{overlay.movie.ano_lancamento}</span>
            )}
            <span className="spread__name">{overlay.movie.titulo}</span>
            <span className="spread__line" />
          </div>
        </div>
      )}
    </SpreadContext.Provider>
  )
}

// recorte inicial da cor: exatamente o retângulo do pôster clicado
function startClip(box: Box): string {
  const left = box.cx - box.w / 2
  const top = box.cy - box.h / 2
  const right = window.innerWidth - left - box.w
  const bottom = window.innerHeight - top - box.h
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`
}

type MovieLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & {
  movie: SpreadMovie
  image?: string | null // imagem que cresce na transição (padrão: o pôster)
  spreadFrom?: RefObject<Element | null> // de onde a cor sai, se não for o pôster do link
}

// Link para a página do filme com a transição. O elemento marcado com
// data-spread dentro dele (o pôster) é de onde a cor sai. Ctrl/Cmd + clique,
// botão do meio etc. continuam abrindo em outra aba normalmente.
// Fora do SpreadProvider (nos testes) funciona como um Link comum.
export function MovieLink({ movie, image, spreadFrom, ...rest }: MovieLinkProps) {
  const spread = useContext(SpreadContext)

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!spread || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    const source =
      spreadFrom?.current ?? event.currentTarget.querySelector('[data-spread]') ?? event.currentTarget
    spread.open(movie, source, image)
  }

  return (
    <Link
      {...rest}
      to={`/filmes/${movie.id}`}
      onPointerEnter={() => spread?.prime(movie)}
      onFocus={() => spread?.prime(movie)}
      onPointerDown={() => spread?.prefetch(movie)}
      onClick={onClick}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpread(): SpreadApi | null {
  return useContext(SpreadContext)
}

// A página do filme chama quando terminou de carregar (libera a revelação).
// eslint-disable-next-line react-refresh/only-export-components
export function useSpreadReady(movieId: string, ready: boolean): void {
  const spread = useContext(SpreadContext)
  useEffect(() => {
    if (ready) spread?.ready(movieId)
  }, [spread, movieId, ready])
}
