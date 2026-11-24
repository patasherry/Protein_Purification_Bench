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
app = (ROOT / 'protein-purification-bench.html').read_text(encoding='utf-8', errors='replace')
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

# 8. merge_revision preserves full spec when delta is short (#1532, #1533)
full_spec = 'In section `composite workflow figure`, update `drawWorkflow` so lane purity badges render inside the card bounds when zoom is active and long sample labels wrap cleanly.'
short_delta = 'Also clamp badge x to card right edge.'
merged = bc.merge_revision(full_spec, short_delta)
check('short revision delta is appended rather than overwriting the full spec', full_spec in merged and 'Refinement: Also clamp badge x' in merged, merged)
full_rewrite = 'In section `composite workflow figure`, update `drawWorkflow` so lane purity badges clamp their x coordinate to card bounds and long sample labels wrap across two lines.'
check('full-length revision replaces cleanly without duplicating', bc.merge_revision(full_spec, full_rewrite) == full_rewrite)

# 9. peer_decision strips self-votes and routes adopt / relay / probe / reject
r_self, avg_self, _, _, _ = bc.peer_decision([{'by': 'Gemini', 'verdict': 'go', 'score': 5, 'why': 'mine'}], author='Gemini', n_advisers=2)
check('self-vote alone cannot adopt a proposal', r_self == 'reject' and avg_self == 0.0, (r_self, avg_self))
r_go, avg_go, _, fixes, nogos = bc.peer_decision([
    {'by': 'Gemini', 'verdict': 'go', 'score': 5, 'why': 'self'},
    {'by': 'the local AI', 'verdict': 'go_with_fixes', 'score': 4, 'why': 'solid bug', 'required_fixes': ['keep existing checks'], 'no_gos': ['do not change LADDERS']}
], author='Gemini', n_advisers=2, go_score=4)
check('peer score 4 adopts while ignoring author score 5', r_go == 'adopt' and avg_go == 4.0 and fixes == ['keep existing checks'] and nogos == ['do not change LADDERS'], (r_go, avg_go))
r_probe, _, _, _, _ = bc.peer_decision([{'by': 'the local AI', 'verdict': 'probe_only', 'score': 4, 'why': 'verify on main first'}], author='Gemini', n_advisers=2)
check('probe_only verdict routes to probe', r_probe == 'probe', r_probe)
r_luke, _, _, _, _ = bc.peer_decision([{'by': 'the local AI', 'verdict': 'go_with_fixes', 'score': 3, 'why': 'unsure if main fails'}], author='Gemini', n_advisers=2)
check('lukewarm 3/5 peer score in 2-seat board routes to probe rather than app change', r_luke == 'probe', r_luke)
r_split, avg_split, _, _, _ = bc.peer_decision([
    {'by': 'the local AI', 'verdict': 'go', 'score': 4, 'why': 'good'},
    {'by': 'ChatGPT', 'verdict': 'go_with_fixes', 'score': 3, 'why': 'borderline'}
], author='Gemini', n_advisers=3, go_score=4)
check('3-seat split 4 and 3 routes to relay', r_split == 'relay' and avg_split == 3.5, (r_split, avg_split))
r_four, avg_four, _, _, _ = bc.peer_decision([
    {'by': 'ChatGPT', 'verdict': 'go', 'score': 4, 'why': 'verified in code'},
    {'by': 'Antigravity', 'verdict': 'go_with_fixes', 'score': 4, 'why': 'checked suite'},
], author='the local AI', n_advisers=4, go_score=4)
check('4-seat board adopts when 2 independent peers score 4+ even if 1 peer seat timed out', r_four == 'adopt' and avg_four == 4.0, (r_four, avg_four))
pc = bc.probe_card({'title': 'Clamp negative absorbance in NanoDrop table', 'change': 'Update renderNanoDrop.', 'check': 'tests/suites/test_nanodrop_units.js'})
check('probe_card prefixes Test probe and keeps original', pc['title'].startswith('Test probe: ') and pc['probe'] is True and pc['orig']['title'] == 'Clamp negative absorbance in NanoDrop table', pc)

# 10. chain_adopted serializes dependent and same-section proposals (#1532/#1533)
waits = bc.chain_adopted([
    {'id': 'P1', 'where': ['gels']},
    {'id': 'P2', 'where': ['gels', 'ui']},
    {'id': 'P3', 'where': ['export']},
], {'needs': [{'id': 'P3', 'needs': 'P2'}]})
check('same-section and explicit dependencies chain in order', waits == {'P2': 'P1', 'P3': 'P2'}, waits)

# 11. standing board-tracker is not work, and extract_json_obj handles unclosed <think>, trailing code braces, and trailing commas
check('a standing board-tracker issue is not work', not bc.is_work({'labels': [{'name': 'board-tracker'}]}))
tricky = '<think>reasoning about {foo: 1} never closed... {"review": "ok", "proposals": [{"title": "Fix `fn`", "check": "const {root, texts} = box;"}],}\nExtra note: see {a, b}.'
parsed = bc.extract_json_obj(tricky)
check('extract_json_obj recovers JSON after unclosed <think>, trailing comma, and extra prose braces',
      parsed.get('review') == 'ok' and len(parsed.get('proposals', [])) == 1, parsed)

print(f'\n{len(bad)} failed' if bad else '\nall passed')
sys.exit(1 if bad else 0)
