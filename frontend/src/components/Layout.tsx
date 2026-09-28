// Cabeçalho, rodapé e a proteção das páginas que só o admin acessa.

import { Clapperboard, LayoutDashboard, LogIn, LogOut, Moon, Plus, Sun } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'

import { useAuth } from '../auth'
import { useTheme } from '../hooks'

function Header() {
  const { isAdmin, username, logout } = useAuth()
  const [theme, toggleTheme] = useTheme()
  const location = useLocation()

  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="brand" aria-label="CineLab, página inicial">
          <img src="/favicon.svg" alt="" className="brand__logo" />
          <span className="brand__name">CineLab</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          <NavLink to="/" end className="nav__link">
            <Clapperboard size={18} />
            <span className="nav__text">Catálogo</span>
          </NavLink>
          <NavLink to="/dashboard" className="nav__link">
            <LayoutDashboard size={18} />
            <span className="nav__text">Dashboard</span>
          </NavLink>
        </nav>
        <div className="header__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {isAdmin ? (
            <>
              <Link to="/filmes/novo" className="btn btn--primary btn--sm">
                <Plus size={16} />
                <span className="btn__text">Novo filme</span>
              </Link>
              <span className="header__user">{username}</span>
              <button type="button" className="icon-btn" onClick={logout} aria-label="Sair" title="Sair">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link
              to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
              className="btn btn--sm"
            >
              <LogIn size={16} />
              <span className="btn__text">Entrar</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()

  // volta para o topo ao trocar de página
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app">
      <a href="#conteudo" className="sr-only">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer__inner">
          <span>Atividade DEV · Visagio RocketLab 2026.2</span>
          <span>Dados: TMDB (CSVs da atividade)</span>
        </div>
      </footer>
    </div>
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
