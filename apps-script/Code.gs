/* ===========================================================================
 * HPM Fellow In-Service Exam — server (Google Apps Script)
 *
 * This file is pasted into the Apps Script editor of the exam's Google Sheet
 * (Extensions > Apps Script). It is the ONLY place the answer key is read:
 * the exam page receives questions without answers, sends back the fellow's
 * choices, and gets the key and rationales only in the reply to "submit".
 *
 * Tabs it uses (created by  HPM Exam > Set up tabs):
 *   Config      exam_open, tester_code, form_version — the switches George uses
 *   Roster      the fellows allowed to sit the exam
 *   Items       the question bank (faculty edit here)
 *   Form <ver>  frozen copy of Items made by "Publish"; attempts are graded
 *               against the version they started on, never against later edits
 *   Attempts    one row per attempt (the tab to read for results)
 *   Responses   one row per question per submitted attempt (for re-scoring
 *               and item analysis)
 *   Exam day    live status board, rebuilt on every save
 *   AuditLog    every publish, open/close, retake and manual submission
 *
 * Web requests (from js/api.js, POSTed as text/plain JSON):
 *   start     {name, email, tester_code?}  -> {attempt_id, kind, form, server_progress}
 *   progress  {attempt_id, snapshot}       -> {ok}
 *   submit    {attempt_id, email, responses[]} -> {score, domains, items(with key)}
 * Errors come back as {ok:false, code, error}. The codes are what the exam
 * page turns into plain-language messages (see ERROR_MESSAGES in js/exam.js)
 * and what docs/RUNBOOK.md lists fixes for.
 * ======================================================================== */

const TAB = {
  CONFIG: 'Config', ROSTER: 'Roster', ITEMS: 'Items', ATTEMPTS: 'Attempts',
  RESPONSES: 'Responses', STATUS: 'Exam day', AUDIT: 'AuditLog',
};
const FORM_PREFIX = 'Form ';
const CHOICES = ['a', 'b', 'c', 'd', 'e'];
const PUBLISHABLE = ['ready', 'draft'];

/* Reporting domains, in display order. Must match DOMAIN_ORDER in js/config.js. */
const DOMAIN_ORDER = [
  'Pain management',
  'Non-pain symptom management',
  'Prognostication & hospice',
  'Ethics & law',
  'End-of-life & bereavement',
  'Communication',
  'Systems, quality & populations',
];

const ITEM_FIELDS = ['item_id', 'status', 'domain', 'report_domain', 'title', 'stem']
  .concat(CHOICES.map(c => 'choice_' + c))
  .concat(['correct_choice_id', 'key_rationale'])
  .concat(CHOICES.map(c => 'rat_' + c))
  .concat(['reference', 'review_notes']);

const HEADERS = {
  Config: ['setting', 'value', 'what it does'],
  Roster: ['email', 'name', 'role', 'active'],
  Items: ITEM_FIELDS,
  Attempts: ['attempt_id', 'email', 'name', 'kind', 'status', 'form_version',
    'started_at', 'last_saved_at', 'submitted_at', 'duration_min', 'answered',
    'correct', 'total', 'pct'].concat(DOMAIN_ORDER).concat(['source', 'progress_json']),
  Responses: ['attempt_id', 'email', 'kind', 'form_version', 'item_id', 'domain',
    'chosen', 'correct_choice', 'is_correct', 'flagged', 'submitted_at'],
  AuditLog: ['when', 'who', 'action', 'detail'],
};

const CONFIG_DEFAULTS = [
  ['exam_open', false, 'TRUE lets fellows start. Tick it in the room on exam day; untick afterwards. Testers are not affected.'],
  ['tester_code', '', 'Testers open the exam link ending in #tester and type this code. Clear it to switch tester access off.'],
  ['form_version', '', 'Set by "Publish exam version". The version new attempts receive.'],
];

/* A progress snapshot is stored in one cell; Sheets caps a cell at 50,000 characters. */
const MAX_PROGRESS_CHARS = 45000;

