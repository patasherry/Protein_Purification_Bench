"""Checks the Direction board runs on itself. Pure functions, no network, no config: tested by test_boardcheck.py.

Written after the dark mode trace (2026-11-16), where one Discuss topic went through the whole pipeline and nothing that came
out let a user switch themes:
- the one proposal that answered the topic was dropped as a "duplicate" of a UX test report (#893), which is not work
- the topic meeting saw no code, so nobody knew the app already had dark styles behind :root[data-theme]
- an adopted part (remember the theme) depended on a part that was not adopted (the switch)
- the issue text kept only the debate's revision and said "P4" and "proposal 1", which mean nothing outside the meeting
"""
import json
import math
import re

# Issues that record something rather than ask for work. They stay in the advisers' context but never count as a duplicate.
NOT_WORK = {'ux-report', 'from-ux-test', 'status-page', 'board-tracker'}


def is_work(issue):
    """True for an issue that is a job: not a UX walk report, not the status page, not a standing board tracker."""
    return not ({l['name'] if isinstance(l, dict) else l for l in issue.get('labels', [])} & NOT_WORK)


STOP = set("""a an and are as at be been by can could do does for from has have how i in into is it its let lets me my of on or our should
so such than that the their them then there these they this to us was we what when where which while who why will with would you your
app apps protein purification bench user users add make allow able ability want need way new also more some just only""".split())
# A topic in Patrick's words rarely uses the code's words. These are the ones worth adding when a word appears.
SYN = {'dark': ['data-theme', 'color-scheme', 'theme'], 'light': ['data-theme', 'color-scheme', 'theme'], 'theme': ['data-theme', 'color-scheme'],
       'colour': ['color'], 'save': ['localStorage', 'opt'], 'remember': ['localStorage', 'opt'], 'setting': ['opt', 'DEF'], 'settings': ['opt', 'DEF'],
       'export': ['download', 'toBlob'], 'figure': ['svg'], 'phone': ['@media', 'max-width'], 'mobile': ['@media', 'max-width']}


def topic_words(topic):
    w = [x.lower() for x in re.findall(r'[A-Za-z][A-Za-z0-9\-]{3,}', topic or '') if x.lower() not in STOP]
    out = list(dict.fromkeys(w))
    for x in list(out):
        out += [y for y in SYN.get(x, []) if y not in out]
    return out[:14]


def topic_code(topic, app_text, rows=None, cap=7000, ctx=3, too_common=250):
    """The app code a topic meeting should see: the lines that mention the topic's words (with a few lines around each),
    rarest words weighing most, labelled with their CODEMAP section. '' when nothing matches."""
    lines = (app_text or '').split('\n')
    low = [l.lower() for l in lines]
    hits = {}
    for w in topic_words(topic):
        lw = w.lower()
        at = [i for i, l in enumerate(low) if lw in l]
        if not at or len(at) > too_common:  # a word on hundreds of lines says nothing about where the topic lives
            continue
        weight = 1 / math.log(2 + len(at))
        for i in at:
            hits[i] = hits.get(i, 0) + weight
    if not hits:
        return ''
    wins = []  # merged windows [a, z] with their score
    for i in sorted(hits):
        a, z = max(0, i - ctx), min(len(lines) - 1, i + ctx)
        if wins and a <= wins[-1][1] + 1:
            wins[-1][1], wins[-1][2] = z, wins[-1][2] + hits[i]
        else:
            wins.append([a, z, hits[i]])
    keep, used = [], 0
    for a, z, sc in sorted(wins, key=lambda w: -w[2]):
        text = '\n'.join(lines[a:z + 1])
        if len(text) > 1800:
            text = text[:1800] + '\n// ...'
        if used + len(text) > cap:
            continue
        keep.append((a, z, text)); used += len(text)
    sec = lambda n: next((name for name, (s, e) in (rows or {}).items() if s <= n <= e), '')
    out = []
    for a, z, text in sorted(keep):
        s = sec(a + 1)
        out.append(f'// ===== lines {a + 1} to {z + 1}' + (f' (section `{s}`)' if s else '') + ' =====\n' + text)
    return '\n'.join(out)


