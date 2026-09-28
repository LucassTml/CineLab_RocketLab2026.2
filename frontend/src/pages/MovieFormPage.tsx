import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { ErrorState, LoadingState } from '../components/Feedback'
import { MovieForm } from '../components/MovieForm'
import { useCreateMovie, useDocumentTitle, useMovie, useUpdateMovie } from '../hooks'
import type { MoviePayload } from '../types'

export function MovieCreatePage() {
  const navigate = useNavigate()
  const createMovie = useCreateMovie()
  useDocumentTitle('Novo filme')

  const handleSubmit = async (payload: MoviePayload) => {
    const movie = await createMovie.mutateAsync(payload)
    toast.success(`“${movie.titulo}” foi adicionado ao catálogo.`)
    navigate(`/filmes/${movie.id}`)
  }

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Cadastrar filme</h1>
          <p className="page-subtitle">Campos com * são obrigatórios.</p>
        </div>
      </header>
      <MovieForm submitLabel="Cadastrar filme" cancelTo="/" onSubmit={handleSubmit} />
    </div>
  )
}

export function MovieEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const movie = useMovie(id)
  const updateMovie = useUpdateMovie(id)
  useDocumentTitle(movie.data ? `Editar ${movie.data.titulo}` : 'Editar filme')

  if (movie.isPending) return <LoadingState />
  if (movie.isError) {
    return (
      <div className="container">
        <ErrorState error={movie.error} onRetry={() => void movie.refetch()} />
      </div>
    )
  }

  const handleSubmit = async (payload: MoviePayload) => {
    const updated = await updateMovie.mutateAsync(payload)
    toast.success('Alterações salvas.')
    navigate(`/filmes/${updated.id}`)
  }

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Editar filme</h1>
          <p className="page-subtitle">{movie.data.titulo}</p>
        </div>
      </header>
      <MovieForm
        key={movie.data.id}
        initial={movie.data}
        submitLabel="Salvar alterações"
        cancelTo={`/filmes/${id}`}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
