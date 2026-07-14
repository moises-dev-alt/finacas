import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  billingApiConfigured,
  billingRedirectUrl,
  cancelBillingSubscription,
  createBillingCheckout,
  createBillingPortal,
  getBillingStatus,
  resumeBillingSubscription,
} from './billingApi';
import mrCoinLogo from './assets/mr-coin-logo.png';

Chart.register(...registerables);

const paymentSupportUrl = import.meta.env.VITE_PAYMENT_SUPPORT_URL || '';
const pixKey = import.meta.env.VITE_PIX_KEY || '';
const appBaseUrl = import.meta.env.VITE_APP_URL || 'https://financas-ed7aa.web.app';

const plans = {
  free: {
    name: 'Free',
    price: 'R$ 0',
    description: 'Para testar o sistema e controlar o essencial.',
    limits: {
      transactions: 10,
      bills: 3,
      goals: 1,
    },
    features: ['Dashboard', 'Receitas e despesas limitadas', 'Contas basicas', '1 meta financeira'],
  },
  pro: {
    name: 'Pro',
    price: 'R$ 29/mês',
    description: 'Para usar todos os recursos e vender como solução completa.',
    limits: {
      transactions: Infinity,
      bills: Infinity,
      goals: Infinity,
    },
    features: ['Transações ilimitadas', 'Relatórios completos', 'Metas ilimitadas', 'Agendamentos', 'Backup e exportação'],
  },
};

const seedData = {
  incomes: [
    { id: 1, date: '2026-06-05', description: 'Salario', category: 'Trabalho', value: 5000 },
    { id: 2, date: '2026-06-12', description: 'Freelance', category: 'Extra', value: 850 },
    { id: 3, date: '2026-06-01', description: 'Venda de Produto', category: 'Vendas', value: 250 },
  ],
  expenses: [
    { id: 4, date: '2026-06-03', description: 'Mercado', category: 'Alimentacao', value: 420 },
    { id: 5, date: '2026-06-10', description: 'Netflix', category: 'Assinaturas', value: 39.9 },
    { id: 6, date: '2026-06-15', description: 'Internet', category: 'Contas', value: 99.9 },
    { id: 7, date: '2026-06-18', description: 'Transporte', category: 'Transporte', value: 150 },
  ],
  bills: [
    { id: 1, due_date: '2026-06-15', name: 'Internet', value: 99, status: 'Pendente' },
    { id: 2, due_date: '2026-06-20', name: 'Energia', value: 180, status: 'Pendente' },
    { id: 3, due_date: '2026-06-25', name: 'Cartao de Credito', value: 850, status: 'Pago' },
    { id: 4, due_date: '2026-06-30', name: 'Agua', value: 75, status: 'Pendente' },
  ],
  goals: [
    { id: 1, name: 'Viagem', target: 8000, current: 3200, icon: 'plane' },
    { id: 2, name: 'Emergencia', target: 20000, current: 12000, icon: 'shield' },
    { id: 3, name: 'Casa Propria', target: 50000, current: 15500, icon: 'home' },
  ],
  schedules: [],
  categories: {
    incomes: ['Trabalho', 'Extra', 'Vendas'],
    expenses: ['Alimentacao', 'Assinaturas', 'Contas', 'Transporte'],
  },
  settings: {
    name: 'Joao Silva',
    email: 'joaosilva@email.com',
    currency: 'BRL',
    theme: 'light',
    photo: '',
  },
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'receitas', label: 'Receitas', icon: '💰' },
  { id: 'despesas', label: 'Despesas', icon: '💸' },
  { id: 'relatorios', label: 'Relatórios', icon: '📈' },
  { id: 'metas', label: 'Metas', icon: '🎯' },
  { id: 'contas', label: 'Contas a Pagar', icon: '🧾' },
  { id: 'agendamentos', label: 'Agendamentos', icon: '📅' },
  { id: 'assinatura', label: 'Assinatura', icon: '💎' },
  { id: 'configuracoes', label: 'Configurações', icon: '⚙️' },
];

const actionIcons = {
  edit: '✏️',
  delete: '🗑️',
  paid: '✅',
  pending: '↩️',
  pause: '⏸️',
  play: '▶️',
};

const goalIcons = {
  goal: '🎯',
  plane: '✈️',
  shield: '🛡️',
  home: '🏠',
};

const monthOptions = [
  { label: 'Janeiro', value: '01', short: 'Jan' },
  { label: 'Fevereiro', value: '02', short: 'Fev' },
  { label: 'Marco', value: '03', short: 'Mar' },
  { label: 'Abril', value: '04', short: 'Abr' },
  { label: 'Maio', value: '05', short: 'Mai' },
  { label: 'Junho', value: '06', short: 'Jun' },
  { label: 'Julho', value: '07', short: 'Jul' },
  { label: 'Agosto', value: '08', short: 'Ago' },
  { label: 'Setembro', value: '09', short: 'Set' },
  { label: 'Outubro', value: '10', short: 'Out' },
  { label: 'Novembro', value: '11', short: 'Nov' },
  { label: 'Dezembro', value: '12', short: 'Dez' },
];

const emptyFinanceData = {
  incomes: [],
  expenses: [],
  bills: [],
  goals: [],
  schedules: [],
  categories: seedData.categories,
  settings: seedData.settings,
  subscription: {
    plan: 'free',
    status: 'active',
    entitled: null,
    provider: null,
    stripeStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    cancelAt: null,
    canManage: null,
    checkoutStartedAt: null,
    upgradedAt: null,
    canceledAt: null,
    syncedAt: null,
  },
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function initials(name, email) {
  const source = String(name || email || 'Usuario').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatLimit(value) {
  return value === Infinity ? 'Ilimitado' : value;
}

function normalizeSubscription(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...emptyFinanceData.subscription,
    ...source,
    plan: source.plan === 'pro' ? 'pro' : 'free',
    status: source.status || 'active',
    entitled: typeof source.entitled === 'boolean' ? source.entitled : null,
    cancelAtPeriodEnd: Boolean(source.cancelAtPeriodEnd ?? source.cancel_at_period_end),
    currentPeriodEnd: source.currentPeriodEnd || source.current_period_end || null,
    canManage: typeof source.canManage === 'boolean' ? source.canManage : null,
  };
}

function planLabel(subscription) {
  return isProSubscription(subscription) ? 'Pro' : 'Free';
}

function subscriptionFromBillingPayload(payload) {
  const candidate = payload?.subscription || payload?.data?.subscription || payload?.data || payload;
  if (!candidate || typeof candidate !== 'object') return null;
  const hasSubscriptionField = [
    'plan',
    'status',
    'entitled',
    'cancelAtPeriodEnd',
    'cancel_at_period_end',
    'currentPeriodEnd',
    'current_period_end',
  ].some(field => Object.prototype.hasOwnProperty.call(candidate, field));
  return hasSubscriptionField ? normalizeSubscription(candidate) : null;
}

function formatSubscriptionDate(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : typeof value?.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function financeWritePayload(value) {
  const { subscription: _subscription, ...financeData } = value || {};
  return financeData;
}

function moneyValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

function dayValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(Math.max(number, 1), 31);
}

function formatDate(date) {
  if (!date) return '-';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function monthNumber(label) {
  return monthOptions.find(month => month.label === label)?.value
    || monthOptions[new Date().getMonth()]?.value
    || '01';
}

function monthLabelFromDate(date) {
  const month = date?.slice(5, 7);
  return monthOptions.find(item => item.value === month)?.label
    || monthOptions[new Date().getMonth()]?.label
    || 'Janeiro';
}

function inPeriod(date, filters) {
  return datePeriod(date) === periodKey(filters);
}

function periodKey(filters) {
  return `${filters.year}-${monthNumber(filters.month)}`;
}

function datePeriod(date) {
  const match = String(date || '').match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) return '';

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const isValid = parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
  return isValid ? `${year}-${month}` : '';
}

function selectableYears(selectedYear) {
  const actualYear = new Date().getFullYear();
  const parsedSelectedYear = Number(selectedYear);
  const safeSelectedYear = Number.isInteger(parsedSelectedYear) ? parsedSelectedYear : actualYear;
  const newestYear = Math.max(actualYear, safeSelectedYear);
  const oldestYear = Math.min(actualYear - 9, safeSelectedYear);
  return Array.from({ length: newestYear - oldestYear + 1 }, (_, index) => String(newestYear - index));
}

function balanceBeforePeriod(incomes, expenses, targetPeriod) {
  const previousIncomes = incomes.filter(item => {
    const itemPeriod = datePeriod(item.date);
    return itemPeriod && itemPeriod < targetPeriod;
  });
  const previousExpenses = expenses.filter(item => {
    const itemPeriod = datePeriod(item.date);
    return itemPeriod && itemPeriod < targetPeriod;
  });

  return sumValues(previousIncomes) - sumValues(previousExpenses);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayParts(today = new Date()) {
  return {
    year: String(today.getFullYear()),
    month: pad2(today.getMonth() + 1),
    day: today.getDate(),
  };
}

function todayIsoDate(today = new Date()) {
  const parts = todayParts(today);
  return `${parts.year}-${parts.month}-${pad2(parts.day)}`;
}

function lastDayOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function scheduleDate(schedule, parts = todayParts()) {
  const day = Math.min(Number(schedule.day || 1), lastDayOfMonth(parts.year, parts.month));
  return `${parts.year}-${parts.month}-${pad2(day)}`;
}

function sumValues(items) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function sortByDate(items, key = 'date') {
  return [...items].sort((a, b) => new Date(b[key]) - new Date(a[key]));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function asCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function loadLocalData() {
  try {
    return JSON.parse(localStorage.getItem('financeData')) || seedData;
  } catch {
    return seedData;
  }
}

function createEmptyFinanceData(user) {
  return {
    ...emptyFinanceData,
    categories: {
      incomes: [...seedData.categories.incomes],
      expenses: [...seedData.categories.expenses],
    },
    settings: {
      ...seedData.settings,
      name: user?.displayName || 'Usuario',
      email: user?.email || '',
    },
    subscription: { ...emptyFinanceData.subscription },
  };
}

function normalizeFinanceData(payload, user) {
  const source = payload || createEmptyFinanceData(user);
  const mergedCategories = {
    incomes: uniqueSorted([...(source?.categories?.incomes || []), ...seedData.categories.incomes]),
    expenses: uniqueSorted([...(source?.categories?.expenses || []), ...seedData.categories.expenses]),
  };

  return {
    ...emptyFinanceData,
    ...source,
    incomes: Array.isArray(source?.incomes) ? source.incomes : [],
    expenses: Array.isArray(source?.expenses) ? source.expenses : [],
    bills: Array.isArray(source?.bills) ? source.bills : [],
    goals: Array.isArray(source?.goals) ? source.goals : [],
    schedules: Array.isArray(source?.schedules) ? source.schedules : [],
    categories: mergedCategories,
    settings: {
      ...seedData.settings,
      ...source?.settings,
      name: source?.settings?.name || user?.displayName || 'Usuario',
      email: source?.settings?.email || user?.email || '',
    },
    subscription: normalizeSubscription(source?.subscription),
  };
}

function usageFromData(data) {
  return {
    transactions: (data.incomes?.length || 0) + (data.expenses?.length || 0),
    bills: data.bills?.length || 0,
    goals: data.goals?.length || 0,
  };
}

function isProSubscription(subscription) {
  if (typeof subscription?.entitled === 'boolean') return subscription.entitled;
  return subscription?.plan === 'pro' && subscription?.status === 'active';
}

function isLegacyProSubscription(subscription) {
  const provider = String(subscription?.provider || '').trim().toLowerCase();
  return isProSubscription(subscription)
    && (provider === 'legacy' || (!provider && Boolean(subscription?.upgradedAt)));
}

function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch {
        reject(new Error('Arquivo de backup inválido.'));
      }
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsText(file);
  });
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem.'));
      return;
    }
    if (file.size > 350 * 1024) {
      reject(new Error('A imagem precisa ter ate 350 KB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'));
    reader.readAsDataURL(file);
  });
}

function Icon({ name }) {
  return <span className={`app-icon app-icon-${name}`} aria-hidden="true" />;
}

function UserAvatar({ settings, size = 'sm' }) {
  const label = initials(settings?.name, settings?.email);
  return (
    <span className={`avatar avatar-${size}`} aria-label={`Perfil de ${settings?.name || settings?.email || 'usuario'}`}>
      {settings?.photo ? <img src={settings.photo} alt="" /> : label}
    </span>
  );
}

function BrandLogo({ variant = 'default' }) {
  return (
    <span className={`mr-coin-logo mr-coin-logo-${variant}`} role="img" aria-label="Mr Coin">
      <img src={mrCoinLogo} alt="" aria-hidden="true" width="2000" height="2000" draggable="false" />
    </span>
  );
}

function userFinanceRef(userId) {
  return doc(db, 'users', userId, 'finance', 'current');
}

function userProfileRef(userId) {
  return doc(db, 'users', userId);
}

