/**
 * SkyUp Digital Solutions — service catalogue.
 *
 * WhatsApp interactive-list limits (Meta Cloud API, enforced hard):
 *   - 10 rows MAX across ALL sections combined
 *   - row title      <= 24 chars
 *   - row description<= 72 chars
 *   - section title  <= 24 chars
 *   - row id         <= 200 chars
 *
 * We are currently at 10/10 rows. Adding a service means merging two
 * existing rows or moving to a two-level menu. Run `npm run check:menu`
 * before deploying any change here.
 */

const SERVICES = [
  {
    id: 'svc_social_media',
    title: 'Social Media Marketing',
    description: 'Content, community & paid social that builds your brand',
    section: 'Marketing',
  },
  {
    id: 'svc_performance',
    title: 'Performance Marketing',
    description: 'Google, Meta & LinkedIn ads optimised for revenue',
    section: 'Marketing',
  },
  {
    id: 'svc_email',
    title: 'Email Marketing',
    description: 'Campaigns, automation & drip sequences that convert',
    section: 'Marketing',
  },
  {
    id: 'svc_ai_automation',
    title: 'AI Automation',
    description: 'AI chatbots, workflow & CRM automation',
    section: 'AI & Data',
  },
  {
    id: 'svc_machine_learning',
    title: 'Machine Learning',
    description: 'Custom ML models — churn, demand & LTV prediction',
    section: 'AI & Data',
  },
  {
    id: 'svc_skyup_crm',
    title: 'SkyUp CRM',
    description: 'All-in-one lead tracking, comms & AI analytics',
    section: 'AI & Data',
  },
  {
    id: 'svc_ui_ux',
    title: 'UI / UX Design',
    description: 'Research, wireframes, UI design & prototyping',
    section: 'Design & Development',
  },
  {
    id: 'svc_graphic',
    title: 'Graphic Design',
    description: 'Logo, brand identity, ad creative & pitch decks',
    section: 'Design & Development',
  },
  {
    id: 'svc_web_dev',
    title: 'Web Development',
    description: 'Websites, e-commerce, web apps & dashboards',
    section: 'Design & Development',
  },
  {
    id: 'svc_other',
    title: 'Something Else',
    description: "Not sure? Tell us what you need",
    section: 'Other',
  },
];

const SECTION_ORDER = ['Marketing', 'AI & Data', 'Design & Development', 'Other'];

/** Look up a service by its row id. Returns undefined if unknown. */
function findServiceById(id) {
  return SERVICES.find((s) => s.id === id);
}

/**
 * Fallback matcher: user typed the service name instead of tapping the list.
 * Case/space-insensitive, also tolerates a numeric choice ("3").
 */
function findServiceByText(text) {
  if (!text) return undefined;
  const clean = String(text).trim().toLowerCase().replace(/[\s/]+/g, ' ');

  const numeric = clean.match(/^(\d{1,2})$/);
  if (numeric) {
    const idx = parseInt(numeric[1], 10) - 1;
    if (idx >= 0 && idx < SERVICES.length) return SERVICES[idx];
  }

  return SERVICES.find((s) => {
    const title = s.title.toLowerCase().replace(/[\s/]+/g, ' ');
    return title === clean || title.startsWith(clean) && clean.length >= 4;
  });
}

/** Build the `action.sections` array for a WhatsApp interactive list. */
function buildListSections() {
  return SECTION_ORDER.map((section) => ({
    title: section,
    rows: SERVICES.filter((s) => s.section === section).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
    })),
  })).filter((sec) => sec.rows.length > 0);
}

/**
 * Validate the catalogue against WhatsApp's limits.
 * Throws on boot so a bad menu never reaches production silently.
 */
function assertMenuWithinLimits() {
  const errors = [];

  if (SERVICES.length > 10) {
    errors.push(`Row limit exceeded: ${SERVICES.length}/10 rows.`);
  }

  const seen = new Set();
  for (const s of SERVICES) {
    if (seen.has(s.id)) errors.push(`Duplicate service id: ${s.id}`);
    seen.add(s.id);
    if (s.title.length > 24) {
      errors.push(`Title too long (${s.title.length}/24): "${s.title}"`);
    }
    if (s.description && s.description.length > 72) {
      errors.push(`Description too long (${s.description.length}/72): "${s.title}"`);
    }
  }

  for (const section of SECTION_ORDER) {
    if (section.length > 24) {
      errors.push(`Section title too long (${section.length}/24): "${section}"`);
    }
  }

  if (errors.length) {
    throw new Error(`Invalid WhatsApp menu config:\n  - ${errors.join('\n  - ')}`);
  }
}

module.exports = {
  SERVICES,
  SECTION_ORDER,
  findServiceById,
  findServiceByText,
  buildListSections,
  assertMenuWithinLimits,
};
