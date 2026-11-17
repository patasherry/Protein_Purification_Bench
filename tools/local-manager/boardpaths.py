"""The Direction board's path and identifier checks. Pure functions (plus git ls-files helper),
no network, no config: tested by test_board_paths.py and imported by manager.py."""
import re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = 'hplc-figure-bench(WF1.13).html'

# a token that looks like a source path: has a slash or a code extension
PATHY = re.compile(r'[\w./-]*\w+\.(?:js|ts|jsx|tsx|json|html|css|md|py)\b')

# a camelCase identifier inside backticks: the board naming something it believes is already in the code
BACKTICKED = re.compile(r'`([A-Za-z_][A-Za-z0-9_]*)`')
CAMEL = re.compile(r'^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$')


def repo_files(root=ROOT):
    """Every tracked path, so a proposal can be checked against what actually exists."""
    try:
        out = subprocess.run(['git', 'ls-files'], cwd=str(root), capture_output=True, text=True, timeout=30)
        return {l.strip() for l in out.stdout.splitlines() if l.strip()}
    except Exception:
        return set()


def invented_paths(text, tracked=None):
    """Paths a proposal names that are not in the repository. The board invented
    src/workflows/templates/miniprep.js and test/workflows/reusability.test.js for #1374, a
    single-file app, and a downstream agent then rejected Patrick's whole feature request as
    hallucinated. A proposal may only name files that exist."""
    tracked = repo_files() if tracked is None else tracked
    if not tracked:
        return []
    base = {p.rsplit('/', 1)[-1] for p in tracked}
    bad = []
    for m in PATHY.findall(text or ''):
        p = m.strip('.,;:()[]`\'"')
        if not p or p in tracked or p.rsplit('/', 1)[-1] in base:
            continue
        if any(t.endswith('/' + p) or t == p for t in tracked):
            continue
        bad.append(p)
    return sorted(set(bad))


def unknown_idents(text, app=None):
    """camelCase names a proposal puts in backticks that do not occur in the app file.

    Unlike a path, a new function is a legitimate thing to propose, so this never rejects: it is reported so
    the worker knows the name came from the board and not from the code. #1384 asked for an audit of
    `drawZoomInset`, which does not exist (the function is zoomCompose), and the proposal's whole premise
    rested on it. invented_paths() could not catch that, because it is an identifier, not a path."""
    if app is None:
        try:
            app = (ROOT / APP).read_text(encoding='utf-8', errors='replace')
        except Exception:
            return []
    if not app:
        return []
    return sorted({n for n in BACKTICKED.findall(text or '') if CAMEL.match(n) and n not in app})


HEX_COLOR = re.compile(r'^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
DOM_ID_RE = re.compile(r'(?<![\w/&])#([A-Za-z][A-Za-z0-9_-]{2,})\b')


def verified_pointers(text, app=None, rows=None, harness=None):
    """Exact line numbers for functions, DOM #ids and harness helpers named in a proposal, stamped by Python so downstream
    coding agents never waste turns searching for invented selectors or misnamed functions."""
    if app is None:
        try:
            app = (ROOT / APP).read_text(encoding='utf-8', errors='replace')
        except Exception:
            return ''
    if not app:
        return ''
    if rows is None:
        try:
            cm = (ROOT / 'docs' / 'CODEMAP.md').read_text(encoding='utf-8', errors='replace')
            rows = {n: (int(a), int(b)) for a, b, n in re.findall(r'^\|\s*(\d+)\D+(\d+)\s*\|\s*`([^`]+)`\s*\|', cm, re.M)}
        except Exception:
            rows = {}
    if harness is None:
        try:
            harness = (ROOT / 'tests' / 'lib' / 'harness.js').read_text(encoding='utf-8', errors='replace')
        except Exception:
            harness = ''
    lines = app.splitlines()
    sec_of = lambda ln: next((s for s, (a, z) in (rows or {}).items() if a <= ln <= z), '')
    cands = list(dict.fromkeys(m[0] or m[1] for m in re.findall(r'`([A-Za-z_]\w{2,})`|\b([A-Za-z_]\w{2,})\s*\(', text or '')))
    fns = []
    for n in cands[:12]:
        pat = re.compile(rf'\bfunction\s+{re.escape(n)}\s*\(|\b(?:const|let|var)\s+{re.escape(n)}\s*=')
        ln = next((i + 1 for i, l in enumerate(lines) if pat.search(l)), None)
        if ln:
            s = sec_of(ln)
            fns.append(f'`{n}` (line {ln}' + (f', section `{s}`)' if s else ')'))
    dom_cands = [d for d in dict.fromkeys(DOM_ID_RE.findall(text or '')) if not HEX_COLOR.match(d)]
    found_ids, missing_ids = [], []
    for d in dom_cands[:10]:
        pat = re.compile(rf'\bid\s*=\s*["\']?{re.escape(d)}(?:["\'\s>]|$)')
        ln = next((i + 1 for i, l in enumerate(lines) if pat.search(l)), None)
        if ln:
            found_ids.append(f'`#{d}` (line {ln})')
        else:
            missing_ids.append(f'`#{d}`')
    h_found = []
    if harness:
        hlines = harness.splitlines()
        for h in ('exportSvg', 'svgBoxes', 'fits', 'loadRun', 'openProject'):
            if re.search(rf'\b{h}\b', text or ''):
                ln = next((i + 1 for i, l in enumerate(hlines) if re.search(rf'\b{h}\s*[:(]', l)), None)
                h_found.append(f'`{h}`' + (f' (`tests/lib/harness.js` line {ln})' if ln else ' (`tests/lib/harness.js`)'))
    bullets = []
    if fns:
        bullets.append('- **Functions/defs in app:** ' + ', '.join(fns))
    if found_ids:
        bullets.append('- **DOM IDs in app:** ' + ', '.join(found_ids))
    if missing_ids:
        bullets.append('- **DOM IDs not in app yet (new or check spelling):** ' + ', '.join(missing_ids))
    if h_found:
        bullets.append('- **Test harness helpers:** ' + ', '.join(h_found))
    return ('### Verified code pointers\n' + '\n'.join(bullets) + '\n\n') if bullets else ''
