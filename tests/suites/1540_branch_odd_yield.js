// #1540: unverified-yield warnings (y.odd) in branched workflow captions and Methods text must name the offending step on that branch, not another branch's step.
const {open, H, suite, src, DATA, path} = require('../lib/harness');

(async () => {
  const T = suite('1540_branch_odd_yield');
  await T.t('branch_scoped_odd_yield_warning', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Branch odd yield');
      await h.gb(src('gb'));
      await h.addRun(path.join(DATA, 'science/sec_inject2.csv')); await h.suggest(); // Step 1: SEC (~0.19 mg)
      await h.addRun(src('q')); await h.suggest(); // Step 2 (Branch A): Anion exchange (~1.28 mg, >100%)
      await h.addRun(src('his')); await h.pool('T1-T6'); // Step 3 (Branch B): IMAC (~3.14 mg, >100%)

      const tl = (await h.timeline()).filter(x => x.k.startsWith('run:'));
      const ids = tl.map(x => x.k.slice(4));
      await h.step(tl[2].k);
      await p.selectOption('#ssFrom', ids[0]); // Branch B splits from Step 1
      await h.wait(400);

      await h.step('figure');
      await p.evaluate(() => {
        const el = document.getElementById('o-wfYield');
        if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
      });
      await h.wait(500);

      const meth = await h.methods();
      const res = meth.split('Results: ')[1] || '';
      const aexLine = (res.split('The Anion exchange pool held')[1] || '').split('The IMAC pool held')[0];
      const imacLine = res.split('The IMAC pool held')[1] || '';

      T.check('Branch A (Anion exchange) Methods warning names anion exchange step', /This amount is unverified, because the anion exchange step yield/i.test(aexLine), aexLine || res);
      T.check('Branch B (IMAC) Methods warning names IMAC step (not Branch A anion exchange)', /This amount is unverified, because the imac step yield/i.test(imacLine) && !/anion exchange/i.test(imacLine), imacLine || res);

      const svgAll = (await h.svgTexts()).map(x => x.t).join(' ');
      const imacCap = (svgAll.split(/Final pool \([^)]*IMAC\):/)[1] || '').split(/Final pool/)[0];
      T.check('Branch B (IMAC) SVG yield caption names imac step yield (not anion exchange)', /imac step yield/i.test(imacCap) && !/anion exchange/i.test(imacCap), imacCap || svgAll);
      T.check('no page errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });
  T.done();
})();
