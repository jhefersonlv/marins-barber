/* ═══════════════════════════════════════════════════════════════
   Kamilly Vitória | Beauty Art  ─  Main JS
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── CONFIG ──────────────────────────────────────────────────── */
const WHATSAPP_NUMBER = '5511999999999'; // TODO: Atualizar com número real da barbearia

/* ─── SERVIÇOS ────────────────────────────────────────────────── */
/* Serviços avulsos — exibidos nos cards e no multi-select */
const SERVICES_LIST = [
  { id: 'corte',       name: 'Corte Clássico',            price: 30,  category: 'cabelo' },
  { id: 'barba',       name: 'Barba Terapia',             price: 35,  category: 'barba' },
  { id: 'combo',       name: 'Combo Vip (Corte + Barba)', price: 60,  category: 'combo' },
  { id: 'pigmentacao', name: 'Pigmentação',               price: 30,  category: 'cabelo' },
];

/* Pacotes — vão direto pro agendamento sem o modal de desconto */
const PACKAGES_LIST = [];

/* Fallback estático de horários */
const AVAILABLE_TIMES = [
  '08:00', '09:00', '10:00', '11:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
];

/* ─── SCHEDULE CONFIG (carregado do Orbit Tools) ─────────────── */
let scheduleConfig = {
  defaultTimes: [...AVAILABLE_TIMES],
  workDays: [1, 2, 3, 4, 5, 6]
};

/* ─── SERVIÇOS dinâmicos (Orbit Tools) ───────────────────────── */
async function loadServicesFromOrbit() {
  try {
    const snap = await db.collection('users').doc(TENANT_UID)
                         .collection('sched_services')
                         .orderBy('createdAt')
                         .get();
    if (snap.empty) return; /* mantém HTML estático se não tiver nada */

    const services = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const avulsos  = services.filter(s => !s.isPackage);
    const pacotes  = services.filter(s =>  s.isPackage);

    /* Agrupa avulsos por categoria */
    const cats = {};
    avulsos.forEach(s => {
      const cat = s.category || 'outros';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(s);
    });

    /* Mapeia categoria → grid id do site */
    const catGridMap = {
      'natural': 'svc-grid-natural',
      'gel':     'svc-grid-gel',
    };

    /* Renderiza avulsos nas grids corretas */
    avulsos.forEach(s => {
      const catKey  = (s.category || '').toLowerCase();
      const gridId  = catGridMap[catKey];
      const grid    = gridId ? document.getElementById(gridId) : null;
      if (!grid) return;

      /* Primeiro serviço dessa categoria → limpa HTML estático */
      if (!grid.dataset.dynamic) {
        grid.innerHTML = '';
        grid.dataset.dynamic = '1';
      }

      grid.insertAdjacentHTML('beforeend', _buildServiceCard(s));
    });

    /* Renderiza pacotes */
    if (pacotes.length > 0) {
      const pkgGrid = document.getElementById('svc-grid-packages');
      if (pkgGrid) {
        pkgGrid.innerHTML = '';
        pacotes.forEach(s => {
          pkgGrid.insertAdjacentHTML('beforeend', _buildPackageCard(s));
        });
      }
    }

    /* Atualiza SERVICES_LIST e PACKAGES_LIST para o modal de agendamento */
    window.SERVICES_LIST = avulsos.map(s => ({
      id: s.id, name: s.name, price: s.price || null,
      category: (s.category || '').toLowerCase()
    }));
    window.PACKAGES_LIST = pacotes.map(s => ({
      id: s.id, name: s.name, price: s.price || null
    }));

  } catch (e) {
    console.warn('[KV] loadServicesFromOrbit falhou, mantendo HTML estático:', e.message);
  }
}

