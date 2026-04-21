'use strict';

/** Public API paths (for docs + 404 helper). */
const AVAILABLE_ROUTES = [
  '/',
  '/health',
  '/user/:uid',
  '/create-order',
  '/verify-payment',
  '/debug/users',
  '/admin/users',
  '/admin/user/:id',
  '/admin/update-user',
  '/admin/create-user',
];

module.exports = { AVAILABLE_ROUTES };
