"""Regression tests for local-manager operational guards (2026-11-22):
- single-instance OS lock (`acquire_instance_lock`) and exclusive console bind (`console.start`)
- `board` in `PC_ONLY` and comment-level `Discuss:` idempotency (`discuss_already_handled`, #1647/#1650)
- `lead_review` `json_mode=True` and non-empty fallback summary when Gemini returns `{}` (#1649)
- `ag_sweep_envs` handling of alternate/missing environment timestamps (#17)
- `reviewer.review` refusal to post empty `**Model notes:**` (#1648/#1649)
"""
import subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import manager as mgr
import console as con

bad = []


def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  ({info})' if not ok and info else ''))
    if not ok:
        bad.append(name)


# 1. Single-instance OS file lock across processes
lock_dir = Path(tempfile.mkdtemp())
lock_file = lock_dir / 'mgr.lock'
got1 = mgr.acquire_instance_lock(lock_file)
sub_code = (
    f"import sys; sys.path.insert(0, {str(HERE)!r}); import manager as m; "
    f"sys.exit(0 if not m.acquire_instance_lock({str(lock_file)!r}) else 1)"
)
r_blocked = subprocess.run([sys.executable, '-c', sub_code], capture_output=True, text=True)
check('acquire_instance_lock blocks a concurrent manager process', got1 and r_blocked.returncode == 0, r_blocked.stderr)
if mgr._LOCK_FH:
    mgr._LOCK_FH.close()
    mgr._LOCK_FH = None
r_after = subprocess.run([
    sys.executable, '-c',
    f"import sys; sys.path.insert(0, {str(HERE)!r}); import manager as m; "
    f"sys.exit(0 if m.acquire_instance_lock({str(lock_file)!r}) else 1)"
], capture_output=True, text=True)
check('acquire_instance_lock releases cleanly once first process closes', r_after.returncode == 0, r_after.stderr)

# 2. Console server binds cleanly and rejects duplicate port bind
srv1 = con.start(mgr, 0)
port = srv1.server_address[1]
srv2 = con.start(mgr, port)
srv1.shutdown()
srv1.server_close()
check('console.start binds a port and returns None when busy', srv1 is not None and srv2 is None)

# 3. Board stays on PC_ONLY and Discuss: comments are idempotent across state files (#1647 / #1650)
check('board is in PC_ONLY alongside creative board', 'board' in mgr.PC_ONLY and 'creative board' in mgr.PC_ONLY)
cs_legacy = [
    {'id': 101, 'body': 'Discuss: Add a directory system'},
    {'id': 102, 'body': 'This `Discuss:` message is written as a concrete specification, so I filed it directly in your own words as **#1647** (`from-patrick`, `queued, owner-approved`)'},
]
cs_marked = [
    {'id': 201, 'body': 'Discuss: Add another spec'},
    {'id': 202, 'body': '<!-- discuss-src 201 -->\nThis `Discuss:` message is written as a concrete specification...'},
]
cs_unhandled = [
    {'id': 301, 'body': 'Discuss: Unhandled spec'},
]
check('discuss_already_handled catches legacy filed reply (#1647/#1650)', mgr.discuss_already_handled(cs_legacy, 101))
check('discuss_already_handled catches discuss-src marker', mgr.discuss_already_handled(cs_marked, 201))
check('discuss_already_handled allows genuinely unhandled Discuss comment', not mgr.discuss_already_handled(cs_unhandled, 301))

# 4. lead_review passes json_mode=True and posts non-empty fallback when Gemini returns non-JSON (#1649)
_orig_gh, _orig_gem, _orig_key, _orig_dry, _orig_rev = mgr.gh, mgr.ask_gemini, mgr.GEMINI_KEY, mgr.DRY, mgr.reviewer
posted_comments, gem_calls = [], []
try:
    mgr.GEMINI_KEY = 'fake-key'
    mgr.DRY = False
    mgr.reviewer = lambda: 'gemini'
    def _fake_gh_lr(path, method='GET', body=None, accept='application/vnd.github+json'):
        if accept.endswith('diff'):
            return 'diff --git a/protein-purification-bench.html b/protein-purification-bench.html\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n'
        if method == 'GET' and path.endswith('/pulls?state=open&per_page=50'):
            return [{'number': 1649, 'head': {'sha': 'bd475ec524'}, 'title': 'Dir system', 'body': 'Closes #1647', 'labels': [{'name': 'ready-for-lead'}]}]
        if method == 'GET' and '/issues/1649/comments' in path:
            return [{'body': '<!-- test-suite-report -->\n### ✅ No regressions\n'}]
        if method == 'GET' and path.endswith('/issues/1647'):
            return {'number': 1647, 'title': 'Dir', 'body': 'Spec', 'labels': [{'name': 'owner-approved'}, {'name': 'from-patrick'}]}
        if method == 'POST' and path.endswith('/issues/1649/comments'):
            posted_comments.append(body['body'])
            return {'id': 1}
        return {}
    def _fake_gem_lr(q, models=None, json_mode=False, temp=None):
        gem_calls.append({'json_mode': json_mode, 'models': models})
        mgr._gem['used'] = 'gemini-flash-lite-latest'
        return 'Sorry, plain text instead of JSON'
    mgr.gh, mgr.ask_gemini = _fake_gh_lr, _fake_gem_lr
    mgr.lead_review({'count': {}})
