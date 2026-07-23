/**
 * Every user-facing string lives here so copy changes never touch flow logic.
 */

const BRAND = 'SkyUp Digital Solutions';

module.exports = {
  BRAND,

  menu: {
    header: 'SkyUp Digital Solutions',
    body:
      `Hi 👋 Welcome to ${BRAND}.\n\n` +
      `Tap below to pick the service you're interested in.`,
    footer: 'Type MENU anytime to start over',
    button: 'View Services',
  },

  askName: (service) =>
    `Great choice — *${service}* 👍\n\nMay I know your name?`,

  askPurpose: (name, service) =>
    `Thanks ${name}! Briefly, what do you need help with in *${service}*?`,

  askPhone: (waNumber) =>
    `Almost done. Is *${waNumber}* the best number to reach you?`,

  phoneButtons: [
    { id: 'phone_use_wa', title: '✅ Yes, use this' },
    { id: 'phone_other', title: '📱 Different number' },
  ],

  askAltPhone: 'No problem — please type the 10-digit number to reach you on.',

  confirm: ({ name, service, purpose, phone }) =>
    `All set ✅\n\n` +
    `*Name:* ${name}\n` +
    `*Service:* ${service}\n` +
    `*Requirement:* ${purpose}\n` +
    `*Phone:* ${phone}\n\n` +
    `Our team will get back to you within 24 hours.\n` +
    `Type MENU anytime to start over.`,

  // Off-topic / invalid input. The current question is re-sent right after
  // this, so it must not itself repeat the question.
  offTopic: "Sorry, I can't help with that here 🙏",

  handoff: (phone) =>
    `Let me connect you with our team directly.\n\n` +
    `📞 Call us: ${phone}\n\n` +
    `Or type MENU to start over.`,

  alreadyDone:
    `You're all set — our team has your details and will reach out soon ✅\n\n` +
    `Need something else? Type MENU.`,

  errors: {
    nameTooShort: 'That looks a bit short — please share your full name.',
    nameLooksWrong: "That doesn't look like a name. Please type your name.",
    purposeTooShort: 'Could you tell me a little more about what you need?',
    badPhone: 'That doesn\'t look like a valid 10-digit mobile number. Please try again.',
    generic: 'Something went wrong on our side 😔 Please try again in a moment.',
  },
};
