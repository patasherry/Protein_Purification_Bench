// #1660: Activity assays data model, defensive normalization, uid synchronization, and persistence
// (JSON export/import, IndexedDB local mode, and cloud mode), preserving legacy projects and prep.qcActivity.
const {open, H, suite, src, fs, path, RES} = require('../lib/harness');

async function exportProject(p, filename) {
  const dlPromise = p.waitForEvent('download', {timeout: 10000}).catch(() => null);
  await p.click('#projSave');
  const dl = await dlPromise;
  if (!dl) return null;
  const out = path.join(RES, filename || ('assay_export_' + Date.now() + '.json'));
  await dl.saveAs(out);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

function sampleAssayProject(name) {
  return {
    app: 'HPLC Figure Bench',
    version: 1,
    cur: 'workflow',
    runs: [{
      id: 'r1',
      name: 'HisTrap IMAC',
      stepName: 'IMAC',
      inWf: true,
      uvi: 0,
      uvs: [{name: 'UV1_280', unit: 'mAU', xs: [0, 1, 2, 3, 4, 5], ys: [2, 5, 120, 180, 40, 3]}],
      fracs: [],
      shade: ''
    }],
    traces: [],
    gels: [],
    nanodrop: [{id: 'nd5', name: 'IMAC pool', a280: 1.4, runId: 'r1', stage: 'pool'}],
    prep: {
      on: true,
      name: name || 'pET28-NADK',
      qcActivity: 'Legacy activity note unchanged',
      manual: [{id: 'm3', kind: 'batch', name: 'Batch wash', after: 'r1'}]
    },
    assays: [
      {
        id: 'a7',
        name: 'NADK coupled assay',
        kind: 'continuous',
        stepId: 'r1',
        runId: 'r1',
        stage: 'pool',
        replicates: [{slope: 0.045, timeMin: 5}, {slope: 0.048, timeMin: 5}],
        blanks: [{slope: 0.002}],
        dilution: 10,
        volumes: {assay: 200, sample: 10, unit: 'uL'},
        optics: {wavelength: 340, epsilon: 6220, pathCm: 0.5, stoichiometry: 1},
        proteinOverride: {conc: 1.25, mass: null, vol: 0.5, unit: 'mg/mL'},
        kinetics: {substrate: 'NAD+', unit: 'mM', points: [{s: 0.1, v: 0.012}, {s: 1.0, v: 0.045}]},
        conditions: {buffer: '50 mM Tris pH 7.5', temp: '25 C', ph: '7.5'},
        notes: 'triplicate plate reader'
      },
      {
        name: 'Partial assay',
        replicates: null,
        blanks: null,
        volumes: null,
        optics: null,
        proteinOverride: null,
        kinetics: null,
        conditions: null
      }
    ]
  };
}

function checkAssaysPayload(T, prefix, d) {
  const arr = d && d.assays;
  T.check(`${prefix}.assays-array`, Array.isArray(arr) && arr.length === 2, `assays=${JSON.stringify(arr)}`);
  const a0 = Array.isArray(arr) ? arr[0] : null, a1 = Array.isArray(arr) ? arr[1] : null;
  const rawOk = a0 && a0.id === 'a7'
    && a0.name === 'NADK coupled assay'
    && a0.kind === 'continuous'
    && a0.stepId === 'r1' && a0.runId === 'r1'
    && a0.dilution === 10
    && Array.isArray(a0.replicates) && a0.replicates.length === 2 && a0.replicates[0].slope === 0.045 && a0.replicates[1].slope === 0.048
    && Array.isArray(a0.blanks) && a0.blanks.length === 1 && a0.blanks[0].slope === 0.002
    && a0.volumes && a0.volumes.assay === 200 && a0.volumes.sample === 10 && a0.volumes.unit === 'uL'
    && a0.optics && a0.optics.wavelength === 340 && a0.optics.epsilon === 6220 && a0.optics.pathCm === 0.5 && a0.optics.stoichiometry === 1
    && a0.proteinOverride && a0.proteinOverride.conc === 1.25 && a0.proteinOverride.vol === 0.5 && a0.proteinOverride.unit === 'mg/mL'
    && a0.kinetics && a0.kinetics.substrate === 'NAD+' && Array.isArray(a0.kinetics.points) && a0.kinetics.points.length === 2 && a0.kinetics.points[1].v === 0.045
    && a0.conditions && a0.conditions.buffer === '50 mM Tris pH 7.5' && a0.notes === 'triplicate plate reader';
  T.check(`${prefix}.raw-inputs-preserved`, !!rawOk, JSON.stringify(a0));

  const normOk = a1 && a1.id === 'a8'
    && a1.name === 'Partial assay'
    && Array.isArray(a1.replicates) && a1.replicates.length === 0
    && Array.isArray(a1.blanks) && a1.blanks.length === 0
    && a1.dilution === 1
    && a1.volumes && typeof a1.volumes === 'object' && !Array.isArray(a1.volumes) && a1.volumes.unit === 'uL'
    && a1.optics && typeof a1.optics === 'object' && !Array.isArray(a1.optics) && a1.optics.pathCm === 1
    && a1.proteinOverride && typeof a1.proteinOverride === 'object' && !Array.isArray(a1.proteinOverride) && a1.proteinOverride.unit === 'mg/mL'
    && a1.kinetics && typeof a1.kinetics === 'object' && Array.isArray(a1.kinetics.points)
    && a1.conditions && typeof a1.conditions === 'object' && !Array.isArray(a1.conditions);
  T.check(`${prefix}.null-subobjects-normalized-and-id-assigned`, !!normOk, JSON.stringify(a1));
}

(async () => {
  const T = suite('1700_assay_persistence');

  await T.t('legacy-project-without-assays', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Legacy Assay Check');
      await h.gb(src('gb'));
      await h.addRun(src('his'));
      await h.pool('T1-T6');
      await h.step('final');
      const qcText = 'kcat 12 s^-1 with NAD+, monodisperse by DLS';
      await p.fill('#pr-qcActivity', qcText);
      await p.dispatchEvent('#pr-qcActivity', 'change');
      await h.wait(400);

      await h.step('figure');
      await h.wait(500);
      const sumBefore = await h.sumTable();
      const methBefore = await h.methods();
      const svgBefore = (await h.svgTexts()).map(t => t.t);

      const base = await exportProject(p, 'assay_legacy_base.json');
      T.check('legacy.baseline-exported', !!base, 'baseline export downloaded');
      delete base.assays;

      await p.click('#homeBtn');
      await h.wait(600);
      await p.setInputFiles('#projFile', {
        name: 'legacy_no_assays_project.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(base))
      });
      await h.wait(2200);

      await h.step('final');
      const qcInputAfter = await p.locator('#pr-qcActivity').inputValue();
      await h.step('figure');
      await h.wait(500);
      const sumAfter = await h.sumTable();
      const methAfter = await h.methods();
      const svgAfter = (await h.svgTexts()).map(t => t.t);

      const reExported = await exportProject(p, 'assay_legacy_reexported.json');
      T.check('legacy.assays-initialized-empty-array',
        !!reExported && Array.isArray(reExported.assays) && reExported.assays.length === 0,
        `reExported.assays=${JSON.stringify(reExported && reExported.assays)}`);
      T.check('legacy.qcActivity-unchanged',
        qcInputAfter === qcText && !!reExported && reExported.prep && typeof reExported.prep.qcActivity === 'string' && reExported.prep.qcActivity === qcText && methAfter.includes(qcText),
        `input="${qcInputAfter}", json="${reExported && reExported.prep && reExported.prep.qcActivity}"`);
      T.check('legacy.numbers-and-visuals-identical',
        JSON.stringify(sumBefore) === JSON.stringify(sumAfter) && methBefore === methAfter && JSON.stringify(svgBefore) === JSON.stringify(svgAfter),
        `sumMatch=${JSON.stringify(sumBefore) === JSON.stringify(sumAfter)}, methMatch=${methBefore === methAfter}, svgMatch=${JSON.stringify(svgBefore) === JSON.stringify(svgAfter)}`);
      T.check('legacy.no-page-errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  for (const cloud of [false, true]) {
    const mode = cloud ? 'cloud' : 'local';
    await T.t(`assay-roundtrip-${mode}`, async () => {
      const {p, errs, close} = await open({cloud}), h = H(p);
      try {
        const proj = sampleAssayProject(`Assay_${mode}`);
        await p.setInputFiles('#projFile', {
          name: `assay_${mode}_project.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(proj))
        });
        await h.wait(2200);

        // Verify immediate export preserves IDs, raw values, normalization, and qcActivity
        const exp1 = await exportProject(p, `assay_${mode}_exp1.json`);
        checkAssaysPayload(T, `${mode}.import`, exp1);
        T.check(`${mode}.import.qcActivity-unchanged`,
          !!exp1 && exp1.prep && exp1.prep.qcActivity === 'Legacy activity note unchanged',
          `qcActivity=${JSON.stringify(exp1 && exp1.prep && exp1.prep.qcActivity)}`);

        // Reload page from scratch and reopen stored project from IndexedDB / cloud store
        await p.reload();
        await h.wait(1200);
        const card = p.locator('#projList .pcard').filter({hasText: `assay ${mode}`}).first();
        const cardVis = await card.isVisible().catch(() => false);
        T.check(`${mode}.stored-project-listed`, cardVis, `project card visible in ${mode} mode`);
        if (cardVis) {
          await card.click();
          await h.wait(1800);
        }

        const exp2 = await exportProject(p, `assay_${mode}_exp2.json`);
        checkAssaysPayload(T, `${mode}.reload`, exp2);

        await h.step('final');
        const qcVal = await p.locator('#pr-qcActivity').inputValue();
        T.check(`${mode}.reload.qcActivity-unchanged`,
          qcVal === 'Legacy activity note unchanged' && !!exp2 && exp2.prep && exp2.prep.qcActivity === 'Legacy activity note unchanged',
          `input="${qcVal}", json="${exp2 && exp2.prep && exp2.prep.qcActivity}"`);

        if (!cloud) {
          // Verify IndexedDB record itself persists assays
          const idbAssays = await p.evaluate(() => new Promise(res => {
            const q = indexedDB.open('hfb-projects');
            q.onsuccess = () => {
              const db = q.result, tx = db.transaction('projects', 'readonly'), req = tx.objectStore('projects').getAll();
              req.onsuccess = () => {
                const all = req.result || [];
                const hit = all.find(r => /assay local/i.test(r.name || ''));
                db.close();
                if (!hit || !hit.data) return res(null);
                try { res(JSON.parse(hit.data).assays); } catch (e) { res(null); }
              };
              req.onerror = () => { db.close(); res(null); };
            };
            q.onerror = () => res(null);
          }));
          T.check('local.idb-persists-assays',
            Array.isArray(idbAssays) && idbAssays.length === 2 && idbAssays[0].id === 'a7' && idbAssays[1].id === 'a8',
            `idbAssays=${JSON.stringify(idbAssays)}`);

          // Verify uid advanced synchronously past r1, m3, nd5, a7, a8: adding a new run allocates id >= r9
          await h.addRun(src('q'));
          const exp3 = await exportProject(p, 'assay_local_uid_check.json');
          const newRun = exp3 && Array.isArray(exp3.runs) ? exp3.runs.find(r => r.id !== 'r1') : null;
          const m = newRun && /^r(\d+)$/.exec(String(newRun.id || ''));
          const newNum = m ? +m[1] : 0;
          T.check('local.uid-advances-past-assays',
            !!newRun && newNum >= 9,
            `newRun.id=${newRun && newRun.id} (expected >= r9 after r1, m3, nd5, a7, a8)`);
        }

        T.check(`${mode}.no-page-errors`, !errs.length, errs.join(' | '));
      } finally {
        await close();
      }
    });
  }

  await T.t('assays-only-project-export', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      const onlyAssay = {
        app: 'HPLC Figure Bench',
        version: 1,
        runs: [],
        traces: [],
        gels: [],
        nanodrop: [],
        prep: {on: true, qcActivity: 'Fallback text'},
        assays: [{name: 'Crude lysate assay', replicates: [0.18, 0.20], blanks: [0.01], dilution: 20}]
      };
      await p.setInputFiles('#projFile', {
        name: 'assays_only_project.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(onlyAssay))
      });
      await h.wait(1800);

      const exp = await exportProject(p, 'assays_only_export.json');
      T.check('assays-only.exported-and-assigned-a1',
        !!exp && Array.isArray(exp.assays) && exp.assays.length === 1 && exp.assays[0].id === 'a1'
          && exp.assays[0].dilution === 20 && exp.assays[0].replicates[0] === 0.18
          && exp.prep && exp.prep.qcActivity === 'Fallback text',
        JSON.stringify(exp && {assays: exp.assays, qc: exp.prep && exp.prep.qcActivity}));
      T.check('assays-only.no-page-errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
