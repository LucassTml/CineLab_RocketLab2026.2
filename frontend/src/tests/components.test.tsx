import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { MovieCard } from '../components/MovieCard'
import { Pagination } from '../components/Pagination'
import { StarRating, StarRatingInput } from '../components/Stars'
import type { MovieSummary } from '../types'

describe('StarRating', () => {
  it('preenche a fração correspondente à nota', () => {
    render(<StarRating value={3.65} />)
    expect(screen.getByRole('img', { name: '3,7 de 5 estrelas' })).toBeInTheDocument()
    expect(screen.getByTestId('stars-fill')).toHaveStyle({ width: '73%' })
  })

  it('indica quando não há avaliações', () => {
    render(<StarRating value={null} />)
    expect(screen.getByRole('img', { name: 'Sem avaliações' })).toBeInTheDocument()
  })
})

describe('StarRatingInput', () => {
  it('seleciona meias estrelas com o mouse', async () => {
    const onChange = vi.fn()
    render(<StarRatingInput value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '3,5 estrelas' }))
    expect(onChange).toHaveBeenCalledWith(3.5)
  })

  it('é operável pelo teclado dentro dos limites 0,5–5', () => {
    const onChange = vi.fn()
    const { rerender } = render(<StarRatingInput value={5} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Nota em estrelas' })

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(5) // não passa de 5

    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(4.5)

    rerender(<StarRatingInput value={0.5} onChange={onChange} />)
    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(0.5) // não fica abaixo de meia estrela
    expect(slider).toHaveAttribute('aria-valuetext', '0,5 estrelas, Péssimo')
  })
})

describe('Pagination', () => {
  it('navega entre páginas e marca a atual', async () => {
    const onChange = vi.fn()
    render(<Pagination page={5} pages={10} onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Página 5' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(onChange).toHaveBeenCalledWith(6)
    await userEvent.click(screen.getByRole('button', { name: 'Última página' }))
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('desabilita "anterior" na primeira página e some com uma página só', () => {
    const { rerender } = render(<Pagination page={1} pages={3} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    rerender(<Pagination page={1} pages={1} onChange={() => {}} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('permite pular para uma página digitada', async () => {
    const onChange = vi.fn()
    render(<Pagination page={1} pages={3986} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Ir para'), '1234{Enter}')
    expect(onChange).toHaveBeenCalledWith(1234)
  })
})

describe('MovieCard', () => {
  const movie: MovieSummary = {
    id: 'abc',
    id_filme: '1',
    titulo: 'Ainda Estou Aqui',
    ano_lancamento: 2024,
    duracao_minutos: 137,
    status_filme: 'Lançado',
    url_poster: null,
    generos: ['Drama'],
    diretores: ['Walter Salles'],
    popularidade: 10,
    nota_media: 9,
    total_avaliacoes: 3,
  }

  it('mostra título, ano, média e link para o detalhe', () => {
    render(
      <MemoryRouter>
        <MovieCard movie={movie} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/filmes/abc')
    expect(screen.getByRole('heading', { name: 'Ainda Estou Aqui' })).toBeInTheDocument()
    expect(screen.getByText(/2024 · Walter Salles/)).toBeInTheDocument()
    expect(screen.getByTitle('3 avaliação(ões)')).toHaveTextContent('4,5') // 9/10 = 4,5 estrelas
    // Sem pôster: cai no cartão de fallback com o título.
    expect(screen.getByRole('img', { name: 'Ainda Estou Aqui' })).toBeInTheDocument()
  })

  it('indica filmes sem avaliações', () => {
    render(
      <MemoryRouter>
        <MovieCard movie={{ ...movie, nota_media: null, total_avaliacoes: 0 }} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/sem notas/)).toBeInTheDocument()
  })
})
