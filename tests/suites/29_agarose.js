// Consolidated agarose gel suite: upload & restore, dark-mode lane labels, reversible image adjustments,
// lane editor & publication view, ladder calibration, band records & topology, metadata, publication SVG figure,
// and high-res IndexedDB blob offloading / pending-edit recovery.
const os = require('os');
const {open, H, suite, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('29_agarose');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  const dropBase64Png = async (p, selector, b64, fileName) => {
    await p.evaluate(([sel, b, name]) => {
      const u = Uint8Array.from(atob(b), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([u], name, {type: 'image/png'}));
      const el = document.querySelector(sel);
      if (!el) throw new Error('element not found: ' + sel);
      el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
      el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
    }, [selector, b64, fileName]);
  };

  await T.t('upload_restore_darkmode_lanes_and_metadata_persistence', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const png1 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2Nk+M/wn4GBgYGRAQQAAP//AwA6EQbO1s4ZtwAAAABJRU5ErkJggg==';
      const png2 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVQIW2Nk+M/wnwEJMDHAAQYGAAB+Dgb+y4e1wQAAAABJRU5ErkJggg==';

      await h.newProject('Agarose synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      // 1. Upload & restore original (#1500)
      const zone = cl(p).locator('.cl-gel-upload');
      T.check('upload_zone_present', await zone.count() > 0, 'upload zone in stage panel');

      await dropBase64Png(p, '#clonePanel .cl-gel-upload', png1, 'test_gel_1.png');
      await h.wait(500);

      const img1 = cl(p).locator('.cl-gel-img');
      T.check('image_appears_in_stage_panel', await img1.count() > 0 && !!(await img1.getAttribute('src')), 'image element present');
      const name1 = (await cl(p).locator('.cl-gel-name').count()) > 0 ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('first_image_displayed', name1.includes('test_gel_1.png'), name1);

      await dropBase64Png(p, '#clonePanel .cl-gel-upload', png2, 'test_gel_2.png');
      await h.wait(500);
      const name2 = (await cl(p).locator('.cl-gel-name').count()) > 0 ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('second_image_displayed', name2.includes('test_gel_2.png'), name2);

      const restoreBtn = cl(p).locator('button', {hasText: 'Restore original'});
      T.check('restore_control_present', await restoreBtn.count() > 0, 'Restore original control present');
      await restoreBtn.click();
      await h.wait(500);
      const nameRestored = (await cl(p).locator('.cl-gel-name').count()) > 0 ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('first_image_recovered', nameRestored.includes('test_gel_1.png'), nameRestored);

      // 2. Dark-mode lane label text-shadow (#1500)
      await p.emulateMedia({colorScheme: 'light'});
      await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      await h.wait(80);
      const lightShadow = await p.$eval('.ag-lane-editor .ag-lane-label', el => getComputedStyle(el).textShadow);

      await p.emulateMedia({colorScheme: 'dark'});
      await h.wait(80);
      const mediaDarkShadow = await p.$eval('.ag-lane-editor .ag-lane-label', el => getComputedStyle(el).textShadow);

      await p.emulateMedia({colorScheme: 'light'});
      await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await h.wait(80);
      const attrDarkShadow = await p.$eval('.ag-lane-editor .ag-lane-label', el => getComputedStyle(el).textShadow);
      await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));

      T.check('lane_label_dark_no_white_halo',
        lightShadow.includes('rgb(255, 255, 255)') && !mediaDarkShadow.includes('rgb(255, 255, 255)') && !attrDarkShadow.includes('rgb(255, 255, 255)'),
        `light="${lightShadow}" mediaDark="${mediaDarkShadow}" attrDark="${attrDarkShadow}"`);

      // 3. Lane editor & publication view (#1502)
      const auto = p.locator('#ag-auto-lanes');
      T.check('editor/auto-detect-control', await auto.count() === 1, 'Auto-detect lanes button missing');
      if (await auto.count()) { await auto.click(); await h.wait(400); }
      const zones = p.locator('#ag-lane-editor .ag-lane-zone');
      T.check('editor/detects-at-least-two-lanes', await zones.count() >= 2, String(await zones.count()));

      if (await zones.count() >= 3) {
        await p.selectOption('#ag-lane-type-0', 'DNA ladder'); await p.fill('#ag-lane-label-0', 'M'); await p.dispatchEvent('#ag-lane-label-0', 'change');
        await p.selectOption('#ag-lane-type-1', 'Sample'); await p.fill('#ag-lane-label-1', 'PCR-1'); await p.dispatchEvent('#ag-lane-label-1', 'change');
        await p.selectOption('#ag-lane-type-2', 'No-template control'); await p.fill('#ag-lane-label-2', 'NTC'); await p.dispatchEvent('#ag-lane-label-2', 'change');
      }
      T.check('editor/labels-accept-lane-types',
        await p.inputValue('#ag-lane-label-0') === 'M' && await p.inputValue('#ag-lane-label-1') === 'PCR-1' && await p.inputValue('#ag-lane-type-2') === 'No-template control',
        await cl(p).innerText());

      await p.click('#ag-add-lane'); await h.wait(200);
      const editCount = await zones.count();
      const pub = p.locator('#ag-publication-view');
      T.check('editor/publication-control', await pub.count() === 1, 'Publication view button missing');
      if (await pub.count()) { await pub.click(); await h.wait(200); }
      const publication = await p.evaluate(() => {
        const e = document.querySelector('#ag-lane-editor');
        return {pub: !!(e && e.classList.contains('pub')), shade: e && e.querySelector('.ag-lane-shade') ? getComputedStyle(e.querySelector('.ag-lane-shade')).display : '', labels: e ? [...e.querySelectorAll('.ag-lane-label')].map(x => x.textContent.trim()) : []};
      });
      T.check('editor/publication-hides-editing-shading', publication.pub && publication.shade === 'none' && publication.labels.includes('M') && publication.labels.includes('PCR-1'), JSON.stringify(publication));

      if (await pub.count()) { await pub.click(); await h.wait(200); }
      const retained = await p.evaluate(() => ({zones: document.querySelectorAll('#ag-lane-editor .ag-lane-zone').length, last: (document.querySelectorAll('#ag-lane-list [data-lane-k="label"]')[document.querySelectorAll('#ag-lane-list [data-lane-k="label"]').length - 1] || {}).value || ''}));
      T.check('editor/unassigned-lane-remains-visible', retained.zones === editCount && retained.last === '', JSON.stringify({editCount, retained}));

      // 4. Gel-level metadata & automatic brightness flag (#1505)
      const pctInput = p.locator('#ag-pct');
      const bufInput = p.locator('#ag-buffer');
      const stainInput = p.locator('#ag-stain');
      const voltInput = p.locator('#ag-voltage');
      const notesInput = p.locator('#ag-notes');
      const brightInput = p.locator('#ag-brightness');
      const brightFlag = p.locator('#ag-adj-brightness');

      T.check('metadata_form_present', await pctInput.count() > 0 && await bufInput.count() > 0 && await notesInput.count() > 0, 'metadata form fields exist');
      for (const [loc, val] of [[pctInput, '1.5'], [bufInput, 'TAE 1x'], [stainInput, 'SYBR Safe'], [voltInput, '120'], [notesInput, 'slight smearing in lane 3']]) {
        await loc.fill(val);
        await loc.dispatchEvent('input');
        await loc.dispatchEvent('change');
      }

      T.check('brightness_flag_initially_unchecked', !(await brightFlag.isChecked()), 'brightness flag unchecked initially');
      await brightInput.fill('120');
      await brightInput.dispatchEvent('input');
      await brightInput.dispatchEvent('change');
      T.check('brightness_flag_set_automatically', await brightFlag.isChecked(), 'brightness flag set automatically after adjustment');

      // 5. Single autosave flush + reload verifying both image & metadata persistence
      await h.wait(2800);
      await p.reload();
      await p.locator('#projList [data-pid]').first().waitFor({state: 'visible', timeout: 10000});
      await p.locator('#projList [data-pid]').first().click();
      await h.wait(1200);

      const stageRows = await rows(h);
      T.check('stage_present_after_reload', stageRows.some(x => x.t === 'Agarose-gel verification'), 'stage present in timeline');
      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      const imgReloaded = cl(p).locator('.cl-gel-img');
      T.check('image_present_after_reload', await imgReloaded.count() > 0 && !!(await imgReloaded.getAttribute('src')), 'image present in stage panel after reload');
      T.check('pct_restored_1_5', (await p.locator('#ag-pct').inputValue()) === '1.5', 'agarose % restored as 1.5');
      T.check('buffer_restored_tae_1x', (await p.locator('#ag-buffer').inputValue()) === 'TAE 1x', 'buffer restored as TAE 1x');
      T.check('stain_restored_sybr_safe', (await p.locator('#ag-stain').inputValue()) === 'SYBR Safe', 'stain restored as SYBR Safe');
      T.check('voltage_restored_120', (await p.locator('#ag-voltage').inputValue()) === '120', 'voltage restored as 120');
      T.check('notes_restored', (await p.locator('#ag-notes').inputValue()) === 'slight smearing in lane 3', 'notes restored');
      T.check('brightness_flag_restored', await p.locator('#ag-adj-brightness').isChecked(), 'brightness adjusted flag persisted');

      T.check('upload_lanes_meta_no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('reversible_image_adjustments_and_reset', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose adjust synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      await p.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 100; const x = c.getContext('2d');
        x.fillStyle = '#101010'; x.fillRect(0, 0, 160, 100); x.fillStyle = '#e0e0e0';
        [12, 24, 36, 52, 70].forEach(y => x.fillRect(10, y, 24, 3));
        x.fillStyle = '#b0b0b0'; x.fillRect(60, 30, 26, 5); x.fillStyle = '#707070'; x.fillRect(110, 64, 26, 4);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], 'synthetic_gel.png', {type: 'image/png'});
        const dt = new DataTransfer(); dt.items.add(file);
        const el = document.querySelector('#clonePanel .cl-gel-upload');
        el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
        el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      });
      await h.wait(700);

      const view = () => p.evaluate(() => { const c = document.querySelector('#clonePanel #ag-canvas'); if (!c || !c.width) return null;
        return {w: c.width, h: c.height, d: Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).join(',')}; });
      const orig = await p.evaluate(async () => { const im = document.querySelector('#clonePanel .cl-gel-img'); if (!im) return null; await im.decode().catch(() => {});
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        return {w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data).join(',')}; });
      const same = (a, b) => !!(a && b && a.w === b.w && a.h === b.h && a.d === b.d);
      T.check('upload_decoded', !!orig && orig.w === 160 && orig.h === 100, orig ? `${orig.w}x${orig.h}` : 'no image');

      const has = async sel => (await p.locator(sel).count()) > 0;
      const tools = await has('#clonePanel #ag-rot') && await has('#clonePanel #ag-bright') && await has('#clonePanel #ag-contrast') && await has('#clonePanel #ag-reset') && await has('#clonePanel #ag-crop');
      T.check('adjust_toolbar_present', tools, 'rotation, brightness, contrast, crop and reset controls above the gel image');
      const v0 = await view();
      T.check('view_matches_upload_before_edits', same(v0, orig), v0 ? `${v0.w}x${v0.h}` : 'no gel view canvas');

      const set = async (sel, val) => { if (!(await has(sel))) return false; await p.locator(sel).fill(String(val)); await h.wait(300); return true; };
      const reset = async () => { if (!(await has('#clonePanel #ag-reset'))) return false; await p.locator('#clonePanel #ag-reset').click(); await h.wait(400); return true; };

      const srcOf = async () => (await p.locator('#clonePanel .cl-gel-img').count()) ? await p.locator('#clonePanel .cl-gel-img').getAttribute('src') : '';
      const src0 = await srcOf();
      const rotOk = await set('#clonePanel #ag-rot', 15), v1 = await view(), src1 = await srcOf();
      T.check('rotate_15_changes_view', rotOk && !!v1 && !same(v1, orig) && v1.w === 180 && v1.h === 138, v1 ? `${v1.w}x${v1.h}` : 'no view');
      if (await has('#clonePanel #ag-rot-up')) { await p.locator('#clonePanel #ag-rot-up').click(); await h.wait(300); }
      const rn = await has('#clonePanel #ag-rot-n') ? await p.locator('#clonePanel #ag-rot-n').inputValue() : '';
      T.check('fine_stepper_adds_1_degree', rn === '16', `rotation box reads ${rn}`);
      const r1 = await reset(), v2 = await view();
      T.check('reset_after_rotation_matches_original', r1 && same(v2, orig), v2 ? `${v2.w}x${v2.h}` : 'no view');
      T.check('stored_image_not_overwritten_by_rotation', !!src0 && src1 === src0, 'stored image data is the same before and after rotating');

      const bOk = await set('#clonePanel #ag-bright', 120), cOk = await set('#clonePanel #ag-contrast', 80), v3 = await view();
      T.check('brightness_contrast_change_view', bOk && cOk && !!v3 && v3.w === 160 && v3.h === 100 && !same(v3, orig), v3 ? `${v3.w}x${v3.h}` : 'no view');
      const r2 = await reset(), v4 = await view();
      T.check('reset_after_brightness_contrast_matches_original', r2 && same(v4, orig), v4 ? `${v4.w}x${v4.h}` : 'no view');
      const bv = await has('#clonePanel #ag-bright') ? await p.locator('#clonePanel #ag-bright').inputValue() : '';
      const cv = await has('#clonePanel #ag-contrast') ? await p.locator('#clonePanel #ag-contrast').inputValue() : '';
      T.check('reset_returns_sliders_to_100', bv === '100' && cv === '100', `brightness ${bv}, contrast ${cv}`);

      let cropW = 0, cropH = 0;
      if (await has('#clonePanel #ag-crop')) {
        await p.locator('#clonePanel #ag-crop').click(); await h.wait(300);
        const b = await p.locator('#clonePanel #ag-canvas').boundingBox();
        if (b) { await p.mouse.move(b.x + 1, b.y + 1); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 4}); await p.mouse.up(); await h.wait(400); }
        const vc = await view(); if (vc) { cropW = vc.w; cropH = vc.h; }
      }
      T.check('crop_drag_shrinks_view', cropW > 60 && cropW < 100 && cropH > 30 && cropH < 60, `${cropW}x${cropH}`);
      const r3 = await reset(), v5 = await view();
      T.check('reset_after_crop_matches_original', r3 && same(v5, orig), v5 ? `${v5.w}x${v5.h}` : 'no view');

      T.check('adjust_no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('ladder_calibration_and_band_records', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose Calibration & Bands', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      // 1. Ladder calibration (#1503)
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

      // Clear remaining single point so band calibration starts cleanly
      while (await p.locator('[data-cl="ag-remove-cal"]').count() > 0) {
        await p.locator('[data-cl="ag-remove-cal"]').last().click();
      }

      // 2. Band records, plasmid topology, lane split/merge, and reload persistence (#1504 + #1505 pct update)
      await p.locator('[data-cl="ag-pick-band"][data-size="1000"]').click();
      await p.locator('#ag-cal-y-0').fill('10');
      await p.locator('#ag-cal-y-0').dispatchEvent('change');
      await p.locator('[data-cl="ag-pick-band"][data-size="500"]').click();
      await p.locator('#ag-cal-y-1').fill('20');
      await p.locator('#ag-cal-y-1').dispatchEvent('change');
      await sampleMigration.fill('15');
      await sampleMigration.dispatchEvent('change');

      const addBandBtn = p.locator('#ag-add-band-1');
      T.check('add_band_button_present', await addBandBtn.count() === 1, 'Add band button in sample lane');
      if (!await addBandBtn.count()) return;

      await addBandBtn.click();
      await h.wait(150);
      T.check('calibrated_band_size_estimated', (await p.locator('#ag-band-obs-0').inputValue()) === '707 bp', `obs0 after calibration: "${await p.locator('#ag-band-obs-0').inputValue()}"`);

      await addBandBtn.click();
      await h.wait(150);

      const cat0 = p.locator('#ag-band-cat-0');
      const cat1 = p.locator('#ag-band-cat-1');
      T.check('two_bands_present', await cat0.count() === 1 && await cat1.count() === 1, 'Two bands created');

      await cat0.selectOption('Supercoiled plasmid');
      await cat0.dispatchEvent('change');
      await cat1.selectOption('Supercoiled plasmid');
      await cat1.dispatchEvent('change');

      const obs0 = await p.locator('#ag-band-obs-0').inputValue();
      const obs1 = await p.locator('#ag-band-obs-1').inputValue();
      T.check('plasmid_bands_not_assigned_different_sizes', !obs0 && !obs1, `obs0: "${obs0}", obs1: "${obs1}"`);

      await p.locator('[data-cl="split-ag-lane"][data-lane-idx="0"]').click();
      await h.wait(150);
      T.check('lane_split_reindexes_bands', (await p.locator('#ag-band-lane-0').inputValue()) === '2', `band 0 lane after split: ${await p.locator('#ag-band-lane-0').inputValue()}`);
      await p.locator('[data-cl="merge-ag-lane"][data-lane-idx="0"]').click();
      await h.wait(150);

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

      await cat1.selectOption('Primer dimer');
      await cat1.dispatchEvent('change');
      T.check('bands_stored_independently', (await cat0.inputValue()) === 'Supercoiled plasmid' && (await cat1.inputValue()) === 'Primer dimer',
        `cat0: ${await cat0.inputValue()}, cat1: ${await cat1.inputValue()}`);

      await p.locator('#ag-band-extract-0').check();
      await p.locator('#ag-band-extract-0').dispatchEvent('change');
      await p.locator('#ag-band-notes-0').fill('Gel extract 4.8 kb supercoiled band');
      await p.locator('#ag-band-notes-0').dispatchEvent('input');
      await p.locator('#ag-band-notes-0').dispatchEvent('change');

      // Also verify updating agarose % to 2.0 persists across reload (#1505)
      await p.locator('#ag-pct').fill('2.0');
      await p.locator('#ag-pct').dispatchEvent('input');
      await p.locator('#ag-pct').dispatchEvent('change');

      await h.wait(2800);
      await p.reload();
      await p.locator('#projList [data-pid]').first().waitFor({state: 'visible', timeout: 10000});
      await p.locator('#projList [data-pid]').first().click();
      await h.wait(1200);
      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      T.check('extract_checkbox_persists', await p.locator('#ag-band-extract-0').isChecked(), 'selected-for-extraction checkbox persisted');
      T.check('notes_field_persists', (await p.locator('#ag-band-notes-0').inputValue()) === 'Gel extract 4.8 kb supercoiled band', 'notes field persisted');
      T.check('cat0_persists', (await p.locator('#ag-band-cat-0').inputValue()) === 'Supercoiled plasmid', 'band 0 category persisted');
      T.check('cat1_persists', (await p.locator('#ag-band-cat-1').inputValue()) === 'Primer dimer', 'band 1 category persisted');
      T.check('diff_persists', (await p.locator('#ag-band-diff-0').innerText()).trim() === '-200 bp', 'difference persisted');
      T.check('pct_updated_and_saved_2_0', (await p.locator('#ag-pct').inputValue()) === '2.0', 'agarose % updated to 2.0 and saved');

      T.check('cal_bands_no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('agarose_gel_publication_figure', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose Figure Test', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      for (const [sel, val] of [['#ag-ladder-product', '1 kb ladder'], ['#ag-pct', '1%'], ['#ag-buffer', 'TAE 1x'], ['#ag-voltage', '100 V']]) {
        const loc = p.locator(sel);
        if (await loc.count() > 0) { await loc.fill(val); await loc.dispatchEvent('change'); }
      }
      await p.locator('#ag-lane-label-0').fill('M'); await p.locator('#ag-lane-label-0').dispatchEvent('change');
      await p.locator('#ag-lane-type-0').selectOption('DNA ladder'); await p.locator('#ag-lane-type-0').dispatchEvent('change');
      await p.locator('#ag-lane-label-1').fill('PCR-1'); await p.locator('#ag-lane-label-1').dispatchEvent('change');
      await p.locator('#ag-lane-type-1').selectOption('Sample'); await p.locator('#ag-lane-type-1').dispatchEvent('change');
      await p.locator('#ag-lane-exp-1').fill('1200 bp'); await p.locator('#ag-lane-exp-1').dispatchEvent('change');
      await p.locator('#ag-lane-label-2').fill('NTC'); await p.locator('#ag-lane-label-2').dispatchEvent('change');
      await p.locator('#ag-lane-type-2').selectOption('No-template control'); await p.locator('#ag-lane-type-2').dispatchEvent('change');

      const genBtn = p.locator('#cl-gen-ag-fig');
      T.check('generate_button_present', await genBtn.count() > 0, 'Generate figure button exists');
      if (await genBtn.count() > 0) { await genBtn.click(); await h.wait(500); }

      const exportedSvg = await h.exportSvg();
      const boxes = await h.svgBoxes(exportedSvg);
      const textStrings = boxes.texts.map(x => x.t);

      T.check('has_lane_m', textStrings.some(t => t.trim() === 'M'), 'contains text M');
      T.check('has_lane_pcr1', textStrings.some(t => t.trim() === 'PCR-1'), 'contains text PCR-1');
      T.check('has_lane_ntc', textStrings.some(t => t.trim() === 'NTC'), 'contains text NTC');

      const ladderSizes = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      T.check('has_ladder_sizes_100_to_1000', ladderSizes.every(sz => textStrings.some(t => t.trim() === String(sz))), 'contains ladder sizes 100 through 1000');
      T.check('has_expected_product_arrow_label', exportedSvg.includes('marker-end=') && textStrings.some(t => t.includes('Expected product: 1.2 kb')), 'contains arrow with Expected product: 1.2 kb');

      T.check('legend_lane_contents', textStrings.some(t => /Lane contents/i.test(t) || (/Lane 1/i.test(t) && /Lane 2/i.test(t))), 'legend lists lane contents');
      T.check('legend_ladder_product', textStrings.some(t => /1 kb ladder/i.test(t)), 'legend lists ladder product');
      T.check('legend_agarose_pct', textStrings.some(t => /1%/i.test(t) || /agarose/i.test(t)), 'legend lists agarose %');
      T.check('legend_buffer', textStrings.some(t => /TAE/i.test(t)), 'legend lists buffer');
      T.check('legend_voltage', textStrings.some(t => /100\s*V/i.test(t)), 'legend lists voltage');

      const is600Dpi = exportedSvg.includes('data-dpi="600"') || (await p.$eval('#o-dpi', e => +e.value || 600) === 600);
      T.check('figure_is_600_dpi', is600Dpi, 'figure is 600 dpi');
      const usesArial = exportedSvg.includes('Arial') || (await p.$eval('#paper svg', e => getComputedStyle(e).fontFamily.includes('Arial')));
      T.check('figure_uses_arial', usesArial, 'figure uses Arial');
      T.check('no_clipped_text', boxes.clipped.length === 0, 'clipped: ' + boxes.clipped.join(' | '));

      // #1570 catalog number & custom ladder handling
      T.check('untouched_has_n3232s', exportedSvg.includes('N3232S'), 'untouched agarose gel shows N3232S');
      await p.locator('#ag-ladder-preset').selectOption('custom');
      await p.locator('#ag-ladder-preset').dispatchEvent('change');
      await genBtn.click(); await h.wait(350);
      const svgCustom = await h.exportSvg();
      T.check('custom_ladder_omits_n3232s', !svgCustom.includes('N3232S'), 'switching to custom ladder omits N3232S');

      const ladderCatInput = p.locator('#ag-ladder-cat');
      if (await ladderCatInput.count() > 0) {
        await ladderCatInput.fill('N3231S'); await ladderCatInput.dispatchEvent('change');
        await genBtn.click(); await h.wait(300);
        T.check('explicit_cat_rendered', (await h.exportSvg()).includes('N3231S'), 'explicit catalog number rendered');

        await ladderCatInput.fill(''); await ladderCatInput.dispatchEvent('change');
        await genBtn.click(); await h.wait(300);
        const svgBlankCat = await h.exportSvg();
        T.check('blank_ladder_cat_omitted', !svgBlankCat.includes('N3231S') && !svgBlankCat.includes('N3232S'), 'blanking catalog number omits it from figure');
      }

      // #1570 brightened gel image & Disclosures
      await p.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 80; c.height = 60; const x = c.getContext('2d');
        x.fillStyle = 'rgb(100,100,100)'; x.fillRect(0, 0, 80, 60);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], 'solid_gray.png', {type: 'image/png'});
        const dt = new DataTransfer(); dt.items.add(file);
        const el = document.querySelector('#clonePanel .cl-gel-upload');
        el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
        el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      });
      await h.wait(500);

      if (await p.locator('#ag-bright').count() > 0) {
        await p.locator('#ag-bright').fill('140');
        await p.locator('#ag-bright').dispatchEvent('change');
      }
      await p.locator('#ag-adj-brightness').check(); await p.locator('#ag-adj-brightness').dispatchEvent('change');
      await p.locator('#ag-lanes-adjusted').check(); await p.locator('#ag-lanes-adjusted').dispatchEvent('change');
      await genBtn.click(); await h.wait(500);

      const adjSvg = await h.exportSvg();
      const adjBoxes = await h.svgBoxes(adjSvg);
      const pixelVal = await p.evaluate(async svg => {
        const m = svg.match(/<image[^>]+(?:href|xlink:href)="([^"]+)"/);
        if (!m) return 0;
        const im = new Image();
        await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = m[1]; });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[0];
      }, adjSvg);

      T.check('pixel_brightened_over_120', pixelVal > 120, `brightened pixel value is ${pixelVal} (> 120)`);
      T.check('disclosures_present', adjBoxes.texts.some(x => x.t.includes('Disclosures:')), 'Disclosures: appears in figure');
      T.check('no_clipped_text_disclosures', adjBoxes.clipped.length === 0, 'no clipped text with disclosures: ' + adjBoxes.clipped.join(' | '));

      // #1704: 8-lane gel with duplicate (1200, 1200 bp) and closely spaced distinct (2100..2900 bp) expected products
      while ((await p.locator('#ag-lane-list [data-lane-k="label"]').count()) < 8) {
        await p.click('#ag-add-lane');
        await h.wait(80);
      }
      const laneSpec = [
        ['M', 'DNA ladder', ''],
        ['PCR-1', 'Sample', '1200 bp'],
        ['PCR-2', 'Sample', '1200 bp'],
        ['PCR-3', 'Sample', '2100 bp'],
        ['PCR-4', 'Sample', '2300 bp'],
        ['PCR-5', 'Sample', '2500 bp'],
        ['PCR-6', 'Sample', '2700 bp'],
        ['PCR-7', 'Sample', '2900 bp']
      ];
      for (let i = 0; i < laneSpec.length; i++) {
        const [lbl, tp, exp] = laneSpec[i];
        await p.locator(`#ag-lane-label-${i}`).fill(lbl); await p.locator(`#ag-lane-label-${i}`).dispatchEvent('change');
        await p.locator(`#ag-lane-type-${i}`).selectOption(tp); await p.locator(`#ag-lane-type-${i}`).dispatchEvent('change');
        const expLoc = p.locator(`#ag-lane-exp-${i}`);
        if (await expLoc.count() > 0) { await expLoc.fill(exp); await expLoc.dispatchEvent('change'); }
      }
      await genBtn.click(); await h.wait(500);
      const svg8 = await h.exportSvg();
      const boxes8 = await h.svgBoxes(svg8);
      const pairs8 = [];
      for (let i = 0; i < boxes8.texts.length; i++) {
        for (let j = i + 1; j < boxes8.texts.length; j++) {
          const a = boxes8.texts[i], b = boxes8.texts[j];
          const iw = Math.min(a.right, b.right) - Math.max(a.x, b.x);
          const ih = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          if (iw > 0 && ih > 0) pairs8.push(`${a.t.trim()} × ${b.t.trim()} (${iw.toFixed(1)}x${ih.toFixed(1)})`);
        }
      }
      T.check('eight_lane_width_bounded', boxes8.root.w <= 9.5 * 96, `root.w=${boxes8.root.w.toFixed(1)}px (${(boxes8.root.w / 96).toFixed(2)} in)`);
      T.check('eight_lane_no_clipped_text', boxes8.clipped.length === 0, 'clipped: ' + boxes8.clipped.join(' | '));
      T.check('eight_lane_zero_text_overlaps', pairs8.length === 0, `overlaps (${pairs8.length}): ${pairs8.slice(0, 6).join('; ')}`);
      const callout12 = boxes8.texts.filter(x => x.t.trim() === 'Expected product: 1.2 kb');
      T.check('eight_lane_merges_duplicate_and_keeps_distinct', callout12.length === 1 && ['2.1', '2.3', '2.5', '2.7', '2.9'].every(kb => boxes8.texts.some(x => x.t.trim() === `Expected product: ${kb} kb`)), `1.2kb count=${callout12.length}`);

      T.check('figure_no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('high_res_agarose_gel_blob_offload_and_pending_reload', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(20000);
      await h.newProject('Agarose quota', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      // Synthesize an incompressible 1100x1100 noisy gel PNG (~3.6 MB binary; image + origImage > 5 MB localStorage quota)
      await p.evaluate(async () => {
        const cv = document.createElement('canvas');
        cv.width = 1100; cv.height = 1100;
        const ctx = cv.getContext('2d'), img = ctx.createImageData(1100, 1100), d = img.data;
        let x = 0x12345678;
        for (let i = 0; i < d.length; i += 4) {
          x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
          d[i] = x & 255; d[i + 1] = (x >>> 8) & 255; d[i + 2] = (x >>> 16) & 255; d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
        const file = new File([blob], 'geldoc_hires.png', {type: 'image/png'});
        const dt = new DataTransfer();
        dt.items.add(file);
        const el = document.querySelector('#clonePanel .cl-gel-upload');
        el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
        el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      });

      await p.waitForFunction(() => {
        const img = document.querySelector('#clonePanel .cl-gel-img');
        return img && (img.getAttribute('src') || '').startsWith('data:image/');
      });
      await h.wait(3500);

      const projJsonBytes = await p.evaluate(async () => {
        const db = await new Promise((res, rej) => { const q = indexedDB.open('hfb-projects', 2); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        const all = await new Promise((res, rej) => { const tx = db.transaction('projects', 'readonly'), q = tx.objectStore('projects').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        db.close();
        return all[0] && all[0].data ? all[0].data.length : -1;
      });
      T.check('IndexedDB project JSON offloads agarose gel base64 to blobs (< 200 KB)', projJsonBytes > 0 && projJsonBytes < 200000, `project data length = ${projJsonBytes}`);

      // Immediate reload before 2500ms queueSave debounce so recovery relies on writePending()
      await p.fill('#ag-pct', '1.8');
      await p.locator('#ag-pct').evaluate(el => el.blur());
      await p.fill('#ag-notes', 'Clean 1.2 kb band');
      await p.reload();
      await p.locator('#projList [data-pid]').first().waitFor({state: 'visible', timeout: 10000});
      await p.locator('#projList [data-pid]').first().click();
      await h.wait(1400);
      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      const pctAfter = await p.locator('#ag-pct').inputValue();
      const notesAfter = await p.locator('#ag-notes').inputValue();
      const srcAfter = await cl(p).locator('.cl-gel-img').getAttribute('src') || '';

      T.check('unsaved agarose % edit survived sudden reload with high-res gel', pctAfter === '1.8', `got pct="${pctAfter}"`);
      T.check('unsaved agarose notes survived sudden reload with high-res gel', notesAfter === 'Clean 1.2 kb band', `got notes="${notesAfter}"`);
      T.check('high-res agarose gel image restored from blob after pending recovery', srcAfter.startsWith('data:image/png;base64,') && srcAfter.length > 1000000, `src length=${srcAfter.length}`);
      T.check('blob_pending_no_page_errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('offline_16bit_tiff_agarose_upload', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.context().route('https://cdnjs.cloudflare.com/**', r => r.abort('internetdisconnected'));
      await p.context().route('https://cdn.jsdelivr.net/**', r => r.abort('internetdisconnected'));

      await h.newProject('Agarose Offline TIFF', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(450);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      const w = 240, hPx = 280, nTags = 9, ifdOff = 8, dataOff = ifdOff + 2 + nTags * 12 + 4;
      const tiffBuf = Buffer.alloc(dataOff + w * hPx * 2);
      tiffBuf.write('II', 0); tiffBuf.writeUInt16LE(42, 2); tiffBuf.writeUInt32LE(ifdOff, 4); tiffBuf.writeUInt16LE(nTags, ifdOff);
      [[256, 4, 1, w], [257, 4, 1, hPx], [258, 3, 1, 16], [259, 3, 1, 1], [262, 3, 1, 1], [273, 4, 1, dataOff], [277, 3, 1, 1], [278, 4, 1, hPx], [279, 4, 1, w * hPx * 2]].forEach(([tag, tp, cnt, val], i) => {
        const o = ifdOff + 2 + i * 12;
        tiffBuf.writeUInt16LE(tag, o); tiffBuf.writeUInt16LE(tp, o + 2); tiffBuf.writeUInt32LE(cnt, o + 4);
        if (tp === 3) tiffBuf.writeUInt16LE(val, o + 8); else tiffBuf.writeUInt32LE(val, o + 8);
      });
      for (let y = 0; y < hPx; y++) {
        for (let x = 0; x < w; x++) {
          const ln = Math.floor(x / 80), dx = Math.abs(x % 80 - 40), wx = Math.exp(-0.5 * Math.pow(dx / 18, 6));
          let v = 1200;
          if (ln === 0) {
            for (const mu of [60, 120, 180, 230]) v += 24000 * Math.exp(-0.5 * Math.pow((y - mu) / 5, 2)) * wx;
          } else if (ln === 1) {
            v += 65535 * Math.exp(-0.5 * Math.pow((y - 120) / 6, 2)) * wx;
          } else {
            v += 22000 * Math.exp(-0.5 * Math.pow((y - 120) / 6, 2)) * wx;
          }
          tiffBuf.writeUInt16LE(Math.min(65535, Math.round(v)), dataOff + (y * w + x) * 2);
        }
      }

      const b64 = tiffBuf.toString('base64');
      await p.evaluate(([sel, b, name]) => {
        const u = Uint8Array.from(atob(b), c => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([u], name, {type: 'image/tiff'}));
        const el = document.querySelector(sel);
        el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
        el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      }, ['#clonePanel .cl-gel-upload', b64, 'agarose_offline16.tif']);
      await h.wait(900);

      const toasts = await h.toasts();
      const imgSrc = (await cl(p).locator('.cl-gel-img').count()) ? (await cl(p).locator('.cl-gel-img').getAttribute('src') || '') : '';
      const gelName = (await cl(p).locator('.cl-gel-name').count()) ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('agarose_offline_tiff16_loads',
        imgSrc.startsWith('data:image/png;base64,') && gelName.includes('agarose_offline16.tif') && !toasts.some(t => /could not open/i.test(t)),
        `name="${gelName}" srcLen=${imgSrc.length} toasts=${toasts.join(' | ')}`);

      if (await p.locator('#ag-auto-lanes').count()) {
        await p.click('#ag-auto-lanes');
        await h.wait(400);
      }
      const laneCnt = await p.locator('#ag-lane-editor .ag-lane-zone').count();
      T.check('agarose_offline_tiff16_detects_lanes', laneCnt >= 2, `lanes=${laneCnt}`);
      T.check('agarose_offline_tiff16_no_errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  /* #1712: 1 kb and 1 kb Plus DNA ladder presets (neb1kbplus, neb1kb, thermo1kbplus) and 5,400 bp sizing */
  await T.t('onekb_plus_dna_ladders_calibration', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Agarose 1kb Plus Calibration', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(450);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      const opts = await p.$$eval('#ag-ladder-preset option', os => os.map(o => o.value));
      const hasAll = ['neb100', 'neb1kbplus', 'neb1kb', 'thermo1kbplus', 'custom'].every(k => opts.includes(k));
      T.check('ag_ladder_presets_1kb_and_plus_present', hasAll, JSON.stringify(opts));

      if (opts.includes('neb1kbplus')) {
        const preset = p.locator('#ag-ladder-preset');
        await preset.selectOption('neb1kbplus');
        await preset.dispatchEvent('change');
        await h.wait(150);

        const catVal = await p.locator('#ag-ladder-cat').inputValue();
        const bandBtns = await p.$$eval('#ag-visible-bands [data-cl="ag-pick-band"]', bs => bs.map(b => +b.dataset.size));
        T.check('neb1kbplus_19_bands_and_n3200s', catVal === 'N3200S' && bandBtns.length === 19 && bandBtns[0] === 10000 && bandBtns[bandBtns.length - 1] === 100, `cat=${catVal} n=${bandBtns.length}`);

        // Calibrate log10(bp) -> migration y = 220 - 50 * log10(bp) across 10,000 bp, 6,000 bp, 3,000 bp, 1,000 bp
        const calRef = [10000, 6000, 3000, 1000];
        for (let i = 0; i < calRef.length; i++) {
          await p.locator(`[data-cl="ag-pick-band"][data-size="${calRef[i]}"]`).click();
          const yIn = p.locator('#ag-cal-y-' + i);
          await yIn.fill((220 - 50 * Math.log10(calRef[i])).toFixed(4));
          await yIn.dispatchEvent('change');
        }
        const mig5400 = (220 - 50 * Math.log10(5400)).toFixed(4);
        const sampleMig = p.locator('#ag-lane-migration-1');
        await sampleMig.fill(mig5400);
        await sampleMig.dispatchEvent('change');
        await h.wait(100);

        const estTxt = (await p.locator('#ag-estimate-1').innerText()).trim();
        const estMatch = estTxt.match(/Estimated:\s*(\d+)\s*bp/);
        const estBp = estMatch ? +estMatch[1] : NaN;
        T.check('neb1kbplus_calibrates_5400bp_accurately', Math.abs(estBp - 5400) <= 5, `est="${estTxt}"`);
      } else {
        T.check('neb1kbplus_19_bands_and_n3200s', false, 'neb1kbplus option missing');
        T.check('neb1kbplus_calibrates_5400bp_accurately', false, 'neb1kbplus option missing');
      }
      T.check('onekb_plus_no_errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();