/* ======================================================================== *
 *  Web entry points
 * ======================================================================== */

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, code: 'BAD_REQUEST', error: 'Request was not valid JSON.' });
  }
  try {
    switch (req.action) {
      case 'start':    return reply_(handleStart_(req));
      case 'progress': return reply_(handleProgress_(req));
      case 'submit':   return reply_(handleSubmit_(req, 'web'));
      default:         fail_('BAD_REQUEST', 'Unknown action.');
    }
  } catch (err) {
    if (err.code) return reply_({ ok: false, code: err.code, error: err.message });
    console.error(err && err.stack || err);
    return reply_({ ok: false, code: 'SERVER_ERROR', error: String(err && err.message || err) });
  }
}

/** Health check: open the web-app address in a browser to see this. Reveals
 *  nothing sensitive — only whether the exam is open and which version is live. */
function doGet() {
  try {
    const cfg = readConfig_();
    const form = cfg.form_version ? loadForm_(cfg.form_version) : null;
    return reply_({
      ok: true,
      exam_open: cfg.exam_open,
      form_version: cfg.form_version || null,
      item_count: form ? form.items.length : 0,
      tester_access: cfg.tester_code ? 'on' : 'off',
      server_time: new Date().toISOString(),
    });
  } catch (err) {
    return reply_({ ok: false, code: err.code || 'SERVER_ERROR', error: String(err.message || err) });
  }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  const err = new Error(message || code);
  err.code = code;
  throw err;
}

/* ======================================================================== *
 *  start / progress / submit
 * ======================================================================== */

