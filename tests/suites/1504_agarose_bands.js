const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1504_agarose_bands');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_gel_band_records_and_plasmid_topology', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose Bands Test', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      // In a sample lane, add two bands
      const addBandBtn = p.locator('#ag-add-band-1');
      T.check('add_band_button_present', await addBandBtn.count() === 1, 'Add band button in sample lane');
      if (!await addBandBtn.count()) return;

      await addBandBtn.click();
      await h.wait(200);
      await addBandBtn.click();
      await h.wait(200);

      // Set both to category Supercoiled plasmid
      const cat0 = p.locator('#ag-band-cat-0');
      const cat1 = p.locator('#ag-band-cat-1');
      T.check('two_bands_present', await cat0.count() === 1 && await cat1.count() === 1, 'Two bands created');

      await cat0.selectOption('Supercoiled plasmid');
      await cat0.dispatchEvent('change');
      await cat1.selectOption('Supercoiled plasmid');
      await cat1.dispatchEvent('change');

      // Verify the app does not auto-assign different sizes to the two bands
      const obs0 = await p.locator('#ag-band-obs-0').inputValue();
      const obs1 = await p.locator('#ag-band-obs-1').inputValue();
      const notDifferentSizes = (obs0 === obs1) || (!obs0 && !obs1);
      T.check('plasmid_bands_not_assigned_different_sizes', notDifferentSizes, `obs0: "${obs0}", obs1: "${obs1}"`);

      // Set one band's expected size to 5000 bp and observed to 4800 bp and verify the difference shows as -200 bp
      const exp0 = p.locator('#ag-band-exp-0');
      await exp0.fill('5000 bp');
      await exp0.dispatchEvent('input');
      await exp0.dispatchEvent('change');

      const obsInput0 = p.locator('#ag-band-obs-0');
      await obsInput0.fill('4800 bp');
      await obsInput0.dispatchEvent('input');
      await obsInput0.dispatchEvent('change');

      const diff0 = await p.locator('#ag-band-diff-0').innerText();
      T.check('difference_shows_minus_200_bp', diff0.trim() === '-200 bp', `diff text: "${diff0}"`);

      // Set the other band's category to Primer dimer and verify it is stored independently
      await cat1.selectOption('Primer dimer');
      await cat1.dispatchEvent('change');

      const cat0Val = await cat0.inputValue();
      const cat1Val = await cat1.inputValue();
      T.check('bands_stored_independently', cat0Val === 'Supercoiled plasmid' && cat1Val === 'Primer dimer', `cat0: ${cat0Val}, cat1: ${cat1Val}`);

      // Set selected for extraction checkbox and notes field
      const extract0 = p.locator('#ag-band-extract-0');
      await extract0.check();
      await extract0.dispatchEvent('change');

      const notes0 = p.locator('#ag-band-notes-0');
      await notes0.fill('Gel extract 4.8 kb supercoiled band');
      await notes0.dispatchEvent('input');
      await notes0.dispatchEvent('change');

      // Check that the selected-for-extraction checkbox and notes field persist after reload
      await h.wait(3000); // allow autosave debounce to flush
      await p.reload();
      await h.wait(1500);

      const card = p.locator('#projList [data-pid]').first();
      await card.click();
      await h.wait(2000);

      await go(h, 'Agarose-gel verification');
      await h.wait(600);

      T.check('extract_checkbox_persists', await p.locator('#ag-band-extract-0').isChecked(), 'selected-for-extraction checkbox persisted');
      T.check('notes_field_persists', (await p.locator('#ag-band-notes-0').inputValue()) === 'Gel extract 4.8 kb supercoiled band', 'notes field persisted');
      T.check('cat0_persists', (await p.locator('#ag-band-cat-0').inputValue()) === 'Supercoiled plasmid', 'band 0 category persisted');
      T.check('cat1_persists', (await p.locator('#ag-band-cat-1').inputValue()) === 'Primer dimer', 'band 1 category persisted');
      T.check('diff_persists', (await p.locator('#ag-band-diff-0').innerText()).trim() === '-200 bp', 'difference persisted');

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
