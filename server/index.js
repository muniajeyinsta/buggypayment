'use strict';

const fs = require('fs');
const path = require('path');
// Resolve project root .env (works even if cwd is `server/`) and override stale machine-level env.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const { isSupabaseConfigured } = require('./supabaseClient');
const userStore = require('./userStore');

const DBG_NDJSON = path.resolve(__dirname, '..', 'debug-a4dcb6.ndjson');
const TRACE_RING_MAX = 40;
const traceRing = [];

function dbgLine(payload) {
  const obj = { sessionId: 'a4dcb6', t: Date.now(), ...payload };
  const line = JSON.stringify(obj);
  console.log('[trace]', line);
  traceRing.push(obj);
  if (traceRing.length > TRACE_RING_MAX) traceRing.shift();
  try {
    fs.appendFileSync(DBG_NDJSON, line + '\n');
  } catch (e) {
    console.error('[debug] ndjson write failed:', e.message);
  }
}

/** Razorpay Node SDK throws `{ statusCode, error }` (not `Error`), so `err.message` is usually empty. */
function formatRazorpayErr(err) {
  if (!err) return 'Razorpay error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  const apiErr = err.error;
  if (apiErr && typeof apiErr === 'object') {
    const desc = apiErr.description || apiErr.reason || apiErr.field || apiErr.source;
    const code = apiErr.code;
    if (desc && code) return `${code}: ${desc}`;
    if (desc) return String(desc);
    if (code) return String(code);
  }
  if (err.statusCode) return `Razorpay HTTP ${err.statusCode}`;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return 'Razorpay error';
  }
}

const PORT = Number(process.env.PORT) || 3000;

const PLAN_OFFERS = {
  monthly: 300,
  '3months': 891,
  '6months': 1746,
  '12months': 3420,
};

const PLAN_MONTHS = {
  monthly: 1,
  '3months': 3,
  '6months': 6,
  '12months': 12,
};

const RAZORPAY_KEY_ID = String(process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

const razorpay =
  RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      })
    : null;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '32kb' }));

const publicDir = path.join(__dirname, '..', 'public');
const payHtmlPath = path.resolve(publicDir, 'pay.html');
app.use(express.static(publicDir, { index: false, extensions: ['html'] }));

app.get('/pay', (req, res) => {
  res.sendFile(payHtmlPath, (err) => {
    if (err) {
      console.error('GET /pay sendFile', err);
      dbgLine({ hypothesisId: 'H-pay', event: 'pay_sendfile_error', code: err.code });
      if (!res.headersSent) res.status(500).type('text').send('Payment page unavailable');
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    razorpayConfigured: Boolean(razorpay),
    supabaseConfigured: isSupabaseConfigured(),
  });
});

/** RFID / gate: lightweight list of subscription status by userId */
app.get('/users-status', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Database not configured', detail: 'Set SUPABASE_URL and keys' });
  }
  const filter = req.query.userId ? String(req.query.userId).trim() : '';
  const { ok, rows, error } = await userStore.listUsersStatus(filter || null);
  if (!ok) {
    return res.status(500).json({ error: 'Lookup failed', detail: error });
  }
  return res.json(rows);
});

app.get('/api/debug/a4dcb6', (_req, res) => {
  if (process.env.BUGGY_DEBUG_API !== '1') {
    return res.status(404).type('text').send('Not found');
  }
  res.json({ traces: traceRing.slice() });
});

