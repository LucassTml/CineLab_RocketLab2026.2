// Validações dos formulários (Zod). As regras são as mesmas da API, assim o
// usuário vê o erro na hora, sem precisar enviar.

import { z } from 'zod'

import { type MovieDetail, type MoviePayload, STATUS_FILME } from './types'

export const MAX_SYNOPSIS = 4000
const optionalUrl = z
  .string()
  .trim()
  .max(2048, 'URL muito longa.')
  .refine((value) => value === '' || /^https?:\/\/\S+$/.test(value), {
    message: 'A URL deve começar com http:// ou https://',
  })

// Ano e duração ficam como texto no formulário e são convertidos no envio
// (assim dá para diferenciar campo vazio de 0).
export const movieSchema = z
  .object({
    titulo: z.string().trim().min(1, 'O título é obrigatório.').max(500, 'Máximo de 500 caracteres.'),
    ano_lancamento: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Informe o ano com 4 dígitos.')
      .refine((value) => Number(value) >= 1888 && Number(value) <= 2100, {
        message: 'O ano deve estar entre 1888 e 2100.',
      }),
    data_lancamento: z.string(),
    duracao_minutos: z
      .string()
      .trim()
      .refine((value) => value === '' || (/^\d+$/.test(value) && +value >= 1 && +value <= 1500), {
        message: 'Duração entre 1 e 1500 minutos.',
      }),
    status_filme: z.enum(STATUS_FILME),
    sinopse: z.string().max(MAX_SYNOPSIS, `Máximo de ${MAX_SYNOPSIS} caracteres.`),
    url_poster: optionalUrl,
    url_backdrop: optionalUrl,
    genero_ids: z.array(z.string()),
    diretores: z.array(z.string()),
    roteiristas: z.array(z.string()),
    elenco: z.array(z.string()),
    produtoras: z.array(z.string()),
  })
  .superRefine((values, context) => {
    if (values.data_lancamento && !values.data_lancamento.startsWith(values.ano_lancamento)) {
      context.addIssue({
        code: 'custom',
        path: ['data_lancamento'],
        message: 'A data precisa ser do mesmo ano de lançamento.',
      })
    }
  })

export type MovieFormValues = z.infer<typeof movieSchema>

export const EMPTY_MOVIE_FORM: MovieFormValues = {
  titulo: '',
  ano_lancamento: '',
  data_lancamento: '',
  duracao_minutos: '',
  status_filme: 'Lançado',
  sinopse: '',
  url_poster: '',
  url_backdrop: '',
  genero_ids: [],
  diretores: [],
  roteiristas: [],
  elenco: [],
  produtoras: [],
}

export function movieToFormValues(movie: MovieDetail): MovieFormValues {
  return {
    titulo: movie.titulo,
    ano_lancamento: movie.ano_lancamento?.toString() ?? '',
    data_lancamento: movie.data_lancamento ?? '',
    duracao_minutos: movie.duracao_minutos?.toString() ?? '',
    status_filme: movie.status_filme ?? 'Lançado',
    sinopse: movie.sinopse ?? '',
    url_poster: movie.url_poster ?? '',
    url_backdrop: movie.url_backdrop ?? '',
    genero_ids: movie.generos.map((genre) => genre.id),
    diretores: movie.diretores.map((person) => person.nome),
    roteiristas: movie.roteiristas.map((person) => person.nome),
    elenco: movie.elenco.map((person) => person.nome),
    produtoras: movie.produtoras.map((company) => company.nome),
  }
}

export function formValuesToPayload(values: MovieFormValues): MoviePayload {
  const orNull = (value: string) => value.trim() || null
  return {
    titulo: values.titulo.trim(),
    ano_lancamento: Number(values.ano_lancamento),
    data_lancamento: orNull(values.data_lancamento),
    duracao_minutos: values.duracao_minutos ? Number(values.duracao_minutos) : null,
    status_filme: values.status_filme,
    sinopse: orNull(values.sinopse),
    url_poster: orNull(values.url_poster),
    url_backdrop: orNull(values.url_backdrop),
    genero_ids: values.genero_ids,
    diretores: values.diretores,
    roteiristas: values.roteiristas,
    elenco: values.elenco,
    produtoras: values.produtoras,
  }
}

export const MAX_COMMENT = 4000

export const reviewSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome de quem avalia (mín. 2 letras).')
    .max(120, 'Máximo de 120 caracteres.'),
  estrelas: z
    .number({ error: 'Escolha uma nota de 0,5 a 5 estrelas.' })
    .min(0.5, 'Escolha uma nota de 0,5 a 5 estrelas.')
    .max(5),
  comentario: z
    .string()
    .trim()
    .min(3, 'Escreva uma resenha (mín. 3 caracteres).')
    .max(MAX_COMMENT, `Máximo de ${MAX_COMMENT} caracteres.`),
})

export type ReviewFormValues = z.infer<typeof reviewSchema>
