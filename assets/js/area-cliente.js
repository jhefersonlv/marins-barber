/* ══════════════════════════════════════════════════════════════
   Área do Cliente — Marins Barber
   Portal de acesso para clientes com plano ativo.
   Login via número de telefone (sem senha).
   WordVirtua · 2026
══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Config ────────────────────────────────────────────────── */
const CA_SESSION_KEY  = 'ca_client_marins';
const CA_WA_NUMBER    = '5511999999999'; // Mesmo número do script.js principal

/* ─── Utilitários ───────────────────────────────────────────── */
function caEsc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function caFmtDate(date) {
  return `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`;
}

function caNormalizePhone(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length === 11) return '55' + d;
  if (d.length === 10) return '55' + d;
  return d;
}

const CA_MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

/* ─── Estado global ─────────────────────────────────────────── */
let caClient          = null;
let caServicesList    = [];
let caScheduleCfg     = {
  defaultTimes: ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00','18:00'],
  workDays: [1, 2, 3, 4, 5, 6],
};

/* ─── Sessão (sessionStorage) ───────────────────────────────── */
function caSaveSession(client) {
  const obj = {
    id:              client.id,
    name:            client.name            || '',
    phone:           client.phone           || '',
    normalizedPhone: client.normalizedPhone || '',
    subscription:    client.subscription
      ? {
          planId:       client.subscription.planId       || '',
          planName:     client.subscription.planName     || '',
          totalCredits: client.subscription.totalCredits || 0,
          usedCredits:  client.subscription.usedCredits  || 0,
          price:        client.subscription.price        || 0,
          durationDays: client.subscription.durationDays || 30,
          status:       client.subscription.status       || 'active',
          startDate:    client.subscription.startDate  ? client.subscription.startDate.toISOString() : null,
          expiresAt:    client.subscription.expiresAt  ? client.subscription.expiresAt.toISOString() : null,
        }
      : null,
  };
  sessionStorage.setItem(CA_SESSION_KEY, JSON.stringify(obj));
}

function caLoadSession() {
  try {
    const raw = sessionStorage.getItem(CA_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.subscription) {
      if (data.subscription.startDate) data.subscription.startDate = new Date(data.subscription.startDate);
      if (data.subscription.expiresAt) data.subscription.expiresAt = new Date(data.subscription.expiresAt);
      // Re-checa expiração ao recarregar a sessão
      if (data.subscription.expiresAt && data.subscription.expiresAt < new Date()) {
        data.subscription.status = 'expired';
      }
    }
    return data;
  } catch (e) { return null; }
}

function caClearSession() {
  sessionStorage.removeItem(CA_SESSION_KEY);
}

/* ─── Inicialização ─────────────────────────────────────────── */
async function caInit() {
  // Auth anônimo: necessário para ler Firestore
  try {
    if (!auth.currentUser) await auth.signInAnonymously();
  } catch (e) {
    console.warn('[CA] signInAnonymously falhou (sem internet?):', e.message);
  }

  // Carrega serviços e config de horários em paralelo
  Promise.all([caLoadServices(), caLoadScheduleCfg()]);

  // Verifica sessão existente
  const session = caLoadSession();
  if (session && session.id) {
    caClient = session;
    caShowDashboard();
  } else {
    caShowScreen('ca-login');
  }
}

/* ─── Controle de Telas ─────────────────────────────────────── */
function caShowScreen(id) {
  document.querySelectorAll('.ca-screen').forEach(el => {
    el.classList.toggle('hidden', el.id !== id);
  });
}

function caShowDashboard() {
  caRenderDashboard(caClient);
  caShowScreen('ca-dashboard');
}

