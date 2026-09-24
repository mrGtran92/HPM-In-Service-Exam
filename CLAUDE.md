# HPM Fellow In-Service Exam — project context

Read this before doing anything else in this repo.

## Who this is for

George Tran, a palliative care physician and program director. **He has no coding
background.** Explain in plain language, avoid jargon, and when a technical term is
unavoidable, define it in the same breath. He is sharp and asks excellent questions —
several design decisions here came from him catching real problems. Do not
oversimplify the substance; simplify the vocabulary.

Things that have confused him before, worth pre-empting:
- "server", "local server", "port" — he reads these as infrastructure he must own.
  The "server" is just the Apps Script attached to his Google Sheet.
- "the answer key reaches the browser" — the useful framing was a test booklet with
  the answer key stapled to the back page.
- Background processes. Don't leave a dev server running and then hand him a command
  to start another one; it fails with "Address already in use" and reads as a bug.

## What this is

A board-style in-service examination for Hospice & Palliative Medicine fellows.
Replaces a 10-question single-file HTML pilot that had accumulated sixteen
near-identical copies in `~/Downloads`.

**Administration: 8 fellows, in person, same room, same time, proctored.** This is the
single most important fact about the design. The room prevents cheating; the software's
job is tamper-resistance and not losing anyone's work. Do not add anti-cheating
machinery — it was considered and deliberately rejected as redundant.

## Current status

**The exam is in under two weeks (before ~Oct 7, 2026).** Prioritise what the
administration needs over nice-to-haves.


| Phase | State |
|---|---|
| 0 — repo, file split, pipeline | **Done.** Commit `e75485d` |
| 1 — Word → CSV converter + validator | **Done; converter retired Sep 23 2026.** Commit `59bb20f` |
| 3 — 55-item UI, autosave, submission | **Done.** Commits `2ccef8e`, `17ee445`, `824bee8`, `c35ea15` |
| 3b — 54-item revision, reference window, exam tools, full-review PDF | **Done** (Sep 23 2026) |
| 2 — Apps Script backend | **Built and tested against a fake Sheet** (`tests/gas-fake.js`). Next: deploy with George, set `SCRIPT_URL`, full rehearsal |
| 4 — item analysis | Not started |

Work happens on branch `rebuild`, which branches off `main`. **`main` still serves the
original working pilot** at https://mrgtran92.github.io/HPM-In-Service-Exam/ and must
stay that way until Phase 2 is done and tested. Switching is a deliberate later step.

**Nothing has been pushed to GitHub yet** — no credentials on this machine. GitHub
Desktop is the recommended route; George has only ever used the GitHub website.

The full plan, including the threat model, lives at
`~/.claude/plans/i-have-been-working-deep-sutherland.md`.

## Decisions already made — do not relitigate

| Decision | Choice | Why |
|---|---|---|
| Stakes | Summative | Answer key must never reach the browser |
| Administration | In person, all 8 at once, proctored | The room handles cheating |
| Key release | Everything immediately on submit | Safe *because* everyone tests simultaneously |
| Identity | Typed email, roster-checked | No access code — proctor verifies identity. The roster is a **data-quality** control (catches typos that orphan a score), not a security one |
| Options per item | Five (A–E) | Source bank uses 5; the pilot assumed 4 |
| Timing | Soft timer, no cutoff | Records `duration_sec`, never force-submits |
| Devices | Laptop expected; warn below 820px | Warning, never a hard block |
| Autosave | Local + throttled server backup | Local authoritative; server only consulted when local is absent |
| Resume | Any machine before submit; George may unlock after | Every unlock writes an `AuditLog` row |
| Printing / later review | One-page score report, **plus** a full-review PDF (questions, answer, key, rationales) the fellow saves at submit | George, Sep 2026: fellows need to study asynchronously. He chose this over a login-based review knowing the bank leaves as forwardable files. There is no way back in after the results page closes |
| Reference material | Floating, non-modal window: ABIM lab ranges, equianalgesic table, calculator | Mirrors board-exam software. Non-modal so the stem stays readable. Below 820px it is a bottom sheet |
| Exam tools | Strike-out, stem highlighter, 3-step text size | Board-exam parity. Scratch marks are saved with progress but never graded |
| Domain labels | Hidden during the exam; after submit only in the score breakdown, not on each reviewed question | Seeing "Ethics & law" before the stem cues the answer — a validity issue, not cosmetic |
| Content column width | Do NOT widen | Measured: line length is already at the top of the comfortable range. The empty margins are doing useful work; bigger type is the fix for density |
| Google Sheet | Fresh one; old kept as archive | New structure shares almost nothing with the pilot sheet |

