const { STATES, Session } = require('../models');
const { sendText, sendList, sendButtons } = require('../lib/msg91');
const { saveLead } = require('../sinks');
const copy = require('../config/copy');
const {
  buildListSections,
  findServiceById,
  findServiceByText,
} = require('../config/services');
const {
  isResetWord,
  validateName,
  validatePurpose,
  validatePhone,
} = require('../lib/parse');

const MAX_STRIKES = 3;
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '+91 00000 00000';

// --------------------------------------------------------------- send helpers

function sendMenu(waId) {
  return sendList(waId, {
    header: copy.menu.header,
    body: copy.menu.body,
    footer: copy.menu.footer,
    button: copy.menu.button,
    sections: buildListSections(),
  });
}

/**
 * Re-send whatever question the session is currently sitting on.
 * This is what off-topic input triggers — NOT a menu reset, which would
 * discard answers the user already gave.
 */
async function resendCurrentQuestion(session) {
  switch (session.state) {
    case STATES.MENU_SENT:
      return sendMenu(session.waId);
    case STATES.AWAITING_NAME:
      return sendText(session.waId, copy.askName(session.serviceTitle));
    case STATES.AWAITING_PURPOSE:
      return sendText(session.waId, copy.askPurpose(session.name, session.serviceTitle));
    case STATES.AWAITING_PHONE:
      return sendButtons(session.waId, {
        body: copy.askPhone(session.waId),
        buttons: copy.phoneButtons,
      });
    case STATES.AWAITING_ALT_PHONE:
      return sendText(session.waId, copy.askAltPhone);
    default:
      return sendMenu(session.waId);
  }
}

async function reject(session, reasonKey) {
  session.strikes += 1;

  if (session.strikes >= MAX_STRIKES) {
    session.state = STATES.HANDOFF;
    await session.save();
    return sendText(session.waId, copy.handoff(SUPPORT_PHONE));
  }

  await session.save();
  const detail = reasonKey ? copy.errors[reasonKey] : copy.offTopic;
  await sendText(session.waId, detail || copy.offTopic);
  return resendCurrentQuestion(session);
}

async function advance(session, patch, nextState) {
  Object.assign(session, patch);
  session.state = nextState;
  session.strikes = 0;
  await session.save();
}

// ------------------------------------------------------------- main entrypoint

async function handleMessage(inbound) {
  const { waId, kind, text, replyId } = inbound;

  let session = await Session.findOne({ waId });
  if (!session) session = new Session({ waId, state: STATES.IDLE });

  session.lastMessageAt = new Date();

  // Reset words win from any state — the only path back to the menu.
  if (kind === 'text' && isResetWord(text)) {
    Object.assign(session, {
      state: STATES.MENU_SENT,
      serviceId: undefined,
      serviceTitle: undefined,
      name: undefined,
      purpose: undefined,
      phone: undefined,
      strikes: 0,
    });
    await session.save();
    return sendMenu(waId);
  }

  switch (session.state) {
    // ---------------------------------------------------------- fresh contact
    case STATES.IDLE:
      session.state = STATES.MENU_SENT;
      await session.save();
      return sendMenu(waId);

    // -------------------------------------------------------- picking service
    case STATES.MENU_SENT: {
      const service =
        (kind === 'list_reply' && findServiceById(replyId)) ||
        (kind === 'text' && findServiceByText(text));

      if (!service) return reject(session);

      await advance(
        session,
        { serviceId: service.id, serviceTitle: service.title },
        STATES.AWAITING_NAME
      );
      return sendText(waId, copy.askName(service.title));
    }

    // ------------------------------------------------------------------- name
    case STATES.AWAITING_NAME: {
      if (kind !== 'text') return reject(session);
      const result = validateName(text);
      if (!result.ok) return reject(session, result.reason);

      await advance(session, { name: result.value }, STATES.AWAITING_PURPOSE);
      return sendText(waId, copy.askPurpose(result.value, session.serviceTitle));
    }

    // ---------------------------------------------------------------- purpose
    case STATES.AWAITING_PURPOSE: {
      if (kind !== 'text') return reject(session);
      const result = validatePurpose(text);
      if (!result.ok) return reject(session, result.reason);

      await advance(session, { purpose: result.value }, STATES.AWAITING_PHONE);
      return sendButtons(waId, {
        body: copy.askPhone(waId),
        buttons: copy.phoneButtons,
      });
    }

    // ------------------------------------------------------------------ phone
    case STATES.AWAITING_PHONE: {
      if (kind === 'button_reply' && replyId === 'phone_use_wa') {
        return finish(session, waId);
      }
      if (kind === 'button_reply' && replyId === 'phone_other') {
        await advance(session, {}, STATES.AWAITING_ALT_PHONE);
        return sendText(waId, copy.askAltPhone);
      }
      // They typed a number instead of tapping — accept it.
      if (kind === 'text') {
        const result = validatePhone(text);
        if (result.ok) return finish(session, result.value);
      }
      return reject(session);
    }

    case STATES.AWAITING_ALT_PHONE: {
      if (kind !== 'text') return reject(session);
      const result = validatePhone(text);
      if (!result.ok) return reject(session, result.reason);
      return finish(session, result.value);
    }

    // -------------------------------------------------------- terminal states
    case STATES.HANDOFF:
      return sendText(waId, copy.handoff(SUPPORT_PHONE));

    case STATES.DONE:
      return sendText(waId, copy.alreadyDone);

    default:
      session.state = STATES.MENU_SENT;
      await session.save();
      return sendMenu(waId);
  }
}

async function finish(session, phone) {
  await advance(session, { phone }, STATES.DONE);

  await saveLead({
    waId: session.waId,
    name: session.name,
    serviceId: session.serviceId,
    serviceTitle: session.serviceTitle,
    purpose: session.purpose,
    phone,
    needsHuman: false,
  });

  return sendText(
    session.waId,
    copy.confirm({
      name: session.name,
      service: session.serviceTitle,
      purpose: session.purpose,
      phone,
    })
  );
}

module.exports = { handleMessage, sendMenu };
