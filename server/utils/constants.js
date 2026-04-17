'use strict';

/** Amount charged per plan (INR), must match Razorpay order amounts / frontend offers. */
const PLAN_AMOUNT_INR = {
  monthly: 300,
  '3months': 891,
  '6months': 1746,
  '12months': 3420,
};

/** Subscription length per plan (calendar months). */
const PLAN_DURATION_MONTHS = {
  monthly: 1,
  '3months': 3,
  '6months': 6,
  '12months': 12,
};

module.exports = { PLAN_AMOUNT_INR, PLAN_DURATION_MONTHS };
