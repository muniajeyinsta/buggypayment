'use strict';

const { getSupabase } = require('./supabaseClient');

const TABLE = 'users';
const SCHEMAS = [
  {
    userId: 'userid',
    amountPaid: 'amountpaid',
    startDate: 'startdate',
    expiryDate: 'expirydate',
    lastPaymentId: 'lastpaymentid',
    lastOrderId: 'lastorderid',
    createdAt: 'createdat',
    updatedAt: 'updatedat',
  },
  {
    userId: 'userId',
    amountPaid: 'amountPaid',
    startDate: 'startDate',
    expiryDate: 'expiryDate',
    lastPaymentId: 'lastPaymentId',
    lastOrderId: 'lastOrderId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
];

let detectedSchema = null;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsToISODate(isoDateStr, months) {
  const s = String(isoDateStr).slice(0, 10);
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function detectSchema(sb) {
  if (detectedSchema) return { ok: true, schema: detectedSchema };

  let lastError = null;
  for (const schema of SCHEMAS) {
    const { error } = await sb.from(TABLE).select(schema.userId).limit(1);
    if (!error) {
      detectedSchema = schema;
      return { ok: true, schema };
    }
    lastError = error;
  }

  return {
    ok: false,
    error: lastError ? lastError.message : 'Unable to detect users table column names',
    schema: null,
  };
}

function normalizeUserRow(row, schema) {
  if (!row) return null;
  return {
    ...row,
    userId: row[schema.userId],
    amountPaid: row[schema.amountPaid],
    startDate: row[schema.startDate],
    expiryDate: row[schema.expiryDate],
    lastPaymentId: row[schema.lastPaymentId],
    lastOrderId: row[schema.lastOrderId],
    createdAt: row[schema.createdAt],
    updatedAt: row[schema.updatedAt],
  };
}

function mapPatchKeys(data, schema) {
  const src = data || {};
  const mapped = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'userId') mapped[schema.userId] = v;
    else if (k === 'amountPaid') mapped[schema.amountPaid] = v;
    else if (k === 'startDate') mapped[schema.startDate] = v;
    else if (k === 'expiryDate') mapped[schema.expiryDate] = v;
    else if (k === 'lastPaymentId') mapped[schema.lastPaymentId] = v;
    else if (k === 'lastOrderId') mapped[schema.lastOrderId] = v;
    else if (k === 'createdAt') mapped[schema.createdAt] = v;
    else if (k === 'updatedAt') mapped[schema.updatedAt] = v;
    else mapped[k] = v;
  }
  return mapped;
}

async function getUserById(userId) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured', data: null };
  const id = String(userId || '').trim();
  if (!id) return { ok: false, error: 'userId is required', data: null };
  const detected = await detectSchema(sb);
  if (!detected.ok) return { ok: false, error: detected.error, data: null };
  const schema = detected.schema;
  const { data, error } = await sb.from(TABLE).select('*').eq(schema.userId, id).maybeSingle();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, data: normalizeUserRow(data, schema) };
}

async function createUser(userId) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured', data: null };
  const id = String(userId || '').trim();
  if (!id) return { ok: false, error: 'userId is required', data: null };
  const detected = await detectSchema(sb);
  if (!detected.ok) return { ok: false, error: detected.error, data: null };
  const schema = detected.schema;
  const now = new Date().toISOString();
  const payload = {
    [schema.userId]: id,
    status: 'Pending',
    [schema.createdAt]: now,
    [schema.updatedAt]: now,
  };
  const { data, error } = await sb
    .from(TABLE)
    .insert(payload)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, data: normalizeUserRow(data, schema) };
}

async function updateUserDetails(userId, name, phone, email) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured', data: null };
  const id = String(userId || '').trim();
  if (!id) return { ok: false, error: 'userId is required', data: null };
  const detected = await detectSchema(sb);
  if (!detected.ok) return { ok: false, error: detected.error, data: null };
  const schema = detected.schema;
  const patch = {
    name: name ? String(name).trim() : null,
    phone: phone ? String(phone).trim() : null,
    email: email ? String(email).trim() : null,
    [schema.updatedAt]: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from(TABLE)
    .update(patch)
    .eq(schema.userId, id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, data: normalizeUserRow(data, schema) };
}

async function updatePayment(userId, data) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured', data: null };
  const id = String(userId || '').trim();
  if (!id) return { ok: false, error: 'userId is required', data: null };
  const detected = await detectSchema(sb);
  if (!detected.ok) return { ok: false, error: detected.error, data: null };
  const schema = detected.schema;
  const patch = {
    ...mapPatchKeys(data, schema),
    [schema.updatedAt]: new Date().toISOString(),
  };
  const { data: row, error } = await sb
    .from(TABLE)
    .update(patch)
    .eq(schema.userId, id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, data: normalizeUserRow(row, schema) };
}

/**
 * Subscription dates after a cryptographically verified payment (caller must verify Razorpay first).
 * If expiryDate exists and is after today: extend from current expiry; else new period from today.
 */
function subscriptionDatesAfterPayment(user, planMonths) {
  const today = todayISODate();
  const exp = user.expiryDate ? String(user.expiryDate).slice(0, 10) : null;

  let startDate;
  let expiryDate;
  if (exp && exp > today) {
    startDate = user.startDate ? String(user.startDate).slice(0, 10) : today;
    expiryDate = addMonthsToISODate(exp, planMonths);
  } else {
    startDate = today;
    expiryDate = addMonthsToISODate(today, planMonths);
  }
  return { startDate, expiryDate };
}

/**
 * Persist Paid status + subscription (only call after Razorpay signature verification).
 */
async function finalizeVerifiedPayment({
  userId,
  user,
  plan,
  amountPaid,
  lastPaymentId,
  lastOrderId,
  planMonths,
}) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  if (!user) return { ok: false, error: 'User not found' };

  const { startDate, expiryDate } = subscriptionDatesAfterPayment(user, planMonths);

  const save = await updatePayment(userId, {
    status: 'Paid',
    plan,
    amountPaid,
    startDate,
    expiryDate,
    lastPaymentId,
    lastOrderId,
  });

  if (!save.ok) return { ok: false, error: save.error };
  return { ok: true, startDate, expiryDate, plan };
}

async function listUsersStatus(userIdFilter) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured', rows: [] };
  const detected = await detectSchema(sb);
  if (!detected.ok) return { ok: false, error: detected.error, rows: [] };
  const schema = detected.schema;

  let q = sb.from(TABLE).select(`${schema.userId}, status, ${schema.expiryDate}`);
  if (userIdFilter) {
    q = q.eq(schema.userId, String(userIdFilter).trim());
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, rows: [] };
  const rows = (data || []).map((r) => ({
    userId: r[schema.userId],
    status: r.status,
    expiryDate: r[schema.expiryDate],
  }));
  return { ok: true, rows };
}

module.exports = {
  getUserById,
  createUser,
  updateUserDetails,
  updatePayment,
  finalizeVerifiedPayment,
  subscriptionDatesAfterPayment,
  listUsersStatus,
  todayISODate,
  addMonthsToISODate,
};
