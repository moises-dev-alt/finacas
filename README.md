# Mr Coin

Sistema web para controle financeiro pessoal e de pequenos negocios, com autenticação Firebase, dados separados por usuario no Firestore, cobranca recorrente pelo Stripe e publicacao via Firebase Hosting.

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
- Checkout, portal e cancelamento de assinatura integrados ao Stripe
- Exportacao CSV, backup e importacao JSON para usuarios Pro
- Perfil com foto, tema e preferencias
- Dados isolados por usuario em `users/{uid}/finance/current`

## Tecnologias

- React 18
- Vite
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Netlify Functions para o backend de assinatura
- Stripe Billing
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
VITE_BILLING_API_URL=https://seu-backend.netlify.app
VITE_APP_URL=https://seu-site.web.app
VITE_PAYMENT_SUPPORT_URL=https://wa.me/SEU_NUMERO_COM_DDI
VITE_PIX_KEY=sua-chave-pix
```

`VITE_BILLING_API_URL` deve conter somente a origem publica do projeto Netlify, sem `/api` no final. O frontend acrescenta os caminhos `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/cancel`, `/api/billing/resume` e `/api/billing/status`. `VITE_APP_URL` e a origem publica do frontend usada no retorno da recuperacao de senha.

Variaveis com o prefixo `VITE_` ficam publicas no JavaScript do navegador. Nunca coloque nelas chaves `sk_...`, credenciais do Firebase Admin, segredos de webhook ou qualquer outro valor privado.

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

## Build

Para gerar a versao de producao:

```bash
npm run build
```

Para validar o contrato do backend e as oito Functions:

```bash
npm test
```

Para visualizar o build localmente:

```bash
npm run preview
```

## Backend de assinatura

O frontend permanece no Firebase Hosting e o backend de assinatura e executado pelas Netlify Functions em `netlify/functions`. Essa separacao permite receber webhooks do Stripe e usar o Firebase Admin SDK sem ativar o Firebase Blaze.

As rotas de usuario exigem `Authorization: Bearer <Firebase ID token>`:

| Metodo | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/api/billing/status` | Sincronizar e consultar a assinatura atual |
| `POST` | `/api/billing/checkout` | Abrir o checkout Pro vinculado ao usuario |
| `POST` | `/api/billing/portal` | Abrir o Customer Portal do Stripe |
| `POST` | `/api/billing/cancel` | Agendar cancelamento para o fim do periodo pago |
| `POST` | `/api/billing/resume` | Desfazer um cancelamento ainda nao efetivado |

O cancelamento administrativo usa `POST /api/admin/subscriptions/{uid}/cancel`, tambem agenda o fim da assinatura no Stripe e exige `admin: true` nos custom claims ou que o UID de quem faz a chamada esteja em `ADMIN_UIDS`. Nao basta mudar o plano no Console Firebase: isso removeria apenas o acesso local e nao interromperia a cobranca.

Usuarios que ja tinham sido ativados como Pro pelo fluxo manual anterior sao mantidos automaticamente como `provider: legacy`. O backend reconhece somente o formato historico valido (`plan: pro`, `status: active`, `upgradedAt` valido e nenhum vinculo Stripe), normaliza o estado para `entitled: true` e `canManage: false` e preserva o acesso aos recursos Pro. Como esse acesso legado nao possui renovacao nem cobranca recorrente no Stripe, ele nao abre o portal e nao oferece acao de cancelamento. Registros Stripe orfaos ou contraditorios nao sao convertidos em legado.

Toda conta criada no Firebase Auth a partir de `PRO_TRIAL_ELIGIBLE_SINCE` recebe automaticamente 7 dias de Pro, sem cartao. O periodo comeca na data canonica de criacao da conta, dura exatamente 7 x 24 horas e pertence ao UID. O backend guarda a concessao imutavel em `trialGrants/{uid}`, usa o relogio do servidor e devolve o plano Free assim que o periodo termina. Nao existe cobranca automatica ao fim desse teste: o usuario so e cobrado se escolher assinar pelo checkout. Uma assinatura Stripe confirmada sempre tem prioridade e o teste nao volta depois de uma assinatura encerrada.