## Architecture

Static front end (GitHub Pages) → Apps Script web app → Google Sheets as the database.

`js/api.js` is the **only** seam between UI and backend. It exposes `startAttempt`,
`saveProgress`, `submitAttempt`. Nothing else in `js/` knows about transport. Keep it
that way — it is what makes the backend swappable.

Apps Script was chosen over Cloudflare/Supabase because it adds **zero new vendors**:
the data already lives in Sheets and George maintains this alone.

### Non-negotiable invariants

1. **No external scripts, stylesheets or fonts.** Zero third-party dependencies is a
   deliberate security property — a compromised CDN could read answers or inject code.
2. **The served form carries no key material.** No `correct_choice_id`,
   `key_rationale`, `rat_*` or `reference`. Absent, not null.
3. **No per-answer validation during the exam** — any response difference leaks
   correctness.
4. **Flag is an overlay on the base state, never a competing state.** A flagged-and-
   answered item must look different from a flagged-and-blank one. The pilot got this
   wrong and it made flagging useless.
5. **Never encode status by color alone.** Every state carries a glyph. Verify under a
   greyscale filter.
6. **`correct_choice_id` is a stable id (`a`–`e`), never a position.**

## Repo layout

| Path | Role |
|---|---|
| `index.html` | All screens; script load order matters |
| `css/exam.css` | All styling |
| `js/config.js` | `CONFIG.BACKEND` (`'mock'` \| `'live'`), domain list, thresholds |
| `js/api.js` | Backend adapter — the swap point |
| `js/state.js` | Answers, flags, two-layer autosave. All writes go through setters |
| `js/navigator.js` | The question-navigator overlay |
| `js/refwindow.js` | Reference window: labs, equianalgesic, calculator. Non-modal |
| `js/reference-data.js` | Lab ranges + equianalgesic table (not key material) |
| `js/highlight.js` | Stem highlighter (offsets, never stored HTML) |
| `js/exam.js` | Start gate, question rendering, keyboard |
| `js/review.js` | Submission, results, rationale review |
| `content/items.csv` | **THE MASTER item bank.** Gitignored (answer keys; repo is public). Edit here, never in Word |
| `content/roster.csv` | 8 fellows (email, name, role). Gitignored. Seeds the Sheet's Roster tab |
| `content/history/` | Record of the text corrections baked in at retirement |
| `tools/parse_docx.py` | **Retired** Word → CSV migration. Refuses to overwrite `content/items.csv` |
| `tools/validate_items.py` | Content gate. Errors block publication |
| `tools/make_mock_form.py` | Generates the gitignored `dev/` fixtures |
| `dev/` | **Gitignored.** Contains answer keys. Never commit, never deploy |

## Running it locally

```bash
python3 -m http.server 8777     # then http://localhost:8777
```

Opening `index.html` directly from Finder also works — `dev/mock-data.js` exists
specifically because browsers block `fetch()` on `file://` URLs.

Check whether a server is already running before starting one:
`lsof -nP -i :8777`

## Phase 2 backend — how it works

- **`apps-script/Code.gs`** is pasted into the Sheet's Apps Script editor as ONE file.
  After changing it, George redeploys with *Manage deployments › New version* (same
  URL). A *New deployment* changes the URL and breaks the page.
- **Grading happens only in Code.gs.** The served form has `item_id`, `stem`,
  `choices` — no key, rationales, titles or domains (titles and domains cue answers).
  Domains reach the page in the submit reply.
