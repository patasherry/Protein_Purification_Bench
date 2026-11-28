// The harness keeps every check when an id repeats (#1832): compare.js keys results by suite/id, so a repeated id used to let a
// later pass overwrite an earlier failure. No browser: this exercises the harness itself through a scratch suite.
const {suite, RES, path, fs} = require('../lib/harness');
const T = suite('test_harness_ids');
const S = suite('zz_scratch_ids'); S.check('no page errors', false, 'first scenario failed'); S.check('no page errors', true); S.check('other', true); S.done();
const f = path.join(RES, 'zz_scratch_ids.json'), got = JSON.parse(fs.readFileSync(f, 'utf8')).checks; fs.unlinkSync(f);
const ids = got.map(c => c.id), keyed = {}; got.forEach(c => { keyed[c.id] = c; });
T.check('repeated-ids-are-unique', new Set(ids).size === ids.length, JSON.stringify(ids));
T.check('earlier-failure-survives-keying', Object.values(keyed).some(c => !c.ok), JSON.stringify(keyed));
T.done(); process.exit(0);
