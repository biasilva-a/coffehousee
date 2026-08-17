const state = {
  user: null,
  page: 1,
  totalPages: 1,
  activeFilter: '',
};

const els = {
  companyLogo: document.getElementById('company-logo'),
  companyName: document.getElementById('company-name'),
  totalActivities: document.getElementById('total-activities'),
  totalCo2: document.getElementById('total-co2'),
  authBtn: document.getElementById('auth-btn'),
  filters: document.getElementById('filters'),
  activitiesList: document.getElementById('activities-list'),
  pagination: document.getElementById('pagination'),
  loginModal: document.getElementById('login-modal'),
  closeModal: document.getElementById('close-modal'),
  cancelLogin: document.getElementById('cancel-login'),
  submitLogin: document.getElementById('submit-login'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  activityTab: document.getElementById('activity-tab'),
};

function showLoginModal() {
  els.loginModal.classList.remove('hidden');
}

function hideLoginModal() {
  els.loginModal.classList.add('hidden');
}

function requireAuth() {
  if (state.user) return true;
  showLoginModal();
  return false;
}

function clearLoginValidation() {
  els.loginEmail.classList.remove('invalid');
  els.loginPassword.classList.remove('invalid');
  els.loginError.textContent = '';
}

async function loadCompany() {
  const query = state.user ? `?userId=${state.user.id}` : '';
  const res = await fetch(`http://localhost:3000/api/company${query}`);
  const data = await res.json();

  els.companyLogo.src = state.user?.photoUrl || data.company.logoUrl;
  els.companyName.textContent = state.user?.name || data.company.name;
  els.totalActivities.textContent = data.stats.totalActivities || 0;
  els.totalCo2.textContent = `R$ ${data.stats.totalAmount ? data.stats.totalAmount.toFixed(2) : '0,00'}`;
}

async function loadActivities() {
  const params = new URLSearchParams({ page: state.page });
  if (state.activeFilter) params.set('type', state.activeFilter);
  if (state.user) params.set('currentUserId', state.user.id);

  const res = await fetch(`http://localhost:3000/api/activities?${params}`);
  const data = await res.json();

  state.totalPages = data.totalPages || 1;
  renderActivities(data.data || []);
  renderPagination();
}

function renderActivities(activities) {
  els.activitiesList.innerHTML = '';
  const tpl = document.getElementById('activity-card-template');

  activities.forEach((product) => {
    const card = tpl.content.firstElementChild.cloneNode(true);

    // Ícone dinâmico por categoria de produto
    const iconSpan = card.querySelector('.product-icon');
    if (product.type === 'lanches') iconSpan.textContent = '🥐';
    else if (product.type === 'sobremesas') iconSpan.textContent = '🍰';
    else iconSpan.textContent = '☕';

    card.querySelector('.product-name').textContent = product.title || product.name;
    card.querySelector('.quantity').textContent = product.quantity || 1;
    card.querySelector('.time').textContent = product.prepTime || '5 min';
    card.querySelector('.price').textContent = `R$ ${Number(product.price || 0).toFixed(2)}`;

    const likeBtn = card.querySelector('.like-btn');
    const commentBtn = card.querySelector('.comment-btn');
    const orderBtn = card.querySelector('.order-btn');
    const likesCount = card.querySelector('.likes-count');
    const commentsCount = card.querySelector('.comments-count');

    likesCount.textContent = product.likesCount || 0;
    commentsCount.textContent = product.commentsCount || 0;

    if (product.likedByCurrentUser) {
      likeBtn.classList.add('liked');
    }

    // Ação: Favoritar / Curtir
    likeBtn.addEventListener('click', async () => {
      if (!requireAuth()) return;
      const response = await fetch(`http://localhost:3000/api/activities/${product.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: state.user.id }),
      });

      if (!response.ok) return;
      const payload = await response.json();
      likesCount.textContent = payload.likesCount;
      likeBtn.classList.toggle('liked', payload.liked);
    });

    // Ação: Exibir/Ocultar caixa de comentários
    const commentBox = card.querySelector('.comment-box');
    const commentInput = card.querySelector('.comment-input');
    const sendComment = card.querySelector('.send-comment');
    const commentError = card.querySelector('.comment-error');

    commentBtn.addEventListener('click', () => {
      if (!requireAuth()) return;
      commentBox.classList.toggle('hidden');
    });

    sendComment.addEventListener('click', async () => {
      if (!requireAuth()) return;
      commentInput.classList.remove('invalid');
      commentError.textContent = '';

      const content = commentInput.value.trim();
      if (content.length < 2) {
        commentInput.classList.add('invalid');
        commentError.textContent = 'Comentário deve ter no mínimo 2 caracteres.';
        return;
      }

      const response = await fetch(`http://localhost:3000/api/activities/${product.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: state.user.id, content }),
      });

      if (!response.ok) return;
      const payload = await response.json();
      commentsCount.textContent = payload.commentsCount;
      commentInput.value = '';
      commentBox.classList.add('hidden');
    });

    orderBtn.addEventListener('click', async () => {
      if (!requireAuth()) return;
      const response = await fetch(`http://localhost:3000/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: state.user.id, productId: product.id }),
      });

      if (response.ok) {
        loadCompany();
      }
    });

    els.activitiesList.appendChild(card);
  });
}

function renderPagination() {
  els.pagination.innerHTML = '';

  const prev = document.createElement('button');
  prev.textContent = '← Anterior';
  prev.disabled = state.page === 1;
  prev.addEventListener('click', () => {
    if (!requireAuth()) return;
    state.page -= 1;
    loadActivities();
  });
  els.pagination.appendChild(prev);

  for (let p = 1; p <= state.totalPages; p += 1) {
    const btn = document.createElement('button');
    btn.textContent = p;
    if (p === state.page) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (!requireAuth()) return;
      state.page = p;
      loadActivities();
    });
    els.pagination.appendChild(btn);
  }

  const next = document.createElement('button');
  next.textContent = 'Próximo →';
  next.disabled = state.page === state.totalPages;
  next.addEventListener('click', () => {
    if (!requireAuth()) return;
    state.page += 1;
    loadActivities();
  });
  els.pagination.appendChild(next);

  if (!state.user) {
    [...els.pagination.querySelectorAll('button')].forEach((b) => (b.disabled = true));
  }
}

async function handleLogin() {
  clearLoginValidation();
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value.trim();

  if (!email || !password) {
    els.loginEmail.classList.add('invalid');
    els.loginPassword.classList.add('invalid');
    els.loginError.textContent = 'email ou senha obrigatório';
    return;
  }

  const response = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    els.loginEmail.classList.add('invalid');
    els.loginPassword.classList.add('invalid');
    els.loginError.textContent = 'email ou senha incorreta';
    return;
  }

  const data = await response.json();
  state.user = data.user;
  state.page = 1;

  els.authBtn.textContent = 'Logout';
  els.activityTab.disabled = false;
  hideLoginModal();

  [...els.filters.querySelectorAll('button')].forEach((btn) => (btn.disabled = false));

  await Promise.all([loadCompany(), loadActivities()]);
}

function handleLogout() {
  state.user = null;
  state.page = 1;
  state.activeFilter = '';

  els.authBtn.textContent = 'Login';
  els.activityTab.disabled = true;
  els.activityTab.classList.remove('active');

  [...els.filters.querySelectorAll('button')].forEach((btn) => {
    btn.classList.remove('active');
    btn.disabled = true;
  });

  loadCompany();
  loadActivities();
}

function bindEvents() {
  els.authBtn.addEventListener('click', () => {
    if (state.user) {
      handleLogout();
    } else {
      showLoginModal();
    }
  });

  els.closeModal.addEventListener('click', hideLoginModal);
  els.cancelLogin.addEventListener('click', hideLoginModal);
  els.submitLogin.addEventListener('click', handleLogin);

  els.filters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-type]');
    if (!button) return;
    if (!requireAuth()) return;

    state.activeFilter = button.dataset.type;
    state.page = 1;

    [...els.filters.querySelectorAll('button')].forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    loadActivities();
  });

  els.activityTab.addEventListener('click', () => {
    if (!requireAuth()) return;
  });
}

async function init() {
  bindEvents();
  [...els.filters.querySelectorAll('button')].forEach((btn) => (btn.disabled = true));
  await Promise.all([loadCompany(), loadActivities()]);
}

init();