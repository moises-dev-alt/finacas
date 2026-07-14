const DEFAULT_APP_URL = 'https://financas-ed7aa.web.app';

const DEFAULT_FRONTEND_ORIGINS = [
  'https://financas-ed7aa.web.app',
  'https://financas-ed7aa.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

function clean(value) {
  return String(value || '').trim();
}

function required(name) {
  const value = clean(process.env[name]);
  if (!value) {
    const error = new Error(`Configuracao obrigatoria ausente: ${name}`);
    error.code = 'configuration_missing';
    throw error;
  }
  return value;
}

const PRIVATE_KEY_BEGIN = '-----BEGIN PRIVATE KEY-----';
const PRIVATE_KEY_END = '-----END PRIVATE KEY-----';

function normalizedFirebasePrivateKey(value) {
  const normalized = clean(value)
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '');
  const begin = normalized.indexOf(PRIVATE_KEY_BEGIN);
  const end = normalized.indexOf(PRIVATE_KEY_END, begin + PRIVATE_KEY_BEGIN.length);

  if (begin >= 0 && end >= begin) {
    return normalized.slice(begin, end + PRIVATE_KEY_END.length).trim();
  }

  return normalized;
}

function normalizedFirebaseClientEmail(value) {
  const normalized = clean(value);
  const match = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.iam\.gserviceaccount\.com/i);
  return match?.[0] || normalized.replace(/^['\"]|['\",]+$/g, '');
}

function isLocalRuntime() {
  return process.env.NETLIFY_DEV === 'true'
    || process.env.CONTEXT === 'dev'
    || process.env.NODE_ENV === 'development';
}

function safeAppUrl() {
  const candidate = clean(process.env.APP_URL) || DEFAULT_APP_URL;
  try {
    const url = new URL(candidate);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) throw new Error('invalid protocol');
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    const error = new Error('APP_URL precisa ser uma URL HTTPS valida.');
    error.code = 'configuration_invalid';
    throw error;
  }
}

export function firebaseCredentials() {
  return {
    projectId: required('FIREBASE_PROJECT_ID'),
    clientEmail: normalizedFirebaseClientEmail(required('FIREBASE_CLIENT_EMAIL')),
    privateKey: normalizedFirebasePrivateKey(required('FIREBASE_PRIVATE_KEY')),
  };
}

export function stripeSecretKey() {
  return required('STRIPE_SECRET_KEY');
}

export function stripeWebhookSecret() {
  return required('STRIPE_WEBHOOK_SECRET');
}

export function configuredPaymentLinkUrl() {
  const primary = clean(process.env.STRIPE_PAYMENT_LINK_URL);
  const localFallback = isLocalRuntime() ? clean(process.env.VITE_PRO_CHECKOUT_URL) : '';
  return primary || localFallback || required('STRIPE_PAYMENT_LINK_URL');
}

export function appUrl() {
  return safeAppUrl();
}

export function allowedOrigins() {
  const configured = clean(process.env.FRONTEND_ORIGINS)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  const origins = new Set([...DEFAULT_FRONTEND_ORIGINS, ...configured]);
  try {
    origins.add(new URL(safeAppUrl()).origin);
  } catch {
    // APP_URL validation is performed when a route needs a return URL.
  }
  return origins;
}

export function adminUids() {
  return new Set(clean(process.env.ADMIN_UIDS).split(',').map(uid => uid.trim()).filter(Boolean));
}

export function configurationHealth() {
  return {
    firebase: Boolean(clean(process.env.FIREBASE_PROJECT_ID)
      && clean(process.env.FIREBASE_CLIENT_EMAIL)
      && clean(process.env.FIREBASE_PRIVATE_KEY)),
    stripe: Boolean(clean(process.env.STRIPE_SECRET_KEY)),
    webhook: Boolean(clean(process.env.STRIPE_WEBHOOK_SECRET)),
    paymentLink: Boolean(clean(process.env.STRIPE_PAYMENT_LINK_URL)
      || (isLocalRuntime() && clean(process.env.VITE_PRO_CHECKOUT_URL))),
  };
}
