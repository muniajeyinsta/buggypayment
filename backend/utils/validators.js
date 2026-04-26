'use strict';

const { PLAN_AMOUNT_INR } = require('./constants');
const { AppError } = require('./http');

const UID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const RAZORPAY_ID_REGEX = /^[A-Za-z0-9_]{6,128}$/;
const RAZORPAY_SIG_REGEX = /^[0-9a-f]{64}$/i;

const MAX_NAME_LEN = 120;
const MAX_PHONE_DIGITS = 15;

function normalizeUid(value) {
  const uid = String(value || '').trim();
  if (!uid) throw new AppError(400, 'uid is required');
  if (!UID_REGEX.test(uid)) {
    throw new AppError(400, 'uid must be 1-64 characters (A-Z, a-z, 0-9, _ or -)');
  }
  return uid;
}

/** Required on create-order and verify-payment; must match `PLAN_AMOUNT_INR` keys. */
function requirePlan(value) {
  const plan = String(value || '').trim();
  if (!plan) throw new AppError(400, 'plan is required');
  if (!PLAN_AMOUNT_INR[plan]) throw new AppError(400, 'Invalid plan');
  return plan;
}

function requireString(value, fieldName) {
  const str = String(value || '').trim();
  if (!str) throw new AppError(400, `${fieldName} is required`);
  return str;
}

function sanitizeName(value) {
  const s = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) throw new AppError(400, 'name is required');
  if (s.length > MAX_NAME_LEN) throw new AppError(400, 'name is too long');
  return s;
}

function sanitizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > MAX_PHONE_DIGITS) {
    throw new AppError(400, 'Invalid phone');
  }
  return digits;
}

function requireRazorpayId(value, fieldName) {
  const str = requireString(value, fieldName);
  if (!RAZORPAY_ID_REGEX.test(str)) {
    throw new AppError(400, `Invalid ${fieldName}`);
  }
  return str;
}

function requireRazorpaySignature(value) {
  const str = requireString(value, 'razorpay_signature');
  if (!RAZORPAY_SIG_REGEX.test(str)) {
    throw new AppError(400, 'Invalid razorpay_signature');
  }
  return str.toLowerCase();
}

module.exports = {
  normalizeUid,
  requirePlan,
  requireString,
  sanitizeName,
  sanitizePhone,
  requireRazorpayId,
  requireRazorpaySignature,
};
