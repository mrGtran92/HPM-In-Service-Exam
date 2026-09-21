# HPM Fellow In-Service Exam

Board-style in-service examination platform for Hospice & Palliative Medicine fellows.

> ### ⚠ Current status: Phase 0 — NOT FOR ADMINISTRATION
>
> This build is a structural port of the 10-item pilot, for verifying the
> deployment pipeline. **Do not administer it to fellows.** Two blocking defects
> remain until Phase 2/3:
>
> - The submit path uses `mode:'no-cors'` and reports success whether or not the
>   server stored anything (`js/api.js`).
> - The answer key ships to the browser in `js/questions.js`.

## Layout

| Path | Role |
|---|---|
| `index.html` | Screen markup; script load order matters |
| `css/exam.css` | All styling |
| `js/api.js` | **Backend adapter.** `loadForm()` / `submitAttempt()` — the only seam the UI knows about |
| `js/questions.js` | Pilot item bank (temporary; removed in Phase 2) |
| `js/state.js` | Answers, flags, timing; all writes go through setters so Phase 3 autosave has one hook |
| `js/ui.js` | Modal + element helpers |
| `js/exam.js` | Start gate, question rendering, navigator |
| `js/review.js` | Scoring, domain breakdown, summary grid, rationale panel |
| `apps-script/` | Backend (Phase 2, `clasp`-managed) |
| `tools/` | Item import + validation (Phase 1) |
| `docs/RUNBOOK.md` | Administration-day procedure |

## Local development

```bash
python3 -m http.server 8777
```

Then open http://localhost:8777. Serve over HTTP rather than opening the file
directly — `file://` will not represent GitHub Pages behavior once Phase 2 adds
cross-origin fetches.

## Roadmap

| Phase | Delivers |
|---|---|
| **0** ✅ | Repo, file split, GitHub Pages pipeline |
| **1** | Word/Doc → `Items` sheet importer + content validator |
| **2** | Apps Script backend: server-side grading, hidden key, roster gate, one attempt per fellow |
| **3** | Autosave/resume, real submission handling with retry, 60-item navigator, soft timer |
| **4** | Item analysis: difficulty, discrimination, distractor frequency |
| **5** | Optional: emailed access code, choice shuffling |

Full plan: `~/.claude/plans/i-have-been-working-deep-sutherland.md`
