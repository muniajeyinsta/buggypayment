'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'FOUND' : 'MISSING');
console.log(
  'SUPABASE_KEY:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'FOUND' : 'MISSING',
);

const { buildServer } = require('./app');
const { env, logStartupConfigWarnings, hasSupabaseConfig, hasRazorpayConfig } = require('./utils/env');
const { logStartupDiagnostics } = require('./utils/startupDiagnostics');

function logStartupBanner(port, requestedPort) {
  if (!env.isProduction && port !== requestedPort) {
    console.log('\n  >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    console.log(`  >>>  USE THIS SERVER:  http://localhost:${port}/`);
    console.log(`  >>>  DO NOT USE:       http://localhost:${requestedPort}/`);
    console.log(
      '  >>>  (That port may still be an OLD app showing {"error":"Not found"}.)',
    );
    console.log('  >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n');
  }

  const base = env.isProduction ? `http://0.0.0.0:${port}` : `http://localhost:${port}`;
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Buggy backend — server ready');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Listen  ${base}  (process.env.PORT=${env.port})`);
  console.log('  Routes');
  console.log(`    GET   /`);
  console.log(`    GET   /health`);
  console.log(`    GET   /user/:uid`);
  console.log(`    GET   /debug/users`);
  console.log(`    POST  /create-order`);
  console.log(`    POST  /verify-payment`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  PID     ${process.pid} (this terminal owns the server process)`);
  console.log('  Tip     PowerShell: npm.cmd start   OR   node index.js');
  if (process.platform === 'win32') {
    console.log('  Win     From repo root: start-local.cmd  (frees :3000, then starts)');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function maybeOpenBrowserInDev(boundPort) {
  if (env.isProduction) return;
  if (String(process.env.BUGGY_OPEN_BROWSER || '').trim() !== '1') return;
  const url = `http://127.0.0.1:${boundPort}/`;
  const { exec } = require('child_process');
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.warn('[dev] BUGGY_OPEN_BROWSER: could not open:', err.message);
    } else {
      console.log('[dev] Opened browser:', url);
    }
  });
}

/**
 * Production: bind exactly env.port (Railway sets PORT).
 * Development: if that port is busy, try the next few ports so a stale Node on :3001 does not block you.
 */
async function listenOrDevFallback(app) {
  const start = env.port;
  const maxAttempts = env.isProduction ? 1 : 5;
  let lastErr;
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = start + i;
    try {
      await app.listen({ host: '0.0.0.0', port });
      return port;
    } catch (e) {
      lastErr = e;
      if (e && e.code === 'EADDRINUSE' && i < maxAttempts - 1) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function start() {
  const app = buildServer();
  try {
    const boundPort = await listenOrDevFallback(app);
    process.env.PORT = String(boundPort);
    logStartupConfigWarnings();
    logStartupBanner(boundPort, env.port);
    logStartupDiagnostics({
      event: 'server_listen_ok',
      pid: process.pid,
      port: boundPort,
      requestedPort: env.port,
      cwd: process.cwd(),
      node: process.version,
      supabaseConfigured: hasSupabaseConfig(),
      razorpayConfigured: hasRazorpayConfig(),
      verifyCmd:
        process.platform === 'win32'
          ? `set PORT=${boundPort}&& node ${path.join('scripts', 'verify-http.js')}`
          : `PORT=${boundPort} node ${path.join('scripts', 'verify-http.js')}`,
    });
    maybeOpenBrowserInDev(boundPort);
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(`  Could not bind port ${env.port} (and dev fallbacks failed).`);
      console.error(
        '  Another process is serving that port (often an OLD Node server).',
      );
      console.error('  Your browser may show {"error":"Not found"} from that old app.');
      console.error('\n  Fix (Windows Command Prompt):');
      console.error(`    netstat -ano | findstr :${env.port}`);
      console.error('    taskkill /PID <pid_from_last_column> /F');
      console.error('\n  Or set a free port:');
      console.error('    set PORT=3002 && node index.js');
      if (process.platform === 'win32') {
        console.error('\n  Or run from repo root (frees :3000 then starts):');
        console.error('    start-local.cmd');
      }
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
