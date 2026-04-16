'use strict';

const { TTLCache } = require('./cacheService');

const userStatusCache = new TTLCache({
  ttlMs: 15000,
  maxEntries: 5000,
});

module.exports = { userStatusCache };
