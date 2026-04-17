# RFID Payment Backend (Fastify + Supabase + Razorpay)

Production-focused backend for RFID-based user subscriptions.

## Plans (subscription length)

| `plan` value | Duration |
|--------------|----------|
| `monthly`    | 1 month  |
| `3months`    | 3 months |
| `6months`    | 6 months |
| `12months`   | 12 months |

Amounts for each plan are defined in `server/utils/constants.js` and must match what you charge in Razorpay.

## API

- `POST /create-order`
  - body: `{ "uid": "A001", "plan": "monthly", "name": "…", "phone": "…" }` (`userId` accepted instead of `uid`)
  - **`plan` is required** (one of the values above).
  - response: `{ "ok", "order_id", "amount", "currency", "key_id" }`

- `POST /verify-payment`
  - body: `{ "uid", "plan", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }`
  - **`plan` is required** and must match the order created for that user.
  - verifies the Razorpay signature and paid order, then updates the user to **Paid** with `valid_until` / `expiryDate` and optional **`paid_at`** (see database).
  - response: `{ "ok", "verified", "status", "valid_until", "expiryDate", "paid_at" }`  
    (`expiryDate` mirrors `valid_until` for older clients.)

- `GET /user/:uid`
  - response: `{ "status", "valid_until" }`
  - cache-first lookup with short TTL for low-latency RFID reads

## Database

- Primary user key: `userId` (see `supabase/migrations/001_users.sql`).
- Optional: run `002_optional_paid_at.sql` on databases created before `paidAt` was added to `001_users.sql`. The app probes for `paidAt` at runtime and sets it on successful payment when the column exists.

## Performance notes

- UID-only indexed lookup path (`PRIMARY KEY` on `userId`).
- Selective columns only for hot paths.
- In-memory TTL cache (~15s) with eviction to reduce repetitive read load.
- Stateless endpoints (cache is optional, process-local optimization).

## Run

```bash
npm install
npm start
```

Uses `process.env.PORT` (e.g. on Railway).