/* ══════════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════════ */
async function caLogin() {
  const phoneInput = document.getElementById('ca-phone-input');
  const errEl      = document.getElementById('ca-login-error');
  const btn        = document.getElementById('ca-login-btn');

  const raw        = phoneInput.value.trim();
  errEl.classList.add('hidden');
  phoneInput.classList.remove('input-error');

  if (!raw) {
    phoneInput.classList.add('input-error');
    caShowError(errEl, 'Informe seu número de telefone.');
    phoneInput.focus();
    return;
  }

  const normalized = caNormalizePhone(raw);
  if (normalized.length < 12) {
    phoneInput.classList.add('input-error');
    caShowError(errEl, 'Telefone inválido. Inclua o DDD. Ex: (11) 99999-9999');
    phoneInput.focus();
    return;
  }

  // Loading
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" style="width:16px;height:16px;" class="ca-spin"></i> Buscando...`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    if (!auth.currentUser) await auth.signInAnonymously();

    const snap = await db
      .collection('users').doc(TENANT_UID)
      .collection('customers')
      .where('normalizedPhone', '==', normalized)
      .limit(1)
      .get();

    if (snap.empty) {
      phoneInput.classList.add('input-error');
      caShowError(errEl,
        'Número não encontrado. Fale com o Pedro para ser cadastrado como cliente de plano.'
      );
      return;
    }

    const doc  = snap.docs[0];
    const data = doc.data();

    /* Processa assinatura */
    let subscription = null;
    if (data.subscription) {
      const s = data.subscription;
      subscription = {
        planId:       s.planId       || '',
        planName:     s.planName     || '',
        totalCredits: s.totalCredits || 0,
        usedCredits:  s.usedCredits  || 0,
        price:        s.price        || 0,
        durationDays: s.durationDays || 30,
        status:       s.status       || 'active',
        startDate:    s.startDate  ? s.startDate.toDate()  : null,
        expiresAt:    s.expiresAt  ? s.expiresAt.toDate()  : null,
      };
      // Força status expirado se passou da data
      if (subscription.expiresAt && subscription.expiresAt < new Date()) {
        subscription.status = 'expired';
      }
    }

    caClient = {
      id:              doc.id,
      name:            data.name            || 'Cliente',
      phone:           data.phone           || raw,
      normalizedPhone: data.normalizedPhone || normalized,
      subscription,
    };

    caSaveSession(caClient);
    caShowDashboard();

  } catch (e) {
    console.error('[CA] caLogin erro:', e);
    caShowError(errEl, 'Erro ao buscar dados. Verifique sua conexão e tente novamente.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="arrow-right" style="width:16px;height:16px;"></i> Acessar Minha Área`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function caShowError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════════ */
function caRenderDashboard(client) {
  const firstName = (client.name || '').split(' ')[0];

  document.getElementById('ca-welcome-name').textContent = `Olá, ${firstName}! ✂️`;
  const topName = document.getElementById('ca-topbar-name');
  if (topName) topName.textContent = firstName;

  const planWrap = document.getElementById('ca-plan-wrap');
  const bookBtn  = document.getElementById('ca-book-btn');
  const sub      = client.subscription;

  /* Sem plano ou cancelado */
  if (!sub || sub.status === 'canceled') {
    planWrap.innerHTML = _caNoPlanCard();
    if (bookBtn) { bookBtn.disabled = true; bookBtn.style.opacity = '0.45'; bookBtn.style.cursor = 'not-allowed'; }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const now       = new Date();
  const isExpired = (sub.expiresAt && sub.expiresAt < now) || sub.status === 'expired';
  const daysLeft  = sub.expiresAt
    ? Math.ceil((sub.expiresAt.getTime() - now.getTime()) / 86400000)
    : null;
  const isSoon    = !isExpired && daysLeft !== null && daysLeft <= 7;

  const used      = sub.usedCredits  || 0;
  const total     = sub.totalCredits || 1;
  const remaining = Math.max(0, total - used);
  const pct       = Math.min(100, Math.round((used / total) * 100));
  const isFull    = used >= total;

  const statusLabel = isExpired          ? 'Expirado'
                    : sub.status === 'overdue' ? 'Atrasado'
                    : 'Ativo';
  const statusCls   = isExpired          ? 'ca-plan-badge--expired'
                    : sub.status === 'overdue' ? 'ca-plan-badge--overdue'
                    : 'ca-plan-badge--active';

  const fillCls = isExpired ? 'ca-credits-fill--expired' : isFull ? 'ca-credits-fill--full' : '';

  const expiryHtml = isExpired
    ? `<div class="ca-plan-expiry ca-plan-expiry--expired">
         <i data-lucide="alert-circle"></i> Plano expirado em ${sub.expiresAt ? sub.expiresAt.toLocaleDateString('pt-BR') : '—'}
       </div>`
    : isSoon
    ? `<div class="ca-plan-expiry ca-plan-expiry--soon">
         <i data-lucide="clock"></i> Expira em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} — ${sub.expiresAt.toLocaleDateString('pt-BR')}
       </div>`
    : sub.expiresAt
    ? `<div class="ca-plan-expiry">
         <i data-lucide="calendar"></i> Válido até ${sub.expiresAt.toLocaleDateString('pt-BR')}
       </div>`
    : '';

  const renewMsg  = encodeURIComponent(`Olá Pedro! Quero renovar meu plano "${sub.planName}". 😊`);
  const renewHtml = isExpired
    ? `<a href="https://wa.me/${CA_WA_NUMBER}?text=${renewMsg}" target="_blank" rel="noopener"
          class="ca-btn ca-btn--wa" style="margin-top:16px;text-decoration:none;">
         <i data-lucide="whatsapp-logo"></i> Renovar pelo WhatsApp
       </a>`
    : isSoon
    ? `<a href="https://wa.me/${CA_WA_NUMBER}?text=${renewMsg}" target="_blank" rel="noopener"
          class="ca-btn ca-btn--secondary" style="margin-top:12px;text-decoration:none;font-size:0.82rem;padding:10px 16px;">
         <i data-lucide="arrows-clockwise"></i> Renovar plano em breve
       </a>`
    : '';

  planWrap.innerHTML = `
    <div class="ca-plan-card ${isExpired ? 'ca-plan-card--expired' : isSoon ? 'ca-plan-card--expiring' : ''}">
      <div class="ca-plan-header">
        <div class="ca-plan-name">
          <i data-lucide="crown"></i> ${caEsc(sub.planName)}
        </div>
        <span class="ca-plan-badge ${statusCls}">${statusLabel}</span>
      </div>

      <div class="ca-credits-section">
        <div class="ca-credits-label">
          <span class="ca-credits-text">Créditos disponíveis</span>
          <span class="ca-credits-value">${remaining} de ${total}</span>
        </div>
        <div class="ca-credits-bar">
          <div class="ca-credits-fill ${fillCls}" style="width:${pct}%"></div>
        </div>
        <p class="ca-credits-sub">${used} crédito${used !== 1 ? 's' : ''} utilizado${used !== 1 ? 's' : ''} neste ciclo</p>
      </div>

      ${expiryHtml}
      ${renewHtml}
    </div>`;

  /* Estado do botão Agendar */
  if (bookBtn) {
    const canBook = !isExpired && !isFull;
    bookBtn.disabled       = !canBook;
    bookBtn.style.opacity  = canBook ? '' : '0.45';
    bookBtn.style.cursor   = canBook ? '' : 'not-allowed';
    bookBtn.title = isExpired
      ? 'Seu plano está expirado. Renove para agendar.'
      : isFull
      ? 'Todos os créditos deste ciclo já foram utilizados.'
      : '';
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _caNoPlanCard() {
  const waMsgEnc = encodeURIComponent('Olá Pedro! Gostaria de saber mais sobre os planos da Marins Barber. 😊');
  return `
    <div class="ca-no-plan-card">
      <div class="ca-np-icon"><i data-lucide="credit-card"></i></div>
      <p>Você não possui um plano ativo no momento.<br>Fale com o Pedro para contratar!</p>
      <a href="https://wa.me/${CA_WA_NUMBER}?text=${waMsgEnc}"
         target="_blank" rel="noopener" class="ca-btn ca-btn--wa" style="text-decoration:none;">
        <i data-lucide="whatsapp-logo"></i> Falar com o Pedro
      </a>
    </div>`;
}

function caLogout() {
  caClearSession();
  caClient = null;
  // Limpa input de telefone
  const inp = document.getElementById('ca-phone-input');
  if (inp) inp.value = '';
  document.getElementById('ca-login-error').classList.add('hidden');
  caShowScreen('ca-login');
}

/* ══════════════════════════════════════════════════════════════
   CARREGAMENTO DE DADOS DO ORBIT
══════════════════════════════════════════════════════════════ */
async function caLoadServices() {
  try {
    const snap = await db.collection('users').doc(TENANT_UID)
      .collection('sched_services').orderBy('createdAt').get();
    if (!snap.empty) {
      caServicesList = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => !s.isPackage);
    }
  } catch (e) {
    // Fallback estático
    caServicesList = [
      { id: 'corte',       name: 'Corte Clássico',            price: 30 },
      { id: 'barba',       name: 'Barba Terapia',             price: 35 },
      { id: 'combo',       name: 'Combo Vip (Corte + Barba)', price: 60 },
      { id: 'pigmentacao', name: 'Pigmentação',               price: 30 },
    ];
  }
}

async function caLoadScheduleCfg() {
  try {
    const snap = await db.collection('users').doc(TENANT_UID)
      .collection('sched_config').doc('main').get();
    if (snap.exists) {
      caScheduleCfg = { ...caScheduleCfg, ...snap.data() };
    }
  } catch (e) { /* usa padrão */ }
}

/* ══════════════════════════════════════════════════════════════
   BOOKING MODAL
══════════════════════════════════════════════════════════════ */

/* ─── Estado do Booking ─────────────────────────────────────── */
let caBkServices = [];
let caBkDate     = null;
let caBkTime     = null;
let caBkCalDate  = new Date();

/* ─── Abre o modal ──────────────────────────────────────────── */
function caOpenBooking() {
  const sub = caClient && caClient.subscription;
  if (!sub || sub.status !== 'active') return;

  caBkServices = [];
  caBkDate     = null;
  caBkTime     = null;
  caBkCalDate  = new Date();

  caRenderServiceOptions();
  caShowBookingStep(1);
  _caSetModalOpen('ca-bk-backdrop', true);
}

function caCloseBookingModal() {
  _caSetModalOpen('ca-bk-backdrop', false);
}

function _caSetModalOpen(id, open) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open', open);
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.body.style.overflow = open ? 'hidden' : '';
}

/* ─── Step navigation ───────────────────────────────────────── */
function caShowBookingStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`ca-bk-step-${i}`);
    if (el) el.classList.toggle('hidden', i !== n);
  });
  [1, 2, 3].forEach(i => {
    const dot  = document.getElementById(`ca-step-dot-${i}`);
    const line = document.getElementById(`ca-step-line-${i}`);
    if (dot) {
      dot.classList.remove('active', 'done');
      if      (i < n) dot.classList.add('done');
      else if (i === n) dot.classList.add('active');
    }
    if (line) line.classList.toggle('done', i < n);
  });
  const modal = document.getElementById('ca-bk-modal');
  if (modal) modal.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── STEP 1: Serviços ──────────────────────────────────────── */
