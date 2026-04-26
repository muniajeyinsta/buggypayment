'use strict';

/**
 * Hit a running server (default PORT 3000). Run: node scripts/verify-http.js
 */
const port = Number(process.env.PORT) || 3000;
const base = `http://127.0.0.1:${port}`;

async function check(method, path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { method });
  const text = await res.text();
  const bug = res.headers.get('x-buggy-backend');
  return { path, status: res.status, bug, body: text.slice(0, 300) };
}

async function main() {
  console.log(`Checking ${base} …\n`);
  const rows = await Promise.all([
    check('GET', '/'),
    check('GET', '/health'),
  ]);
  for (const r of rows) {
    console.log(`${r.path} → ${r.status}  X-Buggy-Backend=${r.bug ?? '(none)'}`);
    console.log(`  body: ${r.body}\n`);
  }
  const root = rows[0];
  const ok =
    root.status === 200 &&
    root.body.includes('"status":"running"') &&
    root.bug === '1';
  if (!ok) {
    console.error(
      'VERIFY FAILED: GET / must be 200, include "status":"running", and header X-Buggy-Backend: 1.',
    );
    console.error('If status is wrong or header missing, another app may own this port.');
    process.exit(1);
  }
  console.log('VERIFY OK — this looks like the Buggy Fastify backend.\n');
}

main().catch((err) => {
  console.error('VERIFY ERROR (is the server running?)', err.message);
  process.exit(1);
});