def strip_pids(text, names):
    """Meeting-only references ("P4", "proposal 1") replaced by the proposal's title, so an issue reads on its own."""
    def t(pid):
        return f'"{names[pid]}"' if pid in names else 'another proposal'
    text = re.sub(r'\bP(\d+)\b', lambda m: t('P' + m.group(1)), text or '')
    return re.sub(r'\b[Pp]roposal\s+#?(\d+)\b', lambda m: t('P' + m.group(1)), text)


def original_note(p):
    """The proposal as first written, when the debate revised it: the revision alone lost what the idea was for."""
    o = p.get('orig') or {}
    if not o or (o.get('title') == p.get('title') and o.get('change') == p.get('change')):
        return ''
    return f'**Original proposal:** {o.get("title", "")}. {o.get("change", "")}\n\n'


COHERE = """These proposals were adopted together by an advisory board{topic}.
Adopted:
{adopted}
Not adopted (scored lower, dropped as duplicates, or withdrawn):
{other}
Answer two questions.
1. Does any adopted proposal only make sense if a proposal that was NOT adopted is built too (for example, saving a setting for a control that does not exist)?
2. {topic_q}
Return ONE JSON object: {{"needs": [{{"id": "P3", "needs": "P2", "why": "one short sentence"}}], "answers_topic": true or false, "missing": "what the topic asks that nothing adopted does, or empty"}}"""


def coherence(adopted, verdict, live_ids):
    """Apply the coherence answer. adopted: ids in order. live_ids: ids that were debated and not withdrawn.
    A needed proposal that was debated joins the adopted set; a part whose base is gone is held back.
    Returns (adopt, held: [(id, needs, why)])."""
    adopt, held = list(adopted), []
    for d in (verdict or {}).get('needs') or []:
        if not isinstance(d, dict):
            continue
        a, b = str(d.get('id', '')), str(d.get('needs', ''))
        if a not in adopt or not b or b in adopt:
            continue
        if b in live_ids:
            adopt.insert(adopt.index(a), b)  # the base goes first, so the queue builds it first
        else:
            adopt.remove(a); held.append((a, b, str(d.get('why', ''))[:200]))
    return adopt, held


def merge_revision(orig_text, new_text, cap=1500, min_ratio=0.65):
    """Preserve a proposal's full specification when a revision or synthesis supplies only a short delta (#1532, #1533)."""
    o, n = (orig_text or '').strip(), (new_text or '').strip()
    if not n or n == o:
        return o[:cap]
    if not o:
        return n[:cap]
    if len(n) < min_ratio * len(o) and o[:40].lower() not in n.lower():
        return f'{o}\n\nRefinement: {n}'[:cap]
    return n[:cap]


def peer_decision(audits, author, n_advisers=2, go_score=4):
    """Judge a proposal strictly from non-author peer audits (zero self-votes).
    Returns (route, avg_score, votes, required_fixes, no_gos), where route is 'adopt', 'relay', 'probe', or 'reject'."""
    peers = [a for a in (audits or []) if isinstance(a, dict) and a.get('by') and a.get('by') != author]
    need = max(1, (n_advisers or 2) - 1)
    if not peers:
        return 'reject', 0.0, [], [], []
    votes, fixes, no_gos = [], [], []
    for a in peers:
        v = str(a.get('verdict') or '').strip().lower()
        try:
            sc = max(1.0, min(5.0, float(a.get('score', 0) or 0)))
        except (TypeError, ValueError):
            sc = 0.0
        why = str(a.get('why') or '').strip()[:240]
        votes.append((str(a['by']), sc, v or 'vote', why))
        for f in (a.get('required_fixes') or []) if isinstance(a.get('required_fixes'), list) else []:
            if str(f).strip() and str(f).strip()[:300] not in fixes:
                fixes.append(str(f).strip()[:300])
        for ng in (a.get('no_gos') or []) if isinstance(a.get('no_gos'), list) else []:
            if str(ng).strip() and str(ng).strip()[:240] not in no_gos:
                no_gos.append(str(ng).strip()[:240])
    scores = [x[1] for x in votes]
    verdicts = {x[2] for x in votes}
    avg = sum(scores) / len(scores)
    if len(peers) < need or 'reject' in verdicts or min(scores) < 3:
        return 'reject', avg, votes, fixes, no_gos
    if 'probe_only' in verdicts:
        return 'probe', avg, votes, fixes, no_gos
    if avg >= 3.5 and min(scores) >= go_score:
        return 'adopt', avg, votes, fixes, no_gos
    if avg >= 3.5 and min(scores) >= 3:
        return 'relay', avg, votes, fixes, no_gos
    if avg >= 3.0 and min(scores) >= 3:
        return 'probe', avg, votes, fixes, no_gos
    return 'reject', avg, votes, fixes, no_gos


