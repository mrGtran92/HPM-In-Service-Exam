# HPM Fellow In-Service Exam

Board-style in-service examination for Hospice & Palliative Medicine fellows.
54 questions, five options each, single best answer.

> ### Status: rebuilt front end complete — backend not yet built
>
> The exam interface is finished and tested. It is **not ready to administer**, for one
> reason: the answer key still lives in the browser. Fixing that is Phase 2, which
> requires setting up the Google Sheet and Apps Script.
>
> The original 10-question pilot is untouched and still live at
> https://mrgtran92.github.io/HPM-In-Service-Exam/

## Trying it out

```bash
python3 -m http.server 8777
```

Then open http://localhost:8777. Opening `index.html` directly from Finder also works.

Either way you get a local practice version that grades in your browser and does not
touch the Google Sheet — submit as many times as you like. A banner at the top says
so. If the port is busy, a server is already running; just open the link.

Worth trying: press **R** (or "All questions") to open the navigator; flag one question
you've answered and one you haven't and reopen it; reload the page mid-exam to see it
resume.

## What's done

| Phase | Delivers | State |
|---|---|---|
| **0** | Repo, split into separate files, version control | Done |
| **1** | Word document → spreadsheet converter, content validator | Done (converter now retired) |
| **3** | 55-item interface, autosave, reliable submission | Done |
| **2** | Google Sheet + Apps Script: hidden answer key, one attempt per fellow, tester code, exam-day tools | **Built; deploying** |
| **4** | Item analysis — which questions were too easy, too hard, or not discriminating | Later |

### Phase 3 in brief

- **Question navigator** — an overlay listing all 54 with answered / unanswered /
  flagged status and filters, replacing the row of dots that doesn't scale
- **Autosave and resume** — answers survive a closed tab, a crash, or a dead laptop
- **Honest submission** — reads the server's reply, retries, and offers a downloadable
  copy if everything fails. The pilot reported success whether or not anything saved
- **Keyboard control** — A–E to answer, arrows to move, F to flag, R for the navigator
- **Accessibility** — proper radio groups, no status conveyed by color alone,
  WCAG AA contrast
- **Reference window** — ABIM lab reference ranges (searchable), the program's
  equianalgesic table, and a calculator, in a window fellows can move, resize and close
  (`js/reference-data.js`, `js/refwindow.js`)
- **Exam tools** — cross out choices (✕ button, right-click, or Shift+A–E), highlight
  words in a stem, and A−/A+ text size. All saved with progress, none sent for grading
- **Full-review PDF** — at the end, fellows save every question with their answer, the
  key and the rationales via the browser's Save as PDF. A one-page score report is
  still available separately

## Content

The question bank lives in the **Items tab of the exam's Google Sheet** — edit it
there, then use **HPM Exam › Publish exam version**. `content/items.csv` (kept out of
GitHub) is the snapshot it was imported from; the tools below still work on it for
local practice:

```bash
python3 tools/validate_items.py content/items.csv
python3 tools/make_mock_form.py content/items.csv   # refresh the local preview
```

`content/` is deliberately kept out of GitHub (it holds the answer key), so **keep a
backup copy elsewhere**. Edit it in Numbers or Google Sheets; if you use Excel, save as
**CSV UTF-8**, or symbols such as ≤ and × will be corrupted.

The September 2026 revision converts cleanly to **54 live items** across seven
reporting domains.

**Lab reference ranges** are transcribed from ABIM's January 2026 PDF into
`js/reference-data.js`. ABIM revises it every January — redo it from the new PDF
before each administration.

## Layout

| Path | Role |
|---|---|
| `index.html` | All screens |
| `css/exam.css` | All styling |
| `js/api.js` | The only connection to the backend — the swap point |
| `js/state.js` | Answers, flags, autosave |
| `js/navigator.js` | Question-navigator overlay |
| `js/refwindow.js` / `js/reference-data.js` | Reference window / lab and equianalgesic data |
| `js/highlight.js` | Stem highlighter |
| `js/exam.js` / `js/review.js` | Exam screen / results and review |
| `tools/` | Content conversion and validation |
| `apps-script/Code.gs` | The server: pasted into the Google Sheet's Apps Script editor |
| `docs/RUNBOOK.md` | Setup, exam day, troubleshooting. `docs/exam-day-guide.html` is the printable one-pager |
| `tests/gas-fake.js` | Runs Code.gs in a browser against a fake Sheet, for testing without Google |
| `dev/` | Local practice data. Gitignored — contains answer keys |

`CLAUDE.md` holds the working context: decisions made, invariants, and known pitfalls.
The full plan is at `~/.claude/plans/i-have-been-working-deep-sutherland.md`.
