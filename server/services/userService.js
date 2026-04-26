'use strict';

const { getSupabase, isSupabaseConfigured } = require('../supabaseClient');
const { withTimeout } = require('../utils/async');
const { env } = require('../utils/env');
const { AppError } = require('../utils/http');
const { PLAN_DURATION_MONTHS, PLAN_AMOUNT_INR } = require('../utils/constants');

const TABLE = 'users';
/** New Supabase layout (snake_case). Probed first; legacy schemas follow for older DBs. */
const SCHEMAS = [
  {
    id: 'user_id',
    status: 'status',
    expiry: 'expiry_date',
    name: 'name',
    phone: 'phone',
    email: 'email',
    apartment_name: 'apartment_name',
    tower: 'tower',
    floor: 'floor',
    flat_number: 'flat_number',
    plan: 'plan',
    amountPaid: 'amount_paid',
    startDate: 'start_date',
    createdAt: 'created_at',
    paymentId: 'last_payment_id',
    orderId: 'last_order_id',
    paidAt: null,
    updatedAt: 'updated_at',
    autoPay: 'auto_pay',
  },
  {
    id: 'userId',
    status: 'status',
    expiry: 'expiryDate',
    name: 'name',
    phone: 'phone',
    email: 'email',
    plan: 'plan',
    amountPaid: 'amountPaid',
    startDate: 'startDate',
    createdAt: 'createdAt',
    paymentId: 'lastPaymentId',
    orderId: 'lastOrderId',
    paidAt: null,
    updatedAt: 'updatedAt',
  },
  {
    id: 'id',
    status: 'status',
    expiry: 'valid_until',
    name: 'name',
    phone: 'phone',
    plan: null,
    createdAt: 'created_at',
    paymentId: 'last_payment_id',
    orderId: 'last_order_id',
    paidAt: 'paid_at',
    updatedAt: 'updated_at',
  },
];

const OPTIONAL_UPSERT_DETAIL_KEYS = [
  ['email', 'email'],
  ['apartment_name', 'apartment_name'],
  ['tower', 'tower'],
  ['floor', 'floor'],
  ['flat_number', 'flat_number'],
];

function omitUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

let detected = null;

function isPaidStatus(value) {
  return Boolean(value && String(value).trim().toLowerCase() === 'paid');
}

