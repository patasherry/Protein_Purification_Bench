// #1541: high-res agarose gel images must offload to IndexedDB blobs and not blow localStorage quota in writePending() on sudden reload.
const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1541_agarose_blob_pending');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('high_res_agarose_gel_pending_edit_survives_immediate_reload', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(20000);
      await h.newProject('Agarose quota', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      // Synthesize an incompressible 1100x1100 noisy gel PNG (~3.6 MB binary / ~4.8 MB data URL; image + origImage > 9.5 MB > 5 MB localStorage quota)
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
      // Allow initial IndexedDB autosave (2.5s debounce + blob write) to complete
      await h.wait(3800);

      // Verify project JSON stored in IndexedDB offloads agarose base64 strings to blobs rather than embedding >9 MB in p.data
      const projJsonBytes = await p.evaluate(async () => {
        const db = await new Promise((res, rej) => { const q = indexedDB.open('hfb-projects', 2); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        const all = await new Promise((res, rej) => { const tx = db.transaction('projects', 'readonly'), q = tx.objectStore('projects').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        db.close();
        return all[0] && all[0].data ? all[0].data.length : -1;
      });
      T.check('IndexedDB project JSON offloads agarose gel base64 to blobs (< 200 KB)', projJsonBytes > 0 && projJsonBytes < 200000, `project data length = ${projJsonBytes}`);

      // Type metadata edits and reload IMMEDIATELY (before the 2500ms queueSave debounce fires) so recovery relies on writePending()
      await p.fill('#ag-pct', '1.8');
      await p.locator('#ag-pct').evaluate(el => el.blur());
      await p.fill('#ag-notes', 'Clean 1.2 kb band');
      await p.reload();
      await h.wait(1200);

      await p.locator('#projList [data-pid]').first().click();
      await h.wait(1800);
      await go(h, 'Agarose-gel verification');
      await h.wait(500);

      const pctAfter = await p.locator('#ag-pct').inputValue();
      const notesAfter = await p.locator('#ag-notes').inputValue();
      const srcAfter = await cl(p).locator('.cl-gel-img').getAttribute('src') || '';

      T.check('unsaved agarose % edit survived sudden reload with high-res gel', pctAfter === '1.8', `got pct="${pctAfter}"`);
      T.check('unsaved agarose notes survived sudden reload with high-res gel', notesAfter === 'Clean 1.2 kb band', `got notes="${notesAfter}"`);
      T.check('high-res agarose gel image restored from blob after pending recovery', srcAfter.startsWith('data:image/png;base64,') && srcAfter.length > 1000000, `src length=${srcAfter.length}`);
      T.check('no page errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });
  T.done();
})();