function _buildServiceCard(s) {
  const price    = s.price ? `R$ ${Number(s.price).toFixed(2).replace('.', ',')}` : 'A consultar';
  const imgSrc   = s.imageUrl || '';
  const imgTag   = imgSrc
    ? `<img src="${imgSrc}" alt="${_kvEsc(s.name)}" loading="lazy" />`
    : `<div class="service-card-img-placeholder"><i class="ph ph-image"></i></div>`;
  const badgeHtml = s.badge ? `<div class="service-badge">${_kvEsc(s.badge)}</div>` : '';
  const highlight = s.badge ? ' service-card--highlight' : '';
  return `
    <article class="service-card${highlight}" role="listitem">
      ${badgeHtml}
      <div class="service-card-img">
        ${imgTag}
        <div class="service-card-img-overlay" aria-hidden="true"></div>
        <span class="service-icon-badge"><i class="ph ph-sparkle"></i></span>
      </div>
      <div class="service-body">
        <h3 class="service-title">${_kvEsc(s.name)}</h3>
        <p class="service-price">${price}</p>
      </div>
      <button class="service-btn" onclick="selectService('${_kvEsc(s.name)}', ${s.price || null})">
        Agendar <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
    </article>`;
}

function _buildPackageCard(s) {
  const price  = s.price ? `R$ ${Number(s.price).toFixed(2).replace('.', ',')}` : 'A consultar';
  const img1   = s.imageUrl  || '';
  const img2   = s.imageUrl2 || s.imageUrl || '';

  let imgHtml;
  if (img1 && img2 && img1 !== img2) {
    imgHtml = `
      <img class="dual-img dual-img--left"  src="${img1}" alt="${_kvEsc(s.name)}" loading="lazy" />
      <img class="dual-img dual-img--right" src="${img2}" alt="${_kvEsc(s.name)}" loading="lazy" />
      <div class="dual-divider" aria-hidden="true"></div>`;
  } else if (img1) {
    imgHtml = `<img src="${img1}" alt="${_kvEsc(s.name)}" loading="lazy" />`;
  } else {
    imgHtml = `<div class="service-card-img-placeholder"><i class="ph ph-gift"></i></div>`;
  }

  return `
    <article class="service-card service-card--package" role="listitem">
      <div class="service-card-img ${img1 && img2 && img1 !== img2 ? 'service-card-img--dual' : ''}">
        ${imgHtml}
        <div class="service-card-img-overlay" aria-hidden="true"></div>
        <span class="service-icon-badge"><i class="ph ph-gift"></i></span>
      </div>
      <div class="service-body">
        <h3 class="service-title">${_kvEsc(s.name)}</h3>
        <p class="service-price">${price}</p>
      </div>
      <button class="service-btn" onclick="selectPackage('${_kvEsc(s.name)}', ${s.price || null})">
        Agendar <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
    </article>`;
}

/* Escapa strings para uso em atributos HTML inline */
function _kvEsc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function loadScheduleConfig() {
  try {
    const snap = await db.collection('users').doc(TENANT_UID)
                         .collection('sched_config').doc('main').get();
    if (snap.exists) scheduleConfig = { ...scheduleConfig, ...snap.data() };
  } catch (e) {
    console.warn('[KV] loadScheduleConfig falhou, usando padrão:', e.message);
  }
}

/* ─── UTILITÁRIOS ────────────────────────────────────────────── */
function fmtDate(date) {
  return `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`;
}

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const PT_DAYS_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

function formatPrice(price) {
  if (price === null) return 'A consultar';
  return 'R$ ' + price.toFixed(2).replace('.', ',');
}

/* ─── STATE ───────────────────────────────────────────────────── */
let currentStep      = 1;
let selectedService  = null;
let selectedServices = [];
let selectedDate     = null;
let selectedTime     = null;
let calendarDate     = new Date();

let pendingService = null;
let pendingPrice   = null;

