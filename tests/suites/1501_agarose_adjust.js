const {open, H, suite} = require('../lib/harness');

/* #1482: reversible crop, rotation, brightness and contrast for the agarose gel image. The adjustments are parameters
   applied when the view is drawn, so Reset adjustments brings back the uploaded pixels exactly. */
(async () => {
  const T = suite('1501_agarose_adjust');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_gel_adjust_and_reset', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose adjust synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(600);
      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      // a synthetic, asymmetric gel: dark background, a ladder lane and two sample bands at different heights
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
      await h.wait(900);

      // pixels of the shown gel view, and of the stored (unedited) upload decoded on its own
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

      const set = async (sel, val) => { if (!(await has(sel))) return false; await p.locator(sel).fill(String(val)); await h.wait(400); return true; };
      const reset = async () => { if (!(await has('#clonePanel #ag-reset'))) return false; await p.locator('#clonePanel #ag-reset').click(); await h.wait(500); return true; };

      // rotate 15 degrees: the drawn view differs (a 160x100 image rotated 15 degrees has a 180x138 bounding box)
      const srcOf = async () => (await p.locator('#clonePanel .cl-gel-img').count()) ? await p.locator('#clonePanel .cl-gel-img').getAttribute('src') : '';
      const src0 = await srcOf();
      const rotOk = await set('#clonePanel #ag-rot', 15), v1 = await view(), src1 = await srcOf();
      T.check('rotate_15_changes_view', rotOk && !!v1 && !same(v1, orig) && v1.w === 180 && v1.h === 138, v1 ? `${v1.w}x${v1.h}` : 'no view');
      // the fine stepper nudges it by one degree
      if (await has('#clonePanel #ag-rot-up')) { await p.locator('#clonePanel #ag-rot-up').click(); await h.wait(400); }
      const rn = await has('#clonePanel #ag-rot-n') ? await p.locator('#clonePanel #ag-rot-n').inputValue() : '';
      T.check('fine_stepper_adds_1_degree', rn === '16', `rotation box reads ${rn}`);
      const r1 = await reset(), v2 = await view();
      T.check('reset_after_rotation_matches_original', r1 && same(v2, orig), v2 ? `${v2.w}x${v2.h}` : 'no view');
      T.check('stored_image_not_overwritten_by_rotation', !!src0 && src1 === src0, 'stored image data is the same before and after rotating');

      // brightness 120 and contrast 80, then reset
      const bOk = await set('#clonePanel #ag-bright', 120), cOk = await set('#clonePanel #ag-contrast', 80), v3 = await view();
      T.check('brightness_contrast_change_view', bOk && cOk && !!v3 && v3.w === 160 && v3.h === 100 && !same(v3, orig), v3 ? `${v3.w}x${v3.h}` : 'no view');
      const r2 = await reset(), v4 = await view();
      T.check('reset_after_brightness_contrast_matches_original', r2 && same(v4, orig), v4 ? `${v4.w}x${v4.h}` : 'no view');
      const bv = await has('#clonePanel #ag-bright') ? await p.locator('#clonePanel #ag-bright').inputValue() : '';
      const cv = await has('#clonePanel #ag-contrast') ? await p.locator('#clonePanel #ag-contrast').inputValue() : '';
      T.check('reset_returns_sliders_to_100', bv === '100' && cv === '100', `brightness ${bv}, contrast ${cv}`);

      // crop: drag a rectangle over the left half; the view becomes that region, Reset brings the whole image back
      let cropW = 0, cropH = 0;
      if (await has('#clonePanel #ag-crop')) {
        await p.locator('#clonePanel #ag-crop').click(); await h.wait(400);
        const b = await p.locator('#clonePanel #ag-canvas').boundingBox();
        if (b) { await p.mouse.move(b.x + 1, b.y + 1); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 4}); await p.mouse.up(); await h.wait(500); }
        const vc = await view(); if (vc) { cropW = vc.w; cropH = vc.h; }
      }
      T.check('crop_drag_shrinks_view', cropW > 60 && cropW < 100 && cropH > 30 && cropH < 60, `${cropW}x${cropH}`);
      const r3 = await reset(), v5 = await view();
      T.check('reset_after_crop_matches_original', r3 && same(v5, orig), v5 ? `${v5.w}x${v5.h}` : 'no view');

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
