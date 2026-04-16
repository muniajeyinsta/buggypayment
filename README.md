# RFID Payment Backend (Fastify + Supabase + Razorpay)

Production-focused backend for RFID-based user subscriptions.

## API

- `POST /create-order`
  - body: `{ "uid": "A001", "plan": "monthly" }`
  - response: `{ "order_id", "amount", "currency", "key_id" }`

- `POST /verify-payment`
  - body: `{ "uid", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }`
  - verifies signature and updates subscription for 30 days

- `GET /user/:uid`
  - response: `{ "status", "valid_until" }`
  - cache-first lookup with short TTL for low-latency RFID reads

## Performance Notes

- UID-only indexed lookup path (`PRIMARY KEY` on UID/UserID).
- Selective columns only (`status`, `valid_until`/`expiryDate`) to reduce payload and query cost.
- In-memory TTL cache (15s) with eviction to reduce repetitive read load.
- Stateless endpoints (cache is optional, process-local optimization).

## Run

```bash
npm install
npm start
```
