/* ---------------------------------------------------------------------------
 * EXAM SCREEN
 *
 * Start gate, question rendering, sticky header, keyboard control, submit.
 *
 * Choices render as a real radio group (role="radiogroup" / role="radio").
 * The pilot used plain <button> elements, which a screen reader announces as
 * a series of unrelated buttons rather than "option 2 of 5, selected" — not
 * acceptable for a formal assessment.
 * ------------------------------------------------------------------------- */

let clockTimer = null;

/* ------------------------------------------------------------ start gate -- */

window.addEventListener('DOMContentLoaded', () => {
  navigator_.wire();
  highlighter.wire();
  wireKeyboard();
  textSize.apply();

  if (window.innerWidth < CONFIG.MIN_COMFORTABLE_WIDTH) show('small-screen-warning');
  if (api.isMock()) show('mock-banner');
  if (TESTER_MODE) { show('tester-field'); hide('email-hint'); }

  const saved = state.readLocal();
  if (saved && saved.email) offerResume(saved);
});

function offerResume(saved) {
  const answered = Object.keys(saved.answers || {}).length;
  show('resume-banner');
  $('resume-text').innerHTML =
    `Unfinished exam found for <strong>${esc(saved.email)}</strong> — `
    + `${answered} question${answered === 1 ? '' : 's'} answered.`;
  $('resume-go').onclick = () => resumeAttempt(saved);
  $('resume-discard').onclick = () => {
    showModal('Discard saved progress?',
      '<p>This permanently deletes the saved answers on this computer. It cannot be undone.</p>',
      [{ label: 'Keep it', cls: 'btn', isCancel: true, action: closeModal },
       { label: 'Discard', cls: 'btn danger', action: () => { state.clearLocal(); closeModal(); hide('resume-banner'); } }]);
  };
}

async function resumeAttempt(saved) {
  hide('resume-banner');
  setStartBusy(true, 'Restoring your exam…');
  try {
    const r = await api.startAttempt({ name: saved.name, email: saved.email, testerCode: saved.testerCode });
    launch(r, { name: saved.name, email: saved.email, testerCode: saved.testerCode }, saved);
  } catch (err) {
    setStartBusy(false);
    startError(messageFor(err));
  }
}

/* Testers reach a hidden code box through the exam link with #tester on the
 * end. Nothing about it is visible to fellows. Tester runs may use any email
 * address; the server checks the code and keeps these runs out of results. */
const TESTER_MODE = location.hash.toLowerCase() === '#tester';

function validateEmail() {
  const val = $('fellow-email').value.trim();
  const errEl = $('email-error');
  const input = $('fellow-email');
  if (!val) { errEl.textContent = ''; input.classList.remove('error'); return true; }
  const bad = TESTER_MODE
    ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)
    : !val.toLowerCase().endsWith('@' + CONFIG.ALLOWED_DOMAIN);
  if (bad) {
    errEl.textContent = TESTER_MODE ? 'Please enter a valid email address.'
                                    : 'Please use your @' + CONFIG.ALLOWED_DOMAIN + ' address.';
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    return false;
  }
  errEl.textContent = '';
  input.classList.remove('error');
  input.removeAttribute('aria-invalid');
  return true;
}

function clearEmailError() {
  $('email-error').textContent = '';
  $('fellow-email').classList.remove('error');
  $('fellow-email').removeAttribute('aria-invalid');
}

function setStartBusy(busy, msg) {
  $('btn-begin').disabled = busy;
  $('btn-begin').textContent = busy ? (msg || 'Starting…') : 'Begin exam';
}

function startError(msg) {
  $('start-error').textContent = msg;
  $('start-error').classList.remove('hidden');
}

