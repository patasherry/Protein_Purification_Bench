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

# 1. Live capability digest finds built features and optional data model
dig = bl.capability_digest(app, cmap, include_data_model=True)
assert 'Okabe-Ito' in dig and 'DEF' in dig and 'In-memory data model' in dig, dig[:400]
dig_lean = bl.capability_digest(app, cmap, include_data_model=False)
assert 'In-memory data model' not in dig_lean and len(dig_lean) <= 2800

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

# 3. code_for verifies existing test suite files so peer audit never falsely claims 42_figures.js is missing
excerpt = mgr.code_for('Verify stroke width in tests/suites/42_figures.js and `PAL` palette.', limit=4000)
assert 'verified existing suite tests/suites/42_figures.js' in excerpt, excerpt[:300]
assert 'PAL in protein-purification-bench.html' in excerpt, excerpt[:500]

print('test_boardledger: all asserts passed')
