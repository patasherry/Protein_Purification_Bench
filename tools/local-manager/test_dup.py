"""Plain asserts, no network, no model call. Imports only dupcheck.py (no manager, no config, no token): python3 tools/local-manager/test_dup.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dupcheck import words, dup_close

# The real shape: the proposal (title + change) is LONGER than the candidate's title, so min() in the denominator picks the
# candidate side. Title alone shares 6 of 10 words; title + a padded body has 17 words, so the same 6 shared words score lower.
prop = {'title': 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima',
        'change': 'mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray',
        'evidence': '', 'why': ''}
cand_title = 'alpha bravo charlie delta echo foxtrot zulu yankee xenon walrus'
cand_body = ('thimble quarry lantern pebble orchard cinder ' * 6)[:300]
cand_full = cand_title + ' ' + cand_body
pw = words(prop['title'] + ' ' + prop['change'])
ov = lambda t: len(pw & words(t)) / max(1, min(len(pw), len(words(t))))
assert len(pw) == 24 and len(words(cand_title)) == 10 and len(words(cand_full)) > len(words(cand_title)), (len(pw), len(words(cand_title)), len(words(cand_full)))
assert ov(cand_full) < 0.45 <= ov(cand_title), (ov(cand_full), ov(cand_title))

mem = {'merged': [], 'ideas': [], 'open': [('#10', cand_full)], 'titles': {'#10': cand_title}}
assert [k for k, _ in dup_close(prop, mem)[0]] == ['#10']
assert dup_close(prop, {**mem, 'titles': {}})[0] == []  # without the titles map: the old behaviour, dropped before the model

# a proposal that cites an open issue brings it to the model whatever the word overlap
cite = {'title': 'Something else entirely', 'change': 'zzz', 'evidence': 'Same defect as #123', 'why': ''}
mem2 = {'merged': [], 'ideas': [], 'open': [('#123', 'Quantum wombat harvest')], 'titles': {'#123': 'Quantum wombat harvest'}}
assert [k for k, _ in dup_close(cite, mem2)[0]] == ['#123']
assert dup_close({**cite, 'evidence': ''}, mem2)[0] == []

# biochemical synonym concept matching: Kav [0, 1] matches #1455 void-to-total range despite low surface word overlap
from dupcheck import within_round_dup
kav_prop = {'title': 'Add automatic validation flag for Kav values outside the 0 to 1 range in SEC calibration standards',
            'change': 'Inspect computed Kav values and render an inline badge when Kav < 0 or Kav > 1.', 'evidence': ''}
sec_mem = {'merged': [('PR #1455', 'Warn when SEC elution volume falls outside the column void-to-total range')], 'open': [], 'ideas': [], 'titles': {}}
assert [k for k, _ in dup_close(kav_prop, sec_mem)[0]] == ['PR #1455'], dup_close(kav_prop, sec_mem)

# ledger entries (already_on_main / owner_declined) surface in dup_close
pal_prop = {'title': 'Enforce Wong accessible color-blind palette on HPLC overlay traces', 'change': 'Map strokes to accessible hex codes.', 'evidence': ''}
led_mem = {'merged': [], 'open': [], 'ideas': [], 'titles': {}, 'ledger': [('main:PAL', 'Use Okabe-Ito color-blind-safe palette on chromatogram figures', 'already built')]}
assert [k for k, _ in dup_close(pal_prop, led_mem)[0]] == ['main:PAL'], dup_close(pal_prop, led_mem)

# within-round deduplication catches twin proposals in the same meeting
existing = [{'id': 'P1', 'title': 'Warn when SEC elution volume falls outside void-to-total range', 'change': 'Check V0 and Vt bounds.', 'where': ['SEC panel']}]
assert within_round_dup({**kav_prop, 'where': ['SEC panel']}, existing) is not None
assert within_round_dup({'title': 'Add Undo toast on run deletion', 'change': 'Restore deleted run card.', 'where': ['UI']}, existing) is None
print('ok')
