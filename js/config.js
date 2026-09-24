/* ---------------------------------------------------------------------------
 * CONFIGURATION
 *
 * BACKEND is decided here and nowhere else:
 *   'live'   — talks to the Apps Script web app in SCRIPT_URL. Used whenever
 *              SCRIPT_URL is set.
 *   'mock'   — reads dev/mock-data.js and grades in the browser. Used when
 *              SCRIPT_URL is empty, or when the address ends in ?mock (local
 *              practice). dev/ is gitignored and never deployed.
 * ------------------------------------------------------------------------- */

const CONFIG = {
  // The Apps Script web-app address ("Deploy > Manage deployments" in the
  // editor). The pilot's old address has been public since June; this must be
  // a NEW deployment of apps-script/Code.gs.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw7_9qCrZZfyrpKO5DYiu4KBDeyZTK-p344fJE3q4CmZ_c6jC_SWCcaRudJjiMJBNKF/exec',

  ALLOWED_DOMAIN: 'mednet.ucla.edu',

  // Local autosave fires on every change; the server backup is throttled.
  SERVER_SAVE_INTERVAL_MS: 30000,

  // Below this width the start screen warns. A warning, never a block —
  // a false positive must not lock a fellow out of their own exam.
  MIN_COMFORTABLE_WIDTH: 820,

  STORAGE_KEY: 'hpm_exam_attempt',
};

CONFIG.BACKEND = (CONFIG.SCRIPT_URL && !/[?&]mock\b/.test(location.search)) ? 'live' : 'mock';

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