/* ─── DOM REFS ────────────────────────────────────────────────── */
const backdrop     = document.getElementById('modal-backdrop');
const modal        = document.getElementById('booking-modal');
const step1Next    = document.getElementById('step1-next');
const step2Next    = document.getElementById('step2-next');
const calDays      = document.getElementById('cal-days');
const calLabel     = document.getElementById('cal-month-label');
const timeSlotsWrap = document.getElementById('time-slots-section');
const timeSlotsEl  = document.getElementById('time-slots');
const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks     = document.getElementById('nav-links');

/* ─── MODAL ───────────────────────────────────────────────────── */
function openModal(preselect) {
  currentStep = 1;
  selectedDate = null;
  selectedTime = null;
  calendarDate = new Date();

  if (preselect) {
    selectedService = preselect;
    const radios = document.querySelectorAll('input[name="service"]');
    radios.forEach(r => { r.checked = (r.value === preselect); });
    step1Next.disabled = false;
  } else {
    selectedService = null;
    document.querySelectorAll('input[name="service"]').forEach(r => r.checked = false);
    step1Next.disabled = true;
  }

  renderCalendar();
  showStep(1);

  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  setTimeout(() => modal.querySelector('.modal-close').focus(), 350);
}

function closeModal() {
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  const nameEl  = document.getElementById('client-name');
  const phoneEl = document.getElementById('client-phone');
  const errEl   = document.getElementById('client-error');
  if (nameEl)  { nameEl.value  = ''; nameEl.classList.remove('input-error'); }
  if (phoneEl) { phoneEl.value = ''; phoneEl.classList.remove('input-error'); }
  if (errEl)   { errEl.hidden  = true; }
}

backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal();
});

/* ─── STEP MANAGEMENT ────────────────────────────────────────── */
function showStep(n) {
  currentStep = n;
  [1, 2, 3].forEach(i => {
    document.getElementById(`modal-step-${i}`).classList.toggle('hidden', i !== n);
  });
  updateStepDots();
  modal.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots() {
  [1, 2, 3].forEach(i => {
    const dot  = document.getElementById(`step-dot-${i}`);
    const line = document.getElementById(`step-line-${i}`);
    dot.classList.remove('active', 'done');
    if (i < currentStep) dot.classList.add('done');
    else if (i === currentStep) dot.classList.add('active');
    if (line) line.classList.toggle('done', i < currentStep);
  });
}

function goToStep(n) {
  if (n === 2 && !selectedService) return;
  if (n === 3) {
    if (!selectedDate || !selectedTime) return;
    fillSummary();
  }
  showStep(n);
}

/* ─── SERVICE SELECTION (fluxo legado via nav) ───────────────── */
document.querySelectorAll('input[name="service"]').forEach(radio => {
  radio.addEventListener('change', () => {
    selectedService = radio.value;
    step1Next.disabled = false;
  });
});

/* ─── CALENDAR ───────────────────────────────────────────────── */
function changeMonth(dir) {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + dir, 1);
  renderCalendar();
}

function renderCalendar() {
  const year  = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  calLabel.textContent = `${PT_MONTHS[month]} ${year}`;

  const today      = new Date(); today.setHours(0, 0, 0, 0);
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calDays.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day cal-day--empty';
    calDays.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date      = new Date(year, month, d);
    const isPast    = date < today;
    const isOffDay  = !scheduleConfig.workDays.includes(date.getDay());
    const isToday   = date.toDateString() === today.toDateString();
    const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
    const dateStr   = fmtDate(date);
    const isDisabled = isPast || isOffDay;

    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = d;
    btn.dataset.dateStr = dateStr;
    btn.setAttribute('aria-label', `${d} de ${PT_MONTHS[month]}${isDisabled ? ' (indisponível)' : ''}`);

    if (isDisabled) { btn.classList.add('cal-day--disabled'); btn.disabled = true; }
    if (isToday)    btn.classList.add('cal-day--today');
    if (isSelected) btn.classList.add('selected');

    if (!isDisabled) {
      btn.addEventListener('click', () => selectDate(date, btn));
    }
    calDays.appendChild(btn);
  }

  applyBlockedDates(year, month);
}

