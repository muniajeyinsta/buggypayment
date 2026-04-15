'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const { createClient } = require('@supabase/supabase-js');

let client;

/**
 * Server-side Supabase client. Prefer SUPABASE_SERVICE_ROLE_KEY in production (bypasses RLS).
 * Falls back to SUPABASE_ANON_KEY if set (ensure RLS policies allow required operations).
 */
function getSupabase() {
  if (client !== undefined) return client;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  ).trim();
  if (!url || !key) {
    client = null;
    return null;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function isSupabaseConfigured() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  ).trim();
  return Boolean(url && key);
}

module.exports = { getSupabase, isSupabaseConfigured };
