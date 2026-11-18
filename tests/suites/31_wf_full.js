// 31 workflow, full chromatogram: the workflow figure can draw each run over its whole length instead of the cropped window (#552).
// UI and DOM only.
const {open, H, suite, src} = require('../lib/harness');
(async () => {
  const T = suite('31_wf_full'), {p, errs, close} = await open(), h = H(p);
  await T.t('wf-full-chromatogram', async () => {
    await h.newProject('Full chrom'); await h.dropFiles(src('his')); await h.dropFiles(src('q'));
    await p.click('#tl [data-step="figure"]'); await h.wait(900);
    /* every number printed in the workflow figure, in order: the axis ticks change when the drawn range changes */
    const xmax = () => p.evaluate(() => [...document.querySelectorAll('#paper svg text')].map(t => t.textContent.trim()).filter(s => /^-?\d+(\.\d+)?$/.test(s)).join(' '));
    const box = '#o-wfFull', set = async v => { await p.evaluate(([s, v]) => { const e = document.querySelector(s); if (e.checked !== v) e.click(); }, [box, v]); await h.wait(900); };
    const nOpts = await p.locator(box).count();
    T.check('wf-full.option-present', nOpts === 1, `${nOpts} checkboxes`);
    const a = await xmax(); await set(true); const b = await xmax(); await set(false); const c = await xmax();
    T.check('wf-full.axis-changes', b !== a && !!b, `cropped [${a}] full [${b}]`); // the axis labels change when the whole run is drawn
    T.check('wf-full.off-restores', c === a, `before ${a}, after ${c}`); // switching it off gives the cropped figure back
    const view = '#wfFullView', modal = '#wfFullModal';
    const hasView = (await p.locator(view).count()) === 1;
    T.check('wf-full.modal-trigger-present', hasView, 'workflow settings has a full chromatogram view button');
    if (!hasView) {
      T.check('wf-full.modal-opens', false, 'no full chromatogram trigger');
      T.check('wf-full.modal-shows-full-ranges', false, 'no full chromatogram modal');
      T.check('wf-full.modal-closes', false, 'no full chromatogram modal');
      return;
    }
    await p.click(view); await h.wait(400);
    T.check('wf-full.modal-opens', await p.locator(modal).evaluate(e => e.open), 'full chromatograms opens in a modal');
    const modalTicks = await p.evaluate(() => [...document.querySelectorAll('#wfFullModal svg text')].map(t => t.textContent.trim()).filter(s => /^-?\d+(\.\d+)?$/.test(s)).join(' '));
    T.check('wf-full.modal-shows-full-ranges', modalTicks !== a && !!modalTicks, `cropped [${a}] modal [${modalTicks}]`);
    await p.click('#wfFullModalClose'); await h.wait(100);
    T.check('wf-full.modal-closes', !(await p.locator(modal).evaluate(e => e.open)), 'modal closed');
  });
  await T.t('wf-full-gel', async () => {
    const a2 = await open(), p2 = a2.p, h2 = H(p2);
    try {
      await h2.newProject('Full gel');
      await h2.gb(src('gb'));
      await h2.addRun(src('his'));
      await h2.suggest();
      await p2.setInputFiles('#gelFile', src('gel')); await h2.wait(2500);
      if (await p2.isVisible('#g-fill')) { await p2.click('#g-fill'); await h2.wait(500); }
      await h2.step('figure'); await h2.wait(600);

      const optCheck = await p2.evaluate(() => {
        const box = document.querySelector('#wfMore .checks #o-wfGelFull');
        if (!box) return {exists: false};
        const lab = box.closest('label'), r = lab ? lab.getBoundingClientRect() : box.getBoundingClientRect();
        return {exists: true, type: box.type, checked: box.checked, vis: r.width > 0 && r.height > 0, text: lab ? lab.textContent.trim() : ''};
      });
      T.check('wf-gel-full.in-figure-options', optCheck.exists && optCheck.type === 'checkbox' && optCheck.vis && !optCheck.checked, JSON.stringify(optCheck));
      if (!optCheck.exists) {
        T.check('wf-gel-full.shows-full-gel-height', false, 'missing #o-wfGelFull toggle');
        T.check('wf-gel-full.keeps-annotations-aligned', false, 'missing #o-wfGelFull toggle');
        T.check('wf-gel-full.single-run-unchanged', false, 'missing #o-wfGelFull toggle');
        T.check('wf-gel-full.off-restores', false, 'missing #o-wfGelFull toggle');
        return;
      }

      const measureGelSvg = async svg => {
        const boxes = await h2.svgBoxes(svg);
        const pg = await p2.context().newPage();
        try {
          await pg.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:0">' + svg + '</body>');
          await pg.waitForSelector('svg', {timeout: 5000});
          const geom = await pg.evaluate(() => {
            const root = document.querySelector('svg');
            const defImg = root.querySelector('defs image');
            const imgH = defImg ? +defImg.getAttribute('height') : 0;
            const strips = [...root.querySelectorAll('svg[viewBox]')].filter(s => s.querySelector('use'));
            if (!strips.length || !imgH) return null;
            const vb = strips[0].viewBox.baseVal;
            const rects = strips.map(s => s.getBoundingClientRect());
            const gelLeft = Math.min(...rects.map(r => r.left)), gelRight = Math.max(...rects.map(r => r.right));
            const gelTop = Math.min(...rects.map(r => r.top)), gelBottom = Math.max(...rects.map(r => r.bottom));
            const texts = [...root.querySelectorAll('text')].map(t => { const r = t.getBoundingClientRect(); return {t: (t.textContent || '').trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right)/2, cy: (r.top + r.bottom)/2}; }).filter(x => x.t);
            const kdaNums = texts.filter(x => /^\d+$/.test(x.t) && x.right <= gelLeft + 2 && x.cy >= gelTop - 8 && x.cy <= gelBottom + 8).map(x => +x.t);
            const hasKdaTitle = texts.some(x => x.t === 'kDa' && x.right <= gelLeft + 4 && x.bottom <= gelBottom);
            const laneLabs = texts.filter(x => x.bottom <= gelTop + 2 && x.top >= gelTop - 45 && x.cx >= gelLeft - 4 && x.cx <= gelRight + 4).map(x => x.t);
            const connPaths = [...root.querySelectorAll('path')].filter(el => {
              const d = el.getAttribute('d') || '';
              if (!d.includes('C')) return false;
              const r = el.getBoundingClientRect();
              return r.height > 4 && r.bottom <= gelTop + 4 && r.bottom >= gelTop - 45 && r.left >= gelLeft - 80 && r.right <= gelRight + 80;
            }).length;
            return {imgH, vbY: vb.y, vbH: vb.height, spanFrac: vb.height / imgH, kdaNums, hasKdaTitle, laneLabs, connPaths};
          });
          return {boxes, geom};
        } finally { await pg.close(); }
      };

      const setGelFull = async v => {
        await p2.evaluate(want => { const e = document.getElementById('o-wfGelFull'); if (e && e.checked !== want) e.click(); }, v);
        await h2.wait(600);
      };

      const mCrop = await measureGelSvg(await h2.exportSvg());
      await setGelFull(true);
      const mFull = await measureGelSvg(await h2.exportSvg());

      T.check('wf-gel-full.shows-full-gel-height',
        !!(mCrop.geom && mFull.geom && mCrop.geom.spanFrac < 0.9 && Math.abs(mFull.geom.vbY) < 0.5 && mFull.geom.spanFrac > 0.99 && mFull.geom.kdaNums.length > mCrop.geom.kdaNums.length && !mFull.boxes.clipped.length),
        `cropped=${JSON.stringify(mCrop.geom)} full=${JSON.stringify(mFull.geom)} clipped=${JSON.stringify(mFull.boxes.clipped)}`);

      T.check('wf-gel-full.keeps-annotations-aligned',
        !!(mFull.geom && mFull.geom.hasKdaTitle && mFull.geom.kdaNums.length >= 4 && mFull.geom.laneLabs.length >= 2 && mFull.geom.connPaths >= 1),
        JSON.stringify(mFull.geom));

      await p2.click('#tl [data-step^="run:"]'); await h2.wait(600);
      const mSingle = await measureGelSvg(await h2.exportSvg());
      T.check('wf-gel-full.single-run-unchanged',
        !!(mSingle.geom && mSingle.geom.spanFrac < 0.9),
        JSON.stringify(mSingle.geom));

      await h2.step('figure'); await h2.wait(500);
      await setGelFull(false);
      const mRestored = await measureGelSvg(await h2.exportSvg());
      T.check('wf-gel-full.off-restores',
        !!(mRestored.geom && mCrop.geom && Math.abs(mRestored.geom.spanFrac - mCrop.geom.spanFrac) < 0.01),
        `before=${mCrop.geom && mCrop.geom.spanFrac} after=${mRestored.geom && mRestored.geom.spanFrac}`);
      errs.push(...a2.errs);
    } finally { await a2.close(); }
  });
  T.check('no page errors', !errs.length, errs.join(' | '));
  await close(); T.done();
})();
