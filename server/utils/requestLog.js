'use strict';

/**
 * Best-effort UID for structured logs (params win over body).
 */
function getUidForLog(request) {
  try {
    const p = request.params && request.params.uid;
    if (p != null && String(p).trim()) return String(p).trim();
    const b = request.body;
    if (b && typeof b === 'object') {
      const u = b.uid != null ? b.uid : b.userId;
      if (u != null && String(u).trim()) return String(u).trim();
    }
  } catch {
    // ignore
  }
  return undefined;
}

module.exports = { getUidForLog };