- **Switches live in the Config tab**: `exam_open` (fellows only; closing stops new
  starts but never blocks resume or submit), `tester_code`, `form_version`.
- **Testers**: page URL + `#tester` reveals a code box. Any email, unlimited runs,
  `kind=test`, never counted. Deliberately not a named-email backdoor: with typed
  emails and no passwords, a fellow could impersonate a named tester and see the key.
- **Submit is idempotent**: a retried submit returns the stored result.
- **Error codes → letters** in `ERROR_MESSAGES` (js/ui.js); RUNBOOK and
  `docs/exam-day-guide.html` list the fix for each. Keep all three in sync.
- **Testing without Google**: `tests/gas-fake.js` runs the real Code.gs against
  in-memory tabs inside the exam page and routes the page's fetches to it. It caught
  a progress-save bug (missing `attempt_id`) that would have silently disabled server
  backup and the status board in production. Seed data must come from
  `content/` into a scratch copy, never into the repo.

## Gotchas that have already cost time

- **Asset caching.** `index.html` references css/js with `?v=<datestamp>`. **Bump it on
  every css/ or js/ change — all eleven references.** A stale stylesheet once made a
  correct fix look like it had done nothing, and two measurement rounds were wasted
  before checking whether the CSS had actually loaded.
- **Screenshots in `browser_batch` lag the DOM.** A screenshot batched after an action
  can show the previous state. Twice this looked like a bug and wasn't. Read the DOM
  with `javascript_tool` to verify; take screenshots as their own call.
- **Regenerate fixtures after content changes**, or the preview shows old questions:
  `python3 tools/validate_items.py content/items.csv && python3 tools/make_mock_form.py content/items.csv`
- **`content/items.csv` has no backup by default.** It is not in git and this Mac's
  Desktop is not synced to iCloud. Remind George to keep a copy elsewhere until the
  bank moves into the Google Sheet (Phase 2), which then becomes the master.
- **Excel's plain "CSV" format is not UTF-8** and mangles ≤, ×, μ and dashes. Save as
  "CSV UTF-8", or edit in Numbers/Google Sheets. The validator rejects a non-UTF-8 file.
- **Tester codes must contain letters.** Sheets turns `0123` into the number 123.
- **The in-app preview cannot read `~/Desktop`** (macOS privacy block — the server
  starts but returns errors). To preview from Claude, copy `index.html css js dev` to
  the scratchpad and serve from there. George's own Terminal is unaffected.
- **`beforeunload` cannot be verified by script.** Chrome suppresses it without a real
  user gesture. Untested, not broken.
- Something auto-commits single files with GitHub-web-style messages
  ("Create parse_docx.py"). Harmless; content was identical. Cause unidentified.

## Open items

**Content, owned by faculty:**
- **`content/items.csv` is the master (George's decision, Sep 23 2026).** The Word
  file is retired as a source. 54 items. The two pending key corrections are settled
  and confirmed by George. The Sep 23 typo fixes and content decisions are baked in;
  the list is in `content/history/` (gitignored).
- **Never write answer keys, rationale content or correct choices into this file or
  any committed file.** The repo is public. Refer to items by number only.
- **Communication stays at 3 items** (George, Sep 23 2026). The results screen already
  marks it n=3. Do not keep raising it.
- **All 9 `needs_review` items were cleared to `ready`** by George, Sep 23 2026.
- **References are not needed** for this administration. Leave `reference` empty.
- **Lab ranges** (`js/reference-data.js`) come from ABIM's January 2026 PDF. Redo from
  the new PDF each January.

**Engineering:**
- **Deploy Phase 2 with George** (RUNBOOK Part 1), paste the `/exec` URL into
  `CONFIG.SCRIPT_URL` (that alone switches the page to live), then a full rehearsal
  with 2–3 testers.
- Archive the pilot's old Apps Script deployment once the switch is made; its URL has
  been public since June and is unauthenticated.
- Pushing to GitHub (GitHub Desktop) is needed before fellows can open the page.
- Governance: the Sheet is on a personal Gmail account, not UCLA Workspace. Raised
  twice, George is aware. Do not keep pressing it.
