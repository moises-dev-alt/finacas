# Financas

Sistema pessoal de controle financeiro com front em React, login/cadastro com Firebase Authentication e banco de dados Firestore.

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

## Firebase

Projeto configurado:

```text
financas-ed7aa
```

O app usa:

- Firebase Hosting
- Firebase Authentication
- Cloud Firestore

O banco Firestore padrao `(default)` foi criado na regiao `nam5`. As regras ficam versionadas em `firestore.rules` e permitem que cada usuario leia e edite apenas seus proprios dados em `users/{uid}`.

Para publicar tudo:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes --project financas-ed7aa
```

No Console Firebase, confirme que o provedor `E-mail/Senha` esta ativo em Authentication > Sign-in method.

## Backend Python

```bash
python backend/server.py
```

A API Python com SQLite continua no projeto como alternativa local, mas o front hospedado usa Firestore diretamente.

## Pastas que nao sobem para o GitHub

Algumas pastas ficam fora do repositorio de proposito:

- `node_modules`: recriada com `npm install`
- `dist`: recriada com `npm run build`
- `.firebase`: cache local do Firebase
- `backend/financas.db`: banco local gerado pela API
- `backend/__pycache__`: cache do Python

## Integracao

Ao cadastrar um usuario, o app cria automaticamente o documento inicial em `users/{uid}/finance/current`.

## Telas

- Login
- Cadastro
- Dashboard
- Receitas
- Despesas
- Relatorios
- Metas
- Contas a Pagar
- Configuracoes
