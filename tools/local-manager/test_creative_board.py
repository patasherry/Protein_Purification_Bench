"""Offline unit + end-to-end tests for the Creative Direction Board (creative_board.py + manager.py)."""
import json as _json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import boardledger as bl
import boardmap as bm
import creative_board as cb
import manager as mgr
import planner as pl

ROOT = HERE.parents[1]
doms = bm.parse_map((ROOT / 'docs' / 'BOARD_MAP.md').read_text(encoding='utf-8'))
secs = list(bm.codemap_rows((ROOT / 'docs' / 'CODEMAP.md').read_text(encoding='utf-8')))
suites = sorted(x.stem for x in (ROOT / 'tests' / 'suites').glob('*.js'))

# 1. Cross-domain pairing rotates least-recently-seen synergy pairs and cools down repeatedly declined seams
seen = {}
a1, b1 = cb.pick_domain_pair(doms, seen)
assert a1 and b1 and a1['name'] != b1['name']
declined_pair = [
    {'kind': 'owner_declined', 'where': a1['code'][:1]},
    {'kind': 'owner_declined', 'where': b1['code'][:1]},
]
a_cool, b_cool = cb.pick_domain_pair(doms, {}, ledger_entries=declined_pair)
assert (a_cool['name'], b_cool['name']) != (a1['name'], b1['name'])
seen[f'{a1["name"]} || {b1["name"]}'] = 100
a2, b2 = cb.pick_domain_pair(doms, seen)
assert (a2['name'], b2['name']) != (a1['name'], b1['name'])

# 1b. clean_homework(..., ensure_all=True) backfills any omitted seat so both advisers get questions
hw_backfill = bm.clean_homework(
    [{'to': 'Gemini', 'by': 'the local AI', 'domain': a1['name'], 'question': 'How do journals display pool purity?'}],
    ['the local AI', 'Gemini'], [d['name'] for d in doms], default_domain=a1['name'], ensure_all=True,
)
assert [h['to'] for h in hw_backfill] == ['Gemini', 'the local AI'], hw_backfill

# 2. Nitpick filter blocks micro-lints from entering the Creative Board
assert cb.is_nitpick_only({'title': 'Enforce strict alphanumeric validation on construct IDs', 'idea': 'Apply a regex filter.'})
assert not cb.is_nitpick_only({'title': 'Purity-weighted fraction pooling simulator', 'idea': 'Overlay SDS-PAGE lane purity onto chromatogram fractions.'})

# 3. Peer critique scoring, already_exists veto, and diverse 3-archetype deck selection
keep, sc, _, _, _, sh, _ = cb.score_pitch([
    {'by': 'Gemini', 'novelty': 5, 'lab_value': 5, 'elegance': 5, 'why': 'self vote ignored'},
    {'by': 'the local AI', 'already_exists': False, 'novelty': 4, 'lab_value': 5, 'elegance': 4, 'why': 'Bridges gels and UV peaks.', 'sharpen': 'Show target mg directly above the pool bar.'},
], author='Gemini')
assert keep and sc >= 4.0 and sh == ['Show target mg directly above the pool bar.']

veto_keep, _, _, _, _, _, _ = cb.score_pitch([
    {'by': 'the local AI', 'already_exists': True, 'novelty': 1, 'lab_value': 2, 'elegance': 2, 'why': 'Already built in #1455.'}
], author='Gemini')
assert not veto_keep

deck = cb.select_diverse_deck([
    {'id': 'C1', 'title': 'Idea A1', 'archetype': 'data_bridge', 'score': 4.6, 'keep': True},
    {'id': 'C2', 'title': 'Idea A2', 'archetype': 'data_bridge', 'score': 4.5, 'keep': True},
    {'id': 'C3', 'title': 'Idea B1', 'archetype': 'zero_click', 'score': 4.1, 'keep': True},
    {'id': 'C4', 'title': 'Idea S1', 'archetype': 'storyteller', 'score': 3.9, 'keep': True},
], max_cards=3)
assert [d['id'] for d in deck] == ['C1', 'C3', 'C4'], [d['id'] for d in deck]

# 4. Owner reply parser (`OK`, `Explore`, `Refine`, `No`, `Discuss`)
assert cb.parse_owner_pick('OK 2: keep it collapsed under More by default') == ('ok', [2], 'keep it collapsed under More by default')
assert cb.parse_owner_pick('OK 1, 3') == ('ok', [1, 3], '')
assert cb.parse_owner_pick('Explore 1: how would co-eluting peaks behave?') == ('explore', [1], 'how would co-eluting peaks behave?')
assert cb.parse_owner_pick('Refine 2 - show only when protease is selected') == ('refine', [2], 'show only when protease is selected')
assert cb.parse_owner_pick('No all: happy with current workflow') == ('no', 'all', 'happy with current workflow')
assert cb.parse_owner_pick('No 2 - already do this in SnapGene') == ('no', [2], 'already do this in SnapGene')
assert cb.parse_owner_pick('Discuss: how can we link gels and chromatograms?') == (None, [], '')

