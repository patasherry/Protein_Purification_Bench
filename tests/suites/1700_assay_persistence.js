// 1700 assay persistence (#1660): Activity assays data model and persistence.
// Tests verify that legacy projects without assays load with assays = [],
// that assays persist across export and import with immutable raw inputs and allocated IDs (a1, a2, ...),
// that uid advances synchronously across entities to prevent ID collisions,
// that defensive normalizer makeAssay prevents crashes on null/missing sub-objects,
// and that prep.qcActivity is preserved intact.
const {open, H, suite, fs, path} = require('../lib/harness');
const os = require('os');

(async () => {
  const T = suite('1700_assay_persistence');

  await T.t('legacy-project-empty-assays', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const legacyProject = {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        saved: new Date().toISOString(),
        cur: 'overlay',
        opt: {},
        runs: [
          {
            id: 'r1',
            name: 'IMAC Step',
            color: '#0072b2',
            uvs: [{ name: 'UV 280', unit: 'mAU', xs: [0, 1, 2], ys: [0, 10, 0] }],
            fracs: []
          }
        ],
        traces: [],
        gels: [],
        prep: {
          name: 'Dehydrogenase',
          qcActivity: 'Specific activity: 42.5 U/mg (legacy text)'
        }
      };

      const tmpLegacy = path.join(os.tmpdir(), `legacy_assay_${Date.now()}_1.json`);
      fs.writeFileSync(tmpLegacy, JSON.stringify(legacyProject));

      await p.setInputFiles('#projFile', tmpLegacy);
      await h.wait(400);

      const [dl] = await Promise.all([
        p.waitForEvent('download', {timeout: 10000}),
        p.click('#projSave')
      ]);
      const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));

      T.check('legacy/assays-array-present', Array.isArray(saved.assays), 'assays key missing or not an array on export');
      T.check('legacy/assays-empty-default', Array.isArray(saved.assays) && saved.assays.length === 0, `Expected empty assays array, got length ${saved.assays ? saved.assays.length : 'none'}`);
      T.check('legacy/qcActivity-intact', saved.prep && saved.prep.qcActivity === 'Specific activity: 42.5 U/mg (legacy text)', `qcActivity modified: ${saved.prep ? saved.prep.qcActivity : 'missing'}`);
      T.check('legacy/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('assay-roundtrip-and-id-allocation', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const baseProject = {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        saved: new Date().toISOString(),
        cur: 'overlay',
        opt: {},
        runs: [
          {
            id: 'r1',
            name: 'SEC Run',
            color: '#0072b2',
            uvs: [{ name: 'UV 280', unit: 'mAU', xs: [0, 1, 2], ys: [0, 10, 0] }],
            fracs: []
          }
        ],
        traces: [],
        gels: [],
        prep: {
          name: 'Kinase Construct',
          qcActivity: 'kcat 15.4 s⁻¹ with ATP'
        },
        assays: [
          {
            name: 'Initial Rate Assay',
            replicates: [0.125, 0.130, 0.128],
            blanks: [0.005],
            dilutions: [10],
            assayVolume: 100,
            assayVolumes: [100, 100, 100],
            extCoeff: 6220,
            proteinOverride: 0.75
          }
        ]
      };

      const tmp1 = path.join(os.tmpdir(), `assay_rt_${Date.now()}_1.json`);
      fs.writeFileSync(tmp1, JSON.stringify(baseProject));

      await p.setInputFiles('#projFile', tmp1);
      await h.wait(400);

      // Save to export
      const [dl1] = await Promise.all([
        p.waitForEvent('download', {timeout: 10000}),
        p.click('#projSave')
      ]);
      const saved1 = JSON.parse(fs.readFileSync(await dl1.path(), 'utf8'));

      T.check('roundtrip/count-one', Array.isArray(saved1.assays) && saved1.assays.length === 1, `Expected 1 assay, got ${saved1.assays ? saved1.assays.length : 'none'}`);
      const a1 = saved1.assays && saved1.assays[0];
      T.check('roundtrip/id-assigned', a1 && /^a\d+$/.test(a1.id), `Expected assay id matching /^a\\d+$/, got ${a1 ? a1.id : 'none'}`);
      T.check('roundtrip/name-preserved', a1 && a1.name === 'Initial Rate Assay', `Name: ${a1 ? a1.name : 'none'}`);
      T.check('roundtrip/replicates-immutable', a1 && JSON.stringify(a1.replicates) === JSON.stringify([0.125, 0.130, 0.128]), `Replicates: ${a1 ? JSON.stringify(a1.replicates) : 'none'}`);
      T.check('roundtrip/blanks-immutable', a1 && JSON.stringify(a1.blanks) === JSON.stringify([0.005]), `Blanks: ${a1 ? JSON.stringify(a1.blanks) : 'none'}`);
      T.check('roundtrip/dilutions-immutable', a1 && JSON.stringify(a1.dilutions) === JSON.stringify([10]), `Dilutions: ${a1 ? JSON.stringify(a1.dilutions) : 'none'}`);
      T.check('roundtrip/volumes-immutable', a1 && a1.assayVolume === 100 && JSON.stringify(a1.assayVolumes) === JSON.stringify([100, 100, 100]), `Volumes: ${a1 ? a1.assayVolume : 'none'}`);
      T.check('roundtrip/extcoeff-immutable', a1 && a1.extCoeff === 6220, `extCoeff: ${a1 ? a1.extCoeff : 'none'}`);
      T.check('roundtrip/override-immutable', a1 && a1.proteinOverride === 0.75, `proteinOverride: ${a1 ? a1.proteinOverride : 'none'}`);
      T.check('roundtrip/qcActivity-unchanged', saved1.prep && saved1.prep.qcActivity === 'kcat 15.4 s⁻¹ with ATP', `qcActivity: ${saved1.prep ? saved1.prep.qcActivity : 'none'}`);

      // Reload exported project and verify bit-identical raw persistence
      const tmp2 = path.join(os.tmpdir(), `assay_rt_${Date.now()}_2.json`);
      fs.writeFileSync(tmp2, JSON.stringify(saved1));

      await p.setInputFiles('#projFile', tmp2);
      await h.wait(400);

      const [dl2] = await Promise.all([
        p.waitForEvent('download', {timeout: 10000}),
        p.click('#projSave')
      ]);
      const saved2 = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));

      T.check('reload/assay-persists', Array.isArray(saved2.assays) && saved2.assays.length === 1, `Reload assay count: ${saved2.assays ? saved2.assays.length : 'none'}`);
      const a2 = saved2.assays && saved2.assays[0];
      T.check('reload/id-stable', a2 && a2.id === a1.id, `ID shifted on reload: ${a2 ? a2.id : 'none'} vs ${a1 ? a1.id : 'none'}`);
      T.check('reload/raw-inputs-identical', a2 && a2.extCoeff === 6220 && a2.proteinOverride === 0.75 && JSON.stringify(a2.replicates) === JSON.stringify(a1.replicates), 'Raw inputs changed on reload');
      T.check('reload/qcActivity-unchanged', saved2.prep && saved2.prep.qcActivity === 'kcat 15.4 s⁻¹ with ATP', 'qcActivity changed on reload');
      T.check('reload/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('defensive-normalizer-null-subobjects', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const malformedProject = {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        saved: new Date().toISOString(),
        cur: 'overlay',
        opt: {},
        runs: [
          {
            id: 'r1',
            name: 'Run 1',
            color: '#0072b2',
            uvs: [{ name: 'UV', unit: 'mAU', xs: [0, 1], ys: [0, 1] }],
            fracs: []
          }
        ],
        traces: [],
        gels: [],
        prep: { name: 'P' },
        assays: [
          {
            name: 'Defensive Assay',
            replicates: null,
            blanks: null,
            dilutions: null,
            assayVolumes: null,
            raw: null
          }
        ]
      };

      const tmp = path.join(os.tmpdir(), `assay_defensive_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(malformedProject));

      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

      const [dl] = await Promise.all([
        p.waitForEvent('download', {timeout: 10000}),
        p.click('#projSave')
      ]);
      const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));

      T.check('defensive/loaded-without-crash', Array.isArray(saved.assays) && saved.assays.length === 1, 'Failed to load malformed assay');
      const a = saved.assays && saved.assays[0];
      T.check('defensive/replicates-array', Array.isArray(a && a.replicates), `replicates is ${typeof (a && a.replicates)}`);
      T.check('defensive/blanks-array', Array.isArray(a && a.blanks), `blanks is ${typeof (a && a.blanks)}`);
      T.check('defensive/dilutions-array', Array.isArray(a && a.dilutions), `dilutions is ${typeof (a && a.dilutions)}`);
      T.check('defensive/assayVolumes-array', Array.isArray(a && a.assayVolumes), `assayVolumes is ${typeof (a && a.assayVolumes)}`);
      T.check('defensive/raw-object', a && a.raw && typeof a.raw === 'object' && !Array.isArray(a.raw), `raw is ${typeof (a && a.raw)}`);
      T.check('defensive/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('uid-synchronous-advance-prevents-collision', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const projectWithHighIdAssay = {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        saved: new Date().toISOString(),
        cur: 'overlay',
        opt: {},
        runs: [
          {
            id: 'r1',
            name: 'Run 1',
            color: '#0072b2',
            uvs: [{ name: 'UV', unit: 'mAU', xs: [0, 1], ys: [0, 1] }],
            fracs: []
          }
        ],
        traces: [],
        gels: [],
        prep: { name: 'P' },
        assays: [
          {
            id: 'a7',
            name: 'Assay 7',
            replicates: [1.0]
          },
          {
            name: 'Assay Unassigned',
            replicates: [2.0]
          }
        ]
      };

      const tmp = path.join(os.tmpdir(), `assay_uid_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(projectWithHighIdAssay));

      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

      const [dl] = await Promise.all([
        p.waitForEvent('download', {timeout: 10000}),
        p.click('#projSave')
      ]);
      const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));

      T.check('uid/both-assays-persisted', Array.isArray(saved.assays) && saved.assays.length === 2, `Count: ${saved.assays ? saved.assays.length : 0}`);
      const a7 = saved.assays && saved.assays.find(x => x.name === 'Assay 7');
      const unassigned = saved.assays && saved.assays.find(x => x.name === 'Assay Unassigned');
      T.check('uid/a7-preserved', a7 && a7.id === 'a7', `a7 id: ${a7 ? a7.id : 'none'}`);
      T.check('uid/new-id-advances-past-max', unassigned && /^a\d+$/.test(unassigned.id) && +unassigned.id.slice(1) >= 8, `Expected id >= a8, got ${unassigned ? unassigned.id : 'none'}`);
      T.check('uid/no-id-collision', a7 && unassigned && a7.id !== unassigned.id, `ID collision: ${a7 ? a7.id : ''} === ${unassigned ? unassigned.id : ''}`);
      T.check('uid/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });
})();
