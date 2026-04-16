'use strict';

const { debugUsersSample, getUserStatus } = require('../services/userService');
const { userStatusCache } = require('../services/userStatusCache');
const { normalizeUid } = require('../utils/validators');

async function userRoutes(app) {
  app.get('/debug/users', async (_request, reply) => {
    const result = await debugUsersSample();
    return reply.send(result);
  });

  app.get('/user/:uid', async (request, reply) => {
    const uid = normalizeUid(request.params.uid);

    const cached = userStatusCache.get(uid);
    if (cached) return reply.send(cached);

    const userStatus = await getUserStatus(uid);
    userStatusCache.set(uid, userStatus);
    return reply.send(userStatus);
  });
}

module.exports = userRoutes;
