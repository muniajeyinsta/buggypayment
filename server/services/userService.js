'use strict';

const { getSupabase, isSupabaseConfigured } = require('../supabaseClient');
const { withTimeout } = require('../utils/async');
const { env } = require('../utils/env');
const { AppError } = require('../utils/http');

const TABLE = 'users';
const SCHEMAS = [
  // Preferred production schema (matches migration + indexing guidance)
  {
    id: 'userId',
    status: 'status',
    expiry: 'expiryDate',
    name: 'name',
    phone: 'phone',
    createdAt: 'createdAt',
  },
  // Alternate schema (supported for backward compatibility)
  {
    id: 'id',
    status: 'status',
    expiry: 'valid_until',
    name: 'name',
    phone: 'phone',
    createdAt: 'created_at',
  },
];

let detected = null;

function toDate30DaysFromNow() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 30);
  return dt.toISOString().slice(0, 10);
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
      detected = schema;
      return schema;
    }
  }

  // If we got here, the table exists but columns are mismatched OR table is missing.
  // Use one canonical message for the frontend.
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

  const upsert = sb.from(TABLE).upsert(payload, { onConflict: schema.id, ignoreDuplicates: false });
  const { error } = await withTimeout(upsert, env.dbWriteTimeoutMs, 'Database write timed out');

  if (error) {
    logSupabaseError('upsert user for order', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to save order against user');
  }
}

async function markPaymentPaid(uid, orderId, paymentId) {
  if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
  const sb = getSupabase();
  const schema = await detectSchema();
  const validUntil = toDate30DaysFromNow();

  const patch = {
    [schema.status]: 'Paid',
    [schema.expiry]: validUntil,
  };

  const updateQuery = sb
    .from(TABLE)
    .update(patch)
    .eq(schema.id, uid)
    .select(`${schema.status}, ${schema.expiry}`)
    .maybeSingle();
  const { data, error } = await withTimeout(updateQuery, env.dbWriteTimeoutMs, 'Database write timed out');

  if (error) {
    logSupabaseError('mark payment paid', error);
    if (error.code === '42P01') throw new AppError(500, 'Users table not found in database');
    throw new AppError(502, 'Failed to update payment status');
  }
  if (!data) throw new AppError(404, 'User not found');

  return {
    status: data[schema.status],
    valid_until: data[schema.expiry],
    // Backward-compatible field for existing frontend
    expiryDate: data[schema.expiry],
  };
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
