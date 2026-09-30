// Fundo "ambiente": uma camada fixa atrás de todas as páginas com a cor do
// filme em degradê e a imagem dele bem desfocada.
// Cada página diz o fundo que quer com useAmbient(cor, imagem, modo). Quando o
// pedido muda, uma camada nova aparece por cima da antiga com um fade longo e
// a antiga é removida no fim, então a cor "escorre" de uma página para outra.
// Modos: 'soft' = só um brilho no topo (catálogo), 'full' = a página inteira
// tingida (página do filme).

import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { prefersReducedMotion } from '../motion'

export type AmbientMode = 'soft' | 'full'

interface AmbientTarget {
  color: string
  image?: string | null
  mode?: AmbientMode
}

interface Layer {
  key: number
  color: string | null
  image: string | null
  mode: AmbientMode
  instant: boolean
  ready: boolean
}

interface AmbientApi {
  set: (target: AmbientTarget | null, options?: { instant?: boolean }) => void
}

const AmbientContext = createContext<AmbientApi | null>(null)

let nextKey = 1

export function AmbientProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>([])
  const current = useRef('none')

  const set = useCallback<AmbientApi['set']>((target, options) => {
    const signature = target
      ? `${target.color}|${target.image ?? ''}|${target.mode ?? 'full'}`
      : 'none'
    if (signature === current.current) return
    current.current = signature
    const instant = Boolean(options?.instant) || prefersReducedMotion()
    const layer: Layer = {
      key: nextKey++,
      color: target?.color ?? null,
      image: target?.image ?? null,
      mode: target?.mode ?? 'full',
      instant,
      ready: instant || !target?.image,
    }
    // no máximo 3 camadas ao mesmo tempo: a nova e as que ainda estão saindo
    setLayers((previous) => (instant ? [layer] : [...previous.slice(-2), layer]))
  }, [])

  const markReady = useCallback((key: number) => {
    setLayers((previous) =>
      previous.some((layer) => layer.key === key && !layer.ready)
        ? previous.map((layer) => (layer.key === key ? { ...layer, ready: true } : layer))
        : previous,
    )
  }, [])

  // a camada nova terminou de aparecer: as de baixo já não aparecem
  const settle = useCallback((key: number) => {
    setLayers((previous) =>
      previous.some((layer) => layer.key < key)
        ? previous.filter((layer) => layer.key >= key)
        : previous,
    )
  }, [])

  const api = useMemo(() => ({ set }), [set])

  return (
    <AmbientContext.Provider value={api}>
      <div className="ambient" aria-hidden>
        {layers.map((layer) => (
          <AmbientLayer key={layer.key} layer={layer} onReady={markReady} onSettled={settle} />
        ))}
      </div>
      {children}
    </AmbientContext.Provider>
  )
}

interface AmbientLayerProps {
  layer: Layer
  onReady: (key: number) => void
  onSettled: (key: number) => void
}

function AmbientLayer({ layer, onReady, onSettled }: AmbientLayerProps) {
  const [loaded, setLoaded] = useState(false)

  // Espera a imagem carregar para o fade já sair com ela. Se demorar, entra
  // só a cor e a imagem aparece sozinha quando chegar.
  useEffect(() => {
    if (layer.ready) return
    const timer = window.setTimeout(() => onReady(layer.key), 700)
    return () => window.clearTimeout(timer)
  }, [layer.ready, layer.key, onReady])

  const state = layer.instant ? 'is-instant' : layer.ready ? 'is-in' : ''
  return (
    <div
      className={`ambient__layer ambient__layer--${layer.color ? layer.mode : 'none'} ${state}`}
      style={layer.color ? ({ '--c': layer.color } as CSSProperties) : undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onSettled(layer.key)
      }}
    >
      {layer.image && (
        <img
          className={`ambient__image ${loaded ? 'is-loaded' : ''}`}
          src={layer.image}
          alt=""
          decoding="async"
          onLoad={() => {
            setLoaded(true)
            onReady(layer.key)
          }}
          onError={() => onReady(layer.key)}
        />
      )}
      <div className="ambient__wash" />
    </div>
  )
}

// color: undefined = ainda calculando (mantém o fundo atual); null = fundo neutro
// eslint-disable-next-line react-refresh/only-export-components
export function useAmbient(
  color: string | null | undefined,
  image: string | null = null,
  mode: AmbientMode = 'full',
): void {
  const api = useContext(AmbientContext)
  useEffect(() => {
    if (color === undefined) return
    api?.set(color ? { color, image, mode } : null)
  }, [api, color, image, mode])
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAmbientApi(): AmbientApi | null {
  return useContext(AmbientContext)
}
