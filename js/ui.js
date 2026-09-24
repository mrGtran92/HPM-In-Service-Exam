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

/* ------------------------------------------------------- error messages -- */

/* What a fellow sees for each server error code. The letter at the end is
 * for the proctor: docs/RUNBOOK.md lists what to do for each one. */
const ERROR_MESSAGES = {
  NOT_ON_ROSTER:     ['R', 'This email address isn\'t on the exam list. Check the spelling. If it is correct, please tell the proctor.'],
  EXAM_CLOSED:       ['C', 'The exam hasn\'t been opened yet. Please wait for the proctor, then click Begin again.'],
  ALREADY_SUBMITTED: ['S', 'An exam has already been submitted with this email address. Please tell the proctor.'],
  BAD_TESTER_CODE:   ['T', 'That tester code isn\'t right, or tester access is switched off.'],
  NO_FORM:           ['F', 'The exam hasn\'t been set up yet. Please tell the proctor.'],
  BUSY:              ['B', 'The exam server is busy. Wait a few seconds, then click Begin again.'],
  NETWORK:           ['N', 'Can\'t reach the exam server. Check this computer\'s Wi-Fi connection, then try again.'],
  VOID:              ['V', 'This attempt was reset by the proctor.'],
  NOT_FOUND:         ['A', 'The exam server doesn\'t recognise this attempt. Please tell the proctor.'],
  BAD_EMAIL:         ['E', 'Please enter a valid email address.'],
};

function errorLetter(code) {
  return (ERROR_MESSAGES[code] || ['X'])[0];
}

function messageFor(err) {
  const m = err && ERROR_MESSAGES[err.code];
  if (m) return `${m[1]} (Code ${m[0]})`;
  if (err && err.code) return `Something went wrong on the exam server. Please tell the proctor. (Code X: ${err.message})`;
  return (err && err.message) || 'Something went wrong. Please tell the proctor.';
}

