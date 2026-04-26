'use strict';

const fs = require('fs');
const path = require('path');

/** Session log for local debugging (no secrets). */
const DEBUG_LOG = path.join(__dirname, '..', 'debug-f54440.log');

/**
 * One-shot boot snapshot: console + append NDJSON for support / CI checks.
 */
function logStartupDiagnostics(payload) {
  const line = JSON.stringify({
    sessionId: 'f54440',
    timestamp: Date.now(),
    ...payload,
  });
  console.log('\n[diagnostics] server boot snapshot');
  console.log(line);
  try {
    fs.appendFileSync(DEBUG_LOG, `${line}\n`);
  } catch {
    // ignore
  }
}

module.exports = { logStartupDiagnostics, DEBUG_LOG };
