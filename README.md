# EcoMove SPA (Simulado SAEP)

Aplicação SPA construída com **Node.js + Express + HTML5 + CSS3 + JavaScript**, com persistência em **PostgreSQL**.

## Funcionalidades

- Login por modal com validações e mensagens de erro.
- Listagem paginada de atividades (4 por página).
- Filtros por tipo de atividade.
- Curtir/descurtir com regra de 1 like por usuário.
- Comentários com validação de mínimo 2 caracteres.
- Cadastro de novas atividades para usuário logado.
- Conversão de metros para km e minutos para horas na interface.
- Dados iniciais importados de `data/usuarios.csv` e `data/atividades.csv`.

## Configuração do banco (PostgreSQL)

A aplicação conecta primeiro no banco administrativo (`postgres`, por padrão) para
verificar/criar o banco `ecomove` e, em seguida, cria automaticamente as
tabelas e a população inicial.

Variáveis de ambiente opcionais:

- `DB_HOST` (padrão: `127.0.0.1`)
- `DB_PORT` (padrão: `5432`)
- `DB_USER` (padrão: `postgres`)
- `DB_PASSWORD` (padrão: `YamahaV1r4g0` — troque em produção)
- `DB_NAME` (padrão: `ecomove`)
- `DB_ADMIN_DATABASE` (padrão: `postgres`) — banco usado apenas para checar/criar `DB_NAME`

Pré-requisito: um servidor PostgreSQL acessível com o usuário informado
tendo permissão para criar bancos de dados (`CREATEDB`).

## Como executar

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Usuários para teste

- `usuario01@ecomove.com` / `123456`
- `usuario02@ecomove.com` / `123456`
- `usuario03@ecomove.com` / `123456`
