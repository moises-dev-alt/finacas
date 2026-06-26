# Financas

Sistema pessoal de controle financeiro com front em React e backend em Python.

## Frontend

```bash
npm install
npm run dev
```

Para gerar o site que o Firebase Hosting publica:

```bash
npm run build
firebase deploy
```

## Backend Python

```bash
python backend/server.py
```

A API usa SQLite e cria automaticamente o banco em `backend/financas.db`.

## Integracao

Em desenvolvimento, o React tenta usar:

```text
http://localhost:8000
```

Se a API nao estiver ligada, o app continua funcionando com `localStorage`.

Em producao, publique o backend Python em Cloud Run, Render ou Railway e gere o build com:

```bash
VITE_API_URL=https://sua-api.com npm run build
```

## Telas

- Dashboard
- Receitas
- Despesas
- Relatorios
- Metas
- Contas a Pagar
- Configuracoes
