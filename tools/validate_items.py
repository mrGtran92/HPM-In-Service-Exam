#!/usr/bin/env python3
"""
Validate an item bank CSV before it is published as an exam form.

    python3 tools/validate_items.py tools/out/items_draft.csv
    python3 tools/validate_items.py items.csv --strict   # warnings also fail

Run this on every content change. Exit code 1 means do not publish.

ERRORS block publication. WARNINGS are things a human should look at but which
do not by themselves make the exam wrong (e.g. a missing reference).

Rows with status=retired are reported but otherwise skipped: they are excluded
from the form, so their content does not need to be exam-ready.
"""

import argparse
import csv
import re
import sys
from collections import Counter, defaultdict

CHOICES = ['a', 'b', 'c', 'd', 'e']

REPORT_DOMAINS = {
    'Pain management',
    'Non-pain symptom management',
    'Ethics & law',
    'Prognostication & hospice',
    'End-of-life & bereavement',
    'Communication',
    'Systems, quality & populations',
}

PUBLISHABLE = {'draft', 'ready'}
ALL_STATUSES = PUBLISHABLE | {'needs_review', 'needs_key_review', 'retired'}

# A stripped superscript citation can leave digits fused to a word, e.g.
# "...equivalents/day.1" or "...interactions.71011". Catch the residue.
GLUED_DIGITS = re.compile(r'[a-z\)][.,;]\d{1,6}(?:\s|$)|[a-z]\d{2,6}(?:\s|$)')
UNBALANCED_ENTITY = re.compile(r'&(?!(?:[a-zA-Z]+|#\d+);)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_path')
    ap.add_argument('--strict', action='store_true',
                    help='treat warnings as failures')
    args = ap.parse_args()

    with open(args.csv_path, newline='', encoding='utf-8') as fh:
        rows = list(csv.DictReader(fh))

    errors, warnings = [], []
    seen_ids = Counter()
    by_domain = defaultdict(int)
    counts = Counter()

    for row in rows:
        qid = (row.get('item_id') or '').strip()
        tag = f'Q{qid or "?"}'
        status = (row.get('status') or '').strip()
        counts[status] += 1

        if not qid.isdigit():
            errors.append(f'{tag}: item_id is not a number')
            continue
        seen_ids[qid] += 1

        if status not in ALL_STATUSES:
            errors.append(f'{tag}: unknown status "{status}"')

        if status == 'retired':
            continue

        if status not in PUBLISHABLE:
            warnings.append(f'{tag}: status="{status}" — not cleared for publication')

        # --- structure -----------------------------------------------------
        present = [c for c in CHOICES if (row.get('choice_' + c) or '').strip()]
        if len(present) != 5:
            errors.append(f'{tag}: has {len(present)} choices, expected 5 (A-E)')

        correct = (row.get('correct_choice_id') or '').strip().lower()
        if correct not in CHOICES:
            errors.append(f'{tag}: correct_choice_id is "{correct}", expected a-e')
        elif not (row.get('choice_' + correct) or '').strip():
            errors.append(f'{tag}: correct answer {correct.upper()} points at an empty choice')

        if not (row.get('stem') or '').strip():
            errors.append(f'{tag}: empty stem')
        if not (row.get('key_rationale') or '').strip():
            errors.append(f'{tag}: empty key_rationale')

        if correct in CHOICES:
            for c in CHOICES:
                if c == correct:
                    continue
                if not (row.get('rat_' + c) or '').strip():
                    errors.append(f'{tag}: no explanation for distractor {c.upper()}')

        # --- duplicate choice text (a real authoring slip) -----------------
        texts = [( (row.get('choice_'+c) or '').strip().lower(), c) for c in CHOICES]
        dupes = [t for t, n in Counter(t for t, _ in texts if t).items() if n > 1]
        for d in dupes:
            errors.append(f'{tag}: two choices have identical text: "{d[:60]}"')

        # --- reporting bucket ----------------------------------------------
        rd = (row.get('report_domain') or '').strip()
        if rd not in REPORT_DOMAINS:
            errors.append(f'{tag}: report_domain "{rd}" is not a known bucket')
        else:
            by_domain[rd] += 1

        # --- content hygiene ------------------------------------------------
        if not (row.get('reference') or '').strip():
            warnings.append(f'{tag}: no reference')

        for field in ['stem', 'key_rationale'] + ['choice_' + c for c in CHOICES]:
            val = row.get(field) or ''
            if GLUED_DIGITS.search(val):
                m = GLUED_DIGITS.search(val)
                warnings.append(
                    f'{tag}: {field} may have a leftover citation number near '
                    f'"...{val[max(0, m.start()-25):m.end()].strip()}"')
            if UNBALANCED_ENTITY.search(val):
                errors.append(f'{tag}: {field} contains a bare "&" that will break HTML')

    for qid, n in seen_ids.items():
        if n > 1:
            errors.append(f'Q{qid}: duplicate item_id ({n} rows)')

    # --- report -------------------------------------------------------------
    total_live = sum(v for k, v in counts.items() if k != 'retired')
    print(f'{len(rows)} rows  ({total_live} live, {counts["retired"]} retired)')
    print('\nstatus:')
    for k in ('ready', 'draft', 'needs_review', 'needs_key_review', 'retired'):
        if counts[k]:
            print(f'   {counts[k]:3}  {k}')
    print('\nlive items per reporting domain:')
    for k, v in sorted(by_domain.items(), key=lambda kv: -kv[1]):
        flag = '   <-- too few to interpret' if v < 4 else ''
        print(f'   {v:3}  {k}{flag}')

    if warnings:
        print(f'\n{len(warnings)} WARNING(S):')
        for w in warnings[:40]:
            print('   -', w)
        if len(warnings) > 40:
            print(f'   ... and {len(warnings) - 40} more')
    if errors:
        print(f'\n{len(errors)} ERROR(S) — do not publish:')
        for e in errors:
            print('   -', e)
        return 1

    if args.strict and warnings:
        print('\nFAIL: --strict and warnings present.')
        return 1
    print('\nPASS: no blocking errors.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
