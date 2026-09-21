/* ---------------------------------------------------------------------------
 * RESULTS + REVIEW — scoring, domain breakdown, summary grid, rationale panel.
 *
 * Phase 0 grades client-side against the bundled key, as the pilot did.
 * Phase 2 moves grading to the server: this module then renders the graded
 * result the server returns instead of computing it, and rationales arrive in
 * that response rather than being bundled with the page.
 * ------------------------------------------------------------------------- */

function submitExam() {
  hide('exam-screen');
  show('results-screen');

  const totalCorrect = state.answers.filter((a, i) => a === ITEMS[i].correct).length;
  const totalPct = Math.round((totalCorrect / ITEMS.length) * 100);

  const domains = {};
  ITEMS.forEach((q, i) => {
    if (!domains[q.domain]) domains[q.domain] = { correct: 0, total: 0 };
    domains[q.domain].total++;
    if (state.answers[i] === q.correct) domains[q.domain].correct++;
  });

  $('fellow-display').textContent =
    state.fellowName + ' · ' + state.fellowEmail + ' · ' + new Date().toLocaleDateString();
  $('final-score').textContent = totalPct + '%';
  $('final-label').textContent = totalCorrect + ' of ' + ITEMS.length + ' correct';

  let bHTML = '<div style="font-size:13px;font-weight:500;color:#6B6560;margin-bottom:8px;">Performance by domain</div>';
  Object.entries(domains).forEach(([name, d]) => {
    const dpct = Math.round((d.correct / d.total) * 100);
    const pc = dpct >= 80 ? 'pill-strong' : dpct >= 60 ? 'pill-mid' : 'pill-weak';
    bHTML += `<div class="domain-row"><span>${name}</span><span class="pill ${pc}">${d.correct}/${d.total} (${dpct}%)</span></div>`;
  });
  $('domain-breakdown').innerHTML = bHTML;

  renderSummaryGrid();
  sendResults(domains, totalCorrect, totalPct);
}

function sendResults(domains, totalCorrect, totalPct) {
  const statusBox = $('submit-status-box');
  statusBox.innerHTML = `<div class="submit-status pending">⏳ &nbsp;Submitting results...</div>`;

  const domainScores = {};
  Object.entries(domains).forEach(([name, d]) => { domainScores[name] = d.correct + '/' + d.total; });

  // Phase 2 replaces this rollup-only payload with item-level responses — one
  // record per item — which is what makes item analysis possible at all.
  const payload = {
    fellowName: state.fellowName,
    fellowEmail: state.fellowEmail,
    totalPct,
    totalCorrect: totalCorrect + '/' + ITEMS.length,
    durationSec: state.elapsedSeconds(),
    domains: domainScores
  };

  api.submitAttempt(payload).then(() => {
    localStorage.setItem('hpm_exam_submitted', 'true');
    // KNOWN DEFECT (plan #1): with mode:'no-cors' this runs even when the
    // server wrote nothing. Phase 3 gates it on a parsed server response.
    statusBox.innerHTML = `<div class="submit-status success">✓ &nbsp;Results successfully submitted to the program.</div>`;
  }).catch(() => {
    statusBox.innerHTML = `<div class="submit-status error">⚠ &nbsp;Submission failed — please screenshot this page and email it to the program director.</div>`;
  });
}

/* ── Summary grid ──────────────────────────────────────────────────────── */

function getFilteredIndices() {
  const all = ITEMS.map((_, i) => i);
  if (state.reviewFilter === 'incorrect') return all.filter(i => state.answers[i] !== ITEMS[i].correct);
  if (state.reviewFilter === 'flagged') return all.filter(i => state.flagged[i]);
  return all;
}

function renderSummaryGrid() {
  const grid = $('summary-grid');
  const emptyMsg = $('empty-filter-msg');
  const indices = getFilteredIndices();
  grid.innerHTML = '';

  if (indices.length === 0) {
    emptyMsg.classList.remove('hidden');
    emptyMsg.textContent = state.reviewFilter === 'flagged'
      ? 'No questions were flagged during the exam.'
      : 'No incorrect answers — well done!';
    return;
  }
  emptyMsg.classList.add('hidden');

  indices.forEach((qi, pos) => {
    const isCorrect = state.answers[qi] === ITEMS[qi].correct;
    const isSkipped = state.answers[qi] === null;
    let cls = 'q-tile', icon = '';
    if (isSkipped) { cls += ' skipped'; icon = '—'; }
    else if (state.flagged[qi]) { cls += ' flagged-tile'; icon = '⚑'; }
    else if (isCorrect) { cls += ' correct'; icon = '✓'; }
    else { cls += ' incorrect'; icon = '✗'; }
    if (state.reviewOpen && state.reviewIndex === pos) cls += ' active-tile';

    const tile = document.createElement('button');
    tile.className = cls;
    tile.innerHTML = `<span class="tile-num">Q${qi + 1}</span><span class="tile-icon">${icon}</span>`;
    tile.onclick = () => openReviewAt(pos);
    grid.appendChild(tile);
  });
}

