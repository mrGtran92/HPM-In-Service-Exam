/* ---------------------------------------------------------------------------
 * API ADAPTER
 *
 * The single boundary between the UI and whatever backend is behind it.
 * Everything else in js/ calls only loadForm() and submitAttempt(), so the
 * backend can be replaced (Apps Script -> Cloudflare Worker) without the UI
 * knowing.
 *
 * ############################################################################
 * # PHASE 0 WARNING — THIS SUBMIT PATH IS KNOWN-BROKEN. DO NOT ADMINISTER.    #
 * #                                                                          #
 * # `mode:'no-cors'` produces an OPAQUE response. The promise resolves        #
 * # whether or not the server wrote anything — if Apps Script throws, hits    #
 * # quota, or was redeployed to a new URL, the fellow still sees a green      #
 * # "successfully submitted" message. This is defect #1 in the plan.          #
 * #                                                                          #
 * # It is ported unchanged ON PURPOSE so Phase 0 can be diffed against the    #
 * # original pilot for identical behavior. Phase 3 replaces this function     #
 * # with a real CORS round-trip + response parsing + retry + file fallback.   #
 * #                                                                          #
 * # Until then this build is for pipeline verification only.                  #
 * ############################################################################
 * ------------------------------------------------------------------------- */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxmCl4lQfQUsHH-wv2KNlQe0wzBKJLZeMo9LCUBfVC-oN2iC4dd4fMh5wW3R5_5Y-M-7Q/exec";
const ALLOWED_DOMAIN = "mednet.ucla.edu";

const api = {
  /**
   * Phase 0: items are bundled in js/questions.js, key included.
   * Phase 2: becomes a fetch of the server-sanitized form snapshot, with
   * correct_choice_id / key_rationale / rat_* stripped server-side.
   */
  loadForm() {
    return Promise.resolve(QUESTIONS);
  },

  /**
   * Phase 0: fire-and-hope. See the warning above.
   * Phase 2/3: POSTs item-level responses as text/plain (no preflight), reads
   * the JSON response, and returns the server's authoritative grading.
   */
  submitAttempt(payload) {
    return fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
};
