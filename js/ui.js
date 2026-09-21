/* ---------------------------------------------------------------------------
 * SHARED UI PRIMITIVES — modal, element helpers.
 * ------------------------------------------------------------------------- */

const $ = id => document.getElementById(id);

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showModal(title, body, btns) {
  $('modal-title').textContent = title;
  $('modal-body').textContent = body;
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
}

function closeModal() { hide('modal-overlay'); }

/* Letter label for a choice position: 0 -> "A". */
function choiceLetter(i) { return String.fromCharCode(65 + i); }
