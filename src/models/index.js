const mongoose = require('mongoose');

/** Conversation states, in order. */
const STATES = {
  IDLE: 'IDLE',
  MENU_SENT: 'MENU_SENT',
  AWAITING_NAME: 'AWAITING_NAME',
  AWAITING_PURPOSE: 'AWAITING_PURPOSE',
  AWAITING_PHONE: 'AWAITING_PHONE',
  AWAITING_ALT_PHONE: 'AWAITING_ALT_PHONE',
  HANDOFF: 'HANDOFF',
  DONE: 'DONE',
};

const sessionSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, unique: true, index: true },
    state: { type: String, enum: Object.values(STATES), default: STATES.IDLE },

    // Partial answers collected so far.
    serviceId: String,
    serviceTitle: String,
    name: String,
    purpose: String,
    phone: String,

    // Consecutive invalid inputs in the CURRENT state. Reset on any valid step.
    strikes: { type: Number, default: 0 },

    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const leadSchema = new mongoose.Schema(
  {
    waId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    serviceId: String,
    serviceTitle: { type: String, required: true },
    purpose: { type: String, required: true },
    phone: { type: String, required: true },

    source: { type: String, default: 'whatsapp' },
    needsHuman: { type: Boolean, default: false },

    // Per-sink delivery tracking, so a Sheets outage never loses a lead.
    delivery: {
      sheets: {
        status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
        error: String,
        at: Date,
      },
      crm: {
        status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
        error: String,
        at: Date,
      },
    },
  },
  { timestamps: true }
);

const Session = mongoose.model('Session', sessionSchema);
const Lead = mongoose.model('Lead', leadSchema);

module.exports = { STATES, Session, Lead };
