const {open, H, suite, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('1501_agarose_adjust');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_gel_adjustments', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);

      const dragFile = async (selector, filePath, fileName) => {
        const b64 = fs.readFileSync(filePath).toString('base64');
        await p.evaluate(async ([sel, b, name]) => {
          const u = Uint8Array.from(atob(b), c => c.charCodeAt(0));
          const file = new File([u], name, {type: 'image/png'});
          const dt = new DataTransfer();
          dt.items.add(file);
          const el = document.querySelector(sel);
          if (!el) throw new Error('element not found: ' + sel);
          el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
          el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
        }, [selector, b64, fileName]);
      };

      // 1. Open a cloning project and go to Agarose-gel verification
      await h.newProject('Agarose Adjust Test', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(600);

      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      // Generate a synthetic patterned test image in the browser
      const pngDataUrl = await p.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 40; c.height = 40;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, 40, 40);
        ctx.fillStyle = '#e5e5e5';
        ctx.fillRect(4, 8, 32, 4);
        ctx.fillRect(8, 20, 24, 4);
        ctx.fillRect(12, 30, 16, 3);
        return c.toDataURL('image/png');
      });
      const tmpFile = path.join(require('os').tmpdir(), 'test_agarose_adjust.png');
      fs.writeFileSync(tmpFile, Buffer.from(pngDataUrl.split(',')[1], 'base64'));

      // Upload test image
      await dragFile('#clonePanel .cl-gel-upload', tmpFile, 'test_agarose_adjust.png');
      await h.wait(600);

      const getCanvasPixels = async () => p.evaluate(() => {
        const c = document.querySelector('#ag-gel-canvas') || document.querySelector('.cl-gel-canvas');
        if (!c) return null;
        const ctx = c.getContext('2d');
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        return {
          w: c.width,
          h: c.height,
          data: Array.from(imgData.data)
        };
      });

      const orig = await getCanvasPixels();
      T.check('canvas_rendered', !!orig && orig.w === 40 && orig.h === 40, 'rendered canvas is present with original dimensions');

      // 2. Rotate it 15 degrees, verify the rendered canvas differs from the original
      const rotSlider = p.locator('#ag-adj-rot');
      T.check('rot_slider_present', await rotSlider.count() > 0, 'rotation slider present in toolbar');

      await rotSlider.fill('15');
      await rotSlider.dispatchEvent('input');
      await rotSlider.dispatchEvent('change');
      await h.wait(300);

      const rotated = await getCanvasPixels();
      const rotDiffers = !!rotated && (rotated.w !== orig.w || rotated.h !== orig.h || JSON.stringify(rotated.data) !== JSON.stringify(orig.data));
      T.check('rotated_differs_from_original', rotDiffers, 'rendered canvas differs after 15 deg rotation');

      // 3. Click Reset adjustments and verify the image matches the original pixel-for-pixel
      const resetBtn = p.locator('button', {hasText: 'Reset adjustments'});
      T.check('reset_button_present', await resetBtn.count() > 0, 'Reset adjustments button present');

      await resetBtn.click();
      await h.wait(300);

      const reset1 = await getCanvasPixels();
      const matchOrig1 = !!reset1 && reset1.w === orig.w && reset1.h === orig.h && reset1.data.every((v, i) => v === orig.data[i]);
      T.check('matches_original_pixel_for_pixel', matchOrig1, 'image matches original pixel-for-pixel after reset');

      // 4. Set brightness to 120 and contrast to 80, then reset, and confirm the image is back to the unedited state
      const brightInput = p.locator('#ag-adj-brightness');
      const contrastInput = p.locator('#ag-adj-contrast');
      T.check('brightness_and_contrast_present', (await brightInput.count() > 0) && (await contrastInput.count() > 0), 'brightness and contrast controls present');

      await brightInput.fill('120');
      await brightInput.dispatchEvent('input');
      await brightInput.dispatchEvent('change');

      await contrastInput.fill('80');
      await contrastInput.dispatchEvent('input');
      await contrastInput.dispatchEvent('change');
      await h.wait(300);

      const adjusted = await getCanvasPixels();
      const adjDiffers = !!adjusted && JSON.stringify(adjusted.data) !== JSON.stringify(orig.data);
      T.check('brightness_contrast_differs', adjDiffers, 'rendered canvas differs with brightness 120 and contrast 80');

      await resetBtn.click();
      await h.wait(300);

      const reset2 = await getCanvasPixels();
      const matchOrig2 = !!reset2 && reset2.w === orig.w && reset2.h === orig.h && reset2.data.every((v, i) => v === orig.data[i]);
      T.check('back_to_unedited_state', matchOrig2, 'image back to unedited state pixel-for-pixel');

      // 5. Test fine +/- 1 degree stepper
      const incBtn = p.locator('#ag-adj-rot-inc');
      T.check('stepper_present', await incBtn.count() > 0, 'fine stepper button present');
      if (await incBtn.count() > 0) {
        await incBtn.click();
        await h.wait(200);
        const rotVal = await p.locator('#ag-adj-rot-val').inputValue();
        T.check('stepper_increments', rotVal === '1', 'stepper increments angle to 1');
        await resetBtn.click();
        await h.wait(200);
      }

      // 6. Test crop by dragging a rectangle on the canvas
      await p.evaluate(() => {
        const canvas = document.querySelector('#ag-gel-canvas') || document.querySelector('.cl-gel-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mEvt = (ty, x, y) => new MouseEvent(ty, {clientX: rect.left + x, clientY: rect.top + y, bubbles: true});
        canvas.dispatchEvent(mEvt('mousedown', 5, 5));
        window.dispatchEvent(mEvt('mousemove', 25, 25));
        window.dispatchEvent(mEvt('mouseup', 25, 25));
      });
      await h.wait(300);

      const cropped = await getCanvasPixels();
      const cropDiffers = !!cropped && (cropped.w !== orig.w || cropped.h !== orig.h || JSON.stringify(cropped.data) !== JSON.stringify(orig.data));
      T.check('crop_modifies_canvas', cropDiffers, 'crop drag rectangle modifies canvas');

      await resetBtn.click();
      await h.wait(300);

      const reset3 = await getCanvasPixels();
      const matchOrig3 = !!reset3 && reset3.w === orig.w && reset3.h === orig.h && reset3.data.every((v, i) => v === orig.data[i]);
      T.check('crop_reset_restores_original', matchOrig3, 'reset restores uncropped original image');

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
