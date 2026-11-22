// Issue #1661: Activity assays calculation engine (Beer-Lambert rate, blank SD quadrature,
// full-precision SA/Fold/btwSplit Yield, and Levenberg-Marquardt MM/Hill/Substrate-Inhibition kinetics)
const os = require('os');
const {open, H, suite, fs, path} = require('../lib/harness');
const T = suite('1701_assay_calc');

function baseProj(extra) {
  return Object.assign({
    app: 'Protein Purification Bench',
    version: 1,
    schemaVersion: 1,
    saved: new Date().toISOString(),
    cur: 'workflow',
    opt: {},
    runs: [
      {
        id: 'r1',
        name: 'HisTrap IMAC',
        inWf: true,
        color: '#0072b2',
        uvs: [{name: 'UV 280', unit: 'mAU', xs: [0, 5, 10], ys: [0, 120, 0]}],
        fracs: [{x: 4, label: 'F1'}, {x: 6, label: 'F2'}],
        fracEnd: 8,
        shade: 'F1-F2'
      },
      {
        id: 'r2',
        name: 'Superdex 200 SEC',
        inWf: true,
        color: '#0072b2',
        uvs: [{name: 'UV 280', unit: 'mAU', xs: [0, 12, 24], ys: [0, 85, 0]}],
        fracs: [{x: 11, label: 'B1'}, {x: 13, label: 'B2'}],
        fracEnd: 15,
        shade: 'B1-B2'
      }
    ],
    traces: [],
    gels: [],
    prep: {on: true, name: 'Enzyme Prep', qcActivity: 'Legacy QC text'}
  }, extra || {});
}

async function txt(root, sel) {
  const loc = root.locator(sel);
  if ((await loc.count()) === 0) return '';
  return ((await loc.first().textContent()) || '').trim();
}

async function attr(root, sel, name) {
  const loc = root.locator(sel);
  if ((await loc.count()) === 0) return '';
  return (await loc.first().getAttribute(name)) || '';
}

