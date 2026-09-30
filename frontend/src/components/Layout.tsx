// Estrutura de todas as páginas: fundo ambiente, cabeçalho com os menus,
// rodapé, busca rápida e a proteção das páginas que só o admin acessa.

import { useIsFetching } from '@tanstack/react-query'
import { ArrowUp, ChevronDown, LayoutDashboard, LogIn, LogOut, Plus, Search } from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigationType,
} from 'react-router'

import { useAuth } from '../auth'
import { prefersReducedMotion, revealRef, usePresence } from '../motion'
import { initials } from '../utils'
import { AmbientProvider } from './Ambient'
import { SearchPalette } from './SearchBar'
import { SpreadProvider } from './Spread'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

const NAV_LINKS = [
  { to: '/', label: 'Catálogo', end: true },
  { to: '/dashboard', label: 'Dashboard', end: false },
]

// Marca: um quadrado inclinado sobre o contorno tracejado (o mesmo efeito do
// hover dos cards).
function Brand() {
  return (
    <Link to="/" className="brand" aria-label="CineLab, página inicial">
      <span className="brand__mark" aria-hidden>
        <span className="brand__ghost" />
        <span className="brand__square" />
      </span>
      <span className="brand__name">
        Cine<em>lab</em>
      </span>
    </Link>
  )
}

// Linha fina embaixo do cabeçalho enquanto alguma requisição está em andamento.
function FetchBar() {
  const fetching = useIsFetching()
  return <div className={`fetchbar ${fetching ? 'fetchbar--on' : ''}`} aria-hidden />
}

// Links do topo com um traço que desliza até o link apontado pelo mouse e
// volta para a página atual quando o mouse sai.
function MainNav() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  const moveTo = (link: HTMLElement | null | undefined) => {
    const nav = navRef.current
    if (!nav) return
    if (!link) {
      nav.style.setProperty('--o', '0')
      return
    }
    nav.style.setProperty('--x', `${link.offsetLeft}px`)
    nav.style.setProperty('--w', `${link.offsetWidth}px`)
    nav.style.setProperty('--o', '1')
  }
  const backToCurrent = () =>
    moveTo(navRef.current?.querySelector<HTMLElement>('[aria-current="page"]'))

  useLayoutEffect(backToCurrent, [pathname])
  // a largura dos links muda quando a fonte termina de carregar
  useEffect(() => {
    void document.fonts?.ready.then(backToCurrent)
  }, [])

  return (
    <nav ref={navRef} className="nav" aria-label="Principal" onPointerLeave={backToCurrent}>
      {NAV_LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className="nav__link"
          onPointerEnter={(event) => moveTo(event.currentTarget)}
          onFocus={(event) => moveTo(event.currentTarget)}
          onBlur={backToCurrent}
        >
          {link.label}
        </NavLink>
      ))}
      <span className="nav__indicator" aria-hidden />
    </nav>
  )
}

// Menu do administrador: abre com animação, fecha ao clicar fora ou com Esc
// e dá para andar pelas opções com as setas.
function UserMenu({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const { mounted, closing } = usePresence(open, 180)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Escape') {
      setOpen(false)
      buttonRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const close = () => setOpen(false)

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="user-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-menu__avatar" aria-hidden>
          {initials(username)}
        </span>
        <span className="user-menu__name">{username}</span>
        <ChevronDown size={14} className="user-menu__chevron" aria-hidden />
      </button>
      {mounted && (
        <div
          className={`menu ${closing ? 'is-closing' : ''}`}
          role="menu"
          aria-label="Menu do administrador"
          onKeyDown={onMenuKeyDown}
        >
          <p className="menu__caption">
            Conectado como <strong>{username}</strong>
          </p>
          <Link role="menuitem" to="/filmes/novo" className="menu__item" onClick={close} style={{ '--i': 0 } as CSSProperties}>
            <Plus size={15} /> Cadastrar filme
          </Link>
          <Link role="menuitem" to="/dashboard" className="menu__item" onClick={close} style={{ '--i': 1 } as CSSProperties}>
            <LayoutDashboard size={15} /> Dashboard
          </Link>
          <span className="menu__rule" role="separator" />
          <button
            role="menuitem"
            type="button"
            className="menu__item menu__item--danger"
            style={{ '--i': 2 } as CSSProperties}
            onClick={() => {
              close()
              onLogout()
            }}
          >
            <LogOut size={15} /> Sair
          </button>
        </div>
      )}
    </div>
  )
}

// Celular: o menu cobre a tela com os links grandes entrando um por um.
function MobileMenu({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: () => void }) {
  const { isAdmin, logout } = useAuth()
  const { mounted, closing } = usePresence(open, 320)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden' // não rola a página por trás
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!mounted) return null
  const items: { key: string; node: ReactNode }[] = [
    { key: 'catalogo', node: <NavLink to="/" end onClick={onClose}>Catálogo</NavLink> },
    { key: 'dashboard', node: <NavLink to="/dashboard" onClick={onClose}>Dashboard</NavLink> },
    {
      key: 'busca',
      node: (
        <button type="button" onClick={() => { onClose(); onSearch() }}>
          Buscar
        </button>
      ),
    },
    ...(isAdmin
      ? [
          { key: 'novo', node: <NavLink to="/filmes/novo" onClick={onClose}>Cadastrar filme</NavLink> },
          {
            key: 'sair',
            node: (
              <button type="button" onClick={() => { onClose(); logout() }}>
                Sair
              </button>
            ),
          },
        ]
      : [{ key: 'entrar', node: <NavLink to="/login" onClick={onClose}>Entrar</NavLink> }]),
  ]

  return (
    <div className={`mobile-menu ${closing ? 'is-closing' : ''}`} id="menu-celular">
      <ul className="mobile-menu__list">
        {items.map((item, index) => (
          <li key={item.key} style={{ '--i': index } as CSSProperties}>
            <span className="mobile-menu__num">{String(index + 1).padStart(2, '0')}</span>
            {item.node}
          </li>
        ))}
      </ul>
      <p className="mobile-menu__foot">Atividade DEV · Visagio RocketLab 2026.2</p>
    </div>
  )
}

