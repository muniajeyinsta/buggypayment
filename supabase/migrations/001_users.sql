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
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_userId ON users ("userId");

-- Optional: enable RLS and allow only service_role (recommended: use SUPABASE_SERVICE_ROLE_KEY on the server).
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