# 5. Multi-step pitch issue payload integrates cleanly with planner.py validation + comment deck hydration
pitch_multi = {
    'title': 'Purity-weighted fraction pooler across gels and chromatograms',
    'archetype': 'data_bridge',
    'where': ['band tags and purity', 'peak integration'],
    'moment': 'Choosing whether shoulder fractions dilute purity or add worthwhile target mg.',
    'idea': 'Map SDS-PAGE lane purity onto run fractions so dragging pool bounds previews purity-weighted target mg versus total protein mg.',
    'check_sketch': 'tests/suites/25_gels.js verifies purity-weighted target mg updates when pool bounds move.',
    'scope': 'medium',
    'sharpens': ['Display target mg alongside pooled purity % in the run summary.'],
    'science_check': '',
    'score': 4.5,
}
rendered_md = cb.render_deck('2026-11-20 10:00', 'Gels × Chromatograms', ['the local AI', 'Gemini'], [], [pitch_multi])
hydrated = cb.parse_deck_from_comment(rendered_md)
assert len(hydrated) == 1 and hydrated[0]['title'] == pitch_multi['title'] and hydrated[0]['where'] == pitch_multi['where'], hydrated

t_out, labs_out, body_out, is_multi = cb.pitch_issue_payload(pitch_multi, guidance='Keep optional when no gel is assigned.', board_num=1700, round_label='2026-11-19 12:00')
assert is_multi and 'needs-plan' in labs_out and 'from-patrick' in labs_out and 'from-creative-board' in labs_out
split_jobs = [
    {'title': 'Purity pooler: fraction-to-lane purity lookup',
     'quote': 'Map SDS-PAGE lane purity onto run fractions so dragging pool bounds previews purity-weighted target mg',
     'change': 'Compute per-fraction target purity from assigned SDS-PAGE lanes and expose purity-weighted mass on pooled windows.',
     'check': 'In tests/suites/25_gels.js, assigning two lanes of different purity updates pooled target mg.',
     'where': ['band tags and purity'], 'science': False},
    {'title': 'Purity pooler: run summary readout',
     'quote': 'Display target mg alongside pooled purity % in the run summary.',
     'change': 'Render purity-weighted target mg and pooled purity % in the chromatogram pool summary when gel lanes are linked.',
     'check': 'tests/suites/770_pool_area.js shows target mg and hides it cleanly when no gel is assigned.',
     'where': ['peak integration'], 'science': False},
]
v_jobs, v_probs = pl.validate(split_jobs, body_out + ' ' + t_out, secs, suites)
assert len(v_jobs) == 2 and not v_probs, v_probs

