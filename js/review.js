/* ---------------------------------------------------------------------------
 * SUBMISSION, RESULTS, REVIEW
 *
 * Submission is the part the pilot got wrong. It used mode:'no-cors', whose
 * response is opaque, so the promise resolved whether or not the server had
 * stored anything — and the fellow saw "successfully submitted" either way.
 * Here the response is read, retried on failure, and the attempt is never
 * declared saved until the server says so. If every retry fails, the fellow
 * can download their attempt as a file so the work is never lost.
 * ------------------------------------------------------------------------- */

const RETRY_DELAYS_MS = [1000, 3000, 8000];

async function doSubmit() {
  state.stopServerBackup();
  window.removeEventListener('beforeunload', beforeUnload);
  clearInterval(clockTimer);

  hide('exam-screen');
  show('results-screen');
  document.body.classList.remove('in-exam');
  window.scrollTo(0, 0);

  const payload = state.submissionPayload();
  setSubmitStatus('pending', 'Submitting your answers…');

  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await api.submitAttempt(payload);
      onSubmitted(result);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        setSubmitStatus('pending',
          `Submission failed — retrying (${attempt + 1} of ${RETRY_DELAYS_MS.length})…`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  onSubmitFailed(lastErr, payload);
}

function onSubmitted(result) {
  state.submitted = true;
  state.result = result;
  state.result.byItem = {};
  result.items.forEach(i => { state.result.byItem[i.item_id] = i; });
  state.clearLocal();

  setSubmitStatus('success', 'Your answers have been recorded.');
  renderScore();
  renderSummaryGrid();
  show('results-body');
}

function onSubmitFailed(err, payload) {
  // The attempt is NOT lost: the local copy is deliberately left in place and
  // the fellow is given a file they can hand to the program.
  setSubmitStatus('error',
    'Your answers could not be sent. They are still saved on this computer. '
    + 'Please download the file below and give it to the program director — do not close this tab first.');
  $('failed-actions').classList.remove('hidden');
  $('download-attempt').onclick = () => downloadAttempt(payload);
  $('retry-submit').onclick = () => doSubmit();
  console.error('Submission failed:', err);
}

function downloadAttempt(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const who = (state.fellowEmail || 'attempt').replace(/[^a-z0-9]+/gi, '-');
  a.href = url;
  a.download = `hpm-exam-${who}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setSubmitStatus(kind, msg) {
  $('submit-status').className = 'submit-status ' + kind;
  $('submit-status').textContent = msg;
}

/* ----------------------------------------------------------------- score -- */

function renderScore() {
  const r = state.result;
  $('fellow-display').textContent =
    `${state.fellowName} · ${state.fellowEmail} · ${new Date().toLocaleDateString()}`;
  $('final-score').textContent = r.score.pct + '%';
  $('final-label').textContent =
    `${r.score.correct} of ${r.score.total} correct · ${formatDuration(state.elapsedSeconds())}`;

  // Bars, not pills: with seven domains this is the part faculty actually
  // read, and relative height is far easier to scan than a list of fractions.
  $('domain-breakdown').innerHTML = r.domains.map(d => {
    const tone = d.pct >= 80 ? 'strong' : d.pct >= 60 ? 'mid' : 'weak';
    const thin = d.total < 4;
    return `
      <div class="dbar-row">
        <div class="dbar-label">
          ${esc(d.domain)}
          ${thin ? '<span class="dbar-note" title="Too few questions to interpret reliably">n=' + d.total + '</span>' : ''}
        </div>
        <div class="dbar-track"><div class="dbar-fill ${tone}" style="width:${d.pct}%"></div></div>
        <div class="dbar-val">${d.correct}/${d.total}<span class="dbar-pct">${d.pct}%</span></div>
      </div>`;
  }).join('');
}

/* ------------------------------------------------------------------ grid -- */

let reviewFilter = 'all';
let reviewPos = 0;

function filteredItems() {
  return state.items.filter(item => {
    const id = item.item_id;
    const answered = state.isAnswered(id);
    const ok = answered && state.result.byItem[id].correct_choice_id === state.answerFor(id);
    switch (reviewFilter) {
      case 'incorrect': return answered && !ok;
      case 'unanswered': return !answered;
      case 'flagged': return state.isFlagged(id);
      default: return true;
    }
  });
}

function renderSummaryGrid() {
  const counts = { all: 0, incorrect: 0, unanswered: 0, flagged: 0 };
  state.items.forEach(item => {
    const id = item.item_id;
    const answered = state.isAnswered(id);
    const ok = answered && state.result.byItem[id].correct_choice_id === state.answerFor(id);
    counts.all++;
    if (answered && !ok) counts.incorrect++;
    if (!answered) counts.unanswered++;
    if (state.isFlagged(id)) counts.flagged++;
  });

  // "Unanswered" is its own filter, not folded into "Incorrect" as the pilot
  // had it — a question skipped and a question answered wrongly are
  // pedagogically different things.
  $('review-filters').innerHTML = [
    ['all', 'All'], ['incorrect', 'Incorrect'], ['unanswered', 'Unanswered'], ['flagged', 'Flagged'],
  ].map(([k, label]) =>
    `<button class="chip${reviewFilter === k ? ' chip-on' : ''}" data-rfilter="${k}"
       aria-pressed="${reviewFilter === k}">${label} <span class="chip-n">${counts[k]}</span></button>`
  ).join('');

  const items = filteredItems();
  if (!items.length) {
    $('summary-grid').innerHTML = `<p class="nav-empty">Nothing matches this filter.</p>`;
    return;
  }

  $('summary-grid').innerHTML = items.map(item => {
    const id = item.item_id;
    const pos = state.items.indexOf(item);
    const answered = state.isAnswered(id);
    const flagged = state.isFlagged(id);
    let base, glyph, label;
    if (!answered) { base = 'blank'; glyph = '–'; label = 'not answered'; }
    else if (state.result.byItem[id].correct_choice_id === state.answerFor(id)) {
      base = 'correct'; glyph = '✓'; label = 'correct';
    } else { base = 'incorrect'; glyph = '✗'; label = 'incorrect'; }

    return `<button class="nav-cell is-${base}${flagged ? ' is-flagged' : ''}" data-rpos="${pos}"
              aria-label="Question ${pos + 1}, ${label}${flagged ? ', flagged' : ''}">
              <span class="nav-cell-n">${pos + 1}</span>
              <span class="nav-cell-glyph" aria-hidden="true">${glyph}</span>
              ${flagged ? '<span class="nav-cell-flag" aria-hidden="true">⚑</span>' : ''}
            </button>`;
  }).join('');
}

function setReviewFilter(f) {
  reviewFilter = f;
  reviewPos = 0;
  renderSummaryGrid();
  hide('review-panel');
}

/* ---------------------------------------------------------------- review -- */

function openReview(pos) {
  reviewPos = pos;
  renderReview();
  show('review-panel');
  $('review-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeReview() { hide('review-panel'); }

function renderReview() {
  const item = state.items[reviewPos];
  const id = item.item_id;
  const key = state.result.byItem[id];
  const chosen = state.answerFor(id);
  const ok = chosen === key.correct_choice_id;

  $('review-counter').textContent = `Question ${reviewPos + 1} of ${state.items.length}`;
  $('rev-prev').disabled = reviewPos === 0;
  $('rev-next').disabled = reviewPos === state.items.length - 1;

  const nextBad = state.items.findIndex((it, i) =>
    i > reviewPos && state.answerFor(it.item_id) !== state.result.byItem[it.item_id].correct_choice_id);
  $('rev-next-wrong').classList.toggle('hidden', nextBad === -1);
  $('rev-next-wrong').onclick = () => openReview(nextBad);

  const choices = item.choices.map(c => {
    let cls = 'choice review';
    let icon = '';
    if (c.id === key.correct_choice_id) {
      cls += ' correct';
      icon = '<span class="result-icon" aria-label="correct answer">✓</span>';
    } else if (c.id === chosen) {
      cls += ' incorrect';
      icon = '<span class="result-icon" aria-label="your answer, incorrect">✗</span>';
    }
    return `<div class="${cls}">
              <span class="choice-letter" aria-hidden="true">${choiceLetter(c.id)}</span>
              <span class="choice-text">${esc(c.text)}</span>${icon}
            </div>`;
  }).join('');

  const distractors = item.choices
    .filter(c => c.id !== key.correct_choice_id && key.rationales[c.id])
    .map(c => `<p class="rationale-distractor"><strong>${choiceLetter(c.id)} is incorrect:</strong> ${esc(key.rationales[c.id])}</p>`)
    .join('');

  $('review-body').innerHTML = `
    <div class="review-head">
      <span class="domain-badge ${domainClass(item.domain)}">${esc(item.domain)}</span>
      <span class="verdict ${chosen == null ? 'blank' : ok ? 'ok' : 'bad'}">
        ${chosen == null ? '– Not answered' : ok ? '✓ Correct' : '✗ Incorrect'}
        ${state.isFlagged(id) ? ' · ⚑ Flagged' : ''}
      </span>
    </div>
    <div class="q-stem">${esc(item.stem)}</div>
    <div class="choices">${choices}</div>
    <div class="rationale">
      <p class="rationale-key"><strong>Correct answer — ${choiceLetter(key.correct_choice_id)}.</strong>
        ${esc(key.key_rationale)}</p>
      ${distractors}
      ${key.reference ? `<p class="rationale-ref">${esc(key.reference)}</p>` : ''}
    </div>`;
}

function revPrev() { if (reviewPos > 0) openReview(reviewPos - 1); }
function revNext() { if (reviewPos < state.items.length - 1) openReview(reviewPos + 1); }

/* ------------------------------------------------------------------ wire -- */

window.addEventListener('DOMContentLoaded', () => {
  $('review-filters').addEventListener('click', e => {
    const c = e.target.closest('[data-rfilter]');
    if (c) setReviewFilter(c.dataset.rfilter);
  });
  $('summary-grid').addEventListener('click', e => {
    const c = e.target.closest('[data-rpos]');
    if (c) openReview(parseInt(c.dataset.rpos, 10));
  });
  $('results-nav-btn').addEventListener('click', () =>
    navigator_.open({ mode: 'review', onPick: openReview }));
});
