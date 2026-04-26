'use strict';

const fs = require('fs');
const path = require('path');
const { upsertUserForOrder, markUpiPaymentPending } = require('../services/userService');
const { AppError } = require('../utils/http');
const {
  normalizeUid,
  requirePlan,
  sanitizeName,
  sanitizePhone,
} = require('../utils/validators');
const { env } = require('../utils/env');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function optionalBodyString(value) {
  const s = String(value == null ? '' : value).trim();
  return s || undefined;
}

const paymentRateLimit = {
  max: env.rateLimitPaymentMax,
  timeWindow: '1 minute',
};

async function upiRoutes(app) {
  /**
   * GET /upi-config
   * Returns the UPI ID and payee name for the frontend to build intent links / QR codes.
   */
  app.get('/upi-config', async (_request, reply) => {
    const upiId = process.env.UPI_ID || '';
    const payeeName = process.env.UPI_PAYEE_NAME || 'EV Buggy';

    if (!upiId) {
      return reply.status(503).send({
        error: 'UPI payment is not configured. Please set UPI_ID in environment.',
      });
    }

    return reply.send({
      upiId,
      payeeName,
    });
  });

  /**
   * POST /upi-payment
   * Accepts multipart form data with:
   *   - userId, plan, amount, upiTransactionId, name, phone, email (text fields)
   *   - screenshot (file upload — payment proof image)
   *
   * The payment is marked as "Paid" and the transaction ID + screenshot path are stored.
   */
  app.post(
    '/upi-payment',
    {
      config: {
        rateLimit: paymentRateLimit,
      },
    },
    async (request, reply) => {
      const t0 = Date.now();

      // Parse multipart form data
      const fields = {};
      let screenshotPath = null;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          // Validate file type
          if (!ALLOWED_MIMES.includes(part.mimetype)) {
            // Consume the stream but don't save
            await part.toBuffer();
            throw new AppError(400, 'Only image files (JPG, PNG, WebP) are allowed');
          }

          // Save screenshot
          const ext = part.mimetype.split('/')[1] === 'jpeg' ? 'jpg'
            : part.mimetype.split('/')[1] === 'png' ? 'png'
            : part.mimetype.split('/')[1] === 'webp' ? 'webp'
            : 'jpg';
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const filename = `ss_${timestamp}_${randomSuffix}.${ext}`;
          const filepath = path.join(UPLOADS_DIR, filename);

          const buffer = await part.toBuffer();
          fs.writeFileSync(filepath, buffer);
          screenshotPath = filename;
        } else {
          // Text field
          fields[part.fieldname] = part.value;
        }
      }

      const uid = normalizeUid(fields.uid || fields.userId);
      const plan = requirePlan(fields.plan);
      const name = sanitizeName(fields.name);
      const phone = sanitizePhone(fields.phone);
      const email = optionalBodyString(fields.email);
      const upiTransactionId = optionalBodyString(fields.upiTransactionId);

      if (!upiTransactionId || upiTransactionId.length < 6) {
        throw new AppError(400, 'Valid UPI transaction ID is required (min 6 characters)');
      }

      // Upsert user with order details
      await upsertUserForOrder(uid, {
        name,
        phone,
        email,
        plan,
        upi_transaction_id: upiTransactionId,
      });

      // Mark payment as pending verification with the UPI transaction ID
      const result = await markUpiPaymentPending(uid, upiTransactionId, plan, screenshotPath);

      request.log.info({
        msg: 'upi_payment_recorded',
        uid,
        plan,
        upi_txn_id: upiTransactionId,
        has_screenshot: !!screenshotPath,
        screenshot: screenshotPath || null,
        timestamp: new Date().toISOString(),
        response_time_ms: Date.now() - t0,
      });

      return reply.send(result);
    },
  );

  /**
   * GET /uploads/:filename
   * Serve uploaded screenshots (admin use).
   */
  app.get('/uploads/:filename', async (request, reply) => {
    const filename = String(request.params.filename || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const filepath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      throw new AppError(404, 'File not found');
    }
    const stream = fs.createReadStream(filepath);
    return reply.type('application/octet-stream').send(stream);
  });
}

module.exports = upiRoutes;
