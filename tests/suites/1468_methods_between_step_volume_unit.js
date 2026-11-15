// Issue #1468: Methods text hardcodes 'mL' for between-step volumes
// Tests that btwSentence, btwShort, manSentence, and rendered Methods text
// respect the run volume unit (e.g. µL vs mL) instead of hardcoding 'mL'.
const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1468_methods_between_step_volume_unit');
  const {p, errs, close} = await open();
  const h = H(p);

  try {
    p.setDefaultTimeout(15000);

    // 1. Direct function calls for µL run: btwSentence, btwShort, manSentence
    await T.t('ul-run-functions', async () => {
      const res = await p.evaluate(() => {
        if (typeof btwSentence !== 'function' || typeof btwShort !== 'function' || typeof manSentence !== 'function') {
          return {btwSentence: '', btwShort: '', manSentence: ''};
        }
        const rUl = {id: 'r1', name: 'IMAC', xu: 'µL', xUnit: 'µL'};
        const bUl = {how: 'conc', vOut: 50, unit: 'µL'};
        const mUl = {id: 'm1', name: 'Conc', man: {kind: 'conc', vol: 50, unit: 'µL'}};
        return {
          btwSentence: btwSentence(bUl, rUl),
          btwShort: btwShort(bUl, rUl),
          manSentence: manSentence(mUl)
        };
      });

      T.check('btwSentence-ul-contains-50-ul', res.btwSentence.includes('50 µL'), `btwSentence: ${res.btwSentence}`);
      T.check('btwSentence-ul-no-50-ml', !res.btwSentence.includes('50 mL') && res.btwSentence.length > 0, `btwSentence: ${res.btwSentence}`);

      T.check('btwShort-ul-contains-50-ul', res.btwShort.includes('50 µL'), `btwShort: ${res.btwShort}`);
      T.check('btwShort-ul-no-50-ml', !res.btwShort.includes('50 mL') && res.btwShort.length > 0, `btwShort: ${res.btwShort}`);

      T.check('manSentence-ul-contains-50-ul', res.manSentence.includes('50 µL'), `manSentence: ${res.manSentence}`);
      T.check('manSentence-ul-no-50-ml', !res.manSentence.includes('50 mL') && res.manSentence.length > 0, `manSentence: ${res.manSentence}`);
    });

    // 2. Direct function calls for mL run: btwSentence, btwShort, manSentence
    await T.t('ml-run-functions', async () => {
      const res = await p.evaluate(() => {
        if (typeof btwSentence !== 'function' || typeof btwShort !== 'function' || typeof manSentence !== 'function') {
          return {btwSentence: '', btwShort: '', manSentence: ''};
        }
        const rMl = {id: 'r1', name: 'IMAC', xu: 'mL', xUnit: 'mL'};
        const bMl = {how: 'conc', vOut: 50, unit: 'mL'};
        const mMl = {id: 'm1', name: 'Conc', man: {kind: 'conc', vol: 50, unit: 'mL'}};
        return {
          btwSentence: btwSentence(bMl, rMl),
          btwShort: btwShort(bMl, rMl),
          manSentence: manSentence(mMl)
        };
      });

      T.check('btwSentence-ml-contains-50-ml', res.btwSentence.includes('50 mL'), `btwSentence: ${res.btwSentence}`);
      T.check('btwShort-ml-contains-50-ml', res.btwShort.includes('50 mL'), `btwShort: ${res.btwShort}`);
      T.check('manSentence-ml-contains-50-ml', res.manSentence.includes('50 mL'), `manSentence: ${res.manSentence}`);
    });

    // 3. UI and DOM: Methods text rendered in #methodsText for µL project
    await T.t('methods-text-dom-ul', async () => {
      const projUl = {
        app: 'HPLC Figure Bench', version: 1,
        opt: {preset: 'column', fs: 9, w: 7, h: 5, wfH: 0.9, tidy13: true, tidy14: true},
        runs: [{
          id: 'r1', name: 'IMAC', inWf: true, xu: 'µL', uvi: 0,
          uvs: [{name: 'UV', yu: 'mAU', xs: [0, 100], ys: [0, 100]}],
          fracs: [], phases: [], integ: []
        }],
        traces: [], gels: [],
        prep: {
          on: true,
          btw: {'r1': {how: 'conc', vOut: 50}},
          manual: [{id: 'm1', kind: 'conc', name: 'Concentration step', vol: 50, inWf: true, unit: 'µL'}]
        }
      };
      await p.click('#homeQuick');
      await h.wait(500);
      await p.setInputFiles('#projFile', {name: 'test_ul.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(projUl))});
      await h.wait(600);
      await h.step('figure');
      await p.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; });
      await h.wait(400);
      const m = await h.methods();

      T.check('methods-dom-ul-contains-50-ul', m.includes('50 µL'), `Methods text: ${m}`);
      T.check('methods-dom-ul-no-50-ml', !m.includes('50 mL'), `Methods text: ${m}`);
    });

    // 4. UI and DOM: Methods text rendered in #methodsText for mL project
    await T.t('methods-text-dom-ml', async () => {
      const projMl = {
        app: 'HPLC Figure Bench', version: 1,
        opt: {preset: 'column', fs: 9, w: 7, h: 5, wfH: 0.9, tidy13: true, tidy14: true},
        runs: [{
          id: 'r1', name: 'IMAC', inWf: true, xu: 'mL', uvi: 0,
          uvs: [{name: 'UV', yu: 'mAU', xs: [0, 100], ys: [0, 100]}],
          fracs: [], phases: [], integ: []
        }],
        traces: [], gels: [],
        prep: {
          on: true,
          btw: {'r1': {how: 'conc', vOut: 50}},
          manual: [{id: 'm1', kind: 'conc', name: 'Concentration step', vol: 50, inWf: true, unit: 'mL'}]
        }
      };
      await p.click('text=All projects').catch(() => {});
      await h.wait(500);
      await p.click('#homeQuick');
      await h.wait(500);
      await p.setInputFiles('#projFile', {name: 'test_ml.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(projMl))});
      await h.wait(600);
      await h.step('figure');
      await p.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; });
      await h.wait(400);
      const m = await h.methods();

      T.check('methods-dom-ml-contains-50-ml', m.includes('50 mL'), `Methods text: ${m}`);
    });

    T.check('no-page-errors', !errs.length, errs.join(' | '));
  } finally {
    await close();
  }
  T.done();
})();
