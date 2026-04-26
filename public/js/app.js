/**
 * EV Buggy — mobile payment flow (UPI direct)
 * Uses UPI intent links + QR code for direct payment.
 * No Razorpay required — payments are recorded for manual verification.
 */

const PLANS = [
  { id: 'monthly', name: 'Monthly', months: 1, original: 300, offer: 300 },
  { id: '3months', name: '3 Months', months: 3, original: 900, offer: 891 },
  { id: '6months', name: '6 Months', months: 6, original: 1800, offer: 1746 },
  { id: '12months', name: '12 Months', months: 12, original: 3600, offer: 3420 },
];

const STORAGE_PREFIX = 'evBuggy_profile:';

/** @type {string | null} */
let userId = null;
/** @type {{ name: string; phone: string; email: string } | null} */
let profile = null;
/** @type {typeof PLANS[0] | null} */
let selectedPlan = null;
/** @type {boolean} */
let paying = false;
/** @type {{ upiId: string; payeeName: string } | null} */
let upiConfig = null;
/** @type {File | null} */
let screenshotFile = null;

const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

function storageKey() {
  return `${STORAGE_PREFIX}${userId}`;
}

function loadProfile() {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.name !== 'string' || typeof data.phone !== 'string') return null;
    return {
      name: data.name,
      phone: data.phone,
      email: typeof data.email === 'string' ? data.email : '',
    };
  } catch {
    return null;
  }
}

function saveProfile(p) {
  if (!userId) return;
  localStorage.setItem(
    storageKey(),
    JSON.stringify({
      name: p.name.trim(),
      phone: p.phone.trim(),
      email: (p.email || '').trim(),
    }),
  );
}

function formatINR(n) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function parseUserId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('userid') || params.get('userId');
  if (!id || !String(id).trim()) return null;
  return String(id).trim();
}

function showView(name) {
  const views = ['view-error', 'view-register', 'view-plans', 'view-upi-pay', 'view-success', 'view-failure'];
  for (const v of views) {
    const el = document.getElementById(v);
    if (el) el.classList.toggle('hidden', v !== name);
  }
}

function setLoader(on) {
  $('loader').classList.toggle('hidden', !on);
  $('loader').setAttribute('aria-hidden', on ? 'false' : 'true');
}

function renderPlans() {
  const list = $('plan-list');
  list.innerHTML = '';
  for (const plan of PLANS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'plan-card';
    card.dataset.planId = plan.id;
    card.setAttribute('aria-pressed', 'false');

    const save = plan.original - plan.offer;
    const saveHtml =
      save > 0
        ? `<p class="save-tag">Save ${formatINR(save)}</p>`
        : '';

    card.innerHTML = `
      <p class="plan-name">${plan.name}</p>
      <div class="price-row">
        <span class="price-original">${formatINR(plan.original)}</span>
        <span class="price-offer">${formatINR(plan.offer)}</span>
      </div>
      <span class="badge">Limited Offer</span>
      ${saveHtml}
    `;

    card.addEventListener('click', () => selectPlan(plan.id));
    list.appendChild(card);
  }
  updatePlanSelectionUI();
}

function selectPlan(planId) {
  const plan = PLANS.find((p) => p.id === planId);
  selectedPlan = plan || null;
  updatePlanSelectionUI();
}

