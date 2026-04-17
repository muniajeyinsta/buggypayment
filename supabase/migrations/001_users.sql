-- Run this in Supabase SQL Editor (Dashboard → SQL → New query).
-- Uses quoted identifiers so column names match the app (camelCase).

CREATE TABLE IF NOT EXISTS users (
  "userId" TEXT PRIMARY KEY,
  "name" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "status" TEXT CHECK ("status" IN ('Paid', 'Pending')) DEFAULT 'Pending',
  "plan" TEXT,
  "amountPaid" INTEGER,
  "startDate" DATE,
  "expiryDate" DATE,
  "lastPaymentId" TEXT,
  "lastOrderId" TEXT,
  "paidAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_userId ON users ("userId");
-- PRIMARY KEY already indexes "userId". This partial index speeds RFID gate checks.
CREATE INDEX IF NOT EXISTS idx_users_status_expiry ON users ("status", "expiryDate");

-- Recommended production schema for new deployments:
-- CREATE TABLE IF NOT EXISTS users (
--   uid TEXT PRIMARY KEY,
--   status TEXT CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
--   valid_until DATE,
--   last_order_id TEXT,
--   last_payment_id TEXT,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS idx_users_uid_status ON users (uid, status);

-- Optional: enable RLS and allow only service_role (recommended: use SUPABASE_SERVICE_ROLE_KEY on the server).
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
