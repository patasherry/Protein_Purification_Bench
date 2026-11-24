// Consolidated activity assays suite: persistence & normalization (local/cloud/JSON), legacy qcActivity invariance,
// rate/specific-activity/fold/yield & Levenberg-Marquardt kinetics engine (MM, Hill, Haldane, SD weighting),
// UI & CSV/TSV ingestion, chromatogram figure tracks/overlays/panels/standalone exports, and STRENDA Methods/summary/CSV.
const os = require('os');
const {open, H, suite, fits, src, fs, path, RES} = require('../lib/harness');

async function exportProject(p, filename) {
  const dlPromise = p.waitForEvent('download', {timeout: 10000}).catch(() => null);
  await p.click('#projSave');
  const dl = await dlPromise;
  if (!dl) return null;
  const out = path.join(os.tmpdir(), filename || ('assay_export_' + Date.now() + '.json'));
  await dl.saveAs(out);
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(out, {force: true});
  return parsed;
}

async function importJsonAndCalc(p, h, name, proj) {
  if (await p.locator('#homeBtn').isVisible().catch(() => false)) {
    await p.click('#homeBtn');
    await h.wait(250);
  }
  await p.setInputFiles('#projFile', {
    name: name || 'assay_test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proj))
  });
  await h.wait(900);
  const raw = await p.evaluate(() => {
    const el = document.getElementById('assayCalcData');
    return el ? el.textContent : '';
  });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function baseProject(assays, extra) {
  return Object.assign({
    app: 'HPLC Figure Bench',
    version: 1,
    cur: 'workflow',
    runs: [],
    traces: [],
    gels: [],
    nanodrop: [],
    prep: {on: true, name: 'Synthetic Enzyme'},
    assays
  }, extra || {});
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

function makeRun(id, name, stepName, peakX, shade) {
  const xs = [], ys = [];
  for (let i = 0; i <= 40; i++) {
    const x = +(i * 0.5).toFixed(2);
    xs.push(x);
    ys.push(+(5 + 200 * Math.exp(-0.5 * ((x - peakX) / 1.0) ** 2)).toFixed(3));
  }
  return {
    id, name, stepName, inWf: true, color: '#0072B2',
    uvs: [{name: 'UV 280', unit: 'mAU', xs, ys}],
    uvIdx: 0, xUnit: 'mL', flowAuto: 1, path: '2',
    shade,
    fracs: [
      {x: peakX - 1.5, label: 'F1'},
      {x: peakX - 0.5, label: 'F2'},
      {x: peakX + 0.5, label: 'F3'},
      {x: peakX + 1.5, label: 'F4'}
    ],
    fracEnd: peakX + 2.5,
    phases: [], integ: []
  };
}

function makeSecChromProject(inWf) {
  const xs = [], ys = [];
  for (let i = 0; i <= 120; i++) {
    const v = 8 + i * 0.1;
    xs.push(+v.toFixed(2));
    ys.push(+(180 * Math.exp(-0.5 * Math.pow((v - 14.0) / 0.65, 2))).toFixed(3));
  }
  return {
    app: 'Protein Purification Bench',
    version: 1,
    schemaVersion: 1,
    quick: !inWf,
    cur: 'r1',
    name: 'SEC Activity Figure Prep',
    runs: [{
      id: 'r1', name: 'Superdex 200 SEC', inWf: !!inWf, color: '#0072B2',
      uvs: [{name: 'UV 280', unit: 'mAU', xs, ys}],
      fracs: [
        {x: 12.5, label: 'T1'}, {x: 13.0, label: 'T2'}, {x: 13.5, label: 'T3'},
        {x: 14.0, label: 'T4'}, {x: 14.5, label: 'T5'}, {x: 15.0, label: 'T6'}
      ],
      fracEnd: 15.5,
      phases: [], shade: 'T3-T5', integ: []
    }],
    traces: [], gels: [], ndSamples: [],
    prep: inWf ? {on: true, name: 'SEC Prep', qcActivity: 'Legacy note'} : {on: false},
    opt: {sec: 'none'},
    assays: [{
      id: 'a1',
      name: 'Phosphatase Fractions',
      mode: 'fractions',
      runId: 'r1',
      protocol: {substrate: 'pNPP', eps_mM: 18.0, pathCm: 1.0, rxnVolMl: 1.0, enzVolMl: 0.05},
      blanks: [],
      entries: [
        {fracLabel: 'T2', rawVals: [0.5, 1.0, 1.5], rawUnit: 'U/mL', dil: 1, protMgMl: 0.25},
        {fracLabel: 'T3', rawVals: [4.2, 5.0, 5.8], rawUnit: 'U/mL', dil: 1, protMgMl: 0.80},
        {fracLabel: 'T4', rawVals: [8.8, 10.0, 11.2], rawUnit: 'U/mL', dil: 1, protMgMl: 1.25},
        {fracLabel: 'T5', rawVals: [5.2, 6.0, 6.8], rawUnit: 'U/mL', dil: 1, protMgMl: 0.75},
        {fracLabel: 'T6', rawVals: [1.0, 1.5, 2.0], rawUnit: 'U/mL', dil: 1, protMgMl: 0.20}
      ],
      display: {visible: true, placement: 'track', color: '#D55E00', showErr: 'sd', yUnit: 'U/mL'}
    }]
  };
}

async function txt(root, sel) {
  const loc = root.locator(sel);
  if ((await loc.count()) === 0) return '';
  return ((await loc.first().textContent()) || '').trim();
}

(async () => {
  const T = suite('19_assays');

  // 1. Legacy project without structured assays (#1700 + #1704 deduplicated into one run)
  await T.t('legacy-project-without-assays-invariance', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Legacy Assay Check');
      await h.gb(src('gb'));
      await h.addRun(src('his'));
      await h.pool('T1-T6');
      await h.step('final');
      if (await p.locator('#finQcMore').count()) {
        await p.locator('#finQcMore').evaluate(e => { e.open = true; });
      }
      const qcText = 'kcat 12 s^-1 with NAD+, monodisperse by DLS';
      await p.fill('#pr-qcActivity', qcText);
      await p.dispatchEvent('#pr-qcActivity', 'change');
      await h.wait(400);

      await h.step('figure');
      await h.wait(400);
      const sumBefore = await h.sumTable();
      const methBefore = await h.methods();
      const svgBefore = (await h.svgTexts()).map(t => t.t);

      const base = await exportProject(p, 'assay_legacy_base.json');
      T.check('legacy.baseline-exported', !!base, 'baseline export downloaded');
      delete base.assays;

      await p.click('#homeBtn');
      await h.wait(400);
      await p.setInputFiles('#projFile', {
        name: 'legacy_no_assays_project.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(base))
      });
      await h.wait(1400);

      await h.step('final');
      const qcInputAfter = await p.locator('#pr-qcActivity').inputValue();
      await h.step('figure');
      await h.wait(400);
      const sumAfter = await h.sumTable();
      const hdr = sumAfter[0] || [];
      const basis = await p.$eval('#sumBasis', e => e.textContent);
      const methAfter = await h.methods();
      const svgAfter = (await h.svgTexts()).map(t => t.t);

      const reExported = await exportProject(p, 'assay_legacy_reexported.json');
      T.check('legacy.assays-initialized-empty-array',
        !!reExported && Array.isArray(reExported.assays) && reExported.assays.length === 0,
        `reExported.assays=${JSON.stringify(reExported && reExported.assays)}`);
      T.check('legacy.qcActivity-unchanged',
        qcInputAfter === qcText && !!reExported && reExported.prep && reExported.prep.qcActivity === qcText && methAfter.includes(`Activity and other checks: ${qcText}.`),
        `input="${qcInputAfter}", json="${reExported && reExported.prep && reExported.prep.qcActivity}"`);
      T.check('legacy.no-activity-cols-or-structured-methods',
        !hdr.some(c => /Total activity|Specific activity|Purification fold/i.test(c)) && !/Activity fold/i.test(basis) && !/Enzyme activity assay/i.test(methAfter),
        JSON.stringify({hdr, basis}));
      T.check('legacy.numbers-and-visuals-identical',
        JSON.stringify(sumBefore) === JSON.stringify(sumAfter) && methBefore === methAfter && JSON.stringify(svgBefore) === JSON.stringify(svgAfter),
        `sumMatch=${JSON.stringify(sumBefore) === JSON.stringify(sumAfter)}, methMatch=${methBefore === methAfter}, svgMatch=${JSON.stringify(svgBefore) === JSON.stringify(svgAfter)}`);
      T.check('legacy.no-page-errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  // 2. Local IndexedDB & Cloud persistence roundtrips (#1700)
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
        await h.wait(1600);

        const exp1 = await exportProject(p, `assay_${mode}_exp1.json`);
        checkAssaysPayload(T, `${mode}.import`, exp1);
        T.check(`${mode}.import.qcActivity-unchanged`,
          !!exp1 && exp1.prep && exp1.prep.qcActivity === 'Legacy activity note unchanged',
          `qcActivity=${JSON.stringify(exp1 && exp1.prep && exp1.prep.qcActivity)}`);

        await p.reload();
        await h.wait(1000);
        const card = p.locator('#projList .pcard').filter({hasText: `assay ${mode}`}).first();
        const cardVis = await card.isVisible().catch(() => false);
        T.check(`${mode}.stored-project-listed`, cardVis, `project card visible in ${mode} mode`);
        if (cardVis) {
          await card.click();
          await h.wait(1400);
        }

        const exp2 = await exportProject(p, `assay_${mode}_exp2.json`);
        checkAssaysPayload(T, `${mode}.reload`, exp2);

        await h.step('final');
        const qcVal = await p.locator('#pr-qcActivity').inputValue();
        T.check(`${mode}.reload.qcActivity-unchanged`,
          qcVal === 'Legacy activity note unchanged' && !!exp2 && exp2.prep && exp2.prep.qcActivity === 'Legacy activity note unchanged',
          `input="${qcVal}", json="${exp2 && exp2.prep && exp2.prep.qcActivity}"`);

        if (!cloud) {
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

  // 3. Calculation engine: rates, specific activity, fold/yield, MM, nkat kcat, Hill, Haldane, SD weighting (#1700 assays-only + #1701 in 1 browser)
  await T.t('calculation-engine-rates-table-and-nonlinear-kinetics', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);

      // 3a. Assays-only project export & id assignment (#1700)
      await importJsonAndCalc(p, h, 'assays_only_project.json', {
        app: 'HPLC Figure Bench',
        version: 1,
        runs: [],
        traces: [],
        gels: [],
        nanodrop: [],
        prep: {on: true, qcActivity: 'Fallback text'},
        assays: [{name: 'Crude lysate assay', replicates: [0.18, 0.20], blanks: [0.01], dilution: 20}]
      });
      const expOnly = await exportProject(p, 'assays_only_export.json');
      T.check('assays-only.exported-and-assigned-a1',
        !!expOnly && Array.isArray(expOnly.assays) && expOnly.assays.length === 1 && expOnly.assays[0].id === 'a1'
          && expOnly.assays[0].dilution === 20 && expOnly.assays[0].replicates[0] === 0.18
          && expOnly.prep && expOnly.prep.qcActivity === 'Fallback text',
        JSON.stringify(expOnly && {assays: expOnly.assays, qc: expOnly.prep && expOnly.prep.qcActivity}));

      // 3b. Rate calculation, units, blanks, dilutions (#1701)
      const calcRates = await importJsonAndCalc(p, h, 'assay_rates.json', baseProject([
        {
          id: 'a1', name: 'NADH continuous 340 nm', kind: 'continuous', rawUnit: 'dA/min',
          replicates: [{slope: 0.0642}, {slope: 0.0662}, {slope: 0.0682}], blanks: [{slope: 0.004}, {slope: 0.004}],
          dilution: 10, volumes: {assay: 200, sample: 10, unit: 'uL'},
          optics: {wavelength: 340, epsilon: 6220, pathCm: 0.5, stoichiometry: 1}
        },
        {
          id: 'a2', name: 'Endpoint stoichiometry 2', kind: 'endpoint', rawUnit: 'dA/min',
          replicates: [{deltaA: 0.622, timeMin: 10}], blanks: [{deltaA: 0, timeMin: 10}],
          dilution: 1, volumes: {assay: 1000, sample: 50, unit: 'uL'},
          optics: {wavelength: 340, epsilon: 6220, pathCm: 1, stoichiometry: 2}
        },
        {id: 'a3', name: 'SI nkat/mL with dilution', kind: 'continuous', rawUnit: 'nkat/mL', replicates: [100], blanks: [10], dilution: 5},
        {id: 'a4', name: 'Below blank control', kind: 'continuous', rawUnit: 'U/mL', replicates: [0.005], blanks: [0.010], dilution: 1}
      ]));
      T.check('rates.computed-on-load', !!(calcRates && Array.isArray(calcRates.assays) && calcRates.assays.length === 4),
        `calc=${calcRates ? calcRates.assays.length : 'null'}`);
      if (calcRates) {
        const r1 = calcRates.assays[0].rate, r2 = calcRates.assays[1].rate, r3 = calcRates.assays[2].rate, r4 = calcRates.assays[3].rate;
        T.check('rates.nadh-net-rate', T.near(r1.netRate, 0.0622, 1e-6) && T.near(r1.netSd, 0.002, 1e-6), `netRate=${r1.netRate}, netSd=${r1.netSd}`);
        T.check('rates.nadh-vol-activity', T.near(r1.rxnRate_U_mL, 0.02, 1e-6) && T.near(r1.volActivity_U_mL, 4.0, 1e-5) && T.near(r1.volActivity_nkat_mL, 4.0 * 1000 / 60, 1e-3),
          `rxn=${r1.rxnRate_U_mL}, volU=${r1.volActivity_U_mL}, volNkat=${r1.volActivity_nkat_mL}`);
        T.check('rates.endpoint-stoichiometry', T.near(r2.rxnRate_U_mL, 0.005, 1e-6) && T.near(r2.volActivity_U_mL, 0.1, 1e-6), `rxn=${r2.rxnRate_U_mL}, volU=${r2.volActivity_U_mL}`);
        T.check('rates.nkat-to-U-mL', T.near(r3.volActivity_U_mL, 27.0, 1e-6) && T.near(r3.volActivity_nkat_mL, 450.0, 1e-4), `volU=${r3.volActivity_U_mL}, volNkat=${r3.volActivity_nkat_mL}`);
        T.check('rates.below-blank-flagged', r4.belowBlank === true && T.near(r4.netRate, -0.005, 1e-6), `belowBlank=${r4.belowBlank}, netRate=${r4.netRate}`);
      }

      // 3c. Specific activity, fold, yield & raw-only export (#1701)
      const calcTable = await importJsonAndCalc(p, h, 'assay_purif_table.json', baseProject([
        {id: 'a1', name: 'Clarified lysate', kind: 'continuous', rawUnit: 'U/mL', stepId: 'lysis', replicates: [20.5, 19.5], blanks: [0], dilution: 1, proteinOverride: {conc: 10, vol: 50, unit: 'mg/mL'}},
        {id: 'a2', name: 'IMAC pool (NanoDrop linked)', kind: 'continuous', rawUnit: 'U/mL', stepId: 'r1', runId: 'r1', replicates: [8.0, 8.0], blanks: [], dilution: 10},
        {id: 'a3', name: 'SEC pool (ug/mL override)', kind: 'continuous', rawUnit: 'U/mL', stepId: 'final', replicates: [6.0], blanks: [], dilution: 20, proteinOverride: {conc: 500, vol: 5, unit: 'ug/mL'}}
      ], {
        runs: [{id: 'r1', name: 'HisTrap IMAC', stepName: 'IMAC', inWf: true, ndVol: 10, uvi: 0, uvs: [{name: 'UV1_280', unit: 'mAU', xs: [0, 1, 2, 3, 4], ys: [2, 10, 150, 40, 2]}], fracs: [], shade: ''}],
        nanodrop: [{id: 'nd1', name: 'IMAC pool', conc: 2.0, a280: 2.0, unit: 'mg/mL', runId: 'r1', stage: 'pool'}]
      }));
      T.check('table.computed', !!(calcTable && calcTable.table && Array.isArray(calcTable.table.rows) && calcTable.table.rows.length === 3),
        `rows=${calcTable && calcTable.table ? calcTable.table.rows.length : 'null'}`);
      if (calcTable && calcTable.table) {
        const [t0, t1, t2] = calcTable.table.rows;
        T.check('table.step1-baseline',
          T.near(t0.specificActivity_U_mg, 2.0, 1e-6) && T.near(t0.totalActivity_U, 1000.0, 1e-5) && T.near(t0.fold, 1.0, 1e-6) && T.near(t0.activityYieldPct, 100.0, 1e-5),
          JSON.stringify({sa: t0.specificActivity_U_mg, tot: t0.totalActivity_U, fold: t0.fold, yld: t0.activityYieldPct}));
        T.check('table.step2-nanodrop-resolved',
          calcTable.assays[1].specific.protein.concSrc === 'nanodrop' && T.near(t1.conc_mg_mL, 2.0, 1e-6) && T.near(t1.vol_mL, 10.0, 1e-6)
            && T.near(t1.specificActivity_U_mg, 40.0, 1e-5) && T.near(t1.totalActivity_U, 800.0, 1e-4) && T.near(t1.fold, 20.0, 1e-5)
            && T.near(t1.activityYieldPct, 80.0, 1e-5) && T.near(t1.stepActivityYieldPct, 80.0, 1e-5),
          JSON.stringify({src: calcTable.assays[1].specific.protein.concSrc, sa: t1.specificActivity_U_mg, tot: t1.totalActivity_U, fold: t1.fold, yld: t1.activityYieldPct}));
        T.check('table.step3-ug-mL-override-fold-yield',
          T.near(t2.conc_mg_mL, 0.5, 1e-6) && T.near(t2.specificActivity_U_mg, 240.0, 1e-4) && T.near(t2.totalActivity_U, 600.0, 1e-4)
            && T.near(t2.fold, 120.0, 1e-4) && T.near(t2.activityYieldPct, 60.0, 1e-4) && T.near(t2.stepActivityYieldPct, 75.0, 1e-4),
          JSON.stringify({c: t2.conc_mg_mL, sa: t2.specificActivity_U_mg, tot: t2.totalActivity_U, fold: t2.fold, yld: t2.activityYieldPct, sy: t2.stepActivityYieldPct}));
        const expRaw = await exportProject(p, 'assay_calc_raw_only.json');
        const noDerived = expRaw && Array.isArray(expRaw.assays) && expRaw.assays.every(a => !('specificActivity_U_mg' in a) && !('fold' in a) && !('_calc' in a));
        T.check('table.export-keeps-raw-only', !!noDerived, JSON.stringify(expRaw && expRaw.assays && expRaw.assays[0]));
      }

      // 3d. Michaelis-Menten & nkat/mL / dA/min kcat unit consistency (#1701)
      const mmS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];
      const nkatS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0];
      const noise = [0.008, -0.006, 0.010, -0.009, 0.007, -0.008, 0.006, -0.005];
      const calcMm = await importJsonAndCalc(p, h, 'assay_mm.json', baseProject([
        {
          id: 'k1', name: 'MM exact uM/min', kind: 'kinetics', rawUnit: 'uM/min',
          kinetics: {substrate: 'NAD+', unit: 'mM', vUnit: 'uM/min', points: mmS.map(s => ({s, v: 120 * s / (0.25 + s)}))},
          fit: {model: 'mm', enzConc_uM: 0.1, activeSitesPerMol: 1, weight: 'none'}
        },
        {
          id: 'k2', name: 'MM nkat/mL kcat check', kind: 'kinetics', rawUnit: 'nkat/mL',
          kinetics: {substrate: 'NAD+', unit: 'mM', vUnit: 'nkat/mL', points: nkatS.map((s, i) => ({s, v: 3.0 * s / (0.5 + s) + noise[i]}))},
          fit: {model: 'mm', enzConc_uM: 0.1, activeSitesPerMol: 2, weight: 'none'}
        },
        {
          id: 'k3', name: 'MM dA/min with blank', kind: 'kinetics', rawUnit: 'dA/min',
          blanks: [{slope: 0.010}], optics: {wavelength: 340, epsilon: 6220, pathCm: 0.5, stoichiometry: 1},
          kinetics: {substrate: 'NAD+', unit: 'mM', vUnit: 'dA/min', points: nkatS.map(s => ({s, v: 0.5598 * s / (0.5 + s) + 0.010}))},
          fit: {model: 'mm', enzConc_uM: 0.1, activeSitesPerMol: 2, weight: 'none'}
        }
      ]));
      T.check('mm.computed', !!(calcMm && calcMm.assays && calcMm.assays.length === 3), `len=${calcMm && calcMm.assays && calcMm.assays.length}`);
      if (calcMm) {
        const f1 = calcMm.assays[0].fit, f2 = calcMm.assays[1].fit, f3 = calcMm.assays[2].fit;
        const expectedKcatScale = 1000 / (60 * 0.2);
        T.check('mm.exact-params', f1 && f1.ok && T.near(f1.params.Vmax, 120, 1e-4) && T.near(f1.params.Km, 0.25, 1e-5) && f1.r2 > 0.999999, JSON.stringify(f1 && {params: f1.params, r2: f1.r2}));
        T.check('mm.exact-kcat-and-efficiency', f1 && T.near(f1.kcat, 20.0, 1e-4) && T.near(f1.kcatKm, 80000, 1.0), JSON.stringify(f1 && {kcat: f1.kcat, kcatKm: f1.kcatKm}));
        T.check('mm.nkat-vUnit-updated-and-Vmax-converted', f2 && f2.ok && f2.vUnit === 'U/mL' && T.near(f2.params.Vmax, 0.18, 0.005) && T.near(f2.params.Km, 0.5, 0.03), JSON.stringify(f2 && {vUnit: f2.vUnit, params: f2.params}));
        T.check('mm.nkat-kcat-and-seKcat-no-1000x-error',
          f2 && T.near(f2.kcat, 15.0, 0.5) && f2.seKcat > 0 && T.near(f2.seKcat, f2.se.Vmax * expectedKcatScale, 1e-6) && T.near(f2.kcatKm, 30000, 2500),
          JSON.stringify(f2 && {kcat: f2.kcat, seKcat: f2.seKcat, seVmax: f2.se && f2.se.Vmax, kcatKm: f2.kcatKm}));
        T.check('mm.dA-min-matches-nkat-kcat',
          f3 && f3.ok && f3.vUnit === 'U/mL' && T.near(f3.params.Vmax, 0.18, 1e-5) && T.near(f3.params.Km, 0.5, 1e-5) && T.near(f3.kcat, 15.0, 1e-4) && T.near(f3.kcatKm, 30000, 1.0),
          JSON.stringify(f3 && {vUnit: f3.vUnit, params: f3.params, kcat: f3.kcat, kcatKm: f3.kcatKm}));
      }

      // 3e. Hill, Haldane substrate inhibition, and SD weighting (#1701)
      const hillPts = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0].map(s => ({s, v: 80 * Math.pow(s, 2.5) / (Math.pow(2.0, 2.5) + Math.pow(s, 2.5))}));
      const hillNegPts = [0.05, 0.2, 0.5, 1.2, 3.0, 10.0, 30.0].map(s => ({s, v: 50 * Math.pow(s, 0.6) / (Math.pow(1.2, 0.6) + Math.pow(s, 0.6))}));
      const siPts = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0].map(s => ({s, v: 200 * s / (0.4 + s * (1 + s / 10.0))}));
      const wPts = [0.2, 0.5, 1.0, 2.0, 5.0, 10.0].map((s, idx) => {
        const clean = 100 * s / (1.0 + s);
        return idx === 5 ? {s, v: clean + 40, sd: 40} : {s, v: clean, sd: 0.2};
      });
      const calcModels = await importJsonAndCalc(p, h, 'assay_models.json', baseProject([
        {id: 'h1', name: 'Hill positive cooperativity', kind: 'kinetics', rawUnit: 'uM/s', kinetics: {substrate: 'ATP', unit: 'mM', vUnit: 'uM/s', points: hillPts}, fit: {model: 'hill', enzConc_uM: 0.5, activeSitesPerMol: 1, weight: 'none'}},
        {id: 'h2', name: 'Hill negative cooperativity', kind: 'kinetics', rawUnit: 'uM/s', kinetics: {substrate: 'ATP', unit: 'mM', vUnit: 'uM/s', points: hillNegPts}, fit: {model: 'hill', enzConc_uM: null, activeSitesPerMol: 1, weight: 'none'}},
        {id: 'si1', name: 'Substrate inhibition Haldane', kind: 'kinetics', rawUnit: 'uM/min', kinetics: {substrate: 'Substrate', unit: 'mM', vUnit: 'uM/min', points: siPts}, fit: {model: 'subInhib', enzConc_uM: 0.2, activeSitesPerMol: 1, weight: 'none'}},
        {id: 'w_none', name: 'MM unweighted with outlier', kind: 'kinetics', rawUnit: 'uM/min', kinetics: {substrate: 'S', unit: 'mM', vUnit: 'uM/min', points: wPts}, fit: {model: 'mm', weight: 'none'}},
        {id: 'w_sd', name: 'MM SD-weighted with outlier', kind: 'kinetics', rawUnit: 'uM/min', kinetics: {substrate: 'S', unit: 'mM', vUnit: 'uM/min', points: wPts}, fit: {model: 'mm', weight: 'sd'}}
      ]));
      T.check('models.computed', !!(calcModels && calcModels.assays && calcModels.assays.length === 5), `len=${calcModels && calcModels.assays && calcModels.assays.length}`);
      if (calcModels) {
        const fh1 = calcModels.assays[0].fit, fh2 = calcModels.assays[1].fit, fsi = calcModels.assays[2].fit;
        const fwNone = calcModels.assays[3].fit, fwSd = calcModels.assays[4].fit;
        T.check('hill.positive-cooperativity',
          fh1 && fh1.ok && T.near(fh1.params.Vmax, 80, 1e-3) && T.near(fh1.params.K05, 2.0, 1e-4) && T.near(fh1.params.nH, 2.5, 1e-4) && T.near(fh1.kcat, 160, 1e-3) && fh1.kcatKm === null && fh1.r2 > 0.99999,
          JSON.stringify(fh1 && {params: fh1.params, kcat: fh1.kcat, kcatKm: fh1.kcatKm, r2: fh1.r2}));
        T.check('hill.negative-cooperativity',
          fh2 && fh2.ok && T.near(fh2.params.Vmax, 50, 1e-2) && T.near(fh2.params.K05, 1.2, 1e-3) && T.near(fh2.params.nH, 0.6, 1e-3) && fh2.r2 > 0.9999,
          JSON.stringify(fh2 && {params: fh2.params, r2: fh2.r2}));
        T.check('subInhib.haldane-params',
          fsi && fsi.ok && T.near(fsi.params.Vmax, 200, 1e-2) && T.near(fsi.params.Km, 0.4, 1e-4) && T.near(fsi.params.Ki, 10.0, 1e-3)
            && T.near(fsi.params.Sopt, 2.0, 1e-4) && T.near(fsi.params.Vpeak, 200 / 1.4, 1e-3) && T.near(fsi.kcat, 200 / 12, 1e-3) && fsi.r2 > 0.99999,
          JSON.stringify(fsi && {params: fsi.params, kcat: fsi.kcat, r2: fsi.r2}));
        const errNone = Math.abs(fwNone.params.Vmax - 100), errSd = Math.abs(fwSd.params.Vmax - 100);
        T.check('weight.sd-downweights-noisy-outlier',
          fwNone && fwNone.ok && fwSd && fwSd.ok && errSd < 0.5 && errNone > 10 && errSd < errNone / 20,
          `Vmax(none)=${fwNone && fwNone.params.Vmax.toFixed(3)} (err ${errNone.toFixed(3)}), Vmax(sd)=${fwSd && fwSd.params.Vmax.toFixed(3)} (err ${errSd.toFixed(3)})`);
      }

      T.check('calc-engine.no-page-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  // 4. UI & CSV/TSV ingestion (#1702 in 1 browser)
  await T.t('assay-ui-csv-ingestion-fraction-matching-and-delete', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(12000);
      await h.newProject('Assay UI Project');
      await h.addRun(src('his'));
      await h.step('final');

      const hasOpenBtn = (await p.locator('#assayOpenBtn').count()) > 0 && await p.locator('#assayOpenBtn').isVisible();
      T.check('ui/open-btn-visible', hasOpenBtn, 'Expected #assayOpenBtn visible on Final sample step');
      if (hasOpenBtn) await p.click('#assayOpenBtn');
      await h.wait(250);

      const hasCard = (await p.locator('#assayPanel .assay-card').count()) === 1;
      T.check('ui/assay-added', hasCard && await p.locator('#assayPanel').isVisible(), 'Expected 1 visible assay card after clicking #assayOpenBtn');

      if (hasCard) {
        const card = p.locator('#assayPanel .assay-card').first();
        await card.locator('[data-ak="name"]').fill('NADH Coupled Dehydrogenase');
        await card.locator('[data-ak="mode"]').selectOption('steps');
        await h.wait(150);

        await p.click('#assayPasteToggle');
        const csv = [
          'Step, Volume (mL), Dilution, Protein (mg/mL), Rep1, Rep2, Rep3',
          'Blank, , , , 0.010, 0.010, OVRFLW',
          'Clarified Lysate, 12, 10, 0.58, 0.252, 0.248, >3.5',
          'Flowthrough Zero, 10, 10, 0.40, 0.010, Masked, 0.010',
          'HisTrap Pool, 4, 10, 0.20, 0.370, 0.370, 0.370'
        ].join('\n');
        await p.fill('#assayPaste', csv);
        await p.click('#assayPasteGo');
        await h.wait(250);

        const rowCount = await card.locator('tr[data-entry-idx]').count();
        const blankCount = await card.locator('[data-blank-idx]').count();
        T.check('paste/entries-populated', rowCount === 3, `Expected 3 sample entries, got ${rowCount}`);
        T.check('paste/blanks-separated', blankCount === 2, `Expected 2 valid blank readings (OVRFLW scrubbed), got ${blankCount}`);

        await card.locator('details.assay-proto > summary').click();
        await h.wait(100);
        await card.locator('[data-ap="substrate"]').fill('D-phenylglycine');
        await card.locator('[data-ap="buffer"]').fill('50 mM Tris-HCl');
        await card.locator('[data-ap="pH"]').fill('8.0');
        await card.locator('[data-ap="tempC"]').fill('30');
        await card.locator('[data-ap="wavelengthNm"]').fill('340');
        await card.locator('[data-ap="eps_mM"]').fill('24');
        await card.locator('[data-ap="pathCm"]').fill('1');
        await card.locator('[data-ap="rxnVolMl"]').fill('1.0');
        await card.locator('[data-ap="enzVolMl"]').fill('0.02');
        await h.wait(200);

        const row0 = card.locator('tr[data-entry-idx="0"]');
        const row1 = card.locator('tr[data-entry-idx="1"]');
        const row2 = card.locator('tr[data-entry-idx="2"]');
        T.check('calc/live-rate-row0', (await txt(row0, '.as-upml')) === '5.00', `Got "${await txt(row0, '.as-upml')}"`);
        T.check('calc/live-sa-row0', (await txt(row0, '.as-sa')) === '8.62', `Got "${await txt(row0, '.as-sa')}"`);
        T.check('calc/zero-rate-preserved', (await txt(row1, '.as-upml')) === '0.00', `Got "${await txt(row1, '.as-upml')}"`);
        T.check('calc/live-rate-row2', (await txt(row2, '.as-upml')) === '7.50', `Got "${await txt(row2, '.as-upml')}"`);
        T.check('calc/live-sa-row2', (await txt(row2, '.as-sa')) === '37.50', `Got "${await txt(row2, '.as-sa')}"`);

        const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
        const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
        const sa = saved.assays && saved.assays[0];
        T.check('persist/protocol-saved', !!(sa && sa.protocol && sa.protocol.substrate === 'D-phenylglycine' && sa.protocol.eps_mM === 24 && sa.protocol.pH === 8), JSON.stringify(sa && sa.protocol));
        T.check('persist/raw-replicates-immutable', !!(sa && sa.entries && JSON.stringify(sa.entries[0].rawVals) === JSON.stringify([0.252, 0.248])), JSON.stringify(sa && sa.entries && sa.entries[0]));
      }

      // Fraction mismatch warning, kinetics CSV import, and card deletion
      await p.click('#homeBtn');
      await h.wait(250);
      await p.setInputFiles('#projFile', {
        name: 'assay_ui_frac.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
          app: 'Protein Purification Bench', version: 1, schemaVersion: 1, quick: true, saved: new Date().toISOString(),
          cur: 'workflow', opt: {},
          runs: [{id: 'r1', name: 'IMAC Step', inWf: true, color: '#0072b2', uvs: [{name: 'UV 280', unit: 'mAU', xs: [0, 5, 10], ys: [0, 100, 0]}], fracs: [{x: 3, label: 'T3'}, {x: 5, label: 'T4'}], fracEnd: 7, shade: 'T3-T4'}],
          traces: [], gels: [], prep: {on: true, name: 'Test'}
        }))
      });
      await h.wait(500);

      const addRunAssayBtn = p.locator('[data-addassay="r1"]');
      const hasBtn = (await addRunAssayBtn.count()) > 0 && await addRunAssayBtn.isVisible();
      T.check('frac/open-btn', hasBtn, 'Expected visible [data-addassay="r1"] button on run step');
      if (hasBtn) {
        await addRunAssayBtn.click();
        await h.wait(200);
        const card = p.locator('#assayPanel .assay-card').first();
        await p.click('#assayPasteToggle');
        await p.fill('#assayPaste', 'Fraction,Rep1,Rep2\nT3,0.12,0.14\nNO_SUCH_FRAC,0.05,0.06');
        await p.click('#assayPasteGo');
        await h.wait(200);

        const okCls = (await card.locator('tr[data-entry-idx="0"]').getAttribute('class')) || '';
        const badCls = (await card.locator('tr[data-entry-idx="1"]').getAttribute('class')) || '';
        T.check('frac/matched-no-warn', !okCls.includes('warnc'), `Expected no warnc on T3, got "${okCls}"`);
        T.check('frac/unmatched-warned', badCls.includes('warnc'), `Expected warnc on NO_SUCH_FRAC, got "${badCls}"`);

        await p.click('#assayAdd');
        await h.wait(200);
        const card2 = p.locator('#assayPanel .assay-card').nth(1);
        await card2.locator('[data-ak="mode"]').selectOption('kinetics');
        const kinCsv = path.join(os.tmpdir(), `assay_kin_${Date.now()}.csv`);
        fs.writeFileSync(kinCsv, 'Conc,Rate1,Rate2\n0.02,76,47\n0.06,97,107\n0.11,123,139\n0.22,159,152\n0.56,191,201\n1.10,207,200\n');
        await p.setInputFiles('#assayFile', kinCsv);
        await h.wait(250);
        fs.rmSync(kinCsv, {force: true});
        T.check('kin/imported-vmax', (await txt(card2, '.af-vmax')).includes('212.6837'), `Got "${await txt(card2, '.af-vmax')}"`);

        await card2.locator('[data-assay-del]').click();
        await h.wait(150);
        T.check('del/one-remaining', (await p.locator('#assayPanel .assay-card').count()) === 1, 'Expected 1 card remaining');
        await p.locator('#assayPanel .assay-card [data-assay-del]').first().click();
        await h.wait(150);
        T.check('del/all-removed-panel-hidden', (await p.locator('#assayPanel .assay-card').count()) === 0 && await p.locator('#assayPanel').evaluate(el => el.hidden), 'Expected 0 cards and hidden #assayPanel');
      }
      T.check('ui/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  // 5. Figure rendering: track, error bars, yUnit, overlay, panel placement, and Quick-mode standalone tab (#1703 collapsed from 4 browsers to 2)
  await T.t('assay-figure-track-overlay-panel-and-standalone-export', async () => {
    const {p, close, errs} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(12000);
      await p.locator('#projFile').setInputFiles({
        name: 'fig_track_overlay_panel.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(makeSecChromProject(true)))
      });
      await h.wait(600);
      await h.step('run:r1');

      // 5a. Track & error bars (sd -> sem -> points)
      const svgSd = await h.exportSvg();
      const mTrack = await h.svgBoxes(svgSd, '.assay-track');
      const mErrSd = await h.svgBoxes(svgSd, '.assay-err');
      T.check('track/rendered-in-bounds', !!mTrack.box && mTrack.box.w > 80 && mTrack.box.h > 35 && fits(mTrack.box, mTrack.root, 2), JSON.stringify({box: mTrack.box, root: mTrack.root}));
      T.check('track/no-clipped-text', mTrack.clipped.length === 0, JSON.stringify(mTrack.clipped));
      T.check('track/default-axis-label-upml', mTrack.texts.some(t => t.t.trim() === 'Activity (U/mL)'), JSON.stringify(mTrack.texts.map(t => t.t)));
      T.check('track/sd-error-bars-shown', !!mErrSd.box && mErrSd.box.h > 4, JSON.stringify(mErrSd.box));

      const errSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="showErr"]');
      const unitSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="yUnit"]');
      const placeSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="placement"]');
      const hasControls = (await errSel.count()) > 0 && await errSel.isVisible();

      if (hasControls) { await errSel.selectOption('sem'); await h.wait(250); }
      const mErrSem = await h.svgBoxes(await h.exportSvg(), '.assay-err');
      T.check('track/sem-smaller-than-sd',
        hasControls && !!mErrSd.box && !!mErrSem.box && mErrSem.box.h < mErrSd.box.h * 0.75 && mErrSem.box.h > mErrSd.box.h * 0.42,
        JSON.stringify({sdH: mErrSd.box && mErrSd.box.h, semH: mErrSem.box && mErrSem.box.h}));

      if (hasControls) { await errSel.selectOption('points'); await h.wait(250); }
      const svgPts = await h.exportSvg();
      const mPtsNoErr = await h.svgBoxes(svgPts, '.assay-err');
      const mPtsReps = await h.svgBoxes(svgPts, '.assay-reps');
      T.check('track/points-mode-replaces-errbars', hasControls && mPtsNoErr.box === null && !!mPtsReps.box && mPtsReps.box.h > 2, JSON.stringify({errBox: mPtsNoErr.box, repBox: mPtsReps.box}));
      if (hasControls) { await errSel.selectOption('sd'); await h.wait(150); }

      // 5b. yUnit updates (nkat/mL -> U/mg -> rel%) & overlay right axis
      if (hasControls) { await unitSel.selectOption('nkat/mL'); await h.wait(250); }
      const bNkat = await h.svgBoxes(await h.exportSvg(), '.assay-track');
      T.check('yunit/nkat-label-and-scale',
        hasControls && bNkat.texts.some(t => t.t.trim() === 'Activity (nkat/mL)') && !bNkat.texts.some(t => t.t.trim() === 'Activity (U/mL)') &&
        bNkat.texts.some(t => Number.isFinite(+t.t) && +t.t >= 100) && bNkat.clipped.length === 0,
        JSON.stringify({texts: bNkat.texts.map(t => t.t), clipped: bNkat.clipped}));

      if (hasControls) { await unitSel.selectOption('U/mg'); await h.wait(250); }
      const bSa = await h.svgBoxes(await h.exportSvg(), '.assay-track');
      T.check('yunit/umg-specific-activity-label', hasControls && bSa.texts.some(t => t.t.trim() === 'Specific activity (U/mg)') && bSa.clipped.length === 0, JSON.stringify({texts: bSa.texts.map(t => t.t), clipped: bSa.clipped}));

      if (hasControls) { await unitSel.selectOption('rel%'); await h.wait(250); }
      const bRel = await h.svgBoxes(await h.exportSvg(), '.assay-track');
      T.check('yunit/relpct-label-and-100-scale',
        hasControls && bRel.texts.some(t => t.t.trim() === 'Relative activity (%)') && bRel.texts.some(t => +t.t === 100) && bRel.clipped.length === 0,
        JSON.stringify({texts: bRel.texts.map(t => t.t), clipped: bRel.clipped}));

      if (hasControls) { await placeSel.selectOption('overlay'); await h.wait(250); }
      const bOv = await h.svgBoxes(await h.exportSvg(), '.assay-overlay');
      const rightLabel = bOv.texts.find(t => t.t.trim() === 'Relative activity (%)');
      T.check('overlay/rendered-with-right-axis',
        hasControls && !!bOv.box && bOv.box.w > 40 && !!rightLabel && rightLabel.x > bOv.root.w * 0.7 && bOv.clipped.length === 0,
        JSON.stringify({ovBox: bOv.box, rightLabel, root: bOv.root, clipped: bOv.clipped}));

      // 5c. Separate panel placement in run & workflow figure
      if (hasControls) {
        await unitSel.selectOption('U/mL');
        await placeSel.selectOption('panel');
        await h.wait(300);
      }
      const svgComp = await h.exportSvg();
      const mRun = await h.svgBoxes(svgComp, '[data-wfp="r1"]');
      const mAssay = await h.svgBoxes(svgComp, '[data-wfp="assay:a1"]');
      T.check('panel/separate-non-overlapping-panel-in-run',
        hasControls && !!mRun.box && !!mAssay.box && mAssay.box.w > 80 && mAssay.box.h > 60 && mAssay.box.x >= mRun.box.right - 2 && mAssay.clipped.length === 0,
        JSON.stringify({runBox: mRun.box, assayBox: mAssay.box, clipped: mAssay.clipped}));

      await h.step('figure');
      const mWfAssay = await h.svgBoxes(await h.exportSvg(), '[data-wfp="assay:a1"]');
      T.check('panel/separate-panel-in-workflow', hasControls && !!mWfAssay.box && mWfAssay.box.w > 80 && mWfAssay.clipped.length === 0, JSON.stringify({wfAssayBox: mWfAssay.box, clipped: mWfAssay.clipped}));

      // 5d. Quick-mode standalone assay tab, Arial & 600 dpi PNG export
      await p.click('#homeBtn');
      await h.wait(300);
      await p.click('#homeQuick');
      await h.wait(350);
      await p.setInputFiles('#file', src('his'));
      await h.wait(1000);

      const openBtn = p.locator('#assayOpenBtn');
      if ((await openBtn.count()) > 0 && await openBtn.isVisible()) {
        await openBtn.click();
        await h.wait(200);
        await p.click('#assayPasteToggle');
        await p.fill('#assayPaste', '[S] (mM),Rep1,Rep2,Rep3\n0.05,48,50,52\n0.2,115,120,125\n1.0,175,180,185\n');
        await p.click('#assayPasteGo');
        await h.wait(250);
      }
      const aTab = p.locator('.figtab[data-fig^="assay:"]').first();
      const hasTab = (await p.locator('.figtab[data-fig^="assay:"]').count()) > 0 && await aTab.isVisible();
      T.check('solo/standalone-figtab-visible', hasTab, 'visible=' + hasTab);
      if (hasTab) { await aTab.click(); await h.wait(250); }

      const svgAssay = await h.exportSvg();
      const mSolo = await h.svgBoxes(svgAssay, '.assay-fit-curve');
      T.check('solo/arial-and-no-clipped-text',
        hasTab && /font-family="Arial/i.test(svgAssay) && !!mSolo.box && mSolo.box.w > 60 && mSolo.clipped.length === 0,
        JSON.stringify({arial: /font-family="Arial/i.test(svgAssay), box: mSolo.box, clipped: mSolo.clipped}));

      let pngDpiOk = false, pngName = '';
      if (hasTab) {
        const [d] = await Promise.all([p.waitForEvent('download', {timeout: 12000}), p.click('#savePng')]);
        pngName = d.suggestedFilename();
        const tmp = path.join(RES, 'assay-600-' + Date.now() + '.png');
        await d.saveAs(tmp);
        const buf = fs.readFileSync(tmp);
        for (let i = 8; i < Math.min(buf.length - 12, 200); i++) {
          if (buf[i] === 112 && buf[i + 1] === 72 && buf[i + 2] === 89 && buf[i + 3] === 115) {
            const ppmX = buf.readUInt32BE(i + 4);
            if (Math.abs(ppmX - Math.round(600 / 0.0254)) <= 2) pngDpiOk = true;
          }
        }
      }
      T.check('solo/png-600dpi-export', hasTab && /^assay_.*_600dpi\.png$/.test(pngName) && pngDpiOk, pngName + ' dpiOk=' + pngDpiOk);
      T.check('figure/no-page-errors', !errs.length, errs.join('; '));
    } finally {
      await close();
    }
  });

  // 6. STRENDA Methods, summary table activity columns, CSV export, gap jump, and kinetics prose (#1704 in 1 browser)
  await T.t('assay-methods-summary-csv-gaps-and-kinetics-prose', async () => {
    const {p, close, errs} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(12000);
      await p.locator('#projFile').setInputFiles({
        name: 'steps_assay_methods.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
          app: 'Protein Purification Bench', version: 1, schemaVersion: 1, name: 'NADH Oxidase Purification',
          opt: {protKda: 50, eps: 1.0},
          prep: {
            on: true, name: 'NADH Oxidase Prep', qcActivity: 'Old text that structured assay replaces',
            btw: {r1: {how: 'conc', conc: '4.0', vOut: '2', vLoad: '1', vKeep: '1', unit: 'mL'}}
          },
          runs: [makeRun('r1', 'HisTrap_IMAC', 'IMAC', 10, 'F1-F3'), makeRun('r2', 'Superdex200_SEC', 'SEC', 12, 'F1-F3')],
          traces: [], gels: [], ndSamples: [],
          assays: [{
            id: 'a1', name: 'NADH oxidase', mode: 'steps',
            protocol: {substrate: 'NADH', substrateConc: '0.2 mM', buffer: '50 mM Tris-HCl, 100 mM NaCl', pH: 8.0, tempC: 25, wavelengthNm: 340, eps_mM: 6.22, pathCm: 1, rxnVolMl: 1.0, enzVolMl: 0.02},
            blanks: [{val: 0.002}, {val: 0.002}],
            entries: [
              {id: 'e1', name: 'Clarified lysate', stepRef: 'lysis', volMl: 50, protMgMl: 4.0, dil: 1, rawVals: [0.1264, 0.1264], rawUnit: 'dA/min'},
              {id: 'e2', name: 'IMAC', stepRef: 'run:r1', volMl: 10, protMgMl: 2.0, dil: 5, rawVals: [0.10152, 0.10152], rawUnit: 'dA/min'},
              {id: 'e3', name: 'SEC', stepRef: 'run:r2', volMl: 2.5, protMgMl: 0.6, dil: 10, rawVals: [0.07664, 0.07664], rawUnit: 'dA/min'}
            ],
            display: {visible: true, placement: 'panel', yUnit: 'U/mg', showErr: 'sd'}
          }]
        }))
      });
      await h.wait(600);
      await h.step('figure');

      const mTxt = await h.methods();
      T.check('methods-assay-title', mTxt.includes('Enzyme activity assay (NADH oxidase)'), mTxt);
      T.check('methods-strenda-conditions', mTxt.includes('0.2 mM NADH') && mTxt.includes('50 mM Tris-HCl, 100 mM NaCl, pH 8') && mTxt.includes('at 25 °C'), mTxt);
      T.check('methods-volumes', mTxt.includes('in a 1.0 mL reaction initiated with 0.020 mL of enzyme'), mTxt);
      T.check('methods-optics', mTxt.includes('monitored at 340 nm (ε = 6.22 mM⁻¹ cm⁻¹, 1.0 cm path)'), mTxt);
      T.check('methods-unit-nkat', mTxt.includes('1 µmol of product formed per min (16.67 nkat)'), mTxt);
      T.check('methods-replicates-blanks', mTxt.includes('in duplicate and corrected against reagent blanks (n = 2)'), mTxt);
      T.check('methods-results-sa-units', mTxt.includes('0.25 U/mg (50.00 U total)') && mTxt.includes('10.00 U/mg (15.00 U total, 6.00 U/mL, 100.00 nkat/mL)'), mTxt);
      T.check('methods-results-fold-yield-kcat', mTxt.includes('40.00-fold purification') && mTxt.includes('60.0% activity yield') && mTxt.includes('apparent kcat = 8.33 s⁻¹'), mTxt);
      T.check('methods-suppresses-legacy-qc', !mTxt.includes('Old text that structured assay replaces'), mTxt);

      const tbl = await h.sumTable();
      const hdr = tbl[0] || [];
      ['Total activity (U)', 'Specific activity (U/mg)', 'Purification fold', 'Activity yield (%)', 'Apparent kcat (s⁻¹)'].forEach((col, ci) => {
        T.check('sum-header-' + ci, hdr.includes(col), JSON.stringify(hdr));
      });
      const idxTot = hdr.indexOf('Total activity (U)');
      const idxSa = hdr.indexOf('Specific activity (U/mg)');
      const idxFold = hdr.indexOf('Purification fold');
      const idxYld = hdr.indexOf('Activity yield (%)');
      const idxKcat = hdr.indexOf('Apparent kcat (s⁻¹)');

      const lysRow = tbl.find(r => /Clarified lysate/i.test(r[0]));
      const imacRow = tbl.find(r => /IMAC/i.test(r[0]));
      const secRow = tbl.find(r => /SEC/i.test(r[0]));
      T.check('sum-lysate-row', !!lysRow && lysRow[idxTot] === '50.00' && lysRow[idxSa] === '0.25' && lysRow[idxFold] === '1.00×' && lysRow[idxYld] === '100.0' && lysRow[idxKcat] === '0.21', JSON.stringify(lysRow));
      T.check('sum-imac-row', !!imacRow && imacRow[idxTot] === '40.00' && imacRow[idxSa] === '2.00' && imacRow[idxFold] === '8.00×' && imacRow[idxYld] === '80.0' && imacRow[idxKcat] === '1.67', JSON.stringify(imacRow));
      T.check('sum-sec-row', !!secRow && secRow[idxTot] === '15.00' && secRow[idxSa] === '10.00' && secRow[idxFold] === '40.00×' && secRow[idxYld] === '60.0' && secRow[idxKcat] === '8.33', JSON.stringify(secRow));

      const basis = await p.$eval('#sumBasis', e => e.textContent);
      T.check('sum-basis-provenance', basis.includes('Clarified lysate (1.00×, 100%)') && basis.includes('kept-back split volumes'), basis);

      let csvText = '';
      if (await p.isVisible('#sumCsv')) {
        const dlPromise = p.waitForEvent('download', {timeout: 5000}).catch(() => null);
        await p.click('#sumCsv');
        const dl = await dlPromise;
        if (dl) {
          const csvFile = path.join(RES, 'sum-19-' + Date.now() + '.csv');
          await dl.saveAs(csvFile);
          csvText = fs.readFileSync(csvFile, 'utf8');
          fs.rmSync(csvFile, {force: true});
        }
      }
      T.check('csv-activity-headers', csvText.includes('Total activity (U),Activity (U/mL),Activity (nkat/mL),Specific activity (U/mg),Purification fold,Activity yield (%),Apparent kcat (s^-1)'), csvText);
      T.check('csv-sec-values', csvText.includes('15.000,6.000,100.00,10.000,40.00,60.0,8.33'), csvText);

      await p.$eval('#methodsBox', d => { d.open = true; d.dispatchEvent(new Event('toggle')); });
      if (await p.$('#assayPanel details.assay-proto')) {
        await p.$eval('#assayPanel details.assay-proto', d => { d.open = true; });
        await p.fill('#assayPanel [data-ap="substrate"]', '');
        await h.wait(100);
      }
      const mGapTxt = await h.methods();
      T.check('gap-placeholder-inserted', mGapTxt.includes('[substrate not entered]'), mGapTxt);
      const hasSubBtn = await p.$eval('#methodsGaps', el => !el.hidden && [...el.querySelectorAll('.gap-btn')].some(b => b.dataset.gap === 'substrate'));
      T.check('gap-button-rendered', hasSubBtn);
      let focusedAp = '';
      if (hasSubBtn) {
        await p.click('#methodsGaps .gap-btn[data-gap="substrate"]');
        focusedAp = await p.evaluate(() => (document.activeElement && document.activeElement.getAttribute('data-ap')) || '');
      }
      T.check('gap-button-focuses-input', focusedAp === 'substrate', String(focusedAp));

      // Kinetics Methods prose in same browser
      await p.click('#homeBtn');
      await h.wait(250);
      const concs = [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];
      await p.locator('#projFile').setInputFiles({
        name: 'kinetics_methods.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
          app: 'Protein Purification Bench', version: 1, schemaVersion: 1, name: 'Kinetics Methods Test',
          opt: {protKda: 40}, prep: {on: true, name: 'ATPase Prep'},
          runs: [makeRun('r1', 'SEC_Run', 'SEC', 12, 'F1-F3')],
          traces: [], gels: [], ndSamples: [],
          assays: [{
            id: 'ak1', name: 'ATPase kinetics', mode: 'kinetics',
            protocol: {substrate: 'ATP', buffer: '25 mM HEPES, 5 mM MgCl2', pH: 7.5, tempC: 30},
            fit: {model: 'mm', weight: 'equal', enzConc_uM: 1.0},
            entries: concs.map((s, i) => ({id: 'k' + i, conc: s, concUnit: 'mM', rawVals: [+((12 * s) / (0.4 + s)).toFixed(5)], rawUnit: 'U/mL'}))
          }]
        }))
      });
      await h.wait(600);
      await h.step('figure');
      const kTxt = await h.methods();
      T.check('kinetics-protocol-text', kTxt.includes('varying ATP (0.050–5.0 mM) in 25 mM HEPES, 5 mM MgCl2, pH 7.5 at 30 °C'), kTxt);
      T.check('kinetics-regression-text', kTxt.includes('Michaelis-Menten equation') && kTxt.includes('Levenberg-Marquardt'), kTxt);
      T.check('kinetics-results-units', /Steady-state kinetics \(ATPase kinetics\): Km = 0\.40(?: ± [0-9.e-]+)? mM, Vmax = 12(?:\.0)?(?: ± [0-9.e-]+)? U\/mL, kcat = 200(?: ± [0-9.e-]+)? s⁻¹ \(R² = 1\.0000/.test(kTxt), kTxt);
      T.check('methods/no-page-errors', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  T.done();
})();