function handleStart_(req) {
  const email = normEmail_(req.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail_('BAD_EMAIL', 'Please enter a valid email address.');
  const cfg = readConfig_();
  const typedName = String(req.name || '').trim().slice(0, 200);

  let kind, name;
  const code = String(req.tester_code == null ? '' : req.tester_code).trim();
  if (code) {
    if (!cfg.tester_code || code !== cfg.tester_code) fail_('BAD_TESTER_CODE', 'That tester code is not valid.');
    kind = 'test';
    name = typedName || email;
  } else {
    const person = findRosterPerson_(email);
    if (!person) fail_('NOT_ON_ROSTER', 'This email is not on the exam roster.');
    kind = 'fellow';
    name = person.name || typedName;       // the roster spelling is the one that counts
  }

  return withLock_(() => {
    const t = readTable_(TAB.ATTEMPTS);
    const mine = t.rows.filter(r => r.email === email && r.kind === kind && r.status !== 'void');

    if (kind === 'fellow' && mine.some(r => r.status === 'submitted')) {
      fail_('ALREADY_SUBMITTED', 'An exam has already been submitted for this email.');
    }

    // Resume on any machine: an unfinished attempt is picked up, on the form
    // version it started with (even if a newer version was published since).
    // Closing the exam stops NEW starts only, so a fellow whose laptop dies
    // after the doors close can still continue on another machine.
    const open = mine.filter(r => r.status === 'in_progress').pop();
    if (open) {
      const form = loadForm_(open.form_version, true);
      let progress = null;
      try { progress = open.progress_json ? JSON.parse(open.progress_json) : null; } catch (e) { progress = null; }
      return { ok: true, attempt_id: open.attempt_id, kind, resumed: true, form: form.public, server_progress: progress };
    }

    if (kind === 'fellow' && !cfg.exam_open) fail_('EXAM_CLOSED', 'The exam has not been opened yet.');
    if (!cfg.form_version) fail_('NO_FORM', 'No exam version has been published yet.');
    const form = loadForm_(cfg.form_version, true);
    const now = new Date();
    const row = blankRow_(HEADERS.Attempts, {
      attempt_id: Utilities.getUuid(), email, name, kind, status: 'in_progress',
      form_version: form.version, started_at: now, last_saved_at: now, answered: 0,
      total: form.public.item_count, source: 'web',
    });
    appendRows_(TAB.ATTEMPTS, [row]);
    refreshStatus_();
    return { ok: true, attempt_id: row[0], kind, resumed: false, form: form.public, server_progress: null };
  });
}

function handleProgress_(req) {
  const snapshot = req.snapshot || {};
  return withLock_(() => {
    const t = readTable_(TAB.ATTEMPTS);
    const hit = findAttempt_(t, req.attempt_id);
    if (!hit) fail_('NOT_FOUND', 'Attempt not found.');
    if (hit.row.status !== 'in_progress') fail_('NOT_IN_PROGRESS', 'This attempt is ' + hit.row.status + '.');

    let json = JSON.stringify(snapshot);
    if (json.length > MAX_PROGRESS_CHARS) {
      // Highlights are the only unbounded part; drop them rather than the answers.
      json = JSON.stringify(Object.assign({}, snapshot, { highlights: {} }));
    }
    updateRow_(TAB.ATTEMPTS, t, hit.index, {
      last_saved_at: new Date(),
      answered: Object.keys(snapshot.answers || {}).length,
      progress_json: json.length > MAX_PROGRESS_CHARS ? '' : json,
    });
    refreshStatus_();
    return { ok: true };
  });
}

/**
 * Grades and records an attempt. Idempotent: if the attempt was already
 * submitted (e.g. the reply was lost and the page retried), the stored result
 * is returned rather than an error, so a flaky network can never turn a
 * successful submission into a "failed" screen.
 */
function handleSubmit_(req, source) {
  return withLock_(() => {
    const t = readTable_(TAB.ATTEMPTS);
    const hit = findAttempt_(t, req.attempt_id);
    if (!hit) fail_('NOT_FOUND', 'Attempt not found.');
    const att = hit.row;
    if (req.email && normEmail_(req.email) !== att.email) fail_('NOT_FOUND', 'Attempt does not match this email.');
    if (att.status === 'void') fail_('VOID', 'This attempt was reset by the proctor.');

    const form = loadForm_(att.form_version);

    if (att.status === 'submitted') {
      const chosen = {};
      readTable_(TAB.RESPONSES).rows
        .filter(r => r.attempt_id === att.attempt_id)
        .forEach(r => { chosen[String(r.item_id)] = r.chosen || null; });
      return buildResult_(form, chosen).result;
    }

    const chosen = {}, flagged = {};
    (req.responses || []).forEach(r => {
      const id = String(r.item_id);
      if (CHOICES.indexOf(r.choice_id) !== -1) chosen[id] = r.choice_id;
      if (r.flagged) flagged[id] = true;
    });

    const graded = buildResult_(form, chosen);
    const now = new Date();
    const startedAt = att.started_at instanceof Date ? att.started_at : new Date(att.started_at);

    appendRows_(TAB.RESPONSES, form.items.map(it => {
      const id = String(it.item_id);
      return blankRow_(HEADERS.Responses, {
        attempt_id: att.attempt_id, email: att.email, kind: att.kind, form_version: form.version,
        item_id: it.item_id, domain: it.domain, chosen: chosen[id] || '',
        correct_choice: it.correct_choice_id, is_correct: chosen[id] === it.correct_choice_id,
        flagged: !!flagged[id], submitted_at: now,
      });
    }));

    const patch = {
      status: 'submitted', submitted_at: now, last_saved_at: now, source,
      duration_min: Math.round((now - startedAt) / 60000),
      answered: Object.keys(chosen).length,
      correct: graded.result.score.correct, total: graded.result.score.total, pct: graded.result.score.pct,
    };
    graded.result.domains.forEach(d => { patch[d.domain] = d.correct + '/' + d.total; });
    updateRow_(TAB.ATTEMPTS, t, hit.index, patch);
    refreshStatus_();
    return graded.result;
  });
}

/** Score an answer map against a form. Returns the reply the exam page expects. */
function buildResult_(form, chosen) {
  let correct = 0;
  const byDomain = {};
  const items = form.items.map(it => {
    const ok = chosen[String(it.item_id)] === it.correct_choice_id;
    if (ok) correct++;
    const d = byDomain[it.domain] || (byDomain[it.domain] = { correct: 0, total: 0 });
    d.total++;
    if (ok) d.correct++;
    return {
      item_id: it.item_id, domain: it.domain, correct_choice_id: it.correct_choice_id,
      key_rationale: it.key_rationale, rationales: it.rationales, reference: it.reference,
    };
  });
  const total = form.items.length;
  const domains = DOMAIN_ORDER.filter(d => byDomain[d])
    .concat(Object.keys(byDomain).filter(d => DOMAIN_ORDER.indexOf(d) === -1))
    .map(d => ({
      domain: d, correct: byDomain[d].correct, total: byDomain[d].total,
      pct: Math.round(byDomain[d].correct / byDomain[d].total * 100),
    }));
  return {
    result: {
      ok: true,
      score: { correct, total, pct: total ? Math.round(correct / total * 100) : 0 },
      domains,
      items,
    },
  };
}

/* ======================================================================== *
 *  Forms: publish and load
 * ======================================================================== */

/** Load a published form. `.public` is what the browser gets: no answers, no
 *  rationales, no titles, no domains (a title or domain label can cue the
 *  answer). The public part is cached so eight simultaneous starts don't all
 *  read the sheet. */
function loadForm_(version, publicOnly) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'form_public_' + version;
  if (publicOnly) {
    const hit = cache.get(cacheKey);
    if (hit) return { version, items: null, public: JSON.parse(hit) };
  }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FORM_PREFIX + version);
  if (!sh) fail_('NO_FORM', 'Published version "' + version + '" is missing.');
  const t = tableFromValues_(sh.getDataRange().getValues());
  const items = t.rows.map(r => ({
    item_id: Number(r.item_id),
    domain: String(r.report_domain),
    stem: String(r.stem),
    choices: CHOICES.filter(c => String(r['choice_' + c]).trim() !== '')
      .map(c => ({ id: c, text: String(r['choice_' + c]) })),
    correct_choice_id: String(r.correct_choice_id).trim().toLowerCase(),
    key_rationale: String(r.key_rationale),
    rationales: CHOICES.reduce((acc, c) => {
      const v = String(r['rat_' + c] || '').trim();
      if (v) acc[c] = v;
      return acc;
    }, {}),
    reference: String(r.reference || ''),
  }));

  let pub = null;
  const cached = cache.get(cacheKey);
  if (cached) {
    pub = JSON.parse(cached);
  } else {
    pub = {
      form_version: version,
      item_count: items.length,
      items: items.map(it => ({ item_id: it.item_id, stem: it.stem, choices: it.choices })),
    };
    const s = JSON.stringify(pub);
    if (s.length < 95000) cache.put(cacheKey, s, 21600);
  }
  return { version, items, public: pub };
}

