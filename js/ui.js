/* ---------------------------------------------------------------------------
 * SHARED UI PRIMITIVES
 *
 * Modal, overlay, focus trap, and formatting helpers.
 *
 * Focus handling is not decoration: an exam is a formal assessment, and a
 * fellow using a keyboard or screen reader has to be able to open the
 * navigator, choose a question, and land back where they started. Every
 * overlay records its opener and restores focus on close.
 * ------------------------------------------------------------------------- */

const $ = id => document.getElementById(id);

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

/** Escape text destined for innerHTML. Item content is faculty-authored, not
 *  hostile, but a stray "<" in a clinical stem should render, not vanish. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function choiceLetter(id) { return String(id || '').toUpperCase(); }

function formatDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ------------------------------------------------------------ focus trap -- */

const focusTrap = (() => {
  let container = null, opener = null, onEsc = null;

  const SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function keydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (onEsc) onEsc(); return; }
    if (e.key !== 'Tab' || !container) return;
    const items = [...container.querySelectorAll(SELECTOR)].filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return {
    activate(el, escHandler) {
      container = el;
      opener = document.activeElement;
      onEsc = escHandler;
      document.addEventListener('keydown', keydown, true);
      const first = el.querySelector(SELECTOR);
      if (first) first.focus();
    },
    release() {
      document.removeEventListener('keydown', keydown, true);
      container = null;
      onEsc = null;
      if (opener && document.body.contains(opener)) opener.focus();
      opener = null;
    },
    isActive() { return container !== null; },
  };
})();

/* ----------------------------------------------------------------- modal -- */

function showModal(title, bodyHTML, btns) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHTML;
  const bc = $('modal-btns');
  bc.innerHTML = '';
  btns.forEach(b => {
    const el = document.createElement('button');
    el.className = b.cls;
    el.textContent = b.label;
    el.onclick = b.action;
    bc.appendChild(el);
  });
  show('modal-overlay');
  focusTrap.activate($('modal-overlay').querySelector('.modal'), () => {
    const cancel = btns.find(b => b.isCancel);
    if (cancel) cancel.action();
  });
}

function closeModal() {
  focusTrap.release();
  hide('modal-overlay');
}

/** Announce something to screen readers without a visual change. */
function announce(msg) {
  const el = $('sr-live');
  if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 50); }
}
