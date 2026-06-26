# Backend Python

API simples em Python com SQLite para o sistema de financas.

## Rodar localmente

```bash
python backend/server.py
```

A API fica em:

```text
http://localhost:8000/api/finance
```

O arquivo `backend/financas.db` e criado automaticamente na primeira execucao.

## Rotas

- `GET /api/finance`
- `POST /api/incomes`
- `POST /api/expenses`
- `POST /api/bills`
- `POST /api/goals`
- `POST /api/settings`
- `DELETE /api/incomes/:id`
- `DELETE /api/expenses/:id`
- `DELETE /api/bills/:id`
- `DELETE /api/goals/:id`

## Deploy

Firebase Hosting hospeda o front React estatico. Para rodar Python em producao, publique este backend em um servico que execute Python, como Cloud Run, Render ou Railway, e configure no front:

```bash
VITE_API_URL=https://sua-api.com npm run build
```