/** Check Items the same way tools/validate_items.py does. */
function validateItems_(rows) {
  const errors = [], live = [], skipped = [];
  const seen = {};
  rows.forEach(r => {
    const id = String(r.item_id).trim();
    const tag = 'Q' + (id || '?');
    const status = String(r.status || '').trim();
    if (!/^\d+$/.test(id)) { errors.push(tag + ': item_id is not a number'); return; }
    if (seen[id]) errors.push(tag + ': duplicate item_id');
    seen[id] = true;
    if (status === 'retired') return;
    if (PUBLISHABLE.indexOf(status) === -1) { skipped.push(tag + ' (' + (status || 'no status') + ')'); return; }

    const present = CHOICES.filter(c => String(r['choice_' + c] || '').trim());
    if (present.length !== 5) errors.push(tag + ': has ' + present.length + ' choices, expected 5');
    const key = String(r.correct_choice_id || '').trim().toLowerCase();
    if (CHOICES.indexOf(key) === -1) errors.push(tag + ': correct_choice_id "' + key + '" is not a–e');
    else if (!String(r['choice_' + key] || '').trim()) errors.push(tag + ': the answer points at an empty choice');
    if (!String(r.stem || '').trim()) errors.push(tag + ': empty stem');
    if (!String(r.key_rationale || '').trim()) errors.push(tag + ': empty key_rationale');
    CHOICES.forEach(c => {
      if (c !== key && CHOICES.indexOf(key) !== -1 && !String(r['rat_' + c] || '').trim()) {
        errors.push(tag + ': no explanation for choice ' + c.toUpperCase());
      }
    });
    if (DOMAIN_ORDER.indexOf(String(r.report_domain).trim()) === -1) {
      errors.push(tag + ': report_domain "' + r.report_domain + '" is not one of the 7 domains');
    }
    live.push(r);
  });
  return { errors, live, skipped };
}

