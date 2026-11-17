"""Plain-code gate checks added after the dark mode trace (2026-11-16). Pure functions: tested by test_gatecheck.py.

PR #1531 passed the gate with a change that drew nothing differently: it respelled `fill="#ffffff"` as `fill="#fff"` and its
new check "failed on main" only because it compared that attribute's spelling. The local first pass flagged a real visible
change (ÄKTA fraction labels from black to grey), the gate never read it, and the gate announced that the PR "changes a
reported number", which it did not.
"""
import re

COLOR = r"""['"](?:#[0-9a-fA-F]{3,8}|rgba?\([^'"]*\)|black|white|none)['"]"""
SPELL = re.compile(r"getAttribute\(\s*['\"](?:fill|stroke|color|stop-color|background|style)['\"]\s*\)")
RENDERED = re.compile(r'getComputedStyle|getImageData|toDataURL|screenshot|svgBoxes|exportSvg|pixel', re.I)


def added_test_lines(diff):
    return [l[1:] for b in re.split(r'(?m)^diff --git ', diff or '') if b.startswith('a/tests/suites/')
            for l in b.splitlines() if l.startswith('+') and not l.startswith('+++')]


def spelling_only_check(diff):
    """True when the new test code reads a colour attribute and compares it with a colour literal, and nothing in it looks at
    what is rendered. Such a check passes or fails on how the markup is spelled (#ffffff vs #fff), not on what the user sees."""
    add = added_test_lines(diff)
    text = '\n'.join(add)
    if not SPELL.search(text) or RENDERED.search(text):
        return False
    return bool(re.search(r'===?\s*' + COLOR + r'|' + COLOR + r'\s*===?', text))


def norm_color(line):
    """A line with colour literals written one way: lower case, #abc as #aabbcc, black/white as hex."""
    def hexs(m):
        h = m.group(1).lower()
        return '#' + (''.join(c * 2 for c in h) if len(h) == 3 else h)
    s = re.sub(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b', hexs, line)
    s = re.sub(r'(?<![\w-])black(?![\w-])', '#000000', s, flags=re.I)
    return re.sub(r'(?<![\w-])white(?![\w-])', '#ffffff', s, flags=re.I)


def respell_only(diff, app):
    """True when every changed line of the app is the same as a removed line once colours are written one way."""
    blocks = [b for b in re.split(r'(?m)^diff --git ', diff or '') if b.startswith(f'a/{app}')]
    rem = sorted(norm_color(l[1:]).strip() for b in blocks for l in b.splitlines() if l.startswith('-') and not l.startswith('---'))
    add = sorted(norm_color(l[1:]).strip() for b in blocks for l in b.splitlines() if l.startswith('+') and not l.startswith('+++'))
    return bool(rem) and rem == add


def first_pass_block(comments, sha):
    """The local first pass's blocking concern for this commit, or ''. The reviewer ends its notes with
    "Blocking: yes, <reason>" or "Blocking: no"."""
    for c in reversed(comments or []):
        b = c.get('body') or ''
        if not b.startswith('<!-- local-first-pass -->') or f'`{sha[:7]}`' not in b:
            continue
        m = re.search(r'^\W*Blocking\W*:?\W*yes\W*[,:.\-]?\s*(.+)$', b, re.I | re.M)
        return m.group(1).strip()[:400] if m else ''
    return ''


def first_pass_notes(comments, sha=''):
    """The local first-pass notes, for the lead reviewer to answer."""
    for c in reversed(comments or []):
        b = c.get('body') or ''
        if b.startswith('<!-- local-first-pass -->') and (not sha or f'`{sha[:7]}`' in b):
            return b.split('**Model notes:**', 1)[-1].strip()[:4000]
    return ''


def changed_fragments(diff, app):
    """The parts of the app's lines that actually changed. A removed line is paired with the most similar added line in its
    hunk and only the differing tokens are kept, so a line that does arithmetic but only had a colour changed does not count
    as an arithmetic change (every line of PR #1531 sat in a template literal full of ${x + y})."""
    import difflib
    tok = lambda l: re.findall(r'#[0-9a-fA-F]{3,8}\b|\w+|[^\w\s]', l)
    out = []
    for b in [b for b in re.split(r'(?m)^diff --git ', diff or '') if b.startswith(f'a/{app}')]:
        for h in re.split(r'(?m)^@@.*$', b)[1:]:
            rem = [l[1:] for l in h.splitlines() if l.startswith('-') and not l.startswith('---')]
            add = [l[1:] for l in h.splitlines() if l.startswith('+') and not l.startswith('+++')]
            used = set()
            for r in rem:
                best, bi = 0.0, None
                for k, a in enumerate(add):
                    if k in used:
                        continue
                    sc = difflib.SequenceMatcher(None, r, a, autojunk=False).ratio()
                    if sc > best:
                        best, bi = sc, k
                if bi is None or best < 0.6:
                    out.append(r); continue
                used.add(bi)
                tr, ta = tok(r), tok(add[bi])
                for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, tr, ta, autojunk=False).get_opcodes():
                    if op != 'equal':
                        # one token either side, so an operator that changed keeps the words it joins (a + b to a - b)
                        out.append(' '.join(tr[max(0, i1 - 1):i2 + 1]) + ' ; ' + ' '.join(ta[max(0, j1 - 1):j2 + 1]))
            out += [a for k, a in enumerate(add) if k not in used]
    return out
