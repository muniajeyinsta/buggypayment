'use strict';

const path = require('path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const compress = require('@fastify/compress');
const rateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');
const { env } = require('./utils/env');
const { AppError } = require('./utils/http');
const { getUidForLog } = require('./utils/requestLog');
const { AVAILABLE_ROUTES } = require('./utils/routesManifest');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');

function buildServer() {
  const corsOrigin = env.corsOrigin
    ? env.corsOrigin.split(',').map((item) => item.trim()).filter(Boolean)
    : true;
  const publicDir = path.join(__dirname, '..', 'public');

  const app = Fastify({
    trustProxy: true,
    logger: { level: env.isProduction ? 'info' : 'debug' },
    disableRequestLogging: env.isProduction,
    requestTimeout: env.requestTimeoutMs,
    bodyLimit: 32 * 1024,
  });

  let loadLogCount = 0;
  app.addHook('onRequest', async (request) => {
    request._startedAt = Date.now();
    if (!env.isProduction) {
      console.log(`[req] ${request.method} ${request.url}`);
    }
    if (!env.isProduction && request.headers['x-load-test'] && loadLogCount < 3) {
      loadLogCount += 1;
      console.log('[load-test] request seen', { ip: request.ip });
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const pathOnly = String(request.url || '').split('?')[0];
    if (env.isProduction && (pathOnly === '/health' || pathOnly === '/api/health')) {
      return;
    }
    const responseTimeMs = request._startedAt ? Date.now() - request._startedAt : undefined;
    const uid = getUidForLog(request);
    const route = request.routerPath || pathOnly;
    request.log.info({
      msg: 'request_complete',
      method: request.method,
      route,
      uid,
      status: reply.statusCode,
      response_time_ms: responseTimeMs,
    });
  });

  app.register(compress, {
    global: true,
    threshold: 512,
  });

  app.register(cors, {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  });

  app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
    wildcard: false,
    index: false,
  });

  app.register(rateLimit, {
    global: true,
    max: env.isProduction ? env.rateLimitGlobalMax : Math.max(env.rateLimitGlobalMax, 5000),
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => {
      const err = new Error('Too many requests');
      err.statusCode = context.statusCode;
      err.retryAfter = context.after;
      return err;
    },
  });

  app.get('/', async (_request, reply) => {
    reply.header('X-Buggy-Backend', '1');
    return {
      status: 'running',
      message: 'Buggy backend API is live',
    };
  });

  app.get('/pay', async (_request, reply) => {
    reply.header('X-Buggy-Backend', '1');
    return reply.sendFile('pay.html');
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/health', async () => ({ ok: true }));

  app.register(paymentRoutes);
  app.register(userRoutes);

  app.setErrorHandler((error, request, reply) => {
    if (error.retryAfter != null && (error.statusCode === 429 || error.statusCode === 403)) {
      return reply.status(error.statusCode).send({
        error: 'Too many requests',
        retry_after: error.retryAfter,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({ error: 'Internal server error' });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: 'Route not found',
      available_routes: AVAILABLE_ROUTES,
    });
  });

  return app;
}

module.exports = { buildServer };
