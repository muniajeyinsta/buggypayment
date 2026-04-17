'use strict';

const { getSupabase, isSupabaseConfigured } = require('../supabaseClient');
const { withTimeout } = require('../utils/async');
const { env } = require('../utils/env');
const { AppError } = require('../utils/http');
const { PLAN_DURATION_MONTHS } = require('../utils/constants');

const TABLE = 'users';
const SCHEMAS = [
  {
    id: 'userId',
    status: 'status',
    expiry: 'expiryDate',
    name: 'name',
    phone: 'phone',
    plan: 'plan',
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

let detected = null;

function addCalendarMonthsLocal(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function computeNewExpiry(plan, currentStatus, currentExpiryStr) {
  const months = PLAN_DURATION_MONTHS[plan];
  if (!months) throw new AppError(400, 'Invalid plan duration');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let base = today;

  if (currentStatus === 'Paid' && currentExpiryStr) {
    const raw = String(currentExpiryStr).slice(0, 10);
    const cur = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(cur.getTime())) {
      const curDay = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
      if (curDay > base) base = curDay;
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
  const validUntil = data[schema.expiry];
  const paidAtRaw =
    (schema.paidAt && data[schema.paidAt]) ||
    (schema.updatedAt && data[schema.updatedAt]) ||
    paidAtFallback;
  const paid_at = toIsoTimestamp(paidAtRaw);

  return {
    ok: true,
    status: data[schema.status],
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

async function getUserStatus(uid) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();

  const rowQuery = sb
    .from(TABLE)
    .select(`${schema.status}, ${schema.expiry}`)
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

  return {
    status: data[schema.status],
    valid_until: data[schema.expiry],
  };
}

async function upsertUserForOrder(uid, details = {}) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();

  const payload = {
    [schema.id]: uid,
    [schema.name]: details.name ? String(details.name).trim() : null,
    [schema.phone]: details.phone ? String(details.phone).trim() : null,
    [schema.status]: 'Pending',
  };

  if (schema.plan && details.plan) {
    payload[schema.plan] = String(details.plan).trim();
  }

  const upsert = sb.from(TABLE).upsert(payload, { onConflict: schema.id, ignoreDuplicates: false });
  const { error } = await withTimeout(upsert, env.dbWriteTimeoutMs, 'Database write timed out');

  if (error) {
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
  debugUsersSample,
};
