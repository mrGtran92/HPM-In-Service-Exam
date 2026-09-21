/* ---------------------------------------------------------------------------
 * EXAM STATE
 *
 * Phase 0: in-memory only, exactly as the pilot behaved.
 *
 * Phase 3 adds autosave/resume here — persisting {attempt_id, answers, flags,
 * started_at} to localStorage on every mutation and offering resume on load.
 * That is why every write goes through a setter rather than touching the
 * arrays directly: the persistence hook has one place to live.
 * ------------------------------------------------------------------------- */

const state = {
  current: 0,
  answers: [],
  flagged: [],
  fellowName: '',
  fellowEmail: '',
  startedAt: null,

  // Results-screen review state
  reviewFilter: 'all',
  reviewIndex: 0,
  reviewOpen: false,

  init(itemCount) {
    this.current = 0;
    this.answers = new Array(itemCount).fill(null);
    this.flagged = new Array(itemCount).fill(false);
    this.startedAt = new Date();
  },

  setAnswer(i, choiceIdx) {
    this.answers[i] = choiceIdx;
    this.persist();
  },

  toggleFlag(i) {
    this.flagged[i] = !this.flagged[i];
    this.persist();
  },

  goTo(i) {
    this.current = i;
  },

  answeredCount() {
    return this.answers.filter(a => a !== null).length;
  },

  unansweredCount() {
    return this.answers.filter(a => a === null).length;
  },

  /** Elapsed seconds — recorded as duration_sec on submit (soft timer). */
  elapsedSeconds() {
    return this.startedAt ? Math.round((Date.now() - this.startedAt.getTime()) / 1000) : 0;
  },

  /** Phase 3: write to localStorage. No-op in Phase 0 to preserve behavior. */
  persist() {}
};
