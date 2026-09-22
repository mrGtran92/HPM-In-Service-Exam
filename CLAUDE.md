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

| Phase | State |
|---|---|
| 0 — repo, file split, pipeline | **Done.** Commit `e75485d` |
| 1 — Word → CSV converter + validator | **Done, re-runnable.** Commit `59bb20f` |
| 3 — 55-item UI, autosave, submission | **Done.** Commits `2ccef8e`, `17ee445`, `824bee8`, `c35ea15` |
| 2 — Apps Script backend | **Not started.** Needs George's Google account |
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
| Printing | Score and domains only, never questions | Keeps the item bank off paper |
| Domain labels | Hidden during the exam, shown after | Seeing "Ethics & law" before the stem cues the answer — a validity issue, not cosmetic |
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
| `js/exam.js` | Start gate, question rendering, keyboard |
| `js/review.js` | Submission, results, rationale review |
| `tools/parse_docx.py` | One-time Word → CSV. Not part of the running exam |
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

## Gotchas that have already cost time

- **Asset caching.** `index.html` references css/js with `?v=<datestamp>`. **Bump it on
  every css/ or js/ change — all eight references.** A stale stylesheet once made a
  correct fix look like it had done nothing, and two measurement rounds were wasted
  before checking whether the CSS had actually loaded.
- **Screenshots in `browser_batch` lag the DOM.** A screenshot batched after an action
  can show the previous state. Twice this looked like a bug and wasn't. Read the DOM
  with `javascript_tool` to verify; take screenshots as their own call.
- **Regenerate fixtures after content changes**, or the preview shows old questions:
  `python3 tools/make_mock_form.py tools/out/items_draft.csv`
- **`beforeunload` cannot be verified by script.** Chrome suppresses it without a real
  user gesture. Untested, not broken.
- Something auto-commits single files with GitHub-web-style messages
  ("Create parse_docx.py"). Harmless; content was identical. Cause unidentified.

## Open items

**Content, owned by faculty:**
- **Q13 and Q39 have pending answer-key corrections** from George's review with Michael
  Spiker. These must be settled before any live administration — an exam scored against
  a wrong key is the one failure that looks like success.
- 5 items are `retired`, leaving **55**. **Communication is down to 3 items**, below the
  threshold where a domain score means anything. Worth weighting replacements toward it.
- `reference` is empty on every item by design — the source document's citation markers
  were unrecoverable (129 of 146 ambiguous). Faculty fill these in.

**Engineering:**
- Phase 2 backend, then flip `CONFIG.BACKEND` to `'live'`.
- Rotate the Apps Script deployment URL. The current one has been public in the repo
  since June and is unauthenticated.
- `docs/RUNBOOK.md` is still a stub; it must be complete before the first administration.
- Governance: the Sheet is on a personal Gmail account, not UCLA Workspace. Raised
  twice, George is aware. Do not keep pressing it.
