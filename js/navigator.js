/* ---------------------------------------------------------------------------
 * QUESTION NAVIGATOR OVERLAY
 *
 * Replaces the pilot's always-visible strip of one dot per question, which at
 * 55 items becomes a wall of dots above every single question. Opens over the
 * current screen, dismissed by Esc / backdrop / close, and returns the fellow
 * exactly where they were. Standard pattern in Prometric, NBME and UWorld.
 *
 * STATE ENCODING — the rule that makes the grid worth having:
 *
 *   base state  = answered / unanswered   (or correct / incorrect in review)
 *   flag        = an OVERLAY on top of it, never a competing state
 *
 * The pilot tested `flagged` before `correct`, so every flagged tile looked
 * identical whether it was right, wrong or blank. Across 10 tiles that is
 * survivable; across 55 it destroys the entire purpose of the grid.
 *
 * Nothing is conveyed by color alone — each state also carries a glyph, so the
 * grid is readable in greyscale and by a colorblind fellow.
 * ------------------------------------------------------------------------- */

const navigator_ = (() => {
  let mode = 'exam';         // 'exam' | 'review'
  let filter = 'all';
  let onPick = null;
  let isOpen = false;

  const EXAM_FILTERS = [
    ['all', 'All'],
    ['unanswered', 'Unanswered'],
    ['flagged', 'Flagged'],
  ];
  const REVIEW_FILTERS = [
    ['all', 'All'],
    ['incorrect', 'Incorrect'],
    ['unanswered', 'Unanswered'],
    ['flagged', 'Flagged'],
  ];

  /** Status of one item: base state plus an independent flag overlay. */
  function statusOf(item) {
    const id = item.item_id;
    const answered = state.isAnswered(id);
    const flagged = state.isFlagged(id);

    if (mode === 'review' && state.result) {
      if (!answered) return { base: 'blank', glyph: '–', label: 'not answered', flagged };
      const key = state.result.byItem[id];
      const ok = key && key.correct_choice_id === state.answerFor(id);
      return ok
        ? { base: 'correct', glyph: '✓', label: 'correct', flagged }
        : { base: 'incorrect', glyph: '✗', label: 'incorrect', flagged };
    }
    return answered
      ? { base: 'answered', glyph: '●', label: 'answered', flagged }
      : { base: 'blank', glyph: '', label: 'not answered', flagged };
  }

  function passesFilter(item) {
    const s = statusOf(item);
    switch (filter) {
      case 'unanswered': return s.base === 'blank';
      case 'flagged': return s.flagged;
      case 'incorrect': return s.base === 'incorrect';
      default: return true;
    }
  }

  function render() {
    const total = state.items.length;
    const answered = state.answeredCount();

    $('nav-counts').innerHTML =
      `<strong>${answered}</strong> of ${total} answered`
      + ` &middot; <strong>${total - answered}</strong> unanswered`
      + ` &middot; <strong>${state.flaggedCount()}</strong> flagged`;

    // Filter chips
    const filters = mode === 'review' ? REVIEW_FILTERS : EXAM_FILTERS;
    $('nav-filters').innerHTML = filters.map(([k, label]) => {
      const n = state.items.filter(it => {
        const saved = filter; filter = k;
        const ok = passesFilter(it); filter = saved; return ok;
      }).length;
      return `<button class="chip${filter === k ? ' chip-on' : ''}" data-filter="${k}"
                 aria-pressed="${filter === k}">${label} <span class="chip-n">${n}</span></button>`;
    }).join('');

    // Grid, grouped by domain
    const groups = [];
    DOMAIN_ORDER.forEach(d => {
      const items = state.items.filter(i => i.domain === d && passesFilter(i));
      if (items.length) groups.push([d, items]);
    });
    const ungrouped = state.items.filter(i => !DOMAIN_ORDER.includes(i.domain) && passesFilter(i));
    if (ungrouped.length) groups.push(['Other', ungrouped]);

    if (!groups.length) {
      $('nav-body').innerHTML =
        `<p class="nav-empty">No questions match this filter.</p>`;
      return;
    }

    $('nav-body').innerHTML = groups.map(([domain, items]) => `
      <section class="nav-group">
        <h3 class="nav-group-title">${esc(domain)} <span class="nav-group-n">${items.length}</span></h3>
        <div class="nav-cells">
          ${items.map(it => cell(it)).join('')}
        </div>
      </section>`).join('');
  }

  function cell(item) {
    const s = statusOf(item);
    const pos = state.items.indexOf(item);
    const isCurrent = pos === state.current;
    const cls = [
      'nav-cell', 'is-' + s.base,
      s.flagged ? 'is-flagged' : '',
      isCurrent ? 'is-current' : '',
    ].filter(Boolean).join(' ');

    const aria = `Question ${pos + 1}, ${s.label}${s.flagged ? ', flagged' : ''}${isCurrent ? ', current' : ''}`;
    return `<button class="${cls}" data-pos="${pos}" aria-label="${aria}"
              ${isCurrent ? 'aria-current="true"' : ''}>
              <span class="nav-cell-n">${pos + 1}</span>
              <span class="nav-cell-glyph" aria-hidden="true">${s.glyph}</span>
              ${s.flagged ? '<span class="nav-cell-flag" aria-hidden="true">⚑</span>' : ''}
            </button>`;
  }

  /* --------------------------------------------------------------- open -- */

  function open(opts = {}) {
    mode = opts.mode || 'exam';
    filter = opts.filter || 'all';
    onPick = opts.onPick || null;
    isOpen = true;

    $('nav-title').textContent = mode === 'review' ? 'All questions' : 'Question navigator';
    render();
    show('nav-overlay');
    document.body.classList.add('no-scroll');
    focusTrap.activate($('nav-overlay').querySelector('.nav-panel'), close);
    announce('Question navigator opened');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    hide('nav-overlay');
    document.body.classList.remove('no-scroll');
    focusTrap.release();
  }

  function wire() {
    const ov = $('nav-overlay');

    ov.addEventListener('click', e => {
      if (e.target === ov) { close(); return; }           // backdrop

      const chip = e.target.closest('[data-filter]');
      if (chip) { filter = chip.dataset.filter; render(); return; }

      const c = e.target.closest('[data-pos]');
      if (c) {
        const pos = parseInt(c.dataset.pos, 10);
        close();
        if (onPick) onPick(pos);
        return;
      }
    });

    $('nav-close').addEventListener('click', close);
  }

  return { open, close, wire, isOpen: () => isOpen, refresh: () => { if (isOpen) render(); } };
})();
