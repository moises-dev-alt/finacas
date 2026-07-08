import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

Chart.register(...registerables);

const currentMonth = 'Junho';
const currentYear = '2026';
const proCheckoutUrl = import.meta.env.VITE_PRO_CHECKOUT_URL || '';
const paymentSupportUrl = import.meta.env.VITE_PAYMENT_SUPPORT_URL || '';
const pixKey = import.meta.env.VITE_PIX_KEY || '';
const adminActivationCode = import.meta.env.VITE_ADMIN_ACTIVATION_CODE || '';

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
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'receitas', label: 'Receitas', icon: '▣' },
  { id: 'despesas', label: 'Despesas', icon: '▤' },
  { id: 'relatorios', label: 'Relatórios', icon: '▥' },
  { id: 'metas', label: 'Metas', icon: '◎' },
  { id: 'contas', label: 'Contas a Pagar', icon: '□' },
  { id: 'agendamentos', label: 'Agendamentos', icon: '◷' },
  { id: 'assinatura', label: 'Assinatura', icon: '◇' },
  { id: 'configuracoes', label: 'Configurações', icon: '⚙' },
];

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

const years = ['2026', '2025', '2024'];

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
    checkoutStartedAt: null,
    upgradedAt: null,
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

function planLabel(subscription) {
  return subscription?.plan === 'pro' ? 'Pro' : 'Free';
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
  return monthOptions.find(month => month.label === label)?.value || '06';
}

function monthLabelFromDate(date) {
  const month = date?.slice(5, 7);
  return monthOptions.find(item => item.value === month)?.label || currentMonth;
}

