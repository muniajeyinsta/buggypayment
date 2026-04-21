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

async function createOrder({
  uid,
  plan,
  name,
  phone,
  email,
  apartment_name,
  tower,
  floor,
  flat_number,
}) {
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

  await upsertUserForOrder(uid, {
    name,
    phone,
    plan,
    email,
    apartment_name,
    tower,
    floor,
    flat_number,
    razorpay_order_id: order.id,
  });

  return {
    ok: true,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: env.razorpayKeyId,
  };
}

function verifySignature({ orderId, paymentId, signature }) {
  if (!env.razorpayKeySecret) throw new AppError(503, 'Payments are not configured');
  const payload = `${orderId}|${paymentId}`;
  const expectedHex = crypto.createHmac('sha256', env.razorpayKeySecret).update(payload).digest('hex');

  let expectedBuf;
  let sigBuf;
  try {
    expectedBuf = Buffer.from(expectedHex, 'hex');
    sigBuf = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (expectedBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

/**
 * Confirms the order was paid, belongs to uid/plan, and matches the charged amount (Razorpay + app).
 */
async function assertPaidOrderMatchesUser({ orderId, uid, plan }) {
  if (!razorpay) throw new AppError(503, 'Payments are not configured');

  let order;
  try {
    order = await razorpay.orders.fetch(orderId);
  } catch {
    throw new AppError(502, 'Failed to verify order with Razorpay');
  }

  const noteUid =
    order.notes && order.notes.uid != null ? String(order.notes.uid).trim() : '';
  if (noteUid !== uid) throw new AppError(400, 'Order does not match user');

  const notePlanRaw = order.notes && order.notes.plan != null ? String(order.notes.plan).trim() : '';
  if (notePlanRaw && notePlanRaw !== plan) throw new AppError(400, 'Order does not match plan');

  const expectedPaise = getAmountPaise(plan);
  const amount = Number(order.amount);
  if (!Number.isFinite(amount) || amount !== expectedPaise) {
    throw new AppError(400, 'Order amount mismatch');
  }

  const currency = String(order.currency || '').toUpperCase();
  if (currency && currency !== 'INR') throw new AppError(400, 'Invalid order currency');

  if (order.status !== 'paid') throw new AppError(400, 'Order is not paid');
}

module.exports = {
  createOrder,
  verifySignature,
  assertPaidOrderMatchesUser,
};
