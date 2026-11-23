// #1661: calculate assay rates, specific activity/purification yields, and kinetic fits from raw assay inputs.
// Inputs enter through project import and derived results are read from the DOM-only assay calculation payload.
const {open, H, suite} = require('../lib/harness');

const base = assays => ({app: 'HPLC Figure Bench', version: 1, cur: 'workflow', runs: [], traces: [], gels: [], nanodrop: [], prep: {on: true, name: 'Synthetic enzyme'}, assays});
async function calc(p, h, project, name) {
  await p.setInputFiles('#projFile', {name: name || 'synthetic_assays.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project))});
  await h.wait(1600);
  const raw = await p.locator('#assayCalcData').textContent();
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

(async () => {
  const T = suite('1701_assay_calc');

  await T.t('rates-specific-activity-folds-and-yields', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const project = base([
        {id: 'a1', name: 'NADH continuous', rawUnit: 'dA/min', replicates: [{slope: .0642}, {slope: .0662}, {slope: .0682}], blanks: [{slope: .004}, {slope: .004}], dilution: 10, volumes: {assay: 200, sample: 10, unit: 'uL'}, optics: {epsilon: 6220, pathCm: .5, stoichiometry: 1}, stepId: 'lysis', proteinOverride: {conc: 10, vol: 50, unit: 'mg/mL'}},
        {id: 'a2', name: 'IMAC pool', rawUnit: 'U/mL', replicates: [8, 8], dilution: 10, stepId: 'final', proteinOverride: {conc: 2, vol: 10, unit: 'mg/mL'}},
        {id: 'a3', name: 'SI nkat', rawUnit: 'nkat/mL', replicates: [100], blanks: [10], dilution: 5},
        {id: 'a4', name: 'Blank control', rawUnit: 'U/mL', replicates: [.005], blanks: [.01]}
      ]);
      const out = await calc(p, h, project, 'rates_and_yields.json');
      T.check('rates.derived-on-load', !!(out && out.assays && out.assays.length === 4 && out.table && out.table.rows.length === 4), `items=${out && out.assays && out.assays.length}`);
      if (!out) return;
      const [a1, a2, a3, a4] = out.assays, [t1, t2] = out.table.rows;
      // net dA/min = .0662 - .004 = .0622; Beer-Lambert gives .02 U/mL in the well, then 20-fold volume and 10-fold dilution = 4 U/mL.
      T.check('rates.blank-dilution-and-volumes', T.near(a1.rate.netRate, .0622, 1e-6) && T.near(a1.rate.rxnRate_U_mL, .02, 1e-6) && T.near(a1.rate.volActivity_U_mL, 4, 1e-6), JSON.stringify(a1.rate));
      T.check('specific.baseline', T.near(t1.specificActivity_U_mg, .4, 1e-6) && T.near(t1.totalActivity_U, 200, 1e-5) && T.near(t1.fold, 1, 1e-6) && T.near(t1.activityYieldPct, 100, 1e-5), JSON.stringify(t1));
      T.check('specific.fold-and-yield', T.near(t2.specificActivity_U_mg, 40, 1e-6) && T.near(t2.totalActivity_U, 800, 1e-5) && T.near(t2.fold, 100, 1e-5) && T.near(t2.activityYieldPct, 400, 1e-5) && t2.yieldOver100, JSON.stringify(t2));
      T.check('rates.nkat-conversion', T.near(a3.rate.volActivity_U_mL, 27, 1e-6) && T.near(a3.rate.volActivity_nkat_mL, 450, 1e-5), JSON.stringify(a3.rate));
      T.check('rates.below-blank-flag', a4.rate.belowBlank === true && T.near(a4.rate.netRate, -.005, 1e-8), JSON.stringify(a4.rate));
      T.check('rates.no-page-errors', !errs.length, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('michaelis-menten-hill-substrate-inhibition-and-si-units', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const mmS = [.05, .1, .25, .5, 1, 2.5, 5], hillS = [.25, .5, 1, 1.5, 2, 3, 5, 10], siS = [.05, .1, .25, .5, 1, 2, 4, 8, 15, 30], nkatS = [.05, .1, .25, .5, 1, 2, 5, 10];
      const project = base([
        {id: 'mm', kind: 'kinetics', rawUnit: 'uM/min', kinetics: {unit: 'mM', vUnit: 'uM/min', points: mmS.map(s => ({s, v: 120*s/(.25+s)}))}, fit: {model: 'mm', enzConc_uM: .1, activeSitesPerMol: 1, weight: 'none'}},
        {id: 'hill', kind: 'kinetics', rawUnit: 'uM/s', kinetics: {unit: 'mM', vUnit: 'uM/s', points: hillS.map(s => ({s, v: 80*Math.pow(s, 2.5)/(Math.pow(2, 2.5)+Math.pow(s, 2.5))}))}, fit: {model: 'hill', enzConc_uM: .5, activeSitesPerMol: 1, weight: 'none'}},
        {id: 'sub', kind: 'kinetics', rawUnit: 'uM/min', kinetics: {unit: 'mM', vUnit: 'uM/min', points: siS.map(s => ({s, v: 200*s/(.4+s*(1+s/10))}))}, fit: {model: 'subInhib', enzConc_uM: .2, activeSitesPerMol: 1, weight: 'none'}},
        {id: 'nkat', kind: 'kinetics', rawUnit: 'nkat/mL', kinetics: {unit: 'mM', vUnit: 'nkat/mL', points: nkatS.map((s, i) => ({s, v: 3*s/(.5+s) + [.008, -.006, .01, -.009, .007, -.008, .006, -.005][i]}))}, fit: {model: 'mm', enzConc_uM: .1, activeSitesPerMol: 2, weight: 'none'}}
      ]);
      const out = await calc(p, h, project, 'kinetics_models.json');
      T.check('fits.derived-on-load', !!(out && out.assays && out.assays.every(x => x.fit && x.fit.ok)), JSON.stringify(out && out.assays && out.assays.map(x => x.fit)));
      if (!out) return;
      const [mm, hill, sub, nkat] = out.assays.map(x => x.fit);
      T.check('fits.michaelis-menten', T.near(mm.params.Vmax, 120, 1e-3) && T.near(mm.params.Km, .25, 1e-5) && T.near(mm.kcat, 20, 1e-3) && T.near(mm.kcatKm, 80000, 1), JSON.stringify(mm));
      T.check('fits.hill', T.near(hill.params.Vmax, 80, 1e-3) && T.near(hill.params.K05, 2, 1e-4) && T.near(hill.params.nH, 2.5, 1e-4) && T.near(hill.kcat, 160, 1e-3), JSON.stringify(hill));
      T.check('fits.substrate-inhibition', T.near(sub.params.Vmax, 200, 1e-2) && T.near(sub.params.Km, .4, 1e-4) && T.near(sub.params.Ki, 10, 1e-3) && T.near(sub.params.Sopt, 2, 1e-4) && T.near(sub.kcat, 200/12, 1e-3), JSON.stringify(sub));
      // 3 nkat/mL = .18 U/mL. With .2 uM active enzyme, Vmax yields kcat 15 s^-1, not .015 s^-1.
      T.check('fits.nkat-converts-unit-before-kcat', nkat.vUnit === 'U/mL' && T.near(nkat.params.Vmax, .18, .005) && T.near(nkat.kcat, 15, .5) && nkat.seKcat > 0 && T.near(nkat.seKcat / nkat.se.Vmax, 1000 / (60 * .2), 1e-6) && T.near(nkat.kcatKm, 30000, 2500), JSON.stringify(nkat));
      T.check('fits.no-page-errors', !errs.length, errs.join(' | '));
    } finally { await close(); }
  });

  T.done();
})();