function nextVersion_() {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const base = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (let i = 0; i < 26; i++) {
    const v = base + String.fromCharCode(97 + i);        // 2026-10-02a, b, c...
    if (!ss.getSheetByName(FORM_PREFIX + v)) return v;
  }
  fail_('SERVER_ERROR', 'Too many versions published today.');
}

/* ======================================================================== *
 *  Exam-day status board
 * ======================================================================== */

function refreshStatus_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TAB.STATUS);
  if (!sh) return;
  const cfg = readConfig_();
  const tz = ss.getSpreadsheetTimeZone();
  const hhmm = d => (d instanceof Date) ? Utilities.formatDate(d, tz, 'h:mm a') : '';
  const attempts = readTable_(TAB.ATTEMPTS).rows;

  const out = [
    ['Exam is ' + (cfg.exam_open ? 'OPEN' : 'CLOSED'),
     'Version ' + (cfg.form_version || '(none published)'),
     'Tester access ' + (cfg.tester_code ? 'ON' : 'off'),
     'Updated ' + hhmm(new Date()), '', '', '', ''],
    ['Fellow', 'Email', 'Status', 'Answered', 'Last saved', 'Started', 'Submitted', 'Score'],
  ];
  readTable_(TAB.ROSTER).rows
    .filter(p => isTrue_(p.active) && String(p.role || 'fellow').trim().toLowerCase() === 'fellow')
    .forEach(p => {
      const email = normEmail_(p.email);
      const mine = attempts.filter(a => a.email === email && a.kind === 'fellow' && a.status !== 'void');
      const a = mine[mine.length - 1];
      const voided = attempts.some(x => x.email === email && x.kind === 'fellow' && x.status === 'void');
      let status = 'Not started';
      if (a && a.status === 'in_progress') status = 'In progress';
      if (a && a.status === 'submitted') status = 'Submitted';
      if (voided && !a) status = 'Not started (retake allowed)';
      out.push([
        p.name, email, status,
        a ? (a.answered || 0) + ' / ' + (a.total || '') : '',
        a ? hhmm(a.last_saved_at) : '',
        a ? hhmm(a.started_at) : '',
        a && a.status === 'submitted' ? hhmm(a.submitted_at) : '',
        a && a.status === 'submitted' ? a.pct + '%' : '',
      ]);
    });
  const tests = attempts.filter(a => a.kind === 'test');
  out.push(['', '', '', '', '', '', '', '']);
  out.push(['Test runs (not counted)', tests.length + ' total', tests.filter(a => a.status === 'in_progress').length + ' in progress', '', '', '', '', '']);

  sh.clearContents();
  sh.getRange(1, 1, out.length, 8).setValues(out);
}

