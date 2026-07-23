# SkyUp WhatsApp Bot

Lead-capture bot for SkyUp Digital Solutions. Captures **name, requirement, phone**
against a chosen service, then writes to **MongoDB + Google Sheet + SkyUp CRM**.

## ⚠️ Host requirement — read first

This runs on **Node** (Render, Railway, EC2, VPS). It will **not** run on
Cloudflare Workers as-is: Workers can't open raw TCP to MongoDB Atlas, so
`mongoose` fails there regardless of the `nodejs_compat` flag.

If SkyUp must live on Workers, the swap is: `mongoose` → Atlas **Data API** (HTTP),
and Express → the Workers `fetch` handler. Everything else carries over unchanged.
Tell me and I'll do that version.

## Setup

```bash
npm install
cp .env.example .env    # fill it in
npm run check:menu      # validates the menu against WhatsApp's limits
npm start
```

Health check: `GET /` → `{"status":"ok","mongo":"connected",...}`

**`mongo` must say `connected`.** The old launcherdesk trap was a health endpoint
that returned OK while Mongo was down — this one reports it explicitly.

## MSG91 webhook

```
URL:    https://<your-host>/webhook/whatsapp
Event:  On Inbound Request Received
Status: Enabled   ← verify this every single time
```

The pencil/edit view is the only place the Enabled toggle shows. The list view
doesn't. A run of 404s from a dead URL auto-pauses it silently.

## Flow

```
IDLE → MENU_SENT → AWAITING_NAME → AWAITING_PURPOSE → AWAITING_PHONE → DONE
                                                    ↘ AWAITING_ALT_PHONE ↗
```

**Off-topic input re-asks the current question — it does not reset to the menu.**
Resetting would wipe answers already given and lose the lead. Only `menu`,
`restart`, `hi`, `hello`, `start`, `reset` go back to the top.

Three consecutive invalid inputs in one state → `HANDOFF` with your support number.

## Editing the menu

`src/config/services.js`. You are at **10/10 rows**, WhatsApp's hard cap across
all sections. Adding a service means merging two rows or building a two-level
menu. `npm run check:menu` fails the build if you go over.

## Editing message copy

`src/config/copy.js`. Nothing else needs touching.

## Lead delivery

Mongo is the source of truth and is written **first**. Sheets and CRM fire after,
fire-and-forget, so their latency never blocks the user's confirmation. Each
lead tracks per-sink status:

```js
delivery: { sheets: {status,error,at}, crm: {status,error,at} }
```

Retry failures:

```bash
curl -X POST https://<host>/admin/replay-failed -H "x-admin-key: $ADMIN_KEY"
```

Worth putting on a 15-minute cron.

## Google Sheet

Create a sheet with a `Leads` tab, headers:

```
Timestamp | Name | Service | Requirement | Phone | WhatsApp ID | Source | Needs Human
```

Share it with your `GOOGLE_SERVICE_ACCOUNT_EMAIL` as **Editor** — this is the
step people forget, and it fails silently into `delivery.sheets.failed`.

## SkyUp CRM

Set `SKYUP_CRM_LEAD_URL` to an endpoint accepting `POST` with:

```json
{
  "name": "...", "phone": "...", "whatsapp_number": "...",
  "service": "...", "service_id": "...", "requirement": "...",
  "source": "whatsapp_bot", "needs_human": false, "captured_at": "ISO"
}
```

Sent with `Authorization: Bearer $SKYUP_CRM_API_KEY`. If your CRM expects a
different shape, edit `pushToCrm` in `src/sinks/index.js` — it's isolated.

## Known unknown

MSG91's inbound webhook nesting varies by account. `parseInbound` probes the
three shapes I've seen. If the first real inbound logs
`[webhook] no message in payload`, send me that logged body and I'll add the shape —
it's a two-line fix.
