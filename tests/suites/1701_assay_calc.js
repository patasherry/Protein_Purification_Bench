// #1661: Activity assays calculation engine — blank/dilution/optical rate calculations,
// specific activity, purification fold & yield table, and Levenberg-Marquardt nonlinear fits
// (Michaelis-Menten, Hill, substrate inhibition, SD weighting, and kcat/kcatKm unit conversions).
// Driven strictly through the UI/DOM (#projFile import, #projSave export, #assayCalcData readout).
const {open, H, suite, fs, path, RES} = require('../lib/harness');

async function loadProjectAndCalc(p, h, name, proj) {
  await p.setInputFiles('#projFile', {
    name: name || 'assay_calc_test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proj))
  });
  await h.wait(1600);
  const raw = await p.evaluate(() => {
    const el = document.getElementById('assayCalcData');
    return el ? el.textContent : '';
  });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function exportProject(p, filename) {
  const dlPromise = p.waitForEvent('download', {timeout: 10000}).catch(() => null);
  await p.click('#projSave');
  const dl = await dlPromise;
  if (!dl) return null;
  const out = path.join(RES, filename || ('assay_calc_export_' + Date.now() + '.json'));
  await dl.saveAs(out);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
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

(async () => {
  const T = suite('1701_assay_calc');

  await T.t('rate-calculation-units-blanks-dilutions', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const proj = baseProject([
        {
          id: 'a1',
          name: 'NADH continuous 340 nm',
          kind: 'continuous',
          rawUnit: 'dA/min',
          replicates: [{slope: 0.0642}, {slope: 0.0662}, {slope: 0.0682}],
          blanks: [{slope: 0.004}, {slope: 0.004}],
          dilution: 10,
          volumes: {assay: 200, sample: 10, unit: 'uL'},
          optics: {wavelength: 340, epsilon: 6220, pathCm: 0.5, stoichiometry: 1}
        },
        {
          id: 'a2',
          name: 'Endpoint stoichiometry 2',
          kind: 'endpoint',
          rawUnit: 'dA/min',
          replicates: [{deltaA: 0.622, timeMin: 10}],
          blanks: [{deltaA: 0, timeMin: 10}],
          dilution: 1,
          volumes: {assay: 1000, sample: 50, unit: 'uL'},
          optics: {wavelength: 340, epsilon: 6220, pathCm: 1, stoichiometry: 2}
        },
        {
          id: 'a3',
          name: 'SI nkat/mL with dilution',
          kind: 'continuous',
          rawUnit: 'nkat/mL',
          replicates: [100],
          blanks: [10],
          dilution: 5
        },
        {
          id: 'a4',
          name: 'Below blank control',
          kind: 'continuous',
          rawUnit: 'U/mL',
          replicates: [0.005],
          blanks: [0.010],
          dilution: 1
        }
      ]);

      const calc = await loadProjectAndCalc(p, h, 'assay_rates.json', proj);
      T.check('rates.computed-on-load', !!(calc && Array.isArray(calc.assays) && calc.assays.length === 4),
        `calc=${calc ? calc.assays.length : 'null'}`);
      if (!calc) return;

      const r1 = calc.assays[0].rate;
      // netRate = 0.0662 - 0.0040 = 0.0622 dA/min; rxn = 0.0622*1000/(6220*0.5*1) = 0.02 U/mL; vol = 0.02 * 20 * 10 = 4.0 U/mL
      T.check('rates.nadh-net-rate', T.near(r1.netRate, 0.0622, 1e-6) && T.near(r1.netSd, 0.002, 1e-6),
        `netRate=${r1.netRate}, netSd=${r1.netSd}`);
      T.check('rates.nadh-vol-activity', T.near(r1.rxnRate_U_mL, 0.02, 1e-6) && T.near(r1.volActivity_U_mL, 4.0, 1e-5) && T.near(r1.volActivity_nkat_mL, 4.0 * 1000 / 60, 1e-3),
        `rxn=${r1.rxnRate_U_mL}, volU=${r1.volActivity_U_mL}, volNkat=${r1.volActivity_nkat_mL}`);

      const r2 = calc.assays[1].rate;
      // endpoint: deltaA/timeMin = 0.0622; stoich=2 => rxn=0.005 U/mL; volRatio=20 => 0.1 U/mL
      T.check('rates.endpoint-stoichiometry', T.near(r2.rxnRate_U_mL, 0.005, 1e-6) && T.near(r2.volActivity_U_mL, 0.1, 1e-6),
        `rxn=${r2.rxnRate_U_mL}, volU=${r2.volActivity_U_mL}`);

      const r3 = calc.assays[2].rate;
      // (100 - 10) * 5 = 450 nkat/mL = 27.0 U/mL
      T.check('rates.nkat-to-U-mL', T.near(r3.volActivity_U_mL, 27.0, 1e-6) && T.near(r3.volActivity_nkat_mL, 450.0, 1e-4),
        `volU=${r3.volActivity_U_mL}, volNkat=${r3.volActivity_nkat_mL}`);

      const r4 = calc.assays[3].rate;
      T.check('rates.below-blank-flagged', r4.belowBlank === true && T.near(r4.netRate, -0.005, 1e-6),
        `belowBlank=${r4.belowBlank}, netRate=${r4.netRate}`);

      T.check('rates.no-page-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('specific-activity-fold-yield-and-raw-export-separation', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const proj = baseProject([
        {
          id: 'a1',
          name: 'Clarified lysate',
          kind: 'continuous',
          rawUnit: 'U/mL',
          stepId: 'lysis',
          replicates: [20.5, 19.5],
          blanks: [0],
          dilution: 1,
          proteinOverride: {conc: 10, vol: 50, unit: 'mg/mL'}
        },
        {
          id: 'a2',
          name: 'IMAC pool (NanoDrop linked)',
          kind: 'continuous',
          rawUnit: 'U/mL',
          stepId: 'r1',
          runId: 'r1',
          replicates: [8.0, 8.0],
          blanks: [],
          dilution: 10
        },
        {
          id: 'a3',
          name: 'SEC pool (ug/mL override)',
          kind: 'continuous',
          rawUnit: 'U/mL',
          stepId: 'final',
          replicates: [6.0],
          blanks: [],
          dilution: 20,
          proteinOverride: {conc: 500, vol: 5, unit: 'ug/mL'}
        }
      ], {
        runs: [{
          id: 'r1',
          name: 'HisTrap IMAC',
          stepName: 'IMAC',
          inWf: true,
          ndVol: 10,
          uvi: 0,
          uvs: [{name: 'UV1_280', unit: 'mAU', xs: [0, 1, 2, 3, 4], ys: [2, 10, 150, 40, 2]}],
          fracs: [],
          shade: ''
        }],
        nanodrop: [{id: 'nd1', name: 'IMAC pool', conc: 2.0, a280: 2.0, unit: 'mg/mL', runId: 'r1', stage: 'pool'}]
      });

      const calc = await loadProjectAndCalc(p, h, 'assay_purif_table.json', proj);
      T.check('table.computed', !!(calc && calc.table && Array.isArray(calc.table.rows) && calc.table.rows.length === 3),
        `rows=${calc && calc.table ? calc.table.rows.length : 'null'}`);
      if (!calc || !calc.table) return;

      const [t0, t1, t2] = calc.table.rows;
      // Step 1: 20 U/mL, 10 mg/mL, 50 mL => SA 2 U/mg, total 1000 U, fold 1, yield 100%
      T.check('table.step1-baseline',
        T.near(t0.specificActivity_U_mg, 2.0, 1e-6) && T.near(t0.totalActivity_U, 1000.0, 1e-5)
          && T.near(t0.fold, 1.0, 1e-6) && T.near(t0.activityYieldPct, 100.0, 1e-5),
        JSON.stringify({sa: t0.specificActivity_U_mg, tot: t0.totalActivity_U, fold: t0.fold, yld: t0.activityYieldPct}));

      // Step 2 (NanoDrop 2.0 mg/mL, 10 mL): 80 U/mL => SA 40 U/mg, total 800 U, fold 20x, yield 80%
      T.check('table.step2-nanodrop-resolved',
        calc.assays[1].specific.protein.concSrc === 'nanodrop'
          && T.near(t1.conc_mg_mL, 2.0, 1e-6) && T.near(t1.vol_mL, 10.0, 1e-6)
          && T.near(t1.specificActivity_U_mg, 40.0, 1e-5) && T.near(t1.totalActivity_U, 800.0, 1e-4)
          && T.near(t1.fold, 20.0, 1e-5) && T.near(t1.activityYieldPct, 80.0, 1e-5) && T.near(t1.stepActivityYieldPct, 80.0, 1e-5),
        JSON.stringify({src: calc.assays[1].specific.protein.concSrc, sa: t1.specificActivity_U_mg, tot: t1.totalActivity_U, fold: t1.fold, yld: t1.activityYieldPct}));

      // Step 3 (500 ug/mL = 0.5 mg/mL, 5 mL): 120 U/mL => SA 240 U/mg, total 600 U, fold 120x, yield 60%, stepYield 75%
      T.check('table.step3-ug-mL-override-fold-yield',
        T.near(t2.conc_mg_mL, 0.5, 1e-6) && T.near(t2.specificActivity_U_mg, 240.0, 1e-4)
          && T.near(t2.totalActivity_U, 600.0, 1e-4) && T.near(t2.fold, 120.0, 1e-4)
          && T.near(t2.activityYieldPct, 60.0, 1e-4) && T.near(t2.stepActivityYieldPct, 75.0, 1e-4),
        JSON.stringify({c: t2.conc_mg_mL, sa: t2.specificActivity_U_mg, tot: t2.totalActivity_U, fold: t2.fold, yld: t2.activityYieldPct, sy: t2.stepActivityYieldPct}));

      // Exported JSON keeps only raw inputs, never derived results
      const exp = await exportProject(p, 'assay_calc_raw_only.json');
      const noDerived = exp && Array.isArray(exp.assays) && exp.assays.every(a => !('specificActivity_U_mg' in a) && !('fold' in a) && !('_calc' in a));
      T.check('table.export-keeps-raw-only', !!noDerived, JSON.stringify(exp && exp.assays && exp.assays[0]));

      T.check('table.no-page-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('kinetics-mm-and-nkat-kcat-unit-consistency', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      // 1. Exact Michaelis-Menten in uM/min: Vmax=120 uM/min, Km=0.25 mM, [E]=0.1 uM => kcat=20 s^-1, kcat/Km=80000 M^-1 s^-1
      const mmS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];
      const mmPts = mmS.map(s => ({s, v: 120 * s / (0.25 + s)}));

      // 2. Regression test for PR #1666 bug: rawUnit='nkat/mL', Vmax=3.0 nkat/mL (=0.18 U/mL = 3.0 uM/s),
      //    Km=0.5 mM, enzConc_uM=0.1 uM dimer, activeSitesPerMol=2 (E_eff=0.2 uM) => kcat=15.0 s^-1, kcat/Km=30000 M^-1 s^-1
      const nkatS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0];
      const noise = [0.008, -0.006, 0.010, -0.009, 0.007, -0.008, 0.006, -0.005];
      const nkatPts = nkatS.map((s, i) => ({s, v: 3.0 * s / (0.5 + s) + noise[i]}));

      // 3. Same physical reaction measured in dA/min (NADH eps=6220, path=0.5 cm, blank=0.010 dA/min)
      //    0.18 U/mL * 6220 * 0.5 / 1000 = 0.5598 dA/min
      const daPts = nkatS.map(s => ({s, v: 0.5598 * s / (0.5 + s) + 0.010}));

      const proj = baseProject([
        {
          id: 'k1',
          name: 'MM exact uM/min',
          kind: 'kinetics',
          rawUnit: 'uM/min',
          kinetics: {substrate: 'NAD+', unit: 'mM', vUnit: 'uM/min', points: mmPts},
          fit: {model: 'mm', enzConc_uM: 0.1, activeSitesPerMol: 1, weight: 'none'}
        },
        {
          id: 'k2',
          name: 'MM nkat/mL kcat check',
          kind: 'kinetics',
          rawUnit: 'nkat/mL',
          kinetics: {substrate: 'NAD+', unit: 'mM', vUnit: 'nkat/mL', points: nkatPts},
          fit: {model: 'mm', enzConc_uM: 0.1, activeSitesPerMol: 2, weight: 'none'}
        },
        {
          id: 'k3',
          name: 'MM dA/min with blank',
          kind: 'kinetics',
          rawUnit: 'dA/min',
          blanks: [{slope: 0.010}],
          optics: {wavelength: 340, epsilon: 6220, pathCm: 0.5, stoichiometry: 1},
          kinetics: {substrate: 'NAD+', unit: 'mM', vUnit: 'dA/min', points: daPts},
          fit: {model: 'mm', enzConc_uM: 0.1, activeSitesPerMol: 2, weight: 'none'}
        }
      ]);

      const calc = await loadProjectAndCalc(p, h, 'assay_mm.json', proj);
      T.check('mm.computed', !!(calc && calc.assays && calc.assays.length === 3), `len=${calc && calc.assays && calc.assays.length}`);
      if (!calc) return;

      const f1 = calc.assays[0].fit;
      T.check('mm.exact-params',
        f1 && f1.ok && T.near(f1.params.Vmax, 120, 1e-4) && T.near(f1.params.Km, 0.25, 1e-5) && f1.r2 > 0.999999,
        JSON.stringify(f1 && {params: f1.params, r2: f1.r2}));
      T.check('mm.exact-kcat-and-efficiency',
        f1 && T.near(f1.kcat, 20.0, 1e-4) && T.near(f1.kcatKm, 80000, 1.0),
        JSON.stringify(f1 && {kcat: f1.kcat, kcatKm: f1.kcatKm}));

      const f2 = calc.assays[1].fit;
      const expectedKcatScale = 1000 / (60 * 0.2);
      T.check('mm.nkat-vUnit-updated-and-Vmax-converted',
        f2 && f2.ok && f2.vUnit === 'U/mL' && T.near(f2.params.Vmax, 0.18, 0.005) && T.near(f2.params.Km, 0.5, 0.03),
        JSON.stringify(f2 && {vUnit: f2.vUnit, params: f2.params}));
      T.check('mm.nkat-kcat-and-seKcat-no-1000x-error',
        f2 && T.near(f2.kcat, 15.0, 0.5) && f2.seKcat > 0 && T.near(f2.seKcat, f2.se.Vmax * expectedKcatScale, 1e-6)
          && T.near(f2.kcatKm, 30000, 2500),
        JSON.stringify(f2 && {kcat: f2.kcat, seKcat: f2.seKcat, seVmax: f2.se && f2.se.Vmax, kcatKm: f2.kcatKm}));

      const f3 = calc.assays[2].fit;
      T.check('mm.dA-min-matches-nkat-kcat',
        f3 && f3.ok && f3.vUnit === 'U/mL' && T.near(f3.params.Vmax, 0.18, 1e-5) && T.near(f3.params.Km, 0.5, 1e-5)
          && T.near(f3.kcat, 15.0, 1e-4) && T.near(f3.kcatKm, 30000, 1.0),
        JSON.stringify(f3 && {vUnit: f3.vUnit, params: f3.params, kcat: f3.kcat, kcatKm: f3.kcatKm}));

      T.check('mm.no-page-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('kinetics-hill-subInhib-and-sd-weighting', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      // 1. Positive cooperativity Hill: Vmax=80 uM/s, K0.5=2.0 mM, nH=2.5, [E]=0.5 uM => kcat=160 s^-1
      const hillS = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];
      const hillPts = hillS.map(s => ({s, v: 80 * Math.pow(s, 2.5) / (Math.pow(2.0, 2.5) + Math.pow(s, 2.5))}));

      // 2. Negative cooperativity Hill: Vmax=50 uM/s, K0.5=1.2 mM, nH=0.6
      const hillNegPts = [0.05, 0.2, 0.5, 1.2, 3.0, 10.0, 30.0].map(s => ({s, v: 50 * Math.pow(s, 0.6) / (Math.pow(1.2, 0.6) + Math.pow(s, 0.6))}));

      // 3. Substrate inhibition (Haldane): Vmax=200 uM/min, Km=0.4 mM, Ki=10.0 mM, [E]=0.2 uM
      //    Sopt = sqrt(0.4*10) = 2.0 mM; Vpeak = 200/(1+2*0.2) = 142.85714 uM/min; kcat = 200/(60*0.2) = 16.6667 s^-1
      const siS = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0];
      const siPts = siS.map(s => ({s, v: 200 * s / (0.4 + s * (1 + s / 10.0))}));

      // 4. SD weighting comparison: true Vmax=100, Km=1.0; last point has +40 outlier error with huge sd=40 vs clean sd=0.2
      const wPts = [0.2, 0.5, 1.0, 2.0, 5.0, 10.0].map((s, idx) => {
        const clean = 100 * s / (1.0 + s);
        return idx === 5 ? {s, v: clean + 40, sd: 40} : {s, v: clean, sd: 0.2};
      });

      const proj = baseProject([
        {
          id: 'h1', name: 'Hill positive cooperativity', kind: 'kinetics', rawUnit: 'uM/s',
          kinetics: {substrate: 'ATP', unit: 'mM', vUnit: 'uM/s', points: hillPts},
          fit: {model: 'hill', enzConc_uM: 0.5, activeSitesPerMol: 1, weight: 'none'}
        },
        {
          id: 'h2', name: 'Hill negative cooperativity', kind: 'kinetics', rawUnit: 'uM/s',
          kinetics: {substrate: 'ATP', unit: 'mM', vUnit: 'uM/s', points: hillNegPts},
          fit: {model: 'hill', enzConc_uM: null, activeSitesPerMol: 1, weight: 'none'}
        },
        {
          id: 'si1', name: 'Substrate inhibition Haldane', kind: 'kinetics', rawUnit: 'uM/min',
          kinetics: {substrate: 'Substrate', unit: 'mM', vUnit: 'uM/min', points: siPts},
          fit: {model: 'subInhib', enzConc_uM: 0.2, activeSitesPerMol: 1, weight: 'none'}
        },
        {
          id: 'w_none', name: 'MM unweighted with outlier', kind: 'kinetics', rawUnit: 'uM/min',
          kinetics: {substrate: 'S', unit: 'mM', vUnit: 'uM/min', points: wPts},
          fit: {model: 'mm', weight: 'none'}
        },
        {
          id: 'w_sd', name: 'MM SD-weighted with outlier', kind: 'kinetics', rawUnit: 'uM/min',
          kinetics: {substrate: 'S', unit: 'mM', vUnit: 'uM/min', points: wPts},
          fit: {model: 'mm', weight: 'sd'}
        }
      ]);

      const calc = await loadProjectAndCalc(p, h, 'assay_models.json', proj);
      T.check('models.computed', !!(calc && calc.assays && calc.assays.length === 5), `len=${calc && calc.assays && calc.assays.length}`);
      if (!calc) return;

      const fh1 = calc.assays[0].fit;
      T.check('hill.positive-cooperativity',
        fh1 && fh1.ok && T.near(fh1.params.Vmax, 80, 1e-3) && T.near(fh1.params.K05, 2.0, 1e-4) && T.near(fh1.params.nH, 2.5, 1e-4)
          && T.near(fh1.kcat, 160, 1e-3) && fh1.kcatKm === null && fh1.r2 > 0.99999,
        JSON.stringify(fh1 && {params: fh1.params, kcat: fh1.kcat, kcatKm: fh1.kcatKm, r2: fh1.r2}));

      const fh2 = calc.assays[1].fit;
      T.check('hill.negative-cooperativity',
        fh2 && fh2.ok && T.near(fh2.params.Vmax, 50, 1e-2) && T.near(fh2.params.K05, 1.2, 1e-3) && T.near(fh2.params.nH, 0.6, 1e-3) && fh2.r2 > 0.9999,
        JSON.stringify(fh2 && {params: fh2.params, r2: fh2.r2}));

      const fsi = calc.assays[2].fit;
      T.check('subInhib.haldane-params',
        fsi && fsi.ok && T.near(fsi.params.Vmax, 200, 1e-2) && T.near(fsi.params.Km, 0.4, 1e-4) && T.near(fsi.params.Ki, 10.0, 1e-3)
          && T.near(fsi.params.Sopt, 2.0, 1e-4) && T.near(fsi.params.Vpeak, 200 / 1.4, 1e-3)
          && T.near(fsi.kcat, 200 / 12, 1e-3) && fsi.r2 > 0.99999,
        JSON.stringify(fsi && {params: fsi.params, kcat: fsi.kcat, r2: fsi.r2}));

      const fwNone = calc.assays[3].fit, fwSd = calc.assays[4].fit;
      const errNone = Math.abs(fwNone.params.Vmax - 100), errSd = Math.abs(fwSd.params.Vmax - 100);
      T.check('weight.sd-downweights-noisy-outlier',
        fwNone && fwNone.ok && fwSd && fwSd.ok && errSd < 0.5 && errNone > 10 && errSd < errNone / 20,
        `Vmax(none)=${fwNone && fwNone.params.Vmax.toFixed(3)} (err ${errNone.toFixed(3)}), Vmax(sd)=${fwSd && fwSd.params.Vmax.toFixed(3)} (err ${errSd.toFixed(3)})`);

      T.check('models.no-page-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