/* ======================================================================== *
 *  Menu (runs when George opens the Sheet)
 * ======================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('HPM Exam')
    .addItem('Refresh exam-day status', 'menuRefreshStatus')
    .addSeparator()
    .addItem('Open exam (fellows can start)', 'menuOpenExam')
    .addItem('Close exam', 'menuCloseExam')
    .addItem('Allow a retake…', 'menuAllowRetake')
    .addItem('Add a submission from a downloaded file…', 'menuAddSubmission')
    .addSeparator()
    .addItem('Pre-exam check', 'menuPreExamCheck')
    .addItem('Publish exam version…', 'menuPublish')
    .addItem('Turn tester access off', 'menuTesterOff')
    .addSeparator()
    .addItem('Set up tabs (first time only)', 'menuSetup')
    .addToUi();
}

function menuRefreshStatus() {
  refreshStatus_();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.STATUS).activate();
}

function menuOpenExam() {
  const ui = SpreadsheetApp.getUi();
  const cfg = readConfig_();
  if (!cfg.form_version) { ui.alert('No exam version is published yet. Use "Publish exam version…" first.'); return; }
  if (ui.alert('Open the exam?', 'Fellows on the roster will be able to start right away.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  setConfig_('exam_open', true);
  audit_('open exam', 'version ' + cfg.form_version);
  menuRefreshStatus();
}

function menuCloseExam() {
  setConfig_('exam_open', false);
  audit_('close exam', '');
  refreshStatus_();
  SpreadsheetApp.getUi().alert('Exam closed. No one new can start. Fellows already in progress can still save and submit.');
}

function menuTesterOff() {
  setConfig_('tester_code', '');
  audit_('tester access off', '');
  refreshStatus_();
  SpreadsheetApp.getUi().alert('Tester access is off. The #tester link no longer works until you set a new code in Config.');
}

function menuAllowRetake() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Allow a retake', 'Fellow\'s email address:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const email = normEmail_(res.getResponseText());
  const latest = t => {
    let index = -1;
    t.rows.forEach((r, i) => { if (r.email === email && r.kind === 'fellow' && r.status !== 'void') index = i; });
    return index;
  };

  // Look and ask WITHOUT holding the lock: a dialog left open would otherwise
  // block every fellow's saves until it was answered.
  const before = readTable_(TAB.ATTEMPTS);
  const i0 = latest(before);
  if (i0 === -1) { ui.alert('No active attempt found for ' + email + '. They can simply start (if the exam is open).'); return; }
  const a = before.rows[i0];
  const what = a.status === 'submitted'
    ? 'SUBMITTED with ' + a.pct + '%. Note: they have already seen the answers on their results screen.'
    : 'IN PROGRESS with ' + (a.answered || 0) + ' answered. These answers will be discarded.';
  const ok = ui.alert('Allow a retake for ' + (a.name || email) + '?',
    'Their current attempt is ' + what + '\n\nIt will be kept in Attempts but marked "void", and they will start from question 1.',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  withLock_(() => {
    const t = readTable_(TAB.ATTEMPTS);           // re-read: it may have changed meanwhile
    const i = t.rows.findIndex(r => r.attempt_id === a.attempt_id);
    if (i === -1 || t.rows[i].status === 'void') return;
    const was = t.rows[i].status;
    updateRow_(TAB.ATTEMPTS, t, i, { status: 'void' });
    audit_('allow retake', email + ' — voided attempt ' + a.attempt_id + ' (was ' + was + ')');
    refreshStatus_();
  });
  ui.alert('Done. ' + (a.name || email) + ' can start again. On the same laptop they should choose "Start over" if asked to resume.');
}

function menuAddSubmission() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Add a submission from a downloaded file',
    'Open the fellow\'s downloaded file (hpm-exam-….json) in TextEdit, select all, copy, and paste it here:',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  let payload;
  try { payload = JSON.parse(res.getResponseText()); } catch (e) {
    ui.alert('That is not the contents of an exam file. Make sure you copied the whole file.'); return;
  }
  try {
    const r = handleSubmit_(payload, 'file');
    audit_('add submission from file', normEmail_(payload.email) + ' — ' + r.score.pct + '%');
    ui.alert('Recorded: ' + payload.name + ' — ' + r.score.correct + ' of ' + r.score.total + ' (' + r.score.pct + '%).');
  } catch (err) {
    ui.alert('Could not record it: ' + err.message + (err.code ? ' (' + err.code + ')' : ''));
  }
}

function menuPublish() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const v = validateItems_(readTable_(TAB.ITEMS).rows);
  if (v.errors.length) {
    ui.alert('Cannot publish — fix these in Items first:\n\n' + v.errors.slice(0, 25).join('\n')
      + (v.errors.length > 25 ? '\n…and ' + (v.errors.length - 25) + ' more' : ''));
    return;
  }
  if (!v.live.length) { ui.alert('No questions are marked ready or draft.'); return; }
  const version = nextVersion_();
  const msg = v.live.length + ' questions will be frozen as version ' + version + '.'
    + (v.skipped.length ? '\n\nLeft out (status not ready/draft): ' + v.skipped.join(', ') : '')
    + '\n\nNew attempts get this version. Attempts already started keep theirs.';
  if (ui.alert('Publish exam version?', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const sh = ss.insertSheet(FORM_PREFIX + version);
  const values = [ITEM_FIELDS].concat(v.live.map(r => ITEM_FIELDS.map(f => r[f] === undefined ? '' : r[f])));
  sh.getRange(1, 1, values.length, ITEM_FIELDS.length).setValues(values);
  sh.setFrozenRows(1);
  sh.protect().setDescription('Published exam version — do not edit').setWarningOnly(true);
  setConfig_('form_version', version);
  CacheService.getScriptCache().remove('form_public_' + version);
  audit_('publish', version + ' — ' + v.live.length + ' questions');
  refreshStatus_();
  ui.alert('Published version ' + version + ' (' + v.live.length + ' questions).');
}

function menuPreExamCheck() {
  const ui = SpreadsheetApp.getUi();
  const lines = [];
  const ok = (good, text) => lines.push((good ? '✓  ' : '✗  ') + text);
  const cfg = readConfig_();

  let form = null;
  try { form = cfg.form_version ? loadForm_(cfg.form_version) : null; } catch (e) { form = null; }
  ok(!!form, form ? 'Published version ' + cfg.form_version + ' with ' + form.items.length + ' questions'
                  : 'No published exam version');
  if (form) {
    const bad = form.items.filter(it => CHOICES.indexOf(it.correct_choice_id) === -1 || !it.key_rationale);
    ok(bad.length === 0, bad.length ? bad.length + ' questions missing an answer or explanation' : 'Every question has an answer and explanation');
  }

  const fellows = readTable_(TAB.ROSTER).rows.filter(p => isTrue_(p.active) && String(p.role || 'fellow').trim().toLowerCase() === 'fellow');
  ok(fellows.length > 0, fellows.length + ' active fellows on the roster');
  const dupes = fellows.map(p => normEmail_(p.email)).filter((e, i, a) => a.indexOf(e) !== i);
  if (dupes.length) ok(false, 'Duplicate roster emails: ' + dupes.join(', '));

  const attempts = readTable_(TAB.ATTEMPTS).rows;
  const already = fellows.filter(p => attempts.some(a => a.email === normEmail_(p.email) && a.kind === 'fellow' && a.status !== 'void'));
  ok(already.length === 0, already.length
    ? 'These fellows already have an attempt and will be blocked or resumed: ' + already.map(p => p.name).join(', ') + ' — use "Allow a retake" if that was a rehearsal'
    : 'No fellow has an attempt yet');

  lines.push((cfg.exam_open ? '!  ' : '✓  ') + 'Exam is ' + (cfg.exam_open ? 'OPEN — close it until everyone is seated' : 'closed (open it in the room)'));
  lines.push((cfg.tester_code ? '!  ' : '✓  ') + 'Tester access is ' + (cfg.tester_code ? 'ON — turn it off before exam day' : 'off'));

  const url = ScriptApp.getService().getUrl();
  ok(!!url, url ? 'Web app is deployed' : 'Web app is not deployed (Deploy > New deployment)');

  ui.alert('Pre-exam check', lines.join('\n\n'), ui.ButtonSet.OK);
}

function menuSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const made = [];
  [TAB.CONFIG, TAB.ROSTER, TAB.ITEMS, TAB.ATTEMPTS, TAB.RESPONSES, TAB.STATUS, TAB.AUDIT].forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); made.push(name); }
    const headers = HEADERS[name];
    if (headers && sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  const cfgSheet = ss.getSheetByName(TAB.CONFIG);
  const have = tableFromValues_(cfgSheet.getDataRange().getValues()).rows.map(r => r.setting);
  const add = CONFIG_DEFAULTS.filter(d => have.indexOf(d[0]) === -1);
  if (add.length) appendRows_(TAB.CONFIG, add);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  refreshStatus_();
  SpreadsheetApp.getUi().alert(made.length ? 'Created tabs: ' + made.join(', ') : 'All tabs already exist. Nothing changed.');
}

/* ======================================================================== *
 *  Sheet helpers
 * ======================================================================== */