function setFilter(f) {
  state.reviewFilter = f;
  state.reviewIndex = 0;
  state.reviewOpen = false;
  ['all', 'incorrect', 'flagged'].forEach(x => {
    $('tab-' + x).className = 'btn' + (f === x ? ' active-tab' : '');
  });
  renderSummaryGrid();
  hide('review-panel');
}

/* ── Review panel ──────────────────────────────────────────────────────── */

function openReviewAt(pos) {
  state.reviewIndex = pos;
  state.reviewOpen = true;
  renderSummaryGrid();
  renderReviewQuestion();
  show('review-panel');
  $('review-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeReview() {
  state.reviewOpen = false;
  renderSummaryGrid();
  hide('review-panel');
}

function renderReviewQuestion() {
  const indices = getFilteredIndices();
  if (indices.length === 0) return;

  const qi = indices[state.reviewIndex];
  const q = ITEMS[qi];
  const isCorrect = state.answers[qi] === q.correct;
  const cl = choiceLetter(q.correct);

  $('review-counter').textContent =
    'Question ' + (state.reviewIndex + 1) + ' of ' + indices.length + ' (' + state.reviewFilter + ')';
  $('rev-prev').disabled = state.reviewIndex === 0;
  $('rev-next').disabled = state.reviewIndex === indices.length - 1;

  let choicesHTML = '';
  q.choices.forEach((c, ci) => {
    let cls = 'choice-btn';
    let icon = '';
    if (ci === q.correct) {
      cls += ' correct';
      icon = '<span class="result-icon" style="color:#0F6E56">✓</span>';
    } else if (ci === state.answers[qi]) {
      cls += ' incorrect';
      icon = '<span class="result-icon" style="color:#A32D2D">✗</span>';
    }
    choicesHTML += `<button class="${cls}" disabled><span class="choice-letter">${choiceLetter(ci)}.</span><span class="choice-text">${c}</span>${icon}</button>`;
  });

  const distHTML = q.rationale.distractors
    .map(d => `<div class="rationale-distractor"><p><strong>Choice ${d.label}:</strong> ${d.text}</p></div>`)
    .join('');

  const yourAnswer = state.answers[qi] !== null
    ? choiceLetter(state.answers[qi]) + '. ' + q.choices[state.answers[qi]]
    : 'Not answered';

  $('review-q-container').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span class="domain-badge ${q.domainClass}">${q.domain}</span>
      <span style="font-size:13px;font-weight:500;color:${isCorrect ? '#0F6E56' : '#A32D2D'}">${isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
    </div>
    <div class="q-num">Question ${qi + 1} of ${ITEMS.length}${state.flagged[qi] ? ' · ⚑ Flagged' : ''}</div>
    <div class="q-stem">${q.stem}</div>
    <div class="q-lead">${q.lead}</div>
    <div class="choices" style="margin-bottom:12px;">${choicesHTML}</div>
    <div style="font-size:13px;color:#6B6560;margin-bottom:4px;">Your answer: <strong>${yourAnswer}</strong></div>
    <div style="font-size:13px;color:#0F6E56;margin-bottom:12px;">Correct answer: <strong>${cl}. ${q.choices[q.correct]}</strong></div>
    <div class="rationale">
      <div class="rationale-key">Correct answer — Choice ${cl}: ${q.rationale.key}</div>
      ${distHTML}
      <div class="rationale-ref">${q.rationale.ref}</div>
    </div>`;
}

function revPrev() {
  if (state.reviewIndex > 0) { state.reviewIndex--; renderReviewQuestion(); renderSummaryGrid(); }
}
function revNext() {
  if (state.reviewIndex < getFilteredIndices().length - 1) { state.reviewIndex++; renderReviewQuestion(); renderSummaryGrid(); }
}

/* ── Print ─────────────────────────────────────────────────────────────── */

let _filterBeforePrint = 'all';
window.addEventListener('beforeprint', () => {
  _filterBeforePrint = state.reviewFilter;
  if (state.reviewFilter !== 'all') setFilter('all');
});
window.addEventListener('afterprint', () => {
  if (_filterBeforePrint !== 'all') setFilter(_filterBeforePrint);
});
