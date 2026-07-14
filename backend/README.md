# Backend Python

API simples em Python com SQLite, mantida apenas como alternativa local para testes do sistema de financas. O frontend React atual usa Firebase diretamente, e as assinaturas sao processadas pelas Netlify Functions; esta API nao participa do fluxo publicado.

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

## Uso em outro ambiente

Para adotar esta API em outro frontend ou ambiente, sera necessario criar explicitamente a integracao HTTP correspondente. O aplicativo atual nao le `VITE_API_URL`. Consulte o README principal para o fluxo de producao com Firebase, Netlify Functions e Stripe.
