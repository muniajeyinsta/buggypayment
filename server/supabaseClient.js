'use strict';

const { createClient } = require('@supabase/supabase-js');
const { env } = require('./utils/env');

let client;
let loggedConnection = false;

function getSupabase() {
  if (client !== undefined) return client;
  const url = env.supabaseUrl;
  const key = env.supabaseServiceRoleKey || env.supabaseAnonKey;
  if (!url || !key) {
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
      keyType: env.supabaseServiceRoleKey ? 'service_role' : 'anon',
      schema: 'public',
    });
  }
  return client;
}

function isSupabaseConfigured() {
  const url = env.supabaseUrl;
  const key = env.supabaseServiceRoleKey || env.supabaseAnonKey;
  return Boolean(url && key);
}

function isUsingServiceRole() {
  return Boolean(env.supabaseServiceRoleKey);
}

module.exports = { getSupabase, isSupabaseConfigured, isUsingServiceRole };