function readConfig_() {
  const t = readTable_(TAB.CONFIG);
  const get = k => { const r = t.rows.filter(x => x.setting === k)[0]; return r ? r.value : ''; };
  return {
    exam_open: isTrue_(get('exam_open')),
    tester_code: String(get('tester_code') == null ? '' : get('tester_code')).trim(),
    form_version: String(get('form_version') || '').trim(),
  };
}

function setConfig_(key, value) {
  const t = readTable_(TAB.CONFIG);
  const i = t.rows.findIndex(r => r.setting === key);
  if (i === -1) appendRows_(TAB.CONFIG, [[key, value, '']]);
  else updateRow_(TAB.CONFIG, t, i, { value });
}

function findRosterPerson_(email) {
  return readTable_(TAB.ROSTER).rows.filter(p =>
    normEmail_(p.email) === email && isTrue_(p.active) &&
    String(p.role || 'fellow').trim().toLowerCase() === 'fellow')[0] || null;
}

function findAttempt_(table, attemptId) {
  const id = String(attemptId || '');
  for (let i = 0; i < table.rows.length; i++) if (table.rows[i].attempt_id === id) return { index: i, row: table.rows[i] };
  return null;
}

function readTable_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) fail_('SETUP', 'The "' + name + '" tab is missing. Run HPM Exam > Set up tabs.');
  return tableFromValues_(sh.getDataRange().getValues());
}

