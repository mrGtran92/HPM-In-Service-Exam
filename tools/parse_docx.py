#!/usr/bin/env python3
"""
Convert the HPM question-bank Word document into a flat CSV for import into the
`Items` Google Sheet.

    python3 tools/parse_docx.py "path/to/Exam Edits.docx" -o tools/out/items_draft.csv

RETIRED (Sep 23 2026). The item bank master is now content/items.csv, edited
directly as a spreadsheet; the Word document is no longer the source. Re-running
this would rebuild the bank from Word and discard every edit made since, so it
refuses to write over content/items.csv. Kept as a record of how the bank was
migrated. The 54 text corrections applied at retirement are recorded in
content/history/corrections-applied-2026-09-23.csv.

Design notes
------------
* Superscript citation markers are STRIPPED. In the source they are typed as
  bare digits, so consecutive citations merge ("71011" = refs 7, 10, 11) with
  no delimiter. 129 of 146 distinct markers are ambiguous and cannot be
  recovered programmatically. Rather than ship plausible-looking wrong
  citations, `reference` is emitted empty for faculty to fill in.
* Editorial comments are carried into `review_notes`, and questions whose
  comments call for deletion or an answer-key change are pre-marked in
  `status`, so the Sheet arrives as a working QA list rather than raw content.
* Choices are normally typed as "A. ...". Word's auto-lettered lists render
  the letter but store only the text, so those are recognised structurally
  instead (see adopt_list_choices).
* `domain` keeps the author's fine-grained label; `report_domain` is the
  coarser bucket used for score breakdowns, so thin domains don't produce
  meaningless 0%/100% scores. See DOMAIN_BUCKETS.
"""

import argparse
import csv
import os
import re
import sys
import zipfile
from collections import defaultdict
from xml.etree import ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CHOICES = ['a', 'b', 'c', 'd', 'e']

# Fine-grained author label (matched by keyword) -> reporting bucket.
# Buckets exist so every reported score rests on enough items to interpret.
DOMAIN_BUCKETS = [
    ('PAIN MANAGEMENT',                  'Pain management'),
    ('NON-PAIN SYMPTOM',                 'Non-pain symptom management'),
    ('ETHICS',                           'Ethics & law'),
    ('PROGNOSTICATION',                  'Prognostication & hospice'),
    ('IMPENDING DEATH',                  'End-of-life & bereavement'),
    ('GRIEF',                            'End-of-life & bereavement'),
    ('PALLIATIVE CARE EMERGENCIES',      'End-of-life & bereavement'),
    ('COMMUNICATION',                    'Communication'),
    ('INTERDISCIPLINARY',                'Systems, quality & populations'),
    ('QUALITY',                          'Systems, quality & populations'),
    ('CARE ACROSS POPULATIONS',          'Systems, quality & populations'),
]

DELETE_HINTS = ('flag for deletion', 'get rid of this', 'redundant')
KEY_HINTS = ('correct answer should', 'change the correct answer',
             'need to change this to correct answer', 'correct answer as')


def bucket_for(domain_raw):
    d = (domain_raw or '').upper()
    for needle, bucket in DOMAIN_BUCKETS:
        if needle in d:
            return bucket
    return ''


def para_text(p, drop_superscript=True):
    """Plain text of a paragraph, optionally dropping superscript runs."""
    out = []
    for r in p.iter(W + 'r'):
        text = ''.join(n.text or '' for n in r.iter(W + 't'))
        rpr = r.find(W + 'rPr')
        if drop_superscript and rpr is not None:
            v = rpr.find(W + 'vertAlign')
            if v is not None and v.get(W + 'val') == 'superscript':
                # When a citation number is deleted by hand, the space after
                # it often stays superscript. Keep it, or two sentences fuse
                # ("metabolites.Fentanyl").
                if text and not text.strip():
                    out.append(' ')
                continue
        out.append(text)
    return ''.join(out)


