"""Checks the Direction board runs on itself. Pure functions, no network, no config: tested by test_boardcheck.py.

Written after the dark mode trace (2026-11-16), where one Discuss topic went through the whole pipeline and nothing that came
out let a user switch themes:
- the one proposal that answered the topic was dropped as a "duplicate" of a UX test report (#893), which is not work
- the topic meeting saw no code, so nobody knew the app already had dark styles behind :root[data-theme]
- an adopted part (remember the theme) depended on a part that was not adopted (the switch)
- the issue text kept only the debate's revision and said "P4" and "proposal 1", which mean nothing outside the meeting
"""
import math
import re

# Issues that record something rather than ask for work. They stay in the advisers' context but never count as a duplicate.
NOT_WORK = {'ux-report', 'from-ux-test', 'status-page'}


def is_work(issue):
    """True for an issue that is a job: not a UX walk report, not the status page."""
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