O arquivo `netlify.toml` configura a pasta das Functions, o bundler e o Node.js 22. No painel da Netlify, configure tambem `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` e cadastre estas variaveis com escopo de Functions:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PAYMENT_LINK_URL
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
APP_URL
FRONTEND_ORIGINS
ADMIN_UIDS
PRO_TRIAL_ELIGIBLE_SINCE
```

`ADMIN_UIDS` e opcional e aceita UIDs do Firebase Auth separados por virgula. `FRONTEND_ORIGINS` aceita as origens permitidas por CORS, tambem separadas por virgula. `PRO_TRIAL_ELIGIBLE_SINCE` deve ser uma data ISO 8601 fixa, como `2026-07-14T21:08:19.000Z`; contas anteriores ao corte permanecem sem o teste automatico. Use `backend/.env.example` somente como referencia de nomes; os valores reais devem permanecer nas variaveis protegidas da Netlify e nunca devem ser enviados ao Git.

Depois do deploy, configure no Stripe o webhook HTTPS:

```text
https://seu-backend.netlify.app/api/stripe/webhook
```

Cadastre somente os eventos processados pelo backend:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

O preco mostrado pelo Mr Coin e **R$ 11,99 por mes**, mas a cobranca real e definida no Stripe. Crie um novo Price recorrente mensal em BRL com valor unitario de `1199` centavos e use um Payment Link associado a esse Price em `STRIPE_PAYMENT_LINK_URL`. Nao ative outro periodo gratuito no Payment Link: os 7 dias sem cartao ja sao concedidos pelo aplicativo e os dois beneficios seriam acumulados. A mudanca do Price nao migra automaticamente assinaturas existentes; trate essa migracao separadamente caso elas tambem devam passar a pagar R$ 11,99.

`STRIPE_PAYMENT_LINK_URL` precisa ser exatamente o mesmo Payment Link que gera a sessao de checkout. Uma sessao criada por outro link nao deve liberar o plano Pro.

Nas configuracoes de Checkout e Payment Links do Stripe, ative **limitar clientes a uma assinatura** e mantenha o login do Customer Portal habilitado. O Stripe pode entao reconhecer uma assinatura ativa pelo cliente ou e-mail e redirecionar novas tentativas, reduzindo o risco de duas cobrancas recorrentes para a mesma conta.

Cada clique em **Assinar plano Pro** recebe um identificador `utm_content` unico e abre o checkout em uma nova aba. Isso mantem o site disponivel e evita que o navegador restaure uma Checkout Session individual antiga, que pode estar expirada.

No Payment Link, configure o comportamento depois do pagamento para redirecionar ao site:

```text
https://financas-ed7aa.web.app/?billing=success#assinatura
```

### Ordem da primeira publicacao

1. Crie um site gratuito na Netlify apontando para este projeto.
2. No Firebase Console, em **Configuracoes do projeto > Contas de servico**, gere uma chave do Firebase Admin. Copie `project_id`, `client_email` e `private_key` para as variaveis protegidas da Netlify; nunca envie o JSON pelo chat nem grave-o no repositorio.
3. No Stripe, crie o Price mensal em BRL de `1199` centavos e o Payment Link ao vivo correspondente, sem configurar um segundo trial. Cadastre as demais variaveis da Netlify usando a chave secreta `sk_live_...`, esse Payment Link, o corte fixo `PRO_TRIAL_ELIGIBLE_SINCE` e `FRONTEND_ORIGINS=https://financas-ed7aa.web.app,https://financas-ed7aa.firebaseapp.com`.
4. Faca o primeiro deploy da Netlify e copie a origem recebida, por exemplo `https://mr-coin-billing.netlify.app`.
5. No Stripe em modo ao vivo, crie o webhook com a URL `/api/stripe/webhook` e os seis eventos listados acima. Copie o novo `whsec_...` para `STRIPE_WEBHOOK_SECRET` na Netlify e publique novamente.
6. No `.env` local, defina `VITE_BILLING_API_URL` com a origem da Netlify, sem `/api`, e publique Hosting + regras do Firestore pelo comando da secao Firebase.