function inPeriod(date, filters) {
  if (!date) return false;
  return date.startsWith(`${filters.year}-${monthNumber(filters.month)}`);
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
    subscription: {
      ...emptyFinanceData.subscription,
      ...source?.subscription,
      plan: source?.subscription?.plan === 'pro' ? 'pro' : 'free',
      status: source?.subscription?.status || 'active',
    },
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
  return subscription?.plan === 'pro' && subscription?.status === 'active';
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

function userFinanceRef(userId) {
  return doc(db, 'users', userId, 'finance', 'current');
}

function normalizeRemoteData(payload, user) {
  return normalizeFinanceData(payload, user);
}

function buildMonthlySeries(incomes, expenses, year) {
  return monthOptions.map(month => {
    const prefix = `${year}-${month.value}`;
    const income = sumValues(incomes.filter(item => item.date?.startsWith(prefix)));
    const expense = sumValues(expenses.filter(item => item.date?.startsWith(prefix)));
    return { label: month.short, income, expense, balance: income - expense };
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
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <div className="auth-brand">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <strong>Finanças Pro</strong>
        </div>
        <nav>
          <a href="#recursos">Recursos</a>
          <a href="#preco">Preço</a>
          <button className="secondary-button" type="button" onClick={onLogin}>Entrar</button>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">Controle financeiro para pequenos negocios</span>
          <h1>Organize receitas, despesas, contas e metas em um painel pronto para vender.</h1>
          <p>Um sistema online com Firebase, relatórios, backups e dados separados por usuário para transformar controle financeiro em produto profissional.</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onRegister}>Começar agora</button>
            <button className="secondary-button" type="button" onClick={onLogin}>Ja tenho conta</button>
          </div>
          <div className="trust-row">
            <span>Dados por usuário</span>
            <span>Backup JSON</span>
            <span>Relatórios mensais</span>
          </div>
        </div>

        <div className="product-preview" aria-label="Previa do painel financeiro">
          <div className="preview-top">
            <span>Saldo do mês</span>
            <strong>{formatCurrency(12450)}</strong>
          </div>
          <div className="preview-bars">
            <span style={{ height: '52%' }} />
            <span style={{ height: '74%' }} />
            <span style={{ height: '46%' }} />
            <span style={{ height: '86%' }} />
            <span style={{ height: '63%' }} />
          </div>
          <div className="preview-metrics">
            <p><span>Receitas</span><b className="positive">{formatCurrency(18500)}</b></p>
            <p><span>Despesas</span><b className="negative">{formatCurrency(6050)}</b></p>
          </div>
        </div>
      </section>

      <section className="landing-section" id="recursos">
        <h2>Pronto para operar no dia a dia</h2>
        <div className="feature-grid">
          <article><b>Dashboard executivo</b><p>KPIs, ultimas transacoes e comparativo de receitas e despesas.</p></article>
          <article><b>Gestao completa</b><p>Cadastre receitas, despesas, contas, metas, categorias e agendamentos.</p></article>
          <article><b>Segurança Firebase</b><p>Cada usuário acessa apenas os próprios dados no Firestore.</p></article>
          <article><b>Exportacao e backup</b><p>CSV para planilhas e backup JSON para portabilidade.</p></article>
        </div>
      </section>

      <section className="pricing-section" id="preco">
        <div>
          <span className="eyebrow">Oferta inicial</span>
          <h2>Plano Pro</h2>
          <p>Ideal para vender como sistema financeiro simples para autônomos e pequenos negócios.</p>
        </div>
        <div className="price-card">
          <span>A partir de</span>
          <strong>R$ 29/mês</strong>
          <button className="primary-button" type="button" onClick={onRegister}>Criar acesso</button>
        </div>
      </section>
    </main>
  );
}

function AuthPage({ mode, setMode, error, onSubmit, onBack }) {
  const isRegister = mode === 'register';

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <strong>Finanças</strong>
        </div>
        <button className="auth-switch" type="button" onClick={onBack}>Voltar para apresentação</button>
        <div>
          <h1>{isRegister ? 'Criar conta' : 'Entrar'}</h1>
          <p>{isRegister ? 'Cadastre seu acesso para salvar seus dados.' : 'Acesse seu painel financeiro.'}</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          {isRegister && (
            <label>
              Nome
              <input name="name" autoComplete="name" placeholder="Seu nome" required />
            </label>
          )}
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" placeholder="voce@email.com" required />
          </label>
          <label>
            Senha
            <input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="6" placeholder="******" required />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button" type="submit">{isRegister ? 'Cadastrar' : 'Entrar'}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => setMode(isRegister ? 'login' : 'register')}>
          {isRegister ? 'Já tenho conta' : 'Criar cadastro'}
        </button>
      </section>
      <section className="auth-preview" aria-hidden="true">
        <div className="preview-card">
          <span>Saldo Atual</span>
          <strong>{formatCurrency(12540)}</strong>
          <small>Sincronizado com Firebase</small>
        </div>
        <div className="preview-row">
          <span />
          <span />
          <span />
        </div>
      </section>
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
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ month: currentMonth, year: currentYear, status: 'Todas', category: 'Todas' });
  const [settingsDraft, setSettingsDraft] = useState(data.settings);
  const [settingsSection, setSettingsSection] = useState('Perfil');
  const [newCategory, setNewCategory] = useState({ type: 'expenses', name: '' });

  useEffect(() => {
    return onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    async function loadFirebaseData() {
      try {
        const snapshot = await getDoc(userFinanceRef(user.uid));
        const remoteData = snapshot.exists()
          ? normalizeRemoteData(snapshot.data(), user)
          : createEmptyFinanceData(user);
        const scheduled = applyDueSchedules(remoteData);

        if (!snapshot.exists()) {
          await setDoc(userFinanceRef(user.uid), {
            ...scheduled.data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (scheduled.changed) {
          await setDoc(userFinanceRef(user.uid), {
            ...scheduled.data,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        setData(scheduled.data);
        setSettingsDraft(scheduled.data.settings);
        setApiOnline(true);
        setSaveStatus('saved');
      } catch {
        const localData = normalizeRemoteData(loadLocalData(), user);
        const scheduled = applyDueSchedules(localData);
        setData(scheduled.data);
        setSettingsDraft(scheduled.data.settings);
        setApiOnline(false);
        setSaveStatus('offline');
      }
    }

    loadFirebaseData();
  }, [user]);

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

  const monthIncomes = useMemo(() => data.incomes.filter(item => inPeriod(item.date, filters)), [data.incomes, filters]);
  const monthExpenses = useMemo(() => data.expenses.filter(item => inPeriod(item.date, filters)), [data.expenses, filters]);
  const monthBills = useMemo(() => data.bills.filter(item => inPeriod(item.due_date, filters)), [data.bills, filters]);
  const usage = useMemo(() => usageFromData(data), [data]);
  const isPro = isProSubscription(data.subscription);

  const totals = useMemo(() => {
    const income = sumValues(monthIncomes);
    const expense = sumValues(monthExpenses);
    return { income, expense, balance: income - expense, economy: Math.max(income - expense, 0) };
  }, [monthIncomes, monthExpenses]);

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
    const balance = [];
    let running = 0;
    series.forEach(item => {
      running += item.balance;
      balance.push(running);
    });
    return { series, expenseCategories, balance };
  }, [data.incomes, data.expenses, monthExpenses, filters.year, filters.category]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError('');

    const form = new FormData(event.currentTarget);
    const name = form.get('name')?.toString().trim();
    const email = form.get('email')?.toString().trim();
    const password = form.get('password')?.toString();

    try {
      if (authMode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(credential.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      const messages = {
        'auth/email-already-in-use': 'Este e-mail já possui cadastro.',
        'auth/invalid-email': 'Digite um e-mail válido.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/configuration-not-found': 'Firebase Authentication ainda não foi ativado neste projeto. Ative Authentication > E-mail/Senha no Console Firebase.',
        'auth/operation-not-allowed': 'Ative o provedor E-mail/Senha no Firebase Authentication.',
        'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
      };
      setAuthError(messages[error.code] || 'Não foi possível entrar agora.');
    }
  }

  async function persist(nextData) {
    setData(nextData);
    localStorage.setItem('financeData', JSON.stringify(nextData));
    setSaveStatus(user ? 'saving' : 'local');
    if (!user) return;
    try {
      await setDoc(userFinanceRef(user.uid), { ...nextData, updatedAt: serverTimestamp() }, { merge: true });
      setApiOnline(true);
      setSaveStatus('saved');
    } catch {
      setApiOnline(false);
      setSaveStatus('offline');
    }
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
    const nextData = {
      ...data,
      subscription: {
        ...data.subscription,
        plan: data.subscription?.plan || 'free',
        status: data.subscription?.status === 'active' && data.subscription?.plan === 'pro' ? 'active' : 'pending',
        checkoutStartedAt: new Date().toISOString(),
      },
    };
    await persist(nextData);

    if (proCheckoutUrl) {
      window.open(proCheckoutUrl, '_blank', 'noopener,noreferrer');
      setNotice('Checkout aberto. Depois do pagamento, a ativação do Pro deve ser confirmada pelo painel/admin.');
      return;
    }

    setNotice('Configure VITE_PRO_CHECKOUT_URL para abrir um checkout de pagamento real.');
  }

  async function activateProManual() {
    if (!adminActivationCode) {
      setNotice('Configure VITE_ADMIN_ACTIVATION_CODE para ativação manual do plano Pro.');
      return;
    }

    const code = window.prompt('Digite o código administrativo para ativar o Pro:');
    if (code !== adminActivationCode) {
      setNotice('Código administrativo inválido.');
      return;
    }

    const nextData = {
      ...data,
      subscription: {
        ...data.subscription,
        plan: 'pro',
        status: 'active',
        upgradedAt: new Date().toISOString(),
      },
    };
    await persist(nextData);
    setNotice('Plano Pro ativado nesta conta.');
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
    } else {
      setSaveStatus(user ? 'saved' : 'local');
    }
  }

  function saveSettings(event) {
    event.preventDefault();
    persist({ ...data, settings: settingsDraft });
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
    downloadFile(`financas-${filters.year}-${monthNumber(filters.month)}.csv`, content, 'text/csv;charset=utf-8');
  }

  function exportBackup() {
    downloadFile('backup-financas.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const payload = await parseBackupFile(file);
      const nextData = normalizeFinanceData(payload, user);
      await persist(nextData);
      setSettingsDraft(nextData.settings);
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
    return <div className="loading-screen">Carregando...</div>;
  }

  if (!user) {
    if (!showAuth) {
      return (
        <LandingPage
          onLogin={() => {
            setAuthMode('login');
            setShowAuth(true);
          }}
          onRegister={() => {
            setAuthMode('register');
            setShowAuth(true);
          }}
        />
      );
    }

    return (
      <AuthPage
        mode={authMode}
        setMode={setAuthMode}
        error={authError}
        onSubmit={handleAuthSubmit}
        onBack={() => setShowAuth(false)}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <strong>Finanças</strong>
        </div>
        <nav className="menu" aria-label="Navegacao principal">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`menu-link ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="menu-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="logout" type="button" onClick={() => signOut(auth)}>⇱ Sair</button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button" type="button" aria-label="Menu">☰</button>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <span className={`save-status ${saveStatus}`}>{saveLabel}</span>
            <span className={`sync-dot ${apiOnline ? 'online' : ''}`} title={apiOnline ? 'Firebase conectado' : 'Usando dados locais'} />
            <button className="icon-button" type="button" aria-label="Notificações">♧</button>
            <div className="user-chip">
              <UserAvatar settings={data.settings} />
              <div>
                <strong>{data.settings.name}</strong>
                <small>{planLabel(data.subscription)}</small>
              </div>
            </div>
          </div>
        </header>

        {activePage === 'dashboard' && (
          <Dashboard
            totals={totals}
            transactions={dashboardTransactions}
            filters={filters}
            setFilters={setFilters}
            chartData={chartData}
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
            onManualActivate={activateProManual}
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
    </div>
  );
}

function PeriodFilters({ filters, setFilters, showStatus = false, showCategory = false, categories = [] }) {
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

function Dashboard({ totals, transactions, filters, setFilters, chartData }) {
  const lineChartConfig = useMemo(() => lineConfig(chartData.series), [chartData.series]);

  return (
    <div className="page-stack">
      <div className="dashboard-filter-row">
        <PeriodFilters filters={filters} setFilters={setFilters} />
      </div>
      <section className="kpi-grid">
        <Kpi title="Saldo Atual" value={totals.balance} note={`${filters.month} de ${filters.year}`} tone="wallet" trend="" />
        <Kpi title="Receitas" value={totals.income} note="Período filtrado" tone="income" trend="" />
        <Kpi title="Despesas" value={totals.expense} note="Período filtrado" tone="expense" trend="" />
        <Kpi title="Economia" value={totals.economy} note="Período filtrado" tone="saving" trend="" />
      </section>
      <section className="dashboard-grid">
        <div className="panel chart-panel">
          <div className="panel-header"><h2>Receitas x Despesas</h2></div>
          <ChartCanvas config={lineChartConfig} />
        </div>
        <div className="panel transactions-panel">
          <div className="panel-header"><h2>Últimas Transações</h2></div>
          <div className="transaction-list">
            {transactions.slice(0, 6).map(item => (
              <div className="transaction-row" key={`${item.type}-${item.id}`}>
                <span className={`round-icon ${item.type === 'Receita' ? 'income' : 'expense'}`}>{item.type === 'Receita' ? '↓' : '↑'}</span>
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

function Kpi({ title, value, note, tone, trend }) {
  return (
    <article className="kpi-card">
      <Icon name={tone} />
      <span>{title}</span>
      <strong>{formatCurrency(value)}</strong>
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

  return (
    <section className="page-card">
      <div className="page-actions">
        <PeriodFilters filters={filters} setFilters={setFilters} showCategory categories={categories} />
        <button className="primary-button" type="button" onClick={onAdd}>{buttonLabel}</button>
      </div>
      <div className="search-line">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar ${title.toLowerCase()}...`} />
      </div>
      <DataTable rows={sortByDate(visibleRows)} total={total} totalClass={totalClass} onEdit={onEdit} onDelete={onDelete} />
    </section>
  );
}

function DataTable({ rows, total, totalClass, onEdit, onDelete }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{formatDate(row.date)}</td>
              <td>{row.description}</td>
              <td><span className="tag">{row.category}</span></td>
              <td><strong>{formatCurrency(row.value)}</strong></td>
              <td>
                <button className="table-button" type="button" aria-label="Editar" onClick={() => onEdit(row)}>⌁</button>
                <button className="table-button danger-action" type="button" aria-label="Excluir" onClick={() => onDelete(row.id)}>⌫</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan="5"><EmptyState text="Nenhum registro encontrado." /></td></tr>
          )}
          <tr className="total-row">
            <td colSpan="3">Total</td>
            <td className={totalClass}>{formatCurrency(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="pagination"><span>‹</span><b>1</b><span>›</span></div>
    </div>
  );
}

function Reports({ filters, setFilters, categories, chartData, totals }) {
  const doughnutChartConfig = useMemo(() => doughnutConfig(chartData.expenseCategories), [chartData.expenseCategories]);
  const barChartConfig = useMemo(() => barConfig(chartData.series), [chartData.series]);
  const balanceChartConfig = useMemo(
    () => balanceConfig(chartData.series, chartData.balance),
    [chartData.series, chartData.balance],
  );

  return (
    <div className="reports-grid">
      <div className="report-filters">
        <PeriodFilters filters={filters} setFilters={setFilters} showCategory categories={categories} />
      </div>
      <div className="report-panels">
        <div className="panel"><div className="panel-header"><h2>Despesas por Categoria</h2></div><ChartCanvas config={doughnutChartConfig} /></div>
        <div className="panel"><div className="panel-header"><h2>Receitas x Despesas</h2></div><ChartCanvas config={barChartConfig} /></div>
        <div className="panel"><div className="panel-header"><h2>Evolução do Saldo</h2></div><ChartCanvas config={balanceChartConfig} /></div>
        <div className="panel summary-panel">
          <h2>Resumo do Período</h2>
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

function Billing({ subscription, usage, isPro, onCheckout, onManualActivate }) {
  const currentPlan = planLabel(subscription);
  const checkoutReady = Boolean(proCheckoutUrl);

  return (
    <section className="billing-page">
      <div className="billing-header">
        <div>
          <span className="eyebrow">Assinatura</span>
          <h2>Plano atual: {currentPlan}</h2>
          <p>Controle o acesso aos recursos do sistema e libere funcionalidades avançadas no plano pago.</p>
        </div>
        <span className={`plan-badge ${isPro ? 'pro' : ''}`}>{isPro ? 'Pro ativo' : 'Free ativo'}</span>
      </div>

      <div className="plan-grid">
        <PlanCard plan="free" active={!isPro} usage={usage} />
        <PlanCard plan="pro" active={isPro} usage={usage} featured />
      </div>

      <div className="payment-panel">
        <div>
          <h2>Pagamento do plano Pro</h2>
          <p>
            {checkoutReady
              ? 'Clique para abrir o checkout configurado. Depois do pagamento, confirme a ativação pelo painel/admin ou webhook.'
              : 'Para aceitar pagamentos reais, configure VITE_PRO_CHECKOUT_URL com o link do Mercado Pago, Stripe, Hotmart ou outro checkout.'}
          </p>
          {pixKey && <p className="pix-box"><span>Chave Pix</span><b>{pixKey}</b></p>}
        </div>
        <div className="payment-actions">
          <button className="primary-button" type="button" onClick={onCheckout}>
            {checkoutReady ? 'Pagar plano Pro' : 'Configurar checkout'}
          </button>
          {paymentSupportUrl && (
            <a className="secondary-link" href={paymentSupportUrl} target="_blank" rel="noreferrer">Enviar comprovante</a>
          )}
          <button className="secondary-button" type="button" onClick={onManualActivate}>Ativar Pro manualmente</button>
        </div>
      </div>
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
      {goals.map(goal => {
        const percent = goal.target > 0 ? Math.min(Math.round((goal.current / goal.target) * 100), 100) : 0;
        return (
          <article className="goal-card" key={goal.id}>
            <span className={`goal-symbol ${goal.icon}`}>{goal.icon === 'home' ? '⌂' : goal.icon === 'shield' ? '◈' : '✦'}</span>
            <div className="goal-content">
              <div className="goal-top">
                <div><h2>{goal.name}</h2><p>Objetivo: {formatCurrency(goal.target)}</p></div>
                <strong>{formatCurrency(goal.current)}</strong>
              </div>
              <div className="progress"><span style={{ width: `${percent}%` }} /></div>
            </div>
            <b className="goal-percent">{percent}%</b>
            <div className="row-actions">
              <button className="table-button" type="button" aria-label="Editar meta" onClick={() => onEdit(goal)}>⌁</button>
              <button className="table-button danger-action" type="button" aria-label="Excluir meta" onClick={() => onDelete(goal.id)}>⌫</button>
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
          <thead><tr><th>Vencimento</th><th>Conta</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {visibleBills.map(bill => (
              <tr key={bill.id}>
                <td>{formatDate(bill.due_date)}</td>
                <td>{bill.name}</td>
                <td>{formatCurrency(bill.value)}</td>
                <td><span className={`status ${bill.status === 'Pago' ? 'paid' : 'pending'}`}>{bill.status}</span></td>
                <td>
                  <button className="table-button" type="button" aria-label="Editar conta" onClick={() => onEdit(bill)}>⌁</button>
                  <button className="table-button" type="button" aria-label="Alternar status" onClick={() => onToggle(bill.id)}>✓</button>
                  <button className="table-button danger-action" type="button" aria-label="Excluir conta" onClick={() => onDelete(bill.id)}>⌫</button>
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
          <thead><tr><th>Dia</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Próximo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {sortedSchedules.map(schedule => (
              <tr key={schedule.id}>
                <td>Dia {schedule.day}</td>
                <td><span className={`status ${schedule.type === 'income' ? 'paid' : 'pending'}`}>{schedule.type === 'income' ? 'Receita' : 'Despesa'}</span></td>
                <td>{schedule.description}</td>
                <td><span className="tag">{schedule.category}</span></td>
                <td>{formatCurrency(schedule.value)}</td>
                <td>{formatDate(scheduleDate(schedule))}</td>
                <td><span className={`status ${schedule.active ? 'paid' : 'pending'}`}>{schedule.active ? 'Ativo' : 'Pausado'}</span></td>
                <td>
                  <button className="table-button" type="button" aria-label="Editar agendamento" onClick={() => onEdit(schedule)}>⌁</button>
                  <button className="table-button" type="button" aria-label="Ativar ou pausar" onClick={() => onToggle(schedule.id)}>{schedule.active ? '||' : '>'}</button>
                  <button className="table-button danger-action" type="button" aria-label="Excluir agendamento" onClick={() => onDelete(schedule.id)}>⌫</button>
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
      <aside className="settings-menu">
        {sections.map(item => (
          <button className={section === item ? 'active' : ''} type="button" key={item} onClick={() => setSection(item)}>{item}</button>
        ))}
      </aside>
      <section className="settings-form">
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
              <label>E-mail<input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
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
              <select value={newCategory.type} onChange={e => setNewCategory({ ...newCategory, type: e.target.value })}>
                <option value="expenses">Despesas</option>
                <option value="incomes">Receitas</option>
              </select>
              <input value={newCategory.name} onChange={e => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="Nova categoria" />
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
        {items.map(item => (
          <span className="category-pill" key={item}>
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
        <label>Data<input name="date" type="date" defaultValue={item?.date || '2026-06-25'} required /></label>
        <label>Descrição<input name="description" placeholder="Ex: Salário" defaultValue={item?.description || ''} required /></label>
        <label>Categoria
          <input name="category" list={`${type}-categories`} placeholder="Ex: Trabalho" defaultValue={item?.category || ''} required />
          <datalist id={`${type}-categories`}>
            {categories.map(category => <option key={category} value={category} />)}
          </datalist>
        </label>
        <label>Valor<input name="value" type="number" min="0" step="0.01" defaultValue={item?.value || ''} required /></label>
        <button className="primary-button" type="submit">Salvar</button>
      </form>
    </Modal>
  );
}

function BillModal({ item, onClose, onSubmit }) {
  return (
    <Modal title={item ? 'Editar Conta' : 'Nova Conta'} onClose={onClose}>
      <form onSubmit={event => onSubmit(event, item)} className="modal-form">
        <label>Vencimento<input name="due_date" type="date" defaultValue={item?.due_date || '2026-06-25'} required /></label>
        <label>Conta<input name="name" defaultValue={item?.name || ''} required /></label>
        <label>Valor<input name="value" type="number" min="0" step="0.01" defaultValue={item?.value || ''} required /></label>
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
        <label>Objetivo<input name="target" type="number" min="0" step="0.01" defaultValue={item?.target || ''} required /></label>
        <label>Valor atual<input name="current" type="number" min="0" step="0.01" defaultValue={item?.current || ''} required /></label>
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
        <label>Dia do mês<input name="day" type="number" min="1" max="31" defaultValue={item?.day || 5} required /></label>
        <label>Descrição<input name="description" placeholder="Ex: Salário, Aluguel, Internet" defaultValue={item?.description || ''} required /></label>
        <label>Categoria
          <input name="category" list="schedule-categories" placeholder={type === 'income' ? 'Ex: Trabalho' : 'Ex: Contas'} defaultValue={item?.category || ''} required />
          <datalist id="schedule-categories">
            {categoryOptions.map(category => <option key={category} value={category} />)}
          </datalist>
        </label>
        <label>Valor<input name="value" type="number" min="0" step="0.01" defaultValue={item?.value || ''} required /></label>
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
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header"><h2>{title}</h2><button type="button" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-dialog">
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="primary-button danger-button" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function ChartCanvas({ config }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [chartError, setChartError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    chartRef.current?.destroy();
    Chart.getChart(canvas)?.destroy();

    try {
      chartRef.current = new Chart(canvas, config);
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
  }, [config]);

  return (
    <div className="chart-wrap">
      <canvas ref={canvasRef} />
      {chartError && <div className="chart-error">{chartError}</div>}
    </div>
  );
}

function lineConfig(series) {
  return {
    type: 'line',
    data: {
      labels: series.map(item => item.label),
      datasets: [
        { label: 'Receitas', data: series.map(item => item.income), borderColor: '#1764ff', backgroundColor: '#1764ff', tension: 0.35, pointRadius: 4 },
        { label: 'Despesas', data: series.map(item => item.expense), borderColor: '#ff4f5e', backgroundColor: '#ff4f5e', tension: 0.35, pointRadius: 4 },
      ],
    },
    options: baseChartOptions(),
  };
}

function barConfig(series) {
  return {
    type: 'bar',
    data: {
      labels: series.map(item => item.label),
      datasets: [
        { label: 'Receitas', data: series.map(item => item.income), backgroundColor: '#1764ff', borderRadius: 4 },
        { label: 'Despesas', data: series.map(item => item.expense), backgroundColor: '#ff4f5e', borderRadius: 4 },
      ],
    },
    options: baseChartOptions(),
  };
}

function balanceConfig(series, balance) {
  return {
    type: 'line',
    data: {
      labels: series.map(item => item.label),
      datasets: [{ label: 'Saldo', data: balance, borderColor: '#13aa67', backgroundColor: '#13aa67', tension: 0.45, pointRadius: 3 }],
    },
    options: baseChartOptions(false),
  };
}

function doughnutConfig(totals) {
  const labels = Object.keys(totals);
  const values = Object.values(totals);
  return {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['Sem dados'],
      datasets: [{ data: values.length ? values : [1], backgroundColor: ['#1764ff', '#ff4f5e', '#7c5cff', '#12b3a8', '#ffb020'], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 9, usePointStyle: true } } }, cutout: '58%' },
  };
}

function baseChartOptions(showLegend = true) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: showLegend, position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true } } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#637083' } },
      y: { grid: { color: '#edf1f6' }, ticks: { color: '#637083', callback: value => formatCurrency(value).replace(',00', '') } },
    },
  };
}

export default App;