async function startExam() {
  const name = $('fellow-name').value.trim();
  if (!name) { $('name-error').textContent = 'Please enter your full name.'; return; }
  $('name-error').textContent = '';
  if (!validateEmail()) return;
  const email = $('fellow-email').value.trim();
  const testerCode = TESTER_MODE ? $('tester-code').value.trim() : '';
  if (TESTER_MODE && !testerCode) { startError('Enter the tester code.'); return; }

  $('start-error').classList.add('hidden');
  setStartBusy(true);
  try {
    const r = await api.startAttempt({ name, email, testerCode });
    launch(r, { name, email, testerCode }, state.readLocal());
  } catch (err) {
    setStartBusy(false);
    startError(messageFor(err));
  }
}

/**
 * Where a resumed attempt's answers come from:
 *   - this computer's copy, if it belongs to the SAME attempt (freshest);
 *   - otherwise the server's copy (the fellow has moved laptops);
 *   - never a local copy of a different attempt — e.g. one the proctor reset
 *     with "Allow a retake" — which must not leak old answers into a fresh start.
 */
function launch(r, who, localCopy) {
  const sameAttempt = localCopy && localCopy.email === who.email &&
    (api.isMock() || localCopy.attemptId === r.attempt_id);
  const restore = sameAttempt ? localCopy : (r.server_progress || null);

  state.begin({
    attemptId: r.attempt_id,
    items: r.form.items,
    name: who.name,
    email: who.email,
    kind: r.kind,
    testerCode: who.testerCode,
    restore,
  });
  state.onSaveStateChange(renderSaveState);
  state.persist();                     // record the attempt id locally at once
  $('hdr-test').classList.toggle('hidden', state.kind !== 'test');

  hide('start-screen');
  show('exam-screen');
  document.body.classList.add('in-exam');

  clockTimer = setInterval(renderClock, 1000);
  renderQuestion();
  window.addEventListener('beforeunload', beforeUnload);

  if (restore) announce('Exam resumed at question ' + (state.current + 1));
}

function beforeUnload(e) {
  if (state.submitted) return;
  e.preventDefault();
  e.returnValue = '';
}

/* ------------------------------------------------------------- rendering -- */

function renderClock() {
  $('hdr-clock').textContent = formatDuration(state.elapsedSeconds());
}

function renderSaveState(kind) {
  const el = $('hdr-save');
  if (kind === 'local-failed') {
    el.textContent = 'Saved online';
    el.className = 'hdr-save warn';
    el.title = 'This browser is blocking local storage, so progress is being kept on the server only.';
  } else {
    el.textContent = 'Saved';
    el.className = 'hdr-save ok';
    el.title = 'Your answers are saved automatically.';
  }
}

function renderHeader() {
  const total = state.items.length;
  const answered = state.answeredCount();
  $('hdr-position').textContent = `Question ${state.current + 1} of ${total}`;
  $('hdr-stats').innerHTML =
    `${answered} answered &middot; ${total - answered} left`
    + (state.flaggedCount() ? ` &middot; ${state.flaggedCount()} flagged` : '');
  $('progress-fill').style.width = Math.round((answered / total) * 100) + '%';
  $('progress-wrap').setAttribute('aria-valuenow', answered);
  $('progress-wrap').setAttribute('aria-valuemax', total);
}

