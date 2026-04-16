'use strict';

const { AppError } = require('./http');

const UID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const RAZORPAY_ID_REGEX = /^[A-Za-z0-9_]{6,128}$/;
const RAZORPAY_SIG_REGEX = /^[0-9a-f]{64}$/i;

function normalizeUid(value) {
  const uid = String(value || '').trim();
  if (!uid) throw new AppError(400, 'uid is required');
  if (!UID_REGEX.test(uid)) {
    throw new AppError(400, 'uid must be 1-64 characters (A-Z, a-z, 0-9, _ or -)');
  }
  return uid;
}

function normalizePlan(value) {
  const plan = String(value || 'monthly').trim();
  if (!['monthly'].includes(plan)) {
    throw new AppError(400, 'Invalid plan');
  }
  return plan;
}

function requireString(value, fieldName) {
  const str = String(value || '').trim();
  if (!str) throw new AppError(400, `${fieldName} is required`);
  return str;
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
  return str;
}

module.exports = {
  normalizeUid,
  normalizePlan,
  requireString,
  requireRazorpayId,
  requireRazorpaySignature,
};
