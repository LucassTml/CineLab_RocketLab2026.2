# CineLab

Sistema de avaliação de filmes feito para a Atividade DEV do Visagio RocketLab
2026.2, inspirado no Letterboxd. O administrador navega pelo catálogo, vê os
detalhes e as avaliações de cada filme, cadastra, edita e remove filmes e
adiciona notas e resenhas.

- **Backend:** FastAPI + SQLAlchemy + Alembic (Python)
- **Banco de dados:** SQLite
- **Frontend:** React + TypeScript com Vite

O motivo de cada escolha está em [docs/ESCOLHAS.md](docs/ESCOLHAS.md).

## Funcionalidades

Requisitos da atividade:

- cadastro de filmes (título, diretor, ano, gênero, sinopse e outros campos);
- catálogo paginado com todos os filmes;
- página de detalhes com as informações completas e a lista de avaliações;
- barra de pesquisa (para buscar vários filmes, separe por vírgula: `matrix, toy story`);
- edição e remoção de filmes;
- nova avaliação com nota de 0,5 a 5 estrelas e resenha;
- média das avaliações de cada filme.

Extras: login do administrador (JWT), filtros (gênero, ano, nota, status,
pessoa e produtora), ordenação, dashboard com gráficos, filmes semelhantes,
tema claro/escuro, layout para celular, cache e testes.

## Estrutura

```text
backend/
  app/
    api/v1/       rotas: filmes e avaliações, login, catálogo (gêneros/pessoas), dashboard
    core/         configurações, login JWT, cache e erros
    db/           conexão com o banco
    movies/       modelos (SQLAlchemy), schemas (Pydantic) e regras de negócio
    main.py       cria o app FastAPI
    seed.py       carrega os CSVs no banco
  migrations/     migrações do Alembic
  tests/          testes (pytest)
frontend/
  src/
    components/   componentes (card de filme, estrelas, busca, formulário...)
    pages/        páginas (catálogo, filme, cadastro/edição, dashboard, login)
    tests/        testes (Vitest)
    api.ts        chamadas para a API
    hooks.ts      React Query, filtros na URL e outros hooks
docs/
  ESCOLHAS.md     explicação das escolhas
```

## Como executar

Precisa de **Python 3.11+** e **Node.js 20.19+**.

### 1. Dados

Crie uma pasta `data/` na raiz do projeto e copie para ela os CSVs das pastas
`bases_atv_dev1` e `bases_atv_dev_2` (dá para copiar as duas pastas inteiras).
Os CSVs não vão para o Git porque são grandes (~230 MB).

### 2. Backend (terminal 1)

No Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

No Linux/macOS é igual, trocando a ativação por `source .venv/bin/activate` e o
`copy` por `cp`.

- `alembic upgrade head` cria as tabelas;
- `python -m app.seed` carrega os CSVs (leva ~1 minuto). Se os CSVs estiverem
  em outra pasta: `python -m app.seed --data-dir CAMINHO`. Para apagar e
  carregar de novo: `python -m app.seed --reset`.

A API fica em http://localhost:8000 e a documentação (Swagger) em
http://localhost:8000/docs.

### 3. Frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

O site abre em http://localhost:5173.

### 4. Login de administrador

Ver o catálogo não precisa de login. Para cadastrar, editar, remover e avaliar,
clique em **Entrar**. O usuário e a senha ficam no `backend/.env`
(`ADMIN_USERNAME` e `ADMIN_PASSWORD`; os valores padrão estão no `.env.example`).


## Testes

```bash
# backend (com o venv ativo)
cd backend
pytest
ruff check .

# frontend
cd frontend
npm test
npm run lint
```

## Rotas da API

Todas começam com `/api/v1`. As marcadas com (admin) precisam do token.

- `POST /auth/login`: login, devolve o token
- `GET /movies`: catálogo (parâmetros: `q`, `genero`, `ano_min`, `ano_max`,
  `nota_min`, `status`, `pessoa`, `produtora`, `sort`, `order`, `page`, `page_size`)
- `POST /movies` (admin): cadastra filme
- `GET /movies/{id}`: detalhes do filme com a média e a distribuição das notas
- `PATCH /movies/{id}` (admin): edita filme
- `DELETE /movies/{id}` (admin): remove filme e suas avaliações
- `GET /movies/{id}/similar`: filmes semelhantes
- `GET /movies/{id}/reviews`: avaliações do filme
- `POST /movies/{id}/reviews` (admin): nova avaliação
- `DELETE /movies/{id}/reviews/{review_id}` (admin): remove avaliação
- `GET /genres`, `GET /people`, `GET /companies`: usados nos filtros e no formulário
- `GET /stats`: dados do dashboard
