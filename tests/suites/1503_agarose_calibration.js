const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1503_agarose_calibration');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_ladder_calibration_estimates_sample_bands', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose calibration', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');

      const preset = p.locator('#ag-ladder-preset');
      T.check('saved_ladder_picker_present', await preset.count() === 1, 'saved ladder product selector');
      if (!await preset.count()) return;
      await preset.selectOption('neb100');
      await preset.dispatchEvent('change');

      const sampleMigration = p.locator('#ag-lane-migration-1');
      T.check('sample_band_migration_present', await sampleMigration.count() === 1, 'sample migration field');
      if (!await sampleMigration.count()) return;
      await sampleMigration.fill('30');
      await sampleMigration.dispatchEvent('change');

      const sizes = [1000, 800, 600, 400];
      const migrations = [10, 20, 30, 40];
      for (let i = 0; i < sizes.length; i++) {
        const b = p.locator(`[data-cl="ag-pick-band"][data-size="${sizes[i]}"]`);
        T.check('visible_ladder_band_' + sizes[i], await b.count() === 1, 'clickable ladder band');
        if (!await b.count()) return;
        await b.click();
        const y = p.locator('#ag-cal-y-' + i);
        await y.fill(String(migrations[i]));
        await y.dispatchEvent('change');
      }

      const status = p.locator('#ag-cal-status');
      const statusText = await status.innerText();
      T.check('calibration_line_reported', /Migration\s*=\s*[-+0-9.]+.*log10\(bp\)\s*\+\s*[-+0-9.]+/.test(statusText), statusText);

      const estimate = await p.locator('#ag-estimate-1').innerText();
      T.check('sample_size_estimated', /Estimated:\s*\d+\s*bp/.test(estimate), estimate);

      while (await p.locator('[data-cl="ag-remove-cal"]').count() > 1) {
        await p.locator('[data-cl="ag-remove-cal"]').last().click();
      }
      const noEstimate = await status.innerText();
      T.check('one_point_blocks_estimation', /cannot be estimated/i.test(noEstimate), noEstimate);
      T.check('sample_number_hidden_without_calibration', !/\d+\s*bp/.test(await p.locator('#ag-estimate-1').innerText()), await p.locator('#ag-estimate-1').innerText());
      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
