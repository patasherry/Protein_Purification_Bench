"""Plain asserts, no network. Tests board timing, throttles and context limits:
python tools/local-manager/test_board.py
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import manager as mgr

# 1. Configuration defaults
assert mgr.BOARD_EVERY == 8, f"Expected BOARD_EVERY=8, got {mgr.BOARD_EVERY}"
assert mgr.BOARD_HOURS == 12, f"Expected BOARD_HOURS=12, got {mgr.BOARD_HOURS}"
assert mgr.BOARD_LOW_QUEUE == 10, f"Expected BOARD_LOW_QUEUE=10, got {mgr.BOARD_LOW_QUEUE}"
assert mgr.BOARD_LOW_HOURS == 4, f"Expected BOARD_LOW_HOURS=4, got {mgr.BOARD_LOW_HOURS}"
assert mgr.AUTO_MAX == 2, f"Expected AUTO_MAX=2, got {mgr.AUTO_MAX}"
assert mgr.AUTO_QUEUE == 20, f"Expected AUTO_QUEUE=20, got {mgr.AUTO_QUEUE}"

# 2. Trigger logic evaluation simulation
def eval_trigger(now, last_at, merged_count, queue_count, last_ux=0, has_ux=False, weekly=False):
    due = (now - last_at) > mgr.BOARD_HOURS * 3600
    low = queue_count < mgr.BOARD_LOW_QUEUE and (now - last_at) > mgr.BOARD_LOW_HOURS * 3600
    if has_ux and (now - last_ux > 86400):
        return 'ux'
    if weekly:
        return 'weekly'
    if merged_count >= mgr.BOARD_EVERY:
        return f'{merged_count} merged PRs'
    if due:
        return f'{mgr.BOARD_HOURS} h since the last meeting'
    if low:
        return 'the work queue is low'
    return ''

t0 = 1000000.0

# 1 hour after last meeting, 2 merged PRs, queue 8 (low), but within 4h cooldown -> should NOT trigger
assert eval_trigger(t0 + 3600, t0, 2, 8) == '', "Low queue within 4h cooldown must not trigger"

# 4.5 hours after last meeting, queue 8 (low), cooldown elapsed -> SHOULD trigger
assert eval_trigger(t0 + 4.5 * 3600, t0, 2, 8) == 'the work queue is low'

# 2 hours after last meeting, 8 merged PRs -> SHOULD trigger on merges
assert eval_trigger(t0 + 2 * 3600, t0, 8, 15) == '8 merged PRs'

# 12.1 hours after last meeting -> SHOULD trigger on due
assert eval_trigger(t0 + 12.1 * 3600, t0, 1, 15) == '12 h since the last meeting'

# UX scope topic deposited 2 hours after last UX walk -> should NOT preempt board
assert eval_trigger(t0 + 2 * 3600, t0, 0, 15, last_ux=t0, has_ux=True) == '', "Recent UX walk must not preempt"

# UX scope topic deposited 25 hours after last UX walk -> SHOULD trigger UX meeting
assert eval_trigger(t0 + 25 * 3600, t0, 0, 15, last_ux=t0, has_ux=True) == 'ux', "Day-old UX walk triggers"

# 3. Verify open issues limit in board_context is expanded to 100
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manager.py'), 'r', encoding='utf-8') as f:
    src = f.read()

assert '][:100]' in src, "Expected open issues context slice to be [:100]"
assert "pass  # consolidated post at decision" in src, "Expected intermediate round posts to be consolidated"
assert '"check":' in mgr.PROPOSE, "Expected PROPOSE schema to require a check field"
assert '**Check:**' in src, "Expected adopted board issues to render **Check:**"
assert 'LOCAL_AI_BRIEF.md' in src, "Expected board_context to include docs/LOCAL_AI_BRIEF.md"

# 4. Check field validation and codemap function extraction
assert mgr.valid_check({'check': 'tests/suites/25_gels.js: lane purity updates when band is tagged'})
assert not mgr.valid_check({'check': ''})
assert not mgr.valid_check({'check': 'TBD'})
assert not mgr.valid_check({})
funcs = mgr.codemap_functions()
assert 'zoomCompose' in funcs and 'parseText' in funcs, f"Expected codemap functions, got {funcs[:5]}"

# 5. 4-step code-grounded peer audit pipeline invariants
assert '"verdict":' in mgr.CROSS_AUDIT and '"required_fixes":' in mgr.CROSS_AUDIT and '"no_gos":' in mgr.CROSS_AUDIT
assert '"withdraw":' in mgr.SYNTHESIZE
assert mgr.BOARD_PROPOSE_EACH == 2
assert mgr.BOARD_AGY_VERIFY is False
assert 'ask_gemini(q, REVIEW_MODELS, json_mode=True' in src, "Seat 2 on PC must use REVIEW_MODELS, not default GEMINI_MODELS"
assert "p['by'] != name" in src, "Cross-audit must exclude self-authored proposals"
assert 'verified_pointers(prop_text(p))' in src, "Compiled board issues must carry verified code pointers"
assert "'needs-previous'" in src and 'Waits on #' in src, "Overlapping board issues must chain via needs-previous"
assert "'state_reason': 'not_planned'" in src, "Declined awaiting-owner PRs must close the linked board issue"
secs = mgr.app_sections()
assert mgr.normalize_where(['Gels', 'nonexistent'], '', secs) == ['gels'], mgr.normalize_where(['Gels', 'nonexistent'], '', secs)
assert mgr.normalize_where([], 'Update `peak integration` so baseline resets.', secs) == ['peak integration']

# 6. End-to-end offline simulation of the 4-step board_round() pipeline
import json as _json
import planner as pl

_orig_gh, _orig_ask_local, _orig_ask_gem, _orig_key, _orig_dry = mgr.gh, mgr.rv.ask_model, mgr.ask_gemini, mgr.GEMINI_KEY, mgr.DRY
filed_issues, board_posts = [], []
try:
    mgr.GEMINI_KEY = 'fake-test-key'
    mgr.DRY = False
    def _fake_gh(path, method='GET', body=None, **kw):
        if method == 'POST' and path.endswith('/issues'):
            num = 2001 + len(filed_issues)
            rec = {'number': num, **body}
            filed_issues.append(rec)
            return rec
        if method == 'POST' and f'/issues/{mgr.BOARD}/comments' in path:
            board_posts.append(body['body'])
            return {'id': 9001}
        return []
    def _fake_local(sys_p, q):
        if 'independent, code-grounded peer auditor' in q:
            return _json.dumps({'audits': [
                {'id': 'P2', 'verdict': 'go_with_fixes', 'score': 4, 'why': 'Real bug in zoomCompose.',
                 'required_fixes': ['Clamp label right edge to inset rect.'], 'no_gos': ['Do not change LADDERS.']},
                {'id': 'P1', 'verdict': 'go', 'score': 5, 'why': 'attempted self vote that must be ignored'}
            ]})
        if 'refining your proposal' in q:
            return _json.dumps({'change': 'Also guard zero-width lanes before dividing.'})
        return _json.dumps({'review': 'Local review ok.', 'proposals': [{
            'title': 'Guard lane purity division in gels',
            'where': ['gels'],
            'why': 'Prevent NaN purity on blank lanes.',
            'evidence': 'In `bandEnergy` and `#saveSvg`, blank lanes can divide by zero.',
            'risk': 'None if guarded.',
            'change': 'In section `gels`, update `bandEnergy` so zero total lane area returns 0 purity cleanly without NaN in the band table.',
            'check': 'tests/suites/25_gels.js: blank lane shows 0% purity via H(p).exportSvg()'
        }]})
    def _fake_gem(q, models=None, json_mode=False, temp=None):
        if 'check plans for gaps' in q or 'adopted together by an advisory board' in q:
            return _json.dumps({'needs': [], 'answers_topic': True, 'missing': ''})
        if 'secretary of the Direction board' in q:
            return _json.dumps({'homework': []})
        if 'independent, code-grounded peer auditor' in q:
            return _json.dumps({'audits': [
                {'id': 'P1', 'verdict': 'go_with_fixes', 'score': 4, 'why': 'Confirmed in gels code.',
                 'required_fixes': ['Guard zero-width lanes.'], 'no_gos': ['Keep existing 25_gels.js checks intact.']}
            ]})
        if 'refining your proposal' in q:
            return _json.dumps({'change': 'Clamp label right edge to inset rect.'})
        return _json.dumps({'review': 'Gemini review ok.', 'proposals': [{
            'title': 'Clamp gel zoom inset label in gels',
            'where': ['gels'],
            'why': 'Prevent clipped inset labels.',
            'evidence': 'In `zoomCompose`, long lane titles extend past rect.',
            'risk': 'Text truncation if too narrow.',
            'change': 'In section `gels`, update `zoomCompose` so long titles stay inside the inset box on exported SVG.',
            'check': 'tests/suites/25_gels.js: H(p).svgBoxes(await H(p).exportSvg()) has empty clipped list'
        }]})
    mgr.gh, mgr.rv.ask_model, mgr.ask_gemini = _fake_gh, _fake_local, _fake_gem
    sim_state = {'count': {}}
    mgr.board_round(sim_state, topic='gel purity and inset labels')
finally:
    mgr.gh, mgr.rv.ask_model, mgr.ask_gemini, mgr.GEMINI_KEY, mgr.DRY = _orig_gh, _orig_ask_local, _orig_ask_gem, _orig_key, _orig_dry

assert len(filed_issues) == 2, f"Expected 2 adopted issues, got {len(filed_issues)}"
iss1, iss2 = filed_issues[0], filed_issues[1]
assert 'queued' in iss1['labels'] and 'board-approved' in iss1['labels'], iss1['labels']
assert 'needs-previous' in iss2['labels'] and 'queued' not in iss2['labels'], iss2['labels']
assert pl.waits_on(iss2['body']) == iss1['number'], iss2['body'][:200]
assert 'Refinement: Also guard zero-width lanes' in iss1['body'], "Short synthesis delta must preserve original spec"
assert '### Verified code pointers' in iss1['body'] and '`#saveSvg` (line ' in iss1['body'], iss1['body']
assert '**No-gos (peer audit guardrails):**' in iss1['body'], iss1['body']
assert board_posts and 'zero self-votes' in board_posts[0], "Decision post must be recorded"

# 7. Gemini API fixes (2026-11-24): no retired 2.5 models, 503 retry, 404 on last model rests & raises RuntimeError, accurate rest reason, thought-part filtering
import io, urllib.error, urllib.request
assert all('2.5' not in m for m in mgr.GEMINI_MODELS + mgr.REVIEW_MODELS + mgr.FLASH_LITE_MODELS), (mgr.GEMINI_MODELS, mgr.REVIEW_MODELS)
assert 'gemini-3.8-flash' in mgr.REVIEW_MODELS and 'gemini-3.5-flash-lite' in mgr.FLASH_LITE_MODELS

# Thought-part filtering in _gem_extract_text
_thought_payload = _json.dumps({
    'candidates': [{'content': {'parts': [
        {'thought': True, 'text': 'internal reasoning {"wrong": 1}'},
        {'text': '  {"ok": true}  '},
    ]}}]
}).encode()
assert mgr._gem_extract_text(_thought_payload, 'gemini-3.8-flash') == '{"ok": true}'

_orig_urlopen, _orig_gap, _orig_retry_s, _orig_busy_s = urllib.request.urlopen, mgr.GEMINI_GAP, mgr.GEMINI_RETRY_S, mgr.GEMINI_BUSY_REST_S
_orig_gem_state = {k: (dict(v) if isinstance(v, dict) else v) for k, v in mgr._gem.items()}
try:
    mgr.GEMINI_KEY = 'test-live-key'
    mgr.GEMINI_GAP, mgr.GEMINI_RETRY_S, mgr.GEMINI_BUSY_REST_S = 0, 0, 1
    mgr._gem.update({'last': 0.0, 'rest_until': {}, 'strikes': {}, 'why': {}})

    # (a) 1-shot retry recovers from transient 503 without resting the model
    _calls_503 = []
    class _Resp:
        def __init__(self, txt):
            self._b = _json.dumps({'candidates': [{'content': {'parts': [{'text': txt}]}}]}).encode()
        def read(self): return self._b
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def _mock_503_then_ok(req, timeout=150):
        _calls_503.append(req.full_url)
        if len(_calls_503) == 1:
            raise urllib.error.HTTPError(req.full_url, 503, 'Service Unavailable', {}, io.BytesIO(b'{"error":{"message":"overloaded"}}'))
        return _Resp('{"recovered": 1}')

    urllib.request.urlopen = _mock_503_then_ok
    assert mgr.ask_gemini('ping', ['gemini-flash-latest'], json_mode=True) == '{"recovered": 1}'
    assert len(_calls_503) == 2 and 'gemini-flash-latest' not in mgr._gem['rest_until']

    # (b) 404 on the LAST model in `models` rests it for 24h and raises RuntimeError (never raw HTTPError 404)
    def _mock_404(req, timeout=150):
        raise urllib.error.HTTPError(req.full_url, 404, 'Not Found', {}, io.BytesIO(b'{"error":{"message":"model not found"}}'))

    urllib.request.urlopen = _mock_404
    _err_404 = None
    try:
        mgr.ask_gemini('ping', ['gemini-retired-test'])
    except Exception as e:
        _err_404 = e
    assert isinstance(_err_404, RuntimeError) and not isinstance(_err_404, urllib.error.HTTPError), repr(_err_404)
    assert 'HTTP 404' in str(_err_404) and mgr._gem['rest_until'].get('gemini-retired-test', 0) > time.time() + 3600

    # (c) Subsequent call on a resting 404 model reports the real HTTP 404 reason, NOT a false "free-tier rate limit"
    try:
        mgr.ask_gemini('ping', ['gemini-retired-test'])
        assert False, 'expected RuntimeError'
    except RuntimeError as e2:
        assert 'HTTP 404' in str(e2) and 'free-tier rate limit' not in str(e2), str(e2)
finally:
    urllib.request.urlopen, mgr.GEMINI_GAP, mgr.GEMINI_RETRY_S, mgr.GEMINI_BUSY_REST_S = _orig_urlopen, _orig_gap, _orig_retry_s, _orig_busy_s
    mgr.GEMINI_KEY = _orig_key
    mgr._gem.clear(); mgr._gem.update(_orig_gem_state)

# 8. Codex stdin piping + Antigravity read-only temp-file invocation + 4-seat board integration
assert mgr.BOARD_CODEX is True and mgr.BOARD_AGY is True
assert mgr.CAP['agy_board'] == 24 and mgr.CAP['codex'] >= 20

_orig_run = mgr.run
_seen_runs = []
try:
    def _fake_run(cmd, prompt, timeout=600, cwd=None, stdin=False):
        pfiles = list(mgr.ROOT.glob('.ppb_board_prompt_*.md'))
        _seen_runs.append({'cmd': cmd, 'prompt': prompt, 'stdin': stdin, 'pfile_exists_during_run': bool(pfiles),
                           'pfile_content': pfiles[0].read_text(encoding='utf-8') if pfiles else ''})
        return 'codex\n{"ok": "codex"}\ntokens used 10' if cmd[0] == 'codex' else '{"ok": "agy"}'
    mgr.run = _fake_run
    out_cx = mgr.ask_codex('big board prompt\nline 2')
    assert out_cx == '{"ok": "codex"}'
    assert _seen_runs[0]['cmd'][-1] == '-' and _seen_runs[0]['stdin'] is True and _seen_runs[0]['prompt'] == 'big board prompt\nline 2'

    out_ag = mgr.ask_agy('multiline\nprompt with "quotes"')
    assert out_ag == '{"ok": "agy"}'
    ag_call = _seen_runs[1]
    assert ag_call['cmd'][0] == 'agy' and '--dangerously-skip-permissions' not in ag_call['cmd']
    assert '--model' in ag_call['cmd'] and 'gemini-3.8-flash' in ag_call['cmd']
    assert ag_call['pfile_exists_during_run'] is True and 'multiline\nprompt with "quotes"' in ag_call['pfile_content']
    assert list(mgr.ROOT.glob('.ppb_board_prompt_*.md')) == [], 'temp prompt file must be cleaned up after ask_agy'
finally:
    mgr.run = _orig_run

# 9. 4-seat board_advisers + board_round resilient when Gemini REST fails (no duplicate compact retry on API exception; agy coding cap untouched)
_orig_4 = (mgr.gh, mgr.rv.ask_model, mgr.ask_gemini, mgr.ask_codex, mgr.ask_agy, mgr.codex_exe, mgr.agy_exe, mgr.GEMINI_KEY, mgr.DRY)
try:
    mgr.GEMINI_KEY = 'test-live-key'
    mgr.DRY = False
    mgr.codex_exe = lambda: '/usr/bin/codex'
    mgr.agy_exe = lambda: '/usr/bin/agy'
    _gem_propose_attempts = []
    _posts_4, _filed_4 = [], []
    mgr.gh = lambda path, method='GET', body=None, **kw: (
        (_filed_4.append({'number': 3100 + len(_filed_4), **body}) or _filed_4[-1]) if (method == 'POST' and path.endswith('/issues')) else
        (_posts_4.append(body['body']) or {'id': 1}) if (method == 'POST' and f'/issues/{mgr.BOARD}/comments' in path) else []
    )
    def _fail_gem(q, models=None, json_mode=False, temp=None):
        if 'This is the opening of the team meeting' in q:
            _gem_propose_attempts.append(1)
        raise RuntimeError('Gemini unavailable (server busy (503))')
    mgr.ask_gemini = _fail_gem
    mgr.rv.ask_model = lambda sys_p, q, **kw: _json.dumps(
        {'audits': [{'id': 'P2', 'verdict': 'go', 'score': 4, 'why': 'Verified in code.', 'required_fixes': [], 'no_gos': []}]}
        if 'independent, code-grounded peer auditor' in q else
        {'homework': [
            {'to': 'Local AI', 'by': 'Gemini', 'domain': 'SDS-PAGE gels and densitometry', 'question': 'HW1?'},
            {'to': 'Gemini', 'by': 'Codex', 'domain': 'SDS-PAGE gels and densitometry', 'question': 'HW2?'},
            {'to': 'Codex', 'by': 'agy', 'domain': 'SDS-PAGE gels and densitometry', 'question': 'HW3?'},
            {'to': 'agy', 'by': 'Local AI', 'domain': 'SDS-PAGE gels and densitometry', 'question': 'HW4?'},
        ]} if 'secretary of the Direction board' in q else
        {'needs': [], 'answers_topic': True, 'missing': ''} if 'check plans for gaps' in q else
        {'review': 'Local ok.', 'proposals': [{
            'title': 'Guard empty lane profile in gels', 'where': ['gels'], 'why': 'Avoid NaN.',
            'evidence': 'In `bandEnergy` and `#saveSvg`.', 'risk': 'Low.',
            'change': 'In `gels`, guard zero-length lane array in `bandEnergy` before dividing.',
            'check': 'tests/suites/25_gels.js: empty lane renders 0% via H(p).exportSvg()'
        }]}
    )
    mgr.ask_codex = lambda q: _json.dumps(
        {'1': 'Fact 1'} if 'Search the web for each question' in q else
        {'audits': [{'id': 'P1', 'verdict': 'go', 'score': 4, 'why': 'Confirmed in gels.', 'required_fixes': [], 'no_gos': []}]}
        if 'independent, code-grounded peer auditor' in q else
        {'review': 'Codex ok.', 'proposals': [{
            'title': 'Clamp fraction tick text in gels', 'where': ['gels'], 'why': 'Avoid clipping.',
            'evidence': 'In `zoomCompose`.', 'risk': 'Low.',
            'change': 'In `gels`, clamp inset label x inside rect in `zoomCompose`.',
            'check': 'tests/suites/25_gels.js: H(p).svgBoxes(await H(p).exportSvg()) has empty clipped'
        }]}
    )
    mgr.ask_agy = lambda q: _json.dumps(
        {'audits': [
            {'id': 'P1', 'verdict': 'go', 'score': 4, 'why': 'Checked protein-purification-bench.html.', 'required_fixes': [], 'no_gos': []},
            {'id': 'P2', 'verdict': 'go', 'score': 4, 'why': 'Checked zoomCompose.', 'required_fixes': [], 'no_gos': []},
        ]} if 'independent, code-grounded peer auditor' in q else
        {'review': 'Antigravity ok.', 'proposals': []}
    )
    st4 = {'count': {}}
    mgr.board_round(st4, topic='gel densitometry and zoom labels')
    assert len(_gem_propose_attempts) == 1, f'API exception must NOT trigger compact-JSON retry, got {len(_gem_propose_attempts)}'
    assert st4['count'].get('agy', 0) == 0 and st4['count'].get('agy_board', 0) >= 2, st4['count']
    assert len(_filed_4) == 2, f'3 healthy seats should still adopt 2 proposals when Gemini fails, got {len(_filed_4)}'
    assert 'Advisers (4): the local AI, Gemini, ChatGPT, Antigravity.' in _posts_4[0]
    assert len(st4['board']['homework']) == 4, st4['board']['homework']
finally:
    (mgr.gh, mgr.rv.ask_model, mgr.ask_gemini, mgr.ask_codex, mgr.ask_agy, mgr.codex_exe, mgr.agy_exe, mgr.GEMINI_KEY, mgr.DRY) = _orig_4

print("test_board: all asserts passed")
