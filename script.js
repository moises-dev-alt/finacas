const transactionData = {
  incomes: [
    { date: '2026-06-05', description: 'Salário', category: 'Trabalho', value: 5000 },
    { date: '2026-06-12', description: 'Freelance', category: 'Extra', value: 850 },
    { date: '2026-06-01', description: 'Venda de Produto', category: 'Vendas', value: 260 },
  ],
  expenses: [
    { date: '2026-06-03', description: 'Mercado', category: 'Alimentação', value: 420 },
    { date: '2026-06-10', description: 'Netflix', category: 'Assinaturas', value: 39.9 },
    { date: '2026-06-15', description: 'Internet', category: 'Contas', value: 99.9 },
  ],
  bills: [
    { due: '15/06', name: 'Internet', value: 99, status: 'Pendente' },
    { due: '20/06', name: 'Energia', value: 180, status: 'Pago' },
  ],
};

const state = {
  theme: localStorage.getItem('financeTheme') || 'light',
  transactionFilter: '',
  incomeCategory: 'all',
  expenseCategory: 'all',
};

const dom = {
  transactionList: document.getElementById('transactionList'),
  incomeTableBody: document.getElementById('incomeTableBody'),
  expenseTableBody: document.getElementById('expenseTableBody'),
  billsTableBody: document.getElementById('billsTableBody'),
  transactionSearch: document.getElementById('transactionSearch'),
  refreshTransactions: document.getElementById('refreshTransactions'),
  incomeCategoryFilter: document.getElementById('incomeCategoryFilter'),
  expenseCategoryFilter: document.getElementById('expenseCategoryFilter'),
  themeToggle: document.getElementById('themeToggle'),
  themeModeLabel: document.getElementById('themeModeLabel'),
  currentBalance: document.getElementById('currentBalance'),
  totalIncome: document.getElementById('totalIncome'),
  totalExpense: document.getElementById('totalExpense'),
  totalSavings: document.getElementById('totalSavings'),
  transactionModal: document.getElementById('transactionModal'),
  newIncome: document.getElementById('newIncome'),
  newExpense: document.getElementById('newExpense'),
  closeModal: document.getElementById('closeModal'),
  cancelModal: document.getElementById('cancelModal'),
  modalTitle: document.getElementById('modalTitle'),
  transactionForm: document.getElementById('transactionForm'),
  transactionType: document.getElementById('transactionType'),
  transactionDate: document.getElementById('transactionDate'),
  transactionDescription: document.getElementById('transactionDescription'),
  transactionCategory: document.getElementById('transactionCategory'),
  transactionValue: document.getElementById('transactionValue'),
};

const formatCurrency = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDateLabel = dateValue => new Date(dateValue).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function renderDashboard() {
  const incomeTotal = transactionData.incomes.reduce((sum, item) => sum + item.value, 0);
  const expenseTotal = transactionData.expenses.reduce((sum, item) => sum + item.value, 0);
  const balance = incomeTotal - expenseTotal;

  dom.totalIncome.textContent = formatCurrency(incomeTotal);
  dom.totalExpense.textContent = formatCurrency(expenseTotal);
  dom.totalSavings.textContent = formatCurrency(balance);
  dom.currentBalance.textContent = formatCurrency(balance);
}

function renderTransactions() {
  const query = state.transactionFilter.trim().toLowerCase();
  const combined = [
    ...transactionData.incomes.map(item => ({ ...item, type: 'income' })),
    ...transactionData.expenses.map(item => ({ ...item, type: 'expense' })),
  ];

  const filtered = combined
    .filter(item => item.description.toLowerCase().includes(query) || item.category.toLowerCase().includes(query))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  dom.transactionList.innerHTML = filtered
    .map(item => `
      <li>
        <span>${formatDateLabel(item.date)} · ${item.description}</span>
        <span class="${item.type === 'income' ? 'positive' : 'negative'}">${item.type === 'income' ? '+' : '-'}${formatCurrency(item.value)}</span>
      </li>
    `)
    .join('');
}

function renderIncomeTable() {
  dom.incomeTableBody.innerHTML = transactionData.incomes
    .filter(item => state.incomeCategory === 'all' || item.category === state.incomeCategory)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(item => `
      <tr>
        <td>${formatDateLabel(item.date)}</td>
        <td>${item.description}</td>
        <td>${item.category}</td>
        <td>${formatCurrency(item.value)}</td>
      </tr>
    `)
    .join('');
}

function renderExpenseTable() {
  dom.expenseTableBody.innerHTML = transactionData.expenses
    .filter(item => state.expenseCategory === 'all' || item.category === state.expenseCategory)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(item => `
      <tr>
        <td>${formatDateLabel(item.date)}</td>
        <td>${item.description}</td>
        <td>${item.category}</td>
        <td>${formatCurrency(item.value)}</td>
      </tr>
    `)
    .join('');
}

