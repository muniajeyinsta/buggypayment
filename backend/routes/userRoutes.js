'use strict';

const { debugUsersSample, getUserStatus, finalizeUserStatusResponse } = require('../services/userService');
const { userStatusCache } = require('../services/userStatusCache');
const { normalizeUid } = require('../utils/validators');
const { env } = require('../utils/env');

async function userRoutes(app) {
  app.get('/debug/users', async (_request, reply) => {
    if (env.isProduction) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const result = await debugUsersSample();
    return reply.send(result);
  });

  app.get('/user/:uid', async (request, reply) => {
    const uid = normalizeUid(request.params.uid);

    request.log.info({ msg: 'user_status_lookup', user_id: uid });

    const cached = userStatusCache.get(uid);
    if (cached) return reply.send(finalizeUserStatusResponse(uid, cached));

    const userStatus = await getUserStatus(uid);
    userStatusCache.set(uid, userStatus);
    return reply.send(userStatus);
  });
}

module.exports = userRoutes;
