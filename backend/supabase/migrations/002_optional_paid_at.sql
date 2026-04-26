-- For databases created from an older 001_users.sql without "paidAt".
-- New installs that use the current 001_users.sql already include this column.
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ;
