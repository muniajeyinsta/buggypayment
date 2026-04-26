# EV Buggy Payment

Mobile-first web payment for EV buggy subscriptions (UPI + Razorpay).

## Project Structure

```
buggypayment/
├── frontend/          # Next.js app (UI)
│   ├── src/app/       # React pages & components  
│   ├── public/        # Static assets (QR images, manifest)
│   └── next.config.js # Proxies API calls to backend
├── backend/           # Fastify API server
│   ├── routes/        # paymentRoutes, userRoutes, adminRoutes, upiRoutes
│   ├── services/      # paymentService, userService, cacheService
│   ├── utils/         # env, validators, constants, http helpers
│   ├── scripts/       # verify-http, load-user-lookup
│   ├── supabase/      # DB migrations
│   ├── uploads/       # Screenshot uploads
│   ├── index.js       # Server entry point
│   └── app.js         # Fastify app builder
└── package.json       # Root orchestration scripts
```

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Start both frontend & backend in dev mode
npm run dev
```

- **Frontend** (Next.js): http://localhost:3000
- **Backend** (Fastify API): http://localhost:3001

## How It Works

1. **Frontend** (Next.js on `:3000`) serves the React UI
2. **Backend** (Fastify on `:3001`) handles all API routes
3. **Next.js rewrites** proxy API calls from the frontend to the backend seamlessly
4. From the browser's perspective, everything is on the same origin (`:3000`)

## Environment Variables

Create `backend/.env`:

```env
PORT=3001
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=your_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
UPI_ID=your-upi@bank
UPI_PAYEE_NAME=Your Name
```

## API Routes (Backend)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| GET | `/user/:uid` | User status lookup |
| POST | `/create-order` | Create Razorpay order |
| POST | `/verify-payment` | Verify Razorpay payment |
| GET | `/upi-config` | Get UPI configuration |
| POST | `/upi-payment` | Record UPI payment |
| GET | `/admin/users` | List users (admin) |
| POST | `/admin/update-user` | Update user (admin) |
| POST | `/admin/create-user` | Create user (admin) |

## Running Individually

```bash
# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend
```
