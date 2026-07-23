/**
 * MSG91 forwards Meta's inbound webhook shape, but the exact nesting has
 * varied between accounts. We probe the known shapes rather than assuming one,
 * and log the raw body when nothing matches so you can add a shape quickly.
 */
function parseInbound(body) {
  const msg =
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
    body?.messages?.[0] ||
    body?.message ||
    null;

  if (!msg) return null;

  const waId =
    msg.from ||
    body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id ||
    body?.mobile ||
    body?.sender;

  if (!waId) return null;

  const base = { waId: String(waId), messageId: msg.id, raw: msg };

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
