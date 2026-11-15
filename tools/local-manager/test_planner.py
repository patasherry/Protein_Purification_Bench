"""planner.py: what makes a usable split of a big request, and the part cards it files."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import planner as pl
import boardmap as bm
ROOT = HERE.parents[1]
bad = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  ({info})' if not ok and info else ''))
    if not ok:
        bad.append(name)

secs = list(bm.codemap_rows((ROOT / 'docs' / 'CODEMAP.md').read_text(encoding='utf-8')))
suites = sorted(x.stem for x in (ROOT / 'tests' / 'suites').glob('*.js'))
parent = """Under every Agarose Gel stage, add a dedicated place to upload or import the gel image. Support drag-and-drop and file selection.
Image replacement without deleting the original record. Automatically detect lane boundaries. Manually add, remove, move, resize, split, or merge lanes.
Select the ladder product from a saved list. Enter fragment sizes in bp or kb. Generate a migration-distance versus log10(fragment size) calibration."""
good = [
    {'title': 'Agarose gel: image upload', 'quote': 'Under every Agarose Gel stage, add a dedicated place to upload or import the gel image. Support drag-and-drop and file selection.',
     'change': 'Add an image drop zone and file picker to each Agarose Gel stage, keeping the original image when a new one replaces it.',
     'check': 'New suite tests/suites/1465_agarose_upload.js loads a synthetic PNG and finds it in the stage.', 'where': [secs[0]], 'science': False},
    {'title': 'Agarose gel: lanes', 'quote': 'Automatically detect lane boundaries. Manually add, remove, move, resize, split, or merge lanes.',
     'change': 'Detect lanes on the uploaded agarose image and let the user add, remove, move, resize, split and merge them.',
     'check': 'In 1466_agarose_lanes.js a synthetic gel with 6 lanes shows 6 lane boxes.', 'where': [secs[1].upper()], 'science': False},
    {'title': 'Agarose gel: DNA ladder calibration', 'quote': 'Select the ladder product from a saved list. Enter fragment sizes in bp or kb.',
     'change': 'Add a saved list of DNA ladders with their fragment sizes and a log10 size calibration for band size estimates.',
     'check': 'tests/suites/1467_agarose_ladder.js estimates a synthetic band at 1.2 kb.', 'where': [secs[2]], 'science': False}]
jobs, probs = pl.validate(good, parent, secs, suites)
check('a good split passes', len(jobs) == 3 and not probs, probs)
check('section names are matched without regard to case', jobs and jobs[1]['where'] == [secs[1]], jobs and jobs[1]['where'])
check('a part about saved ladders and fragment sizes is marked science even if the model said no', jobs and jobs[2]['science'] and not jobs[0]['science'])

def broken(k, **kw):
    j = [dict(x) for x in good]; j[k].update(kw); return pl.validate(j, parent, secs, suites)
check('one job is not a split', pl.validate(good[:1], parent, secs, suites)[0] == [])
check('nine jobs is too many', pl.validate(good * 3, parent, secs, suites)[0] == [])
check('a check that names no suite is refused', broken(0, check='Check that it works.')[0] == [])
check('made-up sections are refused', broken(1, where=['lane wizard'])[0] == [])
check('a quote that is not Patrick\'s words is refused', broken(2, quote='Build a fully automatic AI band caller with cloud sync and user accounts.')[0] == [])
check('a one-line change is refused', broken(0, change='Upload.')[0] == [])

c1, c2 = pl.card(jobs[0], 1, 3, 1465), pl.card(jobs[1], 2, 3, 1465, waits=1500)
check('the first card has the job-card headings and the parent', all(h in c1 for h in ('## Change', '## Check', '## Where', '## Rules', '#1465')) and '> Under every' in c1)
check('a later card says what it waits on, and waits_on reads it', pl.waits_on(c2) == 1500 and pl.waits_on(c1) is None)
check('a science card asks for sources and the OK', "Patrick's OK" in pl.card(jobs[2], 3, 3, 1465))
check('the leader would not hold the card for lacking a check', __import__('re').search(r'(\*\*|#+\s*)check\b', c1, __import__('re').I) is not None)
sys.exit(1 if bad else 0)
