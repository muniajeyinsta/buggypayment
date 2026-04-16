'use strict';

const { AppError } = require('./http');

/**
 * Rejects if `promise` does not settle within `ms`.
 * Does not cancel the underlying work (Supabase client has no AbortSignal in all paths).
 */
function withTimeout(promise, ms, timeoutMessage = 'Operation timed out') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new AppError(504, timeoutMessage));
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

module.exports = { withTimeout };
