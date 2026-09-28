import { ArrowLeft } from 'lucide-react'
import { lazy, type ReactNode, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router'

import { EmptyState, LoadingState } from './components/Feedback'
import { AppLayout, RequireAdmin } from './components/Layout'
import { CatalogPage } from './pages/CatalogPage'

// As outras páginas carregam só quando acessadas (lazy), assim a página
// inicial fica mais leve (o formulário e o dashboard vêm depois).
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const MovieDetailPage = lazy(() =>
  import('./pages/MovieDetailPage').then((m) => ({ default: m.MovieDetailPage })),
)
const MovieCreatePage = lazy(() =>
  import('./pages/MovieFormPage').then((m) => ({ default: m.MovieCreatePage })),
)
const MovieEditPage = lazy(() =>
  import('./pages/MovieFormPage').then((m) => ({ default: m.MovieEditPage })),
)

const page = (element: ReactNode) => <Suspense fallback={<LoadingState />}>{element}</Suspense>

function NotFoundPage() {
  return (
    <div className="container">
      <EmptyState
        title="Página não encontrada"
        description="O endereço acessado não existe."
        action={
          <Link to="/" className="btn">
            <ArrowLeft size={16} /> Ir para o catálogo
          </Link>
        }
      />
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<CatalogPage />} />
        <Route path="dashboard" element={page(<DashboardPage />)} />
        <Route path="login" element={page(<LoginPage />)} />
        <Route
          path="filmes/novo"
          element={<RequireAdmin>{page(<MovieCreatePage />)}</RequireAdmin>}
        />
        <Route path="filmes/:id" element={page(<MovieDetailPage />)} />
        <Route
          path="filmes/:id/editar"
          element={<RequireAdmin>{page(<MovieEditPage />)}</RequireAdmin>}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
