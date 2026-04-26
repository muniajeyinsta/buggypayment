'use strict';

const fs = require('fs');
const path = require('path');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const compress = require('@fastify/compress');
const rateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');
const multipart = require('@fastify/multipart');
const { env } = require('./utils/env');
const { AppError } = require('./utils/http');
const { getUidForLog } = require('./utils/requestLog');
const { AVAILABLE_ROUTES } = require('./utils/routesManifest');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const upiRoutes = require('./routes/upiRoutes');

function buildServer() {
  const publicDir = path.join(__dirname, '..', 'public');
  const adminDistDir = path.join(__dirname, '..', 'admin', 'dist');
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const app = Fastify({
    trustProxy: true,
    logger: { level: env.isProduction ? 'info' : 'debug' },
    disableRequestLogging: env.isProduction,
    requestTimeout: env.requestTimeoutMs,
    bodyLimit: 10 * 1024 * 1024, // 10 MB for screenshot uploads
  });

  app.addHook('onRequest', async (request) => {
    request._startedAt = Date.now();
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

  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB max screenshot
      files: 1,
    },
  });

  app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST'],
  });

  app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
    wildcard: true,
    index: false,
  });

  if (fs.existsSync(adminDistDir)) {
    app.register(fastifyStatic, {
      root: adminDistDir,
      prefix: '/admin/',
      wildcard: false,
      decorateReply: false,
      index: false,
    });

    app.get('/admin', async (_request, reply) => {
      return reply.sendFile('index.html', adminDistDir);
    });

    app.get('/admin/*', async (request, reply) => {
      const urlPath = String(request.url || '').split('?')[0];
      if (
        urlPath === '/admin/users' ||
        urlPath.startsWith('/admin/user/') ||
        urlPath === '/admin/update-user' ||
        urlPath === '/admin/create-user'
      ) {
        return reply.callNotFound();
      }
      return reply.sendFile('index.html', adminDistDir);
    });
  } else if (!env.isProduction) {
    app.log.warn({ path: adminDistDir }, 'Admin panel static bundle not found; /admin UI is disabled');
  }

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
    return reply.sendFile('pay.html');
  });

  app.get('/pay', async (_request, reply) => {
    reply.header('X-Buggy-Backend', '1');
    return reply.sendFile('pay.html');
  });



  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/health', async () => ({ ok: true }));

  app.register(paymentRoutes);
  app.register(userRoutes);
  app.register(adminRoutes);
  app.register(upiRoutes);

  app.setErrorHandler((error, request, reply) => {
    if (error.retryAfter != null && (error.statusCode === 429 || error.statusCode === 403)) {
      return reply.status(error.statusCode).send({
        error: 'Too many requests',
        retry_after: error.retryAfter,
      });
    }

    if (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply.status(400).send({ error: 'Invalid JSON body' });
    }
    if (error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return reply.status(400).send({ error: 'Empty JSON body' });
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
