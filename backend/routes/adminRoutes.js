'use strict';

const { getSupabase, isSupabaseConfigured } = require('../supabaseClient');
const { AppError } = require('../utils/http');

const TABLE = 'users';
const REQUIRED_CREATE_FIELDS = [
  'user_id',
  'name',
  'phone',
  'apartment_name',
  'tower',
  'floor',
  'flat_number',
];

function requireNonEmptyString(value, fieldName) {
  const str = String(value ?? '').trim();
  if (!str) {
    throw new AppError(400, `${fieldName} is required`);
  }
  return str;
}

function ensureDbConfigured() {
  if (!isSupabaseConfigured()) {
    throw new AppError(503, 'Database not configured');
  }
  const supabase = getSupabase();
  if (!supabase) {
    throw new AppError(503, 'Database not configured');
  }
  return supabase;
}

function buildUpdatePayload(body) {
  const status = body.status != null ? String(body.status).trim() : undefined;
  const expiryDate = body.expiryDate != null ? String(body.expiryDate).trim() : undefined;
  const plan = body.plan != null ? String(body.plan).trim() : undefined;
  const amountPaidRaw = body.amountPaid;

  const payload = {};
  if (status) payload.status = status;
  if (expiryDate) payload.expiry_date = expiryDate;
  if (plan) payload.plan = plan;

  if (amountPaidRaw !== undefined) {
    const amountPaid =
      typeof amountPaidRaw === 'number' ? amountPaidRaw : Number(String(amountPaidRaw).trim());
    if (Number.isNaN(amountPaid)) {
      throw new AppError(400, 'amountPaid must be a number');
    }
    payload.amount_paid = amountPaid;
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError(400, 'At least one updatable field is required');
  }

  return payload;
}

async function adminRoutes(app) {
  app.get('/admin/users', async (_request, reply) => {
    const supabase = ensureDbConfigured();
    const { data, error } = await supabase.from(TABLE).select('*').limit(100);

    if (error) {
      throw new AppError(502, 'Failed to fetch users', error.message);
    }

    return reply.send(data || []);
  });

  app.get('/admin/user/:id', async (request, reply) => {
    const supabase = ensureDbConfigured();
    const id = requireNonEmptyString(request.params.id, 'id');

    const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', id).maybeSingle();

    if (error) {
      throw new AppError(502, 'Failed to fetch user', error.message);
    }
    if (!data) {
      throw new AppError(404, 'User not found');
    }

    return reply.send(data);
  });

  app.post('/admin/update-user', async (request, reply) => {
    const supabase = ensureDbConfigured();
    const body = request.body || {};
    const userId = requireNonEmptyString(body.userId, 'userId');
    const payload = buildUpdatePayload(body);

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new AppError(502, 'Failed to update user', error.message);
    }
    if (!data) {
      throw new AppError(404, 'User not found');
    }

    return reply.send(data);
  });

  app.post('/admin/create-user', async (request, reply) => {
    const supabase = ensureDbConfigured();
    const body = request.body || {};

    const user = {};
    for (const field of REQUIRED_CREATE_FIELDS) {
      user[field] = requireNonEmptyString(body[field], field);
    }

    const { data, error } = await supabase.from(TABLE).insert(user).select('*').maybeSingle();

    if (error) {
      throw new AppError(502, 'Failed to create user', error.message);
    }

    return reply.status(201).send(data);
  });
}

module.exports = adminRoutes;
