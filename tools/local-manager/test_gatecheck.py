"""Gate checks from the dark mode trace (gatecheck.py): PR #1531's spelling-only test and respelled colours, the first pass's
blocking line, and which changes count as numerical."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gatecheck as gk
APP = 'hplc-figure-bench(WF1.13).html'
bad = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  ({info})' if not ok and info else ''))
    if not ok:
        bad.append(name)

def tdiff(*lines):
    return 'diff --git a/tests/suites/42_figures.js b/tests/suites/42_figures.js\n--- a\n+++ b\n@@ -1 +1 @@\n' + '\n'.join('+' + l for l in lines) + '\n'

def adiff(rem, add):
    return f'diff --git a/{APP} b/{APP}\n--- a\n+++ b\n@@ -1,{len(rem)} +1,{len(add)} @@\n' + ''.join(f'-{l}\n' for l in rem) + ''.join(f'+{l}\n' for l in add)

spell = tdiff("const f = rect.getAttribute('fill');", "T.check('bg', f === '#fff', 'white');")
check("#1531's check (attribute spelling vs a colour literal) is spelling-only", gk.spelling_only_check(spell))
check('the same check through getComputedStyle is not', not gk.spelling_only_check(tdiff("const f = getComputedStyle(t).fill; const g = t.getAttribute('fill');", "T.check('c', g === '#000', 'x');")))
check('a check on the exported SVG is not', not gk.spelling_only_check(tdiff("const svg = await h.exportSvg(); const f = el.getAttribute('fill');", "T.check('c', f === '#fff', 'x');")))
check('reading a fill without comparing it to a colour is not', not gk.spelling_only_check(tdiff("const f = el.getAttribute('fill');", "T.check('c', !!f, 'x');")))
check('a text check is not', not gk.spelling_only_check(tdiff("T.check('t', el.textContent === 'Mass', 'x');")))
check('app lines do not count as test lines', not gk.spelling_only_check(adiff([], ["if (el.getAttribute('fill') === '#fff') x();"])))

check('#ffffff respelled as #fff draws the same', gk.respell_only(adiff(['<rect fill="#ffffff"/>'], ['<rect fill="#fff"/>']), APP))
check('white respelled as #FFF draws the same', gk.respell_only(adiff(["c='white'"], ["c='#FFF'"]), APP))
check('a real colour change is not a respelling', not gk.respell_only(adiff(['<text fill="#000">'], ['<text fill="#444">']), APP))
check('an added attribute is not a respelling', not gk.respell_only(adiff(['<text>'], ['<text fill="#000">']), APP))
check('an empty diff is not a respelling', not gk.respell_only('', APP))

c = lambda b: {'body': b}
fp = '<!-- local-first-pass -->\n### Local first-pass notes\nReviewed commit `3ea3b97` in 106 s._\n\n**Model notes:**\n- one\n'
check('a blocking line is read', gk.first_pass_block([c(fp + 'Blocking: yes, the ÄKTA fraction labels turn grey.')], '3ea3b974c2') == 'the ÄKTA fraction labels turn grey.')
check('a bulleted blocking line is read', gk.first_pass_block([c(fp + '- **Blocking:** yes - labels turn grey')], '3ea3b97') == 'labels turn grey')
check('Blocking: no is not blocking', gk.first_pass_block([c(fp + 'Blocking: no')], '3ea3b97') == '')
check('notes on another commit are ignored', gk.first_pass_block([c(fp + 'Blocking: yes, x')], 'deadbee') == '')
check('no notes is not blocking', gk.first_pass_block([c('hello')], '3ea3b97') == '')
check('the notes reach the lead reviewer', gk.first_pass_notes([c(fp + 'Blocking: no')], '3ea3b97').startswith('- one'))

fr = lambda r, a: ' | '.join(gk.changed_fragments(adiff([r], [a]), APP))
check('only the changed tokens of a long line are kept', '${r2(ix)}' not in fr('<g transform="translate(${r2(ix)} ${r2(iy)})"><rect fill="#ffffff"/>', '<g transform="translate(${r2(ix)} ${r2(iy)})"><rect fill="#fff"/>'))
check('a changed operator keeps the words it joins', 'a + b' in fr('x = a+b;', 'x = a-b;') and 'a - b' in fr('x = a+b;', 'x = a-b;'))
check('an added line is kept whole', gk.changed_fragments(adiff([], ['const k = 1000;']), APP) == ['const k = 1000;'])

import re
ALLOW = re.compile(r'^(hplc-figure-bench\(WF1\.13\)\.html|README\.md|tests/(suites|data|lib|ux)/|tests/README\.md|docs/|\.gitignore$|tests/\.gitignore$)')
keep, stray = gk.rebuild_paths([
    {'filename': '.gitignore'},
    {'filename': 'docs/archive/perf-audit.md', 'previous_filename': 'docs/perf-audit.md'},
    {'filename': '.github/workflows/tests.yml'},
    {'filename': 'tests/tests_log.txt'},
], ALLOW)
check('rebuild_paths keeps both sides of an allowed rename so git mv deletes the source (#1558)',
      keep == ['.gitignore', 'docs/perf-audit.md', 'docs/archive/perf-audit.md'], str(keep))
check('rebuild_paths reports non-allowed files as stray',
      stray == ['.github/workflows/tests.yml', 'tests/tests_log.txt'], str(stray))
keep2, stray2 = gk.rebuild_paths([{'filename': 'docs/x.md', 'previous_filename': 'tools/x.md'}], ALLOW)
check('rebuild_paths rejects a rename from a disallowed path', keep2 == [] and stray2 == ['docs/x.md'])

hand, p1 = gk.hand_bypass_problems(["It adds or changes files outside the app and tests/: tests/quick.js."], [], ['hand-running', 'owner-approved'])
check('hand-running issue clears worker allowlist complaint', hand and p1 == [])
hand2, p2 = gk.hand_bypass_problems(["It adds or changes files outside the app and tests/: tests/quick.js.", "The Test suite reports regressions."], ['hand-running'], [])
check('hand-running keeps real test regressions while marking PR hand-started', hand2 and p2 == ["The Test suite reports regressions."])
hand3, p3 = gk.hand_bypass_problems(["It adds or changes files outside the app and tests/: scratch.js."], [], ['for-antigravity'])
check('worker PR keeps allowlist complaint', not hand3 and len(p3) == 1)

print(f'\n{len(bad)} failed' if bad else '\nall passed')
sys.exit(1 if bad else 0)

