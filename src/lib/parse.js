/** Empty string counts as absent everywhere in these payloads. */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * MSG91's flat webhook template quotes every field, so nested structures
 * (interactive, button, messages, contacts) arrive as JSON strings rather
 * than objects. Returns null on empty string or a parse failure instead of
 * throwing, so callers never have to assume a value is an object.
 */
function safeJsonParse(value) {
  if (!nonEmpty(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * MSG91 also has a flat, non-Meta-shaped webhook template (customerNumber /
 * integratedNumber / uuid / etc, everything quoted as a string). Tried only
 * after the Meta shapes above have failed to match.
 */
function parseMsg91Flat(body) {
  const customerNumber = nonEmpty(body?.customerNumber);
  const integratedNumber = nonEmpty(body?.integratedNumber);
  if (!customerNumber || !integratedNumber) return null;

  const base = {
    waId: String(customerNumber),
    messageId: nonEmpty(body.uuid),
    raw: body,
    toNumber: String(integratedNumber),
    name: nonEmpty(body.customerName),
  };

  // Tapped a list row or reply button — nested Meta form or flat {id, title}.
  const interactive = safeJsonParse(body.interactive);
  if (interactive && typeof interactive === 'object') {
    if (interactive.type === 'list_reply') {
      const listReply = interactive.list_reply || interactive;
      return { ...base, kind: 'list_reply', replyId: listReply.id, text: listReply.title };
    }
    if (interactive.type === 'button_reply') {
      const buttonReply = interactive.button_reply || interactive;
      return { ...base, kind: 'button_reply', replyId: buttonReply.id, text: buttonReply.title };
    }
  }

  // Some accounts send button taps in a separate `button` field instead.
  const button = safeJsonParse(body.button);
  if (button && typeof button === 'object') {
    return {
      ...base,
      kind: 'button_reply',
      replyId: button.id || button.payload,
      text: button.text || button.title || '',
    };
  }
  if (nonEmpty(body.button)) {
    const value = typeof button === 'string' ? button : body.button;
    return { ...base, kind: 'button_reply', replyId: value, text: value };
  }

  if (nonEmpty(body.text)) {
    return { ...base, kind: 'text', text: body.text };
  }

  // Image, audio, location, sticker, etc. — treated as off-topic by the flow.
  return {
    ...base,
    kind: 'unsupported',
    text: '',
    mediaType: nonEmpty(body.contentType) || nonEmpty(body.messageType) || null,
  };
}

/**
 * MSG91 forwards Meta's inbound webhook shape, but the exact nesting has
 * varied between accounts. We probe the known shapes rather than assuming one,
 * and log the raw body when nothing matches so you can add a shape quickly.
 */
function parseInbound(body) {
  const msg =
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
    (Array.isArray(body?.messages) ? body.messages[0] : null) ||
    body?.message ||
    null;

  if (!msg) return parseMsg91Flat(body);

  const waId =
    msg.from ||
    body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id ||
    body?.mobile ||
    body?.sender;

  if (!waId) return null;

  const toNumber =
    body?.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number ||
    body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
    body?.to ||
    null;

  const base = { waId: String(waId), messageId: msg.id, raw: msg, toNumber: toNumber ? String(toNumber) : null };

  // Tapped a list row
  if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
    return {
      ...base,
      kind: 'list_reply',
      replyId: msg.interactive.list_reply.id,
      text: msg.interactive.list_reply.title,
    };
  }

  // Tapped a reply button
  if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
    return {
      ...base,
      kind: 'button_reply',
      replyId: msg.interactive.button_reply.id,
      text: msg.interactive.button_reply.title,
    };
  }

  if (msg.type === 'text') {
    return { ...base, kind: 'text', text: msg.text?.body || '' };
  }

  // Image, audio, location, sticker, etc. — treated as off-topic by the flow.
  return { ...base, kind: 'unsupported', text: '', mediaType: msg.type };
}

/** Words that always take the user back to the top. */
const RESET_WORDS = ['menu', 'restart', 'start', 'hi', 'hello', 'hey', 'reset', 'start over'];

function isResetWord(text) {
  if (!text) return false;
  return RESET_WORDS.includes(String(text).trim().toLowerCase().replace(/[!.?]+$/, ''));
}

const URL_RE = /(https?:\/\/|www\.|\.com|\.in\b)/i;

function validateName(text) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (value.length < 2) return { ok: false, reason: 'nameTooShort' };
  if (value.length > 50) return { ok: false, reason: 'nameLooksWrong' };
  if (URL_RE.test(value)) return { ok: false, reason: 'nameLooksWrong' };
  if (/^\d+$/.test(value)) return { ok: false, reason: 'nameLooksWrong' };
  if (!/[a-z\u0900-\u097F]/i.test(value)) return { ok: false, reason: 'nameLooksWrong' };
  return { ok: true, value: titleCase(value) };
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function validatePurpose(text) {
  const value = String(text || '').trim();
  if (value.length < 3) return { ok: false, reason: 'purposeTooShort' };
  return { ok: true, value: value.slice(0, 1000) };
}

/** Indian mobile: 10 digits starting 6-9, tolerating +91 / 0 / spaces. */
function validatePhone(text) {
  const digits = String(text || '').replace(/\D/g, '');
  let local = digits;
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2);
  if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return { ok: false, reason: 'badPhone' };
  return { ok: true, value: local };
}

module.exports = {
  parseInbound,
  isResetWord,
  validateName,
  validatePurpose,
  validatePhone,
};
