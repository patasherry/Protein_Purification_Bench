const {open, H, suite, RES, path, fs} = require('../lib/harness');
const T = suite('1704_assay_methods');

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

async function loadProjObj(p, h, obj, fname) {
  await p.locator('#projFile').setInputFiles({
    name: fname,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(obj))
  });
  await h.wait(600);
}

(async () => {
  await T.t('legacy-no-assays-invariance', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      await loadProjObj(p, h, {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        name: 'Legacy No Assays',
        opt: {protKda: 50, eps: 1.0},
        prep: {on: true, name: 'Legacy Prep', qcActivity: 'Active by coupled assay'},
        runs: [
          makeRun('r1', 'HisTrap_IMAC', 'IMAC', 10, 'F1-F3'),
          makeRun('r2', 'Superdex200_SEC', 'SEC', 12, 'F1-F3')
        ],
        traces: [], gels: [], ndSamples: [],
        assays: []
      }, 'legacy_no_assays.json');
      await h.step('figure');
      const tbl = await h.sumTable();
      T.check('legacy-rows-present', tbl.length >= 3, JSON.stringify(tbl));
      const hdr = tbl[0] || [];
      T.check('legacy-no-activity-cols', !hdr.some(c => /Total activity|Specific activity|Purification fold/i.test(c)), JSON.stringify(hdr));
      const basis = await p.$eval('#sumBasis', e => e.textContent);
      T.check('legacy-no-activity-basis', !/Activity fold/i.test(basis), basis);
      const mTxt = await h.methods();
      T.check('legacy-qc-activity-kept', mTxt.includes('Activity and other checks: Active by coupled assay.'), mTxt);
      T.check('legacy-no-structured-assay', !/Enzyme activity assay/i.test(mTxt), mTxt);
      T.check('legacy-no-page-errors', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  await T.t('steps-assay-methods-summary-csv-and-gaps', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      await loadProjObj(p, h, {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        name: 'NADH Oxidase Purification',
        opt: {protKda: 50, eps: 1.0},
        prep: {
          on: true,
          name: 'NADH Oxidase Prep',
          qcActivity: 'Old text that structured assay replaces',
          btw: {r1: {how: 'conc', conc: '4.0', vOut: '2', vLoad: '1', vKeep: '1', unit: 'mL'}}
        },
        runs: [
          makeRun('r1', 'HisTrap_IMAC', 'IMAC', 10, 'F1-F3'),
          makeRun('r2', 'Superdex200_SEC', 'SEC', 12, 'F1-F3')
        ],
        traces: [], gels: [], ndSamples: [],
        assays: [{
          id: 'a1',
          name: 'NADH oxidase',
          mode: 'steps',
          protocol: {
            substrate: 'NADH',
            substrateConc: '0.2 mM',
            buffer: '50 mM Tris-HCl, 100 mM NaCl',
            pH: 8.0,
            tempC: 25,
            wavelengthNm: 340,
            eps_mM: 6.22,
            pathCm: 1,
            rxnVolMl: 1.0,
            enzVolMl: 0.02
          },
          blanks: [{val: 0.002}, {val: 0.002}],
          entries: [
            {id: 'e1', name: 'Clarified lysate', stepRef: 'lysis', volMl: 50, protMgMl: 4.0, dil: 1, rawVals: [0.1264, 0.1264], rawUnit: 'dA/min'},
            {id: 'e2', name: 'IMAC', stepRef: 'run:r1', volMl: 10, protMgMl: 2.0, dil: 5, rawVals: [0.10152, 0.10152], rawUnit: 'dA/min'},
            {id: 'e3', name: 'SEC', stepRef: 'run:r2', volMl: 2.5, protMgMl: 0.6, dil: 10, rawVals: [0.07664, 0.07664], rawUnit: 'dA/min'}
          ],
          display: {visible: true, placement: 'panel', yUnit: 'U/mg', showErr: 'sd'}
        }]
      }, 'steps_assay_methods.json');
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
          const csvFile = path.join(RES, 'sum-1704-' + Date.now() + '.csv');
          await dl.saveAs(csvFile);
          csvText = fs.readFileSync(csvFile, 'utf8');
          fs.rmSync(csvFile, {force: true});
        }
      }
      T.check('csv-activity-headers', csvText.includes('Total activity (U),Activity (U/mL),Activity (nkat/mL),Specific activity (U/mg),Purification fold,Activity yield (%),Apparent kcat (s^-1)'), csvText);
      T.check('csv-sec-values', csvText.includes('15.000,6.000,100.00,10.000,40.00,60.0,8.33'), csvText);

      await p.$eval('#methodsBox', d => { d.open = true; d.dispatchEvent(new Event('toggle')); });
      const protoDet = await p.$('#assayPanel details.assay-proto');
      if (protoDet) {
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
      T.check('steps-no-page-errors', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  await T.t('kinetics-assay-methods-protocol-and-results', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      const concs = [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0];
      const entries = concs.map((s, i) => ({
        id: 'k' + i,
        conc: s,
        concUnit: 'mM',
        rawVals: [+((12 * s) / (0.4 + s)).toFixed(5)],
        rawUnit: 'U/mL'
      }));
      await loadProjObj(p, h, {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        name: 'Kinetics Methods Test',
        opt: {protKda: 40},
        prep: {on: true, name: 'ATPase Prep'},
        runs: [makeRun('r1', 'SEC_Run', 'SEC', 12, 'F1-F3')],
        traces: [], gels: [], ndSamples: [],
        assays: [{
          id: 'ak1',
          name: 'ATPase kinetics',
          mode: 'kinetics',
          protocol: {
            substrate: 'ATP',
            buffer: '25 mM HEPES, 5 mM MgCl2',
            pH: 7.5,
            tempC: 30
          },
          fit: {model: 'mm', weight: 'equal', enzConc_uM: 1.0},
          entries
        }]
      }, 'kinetics_methods.json');
      await h.step('figure');
      const mTxt = await h.methods();
      T.check('kinetics-protocol-text', mTxt.includes('varying ATP (0.050–5.0 mM) in 25 mM HEPES, 5 mM MgCl2, pH 7.5 at 30 °C'), mTxt);
      T.check('kinetics-regression-text', mTxt.includes('Michaelis-Menten equation') && mTxt.includes('Levenberg-Marquardt'), mTxt);
      T.check('kinetics-results-units', /Steady-state kinetics \(ATPase kinetics\): Km = 0\.40(?: ± [0-9.e-]+)? mM, Vmax = 12(?:\.0)?(?: ± [0-9.e-]+)? U\/mL, kcat = 200(?: ± [0-9.e-]+)? s⁻¹ \(R² = 1\.0000/.test(mTxt), mTxt);
      T.check('kinetics-no-page-errors', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  T.done();
})();
