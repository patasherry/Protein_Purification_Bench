"""The board's checks on itself (boardcheck.py), on the cases from the dark mode trace of 2026-11-16."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import boardcheck as bc
import boardmap as bm
ROOT = HERE.parents[1]
bad = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  ({info})' if not ok and info else ''))
    if not ok:
        bad.append(name)

# 1. a UX report is not work, so it can never make a proposal a duplicate
check('a UX walk report is not work', not bc.is_work({'labels': [{'name': 'from-ux-test'}, {'name': 'ux-report'}]}))
check('the status page is not work', not bc.is_work({'labels': [{'name': 'status-page'}]}))
check('a board idea is work', bc.is_work({'labels': [{'name': 'from-board'}, {'name': 'queued'}]}))
check('an unlabelled issue is work', bc.is_work({'labels': []}))

# 2. a topic meeting sees the code that already deals with its topic
app = (ROOT / 'hplc-figure-bench(WF1.13).html').read_text(encoding='utf-8', errors='replace')
rows = bm.codemap_rows((ROOT / 'docs' / 'CODEMAP.md').read_text(encoding='utf-8'))
code = bc.topic_code('how should we let users switch between light and dark mode in the app?', app, rows)
check('the dark mode topic finds the existing data-theme styles', 'data-theme' in code, code[:200])
check('the dark mode topic finds prefers-color-scheme', 'prefers-color-scheme' in code)
check('topic code stays within its budget', 0 < len(code) <= 7600, len(code))
check('topic code says where each piece is', code.startswith('// ===== lines '))
check('a topic with no words in the code gives nothing', bc.topic_code('zzqx wobbleflarp', app, rows) == '')
check('stop words alone give nothing', bc.topic_words('how can we let the user do this') == [])
check('dark brings in the code words for themes', {'data-theme', 'color-scheme'} <= set(bc.topic_words('dark mode')))

# 3. coherence: a part whose base was not adopted
v = {'needs': [{'id': 'P5', 'needs': 'P2', 'why': 'it saves the choice the switch makes'}]}
adopt, held = bc.coherence(['P4', 'P5'], v, {'P1', 'P2', 'P4', 'P5'})
check('a needed proposal that was debated joins, ahead of the part that needs it', adopt == ['P4', 'P2', 'P5'], adopt)
check('nothing is held when the base can join', held == [])
adopt, held = bc.coherence(['P4', 'P5'], v, {'P4', 'P5'})
check('a part whose base was dropped is held back', adopt == ['P4'] and held and held[0][:2] == ('P5', 'P2'), (adopt, held))
check('no verdict changes nothing', bc.coherence(['P1'], {}, {'P1'}) == (['P1'], []))
check('a malformed verdict changes nothing', bc.coherence(['P1'], {'needs': ['x', {'id': 'P9'}]}, {'P1'}) == (['P1'], []))

# 7. the issue reads on its own
names = {'P2': 'Add a theme switch', 'P4': 'Lock figure backgrounds to white'}
t = bc.strip_pids('Extends P4 so proposal 2 works. P9 is gone.', names)
check('P-numbers become titles', '"Lock figure backgrounds to white"' in t and '"Add a theme switch"' in t and 'P4' not in t, t)
check('an unknown P-number does not leak', 'P9' not in t, t)
check('words like PNG are left alone', bc.strip_pids('Export a PNG at P2', names) == 'Export a PNG at "Add a theme switch"')
p = {'title': 'Lock backgrounds and text', 'change': 'also set every text fill', 'orig': {'title': 'Lock backgrounds', 'change': 'set the rect fill'}}
check('a revised proposal keeps its original', bc.original_note(p).startswith('**Original proposal:** Lock backgrounds. set the rect fill'))
check('an unrevised proposal adds nothing', bc.original_note({'title': 'a', 'change': 'b', 'orig': {'title': 'a', 'change': 'b'}}) == '' and bc.original_note({'title': 'a'}) == '')
check('the coherence prompt formats', '{' not in bc.COHERE.format(topic='', adopted='-', other='-', topic_q='q').split('Return ONE JSON')[0])

print(f'\n{len(bad)} failed' if bad else '\nall passed')
sys.exit(1 if bad else 0)
