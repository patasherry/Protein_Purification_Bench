// #1544: buildFig(f, true) must restore FIG_SCREEN in a finally block so screen-only furniture never leaks into #wfFullModal or exports.
const {open, H, suite, src} = require('../lib/harness');

(async () => {
  const T = suite('1544_fig_screen_scope');
  await T.t('wf_full_modal_omits_screen_only_empty_gel_slot', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('FIG_SCREEN scope');
      await h.addRun(src('his'));
      await h.dropFiles(src('gel')); // Run 1 has an SDS-PAGE gel -> anyGel === true
      await h.addRun(src('q'));      // Run 2 has no gel

      await h.step('figure');
      await p.evaluate(() => {
        const el = document.getElementById('o-noGelSlot');
        if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
      });
      await h.wait(600);

      const paperTxt = await p.evaluate(() => [...document.querySelectorAll('#paper svg text')].map(t => t.textContent.trim()).join(' | '));
      T.check('on-screen preview shows empty-gel helper slot', paperTxt.includes('no gel for this step') && paperTxt.includes('(not in exports)'), paperTxt);

      await p.click('#wfFullView');
      await h.wait(400);
      const modalTxt = await p.evaluate(() => [...document.querySelectorAll('#wfFullModal svg text')].map(t => t.textContent.trim()).join(' | '));
      T.check('full-chromatogram modal omits screen-only empty-gel slot', !modalTxt.includes('no gel for this step') && !modalTxt.includes('(not in exports)'), modalTxt);
      await p.click('#wfFullModalClose');
      await h.wait(150);

      const expSvg = await h.exportSvg();
      T.check('exported SVG omits screen-only empty-gel slot', !expSvg.includes('no gel for this step'), 'saved SVG check');
      T.check('no page errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });
  T.done();
})();
