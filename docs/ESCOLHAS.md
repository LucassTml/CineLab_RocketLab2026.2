# Escolhas do projeto

A stack (FastAPI, SQLite, React e Vite) já vinha definida no enunciado da
atividade. Aqui explico o que cada uma trouxe para o projeto e como usei.

## FastAPI (backend)

O repositório base do RocketLab já vinha com FastAPI + SQLAlchemy + Alembic,
então mantive a mesma organização de pastas: `api/v1` para as rotas, `core`
para configuração e segurança, `db` para a conexão e `movies` para os modelos
e as regras de negócio.

O que mais ajudou:

- Validação com Pydantic. Eu declaro as regras no schema (ano entre 1888 e
  2100, nota de 1 a 10, título obrigatório...) e o FastAPI já responde 422 com
  o erro do campo, sem precisar escrever `if` para cada caso.
- Documentação automática em `/docs`. Deu para testar todas as rotas antes do
  frontend existir.
- `Depends` para proteger as rotas. Toda rota que altera algo recebe
  `_admin: AdminUser`, que valida o token JWT do login.
- Suporte a `async`. Usei o SQLAlchemy assíncrono (aiosqlite), que já era o
  padrão da base.

## SQLite (banco de dados)

É um arquivo só (`backend/rocketlab.db`), não precisa instalar servidor, o que
facilita para quem for corrigir. Mesmo sendo simples, aguentou bem os dados:
95 mil filmes, 424 mil pessoas e 745 mil ligações filme-pessoa (a carga dos
CSVs leva mais ou menos 1 minuto).

- Para o catálogo ficar rápido precisei criar índices. Antes, ordenar por
  popularidade levava uns 700 ms; depois dos índices e de reorganizar as
  consultas, ficou abaixo de 1 ms.
- A busca por título usa o FTS5, que é a busca de texto que já vem dentro do
  SQLite. Ela ignora acentos e maiúsculas e busca por prefixo ("matr" acha
  Matrix). Não precisei de nenhuma ferramenta a mais.
- O ponto fraco do SQLite é muita escrita ao mesmo tempo, o que não acontece
  aqui (só existe um administrador). Liguei o modo WAL para leitura e escrita
  não se bloquearem.
- As tabelas só são criadas pelo Alembic, como a base pedia. Criei a migração
  `0002` para a busca e os índices.

## React (frontend)

Separei a interface em componentes reutilizáveis (card de filme, estrelas,
paginação, avaliações), que também aparecem no Storybook. Bibliotecas que usei
junto:

- React Router para as páginas. Os filtros do catálogo ficam na URL, então o
  botão voltar funciona e dá para mandar o link de uma busca para alguém.
- TanStack Query (React Query) para buscar os dados. Ele guarda as respostas em
  cache: voltar para uma página já vista não faz outra requisição, e depois de
  salvar algo eu só invalido o que mudou (a média do filme, o catálogo...).
- React Hook Form + Zod nos formulários, com as mesmas regras de validação da
  API, para o erro aparecer na hora.

## Vite

- Sobe o servidor de desenvolvimento em menos de 1 segundo e atualiza a tela
  ao salvar o arquivo.
- Proxy no `vite.config.ts`: o frontend chama `/api` e o Vite repassa para o
  FastAPI na porta 8000, então em desenvolvimento não tem problema de CORS.
- Os testes (Vitest) e o Storybook usam o próprio Vite, então é uma
  configuração só para tudo.
- As páginas além do catálogo são carregadas só quando abertas (lazy).

## Outras decisões

- **Notas**: o banco e os CSVs usam 0 a 10. No site aparecem estrelas de 0,5 a
  5 (nota dividida por 2), com meias estrelas como no Letterboxd.
- **Média de cada filme**: fica guardada na tabela `dim_reviews` e é
  recalculada toda vez que uma avaliação entra ou sai. Assim dá para ordenar o
  catálogo por nota sem recalcular a média de todos os filmes.
- **Login**: como só existe o perfil de administrador, o usuário e a senha
  ficam no `.env` e o login devolve um token JWT. Ver o catálogo não precisa de
  login; cadastrar, editar, remover e avaliar precisa.
- **Problemas nos CSVs**: o `dim_reviews.csv` não batia com as avaliações
  individuais (recalculei tudo a partir delas); em uns 2 mil filmes as colunas
  de pessoas vieram trocadas (diretor "English", ator "7.8"), e removi esses
  vínculos; várias sinopses e títulos vieram com aspas duplicadas e numerais
  romanos errados ("Grizzly Ii"). Tudo isso é tratado no `backend/app/seed.py`.
- **Testes**: pytest no backend (61 testes, rodando as migrações de verdade num
  banco temporário) e Vitest no frontend (33 testes).
