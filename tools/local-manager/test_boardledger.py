"""Tests for boardledger.py: live capability digest extraction and persistent positive/negative ledger."""
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import boardledger as bl
import manager as mgr

ROOT = HERE.parents[1]
app = (ROOT / 'protein-purification-bench.html').read_text(encoding='utf-8', errors='replace')
cmap = (ROOT / 'docs' / 'CODEMAP.md').read_text(encoding='utf-8', errors='replace')

# 1. Live capability digest finds built features AND complete CODEMAP Data Structures (`run.path`, `gel.assign`, `protSeq`)
dig = bl.capability_digest(app, cmap, include_data_model=True)
assert 'Okabe-Ito' in dig and 'DEF' in dig and 'In-memory data model' in dig, dig[:400]
assert '`protSeq`' in dig and '`path`: UV cell path length in mm' in dig and '`assign`: Map of lane index' in dig, dig[-800:]
dig_lean = bl.capability_digest(app, cmap, include_data_model=False)
assert 'In-memory data model' not in dig_lean and len(dig_lean) <= 2800

# 1b. Sentence/word-safe prose trimming never cuts mid-word (`footno`, `cross-ch`)
s_two = 'Use gel.assign so linked pools compute monomer mg automatically. Otherwise append a concise footnote to the pool bar when unassigned.'
clipped = bl.trim_prose(s_two, 90)
assert clipped == 'Use gel.assign so linked pools compute monomer mg automatically.', clipped
s_long = 'A single long clause without punctuation that describes chromatogram fraction purity weighting across lanes'
clipped_w = bl.trim_prose(s_long, 55)
assert clipped_w.endswith('…') and 'lanes' not in clipped_w and not clipped_w.endswith('chro…'), clipped_w

# 2. Seed repo ledger + temporary local runtime ledger merge cleanly without dirtying git
with tempfile.TemporaryDirectory() as tmp:
    loc = Path(tmp) / 'local-ledger.json'
    base = bl.load_ledger(local_path=loc)
    assert any(r['key'] == '#1528' and r['kind'] == 'owner_declined' for r in base), base[:3]
    bl.record_ledger('Auto-predict dialysis buffer exchange schedule', 'owner_declined', why='Not needed right now', key='creative:test', where=['SEC panel'], local_path=loc)
    merged = bl.load_ledger(local_path=loc)
    assert any('dialysis buffer exchange' in r['title'] for r in merged)
    blk = bl.ledger_prompt_block(merged, focus_secs=['SEC panel'])
    assert '[DECLINED BY PATRICK] Auto-predict dialysis buffer exchange schedule' in blk, blk
    mem_rows = bl.ledger_for_mem(merged)
    assert any(k == 'creative:test' for k, _, _ in mem_rows)

# 3. code_for verifies existing test suites, comma-chained `LYS_KEYS`, and `where_secs`-scoped expressions
excerpt = mgr.code_for('Verify stroke width in tests/suites/42_figures.js and `PAL` palette.', limit=4000)
assert 'verified existing suite tests/suites/42_figures.js' in excerpt, excerpt[:300]
assert 'PAL in protein-purification-bench.html' in excerpt, excerpt[:500]
lys_excerpt = mgr.code_for('Check `LYS_KEYS.some(v)` in the step timeline.', limit=4500, where_secs=['the step timeline'])
assert 'in section `the step timeline`' in lys_excerpt and 'LYS_KEYS.some(v)' in lys_excerpt, lys_excerpt[:600]
assert 'LYS_KEYS in protein-purification-bench.html' in lys_excerpt, lys_excerpt

# 4. reviewer.flags scopes scientific-constant warnings to protein-purification-bench.html diffs only
non_app_diff = 'diff --git a/tools/local-manager/foo.py b/tools/local-manager/foo.py\n--- a/tools/local-manager/foo.py\n+++ b/tools/local-manager/foo.py\n+x = "PAL and LADDERS in python string"\n'
assert not any('scientific constant' in f for f in mgr.rv.flags(non_app_diff)), mgr.rv.flags(non_app_diff)
app_diff = f'diff --git a/{mgr.rv.APP} b/{mgr.rv.APP}\n--- a/{mgr.rv.APP}\n+++ b/{mgr.rv.APP}\n+const PAL = ["#000000"];\n'
assert any('scientific constant' in f for f in mgr.rv.flags(app_diff)), mgr.rv.flags(app_diff)

print('test_boardledger: all asserts passed')