function renderQuestion(opts = {}) {
  const item = state.item();
  const chosen = state.answerFor(item.item_id);
  const flagged = state.isFlagged(item.item_id);

  renderHeader();
  renderClock();

  const highlights = state.highlightsFor(item.item_id);

  // The strike button sits beside the radio, not inside it: a button nested
  // in a role="radio" is announced ambiguously by screen readers.
  const choices = item.choices.map(c => {
    const sel = c.id === chosen;
    const struck = state.isStruck(item.item_id, c.id);
    const L = choiceLetter(c.id);
    return `<div class="choice-row">
              <div role="radio" tabindex="${sel || (!chosen && c.id === item.choices[0].id) ? 0 : -1}"
                   aria-checked="${sel}" data-choice="${c.id}"
                   class="choice${sel ? ' selected' : ''}${struck ? ' struck' : ''}">
                <span class="choice-letter" aria-hidden="true">${L}</span>
                <span class="choice-text">${esc(c.text)}${struck ? '<span class="sr-only"> (struck out)</span>' : ''}</span>
              </div>
              <button class="strike-btn${struck ? ' on' : ''}" data-strike="${c.id}"
                      aria-pressed="${struck}" ${sel ? 'disabled' : ''}
                      aria-label="${struck ? 'Restore' : 'Strike out'} choice ${L}"
                      title="${sel ? 'This is your answer' : (struck ? 'Restore' : 'Strike out') + ' choice ' + L + ' (Shift+' + L + ')'}">
                <span aria-hidden="true">✕</span>
              </button>
            </div>`;
  }).join('');

  $('q-container').innerHTML = `
    <article class="card">
      <div class="q-head">
        <!-- No domain label during the exam. Seeing "Ethics & law" before
             reading the stem narrows the reasoning and cues the answer. The
             domain stays on the item in the Sheet, so faculty analytics and
             the fellow's own post-submission breakdown are unaffected. -->
        <span class="q-counter">Question ${state.current + 1} of ${state.items.length}</span>
        ${highlights.length ? '<button class="link-btn" id="hl-clear">Clear highlights</button>' : ''}
        <button class="flag-btn${flagged ? ' on' : ''}" id="flag-btn"
                aria-pressed="${flagged}" title="Flag for review (F)">
          <span aria-hidden="true">${flagged ? '⚑' : '⚐'}</span>
          ${flagged ? 'Flagged' : 'Flag for review'}
        </button>
      </div>
      <h2 class="q-heading" id="q-heading" tabindex="-1">Question ${state.current + 1}</h2>
      <div class="q-stem">${highlighter.stemHTML(item.stem, highlights)}</div>
      <div class="choices" role="radiogroup" aria-labelledby="q-heading" id="choices">${choices}</div>
    </article>`;

  $('btn-prev').disabled = state.current === 0;
  const last = state.current === state.items.length - 1;
  $('btn-next').classList.toggle('hidden', last);
  $('btn-finish').classList.toggle('hidden', !last);

  $('flag-btn').onclick = () => toggleFlagCurrent();
  if ($('hl-clear')) $('hl-clear').onclick = () => { state.clearHighlights(item.item_id); renderQuestion({ stay: true }); };
  $('choices').addEventListener('click', e => {
    const s = e.target.closest('[data-strike]');
    if (s) { toggleStrike(s.dataset.strike); return; }
    const el = e.target.closest('[data-choice]');
    if (el) selectChoice(el.dataset.choice);
  });
  // Right-click strikes out, as in board-exam software.
  $('choices').addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-choice]');
    if (!el || el.dataset.choice === chosen) return;
    e.preventDefault();
    toggleStrike(el.dataset.choice);
  });
  highlighter.hide();

  // Long stems make this necessary: without it a fellow lands mid-stem on
  // every navigation. `stay` is for changes to the SAME question (answer,
  // strike, highlight, flag) — jumping to the top then would pull the fellow
  // away from the choice they just clicked.
  if (!opts.stay) {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    $('q-heading').focus({ preventScroll: true });
  }
  navigator_.refresh();
}

/* --------------------------------------------------------------- actions -- */

function selectChoice(choiceId) {
  state.setAnswer(state.item().item_id, choiceId);
  renderQuestion({ stay: true });
  const el = document.querySelector(`[data-choice="${choiceId}"]`);
  if (el) el.focus({ preventScroll: true });
}

function toggleStrike(choiceId) {
  const id = state.item().item_id;
  if (state.answerFor(id) === choiceId) return;
  state.toggleStrike(id, choiceId);
  const struck = state.isStruck(id, choiceId);
  renderQuestion({ stay: true });
  const btn = document.querySelector(`[data-strike="${choiceId}"]`);
  if (btn) btn.focus({ preventScroll: true });
  announce(`Choice ${choiceLetter(choiceId)} ${struck ? 'struck out' : 'restored'}`);
}

