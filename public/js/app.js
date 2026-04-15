/**
 * EV Buggy — mobile payment flow (Razorpay)
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
  const views = ['view-error', 'view-register', 'view-plans', 'view-success', 'view-failure'];
  for (const v of views) {
    $(v).classList.toggle('hidden', v !== name);
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

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const parts = [data.error, data.detail].filter((x) => typeof x === 'string' && x.trim());
    const msg = parts.length ? parts.join(' — ') : res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

function openRazorpayCheckout(orderPayload) {
  return new Promise((resolve, reject) => {
    if (typeof Razorpay === 'undefined') {
      reject(new Error('Razorpay script failed to load'));
      return;
    }

    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const options = {
      key: orderPayload.key_id || orderPayload.keyId,
      amount: orderPayload.amount,
      currency: orderPayload.currency || 'INR',
      order_id: orderPayload.order_id || orderPayload.orderId,
      name: 'EV Buggy Service',
      description: selectedPlan ? `${selectedPlan.name} subscription` : 'Subscription',
      prefill: {
        name: orderPayload.prefill?.name || profile?.name,
        contact: orderPayload.prefill?.contact || profile?.phone,
      },
      theme: { color: '#22c55e' },
      modal: {
        ondismiss: () => {
          finish(() => reject(new Error('Payment cancelled')));
        },
      },
      handler: (response) => {
        finish(() => resolve(response));
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (err) => {
      const desc = err?.error?.description || err?.error?.reason || 'Payment failed';
      finish(() => reject(new Error(desc)));
    });
    rzp.open();
  });
}

async function startPayment() {
  if (!userId || !profile || !selectedPlan || paying) return;

  paying = true;
  const btn = $('btn-pay');
  btn.disabled = true;

  try {
    setLoader(true);
    const order = await postJSON('/create-order', {
      userId,
      name: profile.name,
      phone: profile.phone,
      email: profile.email || '',
      plan: selectedPlan.id,
      amount: selectedPlan.offer,
    });
    setLoader(false);

    const response = await openRazorpayCheckout(order);

    setLoader(true);
    const verified = await postJSON('/verify-payment', {
      userId,
      plan: selectedPlan.id,
      amount: selectedPlan.offer,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature,
    });
    setLoader(false);

    $('success-plan-label').textContent = `${selectedPlan.name} — ${formatINR(selectedPlan.offer)}`;
    const expRaw = verified && verified.expiryDate ? String(verified.expiryDate).slice(0, 10) : '';
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
    updatePlanSelectionUI();
  }
}

function init() {
  userId = parseUserId();

  if (!userId) {
    showView('view-error');
    return;
  }

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

  $('btn-pay').addEventListener('click', () => startPayment());

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
