'use strict';

const { createOrder, verifySignature, assertPaidOrderMatchesUser } = require('../services/paymentService');
const { markPaymentPaid } = require('../services/userService');
const { userStatusCache } = require('../services/userStatusCache');
const { AppError } = require('../utils/http');
const {
  normalizeUid,
  requirePlan,
  requireRazorpayId,
  requireRazorpaySignature,
  sanitizeName,
  sanitizePhone,
} = require('../utils/validators');
const { env } = require('../utils/env');

function optionalBodyString(value) {
  const s = String(value == null ? '' : value).trim();
  return s || undefined;
}

const paymentRateLimit = {
  max: env.rateLimitPaymentMax,
  timeWindow: '1 minute',
};

async function paymentRoutes(app) {
  app.post(
    '/create-order',
    {
      config: {
        rateLimit: paymentRateLimit,
      },
    },
    async (request, reply) => {
      const t0 = Date.now();
      const body = request.body || {};
      const uid = normalizeUid(body.uid || body.userId);
      const plan = requirePlan(body.plan);
      const name = sanitizeName(body.name);
      const phone = sanitizePhone(body.phone);
      const email = optionalBodyString(body.email);
      const apartment_name = optionalBodyString(body.apartment_name);
      const tower = optionalBodyString(body.tower);
      const floor = optionalBodyString(body.floor);
      const flat_number = optionalBodyString(body.flat_number);

      const order = await createOrder({
        uid,
        plan,
        name,
        phone,
        email,
        apartment_name,
        tower,
        floor,
        flat_number,
      });
      request.log.info({
        msg: 'payment_order_created',
        uid,
        plan,
        order_id: order.order_id,
        timestamp: new Date().toISOString(),
        response_time_ms: Date.now() - t0,
      });
      return reply.send(order);
    },
  );

  app.post(
    '/verify-payment',
    {
      config: {
        rateLimit: paymentRateLimit,
      },
    },
    async (request, reply) => {
      const t0 = Date.now();
      const body = request.body || {};
      const uid = normalizeUid(body.uid || body.userId);
      const plan = requirePlan(body.plan);
      const orderId = requireRazorpayId(body.razorpay_order_id, 'razorpay_order_id');
      const paymentId = requireRazorpayId(body.razorpay_payment_id, 'razorpay_payment_id');
      const signature = requireRazorpaySignature(body.razorpay_signature);

      const signatureOk = verifySignature({ orderId, paymentId, signature });
      if (!signatureOk) throw new AppError(400, 'Invalid payment signature');

      await assertPaidOrderMatchesUser({ orderId, uid, plan });

      const updated = await markPaymentPaid(uid, orderId, paymentId, plan);
      userStatusCache.del(uid);

      request.log.info({
        msg: 'payment_succeeded',
        uid,
        payment_id: paymentId,
        order_id: orderId,
        plan,
        timestamp: new Date().toISOString(),
        status: updated.status,
        response_time_ms: Date.now() - t0,
      });

      return reply.send({
        ...updated,
        verified: true,
      });
    },
  );
}

module.exports = paymentRoutes;
