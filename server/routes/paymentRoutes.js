'use strict';

const { createOrder, verifySignature } = require('../services/paymentService');
const { markPaymentPaid } = require('../services/userService');
const { userStatusCache } = require('../services/userStatusCache');
const { AppError } = require('../utils/http');
const {
  normalizePlan,
  normalizeUid,
  requireRazorpayId,
  requireRazorpaySignature,
} = require('../utils/validators');
const { env } = require('../utils/env');

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
      const body = request.body || {};
      const uid = normalizeUid(body.uid || body.userId);
      const plan = normalizePlan(body.plan);
      const order = await createOrder({
        uid,
        plan,
        name: body.name,
        phone: body.phone,
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
      const body = request.body || {};
      const uid = normalizeUid(body.uid || body.userId);
      const orderId = requireRazorpayId(body.razorpay_order_id, 'razorpay_order_id');
      const paymentId = requireRazorpayId(body.razorpay_payment_id, 'razorpay_payment_id');
      const signature = requireRazorpaySignature(body.razorpay_signature);

      const verified = verifySignature({ orderId, paymentId, signature });
      if (!verified) throw new AppError(400, 'Invalid payment signature');

      const updated = await markPaymentPaid(uid, orderId, paymentId);
      userStatusCache.del(uid);

      return reply.send({
        verified: true,
        status: updated.status,
        valid_until: updated.valid_until,
      });
    },
  );
}

module.exports = paymentRoutes;