def probe_card(p):
    """Turn an uncertain proposal into a safe test probe so a worker verifies whether main actually fails before changing the app."""
    clean = re.sub(r'^(?:test\s+probe:\s*|tests?:\s*)', '', str(p.get('title') or '').strip(), flags=re.I)
    out = dict(p)
    out['orig'] = p.get('orig') or {'title': p.get('title', ''), 'change': p.get('change', ''), 'check': p.get('check', '')}
    out['title'] = f'Test probe: {clean}'[:120]
    out['probe'] = True
    out['change'] = (
        'Peer review marked this hypothesis for verification before full adoption. '
        'First write and run the synthetic UI-level check below against `main` in `tests/suites/`.\n'
        '- **If `main` already passes:** do NOT edit `protein-purification-bench.html`; open a `tests/`-only PR adding the passing regression guard.\n'
        '- **If `main` fails (confirming the bug):** do NOT open a PR whose own check fails. If fixing it would change a reported number, comment the exact reproduction on the issue and stop; otherwise apply the minimal scoped fix in the named section so the check fails on `main` and passes on your branch.\n\n'
        f'Scoped target if `main` fails: {p.get("change", "")}'
    )[:1500]
    return out


def chain_adopted(adopted_props, verdict=None):
    """Map pid -> prerequisite_pid when an adopted proposal depends on an earlier one or touches the same CODEMAP section."""
    order = [p['id'] for p in (adopted_props or []) if isinstance(p, dict) and p.get('id')]
    idx = {pid: k for k, pid in enumerate(order)}
    waits = {}
    for d in (verdict or {}).get('needs') or []:
        if isinstance(d, dict):
            a, b = str(d.get('id', '')), str(d.get('needs', ''))
            if a in idx and b in idx and a != b and idx[b] < idx[a]:
                waits[a] = b
    last_sec = {}
    for p in adopted_props or []:
        pid = p.get('id')
        if pid not in idx:
            continue
        secs = [str(s).strip().lower() for s in (p.get('where') or []) if str(s).strip()]
        prereqs = [last_sec[s] for s in secs if s in last_sec and last_sec[s] != pid]
        if prereqs:
            latest = max(prereqs, key=lambda x: idx[x])
            if pid not in waits or idx[latest] > idx[waits[pid]]:
                waits[pid] = latest
        for s in secs:
            last_sec[s] = pid
    return waits


def _try_parse_dict(raw):
    for candidate in (raw, re.sub(r',\s*([}\]])', r'\1', raw)):
        try:
            obj = json.loads(candidate, strict=False)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
    return None


def extract_json_obj(text):
    """Extract the largest valid JSON dict from model output, surviving unclosed <think> tags, markdown fences,
    trailing commas, and extra `{...}` braces in surrounding prose or code snippets."""
    s = re.sub(r'<think>.*?</think>', '', str(text or ''), flags=re.S).strip()
    if '<think>' in s:
        ti = s.find('<think>')
        bi = s.find('{', ti)
        s = (s[:ti] + (s[bi:] if bi != -1 else '')).strip()
    if not s:
        return {}
    fenced = re.findall(r'```(?:json)?\s*(\{.*?\})\s*```', s, flags=re.S | re.I)
    for blk in reversed(fenced):
        got = _try_parse_dict(blk)
        if got is not None:
            return got
    direct = _try_parse_dict(s)
    if direct is not None:
        return direct
    best = {}
    n = len(s)
    i = 0
    while i < n:
        if s[i] != '{':
            i += 1
            continue
        depth, in_str, esc = 0, False, False
        for j in range(i, n):
            ch = s[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == '\\':
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        got = _try_parse_dict(s[i:j + 1])
                        if got is not None and len(s[i:j + 1]) > len(json.dumps(best)):
                            best = got
                        break
        i += 1
    return best

