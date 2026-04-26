'use strict';

/**
 * Very simple local load check for the hot path:
 * - starts N concurrent GET /user/:uid requests against BASE_URL
 *
 * Usage (Windows cmd):
 *   set BASE_URL=http://127.0.0.1:3000&& node scripts/load-user-lookup.js
 *
 * Optional env:
 *   CONCURRENCY=1000
 *   UID=A001
 */

const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:3000').trim();
const concurrency = Number(process.env.CONCURRENCY || '1000') || 1000;
const uid = String(process.env.UID || 'A001').trim();

// Increase HTTP client pool for high concurrency tests (Node fetch uses Undici).
try {
  // eslint-disable-next-line global-require
  const { Agent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(
    new Agent({
      connections: Math.max(50, Math.min(2000, concurrency)),
      pipelining: 1,
    }),
  );
} catch {
  // ignore: still run with default dispatcher
}

async function one(i) {
  const url = `${baseUrl}/user/${encodeURIComponent(uid)}?n=${i}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { 'x-load-test': '1' } });
  const text = await res.text();
  const ms = Date.now() - t0;
  return { ok: res.ok, status: res.status, ms, text: text.slice(0, 200) };
}

async function main() {
  console.log(`BASE_URL=${baseUrl}`);
  console.log(`CONCURRENCY=${concurrency}`);
  console.log(`UID=${uid}`);

  const t0 = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, (_, i) => one(i)),
  );
  const msTotal = Date.now() - t0;

  const oks = [];
  const non2xx = [];
  const rejected = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.ok) oks.push(r.value);
      else non2xx.push(r.value);
    } else {
      rejected.push(r.reason);
    }
  }

  const lat = oks.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => (lat.length ? lat[Math.floor(q * (lat.length - 1))] : null);
  const histogram = new Map();
  for (const r of oks) histogram.set(r.status, (histogram.get(r.status) || 0) + 1);
  for (const r of non2xx) histogram.set(r.status, (histogram.get(r.status) || 0) + 1);

  console.log('');
  console.log(`Total time: ${msTotal}ms`);
  console.log(`OK: ${oks.length}/${concurrency}`);
  console.log(`Non-2xx: ${non2xx.length}/${concurrency}`);
  console.log(`Rejected: ${rejected.length}/${concurrency}`);
  console.log(`p50: ${p(0.5)}ms  p95: ${p(0.95)}ms  p99: ${p(0.99)}ms`);
  console.log('Status histogram:', Object.fromEntries([...histogram.entries()].sort((a, b) => a[0] - b[0])));

  if (non2xx.length || rejected.length) {
    console.log('');
    console.log('Sample non-2xx responses (first 3):');
    for (const s of non2xx.slice(0, 3)) {
      console.log(`${s.status} ${s.ms}ms ${s.text}`);
    }
    console.log('Sample rejected errors (first 3):');
    for (const e of rejected.slice(0, 3)) {
      console.log(String(e && e.message ? e.message : e).slice(0, 200));
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('load-user-lookup error:', err.message);
  process.exit(1);
});