function tableFromValues_(values) {
  const headers = (values[0] || []).map(h => String(h).trim());
  const rows = values.slice(1)
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = typeof r[i] === 'string' ? r[i].trim() : r[i]; });
      if ('email' in o) o.email = normEmail_(o.email);
      return o;
    });
  // Remember each row's position in the sheet (blank rows were skipped).
  let n = 0;
  const positions = [];
  values.slice(1).forEach((r, i) => { if (r.some(v => v !== '' && v !== null)) positions[n++] = i + 2; });
  return { headers, rows, positions };
}

function updateRow_(name, table, index, patch) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const row = table.positions[index];
  const current = sh.getRange(row, 1, 1, table.headers.length).getValues()[0];
  table.headers.forEach((h, i) => { if (h in patch) current[i] = patch[h]; });
  sh.getRange(row, 1, 1, table.headers.length).setValues([current]);
  Object.assign(table.rows[index], patch);
}

function appendRows_(name, rows) {
  if (!rows.length) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function blankRow_(headers, values) {
  return headers.map(h => (h in values && values[h] !== undefined && values[h] !== null) ? values[h] : '');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY', 'The server is busy. Please try again in a few seconds.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function audit_(action, detail) {
  let who = '';
  try { who = Session.getActiveUser().getEmail(); } catch (e) { who = ''; }
  appendRows_(TAB.AUDIT, [[new Date(), who || '(web)', action, detail]]);
}

function normEmail_(s) { return String(s || '').trim().toLowerCase(); }
function isTrue_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