function caRenderServiceOptions() {
  const wrap = document.getElementById('ca-svc-options');
  if (!wrap) return;

  const list = caServicesList.length > 0 ? caServicesList : [
    { id: 'corte',       name: 'Corte Clássico',            price: 30 },
    { id: 'barba',       name: 'Barba Terapia',             price: 35 },
    { id: 'combo',       name: 'Combo Vip (Corte + Barba)', price: 60 },
    { id: 'pigmentacao', name: 'Pigmentação',               price: 30 },
  ];

  const icons = { corte: 'scissors', barba: 'user', combo: 'star', pigmentacao: 'droplet' };

  wrap.innerHTML = list.map(s => {
    const priceLabel = s.price ? `R$ ${Number(s.price).toFixed(2).replace('.', ',')}` : 'A consultar';
    const icon       = icons[s.id] || 'scissors';
    return `
      <label class="service-option">
        <input type="checkbox" name="ca-svc" value="${caEsc(s.name)}"
               data-price="${s.price || 0}" data-id="${caEsc(s.id)}" />
        <div class="service-option-inner">
          <i data-lucide="${icon}" aria-hidden="true"></i>
          <span class="opt-name">${caEsc(s.name)}</span>
          <span class="opt-desc">${priceLabel}</span>
        </div>
      </label>`;
  }).join('');

  wrap.querySelectorAll('input[name="ca-svc"]').forEach(cb => {
    cb.addEventListener('change', _caUpdateStep1Btn);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _caUpdateStep1Btn() {
  const checked = document.querySelectorAll('input[name="ca-svc"]:checked').length;
  const btn = document.getElementById('ca-step1-next');
  if (btn) btn.disabled = checked === 0;
}

function caGoToStep2() {
  const checked = [...document.querySelectorAll('input[name="ca-svc"]:checked')];
  if (checked.length === 0) return;

  caBkServices = checked.map(cb => ({
    name:  cb.value,
    price: parseFloat(cb.dataset.price) || null,
  }));

  // Reset data/hora
  caBkDate = null;
  caBkTime = null;
  const step2Next = document.getElementById('ca-step2-next');
  if (step2Next) step2Next.disabled = true;
  const slotsWrap = document.getElementById('ca-time-slots-wrap');
  if (slotsWrap) slotsWrap.hidden = true;

  caRenderCalendar();
  caShowBookingStep(2);
}

/* ─── STEP 2: Calendário + Horários ────────────────────────── */
function caRenderCalendar() {
  const year  = caBkCalDate.getFullYear();
  const month = caBkCalDate.getMonth();
  const label = document.getElementById('ca-cal-label');
  if (label) label.textContent = `${CA_MONTHS[month]} ${year}`;

  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const firstDay = new Date(year, month, 1).getDay();
  const daysIn   = new Date(year, month + 1, 0).getDate();
  const calEl    = document.getElementById('ca-cal-days');
  if (!calEl) return;

  calEl.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day cal-day--empty';
    calEl.appendChild(el);
  }

  for (let d = 1; d <= daysIn; d++) {
    const date     = new Date(year, month, d);
    const isPast   = date < today;
    const isOff    = !caScheduleCfg.workDays.includes(date.getDay());
    const isToday  = date.toDateString() === today.toDateString();
    const isSel    = caBkDate && date.toDateString() === caBkDate.toDateString();
    const disabled = isPast || isOff;

    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = d;
    btn.dataset.dateStr = caFmtDate(date);
    btn.setAttribute('aria-label', `${d} de ${CA_MONTHS[month]}${disabled ? ' (indisponível)' : ''}`);

    if (disabled)  { btn.classList.add('cal-day--disabled'); btn.disabled = true; }
    if (isToday)   btn.classList.add('cal-day--today');
    if (isSel)     btn.classList.add('selected');
    if (!disabled) btn.addEventListener('click', () => caSelectDate(date, btn));

    calEl.appendChild(btn);
  }

  caApplyBlockedDates(year, month);
}

async function caApplyBlockedDates(year, month) {
  try {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const snap = await db.collection('users').doc(TENANT_UID)
      .collection('sched_days')
      .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
      .where(firebase.firestore.FieldPath.documentId(), '<=', prefix + '\uf8ff')
      .get();
    snap.forEach(docSnap => {
      if (!docSnap.data().blocked) return;
      const btn = document.querySelector(`#ca-cal-days [data-date-str="${docSnap.id}"]`);
      if (btn && !btn.disabled) { btn.classList.add('cal-day--disabled'); btn.disabled = true; }
    });
  } catch (e) { /* silencioso */ }
}

async function caSelectDate(date, btn) {
  caBkDate = date;
  caBkTime = null;
  const step2Next = document.getElementById('ca-step2-next');
  if (step2Next) step2Next.disabled = true;

  document.querySelectorAll('#ca-cal-days .cal-day').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const wrap  = document.getElementById('ca-time-slots-wrap');
  const slots = document.getElementById('ca-time-slots');
  if (wrap) wrap.hidden = false;
  if (slots) slots.innerHTML = '<p class="slots-loading">Carregando horários…</p>';

  const times = await caFetchTimes(date);
  caRenderTimeSlots(times);

  if (window.innerWidth < 640 && wrap) {
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function caFetchTimes(date) {
  const dateStr = caFmtDate(date);
  let times = null;

  try {
    const snap = await db.collection('users').doc(TENANT_UID)
      .collection('sched_days').doc(dateStr).get();
    if (snap.exists) {
      const d = snap.data();
      if (d.blocked) return [];
      if (Array.isArray(d.times) && d.times.length > 0) times = d.times;
    }
  } catch (e) { /* usa padrão */ }

  if (!times) times = [...(caScheduleCfg.defaultTimes || [])];

  try {
    const bookedSnap = await db.collection('users').doc(TENANT_UID)
      .collection('sched_bookings')
      .where('date', '==', dateStr).get();
    const occupied = bookedSnap.docs
      .map(d => d.data())
      .filter(d => d.status !== 'cancelled')
      .map(d => d.time);
    times = times.filter(t => !occupied.includes(t));
  } catch (e) { /* usa todos */ }

  return times;
}

function caRenderTimeSlots(times) {
  const el = document.getElementById('ca-time-slots');
  if (!el) return;
  el.innerHTML = '';
  if (!times || times.length === 0) {
    el.innerHTML = '<p class="slots-empty">Nenhum horário disponível para esta data.</p>';
    return;
  }
  times.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'time-slot';
    btn.textContent = t;
    btn.setAttribute('aria-label', `Horário ${t}`);
    btn.addEventListener('click', () => caSelectTime(t, btn));
    el.appendChild(btn);
  });
}

function caSelectTime(time, btn) {
  caBkTime = time;
  const step2Next = document.getElementById('ca-step2-next');
  if (step2Next) step2Next.disabled = false;
  document.querySelectorAll('#ca-time-slots .time-slot').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function caChangeMonth(dir) {
  caBkCalDate = new Date(caBkCalDate.getFullYear(), caBkCalDate.getMonth() + dir, 1);
  caRenderCalendar();
}

/* ─── STEP 3: Confirmar ─────────────────────────────────────── */
function caGoToStep3() {
  if (!caBkDate || !caBkTime || caBkServices.length === 0) return;
  caFillSummary();
  caShowBookingStep(3);
}

function caFillSummary() {
  // Serviços
  const listEl    = document.getElementById('ca-sum-services');
  const totalLine = document.getElementById('ca-sum-total-line');
  const totalEl   = document.getElementById('ca-sum-total');

  let total = 0;
  listEl.innerHTML = caBkServices.map(s => {
    const p = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'A consultar';
    if (s.price) total += s.price;
    return `<span class="summary-service-row">
              <span>${caEsc(s.name)}</span>
              <strong>${p}</strong>
            </span>`;
  }).join('');

  if (caBkServices.length > 1) {
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (totalLine) totalLine.hidden = false;
  } else {
    if (totalLine) totalLine.hidden = true;
  }

  // Data e hora
  const opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
  const dateEl = document.getElementById('ca-sum-date');
  const timeEl = document.getElementById('ca-sum-time');
  if (dateEl) dateEl.textContent = caBkDate.toLocaleDateString('pt-BR', opts);
  if (timeEl) timeEl.textContent = caBkTime;

  // Dados do cliente (read-only)
  const nameEl  = document.getElementById('ca-sum-client-name');
  const phoneEl = document.getElementById('ca-sum-client-phone');
  if (nameEl)  nameEl.textContent  = caClient.name;
  if (phoneEl) phoneEl.textContent = caClient.phone;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ─── FINALIZAR AGENDAMENTO ─────────────────────────────────── */
async function caFinalizeBooking() {
  if (!caClient || !caBkDate || !caBkTime || caBkServices.length === 0) return;

  const btn = document.getElementById('ca-confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" style="width:16px;height:16px;" class="ca-spin"></i> Confirmando...`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  const dateStr   = caFmtDate(caBkDate);
  const services  = caBkServices.map(s => s.name);
  const waDateStr = caBkDate.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  try {
    await db.collection('users').doc(TENANT_UID).collection('sched_bookings').add({
      clientName:     caClient.name,
      phone:          caClient.phone,
      date:           dateStr,
      time:           caBkTime,
      services:       services,
      notes:          '',
      status:         'pending',
      source:         'client_area',
      customerId:     caClient.id,
      planCredit:     true,
      creditDeducted: false,
      createdAt:      firebase.firestore.FieldValue.serverTimestamp(),
    });

  } catch (e) {
    console.error('[CA] Erro ao salvar agendamento:', e);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="check" style="width:16px;height:16px;"></i> Confirmar Agendamento`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    alert('Erro ao salvar agendamento. Verifique sua conexão e tente novamente.');
    return;
  }

  /* Monta mensagem WhatsApp para confirmação */
  const sub        = caClient.subscription;
  const used       = sub ? (sub.usedCredits || 0) + 1 : 0;
  const total      = sub ? (sub.totalCredits || 0) : 0;
  const svcBlock   = caBkServices
    .map(s => s.price
      ? `• ${s.name}: R$ ${s.price.toFixed(2).replace('.', ',')}`
      : `• ${s.name}`)
    .join('\n');

  const waMsg =
    `Olá Marins Barber! ✂️\n` +
    `Realizei um agendamento pela minha Área do Cliente:\n\n` +
    svcBlock + '\n\n' +
    `*Data:* ${waDateStr}\n` +
    `*Horário:* ${caBkTime}\n\n` +
    `*Nome:* ${caClient.name}\n` +
    `*WhatsApp:* ${caClient.phone}\n` +
    (sub ? `*Plano:* ${sub.planName} (crédito ${used}/${total})\n` : '') +
    `\nAguardo a confirmação! 💈`;

  const waUrl = `https://wa.me/${CA_WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;

  caCloseBookingModal();
  caOpenSuccessModal(waUrl);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" style="width:16px;height:16px;"></i> Confirmar Agendamento`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

/* ── Modal de Sucesso ───────────────────────────────────────── */
function caOpenSuccessModal(waUrl) {
  const waBtn = document.getElementById('ca-suc-wa-btn');
  if (waBtn) waBtn.href = waUrl;
  _caSetModalOpen('ca-suc-backdrop', true);
  if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons(), 50);
}

function caCloseSuccessModal() {
  _caSetModalOpen('ca-suc-backdrop', false);
}

/* ══════════════════════════════════════════════════════════════
   EVENTOS
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* Máscara de telefone e Enter no login */
  const phoneInput = document.getElementById('ca-phone-input');
  if (phoneInput) {
    phoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') caLogin(); });

    phoneInput.addEventListener('input', () => {
      let v = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 7)      v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
      else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
      else if (v.length > 0) v = `(${v}`;
      phoneInput.value = v;
    });
  }

  /* Fechar modais pelo backdrop */
  const bkBackdrop  = document.getElementById('ca-bk-backdrop');
  const sucBackdrop = document.getElementById('ca-suc-backdrop');
  if (bkBackdrop)  bkBackdrop.addEventListener('click',  e => { if (e.target === bkBackdrop)  caCloseBookingModal(); });
  if (sucBackdrop) sucBackdrop.addEventListener('click', e => { if (e.target === sucBackdrop) caCloseSuccessModal(); });

  /* Tecla Escape */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const bkOpen  = bkBackdrop  && bkBackdrop.classList.contains('open');
    const sucOpen = sucBackdrop && sucBackdrop.classList.contains('open');
    if (bkOpen)      caCloseBookingModal();
    else if (sucOpen) caCloseSuccessModal();
  });

  /* Inicializa o portal */
  caInit();
});
