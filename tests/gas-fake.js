/* ---------------------------------------------------------------------------
 * A stand-in for Google Apps Script, for testing apps-script/Code.gs in a
 * browser without a Google account.
 *
 * It implements only the parts of SpreadsheetApp, LockService, CacheService,
 * ContentService, Utilities, Session and ScriptApp that Code.gs uses, backed
 * by in-memory "tabs". Values written to a tab are coerced the way Google
 * Sheets does when a script writes them ("12" -> 12, "TRUE" -> true), because
 * that difference is exactly the kind of thing that breaks in production.
 *
 * Usage (in the exam page, from the browser console or a test script):
 *   await fakeGas.install({ codeUrl: 'apps-script/Code.gs' });
 *   fakeGas.seed('Items', rowsIncludingHeader);   // all strings, as a CSV import
 *   fakeGas.routeFetch('https://fake.gas/exec');  // exam page now talks to it
 *   fakeGas.ui.queue(fakeGas.ui.YES);             // answers for menu dialogs
 *
 * Not part of the exam. Never loaded by index.html.
 * ------------------------------------------------------------------------- */

(function () {
  const clone = v => (v instanceof Date ? new Date(v.getTime()) : v);

  function coerce(v) {
    if (typeof v !== 'string') return v === undefined || v === null ? '' : v;
    if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16) return Number(v);
    if (/^(true|false)$/i.test(v.trim())) return v.trim().toUpperCase() === 'TRUE';
    return v;
  }

  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sheet.data[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) {
          const v = row[this.c - 1 + j];
          o.push(v === undefined ? '' : clone(v));
        }
        out.push(o);
      }
      return out;
    }
    setValues(values) {
      if (values.length !== this.nr || values.some(r => r.length !== this.nc)) {
        throw new Error(`setValues: data is ${values.length}x${values[0] && values[0].length}, range is ${this.nr}x${this.nc}`);
      }
      values.forEach((row, i) => {
        const target = this.sheet.data[this.r - 1 + i] || (this.sheet.data[this.r - 1 + i] = []);
        row.forEach((v, j) => {
          const s = typeof v === 'string' ? v : null;
          if (s !== null && s.length > 50000) throw new Error('Cell exceeds 50000 characters');
          target[this.c - 1 + j] = coerce(clone(v));
        });
      });
      fakeGas.writes++;
      return this;
    }
    setFontWeight() { return this; }
  }

  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.frozen = 0; }
    getName() { return this.name; }
    getLastRow() {
      for (let i = this.data.length - 1; i >= 0; i--) {
        if ((this.data[i] || []).some(v => v !== '' && v !== undefined && v !== null)) return i + 1;
      }
      return 0;
    }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, (r || []).length), 0); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    getRange(r, c, nr = 1, nc = 1) {
      if (r < 1 || c < 1) throw new Error('Range out of bounds');
      return new Range(this, r, c, nr, nc);
    }
    clearContents() { this.data = []; return this; }
    setFrozenRows(n) { this.frozen = n; return this; }
    protect() { const p = { setDescription: () => p, setWarningOnly: () => p }; return p; }
    activate() { fakeGas.activeTab = this.name; return this; }
  }

  const ss = {
    sheets: [],
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
    insertSheet(n) {
      if (this.getSheetByName(n)) throw new Error('A sheet named ' + n + ' already exists');
      const s = new Sheet(n); this.sheets.push(s); return s;
    },
    getSheets() { return this.sheets.slice(); },
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); },
    getSpreadsheetTimeZone() { return 'America/Los_Angeles'; },
  };

  /* Menu dialogs: tests queue the buttons and texts George would give. */
  const ui = {
    YES: 'YES', NO: 'NO', OK: 'OK', CANCEL: 'CANCEL',
    Button: { YES: 'YES', NO: 'NO', OK: 'OK', CANCEL: 'CANCEL' },
    ButtonSet: { YES_NO: 'YES_NO', OK_CANCEL: 'OK_CANCEL', OK: 'OK' },
    answers: [],
    log: [],
    queue(...a) { this.answers.push(...a); },
    alert(title, msg) {
      this.log.push([title, msg].filter(Boolean).join(' — '));
      return this.answers.length && [this.YES, this.NO, this.OK].includes(this.answers[0]) ? this.answers.shift() : this.OK;
    },
    prompt(title, msg) {
      this.log.push('PROMPT ' + title);
      const text = this.answers.length ? this.answers.shift() : '';
      return { getSelectedButton: () => (text === this.CANCEL ? this.CANCEL : this.OK), getResponseText: () => text };
    },
    createMenu() { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
  };

  const cache = new Map();
  let lockBusy = false;

  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui },
    LockService: { getScriptLock: () => ({ tryLock: () => !lockBusy, releaseLock: () => {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: k => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => { if (v.length > 100000) throw new Error('cache value too large'); cache.set(k, v); },
        remove: k => cache.delete(k),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd'
        ? d.toLocaleDateString('en-CA', { timeZone: tz })
        : d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })),
    },
    Session: { getActiveUser: () => ({ getEmail: () => 'george@test' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://fake.gas/exec' }) },
  };

  const fakeGas = window.fakeGas = {
    ss, ui, cache, writes: 0, activeTab: null,
    setBusy(b) { lockBusy = b; },

    async install({ codeUrl }) {
      Object.assign(window, globals);
      const code = await (await fetch(codeUrl, { cache: 'no-store' })).text();
      // Run Code.gs in its own function scope — in Google it has a project to
      // itself, and here its top-level consts (DOMAIN_ORDER…) would otherwise
      // collide with the exam page's. Every top-level function is exported.
      const names = [...code.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
      const exported = new Function(code + '\n;return {' + names.join(',') + '};')();
      Object.assign(window, exported);
      fakeGas.fn = exported;
      if (typeof window.doPost !== 'function') throw new Error('Code.gs did not load');
    },

    /** Put rows (header first) into a tab exactly as an uncoerced CSV import would. */
    seed(tab, rows) {
      const s = ss.getSheetByName(tab) || ss.insertSheet(tab);
      s.data = rows.map(r => r.slice());
    },

    tab(name) {
      const s = ss.getSheetByName(name);
      if (!s) return null;
      const [h, ...rows] = s.data;
      return rows.filter(r => r && r.some(v => v !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
    },

    /** Call doPost the way Google would, returning the parsed reply. */
    post(obj) {
      const out = window.doPost({ postData: { contents: JSON.stringify(obj) } });
      return JSON.parse(out.getContent());
    },

    /** Send the exam page's requests for `url` to the in-page doPost. */
    routeFetch(url) {
      const real = window.fetch.bind(window);
      window.fetch = async (u, opts) => {
        if (u !== url) return real(u, opts);
        if (fakeGas.offline) throw new TypeError('Failed to fetch');
        await new Promise(r => setTimeout(r, 30));
        const body = window.doPost({ postData: { contents: opts.body } }).getContent();
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
    },
  };
})();
