const {open, H, suite, src} = require('../lib/harness');

(async () => {
  const T = suite('1501_agarose_adjust');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };
  const pixels = p => p.$eval('canvas[data-ag-preview]', c => c.toDataURL('image/png'));

  await T.t('agarose_gel_adjustments_are_reversible', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose adjustments', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await p.setInputFiles('#clonePanel .cl-gel-file', src('gel'));
      await p.waitForFunction(() => { const c = document.querySelector('canvas[data-ag-preview]'); return c && c.width > 1 && c.height > 1; });
      await h.wait(150);
      const original = await pixels(p);

      const rotation = p.locator('#ag-rotation');
      await rotation.fill('15');
      await rotation.dispatchEvent('input');
      await p.waitForFunction(before => { const c = document.querySelector('canvas[data-ag-preview]'); return c && c.toDataURL('image/png') !== before; }, original);
      const rotated = await pixels(p);
      T.check('rotation_changes_rendered_canvas', rotated !== original, '15 degree rotation changes canvas pixels');

      await cl(p).locator('[data-cl=gel-adjust-reset]').click();
      await p.waitForFunction(before => { const c = document.querySelector('canvas[data-ag-preview]'); return c && c.toDataURL('image/png') === before; }, original);
      T.check('rotation_reset_is_pixel_exact', (await pixels(p)) === original, 'reset canvas equals original');

      await p.locator('#ag-brightness').fill('120');
      await p.locator('#ag-brightness').dispatchEvent('input');
      await p.locator('#ag-contrast').fill('80');
      await p.locator('#ag-contrast').dispatchEvent('input');
      await p.waitForFunction(before => { const c = document.querySelector('canvas[data-ag-preview]'); return c && c.toDataURL('image/png') !== before; }, original);
      await cl(p).locator('[data-cl=gel-adjust-reset]').click();
      await p.waitForFunction(before => { const c = document.querySelector('canvas[data-ag-preview]'); return c && c.toDataURL('image/png') === before; }, original);
      T.check('levels_reset_is_pixel_exact', (await pixels(p)) === original, 'brightness and contrast reset canvas equals original');
      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