finally:
    mgr.gh, mgr.ask_gemini, mgr.GEMINI_KEY, mgr.DRY, mgr.reviewer = _orig_gh, _orig_gem, _orig_key, _orig_dry, _orig_rev

check('lead_review requests json_mode=True from Gemini', len(gem_calls) == 1 and gem_calls[0]['json_mode'] is True)
check('lead_review posts non-empty explanation when Gemini returns non-JSON',
      len(posted_comments) == 1 and 'no structured verdict' in posted_comments[0], posted_comments[0] if posted_comments else 'none')

# 5. ag_sweep_envs handles nanosecond/snake_case timestamps and un-timestamped idle sandboxes
_orig_gem_api = mgr.gem_api
deleted_envs = []
try:
    def _fake_gem_api(path, method='GET', body=None):
        if method == 'DELETE' and path.startswith('environments/'):
            deleted_envs.append(path.split('/', 1)[1])
            return {}
        if path.startswith('environments?'):
            return {'environments': [
                {'name': 'projects/p/environments/old-nano', 'update_time': '2026-11-01T00:00:00.123456789Z'},
                {'name': 'projects/p/environments/fresh', 'updateTime': '2099-01-01T00:00:00Z'},
                {'name': 'projects/p/environments/no-ts'},
            ]}
        if path == 'environments/no-ts':
            return {'name': 'projects/p/environments/no-ts'}
        return {}
    mgr.gem_api = _fake_gem_api
    gone_active, tot1 = mgr.ag_sweep_envs(keep_hours=6, has_active_jobs=True)
    check('ag_sweep_envs keeps un-timestamped sandbox while jobs are active, deletes old nanosecond one',
          gone_active == 1 and tot1 == 3 and deleted_envs == ['old-nano'], str(deleted_envs))
    deleted_envs.clear()
    gone_idle, tot2 = mgr.ag_sweep_envs(keep_hours=6, has_active_jobs=False)
    check('ag_sweep_envs deletes un-timestamped sandbox when no Antigravity jobs are active',
          gone_idle == 2 and tot2 == 3 and sorted(deleted_envs) == ['no-ts', 'old-nano'], str(deleted_envs))
finally:
    mgr.gem_api = _orig_gem_api

# 6. reviewer.review refuses to post empty Model notes
_orig_rv_gh, _orig_rv_ask = mgr.rv.gh, mgr.rv.ask_model
try:
    mgr.rv.gh = lambda path, method='GET', body=None, accept='application/vnd.github+json': (
        f'diff --git a/{mgr.rv.APP} b/{mgr.rv.APP}\n@@ -1 +1 @@\n-a\n+b\n' if accept.endswith('diff') else []
    )
    mgr.rv.ask_model = lambda *a, **kw: '   '
    raised = False
    try:
        mgr.rv.review({'number': 1649, 'title': 'x', 'body': '', 'head': {'sha': '1234567'}})
    except RuntimeError as e:
        raised = 'empty review notes' in str(e)
    check('reviewer.review raises instead of posting blank Model notes', raised)
finally:
    mgr.rv.gh, mgr.rv.ask_model = _orig_rv_gh, _orig_rv_ask

# 7. queue-leader.js surfaces open for-coordinator PRs under Waiting on Claude on Status Page #1410
ql_js = """
const ql = require('./.github/scripts/queue-leader.js');
let updatedBody = '';
const github = {
  paginate: async (fn, opts) => fn(opts),
  rest: {
    issues: {
      listForRepo: async ({state, labels}) => state === 'closed' || labels ? [] : [
        {number: 1410, title: 'Status page', state: 'open', labels: [{name: 'status-page'}], body: 'old'},
        {number: 1647, title: 'Directory system', state: 'open', updated_at: new Date().toISOString(), labels: [{name: 'from-patrick'}, {name: 'owner-approved'}, {name: 'agy-done'}]},
      ],
      listLabelsForRepo: async () => ['queued','needs-coordinator','needs-triage','parked','keep-parked','hand-running','needs-plan','status-page','board-tracker','pitches-ready'].map(name => ({name})),
      listComments: async () => [],
      update: async ({issue_number, body}) => { if (issue_number === 1410) updatedBody = body; },
      createComment: async () => {}, addLabels: async () => {}, removeLabel: async () => {},
    },
    pulls: {
      list: async ({state}) => state === 'closed' ? {data: []} : [
        {number: 1649, title: 'Add directory system (#1647)', body: 'Closes #1647', state: 'open', draft: false, created_at: new Date().toISOString(), head: {ref: 'agy/issue-1647', sha: 'abc'}, labels: [{name: 'needs-coordinator'}, {name: 'ready-for-lead'}, {name: 'for-coordinator'}]},
        {number: 1655, title: 'In-flight PR', body: 'Closes #1654', state: 'open', draft: false, created_at: new Date().toISOString(), head: {ref: 'agy/issue-1654', sha: 'def'}, labels: [{name: 'needs-coordinator'}]},
      ],
      listFiles: async () => [{filename: 'protein-purification-bench.html'}],
    },
    actions: { listWorkflowRuns: async () => ({data: {workflow_runs: [{status: 'in_progress', created_at: new Date().toISOString()}]}}) },
  },
};
const core = {info: () => {}, setOutput: () => {}, summary: {addHeading() { return this; }, addList() { return this; }, async write() {}}};
ql({github, context: {repo: {owner: 'patasherry', repo: 'hplc-figure-bench'}}, core}).then(() => {
  const ok = updatedBody.includes('## Waiting on Claude (1)') && updatedBody.includes('#1649') && !updatedBody.includes('#1655') && updatedBody.includes('Pull request #1649 open (waiting on the lead)');
  if (!ok) { console.error(updatedBody); process.exit(1); }
});
"""
r_ql = subprocess.run(['node', '-e', ql_js], cwd=HERE.parents[1], capture_output=True, text=True)
check('queue-leader.js lists for-coordinator PRs under Waiting on Claude without false positives', r_ql.returncode == 0, r_ql.stderr)

