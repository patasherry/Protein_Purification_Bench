const {open, H, suite, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('1500_agarose_upload');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_gel_upload_and_storage', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);

      const png1 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2Nk+M/wn4GBgYGRAQQAAP//AwA6EQbO1s4ZtwAAAABJRU5ErkJggg==';
      const png2 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVQIW2Nk+M/wnwEJMDHAAQYGAAB+Dgb+y4e1wQAAAABJRU5ErkJggg==';
      const tmp1 = path.join(require('os').tmpdir(), 'test_gel_1.png');
      const tmp2 = path.join(require('os').tmpdir(), 'test_gel_2.png');
      fs.writeFileSync(tmp1, Buffer.from(png1, 'base64'));
      fs.writeFileSync(tmp2, Buffer.from(png2, 'base64'));

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

      // 1. Open a project that has an Agarose Gel stage
      await h.newProject('Agarose synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(600);

      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      // Verify the upload zone is present in the stage panel
      const zone = cl(p).locator('.cl-gel-upload');
      T.check('upload_zone_present', await zone.count() > 0, 'upload zone in stage panel');

      // 2. Drag a test PNG into the upload zone, verify the image appears in the stage panel
      await dragFile('#clonePanel .cl-gel-upload', tmp1, 'test_gel_1.png');
      await h.wait(600);

      const img1 = cl(p).locator('.cl-gel-img');
      T.check('image_appears_in_stage_panel', await img1.count() > 0 && !!(await img1.getAttribute('src')), 'image element present');
      const name1 = (await cl(p).locator('.cl-gel-name').count()) > 0 ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('first_image_displayed', name1.includes('test_gel_1.png'), name1);

      // 3. Upload a second PNG and verify the first is still recoverable via a Restore original control
      await dragFile('#clonePanel .cl-gel-upload', tmp2, 'test_gel_2.png');
      await h.wait(600);

      const name2 = (await cl(p).locator('.cl-gel-name').count()) > 0 ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('second_image_displayed', name2.includes('test_gel_2.png'), name2);

      const restoreBtn = cl(p).locator('button', {hasText: 'Restore original'});
      T.check('restore_control_present', await restoreBtn.count() > 0, 'Restore original control present');

      await restoreBtn.click();
      await h.wait(600);

      const nameRestored = (await cl(p).locator('.cl-gel-name').count()) > 0 ? await cl(p).locator('.cl-gel-name').innerText() : '';
      T.check('first_image_recovered', nameRestored.includes('test_gel_1.png'), nameRestored);

      // 4. Reload the page and verify both the image and the stage are still present
      await h.wait(3000); // allow autosave to flush
      await p.reload();
      await h.wait(1500);

      const card = p.locator('#projList [data-pid]').first();
      await card.click();
      await h.wait(2000);

      const stageRows = await rows(h);
      const hasStage = stageRows.some(x => x.t === 'Agarose-gel verification');
      T.check('stage_present_after_reload', hasStage, 'stage present in timeline');

      await go(h, 'Agarose-gel verification');
      await h.wait(600);

      const imgReloaded = cl(p).locator('.cl-gel-img');
      T.check('image_present_after_reload', await imgReloaded.count() > 0 && !!(await imgReloaded.getAttribute('src')), 'image present in stage panel after reload');

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
