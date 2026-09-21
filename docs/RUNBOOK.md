# Administration Runbook

> **Stub.** Filled in during Phase 2/3, once the backend and resume behavior
> exist. Must be complete and rehearsed before the first live administration —
> and complete enough that someone other than the author can administer the exam.

## To be documented

### Before the administration
- [ ] Roster loaded into the `Roster` sheet; `active=TRUE` for current fellows
- [ ] Item bank passes `tools/validate_items.py`
- [ ] Form published/frozen; record the `form_version`
- [ ] Apps Script deployed; deployment URL matches `SCRIPT_URL` in `js/api.js`
- [ ] Dress rehearsal completed (see plan, "Verification")

### Day of
- [ ] Exam URL circulated
- [ ] Support contact available for lockouts and resume issues

### After
- [ ] Reconcile: one `Attempts` row per fellow, `item_count` `Responses` rows each
- [ ] Investigate any fellow with a missing or partial attempt
- [ ] Refresh `ItemAnalysis`; review items flagged for revision

## Known failure modes and responses

| Symptom | Cause | Response |
|---|---|---|
| _TBD Phase 3_ | | |