As chaves `sk_live_...`, `whsec_...` e a chave privada do Firebase devem ser digitadas diretamente nos paineis protegidos. O frontend precisa somente de `VITE_BILLING_API_URL`; nenhuma chave secreta pode usar o prefixo `VITE_`.

O endpoint de saude pode ser usado para conferir o deploy:

```text
GET https://seu-backend.netlify.app/api/billing/health
```

Para testar localmente com a Netlify CLI e a Stripe CLI:

```bash
netlify dev
stripe listen --forward-to http://localhost:8888/api/stripe/webhook
```

Use o segredo `whsec_...` exibido pela Stripe CLI apenas no ambiente local. O comando `stripe trigger checkout.session.completed` nao inclui necessariamente o Payment Link e o UID esperados pelo Mr Coin; valide o fluxo completo abrindo o checkout de teste por `/api/billing/checkout`. O webhook deve validar a assinatura sobre o corpo bruto, processar cada `event.id` de forma idempotente e nao depender da ordem de entrega dos eventos.

## Firebase

Projeto Firebase configurado:

```text
financas-ed7aa
```

Servicos usados:

- Firebase Hosting
- Firebase Authentication
- Cloud Firestore

O banco Firestore padrao `(default)` usa regras versionadas em `firestore.rules`. Cada usuario pode ler e alterar os proprios dados financeiros, mas nao pode alterar nem apagar `users/{uid}/finance/current.subscription`. Um documento novo pode omitir esse mapa (o backend interpreta a ausencia como Free) ou grava-lo somente com o estado Free neutro. Depois disso, apenas o backend com Firebase Admin SDK pode ativar, cancelar ou reativar o plano Pro. As concessoes em `trialGrants/{uid}` e as travas em `checkoutAttempts/{uid}` sao privadas e nao devem receber regra de acesso para o cliente. O Admin SDK ignora as regras do cliente, por isso suas credenciais devem existir apenas no backend.

Antes de publicar, confirme no Console Firebase que o provedor `E-mail/Senha` esta ativo em Authentication > Sign-in method.

Deploy completo:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes --project financas-ed7aa
```

Deploy somente do Hosting:

```bash
firebase deploy --only hosting --project financas-ed7aa
```

Deploy somente das regras do Firestore:

```bash
firebase deploy --only firestore:rules --project financas-ed7aa
```

## Backend Python

A pasta `backend` contem uma API local com SQLite, mantida como alternativa para testes locais. Ela nao processa pagamentos; o backend de assinatura publicado usa as Netlify Functions.

Para executar:

```bash
python backend/server.py
```

## Estrutura

```text
.
├── backend/              # API local alternativa em Python + SQLite
├── netlify/functions/    # API segura de assinatura e webhook do Stripe
├── src/                  # Aplicacao React
│   ├── App.jsx           # Telas, regras de negocio e integracao com Firestore
│   ├── firebase.js       # Configuracao Firebase
│   ├── main.jsx          # Entrada da aplicacao
│   └── styles.css        # Estilos principais
├── firebase.json         # Configuracao do Firebase Hosting e Firestore
├── firestore.rules       # Regras de seguranca do Firestore
├── firestore.indexes.json
├── netlify.toml          # Build e runtime das Netlify Functions
├── package.json
└── vite.config.js
```

## Arquivos ignorados

Estes arquivos e pastas nao sobem para o GitHub porque sao gerados localmente ou contem configuracao sensivel:

- `node_modules`
- `dist`
- `.env`
- `.firebase`
- `.netlify`
- `firebase-debug.log`
- `vite-dev*.log`
- `backend/financas.db`
- `backend/__pycache__/`
- `backend/.env*` (exceto `backend/.env.example`)
- credenciais JSON de service account dentro de `backend/`
