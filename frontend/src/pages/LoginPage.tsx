import { ArrowRight } from 'lucide-react'
import { type CSSProperties, type FormEvent, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '../api'
import { useAuth } from '../auth'
import { useAmbient } from '../components/Ambient'
import { Poster } from '../components/MovieCard'
import { useDocumentTitle, useFeatured } from '../hooks'
import type { MovieSummary } from '../types'

// só aceita voltar para uma página do próprio site
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

// Parede de pôsteres do lado esquerdo: 4 colunas rolando devagar, cada uma
// numa velocidade e as pares no sentido contrário. Cada coluna tem a lista
// repetida duas vezes para a animação emendar sem pulo.
function PosterWall({ movies }: { movies: MovieSummary[] }) {
  const withPoster = movies.filter((movie) => movie.url_poster)
  const columns = [0, 1, 2, 3].map((column) => withPoster.filter((_, index) => index % 4 === column))
  return (
    <div className="login__wall" aria-hidden>
      {columns.map((column, index) => (
        <div
          key={index}
          className="login__column"
          style={
            {
              '--speed': `${64 + index * 14}s`,
              '--direction': index % 2 ? 'reverse' : 'normal',
            } as CSSProperties
          }
        >
          {[...column, ...column].map((movie, position) => (
            <Poster key={`${movie.id}-${position}`} src={movie.url_poster} title={movie.titulo} size="w185" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function LoginPage() {
  useDocumentTitle('Entrar')
  useAmbient(null)
  const { isAdmin, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const featured = useFeatured()
  const next = safeNext(params.get('next'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (isAdmin) return <Navigate to={next} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError('Informe usuário e senha.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
      toast.success('Bem-vindo(a), administrador(a)!')
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login__art">
        {featured.data && <PosterWall movies={featured.data.items} />}
        <div className="login__caption">
          <span className="eyebrow">CineLab</span>
          <p>
            {featured.data
              ? `${featured.data.total.toLocaleString('pt-BR')} filmes no catálogo`
              : 'Catálogo e avaliações de filmes'}
          </p>
        </div>
      </div>

      <div className="login__panel">
        <form className="login__form" onSubmit={submit} noValidate>
          <p className="eyebrow" data-enter="">
            Acesso restrito
          </p>
          <h1 className="login__title" data-enter="" style={{ '--d': '80ms' } as CSSProperties}>
            Área do <em>administrador</em>
          </h1>
          <p className="muted" data-enter="" style={{ '--d': '160ms' } as CSSProperties}>
            Entre para cadastrar, editar e remover filmes e publicar avaliações.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="field" data-enter="" style={{ '--d': '220ms' } as CSSProperties}>
            <label className="field__label" htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
            />
          </div>
          <div className="field" data-enter="" style={{ '--d': '280ms' } as CSSProperties}>
            <label className="field__label" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn--light btn--block"
            disabled={busy}
            data-enter=""
            style={{ '--d': '340ms' } as CSSProperties}
          >
            {busy ? 'Entrando...' : 'Entrar'} <ArrowRight size={16} />
          </button>
          {import.meta.env.DEV && (
            <p className="hint">
              Ambiente de desenvolvimento: as credenciais ficam em <code>backend/.env</code>{' '}
              (<code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>).
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