function cleanUserName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeUserName(value) {
  return cleanUserName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

async function syncUserProfile(authUser, { name = '', fallbackName = '', forceName = false } = {}) {
  if (!authUser?.uid) return;

  await runTransaction(db, async transaction => {
    const reference = userProfileRef(authUser.uid);
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() || {};
    const candidateName = cleanUserName(name || fallbackName || authUser.displayName) || 'Usuario';
    const resolvedName = forceName
      ? candidateName
      : cleanUserName(current.name || candidateName) || 'Usuario';
    const normalizedName = normalizeUserName(resolvedName);
    const email = String(authUser.email || '').trim().toLocaleLowerCase('pt-BR');
    const needsCreatedAt = !snapshot.exists() || !current.createdAt;
    const changed = needsCreatedAt
      || current.name !== resolvedName
      || current.nameNormalized !== normalizedName
      || current.email !== email;

    if (!changed) return;

    transaction.set(reference, {
      name: resolvedName,
      nameNormalized: normalizedName,
      email,
      ...(needsCreatedAt ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

function normalizeRemoteData(payload, user) {
  return normalizeFinanceData(payload, user);
}

function buildMonthlySeries(incomes, expenses, year) {
  let runningBalance = balanceBeforePeriod(incomes, expenses, `${year}-01`);

  return monthOptions.map(month => {
    const prefix = `${year}-${month.value}`;
    const income = sumValues(incomes.filter(item => datePeriod(item.date) === prefix));
    const expense = sumValues(expenses.filter(item => datePeriod(item.date) === prefix));
    const balance = income - expense;
    runningBalance += balance;
    return { label: month.short, income, expense, balance, cumulativeBalance: runningBalance };
  });
}

function categoryTotals(items) {
  return items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.value || 0);
    return acc;
  }, {});
}

function applyDueSchedules(inputData, today = new Date()) {
  const parts = todayParts(today);
  const scheduleMonth = `${parts.year}-${parts.month}`;
  const nextData = {
    ...inputData,
    incomes: [...(inputData.incomes || [])],
    expenses: [...(inputData.expenses || [])],
  };
  let changed = false;

  (inputData.schedules || []).forEach(schedule => {
    if (!schedule.active) return;
    const runDate = scheduleDate(schedule, parts);
    if (Number(runDate.slice(8, 10)) > parts.day) return;

    const key = schedule.type === 'income' ? 'incomes' : 'expenses';
    const alreadyCreated = nextData[key].some(item => (
      item.scheduledId === schedule.id && item.scheduleMonth === scheduleMonth
    ));
    if (alreadyCreated) return;

    nextData[key] = [
      {
        id: `schedule-${schedule.id}-${scheduleMonth}`,
        date: runDate,
        description: schedule.description,
        category: schedule.category,
        value: Number(schedule.value || 0),
        scheduledId: schedule.id,
        scheduleMonth,
      },
      ...nextData[key],
    ];
    changed = true;
  });

  return { data: nextData, changed };
}

function makeCsv(name, rows) {
  if (!rows.length) return { name, content: '' };
  const headers = Object.keys(rows[0]);
  const content = [
    headers.map(asCsvCell).join(','),
    ...rows.map(row => headers.map(header => asCsvCell(row[header])).join(',')),
  ].join('\n');
  return { name, content };
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function LandingPage({ onLogin, onRegister }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const landingMenuButtonRef = useRef(null);
  const [activeView, setActiveView] = useState(() => {
    if (typeof window === 'undefined') return 'home';
    return normalizeLandingHash(window.location.hash);
  });

  useEffect(() => {
    const syncHash = () => setActiveView(normalizeLandingHash(window.location.hash));
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function closeMenuOnEscape(event) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      landingMenuButtonRef.current?.focus();
    }
    document.addEventListener('keydown', closeMenuOnEscape);
    return () => document.removeEventListener('keydown', closeMenuOnEscape);
  }, [menuOpen]);

  function openLandingView(view) {
    setActiveView(view);
    setMenuOpen(false);
    window.history.pushState(null, '', `#${view}`);
    window.requestAnimationFrame(() => document.getElementById('landing-content')?.focus());
  }

  return (
    <main className={`landing-shell landing-view-${activeView}`}>
      <a className="skip-link" href="#landing-content">Pular para o conteúdo</a>
      <header className="landing-header">
        <div className="landing-header-row">
          <button className="auth-brand landing-brand-button" type="button" onClick={() => openLandingView('home')}>
            <BrandLogo variant="landing" />
          </button>
          <button
            ref={landingMenuButtonRef}
            className="landing-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen(current => !current)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
        <nav id="landing-navigation" className={`landing-nav ${menuOpen ? 'open' : ''}`} aria-label="Navegação da página inicial">
          <button className={activeView === 'home' ? 'active' : ''} type="button" aria-current={activeView === 'home' ? 'page' : undefined} onClick={() => openLandingView('home')}>Início</button>
          <button className={activeView === 'recursos' ? 'active' : ''} type="button" aria-current={activeView === 'recursos' ? 'page' : undefined} onClick={() => openLandingView('recursos')}>Recursos</button>
          <button className={activeView === 'planos' ? 'active' : ''} type="button" aria-current={activeView === 'planos' ? 'page' : undefined} onClick={() => openLandingView('planos')}>Planos</button>
          <button className="secondary-button" type="button" onClick={() => {
            setMenuOpen(false);
            onLogin();
          }}>Entrar</button>
        </nav>
      </header>

      <div id="landing-content" className="landing-page-frame" key={activeView} tabIndex="-1">
        {activeView === 'home' && <LandingHome onLogin={onLogin} onRegister={onRegister} />}
        {activeView === 'recursos' && <LandingResources onRegister={onRegister} />}
        {activeView === 'planos' && <LandingPlans onLogin={onLogin} onRegister={onRegister} />}
      </div>
    </main>
  );
}

function normalizeLandingHash(hash) {
  const value = String(hash || '').replace('#', '');
  if (value === 'preco') return 'planos';
  return ['home', 'recursos', 'planos'].includes(value) ? value : 'home';
}

function LandingHome({ onLogin, onRegister }) {
  return (
    <>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">Controle financeiro para pequenos negócios</span>
          <h1>Uma central financeira mais clara, rápida e pronta para vender.</h1>
          <p>Organize receitas, despesas, contas e metas em uma experiência online com Firebase, relatórios e dados separados por usuário.</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onRegister}>Começar agora</button>
            <button className="secondary-button" type="button" onClick={onLogin}>Já tenho conta</button>
          </div>
          <div className="trust-row">
            <span>Dados por usuário</span>
            <span>Backup JSON</span>
            <span>Relatórios mensais</span>
          </div>
        </div>

        <div className="hero-showcase">
          <ProductPreview />
          <div className="preview-note preview-note-income">
            <small>Receita registrada</small>
            <strong>+ {formatCurrency(850)}</strong>
          </div>
          <div className="preview-note preview-note-alert">
            <small>Próxima conta</small>
            <strong>Internet • 15/06</strong>
          </div>
        </div>
      </section>

      <section className="landing-metrics" aria-label="Indicadores da plataforma">
        <div><strong>4</strong><span>áreas essenciais</span></div>
        <div><strong>100%</strong><span>dados por usuário</span></div>
        <div><strong>CSV</strong><span>exportação Pro</span></div>
      </section>
    </>
  );
}

function ProductPreview() {
  return (
    <div className="product-preview" aria-label="Prévia do painel financeiro">
      <div className="preview-toolbar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="preview-top">
        <span>Saldo do mês</span>
        <strong>{formatCurrency(12450)}</strong>
      </div>
      <div className="preview-bars">
        <span style={{ '--bar-height': '52%', '--bar-delay': '0.05s' }} />
        <span style={{ '--bar-height': '74%', '--bar-delay': '0.16s' }} />
        <span style={{ '--bar-height': '46%', '--bar-delay': '0.27s' }} />
        <span style={{ '--bar-height': '86%', '--bar-delay': '0.38s' }} />
        <span style={{ '--bar-height': '63%', '--bar-delay': '0.49s' }} />
      </div>
      <div className="preview-metrics">
        <p><span>Receitas</span><b className="positive">{formatCurrency(18500)}</b></p>
        <p><span>Despesas</span><b className="negative">{formatCurrency(6050)}</b></p>
        <p><span>Economia</span><b>{formatCurrency(12450)}</b></p>
      </div>
    </div>
  );
}

function LandingResources({ onRegister }) {
  return (
    <section className="landing-page landing-section landing-resources-page">
      <div className="landing-page-hero">
        <div className="section-heading">
          <span className="eyebrow">Recursos</span>
          <h1>Uma página só para mostrar o que o sistema entrega.</h1>
          <p>Agora os recursos ficam em uma aba própria, com leitura mais limpa e um resumo visual do fluxo financeiro.</p>
        </div>
        <button className="primary-button" type="button" onClick={onRegister}>Começar com esses recursos</button>
      </div>

      <div className="resources-layout">
        <div className="feature-grid">
          <article><span className="feature-icon" aria-hidden="true">📊</span><b>Dashboard executivo</b><p>KPIs, últimas transações e comparativo de receitas e despesas.</p></article>
          <article><span className="feature-icon" aria-hidden="true">🧾</span><b>Gestão completa</b><p>Cadastre receitas, despesas, contas, metas, categorias e agendamentos.</p></article>
          <article><span className="feature-icon" aria-hidden="true">🔒</span><b>Segurança Firebase</b><p>Cada usuário acessa apenas os próprios dados no Firestore.</p></article>
          <article><span className="feature-icon" aria-hidden="true">📦</span><b>Exportação e backup</b><p>CSV para planilhas e backup JSON para portabilidade.</p></article>
        </div>

        <aside className="resource-demo-card" aria-label="Resumo animado de recursos">
          <span className="eyebrow">Resumo mensal</span>
          <div className="insight-chart">
            <span style={{ '--bar-height': '46%', '--bar-delay': '0.08s' }} />
            <span style={{ '--bar-height': '68%', '--bar-delay': '0.18s' }} />
            <span style={{ '--bar-height': '58%', '--bar-delay': '0.28s' }} />
            <span style={{ '--bar-height': '88%', '--bar-delay': '0.38s' }} />
          </div>
          <div className="resource-lines">
            <p><span>Receitas</span><b>{formatCurrency(18500)}</b></p>
            <p><span>Despesas</span><b>{formatCurrency(6050)}</b></p>
            <p><span>Metas ativas</span><b>3</b></p>
          </div>
        </aside>
      </div>

      <div className="workflow-section">
        <div className="section-heading compact">
          <span className="eyebrow">Fluxo</span>
          <h2>Menos tela parada, mais ação</h2>
        </div>
        <div className="workflow-steps">
          <article><b>1</b><span>Lance entradas e saídas</span></article>
          <article><b>2</b><span>Acompanhe contas e metas</span></article>
          <article><b>3</b><span>Exporte ou faça backup</span></article>
        </div>
      </div>
    </section>
  );
}

function LandingPlans({ onLogin, onRegister }) {
  return (
    <section className="landing-page landing-plans-page">
      <div className="landing-page-hero plans-hero">
        <div className="section-heading">
          <span className="eyebrow">Oferta inicial</span>
          <h1>Planos em uma aba separada, simples de comparar.</h1>
          <p>Escolha entre começar grátis ou liberar recursos Pro para vender uma solução mais completa.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onLogin}>Entrar na minha conta</button>
      </div>

      <div className="public-plan-grid">
        <article className="public-plan-card">
          <span className="plan-badge">Para começar</span>
          <h2>{plans.free.name}</h2>
          <strong>{plans.free.price}</strong>
          <p>{plans.free.description}</p>
          <ul>
            {plans.free.features.map(feature => <li key={feature}>{feature}</li>)}
          </ul>
          <button className="secondary-button" type="button" onClick={onRegister}>Criar conta grátis</button>
        </article>

        <article className="public-plan-card featured">
          <span className="plan-badge pro">Mais completo</span>
          <h2>{plans.pro.name}</h2>
          <strong>{plans.pro.price}</strong>
          <p>{plans.pro.description}</p>
          <ul>
            {plans.pro.features.map(feature => <li key={feature}>{feature}</li>)}
          </ul>
          <button className="primary-button" type="button" onClick={onRegister}>Criar acesso Pro</button>
        </article>
      </div>

      <div className="plan-comparison">
        <div><span>Transações</span><b>10 no Free / ilimitadas no Pro</b></div>
        <div><span>Relatórios</span><b>Dashboard no Free / completos no Pro</b></div>
        <div><span>Backup</span><b>Disponível no plano Pro</b></div>
      </div>
    </section>
  );
}

function AuthPage({ mode, setMode, error, onSubmit, onBack, onPasswordReset, submitting }) {
  const isRegister = mode === 'register';
  const [email, setEmail] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  function openPasswordReset() {
    setResetEmail(email);
    setResetError('');
    setResetSent(false);
    setResetOpen(true);
  }

  function closePasswordReset() {
    setResetOpen(false);
    setResetError('');
    setResetSent(false);
  }

  async function handlePasswordResetSubmit(event) {
    event.preventDefault();
    setResetError('');
    setResetSubmitting(true);

    try {
      const normalizedEmail = resetEmail.trim().toLowerCase();
      await onPasswordReset(normalizedEmail);
      setResetEmail(normalizedEmail);
      setResetSent(true);
    } catch (resetRequestError) {
      setResetError(resetRequestError.message || 'Não foi possível enviar o link agora.');
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <main className={`auth-shell auth-mode-${mode}`}>
      <span className="auth-orb auth-orb-one" aria-hidden="true" />
      <span className="auth-orb auth-orb-two" aria-hidden="true" />
      <section className="auth-panel">
        <div className="auth-brand">
          <BrandLogo variant="auth" />
        </div>
        <button className="auth-switch auth-back" type="button" onClick={onBack}>← Voltar para apresentação</button>
        <div className="auth-stage" key={mode}>
          <div className="auth-heading">
            <span className="auth-kicker">{isRegister ? 'Comece agora' : 'Que bom ter você de volta'}</span>
            <h1>{isRegister ? 'Criar conta' : 'Entrar'}</h1>
            <p>{isRegister ? 'Cadastre seu acesso para salvar seus dados.' : 'Acesse seu painel financeiro com segurança.'}</p>
          </div>
          <form className="auth-form" onSubmit={onSubmit} aria-busy={submitting}>
            {isRegister && (
              <label style={{ '--motion-delay': '40ms' }}>
                Nome
                <input name="name" autoComplete="name" placeholder="Seu nome" required />
              </label>
            )}
            <label style={{ '--motion-delay': isRegister ? '85ms' : '40ms' }}>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </label>
            <label style={{ '--motion-delay': isRegister ? '130ms' : '85ms' }}>
              Senha
              <input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="6" placeholder="******" required />
            </label>
            {!isRegister && (
              <button className="auth-forgot" type="button" onClick={openPasswordReset} style={{ '--motion-delay': '130ms' }}>
                Esqueci minha senha
              </button>
            )}
            {error && <p className="auth-error" role="alert" aria-live="polite">{error}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={submitting} style={{ '--motion-delay': isRegister ? '175ms' : '175ms' }}>
              {submitting && <span className="button-spinner" aria-hidden="true" />}
              {submitting ? (isRegister ? 'Criando conta...' : 'Entrando...') : (isRegister ? 'Cadastrar' : 'Entrar')}
            </button>
          </form>
          <button className="auth-switch auth-toggle" type="button" onClick={() => setMode(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Já tenho conta' : 'Criar cadastro'}
          </button>
        </div>
      </section>
      <section className="auth-preview" aria-hidden="true">
        <div className="auth-preview-content">
          <span className="auth-preview-label">Visão geral em tempo real</span>
          <div className="preview-card">
            <div className="preview-card-heading">
              <div>
                <span>Saldo Atual</span>
                <strong>{formatCurrency(12540)}</strong>
              </div>
              <small><i /> Sincronizado</small>
            </div>
            <div className="auth-mini-chart">
              {[42, 58, 46, 72, 64, 86, 78].map((height, index) => (
                <span key={height + index} style={{ '--bar-height': `${height}%`, '--bar-delay': `${180 + index * 75}ms` }} />
              ))}
            </div>
            <div className="auth-preview-summary">
              <span><small>Receitas</small><b>+12,8%</b></span>
              <span><small>Despesas</small><b>-4,2%</b></span>
            </div>
          </div>
        </div>
        <div className="preview-row">
          <span />
          <span />
          <span />
        </div>
      </section>
      {resetOpen && (
        <Modal title="Recuperar senha" onClose={closePasswordReset}>
          <div className="password-reset-dialog">
            {resetSent ? (
              <div className="password-reset-success" role="status" aria-live="polite">
                <span className="reset-success-icon" aria-hidden="true">✓</span>
                <h3>Solicitação enviada</h3>
                <p>Se a conta <strong>{resetEmail}</strong> estiver cadastrada com acesso por e-mail e senha, o Firebase enviará o link de redefinição.</p>
                <p className="reset-help">Procure também no spam e por mensagens de <b>noreply@financas-ed7aa.firebaseapp.com</b>. A entrega pode levar alguns minutos.</p>
                <div className="reset-success-actions">
                  <button className="primary-button" type="button" autoFocus onClick={closePasswordReset}>Voltar para entrar</button>
                  <button className="secondary-button" type="button" onClick={() => {
                    setResetSent(false);
                    setResetError('');
                  }}>Corrigir e-mail</button>
                </div>
              </div>
            ) : (
              <form className="modal-form password-reset-form" onSubmit={handlePasswordResetSubmit} aria-busy={resetSubmitting}>
                <p>Informe o e-mail usado no cadastro. Enviaremos um link de verificação para você redefinir a senha.</p>
                <label>
                  E-mail cadastrado
                  <input
                    autoFocus
                    type="email"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={event => setResetEmail(event.target.value)}
                    placeholder="voce@email.com"
                    required
                  />
                </label>
                {resetError && <p className="auth-error" role="alert" aria-live="polite">{resetError}</p>}
                <button className="primary-button auth-submit" type="submit" disabled={resetSubmitting}>
                  {resetSubmitting && <span className="button-spinner" aria-hidden="true" />}
                  {resetSubmitting ? 'Enviando...' : 'Enviar link de redefinição'}
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [data, setData] = useState(loadLocalData);
  const [apiOnline, setApiOnline] = useState(false);
  const [saveStatus, setSaveStatus] = useState('local');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [showAuth, setShowAuth] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingAction, setBillingAction] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(() => {
    const current = todayParts();
    return {
      month: monthLabelFromDate(`${current.year}-${current.month}-01`),
      year: current.year,
      status: 'Todas',
      category: 'Todas',
    };
  });
  const [settingsDraft, setSettingsDraft] = useState(data.settings);
  const [settingsSection, setSettingsSection] = useState('Perfil');
  const [newCategory, setNewCategory] = useState({ type: 'expenses', name: '' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef(null);
  const previousPageRef = useRef(activePage);
  const pendingRegistrationProfileRef = useRef(null);
  const latestDataRef = useRef(data);
  const billingRequestRef = useRef(0);
  const calendarDateRef = useRef(todayParts());
  const [mobileViewport, setMobileViewport] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  ));

  const applySubscriptionUpdate = useCallback(value => {
    const subscription = normalizeSubscription(value);
    setData(current => {
      const nextData = { ...current, subscription };
      latestDataRef.current = nextData;
      return nextData;
    });
  }, []);

  const refreshBillingStatus = useCallback(async ({ silent = false } = {}) => {
    if (!user) return null;
    if (!billingApiConfigured) {
      setBillingLoading(false);
      setBillingError('O serviço de assinaturas está indisponível no momento.');
      return null;
    }

    const requestId = billingRequestRef.current + 1;
    billingRequestRef.current = requestId;
    if (!silent) setBillingLoading(true);

    try {
      const payload = await getBillingStatus(user);
      if (requestId !== billingRequestRef.current) return null;
      const subscription = subscriptionFromBillingPayload(payload);
      if (!subscription) throw new Error('O serviço retornou um status de assinatura inválido.');
      applySubscriptionUpdate(subscription);
      setBillingError('');
      return subscription;
    } catch (error) {
      if (requestId !== billingRequestRef.current) return null;
      setBillingError(error?.message || 'Não foi possível verificar sua assinatura.');
      return null;
    } finally {
      if (requestId === billingRequestRef.current) setBillingLoading(false);
    }
  }, [applySubscriptionUpdate, user]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const syncViewport = () => {
      setMobileViewport(mediaQuery.matches);
      if (!mediaQuery.matches) setMobileNavOpen(false);
    };

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!mobileViewport || !mobileNavOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen, mobileViewport]);

  useEffect(() => {
    if (previousPageRef.current === activePage) return;
    previousPageRef.current = activePage;
    window.requestAnimationFrame(() => document.getElementById('main-content')?.focus());
  }, [activePage]);

  useEffect(() => {
    if (!mobileViewport || !mobileNavOpen) return undefined;
    const drawer = document.getElementById('primary-navigation');
    const focusableSelector = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusable = drawer ? [...drawer.querySelectorAll(focusableSelector)] : [];
    focusable[0]?.focus();

    function handleDrawerKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }

      if (event.key !== 'Tab' || focusable.length < 2) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleDrawerKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDrawerKeyDown);
      mobileMenuButtonRef.current?.focus();
    };
  }, [mobileNavOpen, mobileViewport]);

  useEffect(() => {
    return onAuthStateChanged(auth, currentUser => {
      if (!currentUser) pendingRegistrationProfileRef.current = null;
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const pendingProfile = pendingRegistrationProfileRef.current;
    const isPendingUser = pendingProfile
      && String(pendingProfile.email || '').toLocaleLowerCase('pt-BR') === String(user.email || '').toLocaleLowerCase('pt-BR');
    const financeUser = isPendingUser
      ? { displayName: pendingProfile.name, email: user.email || pendingProfile.email }
      : user;

    async function loadFirebaseData() {
      let loadedData;
      let shouldSyncProfile = false;

      try {
        const snapshot = await getDoc(userFinanceRef(user.uid));
        const storedData = snapshot.data();
        const storedName = cleanUserName(storedData?.settings?.name);
        const authenticatedName = cleanUserName(financeUser.displayName);
        const shouldRepairDefaultName = snapshot.exists()
          && (!storedName || storedName === 'Usuario')
          && authenticatedName
          && authenticatedName !== 'Usuario';
        const financePayload = shouldRepairDefaultName
          ? {
              ...storedData,
              settings: { ...storedData.settings, name: authenticatedName },
            }
          : storedData;
        const remoteData = snapshot.exists()
          ? normalizeRemoteData(financePayload, financeUser)
          : createEmptyFinanceData(financeUser);
        const scheduled = applyDueSchedules(remoteData);
        loadedData = scheduled.data;

        if (!snapshot.exists()) {
          await setDoc(userFinanceRef(user.uid), {
            ...financeWritePayload(scheduled.data),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (scheduled.changed || shouldRepairDefaultName) {
          await setDoc(userFinanceRef(user.uid), {
            ...financeWritePayload(scheduled.data),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        shouldSyncProfile = true;
        if (cancelled) return;
        setData(scheduled.data);
        setSettingsDraft(scheduled.data.settings);
        setApiOnline(true);
        setSaveStatus('saved');
      } catch {
        if (cancelled) return;
        const localData = normalizeRemoteData(loadLocalData(), financeUser);
        const scheduled = applyDueSchedules(localData);
        loadedData = scheduled.data;
        setData(scheduled.data);
        setSettingsDraft(scheduled.data.settings);
        setApiOnline(false);
        setSaveStatus('offline');
      }

      if (cancelled || !shouldSyncProfile) return;

      try {
        await syncUserProfile(user, { name: loadedData?.settings?.name, forceName: true });
      } catch (error) {
        console.error('Falha ao sincronizar o perfil do usuário:', error.code || error.message);
      } finally {
        if (isPendingUser && pendingRegistrationProfileRef.current === pendingProfile) {
          pendingRegistrationProfileRef.current = null;
        }
      }
    }

    loadFirebaseData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    return onSnapshot(
      userFinanceRef(user.uid),
      snapshot => {
        const remoteSubscription = snapshot.data()?.subscription;
        if (remoteSubscription) applySubscriptionUpdate(remoteSubscription);
      },
      error => {
        console.error('Falha ao sincronizar a assinatura em tempo real:', error.code || error.message);
      },
    );
  }, [applySubscriptionUpdate, user]);

  useEffect(() => {
    if (!user) {
      billingRequestRef.current += 1;
      setBillingLoading(false);
      setBillingError('');
      setBillingAction('');
      return;
    }

    refreshBillingStatus();
  }, [refreshBillingStatus, user]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get('billing');
    if (!billingResult) return;
    const timers = [];

    if (billingResult === 'success') {
      setNotice('Pagamento recebido. Estamos confirmando seu plano Pro.');
      refreshBillingStatus();
      timers.push(window.setTimeout(() => refreshBillingStatus({ silent: true }), 2500));
      timers.push(window.setTimeout(() => refreshBillingStatus({ silent: true }), 7000));
    } else if (billingResult === 'cancelled') {
      setNotice('Checkout cancelado. Nenhuma cobrança foi confirmada.');
    } else if (billingResult === 'portal-return') {
      setNotice('Portal de cobrança fechado. Atualizando sua assinatura.');
      refreshBillingStatus();
    }

    params.delete('billing');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [refreshBillingStatus, user]);

  useEffect(() => {
    if (!user || window.location.hash !== '#assinatura') return;
    setActivePage('assinatura');
    refreshBillingStatus({ silent: true });
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  }, [refreshBillingStatus, user]);

  useEffect(() => {
    if (!user) return;
    setShowAuth(false);
  }, [user]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    localStorage.setItem('financeData', JSON.stringify(data));
    document.body.dataset.theme = data.settings.theme;
  }, [data]);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    function checkCalendarRollover() {
      const now = new Date();
      const nextDate = todayParts(now);
      const previousDate = calendarDateRef.current;
      const previousKey = `${previousDate.year}-${previousDate.month}-${pad2(previousDate.day)}`;
      const nextKey = `${nextDate.year}-${nextDate.month}-${pad2(nextDate.day)}`;
      if (previousKey === nextKey) return;

      calendarDateRef.current = nextDate;
      setFilters(current => {
        const wasViewingCurrentPeriod = current.year === previousDate.year
          && monthNumber(current.month) === previousDate.month;
        if (!wasViewingCurrentPeriod) return current;
        return {
          ...current,
          month: monthLabelFromDate(`${nextDate.year}-${nextDate.month}-01`),
          year: nextDate.year,
        };
      });

      if (!user) return;
      const scheduled = applyDueSchedules(latestDataRef.current, now);
      if (!scheduled.changed) return;
      latestDataRef.current = scheduled.data;
      persist(scheduled.data);
    }

    checkCalendarRollover();
    const timer = window.setInterval(checkCalendarRollover, 30 * 1000);
    return () => window.clearInterval(timer);
  }, [user]);

  const monthIncomes = useMemo(() => data.incomes.filter(item => inPeriod(item.date, filters)), [data.incomes, filters]);
  const monthExpenses = useMemo(() => data.expenses.filter(item => inPeriod(item.date, filters)), [data.expenses, filters]);
  const monthBills = useMemo(() => data.bills.filter(item => inPeriod(item.due_date, filters)), [data.bills, filters]);
  const pendingBills = useMemo(() => data.bills.filter(bill => bill.status !== 'Pago'), [data.bills]);
  const usage = useMemo(() => usageFromData(data), [data]);
  const isPro = isProSubscription(data.subscription);

  const totals = useMemo(() => {
    const income = sumValues(monthIncomes);
    const expense = sumValues(monthExpenses);
    const monthBalance = income - expense;
    const openingBalance = balanceBeforePeriod(data.incomes, data.expenses, periodKey(filters));
    return {
      income,
      expense,
      monthBalance,
      openingBalance,
      balance: openingBalance + monthBalance,
      economy: Math.max(monthBalance, 0),
    };
  }, [data.incomes, data.expenses, monthIncomes, monthExpenses, filters]);

  const allTransactions = useMemo(() => {
    const items = [
      ...data.incomes.map(item => ({ ...item, type: 'Receita' })),
      ...data.expenses.map(item => ({ ...item, type: 'Despesa' })),
    ];
    return sortByDate(items);
  }, [data.incomes, data.expenses]);

  const dashboardTransactions = useMemo(() => {
    return allTransactions.filter(item => inPeriod(item.date, filters));
  }, [allTransactions, filters]);

  const chartData = useMemo(() => {
    const series = buildMonthlySeries(data.incomes, data.expenses, filters.year);
    const expenseCategories = categoryTotals(
      monthExpenses.filter(item => filters.category === 'Todas' || item.category === filters.category),
    );
    const balanceSeries = series.slice(0, Number(monthNumber(filters.month)));
    const balance = balanceSeries.map(item => item.cumulativeBalance);
    return { series, balanceSeries, expenseCategories, balance };
  }, [data.incomes, data.expenses, monthExpenses, filters.month, filters.year, filters.category]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);

    const form = new FormData(event.currentTarget);
    const name = form.get('name')?.toString().trim();
    const email = form.get('email')?.toString().trim();
    const password = form.get('password')?.toString();

    if (authMode === 'register') {
      pendingRegistrationProfileRef.current = { name: cleanUserName(name) || 'Usuario', email };
    }

    try {
      if (authMode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const profileName = cleanUserName(name) || 'Usuario';
        const profileResults = await Promise.allSettled([
          updateProfile(credential.user, { displayName: profileName }),
          syncUserProfile(credential.user, { name: profileName, forceName: true }),
        ]);
        const profileFailures = profileResults.filter(result => result.status === 'rejected');
        if (profileFailures.length) {
          profileFailures.forEach(result => {
            console.error('Falha ao finalizar o perfil do usuário:', result.reason?.code || result.reason?.message);
          });
          setNotice('Conta criada. Alguns dados do perfil serão sincronizados novamente no próximo acesso.');
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      if (!auth.currentUser) pendingRegistrationProfileRef.current = null;
      const messages = {
        'auth/email-already-in-use': 'Este e-mail já possui cadastro.',
        'auth/invalid-email': 'Digite um e-mail válido.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/configuration-not-found': 'Firebase Authentication ainda não foi ativado neste projeto. Ative Authentication > E-mail/Senha no Console Firebase.',
        'auth/operation-not-allowed': 'Ative o provedor E-mail/Senha no Firebase Authentication.',
        'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
      };
      setAuthError(messages[error.code] || 'Não foi possível entrar agora.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handlePasswordReset(email) {
    try {
      auth.languageCode = 'pt-BR';
      await sendPasswordResetEmail(auth, email, {
        url: `${appBaseUrl.replace(/\/$/, '')}/#home`,
        handleCodeInApp: false,
      });
    } catch (error) {
      if (error.code === 'auth/user-not-found') return;

      const messages = {
        'auth/invalid-email': 'Digite um e-mail válido.',
        'auth/missing-email': 'Informe o e-mail usado no cadastro.',
        'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
        'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet e tente novamente.',
        'auth/operation-not-allowed': 'A recuperação por e-mail ainda não está habilitada no Firebase.',
        'auth/unauthorized-continue-uri': 'O domínio de retorno não está autorizado no Firebase Authentication.',
        'auth/invalid-continue-uri': 'O endereço de retorno configurado para redefinição é inválido.',
      };
      console.error('Falha ao solicitar redefinição de senha:', error.code);
      throw new Error(messages[error.code] || 'Não foi possível enviar o link agora. Tente novamente.');
    }
  }

  async function persist(nextData) {
    const stateData = {
      ...nextData,
      subscription: normalizeSubscription(latestDataRef.current?.subscription || nextData?.subscription),
    };
    latestDataRef.current = stateData;
    setData(stateData);
    localStorage.setItem('financeData', JSON.stringify(stateData));
    setSaveStatus(user ? 'saving' : 'local');
    if (!user) return true;
    try {
      await setDoc(userFinanceRef(user.uid), {
        ...financeWritePayload(stateData),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setApiOnline(true);
      setSaveStatus('saved');
      return true;
    } catch {
      setApiOnline(false);
      setSaveStatus('offline');
      return false;
    }
  }

  async function syncAccountProfile(profileName) {
    if (!user) return true;

    const results = await Promise.allSettled([
      syncUserProfile(user, { name: profileName, forceName: true }),
      user.displayName === profileName ? Promise.resolve() : updateProfile(user, { displayName: profileName }),
    ]);
    const failures = results.filter(result => result.status === 'rejected');

    failures.forEach(result => {
      console.error('Falha ao atualizar o perfil do usuário:', result.reason?.code || result.reason?.message);
    });
    return failures.length === 0;
  }

  function featureBlocked(message = 'Este recurso faz parte do plano Pro.') {
    setNotice(message);
    setActivePage('assinatura');
  }

  function canAdd(kind) {
    if (isPro) return true;
    const limit = plans.free.limits[kind];
    return usage[kind] < limit;
  }

  function openCreateModal(type) {
    const kind = type === 'bill' ? 'bills' : type === 'goal' ? 'goals' : 'transactions';
    if (!canAdd(kind)) {
      featureBlocked(`Limite do plano Free atingido. Assine o Pro para cadastrar mais ${kind === 'transactions' ? 'transações' : kind === 'bills' ? 'contas' : 'metas'}.`);
      return;
    }
    setModal({ type });
  }

  async function startCheckout() {
    if (!user || billingAction) return;
    if (!billingApiConfigured) {
      setBillingError('O serviço de pagamento está indisponível no momento.');
      setNotice('Não foi possível abrir o pagamento agora. Tente novamente mais tarde.');
      return;
    }

    const checkoutWindow = window.open('', '_blank');
    if (checkoutWindow) {
      checkoutWindow.opener = null;
      checkoutWindow.document.documentElement.lang = 'pt-BR';
      checkoutWindow.document.title = 'Abrindo pagamento seguro';
      checkoutWindow.document.body.textContent = '';

      const loadingMessage = checkoutWindow.document.createElement('p');
      loadingMessage.setAttribute('role', 'status');
      loadingMessage.setAttribute('aria-live', 'polite');
      loadingMessage.textContent = 'Abrindo pagamento seguro...';
      checkoutWindow.document.body.appendChild(loadingMessage);
    }

    setBillingAction('checkout');
    setBillingError('');
    try {
      const payload = await createBillingCheckout(user, {});
      const checkoutUrl = billingRedirectUrl(payload);

      if (checkoutWindow && !checkoutWindow.closed) {
        checkoutWindow.location.replace(checkoutUrl);
      } else {
        window.location.assign(checkoutUrl);
      }
    } catch (error) {
      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
      const message = error?.message || 'Não foi possível abrir o checkout.';
      setBillingError(message);
      setNotice(message);
    } finally {
      setBillingAction('');
    }
  }

  function requestSubscriptionCancellation() {
    if (billingAction) return;
    if (!isPro) {
      setNotice('Esta conta não possui uma assinatura Pro ativa para cancelar.');
      return;
    }

    if (isLegacyProSubscription(data.subscription) || data.subscription?.canManage === false) {
      setNotice('Seu Pro legado será mantido e não possui cobrança recorrente para cancelar.');
      return;
    }

    if (data.subscription?.cancelAtPeriodEnd) {
      setNotice('O cancelamento desta assinatura já está agendado.');
      return;
    }

    if (!billingApiConfigured) {
      setBillingError('O serviço de assinaturas está indisponível no momento.');
      return;
    }

    setModal({ type: 'confirmSubscriptionCancel' });
  }

  async function confirmSubscriptionCancellation() {
    if (!user || billingAction) return;
    if (isLegacyProSubscription(data.subscription) || data.subscription?.canManage === false) {
      setModal(null);
      setNotice('Seu Pro legado será mantido e não possui cobrança recorrente para cancelar.');
      return;
    }
    if (!billingApiConfigured) {
      setModal(null);
      setBillingError('O serviço de assinaturas está indisponível no momento.');
      return;
    }

    setBillingAction('cancel');
    setBillingError('');
    try {
      const payload = await cancelBillingSubscription(user, {});
      const subscription = subscriptionFromBillingPayload(payload);
      if (subscription) applySubscriptionUpdate(subscription);
      setModal(null);
      const periodEnd = formatSubscriptionDate(subscription?.currentPeriodEnd || data.subscription?.currentPeriodEnd);
      setNotice(periodEnd
        ? `Cancelamento agendado. Seu plano Pro continua ativo até ${periodEnd}.`
        : 'Cancelamento agendado para o fim do período já pago.');
      refreshBillingStatus({ silent: true });
    } catch (error) {
      const message = error?.message || 'Não foi possível agendar o cancelamento.';
      setBillingError(message);
      setNotice(message);
    } finally {
      setBillingAction('');
    }
  }

  async function resumeSubscription() {
    if (!user || billingAction) return;
    if (!billingApiConfigured) {
      setBillingError('O serviço de assinaturas está indisponível no momento.');
      return;
    }

    setBillingAction('resume');
    setBillingError('');
    try {
      const payload = await resumeBillingSubscription(user, {});
      const subscription = subscriptionFromBillingPayload(payload);
      if (subscription) applySubscriptionUpdate(subscription);
      setNotice('Cancelamento removido. Sua assinatura Pro continuará ativa.');
      refreshBillingStatus({ silent: true });
    } catch (error) {
      const message = error?.message || 'Não foi possível reativar a assinatura.';
      setBillingError(message);
      setNotice(message);
    } finally {
      setBillingAction('');
    }
  }

  async function openStripePortal() {
    if (!user || billingAction) return;
    if (!billingApiConfigured) {
      setBillingError('O portal de cobrança está indisponível no momento.');
      return;
    }

    setBillingAction('portal');
    setBillingError('');
    try {
      const payload = await createBillingPortal(user, {});
      window.location.assign(billingRedirectUrl(payload));
    } catch (error) {
      const message = error?.message || 'Não foi possível abrir o portal de cobrança.';
      setBillingError(message);
      setNotice(message);
    } finally {
      setBillingAction('');
    }
  }

  function upsertItem(key, item) {
    const exists = data[key].some(current => current.id === item.id);
    const nextItems = exists
      ? data[key].map(current => (current.id === item.id ? item : current))
      : [item, ...data[key]];
    persist({ ...data, [key]: nextItems });
    setModal(null);
  }

  function saveTransaction(type, event, editingItem) {
    event.preventDefault();
    if (!editingItem && !canAdd('transactions')) {
      featureBlocked('Limite de transações do plano Free atingido. Assine o Pro para continuar.');
      setModal(null);
      return;
    }
    const form = new FormData(event.currentTarget);
    const key = type === 'income' ? 'incomes' : 'expenses';
    const category = form.get('category')?.toString().trim();
    const item = {
      id: editingItem?.id || Date.now(),
        date: form.get('date'),
        description: form.get('description')?.toString().trim(),
        category,
        value: moneyValue(form.get('value')),
    };
    const categoryKey = type === 'income' ? 'incomes' : 'expenses';
    const categories = uniqueSorted([...data.categories[categoryKey], category]);
    const nextItems = data[key].some(current => current.id === item.id)
      ? data[key].map(current => (current.id === item.id ? item : current))
      : [item, ...data[key]];

    persist({
      ...data,
      [key]: nextItems,
      categories: { ...data.categories, [categoryKey]: categories },
    });
    setModal(null);
  }

  function saveBill(event, editingItem) {
    event.preventDefault();
    if (!editingItem && !canAdd('bills')) {
      featureBlocked('Limite de contas do plano Free atingido. Assine o Pro para continuar.');
      setModal(null);
      return;
    }
    const form = new FormData(event.currentTarget);
    upsertItem('bills', {
      id: editingItem?.id || Date.now(),
      due_date: form.get('due_date'),
      name: form.get('name')?.toString().trim(),
      value: moneyValue(form.get('value')),
      status: form.get('status'),
    });
  }

  function saveGoal(event, editingItem) {
    event.preventDefault();
    if (!editingItem && !canAdd('goals')) {
      featureBlocked('Limite de metas do plano Free atingido. Assine o Pro para continuar.');
      setModal(null);
      return;
    }
    const form = new FormData(event.currentTarget);
    upsertItem('goals', {
      id: editingItem?.id || Date.now(),
      name: form.get('name')?.toString().trim(),
      target: moneyValue(form.get('target')),
      current: moneyValue(form.get('current')),
      icon: form.get('icon') || editingItem?.icon || 'goal',
    });
  }

  function saveSchedule(event, editingItem) {
    event.preventDefault();
    if (!isPro) {
      featureBlocked('Agendamentos fazem parte do plano Pro.');
      setModal(null);
      return;
    }
    const form = new FormData(event.currentTarget);
    const type = form.get('type');
    const categoryKey = type === 'income' ? 'incomes' : 'expenses';
    const category = form.get('category')?.toString().trim();
    const schedule = {
      id: editingItem?.id || Date.now(),
      type,
      day: dayValue(form.get('day')),
      description: form.get('description')?.toString().trim(),
      category,
      value: moneyValue(form.get('value')),
      active: form.get('active') === 'true',
    };
    const currentSchedules = data.schedules || [];
    const schedules = currentSchedules.some(current => current.id === schedule.id)
      ? currentSchedules.map(current => (current.id === schedule.id ? schedule : current))
      : [schedule, ...currentSchedules];

    persist({
      ...data,
      schedules,
      categories: {
        ...data.categories,
        [categoryKey]: uniqueSorted([...data.categories[categoryKey], category]),
      },
    });
    setModal(null);
  }

  function deleteItem(key, id) {
    persist({ ...data, [key]: data[key].filter(item => item.id !== id) });
  }

  function requestDelete(key, id, label) {
    setModal({ type: 'confirmDelete', key, id, label });
  }

  function confirmDelete() {
    if (!modal?.key || modal.id === undefined) return;
    deleteItem(modal.key, modal.id);
    setModal(null);
    setNotice(`${modal.label || 'Registro'} excluido com sucesso.`);
  }

  function toggleSchedule(id) {
    persist({
      ...data,
      schedules: (data.schedules || []).map(schedule => (
        schedule.id === id ? { ...schedule, active: !schedule.active } : schedule
      )),
    });
  }

  function toggleBillStatus(id) {
    const nextBills = data.bills.map(bill => (
      bill.id === id ? { ...bill, status: bill.status === 'Pago' ? 'Pendente' : 'Pago' } : bill
    ));
    persist({ ...data, bills: nextBills });
  }

  function applySchedulesNow() {
    const scheduled = applyDueSchedules(data);
    if (scheduled.changed) {
      persist(scheduled.data);
      setNotice('Agendamentos vencidos aplicados com sucesso.');
    } else {
      setSaveStatus(user ? 'saved' : 'local');
      setNotice('Nenhum agendamento vencido para aplicar hoje.');
    }
  }

  function showNotificationSummary() {
    if (pendingBills.length === 0) {
      setNotice('Sem notificações: todas as contas estão em dia.');
      return;
    }

    setFilters(current => ({ ...current, status: 'Pendente' }));
    setActivePage('contas');
    setNotice(`${pendingBills.length} conta(s) pendente(s), total de ${formatCurrency(sumValues(pendingBills))}.`);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const profileName = cleanUserName(settingsDraft.name || user?.displayName) || 'Usuario';
    const nextSettings = { ...settingsDraft, name: profileName };
    setSettingsDraft(nextSettings);

    const financeSaved = await persist({ ...data, settings: nextSettings });
    if (!financeSaved) {
      setNotice('Alterações salvas neste dispositivo. Tente salvar novamente quando a conexão voltar.');
      return;
    }

    const profileSaved = await syncAccountProfile(profileName);
    if (!profileSaved) {
      setNotice('Os dados foram salvos, mas o nome de busca não pôde ser atualizado. Tente novamente.');
      return;
    }

    setNotice('Perfil atualizado com sucesso.');
  }

  async function changeProfilePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const photo = await readImageFile(file);
      setSettingsDraft(current => ({ ...current, photo }));
      setNotice('Foto carregada. Clique em Salvar Alterações para confirmar.');
    } catch (error) {
      setNotice(error.message || 'Nao foi possivel carregar a foto.');
    }
  }

  function removeProfilePhoto() {
    setSettingsDraft(current => ({ ...current, photo: '' }));
    setNotice('Foto removida. Clique em Salvar Alterações para confirmar.');
  }

  function addCategory(event) {
    event.preventDefault();
    const name = newCategory.name.trim();
    if (!name) return;
    persist({
      ...data,
      categories: {
        ...data.categories,
        [newCategory.type]: uniqueSorted([...data.categories[newCategory.type], name]),
      },
    });
    setNewCategory({ ...newCategory, name: '' });
  }

  function removeCategory(type, name) {
    persist({
      ...data,
      categories: {
        ...data.categories,
        [type]: data.categories[type].filter(category => category !== name),
      },
    });
  }

  function exportCsv() {
    const files = [
      makeCsv('receitas.csv', data.incomes),
      makeCsv('despesas.csv', data.expenses),
      makeCsv('contas.csv', data.bills),
      makeCsv('metas.csv', data.goals),
      makeCsv('agendamentos.csv', data.schedules),
    ];
    const content = files
      .map(file => `# ${file.name}\n${file.content}`)
      .join('\n\n');
    downloadFile(`mr-coin-${filters.year}-${monthNumber(filters.month)}.csv`, content, 'text/csv;charset=utf-8');
  }

  function exportBackup() {
    downloadFile('backup-mr-coin.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const payload = await parseBackupFile(file);
      const normalizedData = {
        ...normalizeFinanceData(payload, user),
        subscription: normalizeSubscription(latestDataRef.current?.subscription),
      };
      const profileName = cleanUserName(normalizedData.settings?.name || user?.displayName) || 'Usuario';
      const nextData = {
        ...normalizedData,
        settings: { ...normalizedData.settings, name: profileName },
      };
      const financeSaved = await persist(nextData);
      if (!financeSaved) throw new Error('O backup foi carregado apenas neste dispositivo porque o banco está offline.');
      setSettingsDraft(nextData.settings);

      const profileSaved = await syncAccountProfile(profileName);
      if (!profileSaved) {
        setNotice('Backup importado, mas o nome de busca não pôde ser atualizado. Tente salvar o perfil novamente.');
        return;
      }
      setNotice('Backup importado com sucesso.');
    } catch (error) {
      setNotice(error.message || 'Não foi possível importar o backup.');
    }
  }

  const pageTitle = navItems.find(item => item.id === activePage)?.label || 'Dashboard';
  const saveLabel = {
    saving: 'Salvando...',
    saved: 'Salvo no Firebase',
    offline: 'Offline: salvo localmente',
    local: 'Salvo neste navegador',
  }[saveStatus];

  if (authLoading) {
    return <div className="loading-screen" role="status" aria-live="polite">Carregando...</div>;
  }

  if (!user) {
    if (!showAuth) {
      return (
        <LandingPage
          onLogin={() => {
            setAuthError('');
            setAuthMode('login');
            setShowAuth(true);
          }}
          onRegister={() => {
            setAuthError('');
            setAuthMode('register');
            setShowAuth(true);
          }}
        />
      );
    }

    return (
      <AuthPage
        mode={authMode}
        setMode={nextMode => {
          setAuthError('');
          setAuthMode(nextMode);
        }}
        error={authError}
        onSubmit={handleAuthSubmit}
        onBack={() => {
          setAuthError('');
          setShowAuth(false);
        }}
        onPasswordReset={handlePasswordReset}
        submitting={authSubmitting}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside
        id="primary-navigation"
        className="sidebar"
        aria-label="Menu principal"
        aria-hidden={modal || (mobileViewport && !mobileNavOpen) ? 'true' : undefined}
        inert={modal ? '' : undefined}
      >
        <div className="brand">
          <BrandLogo variant="sidebar" />
        </div>
        <nav className="menu" aria-label="Navegação principal">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`menu-link ${activePage === item.id ? 'active' : ''}`}
              onClick={() => {
                setActivePage(item.id);
                setMobileNavOpen(false);
              }}
              aria-label={item.label}
              aria-current={activePage === item.id ? 'page' : undefined}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="menu-icon" aria-hidden="true">{item.icon}</span>
              <span className="menu-text">{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="logout" type="button" aria-label="Sair da conta" onClick={() => signOut(auth)}>
          <span className="logout-icon" aria-hidden="true">🚪</span>
          <span className="logout-text">Sair</span>
        </button>
      </aside>

      {mobileViewport && mobileNavOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Fechar menu de navegação"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main
        id="main-content"
        className="main-content"
        tabIndex="-1"
        inert={modal || (mobileViewport && mobileNavOpen) ? '' : undefined}
      >
        <header className="topbar">
          <div className="topbar-title">
            <button
              ref={mobileMenuButtonRef}
              className="icon-button"
              type="button"
              aria-label={mobileViewport
                ? (mobileNavOpen ? 'Fechar menu' : 'Abrir menu')
                : (sidebarCollapsed ? 'Expandir menu' : 'Recolher menu')}
              aria-expanded={mobileViewport ? mobileNavOpen : !sidebarCollapsed}
              aria-controls="primary-navigation"
              onClick={() => {
                if (mobileViewport) setMobileNavOpen(current => !current);
                else setSidebarCollapsed(current => !current);
              }}
            >
              {mobileViewport && mobileNavOpen ? '×' : '☰'}
            </button>
            <h1 className="title-swap" key={pageTitle}>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <span className={`save-status ${saveStatus}`} key={saveStatus} role="status" aria-live="polite">{saveLabel}</span>
            <span className={`sync-dot ${apiOnline ? 'online' : ''}`} role="status" aria-label={apiOnline ? 'Firebase conectado' : 'Usando dados locais'} />
            <button className="icon-button notification-button" type="button" aria-label={pendingBills.length ? `Notificações: ${pendingBills.length} conta(s) pendente(s)` : 'Notificações: nenhuma conta pendente'} onClick={showNotificationSummary}>
              <span aria-hidden="true">🔔</span>
              {pendingBills.length > 0 && <span className="notification-badge">{pendingBills.length}</span>}
            </button>
            <div className="user-chip">
              <UserAvatar settings={data.settings} />
              <div>
                <strong>{data.settings.name}</strong>
                <small>{planLabel(data.subscription)}</small>
              </div>
            </div>
          </div>
        </header>

        <div className="app-page-frame" key={activePage}>
        {activePage === 'dashboard' && (
          <Dashboard
            totals={totals}
            transactions={dashboardTransactions}
            filters={filters}
            setFilters={setFilters}
            chartData={chartData}
            theme={data.settings.theme}
          />
        )}
        {activePage === 'receitas' && (
          <TablePage
            title="Receitas"
            buttonLabel="+ Nova Receita"
            onAdd={() => openCreateModal('income')}
            rows={data.incomes}
            search={search}
            setSearch={setSearch}
            filters={filters}
            setFilters={setFilters}
            categories={data.categories.incomes}
            totalClass="positive"
            onEdit={item => setModal({ type: 'income', item })}
            onDelete={id => requestDelete('incomes', id, 'Receita')}
          />
        )}
        {activePage === 'despesas' && (
          <TablePage
            title="Despesas"
            buttonLabel="+ Nova Despesa"
            onAdd={() => openCreateModal('expense')}
            rows={data.expenses}
            search={search}
            setSearch={setSearch}
            filters={filters}
            setFilters={setFilters}
            categories={data.categories.expenses}
            totalClass="negative"
            onEdit={item => setModal({ type: 'expense', item })}
            onDelete={id => requestDelete('expenses', id, 'Despesa')}
          />
        )}
        {activePage === 'relatorios' && isPro && (
          <Reports
            filters={filters}
            setFilters={setFilters}
            categories={data.categories.expenses}
            chartData={chartData}
            totals={totals}
            theme={data.settings.theme}
          />
        )}
        {activePage === 'relatorios' && !isPro && (
          <PlanRequired title="Relatórios completos" onUpgrade={() => setActivePage('assinatura')} />
        )}
        {activePage === 'metas' && (
          <Goals
            goals={data.goals}
            onAdd={() => openCreateModal('goal')}
            onEdit={item => setModal({ type: 'goal', item })}
            onDelete={id => requestDelete('goals', id, 'Meta')}
          />
        )}
        {activePage === 'contas' && (
          <Bills
            bills={monthBills}
            filters={filters}
            setFilters={setFilters}
            onAdd={() => openCreateModal('bill')}
            onEdit={item => setModal({ type: 'bill', item })}
            onDelete={id => requestDelete('bills', id, 'Conta')}
            onToggle={toggleBillStatus}
          />
        )}
        {activePage === 'agendamentos' && isPro && (
          <Schedules
            schedules={data.schedules || []}
            categories={data.categories}
            onAdd={() => openCreateModal('schedule')}
            onEdit={item => setModal({ type: 'schedule', item })}
            onDelete={id => requestDelete('schedules', id, 'Agendamento')}
            onToggle={toggleSchedule}
            onApplyNow={applySchedulesNow}
          />
        )}
        {activePage === 'agendamentos' && !isPro && (
          <PlanRequired title="Agendamentos automáticos" onUpgrade={() => setActivePage('assinatura')} />
        )}
        {activePage === 'assinatura' && (
          <Billing
            subscription={data.subscription}
            usage={usage}
            isPro={isPro}
            onCheckout={startCheckout}
            billingReady={billingApiConfigured}
            billingLoading={billingLoading}
            billingError={billingError}
            billingAction={billingAction}
            accountEmail={user?.email || ''}
            onCancelSubscription={requestSubscriptionCancellation}
            onResumeSubscription={resumeSubscription}
            onOpenPortal={openStripePortal}
            onRefreshSubscription={() => refreshBillingStatus()}
          />
        )}
        {activePage === 'configuracoes' && (
          <Settings
            draft={settingsDraft}
            setDraft={setSettingsDraft}
            saveSettings={saveSettings}
            section={settingsSection}
            setSection={setSettingsSection}
            categories={data.categories}
            newCategory={newCategory}
            setNewCategory={setNewCategory}
            addCategory={addCategory}
            removeCategory={removeCategory}
            exportCsv={exportCsv}
            exportBackup={exportBackup}
            importBackup={importBackup}
            user={user}
            isPro={isPro}
            onUpgrade={() => setActivePage('assinatura')}
            onPhotoChange={changeProfilePhoto}
            onPhotoRemove={removeProfilePhoto}
          />
        )}
        </div>
      </main>

      {notice && <div className="toast" role="status">{notice}</div>}

      {modal?.type === 'income' && (
        <TransactionModal
          title={modal.item ? 'Editar Receita' : 'Nova Receita'}
          type="income"
          item={modal.item}
          categories={data.categories.incomes}
          onClose={() => setModal(null)}
          onSubmit={saveTransaction}
        />
      )}
      {modal?.type === 'expense' && (
        <TransactionModal
          title={modal.item ? 'Editar Despesa' : 'Nova Despesa'}
          type="expense"
          item={modal.item}
          categories={data.categories.expenses}
          onClose={() => setModal(null)}
          onSubmit={saveTransaction}
        />
      )}
      {modal?.type === 'bill' && <BillModal item={modal.item} onClose={() => setModal(null)} onSubmit={saveBill} />}
      {modal?.type === 'goal' && <GoalModal item={modal.item} onClose={() => setModal(null)} onSubmit={saveGoal} />}
      {modal?.type === 'schedule' && (
        <ScheduleModal
          item={modal.item}
          categories={data.categories}
          onClose={() => setModal(null)}
          onSubmit={saveSchedule}
        />
      )}
      {modal?.type === 'confirmDelete' && (
        <ConfirmModal
          title="Confirmar exclusao"
          message={`Tem certeza que deseja excluir este item de ${modal.label?.toLowerCase() || 'dados'}? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onCancel={() => setModal(null)}
          onConfirm={confirmDelete}
        />
      )}
      {modal?.type === 'confirmSubscriptionCancel' && (
        <ConfirmModal
          title="Agendar cancelamento"
          message="O plano Pro continuará disponível até o fim do período já pago. Depois dessa data, sua conta voltará automaticamente ao plano Free."
          confirmLabel={billingAction === 'cancel' ? 'Agendando...' : 'Agendar cancelamento'}
          cancelLabel="Manter assinatura"
          busy={billingAction === 'cancel'}
          onCancel={() => setModal(null)}
          onConfirm={confirmSubscriptionCancellation}
        />
      )}
    </div>
  );
}

function PeriodFilters({ filters, setFilters, showStatus = false, showCategory = false, categories = [] }) {
  const years = selectableYears(filters.year);

  return (
    <div className="filters">
      <label>Mês
        <select value={filters.month} onChange={e => setFilters({ ...filters, month: e.target.value })}>
          {monthOptions.map(month => <option key={month.value}>{month.label}</option>)}
        </select>
      </label>
      <label>Ano
        <select value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })}>
          {years.map(year => <option key={year}>{year}</option>)}
        </select>
      </label>
      {showStatus && (
        <label>Status
          <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option>Todas</option>
            <option>Pendente</option>
            <option>Pago</option>
          </select>
        </label>
      )}
      {showCategory && (
        <label>Categoria
          <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}>
            <option>Todas</option>
            {categories.map(category => <option key={category}>{category}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function Dashboard({ totals, transactions, filters, setFilters, chartData, theme }) {
  const reducedMotion = useReducedMotion();
  const lineChartConfig = useMemo(
    () => lineConfig(chartData.series, reducedMotion, theme),
    [chartData.series, reducedMotion, theme],
  );

  return (
    <div className="page-stack">
      <div className="dashboard-filter-row">
        <PeriodFilters filters={filters} setFilters={setFilters} />
      </div>
      <section className="kpi-grid">
        <Kpi title="Saldo Acumulado" value={totals.balance} note={`Até ${filters.month} de ${filters.year}`} tone="wallet" trend="" index={0} />
        <Kpi title="Receitas" value={totals.income} note="Período filtrado" tone="income" trend="" index={1} />
        <Kpi title="Despesas" value={totals.expense} note="Período filtrado" tone="expense" trend="" index={2} />
        <Kpi title="Economia" value={totals.economy} note="Período filtrado" tone="saving" trend="" index={3} />
      </section>
      <section className="dashboard-grid">
        <div className="panel chart-panel motion-panel">
          <div className="panel-header"><h2>Receitas x Despesas</h2></div>
          <ChartCanvas
            config={lineChartConfig}
            label="Gráfico de linhas com receitas e despesas ao longo do ano"
            reducedMotion={reducedMotion}
          />
        </div>
        <div className="panel transactions-panel motion-panel">
          <div className="panel-header"><h2>Últimas Transações</h2></div>
          <div className="transaction-list">
            {transactions.slice(0, 6).map((item, index) => (
              <div className="transaction-row" key={`${item.type}-${item.id}`} style={{ '--motion-delay': `${260 + index * 55}ms` }}>
                <span className={`round-icon ${item.type === 'Receita' ? 'income' : 'expense'}`} aria-hidden="true">{item.type === 'Receita' ? '＋' : '−'}</span>
                <div>
                  <strong>{item.description}</strong>
                  <small>{item.type} em {monthLabelFromDate(item.date)}</small>
                </div>
                <b className={item.type === 'Receita' ? 'positive' : 'negative'}>
                  {item.type === 'Receita' ? '+ ' : '- '}{formatCurrency(item.value)}
                </b>
              </div>
            ))}
            {transactions.length === 0 && <EmptyState text="Nenhuma transação neste período." />}
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ title, value, note, tone, trend, index }) {
  return (
    <article className="kpi-card" style={{ '--motion-delay': `${index * 70}ms` }}>
      <Icon name={tone} />
      <span>{title}</span>
      <strong className="value-pop" key={value}>{formatCurrency(value)}</strong>
      <p>{note} {trend && <em className={trend.startsWith('+') ? 'positive-pill' : 'negative-pill'}>{trend}</em>}</p>
    </article>
  );
}

function TablePage({ title, buttonLabel, onAdd, rows, search, setSearch, filters, setFilters, categories, totalClass, onEdit, onDelete }) {
  const visibleRows = rows
    .filter(row => inPeriod(row.date, filters))
    .filter(row => filters.category === 'Todas' || row.category === filters.category)
    .filter(row => normalizeText(`${row.description} ${row.category}`).includes(normalizeText(search)));
  const total = sumValues(visibleRows);
  const pageSize = 8;
  const [page, setPage] = useState(1);
  const sortedRows = sortByDate(visibleRows);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, filters.month, filters.year, filters.category, rows.length]);

  return (
    <section className="page-card">
      <div className="page-actions">
        <PeriodFilters filters={filters} setFilters={setFilters} showCategory categories={categories} />
        <button className="primary-button" type="button" onClick={onAdd}>{buttonLabel}</button>
      </div>
      <div className="search-line">
        <label className="search-field">
          <span className="sr-only">Buscar em {title}</span>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar ${title.toLowerCase()}...`} />
        </label>
      </div>
      <DataTable
        caption={`Lista de ${title.toLowerCase()}`}
        rows={pagedRows}
        total={total}
        totalClass={totalClass}
        onEdit={onEdit}
        onDelete={onDelete}
        page={currentPage}
        pageCount={pageCount}
        totalRows={visibleRows.length}
        onPrev={() => setPage(current => Math.max(1, current - 1))}
        onNext={() => setPage(current => Math.min(pageCount, current + 1))}
      />
    </section>
  );
}

function DataTable({ caption, rows, total, totalClass, onEdit, onDelete, page, pageCount, totalRows, onPrev, onNext }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Descrição</th>
            <th scope="col">Categoria</th>
            <th scope="col">Valor</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="data-row" key={row.id} style={{ '--motion-delay': `${index * 42}ms` }}>
              <td data-label="Data">{formatDate(row.date)}</td>
              <td data-label="Descrição">{row.description}</td>
              <td data-label="Categoria"><span className="tag">{row.category}</span></td>
              <td data-label="Valor"><strong>{formatCurrency(row.value)}</strong></td>
              <td data-label="Ações">
                <div className="row-actions">
                  <button className="table-button" type="button" aria-label={`Editar ${row.description}`} onClick={() => onEdit(row)}><span aria-hidden="true">{actionIcons.edit}</span></button>
                  <button className="table-button danger-action" type="button" aria-label={`Excluir ${row.description}`} onClick={() => onDelete(row.id)}><span aria-hidden="true">{actionIcons.delete}</span></button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan="5"><EmptyState text="Nenhum registro encontrado." /></td></tr>
          )}
          <tr className="total-row">
            <td colSpan="3" data-label="Resumo">Total</td>
            <td className={totalClass} data-label="Total">{formatCurrency(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="pagination">
        <span>{totalRows} registro{totalRows === 1 ? '' : 's'}</span>
        <div className="pagination-controls">
          <button type="button" onClick={onPrev} disabled={page <= 1} aria-label="Página anterior">‹</button>
          <b>{page}/{pageCount}</b>
          <button type="button" onClick={onNext} disabled={page >= pageCount} aria-label="Próxima página">›</button>
        </div>
      </div>
    </div>
  );
}

function Reports({ filters, setFilters, categories, chartData, totals, theme }) {
  const reducedMotion = useReducedMotion();
  const doughnutChartConfig = useMemo(
    () => doughnutConfig(chartData.expenseCategories, reducedMotion, theme),
    [chartData.expenseCategories, reducedMotion, theme],
  );
  const barChartConfig = useMemo(
    () => barConfig(chartData.series, reducedMotion, theme),
    [chartData.series, reducedMotion, theme],
  );
  const balanceChartConfig = useMemo(
    () => balanceConfig(chartData.balanceSeries, chartData.balance, reducedMotion, theme),
    [chartData.balanceSeries, chartData.balance, reducedMotion, theme],
  );

  return (
    <div className="reports-grid">
      <div className="report-filters">
        <PeriodFilters filters={filters} setFilters={setFilters} showCategory categories={categories} />
      </div>
      <div className="report-panels">
        <div className="panel"><div className="panel-header"><h2>Despesas por Categoria</h2></div><ChartCanvas config={doughnutChartConfig} label="Gráfico de rosca das despesas por categoria" reducedMotion={reducedMotion} /></div>
        <div className="panel"><div className="panel-header"><h2>Receitas x Despesas</h2></div><ChartCanvas config={barChartConfig} label="Gráfico de barras comparando receitas e despesas mensais" reducedMotion={reducedMotion} /></div>
        <div className="panel"><div className="panel-header"><h2>Evolução do Saldo Acumulado</h2></div><ChartCanvas config={balanceChartConfig} label="Gráfico de linha mostrando a evolução do saldo acumulado" reducedMotion={reducedMotion} /></div>
        <div className="panel summary-panel">
          <h2>Resumo do Período</h2>
          <p><span>Saldo anterior</span><b>{formatCurrency(totals.openingBalance)}</b></p>
          <p><span>Receitas</span><b className="positive">{formatCurrency(totals.income)}</b></p>
          <p><span>Despesas</span><b className="negative">{formatCurrency(totals.expense)}</b></p>
          <p><span>Economia</span><b className="positive">{formatCurrency(totals.economy)}</b></p>
          <p><span>Saldo Final</span><b>{formatCurrency(totals.balance)}</b></p>
        </div>
      </div>
    </div>
  );
}

function PlanRequired({ title, onUpgrade }) {
  return (
    <section className="plan-required">
      <span className="eyebrow">Recurso Pro</span>
      <h2>{title}</h2>
      <p>Este recurso está disponível para assinantes do plano Pro. Faça o upgrade para liberar relatórios, agendamentos, backup completo e limites maiores.</p>
      <button className="primary-button" type="button" onClick={onUpgrade}>Ver planos</button>
    </section>
  );
}

function Billing({
  subscription,
  usage,
  isPro,
  onCheckout,
  billingReady,
  billingLoading,
  billingError,
  billingAction,
  accountEmail,
  onCancelSubscription,
  onResumeSubscription,
  onOpenPortal,
  onRefreshSubscription,
}) {
  const [section, setSection] = useState('plans');
  const currentPlan = planLabel(subscription);
  const isLegacyPro = isLegacyProSubscription(subscription);
  const cancellationScheduled = Boolean(subscription?.cancelAtPeriodEnd);
  const currentPeriodEnd = formatSubscriptionDate(subscription?.currentPeriodEnd);
  const canManage = subscription?.canManage
    ?? subscription?.provider === 'stripe';
  const actionBusy = Boolean(billingAction);
  const status = String(subscription?.stripeStatus || subscription?.status || '').toLowerCase();
  const statusTone = cancellationScheduled
    ? 'canceling'
    : status === 'past_due' || status === 'unpaid'
      ? 'warning'
      : isPro
        ? 'active'
        : 'free';
  const statusLabel = billingLoading
    ? 'Verificando...'
    : isLegacyPro
      ? 'Pro legado ativo'
      : cancellationScheduled
      ? 'Cancelamento agendado'
      : status === 'past_due'
        ? 'Pagamento pendente'
        : status === 'unpaid'
          ? 'Pagamento não concluído'
          : isPro
            ? 'Pro ativo'
            : 'Free ativo';

  return (
    <section className="billing-page">
      <div className="billing-header">
        <div>
          <span className="eyebrow">Assinatura</span>
          <h2>Plano atual: {billingLoading ? 'Verificando...' : currentPlan}</h2>
          <p>Controle o acesso aos recursos do sistema e libere funcionalidades avançadas no plano pago.</p>
        </div>
        <span className={`plan-badge subscription-status-badge ${statusTone} ${isPro ? 'pro' : ''}`}>{statusLabel}</span>
      </div>

      {billingError && (
        <div className="billing-status-alert error" role="alert">
          <div>
            <strong>Não foi possível atualizar a assinatura</strong>
            <p>{billingError}</p>
          </div>
          <button className="secondary-button billing-refresh-button" type="button" onClick={onRefreshSubscription} disabled={billingLoading || actionBusy}>
            {billingLoading ? 'Verificando...' : 'Tentar novamente'}
          </button>
        </div>
      )}

      <nav className="billing-tabs" aria-label="Opções da assinatura">
        <button
          className={section === 'plans' ? 'active' : ''}
          type="button"
          aria-pressed={section === 'plans'}
          onClick={() => setSection('plans')}
        >
          Planos e pagamento
        </button>
        <button
          className={section === 'cancellation' ? 'active' : ''}
          type="button"
          aria-pressed={section === 'cancellation'}
          onClick={() => setSection('cancellation')}
        >
          Cancelamento
        </button>
      </nav>

      {section === 'plans' && (
        <div className="billing-section-frame">
          <div className="plan-grid">
            <PlanCard plan="free" active={!billingLoading && !isPro} usage={usage} />
            <PlanCard plan="pro" active={!billingLoading && isPro} usage={usage} featured />
          </div>

          <div className="payment-panel">
            <div>
              <h2>{isLegacyPro ? 'Seu Pro legado está mantido' : isPro ? 'Sua assinatura Pro' : 'Pagamento do plano Pro'}</h2>
              <p>
                {isLegacyPro
                  ? 'Você continua com todos os recursos Pro. Este acesso foi mantido sem uma cobrança recorrente do Stripe.'
                  : isPro
                  ? cancellationScheduled
                    ? `Seu acesso continua ativo${currentPeriodEnd ? ` até ${currentPeriodEnd}` : ' até o fim do período pago'}.`
                    : 'Seu plano está ativo. Pagamentos, notas e método de cobrança podem ser gerenciados no portal seguro.'
                  : billingReady
                    ? 'O pagamento é processado com segurança. A liberação do Pro acontece automaticamente após a confirmação.'
                    : 'O serviço de pagamento está temporariamente indisponível.'}
              </p>
              {!isPro && pixKey && <p className="pix-box"><span>Chave Pix</span><b>{pixKey}</b></p>}
            </div>
            <div className="payment-actions">
              {!isPro && (
                <button className="primary-button" type="button" onClick={onCheckout} disabled={!billingReady || billingLoading || actionBusy}>
                  {billingAction === 'checkout' ? 'Abrindo checkout...' : 'Assinar plano Pro'}
                </button>
              )}
              {canManage && !isLegacyPro && (
                <button className="secondary-button" type="button" onClick={onOpenPortal} disabled={!billingReady || actionBusy}>
                  {billingAction === 'portal' ? 'Abrindo portal...' : 'Gerenciar cobrança'}
                </button>
              )}
              {!isLegacyPro && paymentSupportUrl && (
                <a className="secondary-link" href={paymentSupportUrl} target="_blank" rel="noreferrer">Enviar comprovante</a>
              )}
            </div>
          </div>
        </div>
      )}

      {section === 'cancellation' && (
        <section className="cancellation-panel billing-section-frame" aria-labelledby="cancellation-title">
          <div className="cancellation-heading">
            <span className="eyebrow">Gerenciar assinatura</span>
            <h2 id="cancellation-title">Cancelamento do plano Pro</h2>
            <p>
              {isLegacyPro
                ? 'Seu acesso Pro anterior permanece ativo e não depende de uma assinatura recorrente.'
                : 'Agende o encerramento da renovação ou reative o plano antes do fim do período já pago.'}
            </p>
          </div>

          {billingLoading ? (
            <div className="cancellation-empty billing-loading-state" role="status">
              <strong>Verificando sua assinatura</strong>
              <p>Aguarde enquanto consultamos o status mais recente.</p>
            </div>
          ) : isLegacyPro || (isPro && !canManage) ? (
            <div className="cancellation-empty" role="status">
              <strong>Pro legado mantido</strong>
              <p>Esta conta continua com acesso ao Pro e não possui renovação ou cobrança recorrente do Stripe para cancelar.</p>
              {accountEmail && <small>Conta: {accountEmail}</small>}
            </div>
          ) : isPro ? (
            <>
              {cancellationScheduled ? (
                <div className="cancellation-note scheduled" role="status">
                  <strong>Cancelamento agendado</strong>
                  <p>
                    {currentPeriodEnd
                      ? `O plano Pro permanece disponível até ${currentPeriodEnd}. Depois, sua conta volta automaticamente ao Free.`
                      : 'O plano Pro permanece disponível até o fim do período já pago.'}
                  </p>
                </div>
              ) : (
                <>
                  <ol className="cancellation-steps">
                    <li><b>Confirme o pedido</b><span>O cancelamento interrompe apenas a próxima renovação.</span></li>
                    <li><b>Mantenha seu acesso</b><span>O Pro continua liberado durante todo o período já pago.</span></li>
                    <li><b>Atualização automática</b><span>O status será atualizado pelo sistema sem envio de comprovante.</span></li>
                  </ol>

                  <div className="cancellation-note">
                    <strong>Antes de cancelar</strong>
                    <p>Se mudar de ideia, você poderá remover o agendamento enquanto o plano ainda estiver ativo.</p>
                  </div>
                </>
              )}

              <div className="cancellation-actions">
                {accountEmail && <small>Conta: {accountEmail}</small>}
                <div className="cancellation-button-group">
                  {cancellationScheduled ? (
                    <button className="primary-button resume-subscription-button" type="button" onClick={onResumeSubscription} disabled={!billingReady || actionBusy}>
                      {billingAction === 'resume' ? 'Reativando...' : 'Manter assinatura Pro'}
                    </button>
                  ) : (
                    <button className="secondary-button portal-cancel-button" type="button" onClick={onCancelSubscription} disabled={!billingReady || actionBusy || !isPro}>
                      {billingAction === 'cancel' ? 'Agendando...' : 'Agendar cancelamento'}
                    </button>
                  )}
                  <button className="secondary-button" type="button" onClick={onOpenPortal} disabled={!billingReady || actionBusy}>
                    {billingAction === 'portal' ? 'Abrindo portal...' : 'Abrir portal de cobrança'}
                  </button>
                </div>
                {!billingReady && <small className="portal-unavailable" role="status">Serviço temporariamente indisponível.</small>}
              </div>
            </>
          ) : (
            <div className="cancellation-empty">
              <strong>Nenhuma assinatura Pro ativa</strong>
              <p>
                {canManage
                  ? 'Não há um plano Pro ativo para cancelar. Use o portal se precisar consultar cobranças anteriores ou atualizar o pagamento.'
                  : 'Seu plano atual é Free, portanto não existe cobrança recorrente para cancelar nesta conta.'}
              </p>
              {canManage && (
                <button className="secondary-button" type="button" onClick={onOpenPortal} disabled={!billingReady || actionBusy}>
                  {billingAction === 'portal' ? 'Abrindo portal...' : 'Abrir portal de cobrança'}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function PlanCard({ plan, active, usage, featured = false }) {
  const details = plans[plan];
  const limits = details.limits;

  return (
    <article className={`plan-card ${featured ? 'featured' : ''}`}>
      <div className="plan-card-top">
        <div>
          <h2>{details.name}</h2>
          <p>{details.description}</p>
        </div>
        {active && <span className="status paid">Atual</span>}
      </div>
      <strong>{details.price}</strong>
      <ul>
        {details.features.map(feature => <li key={feature}>{feature}</li>)}
      </ul>
      <div className="limit-list">
        <p><span>Transações</span><b>{usage.transactions}/{formatLimit(limits.transactions)}</b></p>
        <p><span>Contas</span><b>{usage.bills}/{formatLimit(limits.bills)}</b></p>
        <p><span>Metas</span><b>{usage.goals}/{formatLimit(limits.goals)}</b></p>
      </div>
    </article>
  );
}

function Goals({ goals, onAdd, onEdit, onDelete }) {
  return (
    <section className="goal-list">
      <div className="align-right"><button className="primary-button" type="button" onClick={onAdd}>+ Nova Meta</button></div>
      {goals.map((goal, index) => {
        const percent = goal.target > 0 ? Math.min(Math.round((goal.current / goal.target) * 100), 100) : 0;
        return (
          <article className="goal-card" key={goal.id} style={{ '--motion-delay': `${index * 70}ms` }}>
            <span className={`goal-symbol ${goal.icon}`} aria-hidden="true">{goalIcons[goal.icon] || goalIcons.goal}</span>
            <div className="goal-content">
              <div className="goal-top">
                <div><h2>{goal.name}</h2><p>Objetivo: {formatCurrency(goal.target)}</p></div>
                <strong>{formatCurrency(goal.current)}</strong>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label={`Progresso da meta ${goal.name}`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={percent}
              ><span style={{ width: `${percent}%` }} /></div>
            </div>
            <b className="goal-percent">{percent}%</b>
            <div className="row-actions">
              <button className="table-button" type="button" aria-label={`Editar meta ${goal.name}`} onClick={() => onEdit(goal)}><span aria-hidden="true">{actionIcons.edit}</span></button>
              <button className="table-button danger-action" type="button" aria-label={`Excluir meta ${goal.name}`} onClick={() => onDelete(goal.id)}><span aria-hidden="true">{actionIcons.delete}</span></button>
            </div>
          </article>
        );
      })}
      {goals.length === 0 && <EmptyState text="Nenhuma meta cadastrada." />}
    </section>
  );
}

function Bills({ bills, filters, setFilters, onAdd, onEdit, onDelete, onToggle }) {
  const visibleBills = bills
    .filter(bill => filters.status === 'Todas' || bill.status === filters.status)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  return (
    <section className="page-card">
      <div className="page-actions">
        <PeriodFilters filters={filters} setFilters={setFilters} showStatus />
        <button className="primary-button" type="button" onClick={onAdd}>+ Nova Conta</button>
      </div>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Lista de contas a pagar</caption>
          <thead><tr><th scope="col">Vencimento</th><th scope="col">Conta</th><th scope="col">Valor</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead>
          <tbody>
            {visibleBills.map((bill, index) => (
              <tr className="data-row" key={bill.id} style={{ '--motion-delay': `${index * 42}ms` }}>
                <td data-label="Vencimento">{formatDate(bill.due_date)}</td>
                <td data-label="Conta">{bill.name}</td>
                <td data-label="Valor">{formatCurrency(bill.value)}</td>
                <td data-label="Status"><span className={`status ${bill.status === 'Pago' ? 'paid' : 'pending'}`}>{bill.status}</span></td>
                <td data-label="Ações">
                  <div className="row-actions">
                    <button className="table-button" type="button" aria-label={`Editar conta ${bill.name}`} onClick={() => onEdit(bill)}><span aria-hidden="true">{actionIcons.edit}</span></button>
                    <button className="table-button" type="button" aria-label={`${bill.status === 'Pago' ? 'Marcar como pendente' : 'Marcar como paga'}: ${bill.name}`} onClick={() => onToggle(bill.id)}><span aria-hidden="true">{bill.status === 'Pago' ? actionIcons.pending : actionIcons.paid}</span></button>
                    <button className="table-button danger-action" type="button" aria-label={`Excluir conta ${bill.name}`} onClick={() => onDelete(bill.id)}><span aria-hidden="true">{actionIcons.delete}</span></button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleBills.length === 0 && (
              <tr><td colSpan="5"><EmptyState text="Nenhuma conta neste filtro." /></td></tr>
            )}
          </tbody>
        </table>
        <div className="table-count">{visibleBills.length} contas</div>
      </div>
    </section>
  );
}

function Schedules({ schedules, categories, onAdd, onEdit, onDelete, onToggle, onApplyNow }) {
  const sortedSchedules = [...schedules].sort((a, b) => Number(a.day) - Number(b.day));

  return (
    <section className="page-card">
      <div className="page-actions">
        <div className="schedule-summary">
          <strong>{schedules.filter(schedule => schedule.active).length}</strong>
          <span>agendamentos ativos</span>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onApplyNow}>Aplicar vencidos</button>
          <button className="primary-button" type="button" onClick={onAdd}>+ Novo Agendamento</button>
        </div>
      </div>
      <div className="schedule-help">
        <b>Como funciona:</b> no dia escolhido de cada mês, o sistema cria automaticamente uma receita ou despesa do mês atual. Se já foi criado naquele mês, não duplica.
      </div>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Lista de agendamentos automáticos</caption>
          <thead><tr><th scope="col">Dia</th><th scope="col">Tipo</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col">Valor</th><th scope="col">Próximo</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead>
          <tbody>
            {sortedSchedules.map((schedule, index) => (
              <tr className="data-row" key={schedule.id} style={{ '--motion-delay': `${index * 42}ms` }}>
                <td data-label="Dia">Dia {schedule.day}</td>
                <td data-label="Tipo"><span className={`status ${schedule.type === 'income' ? 'paid' : 'pending'}`}>{schedule.type === 'income' ? 'Receita' : 'Despesa'}</span></td>
                <td data-label="Descrição">{schedule.description}</td>
                <td data-label="Categoria"><span className="tag">{schedule.category}</span></td>
                <td data-label="Valor">{formatCurrency(schedule.value)}</td>
                <td data-label="Próximo">{formatDate(scheduleDate(schedule))}</td>
                <td data-label="Status"><span className={`status ${schedule.active ? 'paid' : 'pending'}`}>{schedule.active ? 'Ativo' : 'Pausado'}</span></td>
                <td data-label="Ações">
                  <div className="row-actions">
                    <button className="table-button" type="button" aria-label={`Editar agendamento ${schedule.description}`} onClick={() => onEdit(schedule)}><span aria-hidden="true">{actionIcons.edit}</span></button>
                    <button className="table-button" type="button" aria-label={`${schedule.active ? 'Pausar' : 'Ativar'} agendamento ${schedule.description}`} onClick={() => onToggle(schedule.id)}><span aria-hidden="true">{schedule.active ? actionIcons.pause : actionIcons.play}</span></button>
                    <button className="table-button danger-action" type="button" aria-label={`Excluir agendamento ${schedule.description}`} onClick={() => onDelete(schedule.id)}><span aria-hidden="true">{actionIcons.delete}</span></button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedSchedules.length === 0 && (
              <tr><td colSpan="8"><EmptyState text="Nenhum agendamento cadastrado." /></td></tr>
            )}
          </tbody>
        </table>
        <div className="table-count">
          Receitas: {categories.incomes.length} categorias - Despesas: {categories.expenses.length} categorias
        </div>
      </div>
    </section>
  );
}

function Settings({
  draft,
  setDraft,
  saveSettings,
  section,
  setSection,
  categories,
  newCategory,
  setNewCategory,
  addCategory,
  removeCategory,
  exportCsv,
  exportBackup,
  importBackup,
  user,
  isPro,
  onUpgrade,
  onPhotoChange,
  onPhotoRemove,
}) {
  const sections = ['Perfil', 'Preferências', 'Categorias', 'Exportar Dados', 'Backup', 'Segurança'];

  return (
    <div className="settings-layout">
      <nav className="settings-menu" aria-label="Seções das configurações">
        {sections.map(item => (
          <button className={section === item ? 'active' : ''} type="button" key={item} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}</button>
        ))}
      </nav>
      <section className="settings-form">
        <div className="settings-section-frame" key={section}>
        {section === 'Perfil' && (
          <form className="settings-section" onSubmit={saveSettings}>
            <h2>Perfil</h2>
            <div className="profile-editor">
              <UserAvatar settings={draft} size="lg" />
              <div>
                <strong>{draft.name || 'Seu nome'}</strong>
                <p>Use uma foto quadrada de ate 350 KB para deixar o perfil mais profissional.</p>
                <div className="profile-photo-actions">
                  <label className="file-button">
                    Trocar foto
                    <input type="file" accept="image/*" onChange={onPhotoChange} />
                  </label>
                  {draft.photo && <button className="secondary-button" type="button" onClick={onPhotoRemove}>Remover</button>}
                </div>
              </div>
            </div>
            <div className="form-grid">
              <label>Nome<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
              <label>E-mail<input type="email" autoComplete="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
            </div>
            <button className="primary-button" type="submit">Salvar Alterações</button>
          </form>
        )}
        {section === 'Preferências' && (
          <form className="settings-section" onSubmit={saveSettings}>
            <h2>Preferências</h2>
            <div className="form-grid">
              <label>Moeda<select value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}><option value="BRL">Real (R$)</option></select></label>
              <label>Tema<select value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value })}><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
            </div>
            <button className="primary-button" type="submit">Salvar Preferências</button>
          </form>
        )}
        {section === 'Categorias' && (
          <div className="settings-section">
            <h2>Categorias</h2>
            <form className="category-form" onSubmit={addCategory}>
              <label>Tipo
                <select value={newCategory.type} onChange={e => setNewCategory({ ...newCategory, type: e.target.value })}>
                  <option value="expenses">Despesas</option>
                  <option value="incomes">Receitas</option>
                </select>
              </label>
              <label>Nome
                <input value={newCategory.name} onChange={e => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="Nova categoria" />
              </label>
              <button className="primary-button" type="submit">Adicionar</button>
            </form>
            <CategoryList title="Receitas" type="incomes" items={categories.incomes} removeCategory={removeCategory} />
            <CategoryList title="Despesas" type="expenses" items={categories.expenses} removeCategory={removeCategory} />
          </div>
        )}
        {section === 'Exportar Dados' && (
          <div className="settings-section">
            <h2>Exportar Dados</h2>
            <p className="settings-note">Gere um arquivo CSV com receitas, despesas, contas e metas cadastradas.</p>
            {isPro ? (
              <button className="primary-button" type="button" onClick={exportCsv}>Baixar CSV</button>
            ) : (
              <LockedSetting text="Exportação CSV faz parte do plano Pro." onUpgrade={onUpgrade} />
            )}
          </div>
        )}
        {section === 'Backup' && (
          <div className="settings-section">
            <h2>Backup</h2>
            <p className="settings-note">Baixe um backup completo em JSON para guardar uma cópia dos seus dados.</p>
            {isPro ? (
              <>
                <div className="backup-actions">
                  <button className="secondary-button" type="button" onClick={exportBackup}>Baixar Backup</button>
                  <label className="file-button">
                    Importar Backup
                    <input type="file" accept="application/json,.json" onChange={importBackup} />
                  </label>
                </div>
                <p className="settings-note">Ao importar, os dados atuais desta conta serão substituídos pelo arquivo selecionado.</p>
              </>
            ) : (
              <LockedSetting text="Backup e importação fazem parte do plano Pro." onUpgrade={onUpgrade} />
            )}
          </div>
        )}
        {section === 'Segurança' && (
          <div className="settings-section">
            <h2>Segurança</h2>
            <p className="settings-note">Seus dados ficam separados pelo seu ID de usuário no Firestore.</p>
            <div className="security-box">
              <span>Usuario autenticado</span>
              <strong>{user.email}</strong>
            </div>
          </div>
        )}
        </div>
      </section>
      <aside className="account-card">
        <div className="account-hero">
          <UserAvatar settings={draft} size="xl" />
          <h2>{draft.name || 'Sua conta'}</h2>
          <p>{draft.email || user.email}</p>
          <span className={`plan-badge ${isPro ? 'pro' : ''}`}>{isPro ? 'Plano Pro' : 'Plano Free'}</span>
        </div>
        <hr />
        <div className="account-detail">
          <span>E-mail de acesso</span>
          <strong>{user.email}</strong>
        </div>
        <div className="account-detail">
          <span>Tema atual</span>
          <strong>{draft.theme === 'dark' ? 'Escuro' : 'Claro'}</strong>
        </div>
        {!isPro && <button className="primary-button" type="button" onClick={onUpgrade}>Liberar plano Pro</button>}
      </aside>
    </div>
  );
}

function LockedSetting({ text, onUpgrade }) {
  return (
    <div className="locked-setting">
      <p>{text}</p>
      <button className="primary-button" type="button" onClick={onUpgrade}>Fazer upgrade</button>
    </div>
  );
}

function CategoryList({ title, type, items, removeCategory }) {
  return (
    <div className="category-list">
      <h3>{title}</h3>
      <div>
        {items.map((item, index) => (
          <span className="category-pill" key={item} style={{ '--motion-delay': `${index * 36}ms` }}>
            {item}
            <button type="button" aria-label={`Remover ${item}`} onClick={() => removeCategory(type, item)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function TransactionModal({ title, type, item, categories, onClose, onSubmit }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={event => onSubmit(type, event, item)} className="modal-form">
        <label>Data<input name="date" type="date" defaultValue={item?.date || todayIsoDate()} required /></label>
        <label>Descrição<input name="description" placeholder="Ex: Salário" defaultValue={item?.description || ''} required /></label>
        <label>Categoria
          <input name="category" list={`${type}-categories`} placeholder="Ex: Trabalho" defaultValue={item?.category || ''} required />
          <datalist id={`${type}-categories`}>
            {categories.map(category => <option key={category} value={category} />)}
          </datalist>
        </label>
        <label>Valor<input name="value" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={item?.value || ''} required /></label>
        <button className="primary-button" type="submit">Salvar</button>
      </form>
    </Modal>
  );
}

function BillModal({ item, onClose, onSubmit }) {
  return (
    <Modal title={item ? 'Editar Conta' : 'Nova Conta'} onClose={onClose}>
      <form onSubmit={event => onSubmit(event, item)} className="modal-form">
        <label>Vencimento<input name="due_date" type="date" defaultValue={item?.due_date || todayIsoDate()} required /></label>
        <label>Conta<input name="name" defaultValue={item?.name || ''} required /></label>
        <label>Valor<input name="value" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={item?.value || ''} required /></label>
        <label>Status<select name="status" defaultValue={item?.status || 'Pendente'}><option>Pendente</option><option>Pago</option></select></label>
        <button className="primary-button" type="submit">Salvar</button>
      </form>
    </Modal>
  );
}

function GoalModal({ item, onClose, onSubmit }) {
  return (
    <Modal title={item ? 'Editar Meta' : 'Nova Meta'} onClose={onClose}>
      <form onSubmit={event => onSubmit(event, item)} className="modal-form">
        <label>Nome<input name="name" defaultValue={item?.name || ''} required /></label>
        <label>Objetivo<input name="target" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={item?.target || ''} required /></label>
        <label>Valor atual<input name="current" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={item?.current || ''} required /></label>
        <label>Ícone<select name="icon" defaultValue={item?.icon || 'goal'}><option value="goal">Padrão</option><option value="plane">Viagem</option><option value="shield">Reserva</option><option value="home">Casa</option></select></label>
        <button className="primary-button" type="submit">Salvar</button>
      </form>
    </Modal>
  );
}

function ScheduleModal({ item, categories, onClose, onSubmit }) {
  const [type, setType] = useState(item?.type || 'income');
  const categoryOptions = type === 'income' ? categories.incomes : categories.expenses;

  return (
    <Modal title={item ? 'Editar Agendamento' : 'Novo Agendamento'} onClose={onClose}>
      <form onSubmit={event => onSubmit(event, item)} className="modal-form">
        <label>Tipo
          <select name="type" value={type} onChange={event => setType(event.target.value)}>
            <option value="income">Receita mensal</option>
            <option value="expense">Despesa mensal</option>
          </select>
        </label>
        <label>Dia do mês<input name="day" type="number" inputMode="numeric" min="1" max="31" defaultValue={item?.day || 5} required /></label>
        <label>Descrição<input name="description" placeholder="Ex: Salário, Aluguel, Internet" defaultValue={item?.description || ''} required /></label>
        <label>Categoria
          <input name="category" list="schedule-categories" placeholder={type === 'income' ? 'Ex: Trabalho' : 'Ex: Contas'} defaultValue={item?.category || ''} required />
          <datalist id="schedule-categories">
            {categoryOptions.map(category => <option key={category} value={category} />)}
          </datalist>
        </label>
        <label>Valor<input name="value" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={item?.value || ''} required /></label>
        <label>Status
          <select name="active" defaultValue={String(item?.active ?? true)}>
            <option value="true">Ativo</option>
            <option value="false">Pausado</option>
          </select>
        </label>
        <button className="primary-button" type="submit">Salvar Agendamento</button>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => (dialog ? [...dialog.querySelectorAll(focusableSelector)] : []);
    const initialFocusable = getFocusable();
    const preferredFocus = dialog?.querySelector('[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');

    (preferredFocus || initialFocusable[0])?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      const focusable = getFocusable();
      if (event.key !== 'Tab') return;
      if (focusable.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      if (focusable.length === 1) {
        event.preventDefault();
        focusable[0].focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex="-1" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header"><h2 id="modal-title">{title}</h2><button type="button" aria-label="Fechar" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, cancelLabel = 'Cancelar', tone = 'danger', busy = false, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel}>
      <div className="confirm-dialog" aria-busy={busy}>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className={`primary-button ${tone === 'danger' ? 'danger-button' : ''}`} type="button" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state"><span aria-hidden="true">📭</span><span>{text}</span></div>;
}

function useReducedMotion() {
  const getPreference = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [reducedMotion, setReducedMotion] = useState(getPreference);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = event => setReducedMotion(event.matches);

    setReducedMotion(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  return reducedMotion;
}

function ChartCanvas({ config, label, reducedMotion }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const configRef = useRef(config);
  const [chartError, setChartError] = useState('');
  const labels = config?.data?.labels || [];
  const datasets = config?.data?.datasets || [];
  const dataSummary = labels.map((itemLabel, index) => {
    if (itemLabel === 'Sem dados') return 'Sem dados disponíveis';
    const values = datasets.map(dataset => {
      const value = dataset.data?.[index];
      const formattedValue = Number.isFinite(Number(value)) ? formatCurrency(value) : String(value ?? '-');
      return dataset.label ? `${dataset.label}: ${formattedValue}` : formattedValue;
    });
    return `${itemLabel}: ${values.join(', ')}`;
  }).join('; ');
  const accessibilityLabel = dataSummary ? `${label}. Dados: ${dataSummary}` : label;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    Chart.getChart(canvas)?.destroy();

    try {
      chartRef.current = new Chart(canvas, configRef.current);
      setChartError('');
    } catch (error) {
      chartRef.current = null;
      setChartError('Não foi possível carregar este gráfico.');
      console.error('Erro ao renderizar gráfico:', error);
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
      Chart.getChart(canvas)?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || configRef.current === config) return;

    configRef.current = config;
    chartRef.current.data = config.data;
    chartRef.current.options = config.options;
    chartRef.current.update(reducedMotion ? 'none' : undefined);
  }, [config, reducedMotion]);

  return (
    <div className="chart-wrap">
      <canvas ref={canvasRef} role="img" aria-label={accessibilityLabel}>
        {accessibilityLabel}
      </canvas>
      {chartError && <div className="chart-error">{chartError}</div>}
    </div>
  );
}

function chartAnimation(reducedMotion, { duration = 760, stagger = 0, datasetDelay = 0, startDelay = 90 } = {}) {
  if (reducedMotion) return false;

  return {
    duration,
    easing: 'easeOutQuart',
    delay(context) {
      if (context.type !== 'data' || context.mode === 'active' || context.mode === 'resize') return 0;
      const dataIndex = Number.isFinite(context.dataIndex) ? context.dataIndex : 0;
      const datasetIndex = Number.isFinite(context.datasetIndex) ? context.datasetIndex : 0;
      return startDelay + (dataIndex * stagger) + (datasetIndex * datasetDelay);
    },
  };
}

function lineConfig(series, reducedMotion, theme) {
  return {
    type: 'line',
    data: {
      labels: series.map(item => item.label),
      datasets: [
        {
          label: 'Receitas',
          data: series.map(item => item.income),
          borderColor: '#147a50',
          backgroundColor: 'rgba(20, 122, 80, 0.1)',
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#147a50',
          pointHoverBackgroundColor: '#147a50',
          pointHoverBorderColor: '#ffffff',
          borderWidth: 3,
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.38,
          fill: true,
        },
        {
          label: 'Despesas',
          data: series.map(item => item.expense),
          borderColor: '#b63845',
          backgroundColor: 'rgba(182, 56, 69, 0.07)',
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#b63845',
          pointHoverBackgroundColor: '#b63845',
          pointHoverBorderColor: '#ffffff',
          borderWidth: 3,
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.38,
          fill: true,
        },
      ],
    },
    options: baseChartOptions(reducedMotion, true, { duration: 720, stagger: 24, datasetDelay: 80 }, theme),
  };
}

function barConfig(series, reducedMotion, theme) {
  return {
    type: 'bar',
    data: {
      labels: series.map(item => item.label),
      datasets: [
        { label: 'Receitas', data: series.map(item => item.income), backgroundColor: '#147a50', hoverBackgroundColor: '#0d5f3c', borderRadius: 7, borderSkipped: false, maxBarThickness: 28 },
        { label: 'Despesas', data: series.map(item => item.expense), backgroundColor: '#b63845', hoverBackgroundColor: '#8f2532', borderRadius: 7, borderSkipped: false, maxBarThickness: 28 },
      ],
    },
    options: baseChartOptions(reducedMotion, true, { duration: 680, stagger: 38, datasetDelay: 90 }, theme),
  };
}

function balanceConfig(series, balance, reducedMotion, theme) {
  const balanceColor = theme === 'dark' ? '#e8e7e2' : '#242424';
  const balanceFill = theme === 'dark' ? 'rgba(232, 231, 226, 0.1)' : 'rgba(36, 36, 36, 0.09)';
  return {
    type: 'line',
    data: {
      labels: series.map(item => item.label),
      datasets: [{
        label: 'Saldo acumulado',
        data: balance,
        borderColor: balanceColor,
        backgroundColor: balanceFill,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: balanceColor,
        pointHoverBackgroundColor: balanceColor,
        pointHoverBorderColor: '#ffffff',
        borderWidth: 3,
        pointBorderWidth: 2,
        tension: 0.42,
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: true,
      }],
    },
    options: baseChartOptions(reducedMotion, false, { duration: 760, stagger: 28 }, theme),
  };
}

function doughnutConfig(totals, reducedMotion, theme) {
  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const palette = theme === 'dark'
    ? ['#e8e7e2', '#61d59b', '#ff8993', '#d6af62', '#8d8d87']
    : ['#242424', '#147a50', '#b63845', '#b88736', '#74746f'];
  return {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['Sem dados'],
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: values.length ? palette : [theme === 'dark' ? '#303033' : '#d7d7d1'],
        borderWidth: 0,
        borderRadius: 5,
        spacing: 3,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 120,
      animation: reducedMotion ? false : {
        ...chartAnimation(reducedMotion, { duration: 820, stagger: 55, startDelay: 100 }),
        animateRotate: true,
        animateScale: true,
      },
      transitions: { active: { animation: { duration: reducedMotion ? 0 : 170 } } },
      interaction: { intersect: false, mode: 'nearest' },
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 9, usePointStyle: true, padding: 16, color: theme === 'dark' ? '#b8b8b2' : '#686864' } },
        tooltip: { padding: 12, cornerRadius: 8, displayColors: true },
      },
      cutout: '64%',
    },
  };
}

function baseChartOptions(reducedMotion, showLegend = true, animationSettings = {}, theme = 'light') {
  const textColor = theme === 'dark' ? '#b8b8b2' : '#686864';
  const gridColor = theme === 'dark' ? 'rgba(242, 242, 238, 0.12)' : 'rgba(25, 25, 25, 0.11)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 120,
    animation: chartAnimation(reducedMotion, animationSettings),
    transitions: {
      active: { animation: { duration: reducedMotion ? 0 : 170 } },
      resize: { animation: { duration: reducedMotion ? 0 : 220 } },
    },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: showLegend, position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true, padding: 16, color: textColor } },
      tooltip: { padding: 12, cornerRadius: 8, displayColors: true },
    },
    elements: { line: { borderJoinStyle: 'round', borderCapStyle: 'round' } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: textColor, padding: 8 } },
      y: { grid: { color: gridColor }, border: { display: false }, ticks: { color: textColor, padding: 8, callback: value => formatCurrency(value).replace(',00', '') } },
    },
  };
}

export default App;
