# Administration Runbook

Everything needed to set up, run and troubleshoot the exam. The one-page desk
version for exam day is `docs/exam-day-guide.html` (open it in a browser and print).

The exam has two halves:

- **The exam page** (GitHub Pages). What fellows open. Holds no answers.
- **The Google Sheet and its script.** Holds the questions, the answer key, the
  roster and the results. The page talks to the script; the script is the only
  thing that ever reads the answer key.

---

## Part 1 — One-time setup (about 30 minutes)

Do this in the Google account you will administer from.

### 1. Create the Sheet and add the script

1. Go to **sheets.new** to make a blank Google Sheet. Name it, e.g.
   *HPM In-Service Exam 2026*.
2. **File › Settings › Time zone** → *(GMT-08:00) Pacific Time*. Save.
3. **Extensions › Apps Script.** A code editor opens in a new tab.
4. Delete the few lines already there. Open `apps-script/Code.gs` from this
   folder, copy all of it, and paste it in. Click the **save** (disk) icon.
5. Go back to the Sheet tab and **reload the page**. After a few seconds a new
   menu, **HPM Exam**, appears at the right of the menu bar.

### 2. Create the tabs

**HPM Exam › Set up tabs (first time only).**

Google will ask for permission the first time. This is your own script asking to
edit your own Sheet:
*Continue* → choose your account → *Advanced* → *Go to (project name) (unsafe)* → *Allow*.
"Unsafe" only means Google hasn't reviewed a script you wrote yourself.

You now have tabs: Config, Roster, Items, Attempts, Responses, Exam day, AuditLog.

### 3. Load the questions and the roster

For each, click the tab first, then:

| Tab | File to import |
|---|---|
| **Items** | `content/items.csv` |
| **Roster** | `content/roster.csv` |

**File › Import › Upload** → choose the file →
- Import location: **Replace current sheet**
- **Untick "Convert text to numbers, dates, and formulas"**
- Import data.

From now on **the Items tab is the master question bank.** Edit questions there,
not in `content/items.csv`.

### 4. Publish the exam

**HPM Exam › Publish exam version…** It checks every question (5 choices, an
answer, explanations for each wrong choice) and freezes a copy in a tab called
*Form 2026-…*. Attempts are always graded against the version they started on,
so editing Items afterwards never changes anyone's score. After editing Items,
publish again.

### 5. Deploy the script as a web app

In the Apps Script tab:

1. **Deploy › New deployment.** Click the gear next to *Select type* → **Web app**.
2. Description: *HPM exam*. **Execute as: Me.** **Who has access: Anyone.**
   (Not "Anyone with a Google account" — fellows don't sign in to Google.)
3. **Deploy**, allow permissions again, and **copy the Web app URL** (ends in `/exec`).
4. That URL goes into `js/config.js` (`SCRIPT_URL`). Claude does this step.

**Changing the script later:** paste the new code, save, then **Deploy › Manage
deployments › pencil icon › Version: New version › Deploy.** This keeps the same
URL. *New deployment* would create a different URL, and the exam page would stop
reaching it.

**Check it's alive:** paste the `/exec` URL into a browser. You should see
`"ok":true`, whether the exam is open, and the question count.

### 6. Tester access

This is set in the **Google Sheet**, not in any file in this folder.

1. Click the **Config** tab at the bottom of the Sheet. It has three rows:
   `exam_open`, `tester_code`, `form_version`.
2. In the `tester_code` row, click the empty cell in the **value** column (column B)
   and type a code word. Use **letters** (a number like `0123` loses its leading
   zero in Sheets).

If the Config tab or the `tester_code` row is missing, run **HPM Exam › Set up tabs**
again. It only adds what is missing and never changes anything already there. Testers open the exam link with
`#tester` on the end, e.g. `https://…/HPM-In-Service-Exam/#tester`, and type the
code. Test runs:
- can use any email address, as many times as they like;
- work even while the exam is closed to fellows;
- are marked `test` in Attempts and never counted.

Turn it off with **HPM Exam › Turn tester access off** before exam day.

---

## Part 2 — The day before

- [ ] **HPM Exam › Pre-exam check.** Every line should be ✓. It warns about:
  - fellows who already have an attempt (from a rehearsal with their real email)
    → **Allow a retake** for each, or they'll be blocked on the day;
  - the exam being open (it should be closed until everyone is seated);
  - tester access still on.
- [ ] **HPM Exam › Turn tester access off.**
- [ ] Open the exam link on one laptop and confirm the start screen appears.
- [ ] Print `docs/exam-day-guide.html`.

---

## Part 3 — Exam day

1. Open the Sheet on your laptop at the **Exam day** tab.
2. Fellows open the exam link, type their name and email, and click **Begin**.
   Until you open the exam they see *"The exam hasn't been opened yet" (Code C)*.
   That is expected.
3. When everyone is seated: **HPM Exam › Open exam.** Fellows click Begin again.
4. Watch the **Exam day** tab. It updates each time any fellow's answers save
   (about every 30 seconds while they're answering). **HPM Exam › Refresh
   exam-day status** forces an update.
5. When the last fellow has submitted: **HPM Exam › Close exam.**

Results are in **Attempts** (one row per fellow: score and each domain).
**Responses** has every answer to every question, for re-scoring and item analysis.

---

## Part 4 — Troubleshooting

Every error a fellow can see ends with a **code letter**.

| Code | What the fellow sees | What to do |
|---|---|---|
| **R** | Email isn't on the exam list | Usually a typo — compare with the Roster tab. If the roster is wrong, fix it there (lowercase), then they click Begin again. |
| **C** | Exam hasn't been opened yet | Expected before you open it. **HPM Exam › Open exam.** |
| **S** | Already submitted with this email | They (or a rehearsal) submitted already. If you decide to let them retake: **HPM Exam › Allow a retake…** Note they have seen the answers on the results screen. |
| **B** | Server is busy | Several fellows clicked at once. Wait 5 seconds, click Begin again. |
| **N** | Can't reach the exam server | Their Wi-Fi. Answers are safe on their laptop — they can keep working. At submit the page retries; if it still fails, see "Submit failed" below. |
| **T** | Tester code isn't right | Wrong code, or tester access is off. Check Config › `tester_code`. |
| **F** | Exam isn't set up | No version published. **HPM Exam › Publish exam version…** |
| **V** | Attempt was reset by the proctor | Expected after "Allow a retake". They reload the page and start again. |
| **A** | Server doesn't recognise this attempt | Have them **Download my answers** if offered, reload, and Begin again with the same email. |
| **X** | Something went wrong on the server | Note the message. Check the `/exec` health URL. Try again in a minute. |

**Common situations**

- **Laptop dies or browser crashes.** Reopen the exam link on any computer and
  type the same email. They continue where they left off. On a *different*
  computer, the last ~30 seconds of answers may need re-entering.
- **Page won't load at all.** It's that computer or its network: try another
  browser, check the link, or use a spare laptop (the attempt follows the email).
- **Submit failed.** The results screen says so and offers **Download my
  answers**. They download the file and hand it to you. On your laptop: open the
  file in TextEdit, select all, copy, then **HPM Exam › Add a submission from a
  downloaded file…** and paste. The Sheet records and scores it.
- **A fellow submitted by accident.** Your call. **Allow a retake…** voids the
  submitted attempt (kept in Attempts, marked `void`) and they start from
  question 1. They have already seen the answers.
- **Someone shows "In progress" but says they submitted.** They likely saw the
  submit-failed screen. Follow "Submit failed".

Every open/close, publish, retake and manual submission is written to **AuditLog**.

---

## After the administration

- [ ] **HPM Exam › Close exam.**
- [ ] Check **Attempts**: one `submitted` row per fellow (`kind` = fellow). Ignore
      `test` and `void` rows.
- [ ] Once this version has fully replaced the pilot, archive the pilot's old
      deployment (pilot's Apps Script › Deploy › Manage deployments › Archive). Its
      URL has been public since June.
