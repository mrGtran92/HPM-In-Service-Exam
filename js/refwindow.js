/* ---------------------------------------------------------------------------
 * REFERENCE WINDOW — lab values, equianalgesic table, calculator
 *
 * Modelled on board-exam software: a floating window the fellow can drag,
 * resize and close while still reading the question underneath. It is
 * deliberately NOT modal (no focus trap, no dimmed backdrop) — the whole point
 * is to look at a lab range and the stem at the same time.
 *
 * Keys typed inside the window (search box, calculator) must never reach the
 * exam's A–E / F / arrow shortcuts; exam.js checks refWindow.owns(target).
 *
 * Position, size and last tab are a per-browser convenience in localStorage,
 * wrapped in try/catch: losing them costs nothing.
 * ------------------------------------------------------------------------- */

const refWindow = (() => {
  const PREFS_KEY = 'hpm_refwin';
  const SHEET_QUERY = window.matchMedia(`(max-width: ${CONFIG.MIN_COMFORTABLE_WIDTH - 1}px)`);
  let built = false, opener = null, groups = null, quietUntil = 0;

  /* --------------------------------------------------------------- prefs -- */

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
  }
  function writePrefs(patch) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch })); } catch (e) { /* fine */ }
  }

  /* ---------------------------------------------------------------- labs -- */

  /** LAB_TEXT -> [{rows: [{depth, name, value}], text}] */
  function parseLabs() {
    const out = [];
    REFERENCE.LAB_TEXT.split('\n').forEach(line => {
      if (!line.trim()) return;
      const depth = Math.floor((line.length - line.trimStart().length) / 2);
      const t = line.trim();
      const group = out[out.length - 1];
      if (t.startsWith('+')) {                      // continuation of a value
        const row = group.rows[group.rows.length - 1];
        row.value += '\n' + t.slice(1).trim();
        return;
      }
      const [name, value = ''] = t.split(' | ');
      const row = { depth, name, value };
      if (depth === 0) out.push({ rows: [row] });
      else group.rows.push(row);
    });
    out.forEach(g => {
      g.text = norm(g.rows.map(r => r.name + ' ' + r.value).join(' '));
      g.name = norm(g.rows[0].name);
    });
    return out;
  }

  /** Lowercase, drop punctuation and subscripts, so "PaCO2", "paco₂" and
   *  "Pa-CO2" all match. */
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080))
      .replace(/[^a-z0-9]+/g, '');
  }

  function renderLabs(query) {
    const q = query.trim().toLowerCase();
    // A known abbreviation means that test only: "na" as a plain substring
    // would match half the list (natriuretic, carcinoembryonic, ...).
    const needle = norm(REFERENCE.labAliases[q] || q);
    let shown = groups;
    if (needle) {
      // Tests whose name starts with the search first, then name matches,
      // then matches anywhere in the group (sub-rows, values).
      const rank = g => g.name.startsWith(needle) ? 0 : g.name.includes(needle) ? 1 : 2;
      shown = groups.filter(g => g.text.includes(needle))
        .map((g, i) => [rank(g), i, g]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
    }

    $('ref-lab-count').textContent = q
      ? `${shown.length} of ${groups.length} tests`
      : `${groups.length} tests`;
    $('ref-lab-table').innerHTML = shown.length
      ? shown.map(g => '<tbody>' + g.rows.map(r => `
          <tr class="${r.value ? '' : 'ref-subhead'}">
            <th scope="row" style="padding-left:${8 + r.depth * 14}px">${esc(r.name)}</th>
            <td>${esc(r.value).replace(/\n/g, '<br>')}</td>
          </tr>`).join('') + '</tbody>').join('')
      : `<tbody><tr><td class="ref-empty">No test matches “${esc(query)}”.</td></tr></tbody>`;
  }

  /* ------------------------------------------------------- equianalgesic -- */

  function renderEquianalgesic() {
    const t = REFERENCE.equianalgesic;
    $('ref-panel-equi').innerHTML = `
      <table class="ref-table ref-equi">
        <thead><tr>${t.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map(r => `<tr><th scope="row">${esc(r[0])}</th>${
          r.slice(1).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  }

  /* ---------------------------------------------------------- calculator -- */

  /* A basic handheld: each operator applies to the running total, left to
   * right, like the calculator on the ABIM exam. No eval(). */
  const calc = { acc: null, op: null, entry: '0', fresh: true };

  function calcDisplay(text) {
    $('calc-display').textContent = text;
    $('calc-display').setAttribute('aria-label', 'Calculator display ' + text);
  }

  function fmt(n) {
    if (!isFinite(n)) return 'Error';
    return String(parseFloat(n.toPrecision(12)));
  }

  function applyOp(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
    }
    return b;
  }

  function calcPress(k) {
    if (/^[0-9]$/.test(k)) {
      calc.entry = calc.fresh || calc.entry === '0' ? k : calc.entry + k;
      calc.fresh = false;
    } else if (k === '.') {
      if (calc.fresh) { calc.entry = '0.'; calc.fresh = false; }
      else if (!calc.entry.includes('.')) calc.entry += '.';
    } else if (k === '⌫') {
      if (!calc.fresh) calc.entry = calc.entry.length > 1 ? calc.entry.slice(0, -1) : '0';
    } else if (k === 'C') {
      Object.assign(calc, { acc: null, op: null, entry: '0', fresh: true });
    } else if ('+−×÷'.includes(k)) {
      if (calc.op && !calc.fresh) calc.acc = applyOp(calc.acc, calc.op, parseFloat(calc.entry));
      else if (calc.acc === null || !calc.op) calc.acc = parseFloat(calc.entry);
      calc.op = k;
      calc.fresh = true;
      calcDisplay(fmt(calc.acc) + ' ' + k);
      return;
    } else if (k === '=') {
      if (calc.op) {
        const r = applyOp(calc.acc, calc.op, parseFloat(calc.entry));
        calc.entry = fmt(r);
        Object.assign(calc, { acc: null, op: null, fresh: true });
        if (calc.entry === 'Error') { calcDisplay('Error'); calc.entry = '0'; return; }
      }
    }
    calcDisplay((calc.op ? fmt(calc.acc) + ' ' + calc.op + ' ' : '') + (calc.fresh && calc.op ? '' : calc.entry));
  }

  const KEY_MAP = { '*': '×', 'x': '×', '/': '÷', '-': '−', '+': '+', 'Enter': '=', '=': '=',
                    'Backspace': '⌫', 'Escape': null, 'c': 'C', 'C': 'C', 'Delete': 'C', '.': '.' };

  function renderCalculator() {
    const keys = ['C', '⌫', '÷', '×', '7', '8', '9', '−', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];
    $('ref-panel-calc').innerHTML = `
      <div class="calc" id="calc" tabindex="0" aria-label="Calculator. Type numbers and + − × ÷, Enter for equals.">
        <div class="calc-display" id="calc-display" role="status">0</div>
        <div class="calc-keys">${keys.map(k =>
          `<button type="button" class="calc-key${'+−×÷='.includes(k) ? ' op' : ''}${k === '0' ? ' zero' : ''}${k === '=' ? ' eq' : ''}"
                   data-k="${k}" aria-label="${{ '÷': 'divide', '×': 'times', '−': 'minus', '+': 'plus', '⌫': 'backspace', 'C': 'clear', '=': 'equals' }[k] || k}">${k}</button>`
        ).join('')}</div>
      </div>`;
    $('calc').addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (b) calcPress(b.dataset.k);
    });
    $('calc').addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = /^[0-9]$/.test(e.key) ? e.key : KEY_MAP[e.key];
      if (k === undefined || k === null) return;
      // Enter on a focused calculator button should press that button, not "=".
      if (e.key === 'Enter' && e.target.closest('[data-k]')) return;
      e.preventDefault();
      calcPress(k);
    });
  }

  /* ---------------------------------------------------------------- tabs -- */

  function selectTab(name) {
    ['equi', 'labs', 'calc'].forEach(t => {
      const on = t === name;
      $('ref-tab-' + t).setAttribute('aria-selected', on);
      $('ref-tab-' + t).tabIndex = on ? 0 : -1;
      $('ref-panel-' + t).classList.toggle('hidden', !on);
    });
    writePrefs({ tab: name });
  }

  function focusTab(name) {
    selectTab(name);
    if (name === 'labs') $('ref-lab-search').focus();
    else if (name === 'calc') $('calc').focus();
    else $('ref-tab-' + name).focus();
  }

  /* ------------------------------------------------------- drag / resize -- */

  function clampIntoView() {
    const w = $('ref-window');
    if (SHEET_QUERY.matches || w.classList.contains('hidden')) return;
    const r = w.getBoundingClientRect();
    const left = Math.max(0, Math.min(r.left, window.innerWidth - Math.min(r.width, window.innerWidth)));
    const top = Math.max(0, Math.min(r.top, window.innerHeight - 48));
    w.style.left = left + 'px';
    w.style.top = top + 'px';
  }

  function wireDrag() {
    const bar = $('ref-titlebar'), w = $('ref-window');
    let dx = 0, dy = 0, dragging = false;
    bar.addEventListener('pointerdown', e => {
      if (SHEET_QUERY.matches || e.button !== 0 || e.target.closest('button')) return;
      const r = w.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      dragging = true;
      try { bar.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      e.preventDefault();
    });
    bar.addEventListener('pointermove', e => {
      if (!dragging) return;
      w.style.left = (e.clientX - dx) + 'px';
      w.style.top = (e.clientY - dy) + 'px';
      clampIntoView();
    });
    bar.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      writePrefs({ left: parseInt(w.style.left, 10), top: parseInt(w.style.top, 10) });
    });

    // Resizing is native CSS (resize: both); just remember the result — but
    // only a size the fellow chose, not one forced by a screen-width change
    // or by placeFromPrefs() itself.
    let t = null;
    SHEET_QUERY.addEventListener('change', () => {
      quietUntil = Date.now() + 1000;
      if (!SHEET_QUERY.matches && !w.classList.contains('hidden')) placeFromPrefs();
    });
    new ResizeObserver(() => {
      if (SHEET_QUERY.matches || w.classList.contains('hidden') || Date.now() < quietUntil) return;
      clearTimeout(t);
      t = setTimeout(() => writePrefs({ width: w.offsetWidth, height: w.offsetHeight }), 300);
    }).observe(w);
    window.addEventListener('resize', clampIntoView);
  }

  function placeFromPrefs() {
    const w = $('ref-window'), p = readPrefs();
    quietUntil = Date.now() + 500;
    if (SHEET_QUERY.matches) {
      // The sheet's size comes from CSS; clear any inline floating geometry.
      w.style.width = w.style.height = w.style.left = w.style.top = '';
      return;
    }
    const width = Math.min(p.width || 460, window.innerWidth - 16);
    const height = Math.min(p.height || Math.round(window.innerHeight * 0.7), window.innerHeight - 16);
    w.style.width = width + 'px';
    w.style.height = height + 'px';
    w.style.left = (p.left ?? window.innerWidth - width - 16) + 'px';
    w.style.top = (p.top ?? 72) + 'px';
  }

  /* -------------------------------------------------------------- public -- */

  function build() {
    if (built) return;
    built = true;
    groups = parseLabs();
    renderEquianalgesic();
    renderLabs('');
    renderCalculator();
    $('ref-lab-source').textContent = REFERENCE.labsSource;

    $('ref-lab-search').addEventListener('input', e => renderLabs(e.target.value));
    $('ref-close').addEventListener('click', close);
    $('ref-tabs').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (t) focusTab(t.dataset.tab);
    });
    $('ref-tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const order = ['equi', 'labs', 'calc'];
      const cur = order.indexOf(e.target.dataset.tab);
      const next = order[(cur + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
      e.preventDefault();
      selectTab(next);
      $('ref-tab-' + next).focus();
    });
    $('ref-window').addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    wireDrag();
  }

  function open(tab) {
    build();
    const wasHidden = $('ref-window').classList.contains('hidden');
    if (wasHidden) opener = document.activeElement;
    $('ref-window').classList.remove('hidden');
    if (wasHidden) placeFromPrefs();
    clampIntoView();
    focusTab(tab || readPrefs().tab || 'labs');
  }

  function close() {
    $('ref-window').classList.add('hidden');
    if (opener && document.body.contains(opener)) opener.focus();
    opener = null;
  }

  function toggle() {
    if ($('ref-window').classList.contains('hidden')) open();
    else close();
  }

  function owns(el) { return !!(el && el.closest && el.closest('#ref-window')); }

  return { open, close, toggle, owns };
})();