function addCalendarMonthsLocal(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/** API date-only string YYYY-MM-DD, or null if missing / invalid (never throws). */
function normalizeExpiryForApi(value) {
  try {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    const ymd = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const parts = ymd.split('-').map((n) => Number(n));
      const y = parts[0];
      const m = parts[1];
      const d = parts[2];
      if (!y || !m || !d) return null;
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
      return ymd;
    }
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const out = new Date(t);
    if (Number.isNaN(out.getTime())) return null;
    return out.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function computeNewExpiry(plan, currentStatus, currentExpiryStr) {
  const months = PLAN_DURATION_MONTHS[plan];
  if (!months) throw new AppError(400, 'Invalid plan duration');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let base = today;

  if (isPaidStatus(currentStatus) && currentExpiryStr != null && currentExpiryStr !== '') {
    const normalized = normalizeExpiryForApi(currentExpiryStr);
    if (normalized) {
      const cur = new Date(`${normalized}T12:00:00`);
      if (!Number.isNaN(cur.getTime())) {
        const curDay = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
        if (curDay > base) base = curDay;
      }
    }
  }

  const end = addCalendarMonthsLocal(base, months);
  return end.toISOString().slice(0, 10);
}

function logSupabaseError(action, error) {
  if (!error) return;
  console.error(`[supabase] ${action} failed`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

function toIsoTimestamp(value) {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return value.toISOString();
  const t = Date.parse(String(value));
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return String(value);
}

function paidResponseFromRow(data, schema, paidAtFallback) {
  const rawExpiry = data[schema.expiry];
  const validUntil = normalizeExpiryForApi(rawExpiry);
  if (rawExpiry != null && rawExpiry !== '' && validUntil == null) {
    console.warn('[payment] invalid_expiry_on_row');
  }
  const paidAtRaw =
    (schema.paidAt && data[schema.paidAt]) ||
    (schema.updatedAt && data[schema.updatedAt]) ||
    paidAtFallback;
  const paid_at = toIsoTimestamp(paidAtRaw);

  const statusStr = data[schema.status] != null ? String(data[schema.status]) : null;
  if (statusStr) {
    const sl = statusStr.toLowerCase();
    if (sl !== 'paid' && sl !== 'pending') {
      console.warn('[payment] unexpected_user_status_on_row', { status: statusStr });
    }
  }

  return {
    ok: true,
    status: statusStr,
    valid_until: validUntil,
    expiryDate: validUntil,
    ...(paid_at ? { paid_at } : {}),
  };
}

function selectFieldsForPaymentRead(schema) {
  const parts = [schema.status, schema.expiry];
  if (schema.paymentId) parts.push(schema.paymentId);
  if (schema.orderId) parts.push(schema.orderId);
  if (schema.paidAt) parts.push(schema.paidAt);
  if (schema.updatedAt) parts.push(schema.updatedAt);
  return parts.join(', ');
}

function selectFieldsForPaymentWrite(schema) {
  const parts = [schema.status, schema.expiry];
  if (schema.paymentId) parts.push(schema.paymentId);
  if (schema.orderId) parts.push(schema.orderId);
  if (schema.paidAt) parts.push(schema.paidAt);
  if (schema.updatedAt) parts.push(schema.updatedAt);
  return parts.join(', ');
}

async function probeOptionalPaidAtColumn(sb, baseSchema) {
  if (baseSchema.paidAt) return baseSchema;
  if (baseSchema.id !== 'userId') return baseSchema;
  const probe = sb.from(TABLE).select('paidAt').limit(1);
  const { error } = await withTimeout(probe, env.dbReadTimeoutMs, 'paidAt column probe timed out');
  if (error) return baseSchema;
  return { ...baseSchema, paidAt: 'paidAt' };
}

async function detectSchema() {
  if (detected) return detected;
  const sb = getSupabase();
  if (!sb) throw new AppError(503, 'Database not configured');

  for (const schema of SCHEMAS) {
    const probe = sb
      .from(TABLE)
      .select(`${schema.id}, ${schema.status}, ${schema.expiry}`)
      .limit(1);
    const { error } = await withTimeout(probe, env.dbWriteTimeoutMs, 'Database schema probe timed out');
    if (!error) {
      const resolved = await probeOptionalPaidAtColumn(sb, schema);
      detected = resolved;
      return resolved;
    }
  }

  throw new AppError(500, 'Users table not found in database');
}

/**
 * Safe GET /user payload: always string userId (from row or uid), status defaults to Pending,
 * valid_until YYYY-MM-DD or null. Logs edge cases with console.warn.
 */
function finalizeUserStatusResponse(uid, input) {
  const uidStr = uid != null && String(uid).trim() !== '' ? String(uid).trim() : '';
  if (!input || typeof input !== 'object') {
    console.warn('[user_status] unexpected_data_format', { user_id: uidStr || null });
    return {
      userId: uidStr || null,
      status: 'Pending',
      valid_until: null,
    };
  }

  const userId =
    input.userId != null && String(input.userId).trim() !== ''
      ? String(input.userId).trim()
      : uidStr || null;

  const status =
    input.status != null && String(input.status).trim() !== ''
      ? String(input.status).trim()
      : 'Pending';

  const rawExpiryInput = input.valid_until;
  const valid_until = normalizeExpiryForApi(rawExpiryInput);

  const sl = status.toLowerCase();
  if (sl !== 'paid' && sl !== 'pending') {
    console.warn('[user_status] unexpected_status', { user_id: userId, status });
  }
  if (rawExpiryInput != null && rawExpiryInput !== '' && valid_until == null) {
    console.warn('[user_status] invalid_expiry', { user_id: userId });
  }
  if (isPaidStatus(status) && valid_until == null) {
    console.warn('[user_status] paid_missing_expiry', { user_id: userId });
  }

  return { userId, status, valid_until };
}

async function getUserStatus(uid) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();

  const rowQuery = sb
    .from(TABLE)
    .select(`${schema.id}, ${schema.status}, ${schema.expiry}`)
    .eq(schema.id, uid)
    .maybeSingle();
  const { data, error } = await withTimeout(
    rowQuery,
    env.dbReadTimeoutMs,
    'User lookup timed out',
  );

  if (error) {
    logSupabaseError('fetch user status', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to fetch user status');
  }
  if (!data) throw new AppError(404, 'User not found');

  const rowId = data[schema.id];
  const userIdFromRow =
    rowId != null && String(rowId).trim() !== '' ? String(rowId).trim() : String(uid);
  return finalizeUserStatusResponse(uid, {
    userId: userIdFromRow,
    status: data[schema.status],
    valid_until: data[schema.expiry],
  });
}

async function upsertUserForOrder(uid, details = {}) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();

  const userKey = schema.id;
  const userIdValue = String(uid == null ? '' : uid).trim();
  if (!userIdValue) throw new AppError(400, 'uid is required');

  const payload = {
    [userKey]: userIdValue,
    [schema.name]: details.name ? String(details.name).trim() : null,
    [schema.phone]: details.phone ? String(details.phone).trim() : null,
    [schema.status]: 'Pending',
  };

  if (schema.plan && details.plan) {
    payload[schema.plan] = String(details.plan).trim();
  }

  if (schema.amountPaid && details.plan) {
    const amt = PLAN_AMOUNT_INR[String(details.plan).trim()];
    if (amt != null) payload[schema.amountPaid] = amt;
  }

  if (schema.orderId && details.razorpay_order_id) {
    const oid = String(details.razorpay_order_id).trim();
    if (oid) payload[schema.orderId] = oid;
  }

  if (schema.updatedAt) {
    payload[schema.updatedAt] = new Date().toISOString();
  }

  for (const [schemaKey, detailKey] of OPTIONAL_UPSERT_DETAIL_KEYS) {
    const col = schema[schemaKey];
    if (!col) continue;
    const raw = details[detailKey];
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (trimmed) payload[col] = trimmed;
  }

  const cleanPayload = omitUndefined(payload);

  const upsert = sb
    .from(TABLE)
    .upsert(cleanPayload, { onConflict: userKey, ignoreDuplicates: false });
  const { error } = await withTimeout(upsert, env.dbWriteTimeoutMs, 'Database write timed out');

  if (error) {
    console.error('DB ERROR:', error);
    logSupabaseError('upsert user for order', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to save order against user');
  }
}

async function markPaymentPaid(uid, orderId, paymentId, plan) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();

  const readQuery = sb
    .from(TABLE)
    .select(selectFieldsForPaymentRead(schema))
    .eq(schema.id, uid)
    .maybeSingle();
  const { data: existing, error: readErr } = await withTimeout(
    readQuery,
    env.dbReadTimeoutMs,
    'User lookup timed out',
  );

  if (readErr) {
    logSupabaseError('read user before payment', readErr);
    if (readErr.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to load user');
  }
  if (!existing) throw new AppError(404, 'User not found');

  if (schema.paymentId && existing[schema.paymentId] != null) {
    const prior = String(existing[schema.paymentId]);
    if (prior === String(paymentId)) {
      return paidResponseFromRow(existing, schema);
    }
  }

  const paidAtIso = new Date().toISOString();
  const validUntil = computeNewExpiry(plan, existing[schema.status], existing[schema.expiry]);

  const patch = {
    [schema.status]: 'Paid',
    [schema.expiry]: validUntil,
  };

  if (schema.paymentId) patch[schema.paymentId] = paymentId;
  if (schema.orderId) patch[schema.orderId] = orderId;
  if (schema.paidAt) patch[schema.paidAt] = paidAtIso;
  if (schema.updatedAt) patch[schema.updatedAt] = paidAtIso;
  if (schema.plan) patch[schema.plan] = plan;

  const updateQuery = sb
    .from(TABLE)
    .update(patch)
    .eq(schema.id, uid)
    .select(selectFieldsForPaymentWrite(schema))
    .maybeSingle();
  const { data, error } = await withTimeout(updateQuery, env.dbWriteTimeoutMs, 'Database write timed out');

  if (error) {
    logSupabaseError('mark payment paid', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to update payment status');
  }
  if (!data) throw new AppError(404, 'User not found');

  console.info('[payment] user_db_updated', {
    user_id: uid,
    status: data[schema.status],
  });

  return paidResponseFromRow(data, schema, paidAtIso);
}

/**
 * Record a UPI payment with the user-submitted transaction ID.
 * Marks the user as "Paid" and computes expiry.
 * Admin can later verify the transaction ID in the admin panel.
 */
async function markUpiPaymentPending(uid, upiTransactionId, plan) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();

  const readQuery = sb
    .from(TABLE)
    .select(selectFieldsForPaymentRead(schema))
    .eq(schema.id, uid)
    .maybeSingle();
  const { data: existing, error: readErr } = await withTimeout(
    readQuery,
    env.dbReadTimeoutMs,
    'User lookup timed out',
  );

  if (readErr) {
    logSupabaseError('read user before UPI payment', readErr);
    if (readErr.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to load user');
  }
  if (!existing) throw new AppError(404, 'User not found');

  const paidAtIso = new Date().toISOString();
  const validUntil = computeNewExpiry(plan, existing[schema.status], existing[schema.expiry]);

  const patch = {
    [schema.status]: 'Paid',
    [schema.expiry]: validUntil,
  };

  // Store UPI transaction ID in payment ID field
  if (schema.paymentId) patch[schema.paymentId] = `UPI:${upiTransactionId}`;
  if (schema.orderId) patch[schema.orderId] = `UPI_MANUAL:${upiTransactionId}`;
  if (schema.paidAt) patch[schema.paidAt] = paidAtIso;
  if (schema.updatedAt) patch[schema.updatedAt] = paidAtIso;
  if (schema.plan) patch[schema.plan] = plan;

  const updateQuery = sb
    .from(TABLE)
    .update(patch)
    .eq(schema.id, uid)
    .select(selectFieldsForPaymentWrite(schema))
    .maybeSingle();
  const { data, error } = await withTimeout(updateQuery, env.dbWriteTimeoutMs, 'Database write timed out');

  if (error) {
    logSupabaseError('mark UPI payment', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to update payment status');
  }
  if (!data) throw new AppError(404, 'User not found');

  console.info('[payment] upi_payment_recorded', {
    user_id: uid,
    upi_txn_id: upiTransactionId,
    status: data[schema.status],
    valid_until: validUntil,
  });

  return paidResponseFromRow(data, schema, paidAtIso);
}

async function debugUsersSample() {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();
  const query = sb
    .from(TABLE)
    .select(`${schema.id}, ${schema.status}, ${schema.expiry}`)
    .limit(1);
  const { data, error } = await withTimeout(query, env.dbReadTimeoutMs, 'Users debug query timed out');
  if (error) {
    logSupabaseError('debug users sample', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to query users table');
  }
  return {
    ok: true,
    rows: data || [],
  };
}

module.exports = {
  getUserStatus,
  upsertUserForOrder,
  markPaymentPaid,
  markUpiPaymentPending,
  debugUsersSample,
  finalizeUserStatusResponse,
};
