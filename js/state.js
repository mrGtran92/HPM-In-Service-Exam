/* ---------------------------------------------------------------------------
 * EXAM STATE + TWO-LAYER AUTOSAVE
 *
 * Local  (localStorage, every change)  survives tab close, crash, sleep.
 * Server (throttled, ~30s)             survives the laptop dying outright.
 *
 * Local is authoritative while the exam runs; the server copy is consulted
 * only when there is no local copy — i.e. the fellow has moved machines. A
 * network outage degrades to local-only and re-syncs silently; the fellow is
 * never interrupted and never sees an error from the backup path.
 *
 * Every mutation goes through a setter so persistence has exactly one hook.
 * ------------------------------------------------------------------------- */

const state = {
  attemptId: null,
  items: [],
  current: 0,
  answers: {},        // item_id -> choice_id
  flags: {},          // item_id -> true
  fellowName: '',
  fellowEmail: '',
  startedAt: null,
  submitted: false,
  result: null,       // server grading, populated after submit

  // Results-screen review state
  reviewFilter: 'all',
  reviewIndex: 0,

  _saveTimer: null,
  _dirty: false,
  _lastSaved: null,
  _onSaveStateChange: null,

  /* ------------------------------------------------------------- setup -- */

  begin({ attemptId, items, name, email, restore }) {
    this.attemptId = attemptId;
    this.items = items;
    this.fellowName = name;
    this.fellowEmail = email;
    this.current = 0;
    this.answers = {};
    this.flags = {};
    this.startedAt = new Date();
    this.submitted = false;

    if (restore) {
      this.answers = restore.answers || {};
      this.flags = restore.flags || {};
      this.current = Math.min(restore.current || 0, items.length - 1);
      if (restore.startedAt) this.startedAt = new Date(restore.startedAt);
      if (restore.attemptId) this.attemptId = restore.attemptId;
    }
    this._startServerBackup();
  },

  /* ----------------------------------------------------------- mutation -- */

  setAnswer(itemId, choiceId) {
    this.answers[itemId] = choiceId;
    this.persist();
  },

  toggleFlag(itemId) {
    if (this.flags[itemId]) delete this.flags[itemId];
    else this.flags[itemId] = true;
    this.persist();
  },

  goTo(i) {
    this.current = Math.max(0, Math.min(i, this.items.length - 1));
    this.persist();
  },

  /* ------------------------------------------------------------ queries -- */

  item(i) { return this.items[i === undefined ? this.current : i]; },
  answerFor(itemId) { return this.answers[itemId] ?? null; },
  isFlagged(itemId) { return !!this.flags[itemId]; },
  isAnswered(itemId) { return this.answers[itemId] != null; },

  answeredCount() { return this.items.filter(i => this.isAnswered(i.item_id)).length; },
  flaggedCount() { return this.items.filter(i => this.isFlagged(i.item_id)).length; },
  unansweredItems() { return this.items.filter(i => !this.isAnswered(i.item_id)); },

  elapsedSeconds() {
    return this.startedAt ? Math.round((Date.now() - this.startedAt.getTime()) / 1000) : 0;
  },

  snapshot() {
    return {
      attemptId: this.attemptId,
      email: this.fellowEmail,
      name: this.fellowName,
      answers: this.answers,
      flags: this.flags,
      current: this.current,
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      savedAt: new Date().toISOString(),
    };
  },

  submissionPayload() {
    return {
      attempt_id: this.attemptId,
      email: this.fellowEmail,
      name: this.fellowName,
      duration_sec: this.elapsedSeconds(),
      responses: this.items.map(i => ({
        item_id: i.item_id,
        choice_id: this.answerFor(i.item_id),
        flagged: this.isFlagged(i.item_id),
      })),
    };
  },

  /* -------------------------------------------------------- persistence -- */

  persist() {
    if (this.submitted) return;
    this._dirty = true;
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.snapshot()));
      this._lastSaved = new Date();
      this._emitSaveState('saved');
    } catch (e) {
      // Private mode, or storage full. The exam must continue regardless —
      // the server backup is then the only safety net, which is precisely
      // why there are two layers.
      this._emitSaveState('local-failed');
    }
  },

  /** Read a local copy without committing to it. */
  readLocal() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  clearLocal() {
    try { localStorage.removeItem(CONFIG.STORAGE_KEY); } catch (e) { /* nothing to do */ }
  },

  _startServerBackup() {
    clearInterval(this._saveTimer);
    this._saveTimer = setInterval(() => {
      if (!this._dirty || this.submitted) return;
      const snap = this.snapshot();
      this._dirty = false;
      api.saveProgress(snap).catch(() => {
        // Backup only. Local storage already holds this; retry next tick.
        this._dirty = true;
      });
    }, CONFIG.SERVER_SAVE_INTERVAL_MS);
  },

  stopServerBackup() { clearInterval(this._saveTimer); this._saveTimer = null; },

  onSaveStateChange(fn) { this._onSaveStateChange = fn; },
  _emitSaveState(s) { if (this._onSaveStateChange) this._onSaveStateChange(s, this._lastSaved); },
};
