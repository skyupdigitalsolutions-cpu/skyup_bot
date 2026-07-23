require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const { handleMessage } = require('./flow/machine');
const { parseInbound } = require('./lib/parse');
const { assertMenuWithinLimits } = require('./config/services');
const { replayFailed } = require('./sinks');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Dedupe: MSG91 retries webhooks it thinks failed. Without this, a slow
// response gets the user two menus.
const seenMessages = new Map();
const DEDUPE_TTL_MS = 5 * 60 * 1000;

function isDuplicate(messageId) {
  if (!messageId) return false;
  const now = Date.now();
  for (const [id, ts] of seenMessages) {
    if (now - ts > DEDUPE_TTL_MS) seenMessages.delete(id);
  }
  if (seenMessages.has(messageId)) return true;
  seenMessages.set(messageId, now);
  return false;
}

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SkyUp WhatsApp Bot',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

app.post('/webhook/whatsapp', async (req, res) => {
  // ACK immediately. MSG91 retries on slow responses, and every downstream
  // call (Mongo, Sheets, CRM) is slower than its patience.
  res.status(200).json({ received: true });

  try {
    const inbound = parseInbound(req.body);

    if (!inbound) {
      // Status callbacks (delivered/read) land here too — not an error.
      console.log('[webhook] no message in payload', JSON.stringify(req.body).slice(0, 400));
      return;
    }

    if (isDuplicate(inbound.messageId)) {
      console.log(`[webhook] duplicate ${inbound.messageId}, skipping`);
      return;
    }

    console.log(`[webhook] ${inbound.waId} kind=${inbound.kind} text="${inbound.text}"`);
    await handleMessage(inbound);
  } catch (err) {
    console.error('[webhook] handler error:', err.stack || err.message);
  }
});

// Manual retry for leads whose Sheets/CRM push failed.
app.post('/admin/replay-failed', async (req, res) => {
  if (req.get('x-admin-key') !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const count = await replayFailed();
  res.json({ retried: count });
});

async function start() {
  assertMenuWithinLimits();

  const required = ['MONGO_URI', 'MSG91_AUTH_KEY', 'MSG91_WHATSAPP_NUMBER'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[boot] mongo connected');

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`[boot] SkyUp bot listening on :${port}`));
}

start().catch((err) => {
  console.error('[boot] failed:', err.message);
  process.exit(1);
});

module.exports = app;
