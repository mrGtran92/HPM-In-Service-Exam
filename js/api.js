/* ---------------------------------------------------------------------------
 * API ADAPTER
 *
 * The only boundary between the UI and the backend. Everything else in js/
 * calls these four methods and knows nothing about transport, so swapping
 * Apps Script for something else never touches rendering code.
 *
 *   startAttempt({name, email})  -> {attempt_id, form, resumed?}
 *   saveProgress(snapshot)       -> {ok}          (fire-and-forget, throttled)
 *   submitAttempt(payload)       -> {ok, score, domains, items}
 *
 * The form returned by startAttempt carries NO answer key. Correct answers and
 * rationales exist only in the submitAttempt response, after the fellow has
 * committed. See plan, Phase 2 control 1.
 *
 * Transport note for the live backend: POSTs go out as text/plain. That keeps
 * them "simple requests" so the browser skips the CORS preflight that Apps
 * Script handles poorly — and unlike the pilot's mode:'no-cors', the response
 * is actually readable, which is what makes real error handling possible.
 * ------------------------------------------------------------------------- */

const api = (() => {

  /* ---------------------------------------------------------------- live -- */

  async function post(action, body) {
    if (!CONFIG.SCRIPT_URL) {
      throw new Error('No SCRIPT_URL configured. Set CONFIG.BACKEND to "mock" for local development.');
    }
    const res = await fetch(CONFIG.SCRIPT_URL, {
      method: 'POST',
      // Deliberately text/plain — see transport note above.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
    });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();          // throws on a non-JSON error page
    if (!data.ok) throw new Error(data.error || 'Server rejected the request');
    return data;
  }

  /* ---------------------------------------------------------------- mock -- */

  let _mockForm = null;
  let _mockKey = null;

  async function mockLoad() {
    if (_mockForm) return;
    const [f, k] = await Promise.all([
      fetch('dev/mock-form.json').then(r => r.json()),
      fetch('dev/mock-key.json').then(r => r.json()),
    ]);
    _mockForm = f;
    _mockKey = k;
  }

  function mockGrade(payload) {
    const chosen = {};
    payload.responses.forEach(r => { chosen[r.item_id] = r.choice_id; });

    const domains = {};
    const items = [];
    let correct = 0;

    _mockForm.items.forEach(item => {
      const k = _mockKey[String(item.item_id)];
      const got = chosen[item.item_id] || null;
      const ok = got !== null && got === k.correct_choice_id;
      if (ok) correct++;

      const d = domains[item.domain] || (domains[item.domain] = { correct: 0, total: 0 });
      d.total++;
      if (ok) d.correct++;

      items.push({
        item_id: item.item_id,
        correct_choice_id: k.correct_choice_id,
        key_rationale: k.key_rationale,
        rationales: k.rationales,
        reference: k.reference,
      });
    });

    const total = _mockForm.items.length;
    return {
      ok: true,
      score: { correct, total, pct: Math.round((correct / total) * 100) },
      domains: DOMAIN_ORDER
        .filter(d => domains[d])
        .map(d => ({
          domain: d,
          correct: domains[d].correct,
          total: domains[d].total,
          pct: Math.round((domains[d].correct / domains[d].total) * 100),
        })),
      items,
    };
  }

  /* -------------------------------------------------------------- public -- */

  return {
    isMock() { return CONFIG.BACKEND === 'mock'; },

    async startAttempt({ name, email }) {
      if (CONFIG.BACKEND === 'mock') {
        await mockLoad();
        // Simulate the server's roster gate and attempt-id issuance.
        return {
          ok: true,
          attempt_id: 'mock-' + Date.now(),
          form: _mockForm,
          server_progress: null,
        };
      }
      return post('start', { name, email });
    },

    /**
     * Quiet progress backup. Never surfaces an error to the fellow and never
     * blocks the exam — if it fails the local copy is still authoritative and
     * the next tick retries.
     */
    async saveProgress(snapshot) {
      if (CONFIG.BACKEND === 'mock') {
        sessionStorage.setItem('mock_server_progress', JSON.stringify(snapshot));
        return { ok: true };
      }
      return post('progress', { snapshot });
    },

    async submitAttempt(payload) {
      if (CONFIG.BACKEND === 'mock') {
        await mockLoad();
        await new Promise(r => setTimeout(r, 400));   // feel the latency
        return mockGrade(payload);
      }
      return post('submit', payload);
    },
  };
})();
