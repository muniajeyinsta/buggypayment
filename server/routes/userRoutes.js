'use strict';

const { debugUsersSample } = require('../services/userService');
const { userStatusCache } = require('../services/userStatusCache');
const { normalizeUid } = require('../utils/validators');
const { env } = require('../utils/env');
const { getSupabase, isSupabaseConfigured } = require('../supabaseClient');
const { withTimeout } = require('../utils/async');
const { AppError } = require('../utils/http');

function normalizeStatus(value) {
  const raw = value == null ? '' : String(value).trim().toLowerCase();
  if (raw === 'paid') return 'Paid';
  if (raw === 'expired') return 'Expired';
  return 'Pending';
}

function normalizeExpiryDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

async function userRoutes(app) {
  app.get('/debug/users', async (_request, reply) => {
    if (env.isProduction) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const result = await debugUsersSample();
    return reply.send(result);
  });

  app.get('/user/:uid', async (request, reply) => {
    const uid = normalizeUid(request.params.uid);

    request.log.info({ msg: 'user_status_lookup', user_id: uid });

    const cached = userStatusCache.get(uid);
    if (cached) return reply.send(cached);

    if (!isSupabaseConfigured()) throw new AppError(503, 'Database not configured');
    const sb = getSupabase();

    const query = sb
      .from('users')
      .select('name, status, expiry_date')
      .eq('user_id', uid)
      .maybeSingle();
    const { data, error } = await withTimeout(query, env.dbReadTimeoutMs, 'User lookup timed out');

    if (error) {
      request.log.error(
        {
          msg: 'user_lookup_failed',
          user_id: uid,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        error.message,
      );
      throw new AppError(502, 'Failed to fetch user');
    }

    if (!data) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const payload = {
      name: data.name == null ? '' : String(data.name),
      status: normalizeStatus(data.status),
      expiry_date: normalizeExpiryDate(data.expiry_date),
    };

    userStatusCache.set(uid, payload);
    return reply.send(payload);
  });
}

module.exports = userRoutes;