async function applyBlockedDates(year, month) {
  try {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const snap = await db.collection('users').doc(TENANT_UID)
                         .collection('sched_days')
                         .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
                         .where(firebase.firestore.FieldPath.documentId(), '<=', prefix + '\uf8ff')
                         .get();
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.blocked) return;
      const btn = calDays.querySelector(`[data-date-str="${docSnap.id}"]`);
      if (btn && !btn.disabled) { btn.classList.add('cal-day--disabled'); btn.disabled = true; }
    });
    console.log(`[Marins Barber] applyBlockedDates para ${prefix} encontrou ${snap.size} dias.`);
  } catch (e) {
    console.warn('[Marins Barber] applyBlockedDates falhou:', e.message);
  }
}

async function selectDate(date, btn) {
  selectedDate = date;
  selectedTime = null;
  step2Next.disabled = true;

  document.querySelectorAll('.cal-day').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  timeSlotsWrap.hidden = false;
  timeSlotsEl.innerHTML = '<p class="slots-loading">Carregando horários…</p>';

  const times = await fetchTimesForDate(date);
  renderTimeSlots(times);

  if (window.innerWidth < 640) {
    timeSlotsWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function fetchTimesForDate(date) {
  const dateStr = fmtDate(date);
  let times = null;

  /* Verifica se o dia está bloqueado ou tem horários customizados */
  try {
    const snap = await db.collection('users').doc(TENANT_UID)
                         .collection('sched_days').doc(dateStr).get();
    if (snap.exists) {
      const data = snap.data();
      console.log(`[Marins Barber] Dados para ${dateStr}:`, data);
      if (data.blocked) return [];
      if (Array.isArray(data.times) && data.times.length > 0) times = data.times;
    } else {
      console.log(`[Marins Barber] Dia ${dateStr} não tem config específica no firebase.`);
    }
  } catch (e) {
    console.warn('[Marins Barber] fetchTimesForDate sched_days falhou:', e.message);
  }

  if (!times) times = [...scheduleConfig.defaultTimes];

  /* Remove horários já agendados (que não sejam cancelados) */
  try {
    const bookedSnap = await db.collection('users').doc(TENANT_UID)
                                .collection('sched_bookings')
                                .where('date', '==', dateStr)
                                .get();
    const booked = bookedSnap.docs
      .map(d => d.data())
      .filter(d => d.status !== 'cancelled')
      .map(d => d.time);
    times = times.filter(t => !booked.includes(t));
  } catch (e) {
    console.warn('[KV] fetchTimesForDate sched_bookings falhou:', e.message);
  }

  return times;
}

/* ─── TIME SLOTS ─────────────────────────────────────────────── */
function renderTimeSlots(times) {
  timeSlotsEl.innerHTML = '';
  if (!times || times.length === 0) {
    timeSlotsEl.innerHTML = '<p class="slots-empty">Nenhum horário disponível para esta data.</p>';
    return;
  }
  times.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'time-slot';
    btn.textContent = t;
    btn.setAttribute('aria-label', `Horário ${t}`);
    btn.addEventListener('click', () => selectTime(t, btn));
    timeSlotsEl.appendChild(btn);
  });
}