// Cabeçalho transparente no topo; ao rolar ganha fundo, e some ao descer a
// página (volta ao subir). O estado vai para o <html> para outras partes
// (a barra de seções da página do filme) acompanharem.
function useHeaderScroll() {
  const [state, setState] = useState({ scrolled: false, hidden: false })

  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const scrolled = y > 12
      // só conta a direção depois de uns pixels (rolagem lenta vai acumulando)
      let direction: 'up' | 'down' | null = null
      if (Math.abs(y - last) >= 8) {
        direction = y > last ? 'down' : 'up'
        last = y
      }
      setState((previous) => {
        const hidden =
          y < 240 ? false : direction === 'down' ? true : direction === 'up' ? false : previous.hidden
        return hidden === previous.hidden && scrolled === previous.scrolled
          ? previous
          : { scrolled, hidden }
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.header = state.hidden ? 'hidden' : 'shown'
  }, [state.hidden])

  return state
}

function Header({ onSearch }: { onSearch: () => void }) {
  const { isAdmin, username, logout } = useAuth()
  const location = useLocation()
  const { scrolled, hidden } = useHeaderScroll()
  const [menuOpen, setMenuOpen] = useState(false)

  // trocou de página: fecha o menu do celular
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setMenuOpen(false)
  }

  const classes = ['header', scrolled && 'is-scrolled', hidden && !menuOpen && 'is-hidden', menuOpen && 'is-menu-open']
  return (
    <header className={classes.filter(Boolean).join(' ')}>
      <div className="header__inner">
        <Brand />
        <MainNav />
        <div className="header__actions">
          <button type="button" className="search-trigger" onClick={onSearch} aria-label="Buscar (atalho: / ou Ctrl+K)">
            <Search size={15} aria-hidden />
            <span className="search-trigger__text">Buscar</span>
            <kbd>{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          {isAdmin && username ? (
            <UserMenu username={username} onLogout={logout} />
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
              className="header__login"
            >
              <LogIn size={15} aria-hidden />
              <span>Entrar</span>
            </Link>
          )}
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="menu-celular"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      <FetchBar />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onSearch={onSearch} />
    </header>
  )
}

function Footer() {
  const toTop = () =>
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Brand />
          <p>Sistema de avaliação de filmes feito para a Atividade DEV do Visagio RocketLab 2026.2.</p>
        </div>
        <nav className="footer__col" aria-label="Rodapé">
          <p className="footer__title">Navegar</p>
          <Link to="/">Catálogo</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/login">Área do administrador</Link>
        </nav>
        <div className="footer__col">
          <p className="footer__title">Feito com</p>
          <span>FastAPI · SQLite</span>
          <span>React · Vite · TypeScript</span>
        </div>
        <div className="footer__col">
          <p className="footer__title">Dados</p>
          <span>Filmes e imagens: TMDB</span>
          <span>(CSVs da atividade)</span>
        </div>
      </div>
      <div className="footer__mega" aria-hidden data-reveal="" ref={revealRef}>
        Cine<em>lab</em>
      </div>
      <div className="container footer__bottom">
        <span>© 2026 CineLab</span>
        <button type="button" className="footer__top" onClick={toTop}>
          Voltar ao topo <ArrowUp size={14} />
        </button>
      </div>
    </footer>
  )
}

// Posição da rolagem de cada página visitada. Ao voltar (botão voltar do
// navegador), a página reabre onde estava; ao abrir uma página nova, vai
// para o topo.
const scrollPositions = new Map<string, number>()

function useScrollMemory() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    const key = location.key
    let frame = 0
    const save = () => {
      frame = 0
      scrollPositions.set(key, window.scrollY)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [location.key])

  useLayoutEffect(() => {
    const saved = scrollPositions.get(location.key)
    const changedPage = lastPath.current !== location.pathname
    lastPath.current = location.pathname
    if (navigationType === 'POP' && saved != null) window.scrollTo(0, saved)
    else if (changedPage) window.scrollTo(0, 0)
  }, [location.key, location.pathname, navigationType])
}

export function AppLayout() {
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  useScrollMemory()

  // atalhos da busca rápida: Ctrl+K / ⌘K em qualquer lugar, "/" fora de campos
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      } else if (event.key === '/' && !typing) {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <AmbientProvider>
      <SpreadProvider>
        <div className="app">
          <a href="#conteudo" className="skip-link">
            Pular para o conteúdo
          </a>
          <Header onSearch={() => setPaletteOpen(true)} />
          <main id="conteudo" className="main">
            {/* key pelo caminho: a animação de entrada roda a cada página */}
            <div key={pathname} className="page">
              <Outlet />
            </div>
          </main>
          <Footer />
        </div>
        <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </SpreadProvider>
    </AmbientProvider>
  )
}

// Se não estiver logado, manda para o login e depois volta para a página.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  const location = useLocation()
  if (!isAdmin) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}