(async () => {
  await T.t('beer-lambert-rate-blank-quadrature-and-zero-preservation', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(10000);
      const proj = baseProj({
        assays: [
          {
            id: 'a1',
            name: 'WT-D-PhgAT 340 nm Protocol',
            mode: 'steps',
            protocol: {
              substrate: 'D-phenylglycine',
              wavelengthNm: 340,
              eps_mM: 24.0,
              pathCm: 1.0,
              rxnVolMl: 1.0,
              enzVolMl: 0.020
            },
            blanks: [{val: 0.01151, note: 'b1'}, {val: 0.01000, note: 'b2'}, {val: 0.00849, note: 'b3'}],
            entries: [
              {
                stepRef: 'r1',
                name: 'Pool 1',
                rawVals: [0.252, 0.250, 0.248, 'OVRFLW', 'Masked', '>3.5'],
                rawUnit: 'dA/min',
                dil: 10,
                volMl: 12.0,
                protMgMl: 0.58,
                mwKda: 48.0
              },
              {
                stepRef: 'r2',
                name: 'Zero-rate Pool',
                rawVals: [0.010],
                rawUnit: 'dA/min',
                dil: 10,
                volMl: 5.0,
                protMgMl: 0.50
              },
              {
                stepRef: 'final',
                name: 'Unassayed Step',
                rawVals: ['OVRFLW', '']
              }
            ]
          }
        ]
      });
      const tmp = path.join(os.tmpdir(), `assay_calc_rate_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(proj));
      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

      const hasPanel = (await p.locator('#assayPanel').count()) > 0;
      const vis = hasPanel && await p.locator('#assayPanel').isVisible();
      T.check('rate/panel-visible', vis, 'Expected #assayPanel to be visible when assays exist');

      const r1 = p.locator('#assayPanel [data-assay-id="a1"] tr[data-step-ref="r1"]');
      T.check('rate/u-per-ml', (await txt(r1, '.as-upml')) === '5.00', `Got "${await txt(r1, '.as-upml')}"`);
      T.check('rate/nkat-per-ml', (await txt(r1, '.as-nkat')) === '83.33', `Got "${await txt(r1, '.as-nkat')}"`);
      T.check('rate/total-u', (await txt(r1, '.as-totu')) === '60.00', `Got "${await txt(r1, '.as-totu')}"`);
      T.check('rate/specific-activity', (await txt(r1, '.as-sa')) === '8.62', `Got "${await txt(r1, '.as-sa')}"`);
      T.check('rate/kcat', (await txt(r1, '.as-kcat')) === '6.90', `Got "${await txt(r1, '.as-kcat')}"`);

      const rZero = p.locator('#assayPanel [data-assay-id="a1"] tr[data-step-ref="r2"]');
      T.check('rate/measured-zero-preserved', (await txt(rZero, '.as-upml')) === '0.00', `Got "${await txt(rZero, '.as-upml')}"`);
      T.check('rate/measured-zero-yield', (await txt(rZero, '.as-yld')) === '0.00%', `Got "${await txt(rZero, '.as-yld')}"`);

      const rUn = p.locator('#assayPanel [data-assay-id="a1"] tr[data-step-ref="final"]');
      T.check('rate/unassayed-not-coerced-to-zero', (await rUn.count()) > 0 && (await txt(rUn, '.as-upml')) === '' && (await txt(rUn, '.as-totu')) === '', 'Unassayed step should render with blank rate');
      T.check('rate/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('btwsplit-yield-propagation-and-rounding-audit-warnings', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(10000);
      const proj = baseProj({
        prep: {
          on: true,
          name: 'Split Prep',
          qcActivity: 'Legacy QC text',
          btw: {
            r1: {how: 'conc', vOut: 2.0, vLoad: 0.5}
          }
        },
        assays: [
          {
            id: 'a2',
            name: 'Split Prep Activity',
            mode: 'steps',
            entries: [
              {stepRef: 'r1', name: 'IMAC Pool', rawVals: [60.0], rawUnit: 'U', volMl: 10.0, protTotalMg: 24.0, reportedFold: 0},
              {stepRef: 'btw:r1', name: 'Concentrated Pool', rawVals: [54.0], rawUnit: 'U', volMl: 2.0, protTotalMg: 21.6},
              {stepRef: 'r2', name: 'SEC Pool', rawVals: [10.8], rawUnit: 'U', volMl: 3.0, protTotalMg: 0.90}
            ]
          },
          {
            id: 'a3',
            name: 'Guava POD Rounding Audit',
            mode: 'steps',
            entries: [
              {
                stepRef: 'r1',
                name: 'Purified POD',
                rawVals: [290.7],
                rawUnit: 'U/mL',
                volMl: 10.0,
                protMgMl: 290.7 / 549100,
                protTotalMg: 0.01
              }
            ]
          }
        ]
      });
      const tmp = path.join(os.tmpdir(), `assay_calc_split_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(proj));
      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

      const secRow = p.locator('#assayPanel [data-assay-id="a2"] tr[data-step-ref="r2"]');
      T.check('split/sec-sa', (await txt(secRow, '.as-sa')) === '12.00', `Got "${await txt(secRow, '.as-sa')}"`);
      T.check('split/sec-fold-invariant', (await txt(secRow, '.as-fold')) === '4.80×', `Got "${await txt(secRow, '.as-fold')}"`);
      T.check('split/sec-step-yield', (await txt(secRow, '.as-stepy')) === '80.00%', `Got "${await txt(secRow, '.as-stepy')}"`);
      T.check('split/sec-adjusted-cum-yield', (await txt(secRow, '.as-yld')) === '72.00%', `Got "${await txt(secRow, '.as-yld')}"`);
      T.check('split/sec-raw-aliquot-yield', (await attr(secRow, '.as-yld', 'data-raw-yield')) === '18.00', `Got "${await attr(secRow, '.as-yld', 'data-raw-yield')}"`);

      const baseRow = p.locator('#assayPanel [data-assay-id="a2"] tr[data-step-ref="r1"]');
      T.check('audit/crude-fold-recomputed', (await txt(baseRow, '.as-fold')) === '1.00×', `Got "${await txt(baseRow, '.as-fold')}"`);
      const baseClass = (await baseRow.count()) > 0 ? ((await baseRow.getAttribute('class')) || '') : '';
      T.check('audit/crude-fold-zero-warned', baseClass.includes('warnc'), `Expected warnc on baseline fold=0, got "${baseClass}"`);

      const podRow = p.locator('#assayPanel [data-assay-id="a3"] tr[data-step-ref="r1"]');
      T.check('audit/unrounded-sa', (await txt(podRow, '.as-sa')) === '549100.00', `Got "${await txt(podRow, '.as-sa')}"`);
      const podWarnTxt = await txt(p, '#assayPanel [data-assay-id="a3"] .assay-warns');
      T.check('audit/rounded-mg-88pct-warning', podWarnTxt.includes('+88.89%'), `Expected +88.89% warning, got "${podWarnTxt}"`);
      T.check('split/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('nonlinear-kinetics-mm-hill-subinhib-and-aicc', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(10000);
      const puromycinTreated = [
        {conc: 0.02, rawVals: [76, 47], rawUnit: 'count/min^2'},
        {conc: 0.06, rawVals: [97, 107], rawUnit: 'count/min^2'},
        {conc: 0.11, rawVals: [123, 139], rawUnit: 'count/min^2'},
        {conc: 0.22, rawVals: [159, 152], rawUnit: 'count/min^2'},
        {conc: 0.56, rawVals: [191, 201], rawUnit: 'count/min^2'},
        {conc: 1.10, rawVals: [207, 200], rawUnit: 'count/min^2'}
      ];
      const puromycinUntreated = [
        {conc: 0.02, rawVals: [67, 51], rawUnit: 'count/min^2'},
        {conc: 0.06, rawVals: [84, 86], rawUnit: 'count/min^2'},
        {conc: 0.11, rawVals: [98, 115], rawUnit: 'count/min^2'},
        {conc: 0.22, rawVals: [131, 124], rawUnit: 'count/min^2'},
        {conc: 0.56, rawVals: [144, 158], rawUnit: 'count/min^2'},
        {conc: 1.10, rawVals: [160], rawUnit: 'count/min^2'}
      ];
      const subInhibEntries = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0].map(c => ({
        conc: c,
        rawVals: [(120 * c) / (0.4 + c + (c * c) / 2.5)],
        rawUnit: 'uM/min'
      }));
      const proj = baseProj({
        assays: [
          {id: 'k_mm', name: 'Puromycin Treated MM', mode: 'kinetics', fit: {model: 'mm'}, entries: puromycinTreated},
          {id: 'k_hill', name: 'Puromycin Treated Hill', mode: 'kinetics', fit: {model: 'hill'}, entries: puromycinTreated},
          {id: 'k_un', name: 'Puromycin Untreated MM', mode: 'kinetics', fit: {model: 'mm'}, entries: puromycinUntreated},
          {id: 'k_si', name: 'Substrate Inhibition', mode: 'kinetics', fit: {model: 'subInhib', enzConc_uM: 0.2, activeSitesPerMol: 1}, entries: subInhibEntries}
        ]
      });
      const tmp = path.join(os.tmpdir(), `assay_calc_kin_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(proj));
      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

      const mm = p.locator('#assayPanel [data-assay-id="k_mm"] .assay-fit');
      T.check('kin/mm-vmax-se', (await txt(mm, '.af-vmax')) === 'Vmax 212.6837 ± 6.9472', `Got "${await txt(mm, '.af-vmax')}"`);
      T.check('kin/mm-km-se', (await txt(mm, '.af-km')) === 'Km 0.064121 ± 0.008281', `Got "${await txt(mm, '.af-km')}"`);
      T.check('kin/mm-r2', (await txt(mm, '.af-r2')) === 'R² 0.96126', `Got "${await txt(mm, '.af-r2')}"`);
      T.check('kin/mm-rmse', (await txt(mm, '.af-rmse')) === 'RMSE 9.981', `Got "${await txt(mm, '.af-rmse')}"`);
      T.check('kin/mm-aicc', (await txt(mm, '.af-aicc')) === 'AICc 64.22', `Got "${await txt(mm, '.af-aicc')}"`);

      const hill = p.locator('#assayPanel [data-assay-id="k_hill"] .assay-fit');
      T.check('kin/hill-n', (await txt(hill, '.af-hill')).includes('n 0.7394'), `Got "${await txt(hill, '.af-hill')}"`);
      T.check('kin/hill-r2', (await txt(hill, '.af-r2')) === 'R² 0.97376', `Got "${await txt(hill, '.af-r2')}"`);
      T.check('kin/hill-aicc-penalized', (await txt(hill, '.af-aicc')) === 'AICc 64.26', `Got "${await txt(hill, '.af-aicc')}"`);

      const un = p.locator('#assayPanel [data-assay-id="k_un"] .assay-fit');
      T.check('kin/untreated-vmax-se', (await txt(un, '.af-vmax')) === 'Vmax 160.2800 ± 6.4802', `Got "${await txt(un, '.af-vmax')}"`);
      T.check('kin/untreated-km-se', (await txt(un, '.af-km')) === 'Km 0.047708 ± 0.007782', `Got "${await txt(un, '.af-km')}"`);
      T.check('kin/untreated-rmse', (await txt(un, '.af-rmse')) === 'RMSE 8.840', `Got "${await txt(un, '.af-rmse')}"`);

      const si = p.locator('#assayPanel [data-assay-id="k_si"] .assay-fit');
      T.check('kin/subinhib-vmax', (await txt(si, '.af-vmax')).includes('Vmax 120.0000'), `Got "${await txt(si, '.af-vmax')}"`);
      T.check('kin/subinhib-km', (await txt(si, '.af-km')).includes('Km 0.400000'), `Got "${await txt(si, '.af-km')}"`);
      T.check('kin/subinhib-ki', (await txt(si, '.af-ki')).includes('Ki 2.5000'), `Got "${await txt(si, '.af-ki')}"`);
      T.check('kin/subinhib-kcat', (await txt(si, '.af-kcat')) === 'kcat 10.00 s⁻¹', `Got "${await txt(si, '.af-kcat')}"`);
      T.check('kin/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('legacy-project-keeps-assay-panel-hidden', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(10000);
      const tmp = path.join(os.tmpdir(), `assay_calc_legacy_${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(baseProj()));
      await p.setInputFiles('#projFile', tmp);
      await h.wait(400);

      const hasPanel = (await p.locator('#assayPanel').count()) > 0;
      const hidden = hasPanel ? await p.locator('#assayPanel').evaluate(el => el.hidden) : false;
      T.check('legacy/assay-panel-hidden', hidden === true, `Expected #assayPanel hidden on legacy project, got ${hidden}`);
      T.check('legacy/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