# 6. End-to-end offline simulation of creative_round() + Explore/Refine workshop + OK/No handling
_orig_gh, _orig_local, _orig_gem, _orig_key, _orig_dry, _orig_loc_ledger = (
    mgr.gh, mgr.rv.ask_model, mgr.ask_gemini, mgr.GEMINI_KEY, mgr.DRY, bl.LOCAL_LEDGER
)
created_issues, posted_comments, label_ops = [], [], []
try:
    with tempfile.TemporaryDirectory() as tmp:
        bl.LOCAL_LEDGER = Path(tmp) / 'ledger.json'
        mgr.GEMINI_KEY = 'fake-test-key'
        mgr.DRY = False
        board_comments = []

        def _fake_gh(path, method='GET', body=None, **kw):
            if method == 'POST' and path.endswith('/issues'):
                num = 3001 + len(created_issues)
                rec = {'number': num, **body}
                created_issues.append(rec)
                return rec
            if method == 'POST' and '/issues/2500/comments' in path:
                cid = 500 + len(board_comments)
                cobj = {'id': cid, 'body': body['body'], 'created_at': '2026-11-19T20:00:00Z', 'user': {'login': mgr.OWNER}}
                board_comments.append(cobj)
                posted_comments.append(body['body'])
                return cobj
            if path.startswith(f'repos/{mgr.REPO}/issues/2500/comments'):
                return list(board_comments)
            if method in ('POST', 'DELETE') and '/issues/2500/labels' in path:
                label_ops.append((method, path, body))
                return {}
            return []

        def _fake_local(sys_p, q, json_mode=False, temp=None):
            if 'workshopping Concept Pitch Card' in q:
                return _json.dumps({
                    'answer': 'We reuse `gel.assign` directly so zero new lane-mapping inputs are needed.',
                    'title': 'Purity-weighted fraction pooler via gel.assign',
                    'where': ['band tags and purity', 'peak integration'],
                    'moment': 'Choosing whether shoulder fractions dilute purity or add worthwhile target mg.',
                    'idea': 'Use existing `gel.assign` mappings to weight pooled UV area by lane target purity % and show functional monomer mg only when a gel lane is linked.',
                    'check_sketch': 'tests/suites/25_gels.js verifies monomer mg updates via gel.assign and stays hidden when unlinked.',
                    'scope': 'medium',
                    'science_check': '',
                })
            if 'critiquing Concept Pitch Cards' in q:
                return _json.dumps({'critiques': [
                    {'id': 'C2', 'already_exists': False, 'novelty': 4, 'lab_value': 5, 'elegance': 4,
                     'why': 'Saves manual ProtParam + buffer table lookups.', 'sharpen': 'Auto-pick Q vs SP column recommendation.'}
                ]})
            return _json.dumps({'vision_note': 'Bridge gels with fraction pooling.', 'pitches': [dict(pitch_multi)]})

        def _fake_gem(q, models=None, json_mode=False, temp=None):
            if 'workshopping Concept Pitch Card' in q:
                return _json.dumps({
                    'answer': 'Hiding the readout when `gel.assign` has no linked lanes keeps single-run workflows completely clean.',
                    'title': 'Purity-weighted fraction pooler via gel.assign',
                    'idea': 'Use existing `gel.assign` mappings to weight pooled UV area by lane target purity % and show functional monomer mg only when a gel lane is linked.',
                })
            if 'scouting fresh external inspiration' in q:
                return _json.dumps({'homework': [{'to': 'the local AI', 'by': 'Gemini', 'domain': 'Protein and sequence', 'question': 'How do ion-exchange handbooks choose pH offset from pI?', 'search': 'ion exchange pI buffer pH'}]})
            if 'critiquing Concept Pitch Cards' in q:
                return _json.dumps({'critiques': [
                    {'id': 'C1', 'already_exists': False, 'novelty': 5, 'lab_value': 5, 'elegance': 4,
                     'why': 'Directly links densitometry to pooling.', 'sharpen': 'Highlight peak purity sweet-spot.'}
                ]})
            return _json.dumps({'vision_note': 'Eliminate external pI calculators.', 'pitches': [{
                'title': 'Automatic pI vs buffer pH charge badge on ion-exchange runs',
                'archetype': 'zero_click',
                'where': ['run conditions: column, buffers, flow, temperature, gradient, load, fractions'],
                'moment': 'Setting up HiTrap Q or SP buffers without misjudging net protein charge.',
                'idea': 'Compare sequence theoretical pI in prep against run buffer pH to display predicted net charge sign and resin match.',
                'check_sketch': 'tests/suites/22_protein.js checks net charge badge on HiTrap Q at pH 8.0.',
                'scope': 'small',
                'science_check': ''
            }]})

        mgr.gh, mgr.rv.ask_model, mgr.ask_gemini = _fake_gh, _fake_local, _fake_gem
        st = {'count': {}, 'creative_board': {'issue': 2500}}
        mgr.creative_round(st, board_num=2500)
        assert st['creative_board']['pending'] is True and len(st['creative_board']['deck']) == 2
        assert len(st['creative_board']['homework']) == 2, st['creative_board']['homework']
        assert posted_comments and posted_comments[0].startswith(cb.CREATIVE_MARK)
        assert 'Existing code hooks:' in posted_comments[0], posted_comments[0]
        assert any(op[0] == 'POST' and body == {'labels': ['pitches-ready']} for op in label_ops for body in [op[2]])

        # Step 6a: Simulate Patrick replying `Refine 1: use gel.assign directly and hide when unlinked` BEFORE `OK 1`
        board_comments.append({'id': 900, 'body': 'Refine 1: use gel.assign directly and hide when unlinked', 'created_at': '2026-11-19T20:03:00Z', 'user': {'login': mgr.OWNER}})
        mgr.creative_board(st)
        assert len(created_issues) == 0, 'Refine must workshop in-place without spawning issues yet'
        assert st['creative_board']['pending'] is True
        assert cb.WORKSHOP_MARK in posted_comments[-1]
        assert st['creative_board']['deck'][0]['title'] == 'Purity-weighted fraction pooler via gel.assign'

        # Step 6b: Simulate Patrick now replying `OK 1: keep optional` and `No 2: I check pI mentally`
        board_comments.append({'id': 901, 'body': 'OK 1: keep optional when no gel is linked', 'created_at': '2026-11-19T20:05:00Z', 'user': {'login': mgr.OWNER}})
        board_comments.append({'id': 902, 'body': 'No 2: I check pI mentally', 'created_at': '2026-11-19T20:06:00Z', 'user': {'login': mgr.OWNER}})
        mgr.creative_board(st)
        assert len(created_issues) == 1, created_issues
        filed = created_issues[0]
        assert filed['title'] == 'Purity-weighted fraction pooler via gel.assign'
        assert 'existing `gel.assign` mappings' in filed['body']
        assert 'needs-plan' in filed['labels'] and 'from-creative-board' in filed['labels']
        assert 'keep optional when no gel is linked' in filed['body']
        assert st['creative_board']['pending'] is False
        saved_led = bl.load_ledger(local_path=bl.LOCAL_LEDGER)
        assert any('Automatic pI vs buffer pH' in r['title'] and r['kind'] == 'owner_declined' for r in saved_led)
finally:
    mgr.gh, mgr.rv.ask_model, mgr.ask_gemini, mgr.GEMINI_KEY, mgr.DRY, bl.LOCAL_LEDGER = (
        _orig_gh, _orig_local, _orig_gem, _orig_key, _orig_dry, _orig_loc_ledger
    )

print('test_creative_board: all asserts passed')
