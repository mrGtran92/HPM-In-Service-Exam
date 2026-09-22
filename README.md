# HPM Fellow In-Service Exam

Board-style in-service examination for Hospice & Palliative Medicine fellows.
55 questions, five options each, single best answer.

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
| **1** | Word document → spreadsheet converter, content validator | Done, re-runnable |
| **3** | 55-item interface, autosave, reliable submission | Done |
| **2** | Google Sheet + Apps Script: hidden answer key, one attempt per fellow | **Next** |
| **4** | Item analysis — which questions were too easy, too hard, or not discriminating | Later |

### Phase 3 in brief

- **Question navigator** — an overlay listing all 55 with answered / unanswered /
  flagged status and filters, replacing the row of dots that doesn't scale
- **Autosave and resume** — answers survive a closed tab, a crash, or a dead laptop
- **Honest submission** — reads the server's reply, retries, and offers a downloadable
  copy if everything fails. The pilot reported success whether or not anything saved
- **Keyboard control** — A–E to answer, arrows to move, F to flag, R for the navigator
- **Accessibility** — proper radio groups, no status conveyed by color alone,
  WCAG AA contrast
- **Print** — score and domain breakdown only, never the questions

## Content

The question bank converts from the source Word document with:

```bash
python3 tools/parse_docx.py "/path/to/Exam Edits.docx" -o tools/out/items_draft.csv
python3 tools/validate_items.py tools/out/items_draft.csv
python3 tools/make_mock_form.py tools/out/items_draft.csv   # refresh the local preview
```

All 60 source questions convert cleanly. Five are marked `retired` from the editorial
comments, leaving **55 live items** across seven reporting domains.

**Before any live administration:** Q13 and Q39 have answer-key corrections still
pending from faculty review.

## Layout

| Path | Role |
|---|---|
| `index.html` | All screens |
| `css/exam.css` | All styling |
| `js/api.js` | The only connection to the backend — the swap point |
| `js/state.js` | Answers, flags, autosave |
| `js/navigator.js` | Question-navigator overlay |
| `js/exam.js` / `js/review.js` | Exam screen / results and review |
| `tools/` | Content conversion and validation |
| `dev/` | Local practice data. Gitignored — contains answer keys |

`CLAUDE.md` holds the working context: decisions made, invariants, and known pitfalls.
The full plan is at `~/.claude/plans/i-have-been-working-deep-sutherland.md`.