function updatePlanSelectionUI() {
  const cards = document.querySelectorAll('.plan-card');
  cards.forEach((el) => {
    const id = el.dataset.planId;
    const on = selectedPlan && selectedPlan.id === id;
    el.classList.toggle('selected', Boolean(on));
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const btn = $('btn-pay');
  btn.disabled = !selectedPlan || paying;
}

function prefillRegister() {
  if (!profile) return;
  $('input-name').value = profile.name;
  $('input-phone').value = profile.phone;
  $('input-email').value = profile.email || '';
}

function goRegister(editMode) {
  showView('view-register');
  prefillRegister();
  if (editMode) {
    $('reg-title').textContent = 'Edit your details';
    $('btn-register').textContent = 'Save and continue';
  } else {
    $('reg-title').textContent = 'Your details';
    $('btn-register').textContent = 'Continue to plans';
  }
}

function goPlans(fromSaved) {
  showView('view-plans');
  $('saved-hint').classList.toggle('hidden', !fromSaved);
  renderPlans();
  selectedPlan = null;
  paying = false;
  updatePlanSelectionUI();
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function formatExpiry(d) {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/* ──── UPI HELPERS ──── */

function buildUpiUrl(amount, txnNote) {
  if (!upiConfig) return null;
  const params = new URLSearchParams({
    pa: upiConfig.upiId,
    pn: upiConfig.payeeName,
    am: String(amount),
    cu: 'INR',
    tn: txnNote || 'EV Buggy Subscription',
  });
  return `upi://pay?${params.toString()}`;
}

function showUpiPaymentView() {
  if (!selectedPlan || !upiConfig) return;

  const amount = selectedPlan.offer;
  const txnNote = `EV Buggy ${selectedPlan.name} - ${userId}`;
  const upiUrl = buildUpiUrl(amount, txnNote);

  // Update the UPI view content
  $('upi-plan-label').textContent = selectedPlan.name;
  $('upi-amount-label').textContent = formatINR(amount);
  $('upi-payee-id').textContent = upiConfig.upiId;

  // Set up the "Open UPI App" button
  const upiAppBtn = $('btn-open-upi');
  if (upiUrl) {
    upiAppBtn.href = upiUrl;
    upiAppBtn.classList.remove('hidden');
  }

  // Show QR code image (static image from server)
  const qrContainer = $('upi-qr-container');
  qrContainer.innerHTML = `<img src="/IMG_5342.jpeg" alt="UPI QR Code — Scan to pay" class="upi-qr-img" />`;

  // Clear transaction input and screenshot
  $('input-utr').value = '';
  screenshotFile = null;
  resetScreenshotUI();
  updateConfirmBtnState();

  showView('view-upi-pay');
}

function resetScreenshotUI() {
  const preview = $('ss-preview');
  const label = $('ss-label-text');
  const removeBtn = $('btn-remove-ss');
  const input = $('input-screenshot');

  preview.classList.add('hidden');
  preview.innerHTML = '';
  removeBtn.classList.add('hidden');
  label.textContent = 'Upload payment screenshot';
  input.value = '';
  screenshotFile = null;
}

function handleScreenshotSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  // Validate type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file (JPG, PNG, or WebP)');
    e.target.value = '';
    return;
  }

  // Validate size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('Screenshot must be under 5 MB');
    e.target.value = '';
    return;
  }

  screenshotFile = file;
  const label = $('ss-label-text');
  const preview = $('ss-preview');
  const removeBtn = $('btn-remove-ss');

  label.textContent = file.name.length > 25 ? file.name.slice(0, 22) + '…' : file.name;

  // Show image preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    preview.innerHTML = `<img src="${ev.target.result}" alt="Payment screenshot preview" />`;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);

  removeBtn.classList.remove('hidden');
  updateConfirmBtnState();
}

function updateConfirmBtnState() {
  const utr = $('input-utr').value.trim();
  $('btn-confirm-upi').disabled = utr.length < 6;
}

async function confirmUpiPayment() {
  const utr = $('input-utr').value.trim();
  if (!utr || !userId || !selectedPlan || !profile) return;

  paying = true;
  $('btn-confirm-upi').disabled = true;

  try {
    setLoader(true);

    // Build multipart form data
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('plan', selectedPlan.id);
    formData.append('amount', String(selectedPlan.offer));
    formData.append('upiTransactionId', utr);
    formData.append('name', profile.name);
    formData.append('phone', profile.phone);
    formData.append('email', profile.email || '');

    if (screenshotFile) {
      formData.append('screenshot', screenshotFile);
    }

    const res = await fetch('/upi-payment', {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();
    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = { raw: text };
    }

    if (!res.ok) {
      const parts = [result.error, result.detail].filter((x) => typeof x === 'string' && x.trim());
      const msg = parts.length ? parts.join(' — ') : res.statusText || 'Request failed';
      throw new Error(msg);
    }

    setLoader(false);

    $('success-plan-label').textContent = `${selectedPlan.name} — ${formatINR(selectedPlan.offer)}`;
    const expRaw = result && result.expiryDate ? String(result.expiryDate).slice(0, 10) : '';
    const expDate = expRaw
      ? new Date(`${expRaw}T12:00:00`)
      : addMonths(new Date(), selectedPlan.months);
    $('success-expiry-date').textContent = formatExpiry(expDate);
    showView('view-success');
  } catch (e) {
    setLoader(false);
    const msg = e instanceof Error ? e.message : 'Something went wrong';
    $('fail-reason').textContent = msg;
    showView('view-failure');
  } finally {
    paying = false;
  }
}

async function fetchUpiConfig() {
  try {
    const res = await fetch('/upi-config');
    if (!res.ok) throw new Error('Failed to load UPI config');
    const data = await res.json();
    upiConfig = {
      upiId: data.upiId || '',
      payeeName: data.payeeName || 'EV Buggy',
    };
  } catch (e) {
    console.warn('Could not load UPI config:', e.message);
    // Fallback — will be configured via env
    upiConfig = { upiId: '', payeeName: 'EV Buggy' };
  }
}

function init() {
  userId = parseUserId();

  if (!userId) {
    showView('view-error');
    return;
  }

  // Fetch UPI config from server
  fetchUpiConfig();

  profile = loadProfile();

  $('form-register').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = $('form-register');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const name = $('input-name').value.trim();
    const phone = $('input-phone').value.trim();
    const email = $('input-email').value.trim();

    profile = { name, phone, email };
    saveProfile(profile);
    goPlans(true);
  });

  $('btn-edit-details').addEventListener('click', () => goRegister(true));

  $('btn-pay').addEventListener('click', () => {
    if (!selectedPlan) return;
    showUpiPaymentView();
  });

  // UPI view event listeners
  $('input-utr').addEventListener('input', () => updateConfirmBtnState());

  $('input-screenshot').addEventListener('change', handleScreenshotSelect);

  $('btn-remove-ss').addEventListener('click', (e) => {
    e.preventDefault();
    resetScreenshotUI();
    updateConfirmBtnState();
  });

  $('btn-confirm-upi').addEventListener('click', () => confirmUpiPayment());

  $('btn-back-plans').addEventListener('click', () => {
    goPlans(true);
  });

  $('btn-retry').addEventListener('click', () => {
    showView('view-plans');
    renderPlans();
    selectedPlan = null;
    updatePlanSelectionUI();
  });

  if (profile) {
    goPlans(true);
  } else {
    showView('view-register');
    prefillRegister();
    $('saved-hint').classList.add('hidden');
  }
}

init();
