// 42 figures: checks that figure settings reach the exported SVG and PNG.
// UI and DOM only.
const {open, H, suite, src, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('42_figures'), {p, errs, close} = await open(), h = H(p);

  await T.t('figure_settings', async () => {
    // 1. Load example data
    // the palette, axis title and legend controls belong to the HPLC overlay figure, so use Quick mode's example chromatograms (an ÄKTA run is drawn as a run chart with its own styling)
    await p.click('#homeQuick'); await h.wait(800);
    const legendNames = await p.evaluate(() => [...document.querySelectorAll('#paper svg text')].map(t => t.textContent.trim()).filter(Boolean));

    const download = async (selector, timeout = 10000) => {
      const loc = p.locator(selector);
      await loc.scrollIntoViewIfNeeded();
      const [dl] = await Promise.all([
        p.waitForEvent('download', { timeout }).catch(() => null),
        loc.click()
      ]);
      if (!dl) return null;
      const name = dl.suggestedFilename();
      const tmpPath = path.join(path.resolve(__dirname, '../results'), name);
      await dl.saveAs(tmpPath);
      const buf = fs.readFileSync(tmpPath);
      return { name, buf, str: buf.toString('utf8') };
    };

    const settings = [
      { id: 'default', checks: { w: 3.5, font: 'Arial', fs: 8, pal: ['#1a1a1a', '#D55E00'], xl: '', xr: '', lw: 0.75, leg: true } },
      { id: 'w_onehalf', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-preset'); e.value = 'onehalf'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); }); }, checks: { w: 5, font: 'Arial', fs: 8, pal: ['#1a1a1a', '#D55E00'], xl: '', xr: '', lw: 0.75, leg: true } },
      { id: 'w_double', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-preset'); e.value = 'double'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); }); }, checks: { w: 7, font: 'Arial', fs: 8, pal: ['#1a1a1a', '#D55E00'], xl: '', xr: '', lw: 0.75, leg: true } },
      { id: 'font_times', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-preset'); e.value = 'single'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); const f = document.querySelector('#o-font'); f.value = 'Times'; f.dispatchEvent(new Event('change', {bubbles: true})); f.dispatchEvent(new Event('input', {bubbles: true})); }); }, checks: { w: 3.5, font: 'Times', fs: 8, pal: ['#1a1a1a', '#D55E00'], xl: '', xr: '', lw: 0.75, leg: true } },
      { id: 'fs_12', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-fs'); e.value = '12'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); }); }, checks: { w: 3.5, font: 'Times', fs: 12, pal: ['#1a1a1a', '#D55E00'], xl: '', xr: '', lw: 0.75, leg: true } },
      { id: 'palette_blues', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-palette'); e.value = 'blues'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); }); }, checks: { w: 3.5, font: 'Times', fs: 12, pal: ['#08306b', '#74b3dc'], xl: '', xr: '', lw: 0.75, leg: true } },
      { id: 'axis_labels', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-xlabel'); e.value = 'My X Axis'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); const f = document.querySelector('#o-ylabel'); f.value = 'My Y Axis'; f.dispatchEvent(new Event('change', {bubbles: true})); f.dispatchEvent(new Event('input', {bubbles: true})); }); await h.wait(150); }, checks: { w: 3.5, font: 'Times', fs: 12, pal: ['#08306b', '#74b3dc'], xl: 'My X Axis', xr: 'My Y Axis', lw: 0.75, leg: true } },
      { id: 'axis_range', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-xmin'); e.value = '10'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); const f = document.querySelector('#o-xmax'); f.value = '50'; f.dispatchEvent(new Event('change', {bubbles: true})); f.dispatchEvent(new Event('input', {bubbles: true})); }); await h.wait(150); }, checks: { w: 3.5, font: 'Times', fs: 12, pal: ['#08306b', '#74b3dc'], xl: 'My X Axis', xr: 'My Y Axis', lw: 0.75, leg: true, xmin: 10, xmax: 50 } },
      { id: 'line_width', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-lw'); e.value = '2'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); }); await h.wait(150); }, checks: { w: 3.5, font: 'Times', fs: 12, pal: ['#08306b', '#74b3dc'], xl: 'My X Axis', xr: 'My Y Axis', lw: 2, leg: true, xmin: 10, xmax: 50 } },
      { id: 'legend_off', setup: async () => { await p.evaluate(() => { const e = document.querySelector('#o-legend'); e.value = 'none'; e.dispatchEvent(new Event('change', {bubbles: true})); e.dispatchEvent(new Event('input', {bubbles: true})); }); }, checks: { w: 3.5, font: 'Times', fs: 12, pal: ['#08306b', '#74b3dc'], xl: 'My X Axis', xr: 'My Y Axis', lw: 2, leg: false, xmin: 10, xmax: 50 } }
    ];

    await p.evaluate(() => {
      document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
      document.querySelectorAll('details').forEach(d => d.open = true);
    });

    const svgTexts = {};
    for (const step of settings) {
      if (step.setup) {
        await step.setup();
        await h.wait(500);
      }
      const svg = await download('#saveSvg');
      T.check(`svg_${step.id}_downloaded`, !!svg, 'SVG downloaded');
      if (svg) {
        const s = svg.str;
        const wMatch = s.match(/<svg[^>]*width="([^"]+)"/);
        let actW = wMatch ? parseFloat(wMatch[1]) : 0;
        if (wMatch && wMatch[1].endsWith('in')) actW *= 72; // Convert in to points
        const expW = step.checks.w * 72; // in is *72 for points
        T.check(`svg_${step.id}_width`, Math.abs(actW - expW) < 1, `width: act ${actW}, exp ${expW}`);

        const c1 = step.checks.pal[0];
        T.check(`svg_${step.id}_pal1`, s.includes(c1) || s.includes(c1.toLowerCase()), `pal1: ${c1}`);

        // Font check: font-family="Arial" or font-family="Times New Roman" (app uses Times New Roman for Times)
        const expFont = step.checks.font === 'Times' ? '\'Times New Roman\', Times, serif' : (step.checks.font === 'Arial' ? 'Arial, Helvetica, sans-serif' : step.checks.font);
        T.check(`svg_${step.id}_font`, s.includes(`font-family="${expFont}"`), `font: ${expFont}`);

        // Font size check
        const actFsMatch = s.match(/font-size="([^"]+)"/);
        if(actFsMatch) {
            T.check(`svg_${step.id}_fs`, Math.abs(parseFloat(actFsMatch[1]) - step.checks.fs) < 0.1 || s.includes(`font-size="${step.checks.fs}"`), `fs: ${step.checks.fs}`);
        } else {
             T.check(`svg_${step.id}_fs`, s.includes(`font-size="${step.checks.fs}"`), `fs: ${step.checks.fs}`);
        }

        // Axis labels
        if (step.checks.xl) {
          T.check(`svg_${step.id}_xlabel`, s.includes(step.checks.xl), `xlabel: ${step.checks.xl}`);
        }
        if (step.checks.xr) {
          T.check(`svg_${step.id}_ylabel`, s.includes(step.checks.xr), `ylabel: ${step.checks.xr}`);
        }

        // Line width
        T.check(`svg_${step.id}_lw`, s.includes(`stroke-width="${step.checks.lw}"`), `lw: ${step.checks.lw}`);

        // legend: compared after the loop, from the text of the figure with the legend on and off
        svgTexts[step.id] = [...s.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1].trim());

        // Axis range check. xmin=10, xmax=50. The tick marks will show 10 and 50.
        if (step.checks.xmin !== undefined) {
           T.check(`svg_${step.id}_xmin`, s.includes(`>10<`) || s.includes(`>10.0<`), `xmin tick 10`);
           T.check(`svg_${step.id}_xmax`, s.includes(`>50<`) || s.includes(`>50.0<`), `xmax tick 50`);
        }
      }

      // Check PNG
      const png = await download('#savePng');
      T.check(`png_${step.id}_downloaded`, !!png, 'PNG downloaded');
      if (png) {
        const pngW = png.buf.readUInt32BE(16);
        // expected width is w (in) * dpi (600)
        const expPngW = Math.round(step.checks.w * 600);
        T.check(`png_${step.id}_width`, Math.abs(pngW - expPngW) <= 2, `pngW: act ${pngW}, exp ${expPngW}`);
      }
    }
    // Guards: the legend's entries (text present in the step before legend_off, gone after it) appear in every figure that keeps the legend, and turning it off removes them all.
    const ids = settings.map(st => st.id), prev = svgTexts[ids[ids.indexOf('legend_off') - 1]];
    if (prev && svgTexts.legend_off) { const legend = prev.filter(t => !svgTexts.legend_off.includes(t) && !/^[-−\d.,\s]+$/.test(t)); /* tick numbers move when the legend space goes, so only names count */ /* the step before legend_off has the same settings apart from the legend */
      T.check('svg_legend_has_entries', legend.length > 0, `texts only with the legend on: ${legend.join(', ') || 'none'}`);
      for (const st of settings) if (st.checks.leg && svgTexts[st.id]) T.check(`svg_${st.id}_legend`, legend.every(t => svgTexts[st.id].includes(t)), `missing legend entries: ${legend.filter(t => !svgTexts[st.id].includes(t)).join(', ')}`); }
  });

  // Crowded peak labels (#230): eight peaks 0.1 min apart cannot all be labelled above their apexes. A label that has no room
  // is left off and the footer under the figure says so; no label is drawn outside the figure. A fresh page, so the settings above do not carry over.
  await T.t('crowded_peak_labels', async () => {
    const {crowdedCsv, LABELS} = require('../data/gen_crowded_peaks');
    const q = await open(), hq = H(q.p), pg = q.p;
    try {
      await pg.click('#homeQuick'); await hq.wait(800);
      const foot = () => pg.$eval('#spec2', e => ({t: e.textContent, warn: e.classList.contains('warn'), shown: e.getClientRects().length > 0}));
      let f = await foot();
      T.check('crowded/example_no_warning', !/left off/.test(f.t) && !f.warn, f.t);
      await pg.setInputFiles('#file', {name: 'crowded_peaks.csv', mimeType: 'text/csv', buffer: Buffer.from(crowdedCsv())});
      await pg.waitForSelector('#paper svg text', {state: 'visible'});
      await hq.wait(100);
      const g = await pg.evaluate(labels => { const svg = document.querySelector('#paper svg'); if (!svg) return null; const sr = svg.getBoundingClientRect();
        const labs = [...svg.querySelectorAll('text')].filter(t => labels.includes(t.textContent.trim())).map(t => { const r = t.getBoundingClientRect(); return {t: t.textContent.trim(), top: r.top - sr.top, bot: r.bottom - sr.top, l: r.left - sr.left, r: r.right - sr.left}; });
        return {w: sr.width, h: sr.height, labs}; }, LABELS);
      T.check('crowded/figure_drawn', g && g.labs.length > 0, g ? `${g.labs.length} peak labels drawn` : 'no figure');
      if (!g) return;
      const out = g.labs.filter(l => l.top < -1 || l.bot > g.h + 1 || l.l < -1 || l.r > g.w + 1);
      T.check('crowded/labels_inside_figure', !out.length, `outside the figure: ${out.map(l => `${l.t} (top ${Math.round(l.top)} px)`).join(', ')}`);
      const ov = (await hq.overlaps()).filter(s => LABELS.some(L => s.includes(L)));
      T.check('crowded/labels_dont_overlap', !ov.length, ov.join(', '));
      f = await foot();
      const nOff = +((f.t.match(/^(\d+) peak labels? left off/) || [])[1] || 0), drawn = new Set(g.labs.map(l => l.t));
      T.check('crowded/warning_shown', nOff > 0 && f.warn && f.shown, `footer: ${f.t}`);
      T.check('crowded/every_label_drawn_or_counted', drawn.size === g.labs.length && drawn.size + nOff === LABELS.length, `${drawn.size} drawn + ${nOff} left off, ${LABELS.length} peaks`);
      // two peaks per trace fit, so the warning goes away
      await pg.evaluate(() => { const e = document.getElementById('o-peakMax'); e.value = '2'; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); document.getElementById('detectAll').click(); });
      await hq.wait(600);
      f = await foot();
      T.check('crowded/warning_clears', !/left off/.test(f.t) && !f.warn, f.t);
      T.check('crowded/no_page_errors', !q.errs.length, q.errs.join(' | '));
    } finally { await q.close(); }
  });

  // Dragging a selected workflow panel moves it; the offset is saved, Reset position clears it, older projects load unmoved.
  await T.t('workflow_drag_panel', async () => {
    const q = await open(), pg = q.p, hq = H(pg), CH = path.join(__dirname, '..', 'data');
    try {
      await hq.newProject('Drag panels'); await hq.addRun(src('his')); await hq.addRun(src('q')); await hq.step('figure'); await hq.wait(600);
      /* the first panel's title: its x and y attributes are in SVG units, so they are exact */
      const first = () => pg.evaluate(() => { const t = [...document.querySelectorAll('#paper svg text')].find(e => /^A\s/.test(e.textContent)); if (!t) return null;
        const svg = t.ownerSVGElement, r = t.getBoundingClientRect(); return {x: +t.getAttribute('x'), y: +t.getAttribute('y'), k: svg.getScreenCTM().a, sx: r.left, sy: r.top, n: svg.querySelectorAll('text').length}; });
      const savedRun = async () => { const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#projSave')]); const d = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); return {d, r: (d.runs || [])[0] || {}}; };
      const a0 = await first(); if (!T.check('drag/panel-found', !!a0, 'no panel title A')) return;
      /* select panel A by clicking inside it, then drag 40 px right and 30 px down */
      const sx = a0.sx + 30, sy = a0.sy + 60;
      await pg.mouse.click(sx, sy); await hq.wait(400);
      T.check('drag/toolbar-shows', await pg.isVisible('#wfTool'), 'clicking a panel opens the toolbar');
      await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(sx + 20, sy + 15, {steps: 4}); await pg.mouse.move(sx + 40, sy + 30, {steps: 4}); await pg.mouse.up(); await hq.wait(500);
      const a1 = await first(), ex = 40/a0.k, ey = 30/a0.k;
      T.check('drag/moved-x', !!a1 && Math.abs((a1.x - a0.x) - ex) <= 3, `moved ${a1 && (a1.x - a0.x).toFixed(1)} svg units, wanted about ${ex.toFixed(1)}`);
      T.check('drag/moved-y', !!a1 && Math.abs((a1.y - a0.y) - ey) <= 3, `moved ${a1 && (a1.y - a0.y).toFixed(1)} svg units, wanted about ${ey.toFixed(1)}`);
      /* a click that moves under 4 px does not move the panel */
      const b0 = await first(); await pg.mouse.move(sx + 40, sy + 30); await pg.mouse.down(); await pg.mouse.move(sx + 41, sy + 31); await pg.mouse.up(); await hq.wait(400);
      const b1 = await first(); T.check('drag/small-move-is-click', !!b1 && Math.abs(b1.x - b0.x) < 0.01 && Math.abs(b1.y - b0.y) < 0.01, `x ${b0.x} to ${b1 && b1.x}`);
      /* saved with the project */
      const sv = await savedRun(); T.check('drag/saved-offset', Math.abs(sv.r.wfDx) > 1 && Math.abs(sv.r.wfDy) > 1, `wfDx ${sv.r.wfDx}, wfDy ${sv.r.wfDy}`);
      /* an older project (no offset fields) loads at the unmoved position */
      const old = JSON.parse(JSON.stringify(sv.d)); (old.runs || []).forEach(r => { delete r.wfDx; delete r.wfDy; }); if (old.prep) delete old.prep.wfOff;
      await pg.setInputFiles('#projFile', {name: 'old_no_offsets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old))}); await hq.wait(2500);
      await hq.step('figure'); await hq.wait(600); const o1 = await first();
      T.check('drag/old-project-unmoved', !!o1 && Math.abs(o1.x - a0.x) < 0.5 && Math.abs(o1.y - a0.y) < 0.5, `at ${o1 && o1.x},${o1 && o1.y}, was ${a0.x},${a0.y}`);
      /* reload the moved project, select the panel and reset it */
      await pg.setInputFiles('#projFile', {name: 'moved.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sv.d))}); await hq.wait(2500);
      await hq.step('figure'); await hq.wait(600); const m1 = await first();
      T.check('drag/reload-keeps-offset', !!m1 && Math.abs((m1.x - a0.x) - ex) <= 3, `x ${m1 && m1.x}, unmoved ${a0.x}`);
      await pg.mouse.click(m1.sx + 30, m1.sy + 60); await hq.wait(400);
      await pg.click('#wfTool [data-wf=reset]'); await hq.wait(500);
      const r1 = await first(); T.check('drag/reset-position', !!r1 && Math.abs(r1.x - a0.x) < 0.5 && Math.abs(r1.y - a0.y) < 0.5, `at ${r1 && r1.x},${r1 && r1.y}, was ${a0.x},${a0.y}`);
      const sv2 = await savedRun(); T.check('drag/reset-saved', !sv2.r.wfDx && !sv2.r.wfDy, `wfDx ${sv2.r.wfDx}, wfDy ${sv2.r.wfDy}`);
      T.check('drag/no_page_errors', !q.errs.length, q.errs.join(' | '));
    } finally { await q.close(); }
  });

  // Publication readiness at journal widths (#662): checks that exported figures at single
  // and double column presets have no text under 6 pt, and ticks and text don't overlap.
  await T.t('publication_readiness_journal_widths', async () => {
    const q = await open(), hq = H(q.p), pg = q.p;
    try {
      const download = async (selector, timeout = 10000) => {
        const loc = pg.locator(selector);
        await loc.scrollIntoViewIfNeeded();
        const [dl] = await Promise.all([
          pg.waitForEvent('download', { timeout }).catch(() => null),
          loc.click()
        ]);
        if (!dl) return null;
        const name = dl.suggestedFilename();
        const tmpPath = path.join(path.resolve(__dirname, '../results'), name);
        await dl.saveAs(tmpPath);
        const buf = fs.readFileSync(tmpPath);
        return { name, buf, str: buf.toString('utf8') };
      };

      const setPreset = async (val) => {
        await pg.evaluate(v => {
          const e = document.querySelector('#o-preset');
          if (e) {
            e.value = v;
            e.dispatchEvent(new Event('change', {bubbles: true}));
            e.dispatchEvent(new Event('input', {bubbles: true}));
          }
        }, val);
        await hq.wait(300);
      };

      // 1. HPLC Overlay and NanoDrop in Quick mode
      await pg.click('#homeQuick'); await hq.wait(600);
      await setPreset('single');
      const hplcSvg = await download('#saveSvg');
      T.check('pub/hplc_single_svg', !!hplcSvg, 'HPLC overlay single SVG downloaded');
      if (hplcSvg) {
        const smallFonts = [...hplcSvg.str.matchAll(/font-size="([^"]+)"/g)]
          .map(m => m[1].endsWith('%') ? 8 * (parseFloat(m[1]) / 100) : parseFloat(m[1]))
          .filter(fs => fs < 5.99);
        T.check('pub/hplc_single_min_font', smallFonts.length === 0, `small fonts: ${smallFonts.join(', ')}`);
        const ov = await hq.overlaps();
        T.check('pub/hplc_single_no_overlap', ov.length === 0, `overlaps: ${ov.join(', ')}`);
      }
      const hplcPng = await download('#savePng');
      T.check('pub/hplc_single_png_600dpi', !!hplcPng && Math.abs(hplcPng.buf.readUInt32BE(16) - 2100) <= 2, `pngW: ${hplcPng && hplcPng.buf.readUInt32BE(16)}`);

      // NanoDrop in Quick mode (where #figtabs is active)
      await pg.setInputFiles('#file', [src('ndSpec')]);
      await hq.wait(800);
      const ndTab = pg.locator('#figtabs .figtab').filter({hasText: /nanodrop/i}).first();
      if (await ndTab.count() > 0) {
        await ndTab.click();
        await hq.wait(400);
      }
      const ndSvg = await download('#saveSvg');
      T.check('pub/nanodrop_single_svg', !!ndSvg, 'NanoDrop SVG downloaded');
      if (ndSvg) {
        const smallFonts = [...ndSvg.str.matchAll(/font-size="([^"]+)"/g)]
          .map(m => m[1].endsWith('%') ? 8 * (parseFloat(m[1]) / 100) : parseFloat(m[1]))
          .filter(fs => fs < 5.99);
        T.check('pub/nanodrop_single_min_font', smallFonts.length === 0, `small fonts: ${smallFonts.join(', ')}`);
      }
      // Normalized NanoDrop checks subscript font-size 75%
      await pg.evaluate(() => {
        const el = document.querySelector('#o-ndNorm');
        if (el) {
          el.value = 'a280';
          el.dispatchEvent(new Event('input', {bubbles: true}));
          el.dispatchEvent(new Event('change', {bubbles: true}));
        }
      });
      await hq.wait(400);
      const ndSvgNorm = await download('#saveSvg');
      if (ndSvgNorm) {
        T.check('pub/nanodrop_subscript_75pct', ndSvgNorm.str.includes('font-size="75%"'), 'NanoDrop subscript font-size 75%');
      }

      // 2. ÄKTA run chart and Workflow figure in project mode
      const q2 = await open(), hq2 = H(q2.p), pg2 = q2.p;
      try {
        await hq2.newProject('Pub Test Project');
        await hq2.addRun(src('his'));
        await pg2.setInputFiles('#file', [src('ndSpec')]);
        await hq2.wait(1000);

        // Check ÄKTA run chart
        const tl = await hq2.timeline();
        const rStep = tl.find(x => /^run:/.test(x.k));
        if (rStep) await hq2.step(rStep.k);
        await hq2.wait(400);

        // Turn on phases and standards to exercise phase & std font sizes
        await pg2.evaluate(() => {
          const ph = document.querySelector('#o-phases'); if (ph) { ph.checked = true; ph.dispatchEvent(new Event('change', {bubbles: true})); }
        });
        await hq2.wait(300);

        const dl2 = async (selector, timeout = 10000) => {
          const loc = pg2.locator(selector);
          await loc.scrollIntoViewIfNeeded();
          const [dl] = await Promise.all([
            pg2.waitForEvent('download', { timeout }).catch(() => null),
            loc.click()
          ]);
          if (!dl) return null;
          const name = dl.suggestedFilename();
          const tmpPath = path.join(path.resolve(__dirname, '../results'), name);
          await dl.saveAs(tmpPath);
          const buf = fs.readFileSync(tmpPath);
          return { name, buf, str: buf.toString('utf8') };
        };

        const aktaSvg = await dl2('#saveSvg');
        T.check('pub/akta_single_svg', !!aktaSvg, 'ÄKTA run chart single SVG downloaded');
        if (aktaSvg) {
          const smallFonts = [...aktaSvg.str.matchAll(/font-size="([^"]+)"/g)]
            .map(m => m[1].endsWith('%') ? 8 * (parseFloat(m[1]) / 100) : parseFloat(m[1]))
            .filter(fs => fs < 5.99);
          T.check('pub/akta_single_min_font', smallFonts.length === 0, `small fonts: ${smallFonts.join(', ')}`);
        }

        // Check Workflow figure SVG
        await hq2.step('figure');
        await hq2.wait(500);
        const wfSvg = await dl2('#saveSvg');
        T.check('pub/wf_svg', !!wfSvg, 'Workflow SVG downloaded');
        if (wfSvg) {
          const smallFonts = [...wfSvg.str.matchAll(/font-size="([^"]+)"/g)]
            .map(m => m[1].endsWith('%') ? 8 * (parseFloat(m[1]) / 100) : parseFloat(m[1]))
            .filter(fs => fs < 5.99);
          T.check('pub/wf_min_font', smallFonts.length === 0, `small fonts: ${smallFonts.join(', ')}`);
        }

        T.check('pub/no_page_errors', !q2.errs.length, q2.errs.join(' | '));
      } finally { await q2.close(); }

      T.check('pub/quick_no_page_errors', !q.errs.length, q.errs.join(' | '));
    } finally { await q.close(); }
  });



































































  await T.t('y_axis_ticks_spacing', async () => {
    const q = await open(), hq = H(q.p), pg = q.p;
    try {
      await pg.click('#homeQuick'); await hq.wait(600);

      const csv = `min,mAU\n0,0\n1,370\n2,0`;
      await pg.setInputFiles('#file', {name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)}); await hq.wait(1000);

      await pg.evaluate(() => {
        const e = document.querySelector('#o-preset');
        if (e) {
          e.value = 'custom';
          e.dispatchEvent(new Event('change', {bubbles: true}));
          e.dispatchEvent(new Event('input', {bubbles: true}));
        }
      });
      await hq.wait(500);

      await pg.evaluate(() => {
        const eh = document.querySelector('#o-h');
        if (eh) { eh.value = '20.555'; eh.dispatchEvent(new Event('change', {bubbles: true})); eh.dispatchEvent(new Event('input', {bubbles: true})); }

        const ew = document.querySelector('#o-w');
        if (ew) { ew.value = '7.4'; ew.dispatchEvent(new Event('change', {bubbles: true})); ew.dispatchEvent(new Event('input', {bubbles: true})); }
      });
      await hq.wait(500);

      await pg.evaluate(() => {
        const efs = document.querySelector('#o-fs');
        if (efs) { efs.value = '36'; efs.dispatchEvent(new Event('change', {bubbles: true})); efs.dispatchEvent(new Event('input', {bubbles: true})); }
      });
      await hq.wait(1000);

      const res = await pg.evaluate(() => {
        const texts = Array.from(document.querySelectorAll('#paper svg text'));
        const yTexts = texts.filter(t => !isNaN(parseFloat(t.textContent.replace('\u2212', '-'))) && t.getAttribute('x') && t.getAttribute('y'));

        const svg = document.querySelector('#paper svg');
        const viewBox = svg.getAttribute('viewBox');

        const xGroups = {};
        yTexts.forEach(t => {
          const x = Math.round(parseFloat(t.getAttribute('x')));
          xGroups[x] = (xGroups[x] || []);
          xGroups[x].push(parseFloat(t.getAttribute('y')));
        });

        let maxYAxis = [];
        for (let x in xGroups) {
          if (xGroups[x].length > maxYAxis.length) {
            maxYAxis = xGroups[x];
          }
        }

        if (maxYAxis.length < 2) return {gap: Infinity, fsValue: 24, count: maxYAxis.length, viewBox};

        maxYAxis.sort((a, b) => b - a);
        let minGap = Infinity;
        for (let i = 1; i < maxYAxis.length; i++) {
          minGap = Math.min(minGap, Math.abs(maxYAxis[i] - maxYAxis[i-1]));
        }

        const fsValue = parseFloat(svg.getAttribute('font-size')) || 24;

        return {gap: minGap, fsValue, count: maxYAxis.length, ys: maxYAxis, viewBox};
      });

      console.log('viewBox:', res.viewBox, 'y_axis gap:', res.gap, 'fs:', res.fsValue, 'count:', res.count);
      T.check('y_axis_poster_gap', res.gap >= res.fsValue, `gap ${res.gap.toFixed(1)} should be >= ${res.fsValue}, count: ${res.count}`);

    } finally { await q.close(); }
  });

  await T.t('nanodrop_spectrum_ticks_spacing', async () => {
    const q = await open(), hq = H(q.p), pg = q.p;
    try {
      await pg.click('#homeQuick'); await hq.wait(600);
      const wl = [], ab = [];
      for (let w = 240; w <= 340; w += 2) {
        wl.push(w);
        ab.push(0.05 + 0.3 * Math.exp(-0.5 * ((w - 280) / 15) ** 2));
      }
      const proj = {
        app: 'HPLC Figure Bench', version: 1,
        opt: {preset: 'poster', fs: 24, w: 12, h: 7, wfH: 0.9, tidy13: true, tidy14: true},
        runs: [{id: 'r1', name: 'Step 1', inWf: true, uvi: 0, uvs: [{name: 'UV', yu: 'mAU', xs: [0, 1], ys: [0, 1]}], fracs: [], phases: [], integ: []}],
        traces: [], gels: [],
        nanodrop: [{id: 'nd1', runId: 'r1', stage: 'conc', name: 'Concentrated', spec: {wl, ab}, conc: 1.2, vol: 2}],
        prep: {on: true, btw: {'r1': {how: 'conc', vOut: 2, device: 'Amicon Ultra-15', mwco: '10'}}}
      };
      await pg.setInputFiles('#projFile', {name: 'test_nd_ticks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(proj))});
      await hq.wait(500);
      await pg.evaluate(() => {
        const wfBtn = document.querySelector('[data-fig="workflow"]');
        if (wfBtn) wfBtn.click();
      });
      await hq.wait(500);
      const res = await pg.evaluate(() => {
        const texts = Array.from(document.querySelectorAll('#paper svg text'));
        const a10 = texts.find(t => t.textContent.includes('A (10 mm)'));
        const parent = a10 ? a10.parentElement : null;
        const yLabels = parent ? Array.from(parent.querySelectorAll('text')).filter(t => t.getAttribute('text-anchor') === 'end' && !isNaN(parseFloat(t.textContent))) : [];
        const ys = yLabels.map(t => parseFloat(t.getAttribute('y'))).sort((a, b) => b - a);
        let minGap = Infinity;
        for (let i = 1; i < ys.length; i++) minGap = Math.min(minGap, Math.abs(ys[i] - ys[i - 1]));
        const fsValue = 24;
        return {count: ys.length, minGap, fsValue, requiredGap: fsValue * 1.28};
      });
      T.check('ncsvg_y_ticks_no_overlap', res.count < 2 || res.minGap >= res.requiredGap, `gap ${res.minGap.toFixed(1)} should be >= ${res.requiredGap}, count: ${res.count}`);
    } finally { await q.close(); }
  });

  /* #1187, #1285, #46: SVG/PNG export grouping at 390 px, descending/reset X-axis reorder warnings, toast non-overlap & 2-run count */
  await T.t('export_grouping_axis_reorder_and_run_toasts', async () => {
    const {p: pf, errs: ef, close: cf} = await open({width: 390, height: 844}), hf = H(pf);
    try {
      await pf.click('#homeQuick'); await hf.wait(800);
      const grp = await pf.evaluate(() => {
        const g = id => document.getElementById(id), box = id => g(id).getBoundingClientRect();
        const svgGrp = g('copySvg').parentElement, png = g('savePng').parentElement;
        const adjacent = (a, b) => Math.abs(a.top - b.top) < 4 ? a.right <= b.left + 1 : a.bottom <= b.top + 1;
        const copy = box('copySvg'), save = box('saveSvg'), pngB = box('savePng'), dpi = box('o-dpi');
        return {
          same: svgGrp === g('saveSvg').parentElement && !svgGrp.contains(g('savePng')),
          pngPair: png.contains(g('o-dpi')) && png !== svgGrp,
          vis: ['copySvg', 'saveSvg', 'savePng', 'o-dpi'].every(i => box(i).width > 0),
          orderOk: adjacent(copy, save) && adjacent(pngB, dpi) && !(pngB.left > copy.right && pngB.right < save.left && Math.abs(pngB.top - copy.top) < 4),
          noOverflow: document.documentElement.scrollWidth <= innerWidth
        };
      });
      T.check('svg_group.grouped_and_ordered_390px', grp.same && grp.pngPair && grp.vis && grp.orderOk && grp.noOverflow, JSON.stringify(grp));

      // #1285: descending & reset X-axis reorder diagnostics vs ascending
      await pf.setViewportSize({width: 1200, height: 860});
      await pf.click('#homeBtn').catch(() => {}); await hf.wait(350);
      await hf.newProject('Axis reorder and run status');
      const peak = t => (100 * Math.exp(-((t - 5) ** 2) / 0.5)).toFixed(3);
      const mkCsv = xs => ['Time (min),UV 280 (mAU)', ...xs.map(t => `${t.toFixed(1)},${peak(t)}`)].join('\n');
      const loadTr = async (name, text) => { await pf.setInputFiles('#file', {name, mimeType: 'text/csv', buffer: Buffer.from(text)}); await hf.wait(500); };
      const diagOf = async nm => {
        const c = pf.locator('.trace:not(.run)').filter({has: pf.locator(`input[data-k=name][title="${nm}"]`)}).locator('.source-diag');
        return (await c.count()) ? {s: (await c.first().locator('summary').textContent()) || '', m: (await c.first().locator('.source-diag-msg').textContent()) || ''} : null;
      };
      await loadTr('reversed_time.csv', mkCsv(Array.from({length: 100}, (_, i) => (99 - i) / 10)));
      const rDown = await diagOf('reversed_time');
      T.check('axis_reorder.reversed', !!rDown && /Time \(min\)/.test(rDown.s) && /entirely in descending order/.test(rDown.s) && /99 descending transitions/.test(rDown.m) && /source rows are kept/.test(rDown.m), JSON.stringify(rDown));

      await loadTr('reset_time.csv', mkCsv(Array.from({length: 50}, (_, i) => i / 10).concat(Array.from({length: 50}, (_, i) => i / 10))));
      const rReset = await diagOf('reset_time');
      T.check('axis_reorder.reset', !!rReset && /1 descending transition/.test(rReset.s) && /goes down once \(at line 52\)/.test(rReset.m) && !/each of its/.test(rReset.m), JSON.stringify(rReset));

      const up = Array.from({length: 100}, (_, i) => i / 10); up.splice(40, 0, up[40]);
      await loadTr('ascending_time.csv', mkCsv(up));
      T.check('axis_reorder.ascending_quiet', (await pf.locator('.trace:not(.run) input[data-k=name][title="ascending_time"]').count()) === 1 && !(await diagOf('ascending_time')));

      // #46 & #942: run toast count (1st vs 2nd run) & #intPanel heading non-overlap
      await hf.addRun(src('his'));
      const t1 = (await hf.toasts()).join(' | ');
      T.check('count/first-run-no-total', /Loaded 1 ÄKTA run/.test(t1) && !/runs loaded in all/.test(t1), t1);

      for (const w of [800, 1200]) {
        await pf.setViewportSize({width: w, height: 400}); await hf.wait(150);
        const ov = await pf.evaluate(() => {
          const hd = document.querySelector('#intPanel .intp-head'), ts = document.querySelector('#toast');
          if (!hd || !ts) return false;
          window.scrollTo(0, hd.getBoundingClientRect().top + window.scrollY - window.innerHeight + hd.offsetHeight);
          const hB = hd.getBoundingClientRect(), tB = ts.getBoundingClientRect();
          return !(tB.bottom <= hB.top || tB.top >= hB.bottom || tB.right <= hB.left || tB.left >= hB.right);
        });
        T.check(`run_status_no_overlap_${w}`, !ov, `width=${w}`);
      }
      await pf.setViewportSize({width: 1200, height: 860});
      await hf.addRun(src('q'));
      const t2 = (await hf.toasts()).join(' | ');
      T.check('count/second-run-says-2', /Loaded 1 ÄKTA run/.test(t2) && /2 runs loaded in all/.test(t2), t2);
      errs.push(...ef);
    } finally { await cf(); }
  });

  /* #1316 & #1544: chromatogram tick/label/inset non-overlap in exported SVG and FIG_SCREEN scope isolation in #wfFullModal */
  await T.t('chromatogram_overlap_and_fig_screen_scope', async () => {
    const {fits} = require('../lib/harness');
    const setOpt = (pg, id, v) => pg.evaluate(([id, v]) => {
      const el = document.getElementById(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
      return true;
    }, [id, v]);
    const findOverlaps = texts => {
      const hits = [];
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i], b = texts[j], w = Math.min(a.right, b.right) - Math.max(a.x, b.x), h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        if (w > 0 && h > 0 && w * h > 0.2 * Math.min(a.w * a.h, b.w * b.h)) hits.push(`"${a.t}" vs "${b.t}"`);
      }
      return hits;
    };

    const {p: pc, errs: ec, close: cc} = await open(), hc = H(pc);
    try {
      // 1. HPLC overlay inward ticks + peak labels in Quick mode
      await pc.click('#homeQuick'); await hc.wait(600);
      await setOpt(pc, 'o-ticksOut', false); await setOpt(pc, 'o-showPeaks', true); await hc.wait(300);
      const mOv = await hc.svgBoxes(await hc.exportSvg());
      T.check('overlay-ticks/no-overlap-or-clip', findOverlaps(mOv.texts).length === 0 && mOv.clipped.length === 0, JSON.stringify({ov: findOverlaps(mOv.texts), clip: mOv.clipped}));

      // 2. ÄKTA IMAC zoom inset + IEX gradient zoom inset + #1544 FIG_SCREEN scope in one project
      await pc.click('#homeBtn').catch(() => {}); await hc.wait(350);
      await hc.newProject('Chrom overlap & FIG_SCREEN');
      await hc.addRun(src('his'));
      await setOpt(pc, 'o-ticksOut', true); await setOpt(pc, 'o-zoomInset', true); await hc.wait(400);
      const svgImac = await hc.exportSvg(), mImac = await hc.svgBoxes(svgImac, '.zoom-inset-bg');
      const insetFits = await pc.evaluate(svgText => {
        const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-9999px;top:0'; host.innerHTML = svgText; document.body.appendChild(host);
        try {
          const bg = host.querySelector('.zoom-inset-bg'); if (!bg) return false;
          const br = bg.getBoundingClientRect();
          return [...host.querySelectorAll('#zoom-inset text')].every(el => { const r = el.getBoundingClientRect(), t = el.textContent.trim(); return !t || (r.left >= br.left - 2 && r.right <= br.right + 2 && r.top >= br.top - 2 && r.bottom <= br.bottom + 2); });
        } finally { host.remove(); }
      }, svgImac);
      T.check('akta-zoom/no-overlap-and-inset-fits', findOverlaps(mImac.texts).length === 0 && mImac.clipped.length === 0 && insetFits, JSON.stringify({ov: findOverlaps(mImac.texts), clip: mImac.clipped, insetFits}));

      await hc.dropFiles(src('gel')); // Gel on run 1 for #1544 empty-gel-slot check
      await hc.addRun(src('q'));
      await setOpt(pc, 'o-ticksOut', false); await setOpt(pc, 'o-intLabel', 've');
      const b = await pc.evaluate(() => document.querySelector('#paper svg').getBoundingClientRect());
      await pc.mouse.move(b.left + b.width * 0.35, b.top + b.height * 0.5); await pc.mouse.down();
      await pc.mouse.move(b.left + b.width * 0.65, b.top + b.height * 0.5, {steps: 8}); await pc.mouse.up(); await hc.wait(300);
      await setOpt(pc, 'o-zoomWinA', '8'); await setOpt(pc, 'o-zoomWinB', '22'); await setOpt(pc, 'o-zoomInset', true); await hc.wait(400);
      const mGrad = await hc.svgBoxes(await hc.exportSvg(), '.zoom-inset-bg');
      T.check('akta-grad/no-overlap-and-fits', findOverlaps(mGrad.texts).length === 0 && mGrad.texts.every(t => fits(t, mGrad.root, 2)), JSON.stringify(findOverlaps(mGrad.texts)));

      // #1544: screen-only empty-gel helper slot appears on #paper but never leaks into #wfFullModal or exported SVG
      await hc.step('figure');
      await setOpt(pc, 'o-noGelSlot', true); await hc.wait(400);
      const paperTxt = await pc.evaluate(() => [...document.querySelectorAll('#paper svg text')].map(t => t.textContent.trim()).join(' | '));
      await pc.click('#wfFullView'); await hc.wait(300);
      const modalTxt = await pc.evaluate(() => [...document.querySelectorAll('#wfFullModal svg text')].map(t => t.textContent.trim()).join(' | '));
      await pc.click('#wfFullModalClose'); await hc.wait(150);
      const wfSvg = await hc.exportSvg();
      T.check('fig_screen_scope/preview_vs_modal_and_export', paperTxt.includes('no gel for this step') && !modalTxt.includes('no gel for this step') && !wfSvg.includes('no gel for this step'));
      errs.push(...ec);
    } finally { await cc(); }
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
