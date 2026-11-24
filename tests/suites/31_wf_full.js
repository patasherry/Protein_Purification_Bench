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

  /* #950 & #1327: stacked and grid text-panel content-driven padding tested in one shared project */
  await T.t('text-panel-content-padding-stack-and-grid', async () => {
    const ap = await open({width: 1400, height: 1000}), {p: pp} = ap, hp = H(pp);
    try {
      await hp.newProject('Padding');
      await pp.click('#tl [data-addmenu]'); await pp.click('#tl [data-addstep="man:batch"]'); await hp.wait(300);
      await pp.locator('#man-resin').fill('Ni-NTA agarose'); await pp.locator('#man-buffer').fill('50 mM Tris pH 8.0'); await hp.wait(200);
      await hp.addRun(src('his'));
      await hp.step('figure');
      const setOpt = async (sel, v) => {
        await pp.evaluate(([s, v]) => { const el = document.querySelector(s); if (!el) return; if (el.type === 'radio') el.checked = true; else el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, [sel, v]);
        await hp.wait(500);
      };
      await setOpt('#wf-stack', 'stack');
      const measureStack = () => pp.evaluate(() => {
        const svg = document.querySelector('#paper svg'); if (!svg) return {err: 'no figure'};
        const k = svg.getScreenCTM().d, gs = [...svg.querySelectorAll('g[data-wfp]')], i = gs.findIndex(g => /^m\d+$/.test(g.dataset.wfp));
        if (i < 0 || i === gs.length - 1) return {err: 'bad index'};
        const parts = [...gs[i].querySelectorAll('text, path')].map(e => e.getBoundingClientRect()).filter(r => r.height > 0), nx = gs[i + 1].querySelector('svg');
        if (!parts.length || !nx) return {err: 'nothing to measure'};
        return {gap: (nx.getScreenCTM().f - Math.max(...parts.map(r => r.bottom))) / k, chartH: nx.height.baseVal.value};
      });
      const a = await measureStack();
      T.check('950.stack.fits_content', !a.err && a.gap > 0 && a.gap < 0.6 * a.chartH, JSON.stringify(a));
      await setOpt('#o-wfPad', '30');
      const b = await measureStack();
      T.check('950.margin.applies', !b.err && b.gap - a.gap > 15 && b.gap - a.gap < 35, JSON.stringify({a, b}));
      await setOpt('#o-wfPad', '');

      await hp.addRun(src('q'));
      await hp.step('figure');
      await setOpt('#wf-grid', 'grid');
      const g = await pp.evaluate(() => {
        const svg = document.querySelector('#paper svg'), gs = svg ? [...svg.querySelectorAll('g[data-wfp]')] : [], i = gs.findIndex(el => /^m\d+$/.test(el.dataset.wfp));
        if (i < 0) return {err: 'no text panel'};
        const own = gs[i].querySelector('svg'), others = gs.filter((_, j) => j !== i).map(el => el.querySelector('svg')).filter(Boolean);
        return own && others.length ? {panels: gs.length, textH: own.height.baseVal.value, chartH: Math.max(...others.map(c => c.height.baseVal.value))} : {err: 'missing svg'};
      });
      T.check('950.grid.text_panel_fits_content', !g.err && g.panels >= 3 && g.textH < 0.8 * g.chartH, JSON.stringify(g));
      errs.push(...ap.errs);
    } finally { await ap.close(); }
  });

  /* #411 (#947 & #1252): arrow-note and construct plasmid placeholders fit across desktop & mobile widths in one browser */
  await T.t('responsive-placeholders-arrow-and-construct', async () => {
    const ar = await open({width: 1400, height: 900}), {p: pr} = ar, hr = H(pr);
    pr.setDefaultTimeout(10000);
    try {
      await hr.newProject('Workflow condition placeholder');
      await hr.addRun([src('his'), src('s200')]);
      const measureInput = sel => pr.locator(sel).evaluate(input => {
        const style = getComputedStyle(input), ph = getComputedStyle(input, '::placeholder');
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${ph.fontStyle} ${ph.fontWeight} ${ph.fontSize} ${ph.fontFamily}`;
        const available = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const needed = ctx.measureText(input.placeholder).width;
        const r = input.getBoundingClientRect(), tool = input.parentElement.getBoundingClientRect();
        return {placeholder: input.placeholder, value: input.value, overflow: style.textOverflow, available, needed, insideTool: r.left >= tool.left && r.right <= tool.right, insideVp: r.left >= 0 && r.right <= innerWidth};
      });

      await hr.step('figure');
      for (const width of [1400, 947, 390]) {
        await pr.setViewportSize({width, height: 900}); await hr.wait(150);
        const title = pr.locator('#paper svg text').filter({hasText: /^[A-Z]\s+IMAC/}).first();
        await title.scrollIntoViewIfNeeded();
        const r = await title.boundingBox();
        await pr.mouse.click(r.x + 20, r.y + r.height + 40);
        await pr.locator('#wfA').waitFor({state: 'visible'});
        const m = await measureInput('#wfA');
        T.check(`411.${width}.arrow-placeholder-fits`, !m.value && m.placeholder === 'e.g. SUMO protease, 4 °C overnight' && m.available >= m.needed && m.overflow === 'clip' && m.insideTool && m.insideVp && !(await hr.hScroll()), JSON.stringify(m));
        await pr.keyboard.press('Escape');
      }

      await hr.step('construct');
      for (const width of [390, 360, 320]) {
        await pr.setViewportSize({width, height: 900}); await hr.wait(150);
        await pr.locator('#pr-name').waitFor({state: 'visible'});
        const m = await measureInput('#pr-name');
        T.check(`411.${width}.plasmid-placeholder-fits`, m.placeholder === 'e.g. pET28-SUMO-NADK' && m.available >= m.needed && m.insideVp && !(await hr.hScroll()), JSON.stringify(m));
      }
      errs.push(...ar.errs);
    } finally { await ar.close(); }
  });

  /* #769: 8-step workflow redraw reuses cached Gaussian fits instead of refitting every peak twice */
  await T.t('eight-step-gaussian-refit-cache', async () => {
    const fsMod = require('fs'), {crowdedRunCsv} = require('../data/gen_crowded_workflow');
    const gaussPaths = svg => (svg.match(/<path d="[^"]*"[^>]*fill-opacity="0\.18"/g) || []).map(x => x.slice(9, x.indexOf('"', 9)));
    const paperSvg = pg => pg.$eval('#paper svg', e => e.outerHTML).catch(() => '');
    const redraw = (pg, id, v, n) => pg.evaluate(([id, v, n]) => { const el = document.getElementById(id); if (!el) return -1; el.value = v; const ts = [];
      for (let i = 0; i <= n; i++) { const t = performance.now(); el.dispatchEvent(new Event('input', {bubbles: true})); if (i) ts.push(performance.now() - t); }
      ts.sort((a, b) => a - b); return Math.round(ts[ts.length >> 1] * 10) / 10; }, [id, v, n]);

    const aw = await open(), {p: pw} = aw, hw = H(pw);
    try {
      await hw.newProject('Eight crowded steps');
      await pw.setInputFiles('#file', Array.from({length: 8}, (_, k) => ({name: `wf769_step${k + 1}.csv`, mimeType: 'text/csv', buffer: Buffer.from(crowdedRunCsv(k))})));
      await hw.wait(3000);
      const steps = (await hw.timeline()).filter(x => x.k.startsWith('run:'));
      T.check('769.eight-runs', steps.length === 8, `${steps.length} runs`);
      for (const s of steps) { await hw.step(s.k); await pw.evaluate(() => document.getElementById('intAuto')?.click()); await hw.wait(350); }
      await hw.step('figure'); await hw.wait(600);
      const g0 = gaussPaths(await paperSvg(pw));
      const tG = await redraw(pw, 'o-intMethod', 'gauss', 5), tT = await redraw(pw, 'o-intMethod', 'trap', 5); await redraw(pw, 'o-intMethod', 'gauss', 0);
      T.check('769.redraw-reuses-fits', g0.length >= 8 && tG >= 0 && tT >= 0 && tG <= 1.5 * tT + 30, `Gauss=${tG}ms Trap=${tT}ms peaks=${g0.length}`);
      const g1 = gaussPaths(await paperSvg(pw)), gx = gaussPaths(await hw.exportSvg());
      T.check('769.screen-and-export-match', g1.join('|') === g0.join('|') && gx.join('|') === g1.join('|'));
      await redraw(pw, 'o-intBase', 'zero', 0); const gz = gaussPaths(await paperSvg(pw));
      T.check('769.baseline-edit-refits-and-restores', gz.length > 0 && gz.join('|') !== g1.join('|') && gaussPaths(await hw.exportSvg()).join('|') === gz.join('|'));
      await redraw(pw, 'o-intBase', 'line', 0);
      T.check('769.baseline-back', gaussPaths(await paperSvg(pw)).join('|') === g1.join('|'));
      errs.push(...aw.errs);
    } finally { await aw.close(); }
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close(); T.done();
})();
