import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  settings: {
    name: 'Joao Silva',
    email: 'joaosilva@email.com',
    currency: 'BRL',
    theme: 'light',
  },
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'receitas', label: 'Receitas', icon: '▣' },
  { id: 'despesas', label: 'Despesas', icon: '▤' },
  { id: 'relatorios', label: 'Relatorios', icon: '▥' },
  { id: 'metas', label: 'Metas', icon: '◎' },
  { id: 'contas', label: 'Contas a Pagar', icon: '□' },
  { id: 'configuracoes', label: 'Configuracoes', icon: '⚙' },
];

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
const incomeSeries = [6100, 7200, 6300, 6400, 4700, 7250];
const expenseSeries = [3600, 3700, 4300, 3600, 2300, 3600];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR');
}

function loadLocalData() {
  try {
    return JSON.parse(localStorage.getItem('financeData')) || seedData;
  } catch {
    return seedData;
  }
}

async function apiRequest(path, options) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) throw new Error('API indisponivel');
  return response.json();
}

function Icon({ name }) {
  return <span className={`app-icon app-icon-${name}`} aria-hidden="true" />;
}

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [data, setData] = useState(loadLocalData);
  const [apiOnline, setApiOnline] = useState(false);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ month: 'Junho', year: '2026', status: 'Todas', category: 'Todas' });
  const [settingsDraft, setSettingsDraft] = useState(data.settings);
  const comparisonRef = useRef(null);
  const categoryRef = useRef(null);
  const barRef = useRef(null);
  const balanceRef = useRef(null);
  const charts = useRef({});

  useEffect(() => {
    apiRequest('/api/finance')
      .then(payload => {
        setData(payload);
        setSettingsDraft(payload.settings);
        setApiOnline(true);
      })
      .catch(() => setApiOnline(false));
  }, []);

  useEffect(() => {
    localStorage.setItem('financeData', JSON.stringify(data));
    document.body.dataset.theme = data.settings.theme;
  }, [data]);

  const totals = useMemo(() => {
    const income = data.incomes.reduce((sum, item) => sum + Number(item.value), 0);
    const expense = data.expenses.reduce((sum, item) => sum + Number(item.value), 0);
    return { income, expense, balance: income - expense, economy: Math.max(income - expense, 0) };
  }, [data]);

  const transactions = useMemo(() => {
    const items = [
      ...data.incomes.map(item => ({ ...item, type: 'Receita' })),
      ...data.expenses.map(item => ({ ...item, type: 'Despesa' })),
    ];
    return items
      .filter(item => `${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data, search]);

  const categoryTotals = useMemo(() => {
    return data.expenses.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + Number(item.value);
      return acc;
    }, {});
  }, [data.expenses]);

  useEffect(() => {
    const canvases = [comparisonRef.current, categoryRef.current, barRef.current, balanceRef.current];
    if (!canvases.every(Boolean)) return;

    charts.current.comparison = new Chart(comparisonRef.current, lineConfig());
    charts.current.category = new Chart(categoryRef.current, doughnutConfig(categoryTotals));
    charts.current.bar = new Chart(barRef.current, barConfig());
    charts.current.balance = new Chart(balanceRef.current, balanceConfig());

    return () => Object.values(charts.current).forEach(chart => chart?.destroy());
  }, []);

  useEffect(() => {
    if (!charts.current.category) return;
    charts.current.category.data.labels = Object.keys(categoryTotals);
    charts.current.category.data.datasets[0].data = Object.values(categoryTotals);
    charts.current.category.update();
  }, [categoryTotals]);

  async function persist(nextData, path, payload) {
    setData(nextData);
    if (!path) return;
    try {
      const fresh = await apiRequest(path, { method: 'POST', body: JSON.stringify(payload) });
      setData(fresh);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }

  function createItem(type, event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = {
      id: Date.now(),
      date: form.get('date'),
      description: form.get('description'),
      category: form.get('category'),
      value: Number(form.get('value')),
    };
    const key = type === 'income' ? 'incomes' : 'expenses';
    persist({ ...data, [key]: [item, ...data[key]] }, `/api/${key}`, item);
    setModal(null);
  }

  function createBill(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = {
      id: Date.now(),
      due_date: form.get('due_date'),
      name: form.get('name'),
      value: Number(form.get('value')),
      status: form.get('status'),
    };
    persist({ ...data, bills: [item, ...data.bills] }, '/api/bills', item);
    setModal(null);
  }

  function createGoal(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = {
      id: Date.now(),
      name: form.get('name'),
      target: Number(form.get('target')),
      current: Number(form.get('current')),
      icon: 'goal',
    };
    persist({ ...data, goals: [item, ...data.goals] }, '/api/goals', item);
    setModal(null);
  }

  function deleteItem(key, id) {
    const next = { ...data, [key]: data[key].filter(item => item.id !== id) };
    persist(next);
    apiRequest(`/api/${key}/${id}`, { method: 'DELETE' }).catch(() => setApiOnline(false));
  }

  function saveSettings(event) {
    event.preventDefault();
    persist({ ...data, settings: settingsDraft }, '/api/settings', settingsDraft);
  }

  const pageTitle = navItems.find(item => item.id === activePage)?.label || 'Dashboard';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <strong>Financas</strong>
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
        <button className="logout" type="button">⇱ Sair</button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button" type="button" aria-label="Menu">☰</button>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <span className={`sync-dot ${apiOnline ? 'online' : ''}`} title={apiOnline ? 'API conectada' : 'Usando dados locais'} />
            <button className="icon-button" type="button" aria-label="Notificacoes">♧</button>
            <div className="user-chip">
              <span className="avatar">●</span>
              <strong>{data.settings.name}</strong>
              <span>⌄</span>
            </div>
          </div>
        </header>

        {activePage === 'dashboard' && (
          <Dashboard totals={totals} transactions={transactions} comparisonRef={comparisonRef} />
        )}
        {activePage === 'receitas' && (
          <TablePage
            title="Receitas"
            buttonLabel="+ Nova Receita"
            onAdd={() => setModal('income')}
            rows={data.incomes}
            search={search}
            setSearch={setSearch}
            totalClass="positive"
            total={data.incomes.reduce((sum, item) => sum + item.value, 0)}
            onDelete={id => deleteItem('incomes', id)}
          />
        )}
        {activePage === 'despesas' && (
          <TablePage
            title="Despesas"
            buttonLabel="+ Nova Despesa"
            onAdd={() => setModal('expense')}
            rows={data.expenses}
            search={search}
            setSearch={setSearch}
            totalClass="negative"
            total={data.expenses.reduce((sum, item) => sum + item.value, 0)}
            onDelete={id => deleteItem('expenses', id)}
          />
        )}
        {activePage === 'relatorios' && (
          <Reports
            filters={filters}
            setFilters={setFilters}
            categoryRef={categoryRef}
            barRef={barRef}
            balanceRef={balanceRef}
            totals={totals}
          />
        )}
        {activePage === 'metas' && <Goals goals={data.goals} onAdd={() => setModal('goal')} />}
        {activePage === 'contas' && (
          <Bills bills={data.bills} filters={filters} setFilters={setFilters} onAdd={() => setModal('bill')} />
        )}
        {activePage === 'configuracoes' && (
          <Settings
            draft={settingsDraft}
            setDraft={setSettingsDraft}
            saveSettings={saveSettings}
          />
        )}
      </main>

      {modal === 'income' && <TransactionModal title="Nova Receita" type="income" onClose={() => setModal(null)} onSubmit={createItem} />}
      {modal === 'expense' && <TransactionModal title="Nova Despesa" type="expense" onClose={() => setModal(null)} onSubmit={createItem} />}
      {modal === 'bill' && <BillModal onClose={() => setModal(null)} onSubmit={createBill} />}
      {modal === 'goal' && <GoalModal onClose={() => setModal(null)} onSubmit={createGoal} />}
    </div>
  );
}

function Dashboard({ totals, transactions, comparisonRef }) {
  return (
    <div className="page-stack">
      <section className="kpi-grid">
        <Kpi title="Saldo Atual" value={totals.balance} note="Total disponivel" tone="wallet" trend="" />
        <Kpi title="Receitas" value={totals.income} note="Este mes" tone="income" trend="+ 8,3%" />
        <Kpi title="Despesas" value={totals.expense} note="Este mes" tone="expense" trend="- 3,4%" />
        <Kpi title="Economia" value={totals.economy} note="Este mes" tone="saving" trend="+ 23,7%" />
      </section>
      <section className="dashboard-grid">
        <div className="panel chart-panel">
          <div className="panel-header">
            <h2>Receitas x Despesas</h2>
            <select defaultValue="Este mes"><option>Este mes</option><option>Este ano</option></select>
          </div>
          <canvas ref={comparisonRef} height="168" />
        </div>
        <div className="panel transactions-panel">
          <div className="panel-header"><h2>Ultimas Transacoes</h2></div>
          <div className="transaction-list">
            {transactions.slice(0, 6).map(item => (
              <div className="transaction-row" key={`${item.type}-${item.id}`}>
                <span className={`round-icon ${item.type === 'Receita' ? 'income' : 'expense'}`}>{item.type === 'Receita' ? '↓' : '↑'}</span>
                <div>
                  <strong>{item.description}</strong>
                  <small>{item.type}</small>
                </div>
                <b className={item.type === 'Receita' ? 'positive' : 'negative'}>
                  {item.type === 'Receita' ? '+ ' : '- '}{formatCurrency(item.value)}
                </b>
              </div>
            ))}
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

function TablePage({ title, buttonLabel, onAdd, rows, search, setSearch, total, totalClass, onDelete }) {
  const visibleRows = rows.filter(row => `${row.description} ${row.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="page-card">
      <div className="page-actions">
        <div className="filters">
          <label>Mes<select defaultValue="Junho"><option>Junho</option><option>Maio</option></select></label>
          <label>Ano<select defaultValue="2026"><option>2026</option><option>2025</option></select></label>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>{buttonLabel}</button>
      </div>
      <div className="search-line">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar ${title.toLowerCase()}...`} />
      </div>
      <DataTable rows={visibleRows} total={total} totalClass={totalClass} onDelete={onDelete} />
    </section>
  );
}

function DataTable({ rows, total, totalClass, onDelete }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descricao</th>
            <th>Categoria</th>
            <th>Valor</th>
            <th>Acoes</th>
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
                <button className="table-button" type="button" aria-label="Editar">⌁</button>
                <button className="table-button" type="button" aria-label="Excluir" onClick={() => onDelete(row.id)}>⌫</button>
              </td>
            </tr>
          ))}
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

function Reports({ filters, setFilters, categoryRef, barRef, balanceRef, totals }) {
  return (
    <div className="reports-grid">
      <div className="report-filters">
        <label>Mes<select value={filters.month} onChange={e => setFilters({ ...filters, month: e.target.value })}><option>Junho</option><option>Maio</option></select></label>
        <label>Ano<select value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })}><option>2026</option><option>2025</option></select></label>
        <label>Categoria<select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option>Todas</option><option>Contas</option><option>Alimentacao</option></select></label>
      </div>
      <div className="report-panels">
        <div className="panel"><div className="panel-header"><h2>Despesas por Categoria</h2></div><canvas ref={categoryRef} height="150" /></div>
        <div className="panel"><div className="panel-header"><h2>Receitas x Despesas</h2></div><canvas ref={barRef} height="150" /></div>
        <div className="panel"><div className="panel-header"><h2>Evolucao do Saldo</h2></div><canvas ref={balanceRef} height="150" /></div>
        <div className="panel summary-panel">
          <h2>Resumo do Periodo</h2>
          <p><span>Receitas</span><b className="positive">{formatCurrency(totals.income)}</b></p>
          <p><span>Despesas</span><b className="negative">{formatCurrency(totals.expense)}</b></p>
          <p><span>Economia</span><b className="positive">{formatCurrency(totals.economy)}</b></p>
          <p><span>Saldo Final</span><b>{formatCurrency(totals.balance)}</b></p>
        </div>
      </div>
    </div>
  );
}

function Goals({ goals, onAdd }) {
  return (
    <section className="goal-list">
      <div className="align-right"><button className="primary-button" type="button" onClick={onAdd}>+ Nova Meta</button></div>
      {goals.map(goal => {
        const percent = Math.min(Math.round((goal.current / goal.target) * 100), 100);
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
            <button className="table-button" type="button" aria-label="Mais opcoes">⋮</button>
          </article>
        );
      })}
    </section>
  );
}

function Bills({ bills, filters, setFilters, onAdd }) {
  return (
    <section className="page-card">
      <div className="page-actions">
        <div className="filters">
          <label>Mes<select defaultValue="Junho"><option>Junho</option><option>Maio</option></select></label>
          <label>Status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option>Todas</option><option>Pendente</option><option>Pago</option></select></label>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>+ Nova Conta</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vencimento</th><th>Conta</th><th>Valor</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>
            {bills.map(bill => (
              <tr key={bill.id}>
                <td>{formatDate(bill.due_date)}</td>
                <td>{bill.name}</td>
                <td>{formatCurrency(bill.value)}</td>
                <td><span className={`status ${bill.status === 'Pago' ? 'paid' : 'pending'}`}>{bill.status}</span></td>
                <td><button className="table-button" type="button">⌁</button><button className="table-button" type="button">✓</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-count">{bills.length} contas</div>
      </div>
    </section>
  );
}

function Settings({ draft, setDraft, saveSettings }) {
  return (
    <div className="settings-layout">
      <aside className="settings-menu">
        {['Perfil', 'Preferencias', 'Categorias', 'Exportar Dados', 'Backup', 'Seguranca'].map((item, index) => (
          <button className={index === 0 ? 'active' : ''} type="button" key={item}>{item}</button>
        ))}
      </aside>
      <form className="settings-form" onSubmit={saveSettings}>
        <h2>Perfil</h2>
        <label>Nome<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>E-mail<input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
        <div className="form-grid">
          <label>Moeda<select value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}><option value="BRL">Real (R$)</option></select></label>
          <label>Tema<select value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value })}><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
        </div>
        <button className="primary-button" type="submit">Salvar Alteracoes</button>
      </form>
      <aside className="account-card">
        <h2>Sua Conta</h2>
        <div className="profile-photo">●</div>
        <button type="button">Alterar foto</button>
        <hr />
        <p>Membro desde</p>
        <strong>Janeiro de 2024</strong>
      </aside>
    </div>
  );
}

function TransactionModal({ title, type, onClose, onSubmit }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={event => onSubmit(type, event)} className="modal-form">
        <label>Data<input name="date" type="date" defaultValue="2026-06-25" required /></label>
        <label>Descricao<input name="description" placeholder="Ex: Salario" required /></label>
        <label>Categoria<input name="category" placeholder="Ex: Trabalho" required /></label>
        <label>Valor<input name="value" type="number" min="0" step="0.01" required /></label>
        <button className="primary-button" type="submit">Salvar</button>
      </form>
    </Modal>
  );
}

function BillModal({ onClose, onSubmit }) {
  return (
    <Modal title="Nova Conta" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label>Vencimento<input name="due_date" type="date" defaultValue="2026-06-25" required /></label>
        <label>Conta<input name="name" required /></label>
        <label>Valor<input name="value" type="number" min="0" step="0.01" required /></label>
        <label>Status<select name="status"><option>Pendente</option><option>Pago</option></select></label>
        <button className="primary-button" type="submit">Salvar</button>
      </form>
    </Modal>
  );
}

function GoalModal({ onClose, onSubmit }) {
  return (
    <Modal title="Nova Meta" onClose={onClose}>
      <form onSubmit={onSubmit} className="modal-form">
        <label>Nome<input name="name" required /></label>
        <label>Objetivo<input name="target" type="number" min="0" required /></label>
        <label>Valor atual<input name="current" type="number" min="0" required /></label>
        <button className="primary-button" type="submit">Salvar</button>
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

function lineConfig() {
  return {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'Receitas', data: incomeSeries, borderColor: '#1764ff', backgroundColor: '#1764ff', tension: 0.35, pointRadius: 4 },
        { label: 'Despesas', data: expenseSeries, borderColor: '#ff4f5e', backgroundColor: '#ff4f5e', tension: 0.35, pointRadius: 4 },
      ],
    },
    options: baseChartOptions(),
  };
}

function barConfig() {
  return {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'Receitas', data: incomeSeries, backgroundColor: '#1764ff', borderRadius: 4 },
        { label: 'Despesas', data: expenseSeries, backgroundColor: '#ff4f5e', borderRadius: 4 },
      ],
    },
    options: baseChartOptions(),
  };
}

function balanceConfig() {
  return {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{ label: 'Saldo', data: [4200, 3600, 7100, 6500, 9100, 12540], borderColor: '#13aa67', backgroundColor: '#13aa67', tension: 0.45, pointRadius: 3 }],
    },
    options: baseChartOptions(false),
  };
}

function doughnutConfig(categoryTotals) {
  return {
    type: 'doughnut',
    data: {
      labels: Object.keys(categoryTotals),
      datasets: [{ data: Object.values(categoryTotals), backgroundColor: ['#1764ff', '#ff4f5e', '#7c5cff', '#12b3a8', '#ffb020'], borderWidth: 0 }],
    },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 9, usePointStyle: true } } }, cutout: '58%' },
  };
}

function baseChartOptions(showLegend = true) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: showLegend, position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true } } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#637083' } },
      y: { grid: { color: '#edf1f6' }, ticks: { color: '#637083', callback: value => `R$ ${value / 1000}k` } },
    },
  };
}

export default App;
