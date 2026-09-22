/* ---------------------------------------------------------------------------
 * CONFIGURATION
 *
 * BACKEND is switched here and nowhere else.
 *   'mock'   — reads dev/mock-form.json, grades in-browser. Local development
 *              only; dev/ is gitignored and never deployed.
 *   'live'   — talks to the Apps Script deployment in SCRIPT_URL.
 * ------------------------------------------------------------------------- */

const CONFIG = {
  BACKEND: 'mock',

  // Replace when the new Apps Script deployment exists. The previous URL has
  // been public since June and is being retired (see plan, Phase 2 control 8).
  SCRIPT_URL: '',

  ALLOWED_DOMAIN: 'mednet.ucla.edu',

  // Local autosave fires on every change; the server backup is throttled.
  SERVER_SAVE_INTERVAL_MS: 30000,

  // Below this width the start screen warns. A warning, never a block —
  // a false positive must not lock a fellow out of their own exam.
  MIN_COMFORTABLE_WIDTH: 820,

  STORAGE_KEY: 'hpm_exam_attempt',
};

/* Reporting domains, in the order they should appear.
 * Fixed list: the validator rejects anything not in it, so a stray trailing
 * space can never silently create an eighth domain in someone's breakdown. */
const DOMAIN_ORDER = [
  'Pain management',
  'Non-pain symptom management',
  'Prognostication & hospice',
  'Ethics & law',
  'End-of-life & bereavement',
  'Communication',
  'Systems, quality & populations',
];

/* Badge class per domain, DERIVED rather than hand-authored alongside the
 * name — the pilot maintained `domain` and `domainClass` in parallel, which is
 * exactly how they drift apart. */
function domainClass(domain) {
  const i = DOMAIN_ORDER.indexOf(domain);
  return i === -1 ? 'domain-other' : 'domain-' + i;
}
