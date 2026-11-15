const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1505_agarose_metadata');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_gel_level_metadata', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);

      // 1. Open a cloning project and go to the Agarose-gel verification stage
      await h.newProject('Agarose Metadata Test', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(600);

      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      // Verify the metadata form is present
      const pctInput = p.locator('#ag-pct');
      const bufInput = p.locator('#ag-buffer');
      const stainInput = p.locator('#ag-stain');
      const voltInput = p.locator('#ag-voltage');
      const notesInput = p.locator('#ag-notes');
      const brightInput = p.locator('#ag-brightness');
      const brightFlag = p.locator('#ag-adj-brightness');

      T.check('metadata_form_present', await pctInput.count() > 0 && await bufInput.count() > 0 && await notesInput.count() > 0, 'metadata form fields exist');

      // 2. Fill in agarose percentage as 1.5, buffer as TAE 1x, stain as SYBR Safe, voltage as 120, and notes as 'slight smearing in lane 3'
      await pctInput.fill('1.5');
      await pctInput.dispatchEvent('input');
      await pctInput.dispatchEvent('change');

      await bufInput.fill('TAE 1x');
      await bufInput.dispatchEvent('input');
      await bufInput.dispatchEvent('change');

      await stainInput.fill('SYBR Safe');
      await stainInput.dispatchEvent('input');
      await stainInput.dispatchEvent('change');

      await voltInput.fill('120');
      await voltInput.dispatchEvent('input');
      await voltInput.dispatchEvent('change');

      await notesInput.fill('slight smearing in lane 3');
      await notesInput.dispatchEvent('input');
      await notesInput.dispatchEvent('change');

      // Verify the brightness-adjusted flag is set automatically when a brightness adjustment was made in Job 2
      T.check('brightness_flag_initially_unchecked', !(await brightFlag.isChecked()), 'brightness flag unchecked initially');

      await brightInput.fill('120');
      await brightInput.dispatchEvent('input');
      await brightInput.dispatchEvent('change');

      T.check('brightness_flag_set_automatically', await brightFlag.isChecked(), 'brightness flag set automatically after adjustment');

      // 3. Save and reload. Verify all values are restored.
      await h.wait(3000); // allow autosave debounce to flush
      await p.reload();
      await h.wait(1500);

      const card = p.locator('#projList [data-pid]').first();
      await card.click();
      await h.wait(2000);

      await go(h, 'Agarose-gel verification');
      await h.wait(600);

      T.check('pct_restored_1_5', (await p.locator('#ag-pct').inputValue()) === '1.5', 'agarose % restored as 1.5');
      T.check('buffer_restored_tae_1x', (await p.locator('#ag-buffer').inputValue()) === 'TAE 1x', 'buffer restored as TAE 1x');
      T.check('stain_restored_sybr_safe', (await p.locator('#ag-stain').inputValue()) === 'SYBR Safe', 'stain restored as SYBR Safe');
      T.check('voltage_restored_120', (await p.locator('#ag-voltage').inputValue()) === '120', 'voltage restored as 120');
      T.check('notes_restored', (await p.locator('#ag-notes').inputValue()) === 'slight smearing in lane 3', 'notes restored');
      T.check('brightness_flag_restored', await p.locator('#ag-adj-brightness').isChecked(), 'brightness adjusted flag persisted');

      // 4. Change agarose percentage to 2.0 and verify it saves
      const pctInput2 = p.locator('#ag-pct');
      await pctInput2.fill('2.0');
      await pctInput2.dispatchEvent('input');
      await pctInput2.dispatchEvent('change');

      await h.wait(3000); // allow autosave debounce to flush
      await p.reload();
      await h.wait(1500);

      const card2 = p.locator('#projList [data-pid]').first();
      await card2.click();
      await h.wait(2000);

      await go(h, 'Agarose-gel verification');
      await h.wait(600);

      T.check('pct_updated_and_saved_2_0', (await p.locator('#ag-pct').inputValue()) === '2.0', 'agarose % updated to 2.0 and saved');

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
