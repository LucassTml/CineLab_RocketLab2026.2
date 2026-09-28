// Sessão do administrador.
// O token fica no localStorage para não perder o login ao recarregar a página.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { api, setAuthToken, UNAUTHORIZED_EVENT } from './api'

const STORAGE_KEY = 'cinelab:session'

interface Session {
  token: string
  username: string
  expiresAt: string
}

interface AuthContextValue {
  isAdmin: boolean
  username: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    // token vencido não vale
    return new Date(session.expiresAt).getTime() > Date.now() ? session : null
  } catch {
    return null
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // sem localStorage o login dura só até fechar a aba
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const initial = loadSession()
    setAuthToken(initial?.token ?? null)
    return initial
  })

  const logout = useCallback(() => {
    setAuthToken(null)
    saveSession(null)
    setSession(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login(username, password)
    const next = {
      token: response.access_token,
      username: response.username,
      expiresAt: response.expires_at,
    }
    setAuthToken(next.token)
    saveSession(next)
    setSession(next)
  }, [])

  // a API respondeu 401 (token inválido): sai da conta
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout)
  }, [logout])

  // sai sozinho quando o token vence com a aba aberta
  useEffect(() => {
    if (!session) return
    const remaining = new Date(session.expiresAt).getTime() - Date.now()
    const timer = window.setTimeout(logout, Math.max(0, remaining))
    return () => window.clearTimeout(timer)
  }, [session, logout])

  const value = useMemo(
    () => ({ isAdmin: Boolean(session), username: session?.username ?? null, login, logout }),
    [session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa estar dentro do <AuthProvider>')
  return context
}
