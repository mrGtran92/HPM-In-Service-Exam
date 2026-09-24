/* ---------------------------------------------------------------------------
 * HIGHLIGHTER
 *
 * Select words in a question stem and a small "Highlight" button appears
 * beside the selection. Click an existing highlight to remove it.
 *
 * Highlights are stored as character offsets into the stem's plain text, not
 * as HTML, so the stem is always rendered from escaped text and a highlight can
 * never inject markup. Stems only — choices already have strike-out.
 * ------------------------------------------------------------------------- */

const highlighter = (() => {
  let pending = null;   // {start, end} for a new highlight, or {remove: index}

  /** Escaped stem HTML with <mark> around the saved ranges. */
  function stemHTML(text, ranges) {
    if (!ranges.length) return esc(text);
    let out = '', at = 0;
    ranges.forEach(([s, e], i) => {
      out += esc(text.slice(at, s))
        + `<mark class="hl" data-hl="${i}" title="Click to remove highlight">${esc(text.slice(s, e))}</mark>`;
      at = e;
    });
    return out + esc(text.slice(at));
  }

  /** Character offset of (node, offset) within root's text. */
  function offsetIn(root, node, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let total = 0, n;
    while ((n = walker.nextNode())) {
      if (n === node) return total + offset;
      total += n.textContent.length;
    }
    // node is an element boundary rather than a text node
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  }

  function stemEl() { return document.querySelector('#q-container .q-stem'); }

  function hide() {
    pending = null;
    $('hl-pop').classList.add('hidden');
  }

  function showAt(rect, label) {
    const pop = $('hl-pop');
    $('hl-pop-btn').textContent = label;
    pop.classList.remove('hidden');
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2));
    const top = rect.top - h - 8 < 8 ? rect.bottom + 8 : rect.top - h - 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function onSelectionEnd() {
    if (!document.body.classList.contains('in-exam') || state.submitted) return;
    const stem = stemEl();
    const sel = window.getSelection();
    if (!stem || !sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!stem.contains(range.startContainer) || !stem.contains(range.endContainer)) return;

    const start = offsetIn(stem, range.startContainer, range.startOffset);
    const end = offsetIn(stem, range.endContainer, range.endOffset);
    if (end - start < 1 || !range.toString().trim()) return;
    pending = { start, end };
    showAt(range.getBoundingClientRect(), 'Highlight');
  }

  function apply() {
    const item = state.item();
    if (!pending || !item) return hide();
    if (pending.remove !== undefined) state.removeHighlight(item.item_id, pending.remove);
    else state.addHighlight(item.item_id, pending.start, pending.end);
    hide();
    window.getSelection().removeAllRanges();
    renderQuestion({ stay: true });
  }

  const inPop = t => !!(t && t.closest && t.closest('#hl-pop'));

  function wire() {
    document.addEventListener('mouseup', e => {
      if (inPop(e.target)) return;
      // Let the browser finish updating the selection first.
      setTimeout(onSelectionEnd, 0);
    });
    document.addEventListener('keyup', e => { if (e.shiftKey) onSelectionEnd(); });
    document.addEventListener('mousedown', e => {
      if (!inPop(e.target)) hide();
    });
    document.addEventListener('click', e => {
      const m = e.target.closest && e.target.closest('#q-container mark.hl');
      if (!m || !window.getSelection().isCollapsed) return;
      pending = { remove: parseInt(m.dataset.hl, 10) };
      showAt(m.getBoundingClientRect(), 'Remove highlight');
    });
    window.addEventListener('scroll', hide, { passive: true });
    $('hl-pop-btn').addEventListener('mousedown', e => e.preventDefault()); // keep the selection
    $('hl-pop-btn').addEventListener('click', apply);
  }

  return { stemHTML, wire, hide };
})();
