/* ---------------------------------------------------------------------------
 * EXAM SCREEN — start gate, question rendering, navigator, finish flow.
 * ------------------------------------------------------------------------- */

let ITEMS = [];

window.addEventListener('DOMContentLoaded', () => {
  // NOTE: the pilot's `?reset=true` escape hatch is removed (plan, Phase 0).
  // It let anyone clear the single-attempt lock from the URL bar, and the lock
  // itself moves server-side in Phase 2 where it cannot be bypassed at all.
  if (localStorage.getItem('hpm_exam_submitted')) {
    hide('start-screen');
    show('already-screen');
  }

  api.loadForm().then(items => { ITEMS = items; });
});

/* ── Start gate ────────────────────────────────────────────────────────── */

function validateEmail() {
  const val = $('fellow-email').value.trim();
  const errEl = $('email-error');
  const inputEl = $('fellow-email');
  if (!val) { errEl.textContent = ''; inputEl.classList.remove('error'); return true; }
  if (!val.endsWith('@' + ALLOWED_DOMAIN)) {
    errEl.textContent = 'Please use your @' + ALLOWED_DOMAIN + ' email address.';
    inputEl.classList.add('error');
    return false;
  }
  errEl.textContent = '';
  inputEl.classList.remove('error');
  return true;
}

function clearEmailError() {
  $('email-error').textContent = '';
  $('fellow-email').classList.remove('error');
}

function startExam() {
  const name = $('fellow-name').value.trim();
  if (!name) { $('name-error').textContent = 'Please enter your full name.'; return; }
  $('name-error').textContent = '';
  if (!validateEmail()) return;

  state.fellowName = name;
  state.fellowEmail = $('fellow-email').value.trim();
  state.init(ITEMS.length);

  hide('start-screen');
  show('exam-screen');
  renderQuestion();
  renderNavigator();
}

/* ── Navigator ─────────────────────────────────────────────────────────── */

function renderNavigator() {
  const grid = $('nav-grid');
  grid.innerHTML = '';
  ITEMS.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'nav-dot';
    if (i === state.current) dot.classList.add('current');
    if (state.answers[i] !== null) dot.classList.add('answered');
    if (state.flagged[i]) dot.classList.add('flagged');
    dot.textContent = i + 1;
    dot.onclick = () => jumpTo(i);
    grid.appendChild(dot);
  });
}

function jumpTo(i) { state.goTo(i); renderQuestion(); renderNavigator(); }

/* ── Question rendering ────────────────────────────────────────────────── */

function renderQuestion() {
  const i = state.current;
  const q = ITEMS[i];
  const total = ITEMS.length;

  $('progress-fill').style.width = Math.round((i / total) * 100) + '%';
  $('progress-text').textContent = 'Question ' + (i + 1) + ' of ' + total;
  $('answered-count').textContent = state.answeredCount() + ' of ' + total + ' answered';

  const selected = state.answers[i];
  let choicesHTML = '';
  q.choices.forEach((c, ci) => {
    choicesHTML += `<button class="choice-btn${ci === selected ? ' selected' : ''}" onclick="selectChoice(${ci})">
      <span class="choice-letter">${choiceLetter(ci)}.</span>
      <span class="choice-text">${c}</span>
    </button>`;
  });

  // Position-based numbering (plan, Phase 0). The pilot printed `q.id`, which
  // is the item's stable identity, not its place in the form — those diverge
  // as soon as items are filtered, reordered, or drawn from a larger bank.
  $('q-container').innerHTML = `<div class="card">
    <div class="q-num">Question ${i + 1} of ${total}</div>
    <span class="domain-badge ${q.domainClass}">${q.domain}</span>
    <div class="q-stem">${q.stem}</div>
    <div class="q-lead">${q.lead}</div>
    <div class="choices">${choicesHTML}</div>
    <div class="flag-row">
      <button class="flag-btn" onclick="toggleFlag()">
        ${state.flagged[i] ? '⚑ Flagged for review' : '⚐ Flag for review'}
      </button>
    </div>
  </div>`;

  $('btn-prev').disabled = i === 0;
  const isLast = i === total - 1;
  $('btn-next').classList.toggle('hidden', isLast);
  $('btn-finish').classList.toggle('hidden', !isLast);
}

function selectChoice(idx) { state.setAnswer(state.current, idx); renderQuestion(); renderNavigator(); }
function toggleFlag() { state.toggleFlag(state.current); renderQuestion(); renderNavigator(); }
function nextQ() { if (state.current < ITEMS.length - 1) { state.goTo(state.current + 1); renderQuestion(); renderNavigator(); } }
function prevQ() { if (state.current > 0) { state.goTo(state.current - 1); renderQuestion(); renderNavigator(); } }

/* ── Finish ────────────────────────────────────────────────────────────── */

function attemptFinish() {
  const unanswered = state.unansweredCount();
  const plural = unanswered > 1 ? 's' : '';
  if (unanswered > 0) {
    showModal(
      unanswered + ' question' + plural + ' unanswered',
      'You have ' + unanswered + ' unanswered question' + plural + '. Unanswered questions will be marked incorrect. You can return to review them, or submit now.',
      [{ label: 'Return to exam', cls: 'btn', action: closeModal },
       { label: 'Submit anyway', cls: 'btn danger', action: () => { closeModal(); submitExam(); } }]
    );
  } else {
    showModal(
      'Submit exam?',
      'You have answered all ' + ITEMS.length + ' questions. Once submitted your answers cannot be changed. Are you ready?',
      [{ label: 'Go back', cls: 'btn', action: closeModal },
       { label: 'Submit', cls: 'btn primary', action: () => { closeModal(); submitExam(); } }]
    );
  }
}