function selectTime(time, btn) {
  selectedTime = time;
  step2Next.disabled = false;
  document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

/* ─── SUMMARY ────────────────────────────────────────────────── */
function fillSummary() {
  const listEl    = document.getElementById('summary-services-list');
  const totalLine = document.getElementById('summary-total-line');
  const totalEl   = document.getElementById('summary-total');

  if (selectedServices.length > 0) {
    let total = 0;
    let hasConsulta = false;

    listEl.innerHTML = selectedServices.map(s => {
      const priceLabel = s.price !== null
        ? `R$ ${s.price.toFixed(2).replace('.', ',')}`
        : 'A consultar';
      if (s.price !== null) total += s.price; else hasConsulta = true;
      return `<span class="summary-service-row">
                <span>${s.name}</span>
                <strong>${priceLabel}</strong>
              </span>`;
    }).join('');

    if (selectedServices.length > 1) {
      const totalStr = hasConsulta
        ? `R$ ${total.toFixed(2).replace('.', ',')} + A consultar`
        : `R$ ${total.toFixed(2).replace('.', ',')}`;
      totalEl.textContent = totalStr;
      totalLine.hidden = false;
    } else {
      totalLine.hidden = true;
    }
  } else {
    listEl.innerHTML = `<span class="summary-service-row"><span>${selectedService || '—'}</span></span>`;
    totalLine.hidden = true;
  }

  if (selectedDate) {
    const opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
    document.getElementById('summary-date').textContent =
      selectedDate.toLocaleDateString('pt-BR', opts);
  }
  document.getElementById('summary-time').textContent = selectedTime || '—';
}

/* ─── WHATSAPP FINALIZE ──────────────────────────────────────── */
async function finalizeOnWhatsApp() {
  const hasServices = selectedServices.length > 0 || selectedService;
  if (!hasServices || !selectedDate || !selectedTime) {
    alert('Por favor, preencha todos os campos antes de continuar.');
    return;
  }

  const nameEl  = document.getElementById('client-name');
  const phoneEl = document.getElementById('client-phone');
  const errEl   = document.getElementById('client-error');
  const name    = nameEl.value.trim();
  const phone   = phoneEl.value.trim();

  nameEl.classList.remove('input-error');
  phoneEl.classList.remove('input-error');
  errEl.hidden = true;

  if (!name && !phone) {
    nameEl.classList.add('input-error');
    phoneEl.classList.add('input-error');
    errEl.textContent = 'Por favor, informe seu nome e WhatsApp antes de continuar.';
    errEl.hidden = false;
    nameEl.focus();
    return;
  }
  if (!name) {
    nameEl.classList.add('input-error');
    errEl.textContent = 'Por favor, informe seu nome.';
    errEl.hidden = false;
    nameEl.focus();
    return;
  }
  if (!phone) {
    phoneEl.classList.add('input-error');
    errEl.textContent = 'Por favor, informe seu WhatsApp.';
    errEl.hidden = false;
    phoneEl.focus();
    return;
  }

  const dateStr = selectedDate.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  const services = selectedServices.length > 0
    ? selectedServices
    : [{ name: selectedService, price: null }];

  let serviceBlock;
  if (selectedServices.length > 0) {
    let total = 0;
    let hasConsulta = false;
    const lines = selectedServices.map(s => {
      if (s.price !== null) { total += s.price; return `• ${s.name}: R$ ${s.price.toFixed(2).replace('.', ',')}`; }
      hasConsulta = true;
      return `• ${s.name}: A consultar`;
    });
    const totalStr = hasConsulta
      ? `R$ ${total.toFixed(2).replace('.', ',')} + valores a consultar`
      : `R$ ${total.toFixed(2).replace('.', ',')}`;
    serviceBlock = lines.join('\n') +
      (selectedServices.length > 1 ? `\n*Total:* ${totalStr}` : '');
  } else {
    serviceBlock = `• ${selectedService}`;
  }

  const message =
    `Olá Marins Barber! ✂️\n` +
    `Gostaria de agendar:\n\n` +
    serviceBlock + '\n\n' +
    `*Data:* ${dateStr}\n` +
    `*Horário:* ${selectedTime}\n\n` +
    `*Nome:* ${name}\n` +
    `*WhatsApp:* ${phone}\n\n` +
    `Aguardo a confirmação. Obrigado! 💈`;

  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  try {
    const docRef = await db.collection('users').doc(TENANT_UID).collection('sched_bookings').add({
      clientName: name,
      phone:      phone,
      date:       fmtDate(selectedDate),
      time:       selectedTime,
      services:   services.map(s => s.name),
      notes:      '',
      status:     'pending',
      source:     'client',
      createdAt:  firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('[Marins Barber] Agendamento salvo:', docRef.id);
  } catch (e) {
    console.error('[Marins Barber] ERRO ao salvar agendamento:', e.code, e.message);
  }

  /* Fecha o booking modal e abre o modal de sucesso */
  closeModal();
  const waBtn = document.getElementById('success-whatsapp-btn');
  if (waBtn) waBtn.href = waUrl;

  const successBd = document.getElementById('success-backdrop');
  successBd.classList.add('open');
  successBd.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  /* Atualiza ícones do Lucide no modal recém aberto */
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ─── MODAL DE SUCESSO ───────────────────────────────────────── */
function closeSuccessModal() {
  const bd = document.getElementById('success-backdrop');
  bd.classList.remove('open');
  bd.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.getElementById('success-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('success-backdrop')) closeSuccessModal();
});

/* ─── ABRIR SELEÇÃO DE SERVIÇOS (nav/hero/portfólio) ─────────── */
function openServiceSelect() {
  pendingService = null;
  pendingPrice   = null;
  openMultiSelectModal();
}

/* ─── ABRIR BOOKING MODAL COM SERVIÇOS JÁ SELECIONADOS ──────── */
function openBookingModal(services) {
  selectedServices = services;
  selectedDate     = null;
  selectedTime     = null;
  calendarDate     = new Date();

  timeSlotsWrap.hidden = true;
  step2Next.disabled   = true;

  renderCalendar();
  showStep(2);

  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  setTimeout(() => modal.querySelector('.modal-close').focus(), 350);
}

/* ─── VOLTAR DO STEP 2 ───────────────────────────────────────── */
function goBackFromStep2() {
  if (selectedServices.length > 0) {
    selectedServices = [];
    closeModal();
  } else {
    goToStep(1);
  }
}

/* ═══════════════════════════════════════════════════════════════
   SERVIÇOS AVULSOS — clique no card
   Exibe modal de desconto (quer adicionar mais serviços?)
   ═══════════════════════════════════════════════════════════════ */
function selectService(name, price) {
  pendingService = name;
  pendingPrice   = price;

  const preview = document.getElementById('discount-service-preview');
  preview.innerHTML =
    `<div class="preview-service">` +
    `<span class="preview-name">${name}</span>` +
    `<span class="preview-price">${formatPrice(price)}</span>` +
    `</div>`;

  openDiscountModal();
}

/* ─── Modal de desconto ─────────────────────────────────────── */
function openDiscountModal() {
  const bd = document.getElementById('discount-backdrop');
  bd.classList.add('open');
  bd.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDiscountModal() {
  const bd = document.getElementById('discount-backdrop');
  bd.classList.remove('open');
  bd.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.getElementById('discount-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('discount-backdrop')) closeDiscountModal();
});

function discountNo() {
  closeDiscountModal();
  openBookingModal([{ name: pendingService, price: pendingPrice }]);
}

function discountYes() {
  closeDiscountModal();
  openMultiSelectModal();
}

/* ═══════════════════════════════════════════════════════════════
   PACOTES — clique no card
   Vai direto pro agendamento (sem modal de desconto)
   ═══════════════════════════════════════════════════════════════ */
function selectPackage(name, price) {
  openBookingModal([{ name, price }]);
}

/* ═══════════════════════════════════════════════════════════════
   MODAL DE SELEÇÃO MÚLTIPLA (serviços avulsos)
   ═══════════════════════════════════════════════════════════════ */
function openMultiSelectModal() {
  const container = document.getElementById('multiselect-services');
  container.innerHTML = '';

  /* Agrupa por categoria */
  const categories = [
    { key: 'cabelo', label: 'Cabelo' },
    { key: 'barba',  label: 'Barba' },
    { key: 'combo',  label: 'Combos' },
  ];

  categories.forEach(cat => {
    const items = SERVICES_LIST.filter(s => s.category === cat.key);
    if (items.length === 0) return;

    const header = document.createElement('p');
    header.className = 'multiselect-category-label';
    header.textContent = cat.label;
    container.appendChild(header);

    items.forEach(service => {
      const isPreselected = service.name === pendingService;

      const label = document.createElement('label');
      label.className = 'multiselect-option' + (isPreselected ? ' multiselect-option--checked' : '');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'multi-service';
      cb.value = service.name;
      cb.dataset.price = service.price !== null ? service.price : '';
      cb.checked = isPreselected;

      cb.addEventListener('change', function () {
        this.closest('.multiselect-option').classList.toggle('multiselect-option--checked', this.checked);
        updateMultiTotal();
      });

      const inner = document.createElement('div');
      inner.className = 'multiselect-option-inner';
      inner.innerHTML =
        `<span class="multi-name">${service.name}</span>` +
        `<span class="multi-price">${formatPrice(service.price)}</span>`;

      label.appendChild(cb);
      label.appendChild(inner);
      container.appendChild(label);
    });
  });

  updateMultiTotal();

  const bd = document.getElementById('multiselect-backdrop');
  bd.classList.add('open');
  bd.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeMultiSelectModal() {
  const bd = document.getElementById('multiselect-backdrop');
  bd.classList.remove('open');
  bd.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.getElementById('multiselect-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('multiselect-backdrop')) closeMultiSelectModal();
});

function updateMultiTotal() {
  const checked = document.querySelectorAll('#multiselect-services input[type="checkbox"]:checked');

  let total = 0;
  let hasConsulta = false;

  checked.forEach(cb => {
    if (cb.dataset.price !== '') total += parseFloat(cb.dataset.price);
    else hasConsulta = true;
  });

  const totalEl   = document.getElementById('multiselect-total');
  const totalBase = 'R$ ' + total.toFixed(2).replace('.', ',');
  totalEl.textContent = hasConsulta ? totalBase + ' + A consultar' : totalBase;

  document.getElementById('multiselect-confirm-btn').disabled = checked.length === 0;
}

function finalizeMultiSelect() {
  const checked = document.querySelectorAll('#multiselect-services input[type="checkbox"]:checked');
  if (checked.length === 0) return;

  const services = [];
  checked.forEach(cb => {
    services.push({
      name:  cb.value,
      price: cb.dataset.price !== '' ? parseFloat(cb.dataset.price) : null
    });
  });

  closeMultiSelectModal();
  openBookingModal(services);
}

/* ─── NAV: SCROLL HEADER ─────────────────────────────────────── */
const siteHeader = document.getElementById('site-header') || document.querySelector('.navbar');
function handleScroll() {
  if (siteHeader) siteHeader.classList.toggle('scrolled', window.scrollY > 50);
}
window.addEventListener('scroll', handleScroll, { passive: true });
handleScroll();

/* ─── NAV: HAMBURGER ─────────────────────────────────────────── */
hamburgerBtn.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  hamburgerBtn.classList.toggle('open', isOpen);
  hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

navLinks.querySelectorAll('a, button').forEach(el => {
  el.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburgerBtn.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });
});

document.addEventListener('click', e => {
  if (
    navLinks.classList.contains('open') &&
    !navLinks.contains(e.target) &&
    !hamburgerBtn.contains(e.target)
  ) {
    navLinks.classList.remove('open');
    hamburgerBtn.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
});

/* ─── INTERSECTION OBSERVER ──────────────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll(
  '.section-header, .bento-item, .service-card, .testimonial-card, .whatsapp-cta-block, .hero-stats'
).forEach(el => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

/* ─── SMOOTH ANCHOR SCROLL ───────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ─── BENTO: staggered animation ────────────────────────────── */
document.querySelectorAll('.bento-item').forEach((item, i) => {
  item.style.transitionDelay = `${i * 0.06}s`;
});

/* ─── INIT: carrega config de horários do Orbit Tools ────────── */
loadScheduleConfig();
