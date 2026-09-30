# CineLab: documentação do projeto

Este documento explica o projeto inteiro: como ele responde à Atividade DEV do
RocketLab 2026.2, por que escolhi cada ferramenta, como as principais funções
funcionam e o caminho que segui até chegar nesta versão. Para só rodar o
projeto, o passo a passo está no [README](../README.md). Um resumo curto das
escolhas de tecnologia está em [ESCOLHAS.md](ESCOLHAS.md).

Sumário:

1. [A atividade e como o projeto responde](#1-a-atividade-e-como-o-projeto-responde)
2. [Como pensei o projeto](#2-como-pensei-o-projeto)
3. [Arquitetura geral](#3-arquitetura-geral)
4. [Backend](#4-backend)
5. [Frontend](#5-frontend)
6. [Testes e qualidade](#6-testes-e-qualidade)
7. [Ferramentas usadas](#7-ferramentas-usadas)
8. [Decisões e o que ficou de fora](#8-decisões-e-o-que-ficou-de-fora)

---

## 1. A atividade e como o projeto responde

A atividade pedia um módulo (frontend e backend) de um sistema de avaliação de
filmes inspirado no Letterboxd, usado por um administrador. A stack era
obrigatória: **Vite + React + TypeScript** no frontend, **FastAPI** no backend e
**SQLite** como banco. Recebemos um repositório base (modelos em SQLAlchemy e
migração inicial do Alembic) e os CSVs com os filmes.

### Requisitos

| Requisito do enunciado | Como foi feito | Onde está |
|---|---|---|
| Cadastrar filmes com informações básicas (título, diretor, ano, gênero, sinopse) | Formulário com título, ano, data, duração, status, sinopse, gêneros, direção, roteiro, elenco, produtoras e imagens. Validado no navegador (Zod) e na API (Pydantic). | tela `/filmes/novo`, `POST /api/v1/movies`, `MovieForm.tsx`, `service.create_movie` |
| Navegar num catálogo paginado com todos os filmes | Grade de filmes com 24/48/96 por página, paginação numérica e "ir para página". Os 95 mil filmes dos CSVs estão no banco. | tela `/`, `GET /api/v1/movies`, `service.list_movies`, `Pagination.tsx` |
| Ver detalhes de cada filme e a lista de avaliações | Página com ficha completa (elenco, equipe, produtoras, desempenho financeiro, notas do TMDB/IMDb) e a lista de avaliações paginada e ordenável. | tela `/filmes/:id`, `GET /movies/{id}` e `GET /movies/{id}/reviews`, `MovieDetailPage.tsx`, `Reviews.tsx` |
| Buscar um ou mais filmes numa barra de pesquisa | Busca por título que ignora acento e maiúscula, funciona por prefixo e aceita vários filmes separados por vírgula (`matrix, toy story`). Mostra sugestões enquanto digita. | `SearchBar.tsx`, parâmetro `q`, `build_fts_query` em `service.py`, tabela FTS5 |
| Remover e atualizar filmes individualmente | Botões Editar e Remover na página do filme. A remoção pede confirmação e apaga também as avaliações e ligações. A edição só muda o que foi alterado (PATCH). | `PATCH` e `DELETE /movies/{id}`, `service.update_movie`, `service.delete_movie` |
| Adicionar avaliação (nota de 1 a 5 estrelas e resenha) | Formulário com estrelas clicáveis (de 0,5 a 5, com meias estrelas), nome e resenha. | `POST /movies/{id}/reviews`, `StarRatingInput`, `service.add_review` |
| Ver a média geral das avaliações de cada filme | A média aparece nos cards do catálogo, na página do filme (com histograma das notas) e no dashboard. É recalculada a cada avaliação nova ou removida. | `refresh_review_summary`, `RatingPanel` |

Também entreguei o projeto no GitHub com um README explicando como rodar.

### Extras sugeridos no enunciado

O PDF sugeria explorar "documentação, testes automatizados, autenticação,
filtros, responsividade, caching de consultas". Todos entraram:

- **Documentação:** este arquivo, o `ESCOLHAS.md`, o README e a documentação
  automática da API em `/docs` (Swagger, gerada pelo FastAPI).
- **Testes automatizados:** 63 testes no backend (pytest) e 43 no frontend (Vitest).
- **Autenticação:** login do administrador com token JWT. Ver o catálogo é
  livre; cadastrar, editar, remover e avaliar precisa de login.
- **Filtros:** gênero (vários ao mesmo tempo), faixa de anos, nota mínima,
  status, pessoa e produtora, além de 8 ordenações.
- **Responsividade:** o layout se adapta ao celular (filtros viram uma gaveta,
  a página do filme se reorganiza).
- **Caching:** cache no navegador (React Query) e no servidor (cache em
  memória com tempo de expiração).

Além disso: dashboard com gráficos, filmes semelhantes, carrossel de destaques,
busca rápida (Ctrl+K), a transição em que a cor do pôster se espalha pela tela
(seção 5.9) e a limpeza dos dados dos CSVs (seção 4.4).

---

## 2. Como pensei o projeto

Esta é a ordem em que as coisas aconteceram e o motivo de cada passo.

**1. Entender a base antes de mexer.** Li o PDF e o repositório base. A base
já tinha o modelo de dados pronto (esquema estrela: tabelas de dimensão para
filmes, gêneros, pessoas e produtoras, uma tabela fato de desempenho e tabelas
ponte para as relações N:N) e a migração inicial. Ao rodar os testes da base,
eles quebravam: o SQLAlchemy 2.1 deixou de instalar sozinho o `greenlet`, que o
modo assíncrono precisa. Corrigi declarando `sqlalchemy[asyncio]` no
`pyproject.toml`. Foi o primeiro aprendizado: testar o que já existe antes de
construir em cima.

**2. Olhar os dados antes de escrever a carga.** Em vez de escrever o script
de importação direto, analisei os CSVs com pandas (tamanhos, duplicatas,
registros órfãos, formatos). Os dados eram grandes (~230 MB, 95 mil filmes, 745
mil ligações filme-pessoa) e tinham problemas que mudaram decisões do projeto:
o resumo de avaliações não batia com as avaliações individuais, parte dos
registros de pessoas estava deslocada, textos tinham aspas duplicadas. Isso
está detalhado na seção 4.4.

**3. Carga e banco.** Escrevi o `seed.py` para ler os CSVs em lotes, limpar os
valores e gravar no SQLite. Criei a migração `0002` com a busca textual e os
índices.

**4. API guiada pelos requisitos, depois pelos extras.** Fiz primeiro as rotas
que os requisitos pediam e só depois os extras (filtros, dashboard, login).
Com os dados reais carregados, o catálogo ficou lento (~700 ms para a página
inicial). Em vez de chutar índices, usei o `EXPLAIN QUERY PLAN` do SQLite para
ver o que ele estava fazendo em cada consulta e medi antes e depois de cada
mudança (seção 4.6).

**5. Testes junto com o código.** Cada requisito ganhou testes no backend. Os
testes rodam as migrações de verdade num banco temporário, então também
conferem a busca e os triggers.

**6. Frontend.** Montei as telas, a comunicação com a API (React Query) e os
formulários. Testei todos os fluxos no navegador: busca, login, cadastrar,
editar, avaliar e remover.

**7. Organização para quem for corrigir.** Reorganizei as pastas para seguir a
estrutura da base do RocketLab (`api/v1`, `core`, `db`, `movies`) e juntei
arquivos pequenos, para o projeto ficar fácil de navegar.

**8. Visual e acabamento.** Criei uma identidade visual própria e corrigi um
bug nas estrelas (seção 5.7).

**9. Segunda versão do visual.** Refiz a interface num tema escuro mais sóbrio
(inspirado em lojas minimalistas e em plataformas de streaming), com mais
animações ligadas à rolagem e uma ideia central: ao abrir um filme, a cor do
pôster se espalha pela tela e vira o fundo da página dele (seção 5.9). Para o
carrossel de destaques precisei da imagem de fundo nos cards, então o
`MovieSummary` ganhou `url_backdrop`; para o histograma do filtro de ano criei a
rota `GET /years`.

---

## 3. Arquitetura geral

```text
 Navegador (React + TypeScript)
   │  telas, formulários, cache das consultas (React Query)
   │
   │  requisições HTTP para /api/v1/...
   │  (em desenvolvimento o Vite repassa /api para a porta 8000)
   ▼
 FastAPI (Python)
   │  rotas (app/api/v1)  ->  regras de negócio (app/movies/service.py)
   │  validação com Pydantic, login com JWT, cache em memória
   ▼
 SQLAlchemy (ORM assíncrono)  ->  SQLite (arquivo backend/rocketlab.db)
                                   tabelas da base + busca FTS5 + índices
```

O banco é criado pelas migrações do Alembic e preenchido uma vez pelo
`seed.py` a partir dos CSVs. Depois disso o site só lê e escreve no banco;
os CSVs não são usados em tempo de execução.

### Pastas e arquivos

```text
backend/
  app/
    main.py            cria o app FastAPI (CORS, compressão, tratamento de erros)
    seed.py            carga e limpeza dos CSVs
    api/v1/
      router.py        junta todas as rotas
      movies.py        filmes e avaliações
      catalog.py       gêneros, pessoas e produtoras (filtros e autocomplete)
      stats.py         dados do dashboard
      auth.py          login
    core/
      config.py        configurações lidas do .env
      security.py      criação e validação do token JWT
      cache.py         cache em memória com expiração
      errors.py        erros de domínio (404, 409, 422)
      logging.py       configuração de log (da base)
    db/
      base.py          classe base dos modelos (da base)
      session.py       conexão com o SQLite
    movies/
      models.py        tabelas (da base, com índices a mais)
      schemas.py       formatos de entrada e saída da API
      service.py       regras de negócio e consultas
  migrations/versions/
    0001_initial_movie_schema.py   tabelas (da base)
    0002_search_and_indexes.py     busca FTS5 e índices
  tests/               testes com pytest

frontend/
  src/
    main.tsx           ponto de entrada (React Query, rotas, login)
    App.tsx            mapa de rotas
    api.ts             comunicação com a API
    types.ts           tipos das respostas
    hooks.ts           hooks do React Query e filtros na URL
    auth.tsx           sessão do administrador
    validation.ts      regras dos formulários (Zod)
    utils.ts           formatação (datas, dinheiro, notas) e paginação
    color.ts           cor predominante do pôster (canvas)
    motion.ts          animações ligadas à rolagem (aparecer, contar, parallax)
    genres.ts          nome em português e ícone de cada gênero
    index.css          todo o visual
    components/        partes reutilizáveis da interface
    pages/             uma por tela
    tests/             testes com Vitest
```

---

## 4. Backend

### 4.1 FastAPI

O FastAPI veio no enunciado e já estava na base. Ele encaixou bem por três
motivos:

- **Validação automática.** Declaro o formato dos dados com Pydantic (por
  exemplo, `ano_lancamento: int = Field(ge=1888, le=2100)`) e, se a requisição
  vier errada, o FastAPI responde 422 com o erro de cada campo sem eu escrever
  nenhum `if`.
- **Documentação automática** em `/docs`. Deu para testar todas as rotas antes
  do frontend existir.
- **Injeção de dependências** (`Depends`). A sessão do banco e o login entram
  nas rotas como parâmetros. Toda rota de escrita recebe `_admin: AdminUser`,
  que valida o token; esquecer isso seria visível no próprio código da rota.

### 4.2 Organização em camadas

As rotas (`app/api/v1/*.py`) só traduzem HTTP para chamadas de função. A regra
de negócio fica em `app/movies/service.py`. Isso separa "como a requisição
chega" de "o que fazer com ela", e deixa o serviço testável.

Quando algo dá errado, o serviço lança um erro de domínio (`NotFoundError`,
`ConflictError`, `InvalidDataError`, em `core/errors.py`) sem saber nada de
HTTP. Um único tratador, registrado no `main.py`, transforma esses erros em
respostas 404, 409 ou 422.

### 4.3 Banco de dados

O modelo veio da base: um **esquema estrela**, comum em análise de dados.

- `dim_movies`, `dim_genres`, `dim_people`, `dim_companies`: as "coisas" do domínio;
- `fact_movies_performance`: números de cada filme (orçamento, bilheteria,
  popularidade, notas do TMDB/IMDb);
- `bridge_movie_genre`, `bridge_movie_person`, `bridge_movie_company`: as
  relações muitos-para-muitos (um filme tem vários gêneros, um gênero tem
  vários filmes);
- `movie_reviews`: cada avaliação;
- `dim_reviews`: o resumo (quantidade e média) de cada filme.

**Por que SQLite:** era obrigatório, e é prático para quem vai corrigir: o
banco é um arquivo só, sem servidor para instalar. Ele aguentou bem o volume de
dados depois que criei os índices certos.

**Alembic:** como a base pedia, as tabelas só são criadas por migração. A
`0001` é da base; a `0002` é minha e cria a busca (FTS5) e os índices. O
comando `alembic check` confirma que os modelos em Python e as migrações estão
iguais.

Dois ajustes de conexão ficam em `db/session.py`: `PRAGMA foreign_keys=ON`
(no SQLite as chaves estrangeiras vêm desligadas e, sem isso, o `ON DELETE
CASCADE` não funcionaria) e o modo WAL, para leituras não bloquearem escritas.

### 4.4 Carga dos CSVs (`seed.py`)

Comando: `python -m app.seed`. Ele:

1. procura os 10 CSVs nas pastas informadas;
2. lê cada arquivo em lotes de 10 mil linhas e insere com `executemany`, tudo
   numa transação só (assim a memória não explode com 745 mil linhas e a carga
   leva cerca de 1 minuto);
3. respeita a ordem das chaves estrangeiras (gêneros e pessoas antes de
   filmes, filmes antes das pontes) e deixa as FKs ligadas: se houvesse um
   registro órfão, a carga falharia em vez de gravar dado inconsistente;
4. limpa os dados e recalcula o resumo de avaliações;
5. roda `ANALYZE` para o SQLite escolher bem os índices.

Problemas que encontrei nos CSVs e o que fiz com cada um:

| Problema | Tratamento |
|---|---|
| O `dim_reviews.csv` não batia com o `movies_reviews.csv`: 8.594 médias diferentes, 14.561 filmes com avaliação e sem resumo, 898 resumos sem nenhuma avaliação | Recalculei o resumo a partir das avaliações individuais (`rebuild_review_summaries`). A tela mostra a média junto com a lista de avaliações, então as duas precisam bater. O log mostra o quanto divergia. |
| Em cerca de 2 mil filmes as colunas de pessoas vieram deslocadas: o "diretor" de Toy Story 4 era "Cowboy", "Sequel"..., outros tinham diretor "English" e ator "7.8" | `remove_corrupted_people`: se o filme tem uma "pessoa" com nome só de números, todo o registro está deslocado e os vínculos daquele filme saem; nomes que são idioma, país, gênero ou palavra-chave saem individualmente. Foram 8.283 vínculos e 3.543 "pessoas" falsas removidas. |
| ~4.800 sinopses e 55 títulos com escape duplo de aspas (`"""blessed"""`) | `clean_synopsis` e `clean_title` desfazem o escape. Antes de aplicar, conferi que todos os textos que começam com aspas seguem esse padrão. |
| Numerais romanos com capitalização errada ("Grizzly Ii") | Corrigidos em títulos, pessoas e produtoras ("Grizzly II"), deixando de fora "Vi" e "Xi", que aparecem como palavras reais ("Me Vi", "Xi Jinping"). |
| `duracao_minutos = 0` em 10.160 filmes | Tratado como duração desconhecida (`NULL`). |
| Inteiros exportados como decimal (`"2375.0"`) | Convertidos para inteiro. |

### 4.5 Busca por título (FTS5)

A busca usa o **FTS5**, o índice de texto completo que vem dentro do SQLite.
Criei a tabela virtual `movies_search` com uma cópia do título de cada filme e
três triggers em `dim_movies` (inserção, edição de título e remoção), que
mantêm o índice atualizado sozinhos. Nenhum código do projeto precisa lembrar
de atualizar a busca.

O tokenizador `unicode61 remove_diacritics 2` faz a busca ignorar acentos e
maiúsculas ("amelie" encontra "Amélie").

A função `build_fts_query` transforma o texto digitado na consulta do FTS5:

- cada palavra vira um prefixo (`"matr"*` encontra Matrix);
- as palavras de um termo são combinadas com E (`toy sto` exige as duas);
- vírgula separa termos alternativos: `matrix, toy story` vira
  `("matrix"*) OR ("toy"* AND "story"*)`, o que atende o "buscar um ou mais
  filmes" do enunciado;
- cada palavra vai entre aspas, então se alguém digitar operadores do FTS
  (`NOT`, `NEAR`, `*`) eles viram texto comum e não quebram a consulta.

Quando há busca, a ordenação padrão passa a ser por relevância (BM25, que o
FTS5 calcula), com a popularidade como desempate.

### 4.6 Catálogo rápido com 95 mil filmes

Com os dados reais, a primeira versão do catálogo era lenta. Usei o `EXPLAIN
QUERY PLAN` para entender cada consulta e medi o tempo antes e depois de cada
mudança:

| Situação | Antes | Depois | O que mudou |
|---|---|---|---|
| Página inicial (ordenar por popularidade) | ~700 ms | < 1 ms | índice em `popularidade` e INNER JOIN com a tabela fato |
| Ordenar por título | ~715 ms | < 1 ms | "deferred join": buscar primeiro só os ids da página |
| Ordenar por nota ou nº de avaliações | ~780 ms | ~3 ms | só filmes avaliados + índices compostos `(nota, qtd)` |
| Contagem do total | ~50 ms | ~0 ms | contar sem JOINs desnecessários |
| Filtro por gênero | ~186 ms | ~78 ms | `IN (subconsulta)` no lugar de `EXISTS` |

As ideias por trás disso:

- **INNER JOIN com a tabela fato.** O SQLite não consegue usar o índice de uma
  tabela que está do lado direito de um LEFT JOIN. Como todo filme tem uma
  linha em `fact_movies_performance` (os CSVs têm, e `create_movie` cria uma
  vazia para filmes novos), dá para usar INNER JOIN, e o SQLite percorre o
  índice de popularidade e para depois de 24 filmes.
- **Deferred join** (`list_movies`). São três consultas: (1) conta o total,
  (2) busca **só os ids** da página na ordem pedida, (3) carrega os dados
  completos desses 24 ids. Sem as colunas grandes (sinopse, URLs), o SQLite
  consegue usar o índice da ordenação.
- **Rankings só com filmes avaliados** (`_needs_reviews`). Ordenar por nota
  entre filmes sem nota não faz sentido, e isso deixa o SQLite usar o índice
  de `dim_reviews`. O site avisa com "Mostrando apenas filmes que já receberam
  avaliações".
- **Sem N+1.** Gêneros e diretores dos cards vêm em duas consultas para a página
  toda (`build_summaries`), e não duas por filme.

### 4.7 Avaliações e média

- **Escala:** os CSVs e o banco usam notas de 0 a 10 (por exemplo, 7,7). O site
  mostra estrelas de 0,5 a 5: `estrelas = nota / 2`. Mantive a API em 0 a 10
  para não perder a precisão das notas importadas; o formulário envia
  `estrelas × 2` (de 1 a 10).
- **Média sempre certa:** `refresh_review_summary` recalcula a média e a
  quantidade do filme em `dim_reviews` toda vez que uma avaliação entra ou sai,
  **na mesma transação**. A média mostrada nunca fica diferente da lista.
- **Por que guardar a média** em vez de calcular na hora: para ordenar o
  catálogo por nota sem recalcular a média de 43 mil avaliações a cada página.
- **Histograma:** `star_bucket` coloca cada nota numa das 10 barras (uma por
  meia estrela).
- **Ranking do dashboard:** usa média bayesiana, `(v·R + m·C) / (v + m)`, com
  `v` = número de avaliações, `R` = média do filme, `C` = média geral e `m = 3`.
  Assim um filme com uma única nota 10 não fica em primeiro (é a mesma ideia do
  top 250 do IMDb).

### 4.8 Login com JWT

O sistema tem um único perfil, o administrador, então não criei tabela de
usuários: usuário e senha vêm do `.env`.

1. O site manda usuário e senha para `POST /auth/login`.
2. O backend compara com `secrets.compare_digest`, que leva o mesmo tempo
   estando certo ou errado (evita ataque por tempo de resposta), e devolve um
   **token JWT** assinado com validade de 8 horas.
3. O site guarda o token e o envia no cabeçalho `Authorization: Bearer ...`.
4. As rotas de escrita usam `require_admin`, que confere assinatura e validade.
   Token vencido ou inválido gera 401, e o site faz logout sozinho.

Escolhi JWT porque o servidor não precisa guardar sessão: a validade está no
próprio token.

### 4.9 Cache

`core/cache.py` é um cache em memória com tempo de expiração (2 minutos). Ele
guarda as consultas pesadas: dashboard (~2 s sem cache, ~2 ms com), lista de
gêneros, filmes por ano e filmes semelhantes. **Toda escrita limpa o cache**, então nunca
aparece dado desatualizado depois de uma alteração.

### 4.10 Rotas da API

Todas começam com `/api/v1`. As marcadas com (admin) exigem o token.

- `POST /auth/login`, `GET /auth/me` (admin)
- `GET /movies`: catálogo (`q`, `genero`, `ano_min`, `ano_max`, `nota_min`,
  `min_avaliacoes`, `status`, `pessoa`, `produtora`, `sort`, `order`, `page`,
  `page_size`)
- `POST /movies` (admin), `GET /movies/{id}`, `PATCH /movies/{id}` (admin),
  `DELETE /movies/{id}` (admin)
- `GET /movies/{id}/similar`
- `GET /movies/{id}/reviews`, `POST /movies/{id}/reviews` (admin),
  `DELETE /movies/{id}/reviews/{review_id}` (admin)
- `GET /genres`, `GET /years` (filmes por ano, para o histograma do filtro),
  `GET /people`, `GET /people/{id}`, `GET /companies`, `GET /companies/{id}`
- `GET /stats`
- `GET /health` (fora do `/api/v1`)

### 4.11 Principais funções do backend

| Função | O que faz | Por quê |
|---|---|---|
| `build_fts_query` | Monta a consulta de busca a partir do texto digitado | Prefixo, vários filmes por vírgula e proteção contra sintaxe do FTS |
| `list_movies` | Catálogo com busca, filtros, ordenação e paginação | Deferred join em 3 consultas para ser rápido |
| `_with_catalog_joins` | Junta desempenho e resumo de avaliações ao filme | Centraliza o INNER/LEFT JOIN que decide o desempenho |
| `_apply_filters` | Aplica os filtros do catálogo | Vários gêneros com E, pessoa e produtora por subconsulta |
| `_ordering` | Monta a ordenação | Direções que deixam o SQLite usar os índices + desempate pelo id para a paginação não repetir filmes |
| `build_summaries` | Transforma linhas do banco nos cards | Busca gêneros e diretores da página inteira de uma vez |
| `get_movie_detail` | Monta a ficha completa | Separa as pessoas em direção, roteiro e elenco; esconde o bloco financeiro se não há dados |
| `similar_movies` | Filmes com mais gêneros em comum | Recomendação simples, com cache |
| `_get_or_create` | Encontra pessoa/produtora pelo nome ou cria | Reaproveita "Greta Gerwig" quando alguém digita "greta gerwig", sem duplicar |
| `update_movie` | Edição parcial (PATCH) | Só muda o que veio; mandar só diretores mantém o elenco |
| `delete_movie` | Remove o filme | `DELETE` direto: o banco apaga em cascata pontes, fato e avaliações |
| `refresh_review_summary` | Recalcula média e quantidade | Média sempre igual à lista de avaliações |
| `compute_overview` (`stats.py`) | Números do dashboard | Tudo numa chamada, com cache |
| `_search_by_name` (`catalog.py`) | Autocomplete de pessoas/produtoras | Ordena por número de filmes; usa `LIKE` simples, que no SQLite já ignora maiúsculas (o `lower()` do `ilike` deixava a busca 2x mais lenta) |
| `clean_synopsis`, `clean_title`, `clean_name` (`seed.py`) | Limpam textos dos CSVs | Escape de aspas e numerais romanos |
| `remove_corrupted_people` (`seed.py`) | Remove vínculos de pessoas deslocados | Evita diretor "English" e ator "7.8" |
| `rebuild_review_summaries` (`seed.py`) | Recalcula `dim_reviews` na carga | O CSV de resumo não batia com as avaliações |

---

## 5. Frontend

### 5.1 React, Vite e TypeScript

- **React:** a interface é dividida em componentes reutilizáveis (card de
  filme, estrelas, paginação...), usados em várias telas.
- **Vite:** o servidor de desenvolvimento sobe em menos de 1 segundo e
  atualiza a tela ao salvar. Configurei um proxy no `vite.config.ts`: o site
  chama `/api` e o Vite repassa para o FastAPI, então não há problema de CORS
  em desenvolvimento. Os testes (Vitest) usam a mesma configuração.
- **TypeScript:** os tipos em `types.ts` espelham os schemas do backend. Se eu
  uso um campo que não existe, o erro aparece antes de rodar.

### 5.2 Comunicação com a API (`api.ts`)

- `request` é um `fetch` com três cuidados: anexa o token, transforma respostas
  de erro em `ApiError` com mensagem legível e, se a API responde 401, avisa o
  resto do site para fazer logout.
- `parseErrorBody` lê o formato de erro do FastAPI. Num 422, guarda o erro de
  cada campo, e o formulário mostra a mensagem no campo certo.
- `buildQuery` monta a query string repetindo o parâmetro para listas
  (`genero=a&genero=b`), que é o formato que o FastAPI espera.
- `api` tem uma função por rota, todas tipadas.

### 5.3 React Query (`hooks.ts`)

O TanStack Query (React Query) cuida de buscar e guardar os dados:

- **cache por chave**: voltar para uma página já vista não faz outra requisição;
- **cancelamento**: se a pessoa muda de página rápido, a requisição antiga é
  cancelada;
- `keepPreviousData`: a página anterior continua na tela enquanto a próxima
  carrega, sem "piscar";
- **invalidação**: depois de salvar algo, invalido só o que mudou. Ao publicar
  uma avaliação, por exemplo, atualizam a ficha do filme (média e histograma),
  as avaliações, o catálogo e o dashboard;
- não tenta de novo requisições que deram erro 4xx, porque repetir um 404 não
  muda nada.

### 5.4 Filtros na URL

Busca, filtros, ordenação e página ficam na URL (`/?q=matrix&genero=...&page=2`).
Assim o botão voltar funciona, recarregar a página mantém os filtros e dá para
mandar o link de uma busca para alguém. `parseCatalogParams` ignora valores
inválidos (se alguém editar a URL na mão) e `serializeCatalogParams` só escreve
o que não é padrão, para o link ficar curto. Mudar qualquer filtro volta para a
página 1.

### 5.5 Login no site (`auth.tsx`)

O token fica no `localStorage` para o login sobreviver a um recarregamento.
Tokens vencidos são descartados ao abrir o site, e a sessão termina sozinha
quando o token vence com a aba aberta. `RequireAdmin` (em `Layout.tsx`) manda
para o login quem tenta abrir o cadastro ou a edição sem estar logado, e depois
volta para a página certa. O parâmetro `next` só aceita caminhos do próprio
site, para ninguém usar o login para redirecionar a outro endereço.

### 5.6 Formulários

React Hook Form + Zod (`validation.ts`). As regras são as mesmas da API (título
obrigatório, ano com 4 dígitos entre 1888 e 2100, data do mesmo ano, URL
começando com http...), então o erro aparece na hora, sem enviar. Se mesmo
assim a API recusar algo, o erro dela vai para o campo correspondente.

No formulário de filme, direção, roteiro, elenco e produtoras usam um campo com
**autocomplete** (`TagInput`, dentro de `MovieForm.tsx`). Ele sugere nomes que
já existem no banco, com o número de filmes de cada um, para não cadastrar
pessoas duplicadas. Um nome novo é criado pelo backend. O formulário também
mostra uma prévia do pôster e avisa se a pessoa tentar fechar a aba com
alterações não salvas.

### 5.7 Componentes principais

- **`StarRating`** mostra uma nota com preenchimento parcial (3,65 estrelas).
  São duas camadas: cinco estrelas vazias e, por cima, cinco douradas dentro de
  uma caixa com a largura da nota e `overflow: hidden`, que corta o excesso.
  **Bug corrigido:** as estrelas douradas estavam dentro de um flex e o
  navegador as **encolhia** para caber na largura cortada (ficavam com 10 px em
  vez de 14 px), então não alinhavam com as de baixo e a nota parecia errada. A
  correção foi `flex-shrink: 0` nas estrelas, para elas manterem o tamanho e
  serem cortadas no ponto certo. Conferi medindo no navegador: agora as duas
  camadas têm o mesmo tamanho.
- **`StarRatingInput`** é o campo de nota: cada estrela tem duas metades
  clicáveis (meias estrelas). Para acessibilidade, o conjunto funciona como um
  slider: setas mudam de 0,5 em 0,5, e Home/End vão aos extremos.
- **`SearchBar`** é a busca da barra lateral, com sugestões de filmes e
  pessoas (padrão "combobox" do ARIA). Espera 250 ms sem digitação antes de
  consultar a API (debounce), para não fazer uma requisição por tecla. Clicar
  numa pessoa filtra o catálogo pelos filmes dela.
- **`SearchPalette`** (no mesmo arquivo) é a busca rápida: abre de qualquer
  página com Ctrl+K (⌘K no Mac) ou "/", num `<dialog>` por cima do site. Sem
  nada digitado, sugere os filmes em alta; setas escolhem e Enter abre.
- **`Dropdown`** substitui o `<select>` na ordenação: é uma lista estilizada
  que segue o padrão "listbox" do ARIA (setas, Home/End, Enter, Esc) e tem um
  destaque que desliza até a opção apontada.
- **`CatalogFilters`** (`Filters.tsx`) é a barra lateral: lista de gêneros com
  a quantidade de filmes, histograma de filmes por ano com um controle de duas
  pontas (só aplica 400 ms depois de soltar), nota mínima em botões segmentados
  e status em etiquetas. No celular vira uma gaveta.
- **`Pagination`** tem anterior/próxima, os números (sempre com a primeira e a
  última página), reticências (`getPageItems` em `utils.ts`) e "ir para".
- **`Reviews`** reúne o painel da média (`RatingPanel`, com histograma e as
  notas do TMDB e do IMDb), o formulário e a lista de avaliações.
- **`Feedback`** tem os estados de vazio, erro e carregando e o diálogo de
  confirmação, feito com o `<dialog>` nativo do HTML (que já trava o foco e
  fecha com Esc).
- **`Layout`** tem o cabeçalho (menu com traço deslizante, busca, menu do
  administrador e menu de celular), o rodapé e a barra de carregamento. Também
  guarda a posição da rolagem: ao voltar do filme, o catálogo reabre onde estava.
- **`Showcase`** tem o carrossel de destaques, a faixa de gêneros e o
  `SplitTitle` (títulos com as palavras subindo).
- **`Ambient`** e **`Spread`** fazem o fundo colorido e a transição ao abrir um
  filme (explicados na seção 5.9). `MovieLink` é o link que dispara a transição.

### 5.8 Telas

- **Catálogo (`/`):** na primeira página sem filtros aparece a vitrine
  (carrossel com os filmes mais populares e atalhos por gênero). Abaixo, busca e
  filtros na lateral (gaveta no celular), ordenação, grade de filmes e paginação.
- **Filme (`/filmes/:id`):** topo com a imagem de fundo, pôster, título e nota;
  uma barra de seções que gruda no topo (sinopse, elenco, ficha técnica,
  números, avaliações, semelhantes); painel da média ao lado. Botões de editar
  e remover para o admin.
- **Cadastro e edição (`/filmes/novo`, `/filmes/:id/editar`):** o mesmo
  formulário, só para o admin.
- **Dashboard (`/dashboard`):** totais, distribuição das notas, filmes por ano,
  gêneros, rankings e últimas avaliações. Cada gráfico tem uma tabela com os
  números ("Ver dados em tabela").
- **Login (`/login`):** formulário à direita e, à esquerda, uma parede de
  pôsteres rolando devagar.

As páginas além do catálogo carregam só quando abertas (`lazy` em `App.tsx`),
então a página inicial baixa menos código.

### 5.9 Visual

A ideia foi um visual **escuro, sóbrio e elegante**, mais perto de uma loja
minimalista do que de um streaming cheio de brilho, com a cor vindo dos
próprios filmes:

- **Base neutra:** fundo carvão, painéis um pouco mais claros, linhas finas
  quase transparentes e **cantos retos** (2 px). Não uso sombras coloridas nem
  cantos redondos.
- **Tipografia:** títulos em **Instrument Serif** (serifa fina, de revista de
  cinema) e o resto em **Instrument Sans**. Rótulos pequenos em caixa alta com
  espaçamento largo.
- **A cor é do filme:** cada página pega a cor predominante do pôster
  (`color.ts`) e usa nela o fundo, o botão principal, os traços e o
  histograma. Sem filme, o destaque é um champanhe discreto.
- **Cards:** no hover o card sobe e gira um pouco, e no lugar dele fica um
  contorno tracejado (a "marca" de onde ele saiu). Um brilho atravessa o pôster
  uma vez. O logo repete essa ideia: um quadrado inclinado sobre um tracejado.
- **Filtros no estilo de loja:** lista de gêneros com a contagem ao lado e um
  quadradinho no ativo, histograma de anos com controle deslizante, botões
  segmentados e etiquetas.

**Como a cor do filme se espalha pela tela.** É a parte principal do visual,
dividida em três arquivos:

1. `color.ts` desenha o pôster pequeno (24 × 36 pixels) num `<canvas>` e lê os
   pixels. Cada pixel cai numa de 12 faixas de matiz com um peso (cor viva e
   luminosidade média pesam mais; preto, branco e cinza não contam). A faixa
   mais pesada vence e a cor é ajustada para funcionar como fundo escuro. O
   canvas só consegue ler imagens que liberam CORS; o TMDB libera, e para
   imagens de outros sites a cor sai do título (`hashColor`). A cor é calculada
   quando o mouse passa pelo card, então no clique ela já está pronta.
   **Bug corrigido:** na primeira versão todas as capas usavam
   `<img crossorigin>`, e elas sumiram (viraram o cartão com o título) em
   navegadores que já tinham visto o site antes. O TMDB só manda o cabeçalho de
   CORS quando o pedido vem em modo CORS e não avisa isso ao cache (não manda
   `Vary: Origin`), então o navegador reaproveitava a cópia guardada sem CORS e
   a imagem falhava. Agora as capas são `<img>` comuns e só a leitura da cor
   baixa o pôster pequeno com `fetch` em modo CORS, sem usar o cache.
2. `Spread.tsx` faz a transição com a Web Animations API: a cor se abre a partir
   do retângulo do pôster clicado (`clip-path`) até cobrir a tela, enquanto uma
   cópia do pôster cresce, endireita (o card estava inclinado) e desfoca. O
   título do filme aparece no meio, como a cartela de abertura. Com a tela
   coberta, o site troca de página (os dados começaram a ser buscados quando o
   botão do mouse desceu) e, quando a página avisa que carregou, a cobertura
   some num fade. Cada etapa também tem um timer de segurança: com a aba em
   segundo plano o navegador não desenha e as animações não terminam.
3. `Ambient.tsx` é uma camada fixa atrás de todas as páginas com a cor em
   degradê e o pôster bem desfocado. Quando a transição termina, o fundo já está
   com a mesma cor e imagem, então a troca não aparece. Entre páginas, a camada
   nova entra por cima da antiga com um fade longo.

**Animações** (cada uma com um propósito):

- elementos entram quando aparecem na tela (um `IntersectionObserver` só para o
  site todo, em `motion.ts`), com atraso em cascata;
- o carrossel troca sozinho, com uma barrinha que marca o tempo, zoom lento na
  imagem e as palavras do título subindo; para com o mouse em cima e quando sai
  da tela;
- a imagem do topo desce mais devagar que a página (parallax) e uma linha fina
  no topo da página do filme mostra quanto já foi lido;
- menus (ordenação, administrador, celular) abrem e fecham com animação, com
  um destaque que desliza entre as opções;
- barras dos gráficos, do histograma e de orçamento × bilheteria crescem ao
  aparecer e os números contam até o valor;
- o cabeçalho some ao descer a página e volta ao subir.

Quem configura o sistema para "reduzir movimento" (`prefers-reduced-motion`)
vê tudo pronto, sem animação e sem a transição (a página só troca).

As cores dos gráficos foram conferidas com um script de contraste: a cor base
das barras tem 3,4:1 sobre o painel e cada gráfico tem a tabela com os números.

**Acessibilidade:** navegação por teclado (foco visível, busca e estrelas
operáveis pelo teclado), rótulos para leitores de tela, link "pular para o
conteúdo" e tabelas com os números dos gráficos.

---

## 6. Testes e qualidade

**Backend (pytest, 63 testes).** Cada teste roda contra um banco SQLite
temporário criado pelas **migrações reais** do Alembic (não por `create_all`),
então os testes também garantem que as migrações, a tabela de busca e os
triggers funcionam. Cobrem:

- cada requisito: cadastro (e validações), catálogo paginado, detalhes, busca,
  edição, remoção em cascata, avaliações e média;
- filtros e ordenações;
- busca: acento, prefixo, vários filmes e tentativas de quebrar a consulta;
- login: senha errada, token vencido e token falsificado;
- dashboard, filmes por ano e invalidação do cache;
- a carga dos CSVs, com CSVs pequenos que têm os mesmos problemas dos reais.

**Frontend (Vitest + Testing Library, 43 testes):** estrelas, campo de nota
(mouse e teclado), paginação, card de filme, menu de ordenação (mouse e
teclado), extração da cor do pôster, nomes dos gêneros, validação do
formulário, filtros na URL e o cliente da API (token, erros 401 e 422, falha de
rede).

**Outras verificações:** lint com Ruff (Python) e oxlint (TypeScript),
checagem de tipos (`tsc`), `alembic check` e testes manuais de todos os fluxos
no navegador, no computador e no celular.

Como rodar os testes está no README.

---

## 7. Ferramentas usadas

| Ferramenta | Para que serve | Como usei |
|---|---|---|
| Python 3.11+ | Linguagem do backend | Todo o backend |
| FastAPI | Framework web | Rotas, validação, documentação `/docs` |
| Uvicorn | Servidor que roda o FastAPI | `uvicorn app.main:app --reload` |
| Pydantic / pydantic-settings | Validação de dados e leitura do `.env` | Schemas da API e configurações |
| SQLAlchemy 2 (async) + aiosqlite | ORM, conversa com o banco | Modelos e consultas |
| SQLite (+ FTS5) | Banco de dados | Arquivo `rocketlab.db`; busca por título |
| Alembic | Migrações do banco | Criação das tabelas, índices e busca |
| PyJWT | Tokens JWT | Login do administrador |
| pytest, pytest-asyncio, httpx | Testes do backend | Testes chamando a API sem subir servidor |
| Ruff | Lint e formatação Python | Padronizar o código |
| pandas | Análise de dados | Só para analisar os CSVs no começo (fora do projeto) |
| Node.js + npm | Ambiente do frontend | Instalar e rodar |
| Vite | Servidor de desenvolvimento e build | `npm run dev`, `npm run build`, proxy `/api` |
| React 19 + TypeScript | Interface | Todas as telas |
| React Router | Navegação entre páginas | Rotas e filtros na URL |
| TanStack Query | Busca e cache de dados | Hooks em `hooks.ts` |
| React Hook Form + Zod | Formulários e validação | Cadastro de filme e avaliação |
| lucide-react | Ícones | Ícones da interface |
| sonner | Avisos (toasts) | "Avaliação publicada!" etc. |
| Vitest + Testing Library + jsdom | Testes do frontend | Componentes, utilitários, cliente da API |
| oxlint | Lint TypeScript | Padronizar o código |
| Google Fonts | Fontes | Instrument Serif e Instrument Sans |
| Git + GitHub | Versionamento | Repositório do projeto |

---

## 8. Decisões e o que ficou de fora

- **SQLite em vez de PostgreSQL:** era obrigatório e é suficiente para um
  administrador. O ponto fraco (muitas escritas ao mesmo tempo) não aparece
  aqui. Trocar para PostgreSQL seria só mudar a `DATABASE_URL`, exceto a busca
  FTS5, que teria de virar a busca de texto do Postgres.
- **Cache em memória em vez de Redis:** basta com um servidor só. Com vários,
  daria para trocar por Redis mantendo a mesma interface (`get_or_set`).
- **Paginação por página (offset) em vez de cursor:** permite "ir para a
  página N". A desvantagem é ficar mais lenta em páginas muito profundas
  (página 2.000+), o que não é o uso normal.
- **Administrador no `.env` em vez de tabela de usuários:** o enunciado fala de
  um único perfil. Para vários usuários, seria preciso uma tabela com senhas
  criptografadas.
- **Métricas financeiras não editáveis:** vêm do TMDB pelos CSVs; o formulário
  cuida das informações do filme, não da bilheteria.
- **Hospedagem:** o frontend pode ir para a Vercel (o `frontend/vercel.json`
  faz as rotas do React funcionarem ao recarregar a página). O backend precisa
  de um servidor com disco permanente (Render, Railway, Fly.io), porque o banco
  é um arquivo de ~600 MB e a Vercel não guarda arquivos entre requisições.
- **CSVs e banco fora do Git:** somam centenas de MB. Quem clona o projeto
  copia os CSVs para `data/` e roda o `seed.py` (passo a passo no README).