app.post('/create-order', async (req, res) => {
  const body = req.body || {};
  const userId = body.userId == null ? '' : String(body.userId).trim();
  const name = body.name == null ? '' : String(body.name).trim();
  const phone = body.phone == null ? '' : String(body.phone).trim();
  const email = body.email == null ? '' : String(body.email).trim();
  const plan = body.plan == null ? '' : String(body.plan).trim();

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }
  if (!plan) {
    return res.status(400).json({ error: 'plan is required' });
  }

  const expectedOffer = PLAN_OFFERS[plan];
  if (expectedOffer === undefined) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt !== expectedOffer) {
    return res.status(400).json({
      error: 'Invalid amount',
      detail: 'Amount must match the current offer price for the selected plan',
    });
  }

  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      error: 'Database not configured',
      detail: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env',
    });
  }

  const existing = await userStore.getUserById(userId);
  if (!existing.ok) {
    console.error('getUserById', existing.error);
    return res.status(502).json({ error: 'Failed to read user', detail: existing.error });
  }
  if (!existing.data) {
    const created = await userStore.createUser(userId);
    if (!created.ok) {
      console.error('createUser', created.error);
      return res.status(502).json({ error: 'Failed to create user', detail: created.error });
    }
  }

  const updated = await userStore.updateUserDetails(userId, name, phone, email || null);
  if (!updated.ok) {
    console.error('updateUserDetails', updated.error);
    return res.status(502).json({ error: 'Failed to save user details', detail: updated.error });
  }

  if (!razorpay) {
    dbgLine({ hypothesisId: 'H-raz', event: 'create_order_no_razorpay' });
    return res.status(503).json({
      error: 'Payments not configured',
      detail: 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    });
  }

  const amountPaise = Math.round(amt * 100);
  if (amountPaise < 100) {
    return res.status(400).json({ error: 'Amount too low' });
  }

  try {
    const receipt = `b_${Date.now()}_${String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`.slice(0, 40);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: String(userId),
        plan: String(plan),
        name: String(name).slice(0, 80),
        phone: String(phone).slice(0, 20),
      },
    });

    const saved = await userStore.updatePayment(userId, { lastOrderId: order.id });
    if (!saved.ok) {
      console.error('updatePayment(lastOrderId)', saved.error);
      return res.status(502).json({ error: 'Order created but failed to save order id', detail: saved.error });
    }

    return res.json({
      mode: 'checkout',
      order_id: order.id,
      key_id: RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      // Backward-compatible aliases for any older clients.
      orderId: order.id,
      keyId: RAZORPAY_KEY_ID,
      prefill: { name: String(name), contact: String(phone) },
    });
  } catch (err) {
    const detail = formatRazorpayErr(err);
    console.error('create-order', detail, err);
    dbgLine({
      hypothesisId: 'H-order',
      event: 'create_order_razorpay_error',
      msg: detail.slice(0, 300),
    });
    return res.status(502).json({
      error: 'Failed to create order',
      detail,
    });
  }
});

app.post('/verify-payment', async (req, res) => {
  const secret = RAZORPAY_KEY_SECRET;
  if (!secret) {
    return res.status(503).json({
      error: 'Payments not configured',
      detail: 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET',
    });
  }

  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      error: 'Database not configured',
      detail: 'Set SUPABASE_URL and Supabase key in .env',
    });
  }

  const body = req.body || {};
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing verification fields' });
  }

  const userId = body.userId == null ? '' : String(body.userId).trim();
  const plan = body.plan == null ? '' : String(body.plan).trim();
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!plan) {
    return res.status(400).json({ error: 'plan is required' });
  }

  const expectedOffer = PLAN_OFFERS[plan];
  if (expectedOffer === undefined) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt !== expectedOffer) {
    return res.status(400).json({
      error: 'Invalid amount',
      detail: 'Amount must match the offer for this plan',
    });
  }

  const planMonths = PLAN_MONTHS[plan];
  if (!planMonths) {
    return res.status(400).json({ error: 'Invalid plan duration' });
  }

  const signedPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(razorpay_signature), 'utf8');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return res.status(400).json({ verified: false, error: 'Invalid signature' });
  }

  const userRes = await userStore.getUserById(userId);
  if (!userRes.ok) {
    console.error('verify-payment getUserById', userRes.error);
    return res.status(502).json({ verified: false, error: 'Failed to load user', detail: userRes.error });
  }
  if (!userRes.data) {
    return res.status(404).json({ verified: false, error: 'User not found' });
  }

  const storedOrderId = userRes.data.lastOrderId ? String(userRes.data.lastOrderId).trim() : '';
  const paidOrderId = String(razorpay_order_id).trim();
  if (storedOrderId && storedOrderId !== paidOrderId) {
    return res.status(400).json({
      verified: false,
      error: 'Order mismatch',
      detail: 'Payment order does not match the last checkout order for this user',
    });
  }

  const applied = await userStore.finalizeVerifiedPayment({
    userId,
    user: userRes.data,
    plan,
    amountPaid: expectedOffer,
    lastPaymentId: String(razorpay_payment_id),
    lastOrderId: paidOrderId,
    planMonths,
  });

  if (!applied.ok) {
    console.error('finalizeVerifiedPayment', applied.error);
    return res.status(502).json({ verified: false, error: 'Payment verified but failed to update subscription', detail: applied.error });
  }

  return res.json({
    verified: true,
    ok: true,
    userId,
    plan: applied.plan,
    startDate: applied.startDate,
    expiryDate: applied.expiryDate,
  });
});

app.use((req, res) => {
  res.status(404).type('text').send('Not found');
});

app.listen(PORT, () => {
  dbgLine({
    hypothesisId: 'H-boot',
    event: 'listen',
    port: PORT,
    payHtmlExists: fs.existsSync(payHtmlPath),
  });

  console.log(`server listening on http://localhost:${PORT}`);
  console.log(`EV Buggy Pay server listening on http://localhost:${PORT}`);
  console.log(`Open payment page: http://localhost:${PORT}/pay?userid=A001`);
  console.log('[debug] NDJSON:', DBG_NDJSON);
});