function renderBills() {
  dom.billsTableBody.innerHTML = transactionData.bills
    .map(item => `
      <tr>
        <td>${item.due}</td>
        <td>${item.name}</td>
        <td>${formatCurrency(item.value)}</td>
        <td class="status ${item.status === 'Pago' ? 'paid' : 'pending'}">${item.status}</td>
      </tr>
    `)
    .join('');
}

function initTheme() {
  document.body.dataset.theme = state.theme;
  dom.themeModeLabel.textContent = state.theme === 'dark' ? 'Escuro' : 'Claro';
  dom.themeToggle.textContent = state.theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('financeTheme', state.theme);
  initTheme();
}

function createCharts() {
  const comparisonChart = document.getElementById('comparisonChart');
  const categoryChart = document.getElementById('categoryChart');
  const barChart = document.getElementById('barChart');

  if (comparisonChart) {
    new Chart(comparisonChart, {
      type: 'line',
      data: {
        labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
        datasets: [
          {
            label: 'Receitas',
            data: [4200, 5600, 6100, 7300, 7800, 8500],
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37, 99, 235, 0.16)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
          },
          {
            label: 'Despesas',
            data: [3100, 3200, 3800, 4100, 4000, 4120],
            borderColor: '#DC2626',
            backgroundColor: 'rgba(220, 38, 38, 0.16)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: '#f3f4f6' },
            ticks: { callback: value => `R$ ${value}` },
          },
        },
      },
    });
  }

  if (categoryChart) {
    new Chart(categoryChart, {
      type: 'doughnut',
      data: {
        labels: ['Alimentação', 'Transporte', 'Assinaturas', 'Outros'],
        datasets: [{
          data: [42, 23, 18, 17],
          backgroundColor: ['#2563EB', '#16A34A', '#F59E0B', '#9CA3AF'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  if (barChart) {
    new Chart(barChart, {
      type: 'bar',
      data: {
        labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
        datasets: [
          { label: 'Receitas', data: [4200, 5600, 6100, 7300, 7800, 8500], backgroundColor: '#2563EB', borderRadius: 8 },
          { label: 'Despesas', data: [3100, 3200, 3800, 4100, 4000, 4120], backgroundColor: '#DC2626', borderRadius: 8 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: false, grid: { display: false } },
          y: { stacked: false, grid: { color: '#f3f4f6' } },
        },
      },
    });
  }
}

function openModal(type) {
  dom.transactionModal.classList.remove('hidden');
  dom.modalTitle.textContent = type === 'expense' ? 'Nova Despesa' : 'Nova Receita';
  dom.transactionType.value = type === 'expense' ? 'expense' : 'income';
  dom.transactionDate.value = new Date().toISOString().slice(0, 10);
  dom.transactionDescription.value = '';
  dom.transactionCategory.value = '';
  dom.transactionValue.value = '';
}

function closeModal() {
  dom.transactionModal.classList.add('hidden');
}

function addTransaction(event) {
  event.preventDefault();
  const type = dom.transactionType.value;
  const date = dom.transactionDate.value;
  const description = dom.transactionDescription.value.trim();
  const category = dom.transactionCategory.value.trim();
  const value = Number(dom.transactionValue.value);

  if (!description || !category || !value || !date) return;

  const transaction = { date, description, category, value };

  if (type === 'income') {
    transactionData.incomes.push(transaction);
  } else {
    transactionData.expenses.push(transaction);
  }

  closeModal();
  renderDashboard();
  renderTransactions();
  renderIncomeTable();
  renderExpenseTable();
}

function connectActions() {
  dom.transactionSearch.addEventListener('input', event => {
    state.transactionFilter = event.target.value;
    renderTransactions();
  });

  dom.refreshTransactions.addEventListener('click', renderTransactions);
  dom.incomeCategoryFilter.addEventListener('change', event => {
    state.incomeCategory = event.target.value;
    renderIncomeTable();
  });

  dom.expenseCategoryFilter.addEventListener('change', event => {
    state.expenseCategory = event.target.value;
    renderExpenseTable();
  });

  dom.themeToggle.addEventListener('click', toggleTheme);
  dom.newIncome.addEventListener('click', () => openModal('income'));
  dom.newExpense.addEventListener('click', () => openModal('expense'));
  dom.closeModal.addEventListener('click', closeModal);
  dom.cancelModal.addEventListener('click', closeModal);
  dom.transactionModal.addEventListener('click', event => {
    if (event.target === dom.transactionModal) closeModal();
  });
  dom.transactionForm.addEventListener('submit', addTransaction);
}

function init() {
  initTheme();
  renderDashboard();
  renderTransactions();
  renderIncomeTable();
  renderExpenseTable();
  renderBills();
  createCharts();
  connectActions();
}

init();
