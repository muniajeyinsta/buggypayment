'use strict';

const { createClient } = require('@supabase/supabase-js');
const { env } = require('./utils/env');

let client;
let loggedConnection = false;
let loggedMissingConfig = false;

function getSupabase() {
  if (client !== undefined) return client;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    if (!loggedMissingConfig) {
      loggedMissingConfig = true;
      console.error(
        '[supabase] missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    client = null;
    return null;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!loggedConnection) {
    loggedConnection = true;
    let urlLog = url;
    if (env.isProduction) {
      try {
        urlLog = new URL(url).host;
      } catch {
        urlLog = '(invalid SUPABASE_URL)';
      }
    }
    console.log('[supabase] client initialized', {
      url: urlLog,
      keyType: 'service_role',
      schema: 'public',
    });
  }
  return client;
}

function isSupabaseConfigured() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return Boolean(url && key);
}

function isUsingServiceRole() {
  return Boolean(env.supabaseServiceRoleKey);
}

module.exports = { getSupabase, isSupabaseConfigured, isUsingServiceRole };