def clean(s):
    """Tidy whitespace and the punctuation artifacts left by stripped citations."""
    s = s.replace(' ', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    # A stripped citation can leave " ." or duplicated terminal punctuation.
    s = re.sub(r'\s+([.,;:])', r'\1', s)
    s = re.sub(r'([.,;:])\1+', r'\1', s)
    return s.strip()


def load_comments(z):
    """comment id -> (author, text); empty dict if the doc has no comments."""
    try:
        root = ET.fromstring(z.read('word/comments.xml'))
    except KeyError:
        return {}
    out = {}
    for c in root.iter(W + 'comment'):
        text = ' '.join(
            ''.join(n.text or '' for n in p.iter(W + 't'))
            for p in c.iter(W + 'p')
        )
        out[c.get(W + 'id')] = (c.get(W + 'author', '?'), clean(text))
    return out


def parse(path):
    z = zipfile.ZipFile(path)
    comments = load_comments(z)
    body = ET.fromstring(z.read('word/document.xml')).find(W + 'body')

    items, cur, domain = [], None, None
    per_q_comments = defaultdict(list)

    def flush():
        if cur and cur.get('item_id'):
            adopt_list_choices(cur)
            items.append(cur)

    for el in body.iter():
        # Comment anchors appear inline; attribute them to the open question.
        if el.tag == W + 'commentRangeStart':
            cid = el.get(W + 'id')
            if cid in comments and cur:
                per_q_comments[cur['item_id']].append(comments[cid])
            continue
        if el.tag != W + 'p':
            continue

        raw = clean(para_text(el))
        if not raw:
            continue

        m = re.match(r'^DOMAIN\s+\d+[^:]*:\s*(.+)$', raw)
        if m:
            domain = clean(re.sub(r'[—–-]\s*Question.*$', '', m.group(1)))
            domain = re.sub(r'\(continued\)', '', domain, flags=re.I).strip(' -—–')
            continue

        m = re.match(r'^Question\s+(\d+)\s*[—–-]\s*(.*)$', raw)
        if m:
            flush()
            cur = {
                'item_id': int(m.group(1)),
                'title': m.group(2).strip(),
                'domain': domain or '',
                'stem_parts': [],
                'rationale_parts': [],
                'section': None,
            }
            continue

        if cur is None:
            continue  # front matter

        m = re.match(r'^([A-E])\.\s+(.*)$', raw)
        if m and cur['section'] is None:
            cur['choice_' + m.group(1).lower()] = m.group(2).strip()
            continue

        m = re.match(r'^Correct Answer:\s*([A-E])\b', raw, re.I)
        if m:
            cur['correct_choice_id'] = m.group(1).lower()
            cur['section'] = 'after_key'
            continue

        if re.match(r'^Rationale:?\s*$', raw, re.I):
            cur['section'] = 'rationale'
            continue

        m = re.match(r'^([A-E])\s+is\s+incorrect:?\s*(.*)$', raw, re.I)
        if m:
            cur['section'] = 'distractors'
            cur['rat_' + m.group(1).lower()] = m.group(2).strip()
            continue

        if cur['section'] == 'rationale':
            cur['rationale_parts'].append(raw)
        elif cur['section'] is None:
            cur['stem_parts'].append(raw)
            if el.find(W + 'pPr/' + W + 'numPr') is not None:
                cur['list_tail'] = cur.get('list_tail', 0) + 1
            else:
                cur['list_tail'] = 0

    flush()
    return items, per_q_comments


def adopt_list_choices(it):
    """Choices typed as a Word auto-lettered list carry no "A." in their text,
    so they land in the stem. If a question has no typed choices and its stem
    ends in exactly five list paragraphs, those are the choices. Anything else
    is left alone and reported as missing choices by build_rows()."""
    if any(it.get('choice_' + c) for c in CHOICES):
        return
    if it.get('list_tail') != len(CHOICES):
        return
    tail = it['stem_parts'][-len(CHOICES):]
    del it['stem_parts'][-len(CHOICES):]
    for c, text in zip(CHOICES, tail):
        it['choice_' + c] = text.strip()


def build_rows(items, per_q_comments):
    rows, problems = [], []
    for it in items:
        qid = it['item_id']
        notes = per_q_comments.get(qid, [])
        note_text = ' | '.join(f'[{a}] {t}' for a, t in notes)
        low = note_text.lower()

        if any(h in low for h in DELETE_HINTS):
            status = 'retired'
        elif any(h in low for h in KEY_HINTS):
            status = 'needs_key_review'
        elif notes:
            status = 'needs_review'
        else:
            status = 'draft'

        correct = it.get('correct_choice_id', '')
        row = {
            'item_id': qid,
            'status': status,
            'domain': it['domain'],
            'report_domain': bucket_for(it['domain']),
            'title': it['title'],
            'stem': clean(' '.join(it['stem_parts'])),
            'correct_choice_id': correct,
            'key_rationale': clean(' '.join(it['rationale_parts'])),
            'reference': '',           # deliberately blank; see module docstring
            'review_notes': note_text,
        }
        for c in CHOICES:
            row['choice_' + c] = it.get('choice_' + c, '')
            # The key's explanation lives in key_rationale, not a per-choice note.
            row['rat_' + c] = '' if c == correct else it.get('rat_' + c, '')

        # Structural checks surfaced at conversion time, not silently tolerated.
        missing = [c for c in CHOICES if not row['choice_' + c]]
        if missing:
            problems.append(f'Q{qid}: missing choice(s) {",".join(missing).upper()}')
        if not correct:
            problems.append(f'Q{qid}: no "Correct Answer:" line found')
        if not row['stem']:
            problems.append(f'Q{qid}: empty stem')
        if not row['key_rationale']:
            problems.append(f'Q{qid}: empty rationale')
        if not row['report_domain']:
            problems.append(f'Q{qid}: domain "{it["domain"]}" has no reporting bucket')
        blank_rats = [c.upper() for c in CHOICES
                      if c != correct and not row['rat_' + c]]
        if correct and blank_rats:
            problems.append(f'Q{qid}: no explanation for distractor(s) {",".join(blank_rats)}')

        rows.append(row)
    return rows, problems


FIELDS = (['item_id', 'status', 'domain', 'report_domain', 'title', 'stem']
          + ['choice_' + c for c in CHOICES]
          + ['correct_choice_id', 'key_rationale']
          + ['rat_' + c for c in CHOICES]
          + ['reference', 'review_notes'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('docx')
    ap.add_argument('-o', '--out', default='tools/out/items_draft.csv')
    args = ap.parse_args()

    master = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'content', 'items.csv'))
    if os.path.abspath(args.out) == master:
        sys.exit('Refusing to overwrite content/items.csv — it is the master item bank, '
                 'and rebuilding it from Word would discard every edit made since.')

    items, per_q = parse(args.docx)
    rows, problems = build_rows(items, per_q)

    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    with open(args.out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    by_status = defaultdict(int)
    by_bucket = defaultdict(int)
    for r in rows:
        by_status[r['status']] += 1
        by_bucket[r['report_domain']] += 1

    print(f'parsed {len(rows)} questions -> {args.out}\n')
    print('status:')
    for k in ('draft', 'needs_review', 'needs_key_review', 'retired'):
        if by_status[k]:
            print(f'   {by_status[k]:3}  {k}')
    print('\nreporting domains:')
    for k, v in sorted(by_bucket.items(), key=lambda kv: -kv[1]):
        print(f'   {v:3}  {k or "(UNMAPPED)"}')

    if problems:
        print(f'\n{len(problems)} structural problem(s):')
        for p in problems:
            print('   -', p)
        return 1
    print('\nNo structural problems found.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
