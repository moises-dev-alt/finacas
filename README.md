# Financas

Sistema web para controle financeiro pessoal e de pequenos negocios, com autenticação Firebase, dados separados por usuario no Firestore e publicacao via Firebase Hosting.

## Site publicado

Acesse o projeto em: [https://financas-ed7aa.firebaseapp.com/](https://financas-ed7aa.firebaseapp.com/)

## Recursos

- Landing page com chamada para cadastro e login
- Cadastro e login com Firebase Authentication
- Dashboard com indicadores financeiros
- Controle de receitas e despesas
- Relatorios com graficos usando Chart.js
- Metas financeiras
- Contas a pagar
- Agendamentos mensais
- Categorias personalizadas
- Plano Free e Pro
- Exportacao CSV, backup e importacao JSON para usuarios Pro
- Perfil com foto, tema e preferencias
- Dados isolados por usuario em `users/{uid}/finance/current`

## Tecnologias

- React 18
- Vite
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Chart.js
- Python + SQLite como backend local alternativo

## Como rodar localmente

Instale as dependencias:

```bash
npm install
```

Crie um arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Configure as variaveis:

```env
VITE_PRO_CHECKOUT_URL=https://seu-link-de-checkout.com/plano-pro
VITE_PAYMENT_SUPPORT_URL=https://wa.me/5500000000000
VITE_PIX_KEY=sua-chave-pix
VITE_ADMIN_ACTIVATION_CODE=troque-este-codigo
```

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

## Build

Para gerar a versao de producao:

```bash
npm run build
```

Para visualizar o build localmente:

```bash
npm run preview
```

## Firebase

Projeto Firebase configurado:

```text
financas-ed7aa
```

Servicos usados:

- Firebase Hosting
- Firebase Authentication
- Cloud Firestore

O banco Firestore padrao `(default)` usa regras versionadas em `firestore.rules`, permitindo que cada usuario leia e altere apenas seus proprios dados.

Antes de publicar, confirme no Console Firebase que o provedor `E-mail/Senha` esta ativo em Authentication > Sign-in method.

Deploy completo:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes --project financas-ed7aa
```

Deploy somente do Hosting:

```bash
firebase deploy --only hosting --project financas-ed7aa
```

## Backend Python

A pasta `backend` contem uma API local com SQLite, mantida como alternativa para testes locais. O frontend publicado usa Firebase diretamente.

Para executar:

```bash
python backend/server.py
```

## Estrutura

```text
.
├── backend/              # API local alternativa em Python + SQLite
├── src/                  # Aplicacao React
│   ├── App.jsx           # Telas, regras de negocio e integracao com Firestore
│   ├── firebase.js       # Configuracao Firebase
│   ├── main.jsx          # Entrada da aplicacao
│   └── styles.css        # Estilos principais
├── firebase.json         # Configuracao do Firebase Hosting e Firestore
├── firestore.rules       # Regras de seguranca do Firestore
├── firestore.indexes.json
├── package.json
└── vite.config.js
```

## Arquivos ignorados

Estes arquivos e pastas nao sobem para o GitHub porque sao gerados localmente ou contem configuracao sensivel:

- `node_modules`
- `dist`
- `.env`
- `.firebase`
- `firebase-debug.log`
- `vite-dev*.log`
- `backend/financas.db`
- `backend/__pycache__/`
