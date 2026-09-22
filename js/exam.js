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
  wireKeyboard();

  if (window.innerWidth < CONFIG.MIN_COMFORTABLE_WIDTH) show('small-screen-warning');
  if (api.isMock()) show('mock-banner');

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
    const r = await api.startAttempt({ name: saved.name, email: saved.email });
    launch(r, { name: saved.name, email: saved.email }, saved);
  } catch (err) {
    setStartBusy(false);
    startError(err.message);
  }
}

function validateEmail() {
  const val = $('fellow-email').value.trim();
  const errEl = $('email-error');
  const input = $('fellow-email');
  if (!val) { errEl.textContent = ''; input.classList.remove('error'); return true; }
  if (!val.toLowerCase().endsWith('@' + CONFIG.ALLOWED_DOMAIN)) {
    errEl.textContent = 'Please use your @' + CONFIG.ALLOWED_DOMAIN + ' address.';
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

  $('start-error').classList.add('hidden');
  setStartBusy(true);
  try {
    const r = await api.startAttempt({ name, email });
    // A server-side copy is used only when this machine has nothing — i.e.
    // the fellow has moved to a different laptop mid-exam.
    launch(r, { name, email }, r.server_progress || null);
  } catch (err) {
    setStartBusy(false);
    startError(err.message);
  }
}

function launch(r, who, restore) {
  state.begin({
    attemptId: r.attempt_id,
    items: r.form.items,
    name: who.name,
    email: who.email,
    restore,
  });
  state.onSaveStateChange(renderSaveState);

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

function renderQuestion() {
  const item = state.item();
  const chosen = state.answerFor(item.item_id);
  const flagged = state.isFlagged(item.item_id);

  renderHeader();
  renderClock();

  const choices = item.choices.map(c => {
    const sel = c.id === chosen;
    return `<div role="radio" tabindex="${sel || (!chosen && c.id === item.choices[0].id) ? 0 : -1}"
                 aria-checked="${sel}" data-choice="${c.id}"
                 class="choice${sel ? ' selected' : ''}">
              <span class="choice-letter" aria-hidden="true">${choiceLetter(c.id)}</span>
              <span class="choice-text">${esc(c.text)}</span>
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
        <button class="flag-btn${flagged ? ' on' : ''}" id="flag-btn"
                aria-pressed="${flagged}" title="Flag for review (F)">
          <span aria-hidden="true">${flagged ? '⚑' : '⚐'}</span>
          ${flagged ? 'Flagged' : 'Flag for review'}
        </button>
      </div>
      <h2 class="q-heading" id="q-heading" tabindex="-1">Question ${state.current + 1}</h2>
      <div class="q-stem">${esc(item.stem)}</div>
      <div class="choices" role="radiogroup" aria-labelledby="q-heading" id="choices">${choices}</div>
    </article>`;

  $('btn-prev').disabled = state.current === 0;
  const last = state.current === state.items.length - 1;
  $('btn-next').classList.toggle('hidden', last);
  $('btn-finish').classList.toggle('hidden', !last);

  $('flag-btn').onclick = () => toggleFlagCurrent();
  $('choices').addEventListener('click', e => {
    const el = e.target.closest('[data-choice]');
    if (el) selectChoice(el.dataset.choice);
  });

  // Long stems make this necessary: without it a fellow lands mid-stem on
  // every navigation.
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  $('q-heading').focus({ preventScroll: true });
  navigator_.refresh();
}

/* --------------------------------------------------------------- actions -- */

function selectChoice(choiceId) {
  state.setAnswer(state.item().item_id, choiceId);
  renderQuestion();
}

function toggleFlagCurrent() {
  state.toggleFlag(state.item().item_id);
  renderQuestion();
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
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();
    const item = state.item();
    if (!item) return;

    if (/^[a-e]$/.test(k) && item.choices.some(c => c.id === k)) {
      e.preventDefault(); selectChoice(k);
    } else if (e.key === 'ArrowRight') { e.preventDefault(); nextQ(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prevQ(); }
    else if (k === 'f') { e.preventDefault(); toggleFlagCurrent(); }
    else if (k === 'r') { e.preventDefault(); openNavigator(); }
  });
}

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
