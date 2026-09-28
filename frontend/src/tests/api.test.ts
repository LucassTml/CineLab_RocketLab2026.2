import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, buildQuery, parseErrorBody, request, setAuthToken, UNAUTHORIZED_EVENT } from '../api'

describe('buildQuery', () => {
  it('repete chaves para arrays e ignora vazios', () => {
    expect(buildQuery({ q: 'toy story', genero: ['a', 'b'], ano_min: undefined, status: '' })).toBe(
      '?q=toy+story&genero=a&genero=b',
    )
    expect(buildQuery({})).toBe('')
  })
})

describe('parseErrorBody', () => {
  it('usa a mensagem de detail quando é texto', () => {
    const error = parseErrorBody(404, { detail: 'Filme não encontrado.' })
    expect(error.message).toBe('Filme não encontrado.')
    expect(error.status).toBe(404)
  })

  it('mapeia erros de validação do FastAPI por campo', () => {
    const error = parseErrorBody(422, {
      detail: [
        { loc: ['body', 'titulo'], msg: 'String should have at least 1 character' },
        { loc: ['body'], msg: 'Value error, O ano de lançamento não corresponde à data.' },
      ],
    })
    expect(error.fieldErrors.titulo).toBe('String should have at least 1 character')
    expect(error.fieldErrors.body).toBe('O ano de lançamento não corresponde à data.')
  })
})

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setAuthToken(null)
  })

  it('envia o token e o corpo JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setAuthToken('abc')

    await request('/movies', { method: 'POST', body: { titulo: 'X' } })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/movies')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
    expect(init.body).toBe('{"titulo":"X"}')
  })

  it('avisa a aplicação quando o token é rejeitado (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"detail":"Token inválido."}', { status: 401 })),
    )
    setAuthToken('expirado')
    const listener = vi.fn()
    window.addEventListener(UNAUTHORIZED_EVENT, listener)

    await expect(request('/auth/me')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(UNAUTHORIZED_EVENT, listener)
  })

  it('traduz falha de rede em mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(request('/movies')).rejects.toThrow('Não foi possível conectar à API')
  })
})
