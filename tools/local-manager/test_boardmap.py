"""The board's map (docs/BOARD_MAP.md) and homework helpers in boardmap.py."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import boardmap as bm
ROOT = HERE.parents[1]
bad = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  ({info})' if not ok and info else ''))
    if not ok:
        bad.append(name)

doms = bm.parse_map((ROOT / 'docs' / 'BOARD_MAP.md').read_text(encoding='utf-8'))
rows = bm.codemap_rows((ROOT / 'docs' / 'CODEMAP.md').read_text(encoding='utf-8'))
app = (ROOT / 'protein-purification-bench.html').read_text(encoding='utf-8', errors='replace')
check('the map has at least 8 domains', len(doms) >= 8, len(doms))
missing = [(d['name'], c) for d in doms for c in d['code'] if c not in rows]
check('every Code section in the map is a section of docs/CODEMAP.md', not missing, missing)
check('every domain names some code', all(d['code'] for d in doms), [d['name'] for d in doms if not d['code']])
suites = {p.stem for p in (ROOT / 'tests' / 'suites').glob('*.js')}
named = {t.strip() for d in doms for l in d['body'].splitlines() if l.strip('- ').lower().startswith('tests:') for t in l.split(':', 1)[1].split(',')}
check('every suite the map names exists', named <= suites, sorted(named - suites))
check('no em dashes or semicolons in the map', '—' not in (ROOT / 'docs' / 'BOARD_MAP.md').read_text(encoding='utf-8') and ';' not in (ROOT / 'docs' / 'BOARD_MAP.md').read_text(encoding='utf-8'))

seen = {}
first = bm.pick_domain(doms, seen)['name']
seen[first] = 100
second = bm.pick_domain(doms, seen)['name']
check('a fresh board starts at the first domain and moves on', first == doms[0]['name'] and second == doms[1]['name'], (first, second))
seen = {d['name']: 100 + i for i, d in enumerate(doms)}
seen[doms[3]['name']] = 1
check('the domain looked at least recently comes next', bm.pick_domain(doms, seen)['name'] == doms[3]['name'])

code = bm.domain_code(doms[0], app, rows)
check('domain code carries each section, capped', all(f'section `{c}`' in code for c in doms[0]['code'] if c in rows) and len(code) <= 7400, len(code))

hw = bm.clean_homework([
    {'to': 'Gemini', 'by': 'the local AI', 'domain': 'gels and densitometry', 'question': 'How does Image Lab subtract background?', 'search': 'densitometry background; subtraction'},
    {'to': 'Gemini', 'by': 'the local AI', 'domain': '', 'question': 'A second one for Gemini'},
    {'to': 'Nobody', 'by': 'Gemini', 'question': 'An adviser that does not exist'},
    {'to': 'the local AI', 'by': 'the local AI', 'domain': 'nonsense', 'question': 'Old question'},
    {'to': 'the local AI', 'by': 'the local AI', 'domain': 'Figures: HPLC overlay, run chart and the workflow figure', 'question': 'What minimum font size do journals require?'}],
    ['the local AI', 'Gemini'], [d['name'] for d in doms] + ['Gels and densitometry'], earlier=['old question'])
check('homework: one per adviser, real advisers only, no repeats', [h['to'] for h in hw] == ['Gemini', 'the local AI'], hw)
check('homework: nobody sets their own', all(h['by'] != h['to'] for h in hw), hw)
check('homework: domains matched without regard to case, search words cleaned', hw[0]['domain'] == 'Gels and densitometry' and ';' not in hw[0]['search'], hw[0])
check('sources text says when there is nothing', bm.sources_text([], '') == '(no sources found)')
check('pubmed with no words asks nothing', bm.pubmed('') == [])
kw = bm.keywords('How do published size exclusion chromatography reporting standards specify the acceptable R-squared threshold for a calibration curve?')
check('keywords from a question drop common words and keep the subject', 'chromatography' in kw and 'calibration' in kw and ' the ' not in f' {kw} ' and len(kw.split()) <= 6, kw)
hw2 = bm.clean_homework([{'to': 'Local AI', 'by': 'gemini', 'question': 'Q one'}, {'to': 'Gemini', 'by': 'the Local AI', 'question': 'Q two'}], ['the local AI', 'Gemini'], [])
check('homework reaches an adviser whose name was written differently', [h['to'] for h in hw2] == ['the local AI', 'Gemini'] and hw2[0]['by'] == 'Gemini' and hw2[1]['by'] == 'the local AI', hw2)
check('wikipedia with no words asks nothing', bm.wikipedia('') == [])
check('sources text lists Wikipedia', 'Wikipedia:' in bm.sources_text([], '', [{'title': 'T', 'snippet': 's', 'url': 'u'}]))
check('the aim names the next domain', 'Size exclusion' in bm.aim_text('Size exclusion: calibration and mass') and bm.aim_text('') == '')
hw3 = bm.clean_homework([{'to': 'Gemini', 'by': 'the local AI', 'question': 'Q three'}], ['the local AI', 'Gemini'], ['Gels'], default_domain='Gels')
check('homework without a domain takes the next meeting\'s', hw3 and hw3[0]['domain'] == 'Gels', hw3)
iss = [{'number': 1476, 'title': 'Flag saturated bands in the band table'}, {'number': 1490, 'title': 'Report CDS feature count when a GenBank file has multiple ORFs'}]
check('an answer about saturated bands finds the saturated-band issue only', bm.related('How do gel programs detect pixel saturation in bands?', 'Saturated bands are flagged in the band table when pixels clip.', iss) == [1476])
code = 'function bandEnergy(g, lane){ const satRatio = DET.satRatio; return laneTrack(g, lane); }'
check('a proposal naming a function in the code cites it', bm.cites_code('Use DET.satRatio in bandEnergy to flag clipping', code))
check('a proposal that only restates the map does not', not bm.cites_code('Background subtraction methods and stain linearity for densitometry', code))
check('parse_map extracts domain test suites', all(isinstance(d.get('tests'), list) and d['tests'] for d in doms), [d['name'] for d in doms if not d.get('tests')])
offs = {}
w1 = bm.domain_code(doms[0], app, rows, offsets=offs)
moved = [k for k, v in offs.items() if v > 0]
w2 = bm.domain_code(doms[0], app, rows, offsets=offs)
check('sliding domain_code advances offset on long sections and stays within cap', bool(moved) and w1 != w2 and len(w2) <= 7400, (offs, len(w2)))
synth_rows = {'sec_a': (1, 60)}
synth_app = '\n'.join(f'function fn_{i}(){{ return {i}; }}' for i in range(60))
soffs = {}
_ = bm.domain_code({'code': ['sec_a']}, synth_app, synth_rows, cap=800, offsets=soffs)
check('sliding window records positive offset before end of section', soffs.get('sec_a', 0) > 0, soffs)
for _ in range(5):
    bm.domain_code({'code': ['sec_a']}, synth_app, synth_rows, cap=800, offsets=soffs)
    if soffs.get('sec_a') == 0:
        break
check('sliding window wraps back to 0 at section end', soffs.get('sec_a') == 0, soffs)
dcks = bm.domain_checks(doms[0], ROOT / 'tests' / 'suites')
check('domain_checks lists existing checks from domain suites', 'tests/suites/' in dcks and len(dcks) <= 2200, dcks[:120])
wrapped = '{"adviser": "Gemini", "domain": "Upstream", "homework_response": "Benchling stores promoters as sequence parts with typed links."}'
check('clean_report_text unwraps accidental JSON homework objects into prose',
      bm.clean_report_text(wrapped) == 'Benchling stores promoters as sequence parts with typed links.', bm.clean_report_text(wrapped))
sys.exit(1 if bad else 0)