# 8. antigravity() skips duplicate push when PR is already open and initializes ag_tried cleanly on failure (#1721)
_orig_ag = (mgr.GEMINI_KEY, mgr.DRY, mgr.gh, mgr.gem_api, mgr.apply_agent_diff, mgr.label, mgr.post, mgr.issues, mgr.issues_q)
push_calls, labelled_ag = [], []
try:
    mgr.GEMINI_KEY = 'fake-key'
    mgr.DRY = False
    def _fake_gh_ag(path, method='GET', body=None, accept='application/vnd.github+json'):
        if method == 'GET' and path.endswith('/pulls?state=open&per_page=100'):
            return [{'number': 1721, 'head': {'ref': 'antigravity/issue-1679'}}]
        return []
    def _fake_gem_ag(path, method='GET', body=None):
        if path == 'interactions/int-fail':
            return {'status': 'incomplete', 'steps': []}
        raise AssertionError(f'unexpected gem_api call: {path}')
    mgr.gh = _fake_gh_ag
    mgr.gem_api = _fake_gem_ag
    mgr.apply_agent_diff = lambda *a, **kw: push_calls.append(a) or 9999
    mgr.label = lambda n, add=None, remove=None: labelled_ag.append((n, add, remove))
    mgr.post = lambda *a, **kw: None
    mgr.issues = lambda *a, **kw: []
    mgr.issues_q = lambda *a, **kw: []
    st_ag = {
        'antigravity': {
            '1679': {'id': 'int-1679', 'title': 'Fraction Yield', 'at': 1000},
            '1680': {'id': 'int-fail', 'title': 'Failing Job', 'at': 1000},
        }
        # Note: 'ag_tried' intentionally absent (as after ag_reset1 pop)
    }
    mgr.antigravity(st_ag)
finally:
    (mgr.GEMINI_KEY, mgr.DRY, mgr.gh, mgr.gem_api, mgr.apply_agent_diff, mgr.label, mgr.post, mgr.issues, mgr.issues_q) = _orig_ag

check('antigravity() skips apply_agent_diff when PR already open on antigravity/issue-N',
      len(push_calls) == 0 and '1679' not in st_ag['antigravity'] and 'int-1679' in st_ag.get('ag_done', []))
check('antigravity() initializes missing ag_tried without KeyError on job failure',
      st_ag.get('ag_tried', {}).get('1680') == 1 and 'int-fail' in st_ag.get('ag_done', []))

# 9. load() reconciles stale cached antigravity jobs against <!-- cloud-state --> on #17
_orig_cloud, _orig_state, _orig_comments = mgr.CLOUD, mgr.STATE, mgr.comments
try:
    tmp_st = Path(tempfile.mkdtemp()) / 'state.json'
    tmp_st.write_text('{"day": "2026-11-24", "count": {}, "antigravity": {"1679": {"id": "int-1679", "title": "FY"}, "1682": {"id": "int-1682", "title": "Active"}}}', encoding='utf-8')
    mgr.CLOUD = True
    mgr.STATE = tmp_st
    mgr.comments = lambda n: [{'body': '<!-- cloud-report -->\n<!-- cloud-state {"ag_off_until": 0, "ag_refused": 0, "ag_done": ["int-1679"], "ag_tried": {"1680": 2}} -->\nlog'}]
    loaded = mgr.load()
finally:
    mgr.CLOUD, mgr.STATE, mgr.comments = _orig_cloud, _orig_state, _orig_comments

check('load() prunes completed Antigravity jobs recorded in cloud-state on #17',
      '1679' not in loaded.get('antigravity', {}) and '1682' in loaded.get('antigravity', {}) and loaded.get('ag_tried', {}).get('1680') == 2)

print(f'\n{len(bad)} failed' if bad else '\nall passed')
sys.exit(1 if bad else 0)