function toggleFlagCurrent() {
  state.toggleFlag(state.item().item_id);
  renderQuestion({ stay: true });
  announce(state.isFlagged(state.item().item_id) ? 'Flagged' : 'Flag removed');
}

function goTo(pos) { state.goTo(pos); renderQuestion(); }
function nextQ() { if (state.current < state.items.length - 1) goTo(state.current + 1); }
function prevQ() { if (state.current > 0) goTo(state.current - 1); }

function openNavigator(filter) {
  navigator_.open({ mode: 'exam', filter: filter || 'all', onPick: goTo });
}

/* -------------------------------------------------------------- keyboard -- */

function wireKeyboard() {
  document.addEventListener('keydown', e => {
    if (!document.body.classList.contains('in-exam')) return;
    if (state.submitted) return;
    if (focusTrap.isActive()) return;                 // overlay owns the keys
    // Typing in the lab search or the calculator must never answer or flag.
    if (refWindow.owns(e.target)) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();
    const item = state.item();
    if (!item) return;

    if (/^[a-e]$/.test(k) && item.choices.some(c => c.id === k)) {
      e.preventDefault();
      if (e.shiftKey) toggleStrike(k); else selectChoice(k);
    } else if (k === 'l') { e.preventDefault(); refWindow.open(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nextQ(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prevQ(); }
    else if (k === 'f') { e.preventDefault(); toggleFlagCurrent(); }
    else if (k === 'r') { e.preventDefault(); openNavigator(); }
  });
}

/* ------------------------------------------------------------ text size -- */

/* Three steps of question text size. Bigger type, not a wider column, is the
 * fix for density — see CLAUDE.md. A per-browser preference, not part of the
 * attempt. */
const textSize = (() => {
  const KEY = 'hpm_text_size';
  const STEPS = ['', 'text-lg', 'text-xl'];
  let step = 0;
  try { step = Math.max(0, Math.min(STEPS.length - 1, parseInt(localStorage.getItem(KEY), 10) || 0)); } catch (e) { /* default */ }

  function apply() {
    STEPS.forEach(c => c && document.body.classList.remove(c));
    if (STEPS[step]) document.body.classList.add(STEPS[step]);
    const down = $('txt-down'), up = $('txt-up');
    if (down) down.disabled = step === 0;
    if (up) up.disabled = step === STEPS.length - 1;
  }
  function change(delta) {
    step = Math.max(0, Math.min(STEPS.length - 1, step + delta));
    try { localStorage.setItem(KEY, step); } catch (e) { /* fine */ }
    apply();
    announce(['Normal', 'Large', 'Largest'][step] + ' text');
  }
  return { apply, change };
})();

/* ---------------------------------------------------------------- finish -- */

function attemptFinish() {
  const missing = state.unansweredItems();
  if (missing.length) {
    const positions = missing.map(i => 'Q' + (state.items.indexOf(i) + 1));
    const shown = positions.slice(0, 12).join(', ') + (positions.length > 12 ? `, and ${positions.length - 12} more` : '');
    showModal(
      `${missing.length} question${missing.length === 1 ? '' : 's'} unanswered`,
      `<p>These will be marked incorrect if you submit now:</p>
       <p class="modal-list">${shown}</p>`,
      [
        { label: 'Review them', cls: 'btn primary', isCancel: true,
          action: () => { closeModal(); openNavigator('unanswered'); } },
        { label: 'Submit anyway', cls: 'btn danger', action: () => { closeModal(); doSubmit(); } },
      ]);
  } else {
    showModal('Submit exam?',
      `<p>All ${state.items.length} questions are answered. Once submitted, your answers cannot be changed.</p>`,
      [{ label: 'Go back', cls: 'btn', isCancel: true, action: closeModal },
       { label: 'Submit', cls: 'btn primary', action: () => { closeModal(); doSubmit(); } }]);
  }
}
