'use strict';

function readEnv(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

const env = {
  nodeEnv: readEnv('NODE_ENV', 'development'),
  isProduction: readEnv('NODE_ENV', 'development') === 'production',
  port: Number(readEnv('PORT', '3000')) || 3000,
  corsOrigin: readEnv('CORS_ORIGIN', ''),
  /** Hard cap for inbound HTTP handling (Razorpay needs headroom). */
  requestTimeoutMs: Number(readEnv('REQUEST_TIMEOUT_MS', '12000')) || 12000,
  /** Fast-fail for hot-path user status DB read. */
  dbReadTimeoutMs: Number(readEnv('DB_READ_TIMEOUT_MS', '2000')) || 2000,
  /** Writes / payment-related DB paths. */
  dbWriteTimeoutMs: Number(readEnv('DB_WRITE_TIMEOUT_MS', '8000')) || 8000,
  rateLimitGlobalMax: Number(readEnv('RATE_LIMIT_GLOBAL_MAX', '100')) || 100,
  /** Per-IP cap on payment endpoints (create-order + verify-payment share this budget). */
  rateLimitPaymentMax: Number(readEnv('RATE_LIMIT_PAYMENT_MAX', '15')) || 15,
  razorpayKeyId: readEnv('RAZORPAY_KEY_ID'),
  razorpayKeySecret: readEnv('RAZORPAY_KEY_SECRET'),
  supabaseUrl: readEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseAnonKey: readEnv('SUPABASE_ANON_KEY'),
};

function hasSupabaseConfig() {
  return Boolean(env.supabaseUrl && (env.supabaseServiceRoleKey || env.supabaseAnonKey));
}

function hasRazorpayConfig() {
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

/**
 * Warn on missing optional config so the process still starts (DB/payment routes may 503).
 */
function logStartupConfigWarnings() {
  const lines = [];
  if (!hasSupabaseConfig()) {
    lines.push('Supabase is not configured (SUPABASE_URL + key) — user/payment DB calls will fail until set.');
  }
  if (!hasRazorpayConfig()) {
    lines.push('Razorpay is not configured (RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET) — create-order/verify will fail until set.');
  }
  if (lines.length === 0) return;
  console.warn('\n[config] Missing or incomplete environment (server is still running):\n');
  for (const line of lines) {
    console.warn(`  • ${line}`);
  }
  console.warn('');
}

module.exports = { env, hasSupabaseConfig, hasRazorpayConfig, logStartupConfigWarnings };
