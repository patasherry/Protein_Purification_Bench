// Issue #1662: Activity assays UI and CSV/TSV ingestion
const os = require('os');
const {open, H, suite, src, fs, path} = require('../lib/harness');
const T = suite('1702_assay_ui');

async function txt(root, sel) {
  const loc = root.locator(sel);
  if ((await loc.count()) === 0) return '';
  return ((await loc.first().textContent()) || '').trim();
}

(async () => {
  await T.t('add-assay-paste-csv-edit-protocol-and-persist', async () => {
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

        // Paste CSV with a Blank row, valid 0 rate, and plate-reader overflow tokens
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

        // Open STRENDA Assay Protocol drawer and edit protocol parameters
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

        // Check live calculated rates: (0.250 - 0.010) * 1.0 * 10 / (24 * 1 * 0.02) = 5.00 U/mL
        const row0 = card.locator('tr[data-entry-idx="0"]');
        const row1 = card.locator('tr[data-entry-idx="1"]');
        const row2 = card.locator('tr[data-entry-idx="2"]');
        T.check('calc/live-rate-row0', (await txt(row0, '.as-upml')) === '5.00', `Got "${await txt(row0, '.as-upml')}"`);
        T.check('calc/live-sa-row0', (await txt(row0, '.as-sa')) === '8.62', `Got "${await txt(row0, '.as-sa')}"`);
        T.check('calc/zero-rate-preserved', (await txt(row1, '.as-upml')) === '0.00', `Got "${await txt(row1, '.as-upml')}"`);
        // Row 2: (0.370 - 0.010) * 1.0 * 10 / (24 * 1 * 0.02) = 7.50 U/mL; SA = 7.50 / 0.20 = 37.50 U/mg
        T.check('calc/live-rate-row2', (await txt(row2, '.as-upml')) === '7.50', `Got "${await txt(row2, '.as-upml')}"`);
        T.check('calc/live-sa-row2', (await txt(row2, '.as-sa')) === '37.50', `Got "${await txt(row2, '.as-sa')}"`);

        // Export project and verify protocol & immutable raw values saved
        const [dl] = await Promise.all([
          p.waitForEvent('download', {timeout: 10000}),
          p.click('#projSave')
        ]);
        const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
        const sa = saved.assays && saved.assays[0];
        T.check('persist/protocol-saved', !!(sa && sa.protocol && sa.protocol.substrate === 'D-phenylglycine' && sa.protocol.eps_mM === 24 && sa.protocol.pH === 8), JSON.stringify(sa && sa.protocol));
        T.check('persist/raw-replicates-immutable', !!(sa && sa.entries && JSON.stringify(sa.entries[0].rawVals) === JSON.stringify([0.252, 0.248])), JSON.stringify(sa && sa.entries && sa.entries[0]));
      } else {
        T.check('paste/entries-populated', false, 'No assay card');
        T.check('paste/blanks-separated', false, 'No assay card');
        T.check('calc/live-rate-row0', false, 'No assay card');
        T.check('calc/live-sa-row0', false, 'No assay card');
        T.check('calc/zero-rate-preserved', false, 'No assay card');
        T.check('calc/live-rate-row2', false, 'No assay card');
        T.check('calc/live-sa-row2', false, 'No assay card');
        T.check('persist/protocol-saved', false, 'No assay card');
        T.check('persist/raw-replicates-immutable', false, 'No assay card');
      }
      T.check('ui/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('fraction-mismatch-warning-kinetics-paste-and-delete', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(12000);
      const proj = {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        quick: true,
        saved: new Date().toISOString(),
        cur: 'workflow',
        opt: {},
        runs: [
          {
            id: 'r1',
            name: 'IMAC Step',
            inWf: true,
            color: '#0072b2',
            uvs: [{name: 'UV 280', unit: 'mAU', xs: [0, 5, 10], ys: [0, 100, 0]}],
            fracs: [{x: 3, label: 'T3'}, {x: 5, label: 'T4'}],
            fracEnd: 7,
            shade: 'T3-T4'
          }
        ],
        traces: [],
        gels: [],
        prep: {on: true, name: 'Test'}
      };
      const tmp = path.join(os.tmpdir(), `assay_ui_frac_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(proj));
      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

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

        // Add second assay in kinetics mode via #assayAdd and import CSV file
        await p.click('#assayAdd');
        await h.wait(200);
        const card2 = p.locator('#assayPanel .assay-card').nth(1);
        await card2.locator('[data-ak="mode"]').selectOption('kinetics');
        const kinCsv = path.join(os.tmpdir(), `assay_kin_${Date.now()}.csv`);
        fs.writeFileSync(kinCsv, 'Conc,Rate1,Rate2\n0.02,76,47\n0.06,97,107\n0.11,123,139\n0.22,159,152\n0.56,191,201\n1.10,207,200\n');
        await p.setInputFiles('#assayFile', kinCsv);
        await h.wait(250);
        T.check('kin/imported-vmax', (await txt(card2, '.af-vmax')).includes('212.6837'), `Got "${await txt(card2, '.af-vmax')}"`);

        // Delete both assays and verify panel hides when empty
        await card2.locator('[data-assay-del]').click();
        await h.wait(150);
        T.check('del/one-remaining', (await p.locator('#assayPanel .assay-card').count()) === 1, 'Expected 1 card remaining');
        await p.locator('#assayPanel .assay-card [data-assay-del]').first().click();
        await h.wait(150);
        T.check('del/all-removed-panel-hidden', (await p.locator('#assayPanel .assay-card').count()) === 0 && await p.locator('#assayPanel').evaluate(el => el.hidden), 'Expected 0 cards and hidden #assayPanel');
      } else {
        T.check('frac/matched-no-warn', false, 'No #assayOpenBtn');
        T.check('frac/unmatched-warned', false, 'No #assayOpenBtn');
        T.check('kin/imported-vmax', false, 'No #assayOpenBtn');
        T.check('del/one-remaining', false, 'No #assayOpenBtn');
        T.check('del/all-removed-panel-hidden', false, 'No #assayOpenBtn');
      }
      T.check('frac/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('kinetics-guardrails-distinct-s-damin-nms-and-weighted-r2', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(12000);
      const jit = [0.12, -0.09, 0.10, -0.11, 0.08, 40.0];
      const sds = [0.2, 0.2, 0.2, 0.2, 0.2, 40.0];
      const sArr = [0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
      const proj = {
        app: 'Protein Purification Bench',
        version: 1,
        schemaVersion: 1,
        cur: 'workflow',
        runs: [{id: 'r1', name: 'SEC', inWf: true, color: '#0072b2', uvs: [{name: 'UV 280', unit: 'mAU', xs: [0, 5, 10], ys: [0, 100, 0]}], fracs: [], shade: ''}],
        traces: [], gels: [],
        prep: {on: true, name: 'Kinetics Guardrails'},
        assays: [
          {
            id: 'a_1s', name: 'One S Triplicate', mode: 'kinetics',
            fit: {model: 'mm', weight: 'none', enzConc_uM: 0.1},
            entries: [{conc: 1.0, concUnit: 'mM', rawVals: [10.0, 10.5, 9.5], rawUnit: 'U/mL'}]
          },
          {
            id: 'a_2pt', name: 'Two Point Exact', mode: 'kinetics',
            fit: {model: 'mm', weight: 'none'},
            entries: [
              {conc: 0.5, concUnit: 'mM', rawVals: [4.0], rawUnit: 'U/mL'},
              {conc: 2.0, concUnit: 'mM', rawVals: [10.0], rawUnit: 'U/mL'}
            ]
          },
          {
            id: 'a_uncal', name: 'Uncalibrated dA/min', mode: 'kinetics',
            fit: {model: 'mm', weight: 'none', enzConc_uM: 0.1},
            entries: [0.1, 0.25, 0.5, 1.0, 2.5].map(s => ({conc: s, concUnit: 'mM', rawVals: [+(0.24 * s / (0.5 + s)).toFixed(5)], rawUnit: 'dA/min'}))
          },
          {
            id: 'a_nms', name: 'Calibrated nM/s', mode: 'kinetics',
            fit: {model: 'mm', weight: 'none', enzConc_uM: 0.05},
            entries: [0.1, 0.25, 0.5, 1.0, 2.5].map(s => ({conc: s, concUnit: 'mM', rawVals: [+(500 * s / (0.5 + s)).toFixed(4)], rawUnit: 'nM/s'}))
          },
          {
            id: 'a_wsd', name: 'Weighted Outlier', mode: 'kinetics',
            fit: {model: 'mm', weight: 'sd'},
            entries: sArr.map((s, i) => ({conc: s, concUnit: 'mM', rawVals: [100 * s / (1.0 + s) + jit[i]], rawSd: sds[i], rawUnit: 'uM/min'}))
          }
        ]
      };
      await p.setInputFiles('#projFile', {
        name: 'kin_guardrails.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(proj))
      });
      await h.wait(500);

      const c1 = p.locator('#assayPanel [data-assay-id="a_1s"]');
      const fit1Txt = await txt(c1, '.assay-fit');
      T.check('kin/refuses-single-distinct-s', fit1Txt.includes('Insufficient points') && !(await c1.locator('.af-vmax').count()), `fit="${fit1Txt}"`);

      const c2 = p.locator('#assayPanel [data-assay-id="a_2pt"]');
      const vmax2 = await txt(c2, '.af-vmax'), warn2 = await txt(c2, '.af-warn'), rmse2 = await txt(c2, '.af-rmse');
      T.check('kin/zero-df-warns-and-withholds-se', !vmax2.includes('±') && warn2.includes('0 degrees of freedom') && rmse2.includes('n.d.'), `vmax="${vmax2}", warn="${warn2}", rmse="${rmse2}"`);

      const c3 = p.locator('#assayPanel [data-assay-id="a_uncal"]');
      T.check('kin/uncalibrated-damin-withholds-kcat', (await c3.locator('.af-vmax').count()) === 1 && (await c3.locator('.af-kcat').count()) === 0, `kcat="${await txt(c3, '.af-kcat')}"`);

      const c4 = p.locator('#assayPanel [data-assay-id="a_nms"]');
      const kcat4 = await txt(c4, '.af-kcat'), kcatKm4 = await txt(c4, '.af-kcatkm');
      T.check('kin/nms-scales-kcat-and-kcatkm', kcat4.includes('10.00 s⁻¹') && kcatKm4.includes('2.00e+4'), `kcat="${kcat4}", kcatKm="${kcatKm4}"`);

      const c5 = p.locator('#assayPanel [data-assay-id="a_wsd"]');
      const r2Txt = await txt(c5, '.af-r2');
      const r2Match = r2Txt.match(/-?\d+(?:\.\d+)?/);
      const r2Val = r2Match ? +r2Match[0] : 0;
      T.check('kin/weighted-r2-reflects-weights', r2Val > 0.999, `r2Txt="${r2Txt}"`);
      T.check('kin/guardrails-no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
