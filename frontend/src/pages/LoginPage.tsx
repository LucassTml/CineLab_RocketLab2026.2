import { LogIn } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '../api'
import { useAuth } from '../auth'
import { useDocumentTitle } from '../hooks'

// só aceita voltar para uma página do próprio site
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function LoginPage() {
  useDocumentTitle('Entrar')
  const { isAdmin, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
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
    <div className="container">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <div>
          <h1 className="page-title">Área do administrador</h1>
          <p className="page-subtitle">
            Entre para cadastrar, editar e remover filmes e publicar avaliações.
          </p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="field">
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
        <div className="field">
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
        <button type="submit" className="btn btn--primary" disabled={busy}>
          <LogIn size={16} /> {busy ? 'Entrando...' : 'Entrar'}
        </button>
        {import.meta.env.DEV && (
          <p className="hint">
            Ambiente de desenvolvimento: as credenciais ficam em <code>backend/.env</code>{' '}
            (<code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>).
          </p>
        )}
      </form>
    </div>
  )
}
