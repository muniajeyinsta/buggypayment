'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const { env, hasRazorpayConfig } = require('../utils/env');
const { AppError } = require('../utils/http');
const { PLAN_AMOUNT_INR } = require('../utils/constants');
const { upsertUserForOrder } = require('./userService');

const razorpay = hasRazorpayConfig()
  ? new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret,
    })
  : null;

function getAmountPaise(plan) {
  const amountInr = PLAN_AMOUNT_INR[plan];
  if (!amountInr) throw new AppError(400, 'Unsupported plan');
  return amountInr * 100;
}

function buildReceipt(uid) {
  return `uid_${uid}_${Date.now()}`.slice(0, 40);
}

async function createOrder({ uid, plan, name, phone }) {
  if (!razorpay) throw new AppError(503, 'Payments are not configured');

  let order;
  try {
    order = await razorpay.orders.create({
      amount: getAmountPaise(plan),
      currency: 'INR',
      receipt: buildReceipt(uid),
      notes: { uid, plan },
    });
  } catch {
    throw new AppError(502, 'Failed to create Razorpay order');
  }

  await upsertUserForOrder(uid, { name, phone });

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: env.razorpayKeyId,
  };
}

function verifySignature({ orderId, paymentId, signature }) {
  if (!env.razorpayKeySecret) throw new AppError(503, 'Payments are not configured');
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(payload)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  createOrder,
  verifySignature,
};
