// 43 zoom inset: the whole run on the main plot, the X window magnified in a second small plot. Presentation only.
// UI and DOM only: options are set through the inputs, the figure is read from the SVG in #paper.
const {open, H, suite, path, DATA, APP, src, fits} = require('../lib/harness');
const T = suite('43_zoom_inset');

const setOpt = (p, id, v) => p.evaluate(([id, v]) => { const el = document.getElementById(id); if (!el) return false;
  if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); return true; }, [id, v]);
/* numeric tick labels (true minus signs read as minus) of the plot under <g data-plot=...>, ignoring titles and peak labels */
const ticksOf = (p, which) => p.evaluate(w => { const g = document.querySelector(`#paper svg [data-plot=${w}]`); if (!g) return null;
  const xs = [...g.querySelectorAll('text[text-anchor=middle]')].filter(t => /^[-\u2212]?\d+(\.\d+)?$/.test(t.textContent.trim())); if (!xs.length) return null;
  const yb = Math.max(...xs.map(t => +t.getAttribute('y'))), row = xs.filter(t => Math.abs(+t.getAttribute('y') - yb) < 0.5);
  const v = row.map(t => +t.textContent.trim().replace(/\u2212/g, '-')); return {min: Math.min(...v), max: Math.max(...v), n: v.length}; }, which);
const plotAreas = p => p.evaluate(() => document.querySelectorAll('#paper svg clipPath[id$="plot-area"]').length);
const insetCount = p => p.evaluate(() => document.querySelectorAll('#paper svg [data-plot=inset]').length);

(async () => {
  /* overlay figure (Quick-Figure mode loads the example chromatograms) */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick'); await h.wait(900);
      T.check('overlay/off-by-default', (await plotAreas(p)) === 1 && (await insetCount(p)) === 0, 'one plot area and no inset with the option off');
      await setOpt(p, 'o-xmin', '5'); await setOpt(p, 'o-xmax', '8'); await setOpt(p, 'o-zoomWinA', '5'); await setOpt(p, 'o-zoomWinB', '8'); await h.wait(400);
      const offSvg = await p.evaluate(() => document.querySelector('#paper svg').outerHTML);

    const labelText = await p.evaluate(() => {
      const el = document.getElementById('o-zoomInset');
      return el && el.parentElement ? el.parentElement.textContent.trim() : null;
    });
    T.check('zoom_inset_label_text', labelText === 'Show Inset View: whole run, with the X window magnified', `Label is ${labelText}`);

    const xminLabel = await p.evaluate(() => {
      const el = document.getElementById('o-xmin');
      return el && el.parentElement ? el.parentElement.textContent.trim() : null;
    });
    T.check('chart_x_from_label_text', xminLabel === 'Chart X from', `Label is ${xminLabel}`);


      await setOpt(p, 'o-zoomInset', true); await h.wait(600);
      T.check('overlay/two-plot-areas', (await plotAreas(p)) === 2 && (await insetCount(p)) === 1, `plot areas ${await plotAreas(p)}`);

      const m = await ticksOf(p, 'main'), z = await ticksOf(p, 'inset');
      T.check('overlay/main-covers-full-run', !!m && m.max >= 12 && m.min <= 1, JSON.stringify(m));
      T.check('overlay/inset-covers-window-only', !!z && z.min >= 5 - 1e-9 && z.max <= 8 + 1e-9 && z.n >= 2, JSON.stringify(z));

      // Check Y-axis label on inset
      const hasInsetYLabel = await p.evaluate(() => {
        const svg = document.querySelector('#paper svg [data-plot=inset]');
        if (!svg) return false;
        // Search for text matching the ylabel in the inset group
        const texts = Array.from(svg.querySelectorAll('text'));
        return texts.some(t => /mAU/i.test(t.textContent));
      });
      T.check('overlay/inset-ylabel', hasInsetYLabel, 'Inset has Y-axis label');

      T.check('overlay/region-marked', await p.evaluate(() => !!document.querySelector('#paper svg #zoom-region rect') && document.querySelectorAll('#paper svg #zoom-region line').length >= 2), 'region rectangle and connector lines');
      T.check('overlay/connectors-orthogonal', await p.evaluate(() => {
        const lines = Array.from(document.querySelectorAll('#paper svg #zoom-region line'));
        return lines.length >= 2 && lines.every(l => Math.abs(+l.getAttribute('x1') - +l.getAttribute('x2')) < 0.05 || Math.abs(+l.getAttribute('y1') - +l.getAttribute('y2')) < 0.05);
      }), 'connectors use straight segments or orthogonal elbows');

      const editorGeo = await p.evaluate(() => {
        const r = document.querySelector('#paper svg #zoom-region rect');
        const lines = Array.from(document.querySelectorAll('#paper svg #zoom-region line')).map(l => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')]);
        const ins = document.querySelector('#paper svg [data-plot=inset]');
        const insRect = ins ? ins.querySelector('rect') : null;
        return {
          bounds: r ? [r.getAttribute('x'), r.getAttribute('y'), r.getAttribute('width'), r.getAttribute('height')] : null,
          viewport: [ins ? ins.getAttribute('transform') : null, insRect ? [insRect.getAttribute('width'), insRect.getAttribute('height')] : null],
          connectors: lines
        };
      });
      const [dl] = await Promise.all([
        p.waitForEvent('download', {timeout: 10000}),
        p.click('#saveSvg')
      ]);
      const stream = await dl.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const exportedSvg = Buffer.concat(chunks).toString('utf8');
      const exportGeo = await p.evaluate(svgText => {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const r = doc.querySelector('#zoom-region rect');
        const lines = Array.from(doc.querySelectorAll('#zoom-region line')).map(l => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')]);
        const ins = doc.querySelector('[data-plot=inset]');
        const insRect = ins ? ins.querySelector('rect') : null;
        return {
          bounds: r ? [r.getAttribute('x'), r.getAttribute('y'), r.getAttribute('width'), r.getAttribute('height')] : null,
          viewport: [ins ? ins.getAttribute('transform') : null, insRect ? [insRect.getAttribute('width'), insRect.getAttribute('height')] : null],
          connectors: lines
        };
      }, exportedSvg);
      T.check('export-parity/overlay-bounds', JSON.stringify(editorGeo.bounds) === JSON.stringify(exportGeo.bounds) && !!editorGeo.bounds, 'overlay bounds parity');
      T.check('export-parity/inset-viewport', JSON.stringify(editorGeo.viewport) === JSON.stringify(exportGeo.viewport) && !!editorGeo.viewport[0], 'inset viewport parity');
      T.check('export-parity/connector-endpoints', JSON.stringify(editorGeo.connectors) === JSON.stringify(exportGeo.connectors) && editorGeo.connectors.length >= 2, 'connector endpoints parity');

      await setOpt(p, 'o-xmin', '8'); await setOpt(p, 'o-xmax', '11'); await h.wait(400);
      T.check('overlay/non-abutting-connectors', await p.evaluate(() => {
        const lines = Array.from(document.querySelectorAll('#paper svg #zoom-region line'));
        return lines.length >= 2 && lines.every(l => Math.abs(+l.getAttribute('x1') - +l.getAttribute('x2')) < 0.05 || Math.abs(+l.getAttribute('y1') - +l.getAttribute('y2')) < 0.05);
      }), 'connectors maintained and orthogonal when geometry does not abut');

      await setOpt(p, 'o-xmin', '5'); await setOpt(p, 'o-xmax', '9'); await setOpt(p, 'o-zoomWinA', '5'); await setOpt(p, 'o-zoomWinB', '9'); await h.wait(400);
      T.check('overlay/abutting-connectors-suppressed', await p.evaluate(() => {
        return document.querySelectorAll('#paper svg #zoom-region line').length === 0;
      }), 'connectors suppressed when source and inset visibly abut');
      await setOpt(p, 'o-xmin', '5'); await setOpt(p, 'o-xmax', '8'); await setOpt(p, 'o-zoomWinA', '5'); await setOpt(p, 'o-zoomWinB', '8'); await h.wait(400);
      for (const pos of ['tl', 'br', 'beside']) {
        await setOpt(p, 'o-zoomInsetPos', pos); await h.wait(500);
        const zz = await ticksOf(p, 'inset'), mm = await ticksOf(p, 'main');
        T.check(`overlay/pos-${pos}`, (await plotAreas(p)) === 2 && !!zz && zz.min >= 5 - 1e-9 && zz.max <= 8 + 1e-9 && !!mm && mm.max >= 12, `inset ${JSON.stringify(zz)} main ${JSON.stringify(mm)}`);
      }
      await setOpt(p, 'o-zoomInsetPos', 'tr'); await setOpt(p, 'o-zoomInset', false); await h.wait(500);
      const back = await p.evaluate(() => document.querySelector('#paper svg').outerHTML);
      T.check('overlay/off-restores-figure', back === offSvg && (await plotAreas(p)) === 1, 'figure with the option off is the one from before');
      T.check('overlay/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('overlay/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  /* old saved settings (no zoom keys) load with the inset off */
  {
    const {p, close} = await open(), h = H(p);
    try {
      await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('hplc-fig-opt') || '{}'); delete o.zoomInset; delete o.zoomInsetPos; delete o.zoomInsetSize; localStorage.setItem('hplc-fig-opt', JSON.stringify(o)); });
      await p.reload(); await h.wait(900); await p.click('#homeQuick'); await h.wait(900);
      T.check('settings/old-saved-load-with-inset-off', (await plotAreas(p)) === 1 && !(await p.$eval('#o-zoomInset', e => e.checked)), 'no inset, checkbox off');
    } catch (e) { T.check('settings/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  /* ÄKTA run chart */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('zoom run'); await h.addRun(path.join(DATA, 'chrom', 'sec_S200_Increase_minutes_u7.csv')); await h.wait(500);
      await setOpt(p, 'o-xmin', '22'); await setOpt(p, 'o-xmax', '28'); await setOpt(p, 'o-zoomWinA', '22'); await setOpt(p, 'o-zoomWinB', '28'); await h.wait(500);
      await setOpt(p, 'o-zoomInset', true); await h.wait(700);
      const m = await ticksOf(p, 'main'), z = await ticksOf(p, 'inset');
      T.check('run/two-plot-areas', (await plotAreas(p)) === 2, `plot areas ${await plotAreas(p)}`);
      T.check('run/inset-covers-window', !!z && z.min >= 22 - 1e-9 && z.max <= 28 + 1e-9, JSON.stringify(z));
      T.check('run/main-wider-than-window', !!m && m.min <= 17 && m.max >= 33, JSON.stringify(m));
      await setOpt(p, 'o-zoomInset', false); await h.wait(500);
      T.check('run/off-one-plot-area', (await plotAreas(p)) === 1, 'inset removed');
      T.check('run/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('run/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  /* Dragging interactions: zoom vs integration mode */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('zoom drag'); await h.addRun(path.join(DATA, 'chrom', 'sec_S200_Increase_minutes_u7.csv')); await h.wait(500);
      const b = await p.evaluate(() => document.querySelector('#paper svg').getBoundingClientRect());

      // Default dragging: adds integration region
      await p.mouse.move(b.left + b.width / 3, b.top + b.height / 2);
      await p.mouse.down();
      await p.mouse.move(b.left + b.width * 2 / 3, b.top + b.height / 2, {steps: 10});
      await p.mouse.up();
      await h.wait(500);

      // Verify integration via DOM (table #intTable) instead of internal state
      const regions = await p.evaluate(() => document.querySelectorAll('#intTable tbody tr').length);
      T.check('drag/integration-mode-default', regions > 0, `integration regions in table: ${regions}`);

      // Shift drag acts as zoom mode without option
      await p.keyboard.down('Shift');
      await p.mouse.move(b.left + b.width / 4, b.top + b.height / 2);
      await p.mouse.down();
      await p.mouse.move(b.left + b.width / 2, b.top + b.height / 2, {steps: 10});
      await p.mouse.up();
      await p.keyboard.up('Shift');
      await h.wait(500);

      const newRegions = await p.evaluate(() => document.querySelectorAll('#intTable tbody tr').length);
      T.check('drag/zoom-mode-no-integration', newRegions === regions, `integration regions in table stayed at ${newRegions}`);

      const xmin = await p.$eval('#o-zoomWinA', e => e.value);
      const xmax = await p.$eval('#o-zoomWinB', e => e.value);
      T.check('drag/zoom-mode-updates-window', xmin !== '' && xmax !== '', `xmin: ${xmin}, xmax: ${xmax}`);

    } catch (e) { T.check('drag/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  /* Workflow Figure wfZoom option */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('wf zoom inset');
      await h.addRun(path.join(DATA, 'chrom', 'sec_S200_Increase_minutes_u7.csv')); await h.wait(500);
      await p.click('#tl [data-step="figure"]'); await h.wait(500);
      await setOpt(p, 'o-xmin', '22'); await setOpt(p, 'o-xmax', '28'); await h.wait(400);

      T.check('wf/inset-appears-when-wfZoom-on/off-by-default', (await insetCount(p)) === 0, 'no inset by default');

      const b = await p.evaluate(() => document.querySelector('#paper svg').getBoundingClientRect());
      await p.mouse.click(b.left + b.width / 2, b.top + b.height / 2); await h.wait(400);
      await p.evaluate(() => { const el = document.querySelector('#wfTool input[data-wfz="1"]'); if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); } });
      await h.wait(500);
      T.check('wf/inset-appears-when-wfZoom-on', (await insetCount(p)) === 1, 'inset count is 1 after enabling wfZoom');
      T.check('wf/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('wf/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  /* Aspect-ratio locked resizing and boundary clamping for zoom inset (Issue #1035) */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick'); await h.wait(900);
      await setOpt(p, 'o-zoomInset', true); await h.wait(500);

      const hasContainer = await p.evaluate(() => !!document.getElementById('zoomInsetContainer'));
      T.check('resize/container-id', hasContainer, '#zoomInsetContainer element exists');

      const handles = await p.evaluate(() => [...document.querySelectorAll('#zoomInsetContainer .zoom-inset-handles rect[data-handle]')].map(el => el.getAttribute('data-handle')));
      T.check('resize/handles-exist', handles.includes('se') && handles.includes('nw'), 'handles present: ' + handles.join(','));

      // Initial dimensions and aspect ratio
      const initBox = await p.evaluate(() => {
        const c = document.getElementById('zoomInsetContainer');
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, ratio: r.width / r.height };
      });

      // Drag 'se' handle to resize - without Shift (aspect ratio locked by default)
      const seBox = await p.evaluate(() => {
        const h = document.querySelector('#zoomInsetContainer [data-handle="se"]');
        const r = h.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      await p.mouse.move(seBox.x, seBox.y);
      await p.mouse.down();
      // Move diagonally with unequal delta X and Y to test aspect ratio locking
      await p.mouse.move(seBox.x + 60, seBox.y + 50, {steps: 5});
      await p.mouse.up();
      await h.wait(400);

      const lockedBox = await p.evaluate(() => {
        const c = document.getElementById('zoomInsetContainer');
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, ratio: r.width / r.height };
      });

      T.check('resize/aspect-ratio-locked-by-default',
        lockedBox.w > initBox.w && Math.abs(lockedBox.ratio - initBox.ratio) < 0.05,
        'initial ratio: ' + initBox.ratio.toFixed(3) + ', locked ratio: ' + lockedBox.ratio.toFixed(3) + ', w: ' + initBox.w.toFixed(1) + ' -> ' + lockedBox.w.toFixed(1));

      // Drag 'se' handle with Shift held - aspect ratio should be unlocked (freeform)
      const seBox2 = await p.evaluate(() => {
        const h = document.querySelector('#zoomInsetContainer [data-handle="se"]');
        const r = h.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      await p.keyboard.down('Shift');
      await p.mouse.move(seBox2.x, seBox2.y);
      await p.mouse.down();
      // Drag vertically downwards by 70px to change height independently of width
      await p.mouse.move(seBox2.x, seBox2.y + 70, {steps: 5});
      await p.mouse.up();
      await p.keyboard.up('Shift');
      await h.wait(400);

      const unlockedBox = await p.evaluate(() => {
        const c = document.getElementById('zoomInsetContainer');
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, ratio: r.width / r.height };
      });

      T.check('resize/aspect-ratio-unlocked-with-shift',
        Math.abs(unlockedBox.ratio - lockedBox.ratio) > 0.15,
        'unlocked ratio: ' + unlockedBox.ratio.toFixed(3) + ' vs locked ratio: ' + lockedBox.ratio.toFixed(3));

      // Boundary clamping: drag inset far beyond figure bottom-right bounds
      const seBox3 = await p.evaluate(() => {
        const h = document.querySelector('#zoomInsetContainer [data-handle="se"]');
        const r = h.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      await p.mouse.move(seBox3.x, seBox3.y);
      await p.mouse.down();
      await p.mouse.move(seBox3.x + 1000, seBox3.y + 1000, {steps: 5});
      await p.mouse.up();
      await h.wait(400);

      const clamped = await p.evaluate(() => {
        const svg = document.querySelector('#paper svg');
        const c = document.getElementById('zoomInsetContainer');
        const sRect = svg.getBoundingClientRect();
        const cRect = c.getBoundingClientRect();
        return {
          insideRight: cRect.right <= sRect.right + 1.5,
          insideBottom: cRect.bottom <= sRect.bottom + 1.5,
          insideLeft: cRect.left >= sRect.left - 1.5,
          insideTop: cRect.top >= sRect.top - 1.5,
          cRect: { right: cRect.right, bottom: cRect.bottom },
          sRect: { right: sRect.right, bottom: sRect.bottom }
        };
      });

      T.check('resize/boundary-clamped-inside-figure',
        clamped.insideRight && clamped.insideBottom && clamped.insideLeft && clamped.insideTop,
        'clamped within figure: ' + JSON.stringify(clamped));

      T.check('resize/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('resize/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  /* Source-local visibility recovery and a deterministic recomputed layout (Issue #1034). */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick'); await h.wait(900);
      await setOpt(p, 'o-zoomInset', true); await h.wait(500);
      const controls = await p.evaluate(() => ['zoomInsetHide', 'zoomInsetRestore', 'zoomInsetReset'].every(id => {
        const el = document.getElementById(id); return !!el && el.offsetParent !== null;
      }));
      T.check('layout/recovery-controls-visible', controls, 'Hide, Restore last visible, and Reset inset layout controls are visible');
      if (controls) {
        const initial = await p.$eval('#zoomInsetContainer', el => el.getAttribute('transform'));
        await p.click('#zoomInsetHide'); await h.wait(400);
        T.check('layout/hide-is-source-local', (await insetCount(p)) === 0, 'inset hidden without changing the window');
        await p.click('#zoomInsetRestore'); await h.wait(400);
        const restored = await p.$eval('#zoomInsetContainer', el => el.getAttribute('transform'));
        T.check('layout/restore-last-visible', restored === initial, `initial ${initial}, restored ${restored}`);

        const move = await p.evaluate(() => { const r = document.querySelector('#zoomInsetContainer [data-handle="move"]').getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; });
        await p.mouse.move(move.x, move.y); await p.mouse.down(); await p.mouse.move(move.x - 45, move.y + 35, {steps: 4}); await p.mouse.up(); await h.wait(400);
        const moved = await p.$eval('#zoomInsetContainer', el => el.getAttribute('transform'));
        await p.click('#zoomInsetReset'); await h.wait(400);
        const reset = await p.$eval('#zoomInsetContainer', el => el.getAttribute('transform'));
        T.check('layout/reset-recomputes-default', moved !== reset && reset === initial, `initial ${initial}, moved ${moved}, reset ${reset}`);
      }
      T.check('layout/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('layout/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }

  await T.t('zoom_inset_scope', async () => {
    const {p, close} = await open();
    const h = H(p);
    try {
      await h.newProject('ZoomScope');
      await h.addRun(path.join(DATA, 'chrom', 'sec_S200_Increase_minutes_u7.csv'));
      await h.wait(500);

      // Expand section for controls
      await p.evaluate(() => {
        const det = document.querySelector('section[data-for="overlay run"] details');
        if (det) det.open = true;
      });

      // Set custom bounds
      await p.evaluate(() => {
        const xmin = document.querySelector('#o-xmin');
        if (xmin) {
          xmin.value = '10';
          xmin.dispatchEvent(new Event('change', {bubbles: true}));
        }
        const xmax = document.querySelector('#o-xmax');
        if (xmax) {
          xmax.value = '20';
          xmax.dispatchEvent(new Event('change', {bubbles: true}));
        }
      });
      await h.wait(500);

      // Activate zoom mode and zoom inset
      await p.evaluate(() => {
        const zi = document.querySelector('#o-zoomInset');
        if (zi && !zi.checked) zi.click();
        const zm = document.querySelector('#o-zoomMode');
        if (zm && !zm.checked) zm.click();
      });
      await h.wait(500);

      // Get initial main chart xmin/xmax
      const xminBefore = await p.$eval('#o-xmin', el => el.value);
      const xmaxBefore = await p.$eval('#o-xmax', el => el.value);

      // Perform a drag gesture inside the zoom inset bounding box
      const insetBox = await p.$eval('#zoomInsetContainer', el => {
        const rect = el.getBoundingClientRect();
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
      });

      await p.mouse.move(insetBox.x, insetBox.y);
      await p.mouse.down();
      await p.mouse.move(insetBox.x + 20, insetBox.y + 20);
      await p.mouse.up();

      await h.wait(500);

      const xminAfter = await p.$eval('#o-xmin', el => el.value);
      const xmaxAfter = await p.$eval('#o-xmax', el => el.value);

      T.check('range_unchanged', xminBefore === xminAfter && xmaxBefore === xmaxAfter, `Main chart range changed from [${xminBefore}, ${xmaxBefore}] to [${xminAfter}, ${xmaxAfter}]`);
    } finally {
      await close();
    }
  });

  /* #1331: the inset's Y title is longer than the inset is tall, so the saved figure clips it (single run) or draws it
     across the main chart (workflow panel). Measured on the exported SVG: the inset's Y title inside the inset box and inside the figure. */
  const insetFits = async (h, tag) => {
    const svg = await h.exportSvg(), m = await h.svgBoxes(svg, '.zoom-inset-bg'), bx = m.box;
    T.check(`${tag}/inset-in-export`, !!bx, 'zoom-inset-bg rect in the saved SVG');
    if (!bx) return;
    T.check(`${tag}/inset-box-in-figure`, fits(bx, m.root, 1), `box ${JSON.stringify(bx)} root ${JSON.stringify(m.root)}`);
    /* the inset's Y title: the absorbance text centred inside the inset box (the main chart's own title sits at the figure's left edge) */
    const cin = t => t.x + t.w/2 >= bx.x && t.x + t.w/2 <= bx.right && t.y + t.h/2 >= bx.y && t.y + t.h/2 <= bx.bottom;
    const yt = m.texts.filter(t => cin(t) && /mAU|bsorbance/.test(t.t));
    const fmtB = t => `${t.t} (y ${t.y.toFixed(1)}..${t.bottom.toFixed(1)} vs box ${bx.y.toFixed(1)}..${bx.bottom.toFixed(1)}; x ${t.x.toFixed(1)}..${t.right.toFixed(1)} vs box ${bx.x.toFixed(1)}..${bx.right.toFixed(1)}; root y ${m.root.y.toFixed(1)}..${m.root.bottom.toFixed(1)})`;
    /* the defect this issue is about: the title ran off the page, or across the chromatogram, by about 15 units */
    T.check(`${tag}/inset-ytitle-not-clipped`, yt.every(t => fits(t, m.root, 2)), 'clipped: ' + yt.filter(t => !fits(t, m.root, 2)).map(fmtB).join(' | '));
    T.check(`${tag}/inset-ytitle-found`, yt.length > 0, 'no inset ordinate label found inside the inset box');
    /* Both axes asserted at 1 unit of slack: zoomYTitle fits the title to the inset's height, and the nested
       inset chart's left pad keeps the rotated glyphs inside the zoom-inset-bg rect (#1399). */
    const vout = yt.filter(t => t.y < bx.y - 1 || t.bottom > bx.bottom + 1);
    T.check(`${tag}/inset-ytitle-fits-box-height`, vout.length === 0, 'taller than the inset box: ' + vout.map(fmtB).join(' | '));
    const hout = yt.filter(t => t.x < bx.x - 1 || t.right > bx.right + 1);
    T.check(`${tag}/inset-ytitle-within-box-width`, hout.length === 0, 'beyond the inset box sides: ' + hout.map(fmtB).join(' | '));
  };
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('inset title run'); await h.addRun(src('his')); await h.wait(500);
      await setOpt(p, 'o-zoomInset', true); await h.wait(700);
      await insetFits(h, 'title-fit/run');
      T.check('title-fit/run/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('title-fit/run/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('inset title wf'); await h.addRun(src('his')); await h.addRun(src('q')); await h.step('figure'); await h.wait(600);
      /* select panel A by clicking inside it, below its title, as 42_figures does */
      const a = await p.evaluate(() => { const t = [...document.querySelectorAll('#paper svg text')].find(e => /^A\s/.test(e.textContent)); if (!t) return null; const r = t.getBoundingClientRect(); return {x: r.left, y: r.top}; });
      if (a) { await p.mouse.click(a.x + 30, a.y + 60); await h.wait(400); }
      const on = await p.evaluate(() => { const el = document.querySelector('#wfTool input[data-wfz]'); if (!el) return false; el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); return true; });
      await h.wait(600);
      T.check('title-fit/wf/inset-on', on && (await insetCount(p)) >= 1, 'wfZoom ticked for panel A');
      await insetFits(h, 'title-fit/wf');
      T.check('title-fit/wf/no-errors', errs.length === 0, errs.join(' | '));
    } catch (e) { T.check('title-fit/wf/threw', false, String(e).slice(0, 300)); } finally { await close(); }
  }

  /* #1580: inside legend must not be occluded by 'tr' zoom inset, and 'beside' + rotated peak labels must not clip at y < 0 */
  {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick'); await h.wait(700);
      const mkCsv = (hgt, sh) => {
        const rows = ['Time (min),UV (mAU)'];
        for (let i = 0; i <= 120; i++) {
          const t = i * 0.1, y = hgt * Math.exp(-0.5 * ((t - (6.0 + sh)) / 0.15) ** 2);
          rows.push(`${t.toFixed(2)},${y.toFixed(3)}`);
        }
        return Buffer.from(rows.join('\n'));
      };
      await p.setInputFiles('#file', [
        {name: 'Sample_A_replicate_1.csv', mimeType: 'text/csv', buffer: mkCsv(120, 0)},
        {name: 'Sample_B_replicate_2.csv', mimeType: 'text/csv', buffer: mkCsv(115, 0.05)},
        {name: 'Sample_C_replicate_3.csv', mimeType: 'text/csv', buffer: mkCsv(110, 0.10)}
      ]);
      await h.wait(800);
      await setOpt(p, 'o-zoomInset', true); await h.wait(500);
      const svg1 = await h.exportSvg(), m1 = await h.svgBoxes(svg1, '#zoom-inset'), bx1 = m1.box;
      const legTexts = m1.texts.filter(t => /Sample_[ABC]_replicate/.test(t.t));
      const legHits = bx1 ? legTexts.filter(t => Math.min(t.right, bx1.right) - Math.max(t.x, bx1.x) > 0.5 && Math.min(t.bottom, bx1.bottom) - Math.max(t.y, bx1.y) > 0.5) : legTexts;
      T.check('legend-avoid/no-inside-legend-overlap', !!bx1 && legTexts.length === 3 && legHits.length === 0,
        'overlapping legend texts: ' + legHits.map(t => t.t).join(', '));

      await setOpt(p, 'o-zoomInsetPos', 'beside');
      await setOpt(p, 'o-peakRot', true);
      await setOpt(p, 'o-peakDec', '3');
      await h.wait(500);
      const svg2 = await h.exportSvg(), m2 = await h.svgBoxes(svg2, '#zoom-inset');
      T.check('beside-rot/no-clipped-peak-labels', m2.clipped.length === 0 && errs.length === 0,
        'clipped: ' + m2.clipped.join(', ') + (errs.length ? ' | errs: ' + errs.join(' | ') : ''));
    } catch (e) {
      T.check('legend-avoid/no-inside-legend-overlap', false, String(e).slice(0, 300));
      T.check('beside-rot/no-clipped-peak-labels', false, String(e).slice(0, 300));
    } finally { await close(); }
  }

  /* Helper to render an exported SVG in a clean browser page and run a geometry inspection callback */
  const inspectSvg = async (p, svg, fn) => {
    const pg = await p.context().newPage();
    try {
      await pg.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:0">' + svg + '</body>');
      await pg.waitForSelector('svg', {timeout: 5000});
      return await pg.evaluate(fn);
    } finally { await pg.close(); }
  };

  /* #1619: multi-panel workflow insets stay strictly inside .zoom-inset-bg, keep unique clipPath IDs, avoid tick collisions, and drag independently */
  await T.t('wf-multi', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('wf multi inset');
      for (const k of ['his', 'q', 's200']) { await h.addRun(src(k)); await h.suggest(); }
      await h.step('figure'); await h.wait(600);
      for (const ch of ['A', 'B', 'C']) {
        const pt = await p.evaluate(c => {
          const e = [...document.querySelectorAll('#paper svg text')].find(x => new RegExp('^' + c + '\\s').test(x.textContent));
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return {x: r.left + 30, y: r.top + 60};
        }, ch);
        if (pt) {
          await p.mouse.click(pt.x, pt.y); await h.wait(250);
          await p.evaluate(() => {
            const el = document.querySelector('#wfTool input[data-wfz]');
            if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); }
          });
          await h.wait(350);
        }
      }
      await p.keyboard.press('Escape'); await h.wait(300);

      const svg = await h.exportSvg(), m = await h.svgBoxes(svg);
      const wfGeo = await inspectSvg(p, svg, () => {
        const clips = [...document.querySelectorAll('svg clipPath[id]')].map(c => c.id);
        const dupClips = clips.filter((id, i) => clips.indexOf(id) !== i);
        const insets = [...document.querySelectorAll('svg .zoom-inset')];
        const spills = [];
        insets.forEach((ins, idx) => {
          const bg = ins.querySelector('.zoom-inset-bg');
          if (!bg) { spills.push(`panel ${idx}: missing .zoom-inset-bg`); return; }
          const br = bg.getBoundingClientRect();
          [...ins.querySelectorAll('line, path, text')].forEach(el => {
            if (el.tagName.toLowerCase() === 'text' && !el.textContent.trim()) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            if (r.left < br.left - 2 || r.right > br.right + 2 || r.top < br.top - 2 || r.bottom > br.bottom + 2) {
              spills.push(`panel ${idx} ${el.tagName}(${(el.textContent || '').trim()}): ${r.left.toFixed(1)}..${r.right.toFixed(1)} vs bg ${br.left.toFixed(1)}..${br.right.toFixed(1)}`);
            }
          });
        });
        return {nInsets: insets.length, nClips: clips.length, dupClips, spills};
      });
      const textOv = [];
      for (let i = 0; i < m.texts.length; i++) {
        for (let j = i + 1; j < m.texts.length; j++) {
          const a = m.texts[i], b = m.texts[j];
          const w = Math.min(a.right, b.right) - Math.max(a.x, b.x), hh = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          if (w > 0 && hh > 0 && w * hh > 0.22 * Math.min(a.w * a.h, b.w * b.h)) textOv.push(`"${a.t}" vs "${b.t}"`);
        }
      }
      T.check('wf-multi/unique-clip-paths', wfGeo.nInsets === 3 && wfGeo.dupClips.length === 0, `insets=${wfGeo.nInsets} dups=${wfGeo.dupClips.join(',')}`);
      T.check('wf-multi/insets-contained-in-bg', wfGeo.nInsets === 3 && wfGeo.spills.length === 0, wfGeo.spills.slice(0, 5).join(' | '));
      T.check('wf-multi/no-text-overlaps', textOv.length === 0 && m.clipped.length === 0, textOv.concat(m.clipped).slice(0, 5).join(' | '));

      /* Dragging panel B's inset handle moves panel B's inset independently without moving panel A's inset */
      const before = await p.evaluate(() => [...document.querySelectorAll('#paper svg .zoom-inset')].map(e => e.getAttribute('transform')));
      const bMove = await p.evaluate(() => {
        const ins = document.querySelectorAll('#paper svg .zoom-inset')[1];
        const hdl = ins && ins.querySelector('[data-handle="move"]');
        if (!hdl) return null;
        const r = hdl.getBoundingClientRect();
        return {x: r.left + r.width / 2, y: r.top + r.height / 2};
      });
      if (bMove) {
        await p.mouse.move(bMove.x, bMove.y);
        await p.mouse.down();
        await p.mouse.move(bMove.x + 28, bMove.y + 18, {steps: 5});
        await p.mouse.up();
        await h.wait(400);
      }
      const after = await p.evaluate(() => [...document.querySelectorAll('#paper svg .zoom-inset')].map(e => e.getAttribute('transform')));
      T.check('wf-multi/drag-panel-inset', before.length === 3 && after.length === 3 && before[1] !== after[1] && before[0] === after[0],
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      T.check('wf-multi/no-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* #1620 & #1621: default ÄKTA full-run overview + pooled-fraction magnification, peak/label avoidance, and automatic headroom */
  await T.t('akta-nonblocking', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('akta nonblocking');
      await h.addRun(src('his'));
      await h.suggest();
      await setOpt(p, 'o-zoomInset', true); await h.wait(600);

      const mHis = await ticksOf(p, 'main'), zHis = await ticksOf(p, 'inset');
      T.check('akta-nonblocking/his-main-full-run', !!mHis && mHis.min <= 5 && mHis.max >= 35, JSON.stringify(mHis));
      const svgHis = await h.exportSvg();
      const hisCheck = await inspectSvg(p, svgHis, () => {
        const bg = document.querySelector('svg .zoom-inset-bg');
        const insPaths = [...document.querySelectorAll('svg .zoom-inset path')];
        if (!bg || !insPaths.length) return {ok: false, why: 'missing inset elements'};
        const br = bg.getBoundingClientRect(), pr = insPaths[insPaths.length - 1].getBoundingClientRect();
        const spanFrac = br.height > 0 ? pr.height / br.height : 0;
        return {ok: spanFrac >= 0.3, spanFrac};
      });
      T.check('akta-nonblocking/his-inset-magnifies-pool',
        !!zHis && zHis.min >= 18 && zHis.max <= 27 && hisCheck.ok,
        `zTicks=${JSON.stringify(zHis)} span=${hisCheck.spanFrac && hisCheck.spanFrac.toFixed(2)}`);

      /* SEC run: default tr placement moves clear of the 28.40 min monomer peak and its label */
      await h.addRun(src('s200'));
      await h.suggest();
      await setOpt(p, 'o-zoomInset', true); await h.wait(600);
      const svgSec = await h.exportSvg();
      const secCheck = await inspectSvg(p, svgSec, () => {
        const bg = document.querySelector('svg .zoom-inset-bg');
        const mainPlot = document.querySelector('svg [data-plot="main"]');
        if (!bg || !mainPlot) return {ok: false, hits: ['missing elements']};
        const br = bg.getBoundingClientRect(), hits = [];
        [...mainPlot.querySelectorAll('text')].forEach(t => {
          const txt = t.textContent.trim(); if (!txt) return;
          const r = t.getBoundingClientRect();
          if (Math.min(r.right, br.right) - Math.max(r.left, br.left) > 1 && Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top) > 1) hits.push('text:' + txt);
        });
        /* Sample the main UV chromatogram curve (last stroke path in clip-path url(#plot-area)) */
        const paths = [...mainPlot.querySelectorAll('g[clip-path] path[fill="none"], g[clip-path][fill="none"] path')];
        const uvPath = paths[paths.length - 1];
        if (uvPath && uvPath.getTotalLength) {
          const len = uvPath.getTotalLength(), ctm = uvPath.getScreenCTM();
          for (let i = 0; i <= 240; i++) {
            const pt = uvPath.getPointAtLength(len * i / 240).matrixTransform(ctm);
            if (pt.x >= br.left + 1 && pt.x <= br.right - 1 && pt.y >= br.top + 1 && pt.y <= br.bottom - 1) { hits.push(`curve@${pt.x.toFixed(0)},${pt.y.toFixed(0)}`); break; }
          }
        }
        return {ok: hits.length === 0, hits};
      });
      T.check('akta-nonblocking/s200-no-peak-or-label-blocked', secCheck.ok, secCheck.hits.join(', '));
      T.check('akta-nonblocking/no-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* #1621: crowded 3-peak chromatogram expands headroom automatically; Beside & Above callout modes keep connectors clean */
  await T.t('callout-modes', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick'); await h.wait(700);
      const rows = ['Time (min),UV (mAU)'];
      for (let i = 0; i <= 240; i++) {
        const t = i * 0.05;
        const y = 140 * Math.exp(-0.5 * ((t - 1.8) / 0.35) ** 2)
          + 45 * Math.exp(-0.5 * ((t - 6.0) / 0.25) ** 2)
          + 150 * Math.exp(-0.5 * ((t - 10.2) / 0.35) ** 2);
        rows.push(`${t.toFixed(2)},${y.toFixed(3)}`);
      }
      await p.setInputFiles('#file', [{name: 'Crowded_3peak.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n'))}]);
      await h.wait(700);
      await p.click('#detectAll'); await h.wait(350);
      await setOpt(p, 'o-zoomWinA', '5'); await setOpt(p, 'o-zoomWinB', '7');
      await setOpt(p, 'o-zoomInset', true); await h.wait(500);

      const svgHead = await h.exportSvg();
      const headCheck = await inspectSvg(p, svgHead, () => {
        const bg = document.querySelector('svg .zoom-inset-bg');
        const mainPlot = document.querySelector('svg [data-plot="main"]');
        if (!bg || !mainPlot) return {ok: false, hits: ['missing elements']};
        const br = bg.getBoundingClientRect(), hits = [];
        [...mainPlot.querySelectorAll('text')].forEach(t => {
          const txt = t.textContent.trim(); if (!txt) return;
          const r = t.getBoundingClientRect();
          if (Math.min(r.right, br.right) - Math.max(r.left, br.left) > 1 && Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top) > 1) hits.push('text:' + txt);
        });
        const uvPath = mainPlot.querySelector('g[clip-path] path');
        if (uvPath && uvPath.getTotalLength) {
          const len = uvPath.getTotalLength(), ctm = uvPath.getScreenCTM();
          for (let i = 0; i <= 240; i++) {
            const pt = uvPath.getPointAtLength(len * i / 240).matrixTransform(ctm);
            if (pt.x >= br.left + 1 && pt.x <= br.right - 1 && pt.y >= br.top + 1 && pt.y <= br.bottom - 1) { hits.push(`curve@${pt.x.toFixed(0)},${pt.y.toFixed(0)}`); break; }
          }
        }
        return {ok: hits.length === 0, hits};
      });
      T.check('callout-modes/crowded-headroom-clears-peaks', headCheck.ok, headCheck.hits.join(', '));

      /* Beside mode: no opaque rect inside #zoom-inset covers #zoom-region connector lines, and connectors clear the 10.20 peak */
      await setOpt(p, 'o-zoomInsetPos', 'beside'); await h.wait(500);
      const svgBeside = await h.exportSvg();
      const besideCheck = await inspectSvg(p, svgBeside, () => {
        const ins = document.querySelector('svg #zoom-inset');
        const lines = [...document.querySelectorAll('svg #zoom-region line')];
        if (!ins || lines.length < 2) return {ok: false, why: 'missing inset or connectors'};
        const opaqueRects = [...ins.querySelectorAll('rect')].filter(r => {
          const cs = getComputedStyle(r);
          return cs.fill !== 'none' && parseFloat(cs.fillOpacity || '1') > 0.05;
        }).map(r => r.getBoundingClientRect());
        const covered = lines.some(l => {
          const lr = l.getBoundingClientRect();
          return opaqueRects.some(rr => Math.min(lr.right, rr.right) - Math.max(lr.left, rr.left) > 2 && Math.min(lr.bottom, rr.bottom) - Math.max(lr.top, rr.top) > 0.5);
        });
        const p10 = [...document.querySelectorAll('svg [data-plot="main"] text')].find(t => /10\.2/.test(t.textContent));
        const pr = p10 ? p10.getBoundingClientRect() : null;
        const hitsPeak = pr ? lines.some(l => {
          const lr = l.getBoundingClientRect();
          return Math.min(lr.right, pr.right) - Math.max(lr.left, pr.left) > 1 && Math.min(lr.bottom, pr.bottom) - Math.max(lr.top, pr.top) > 0.5;
        }) : false;
        return {ok: !covered && !hitsPeak, covered, hitsPeak};
      });
      T.check('callout-modes/beside-connectors-unoccluded', besideCheck.ok, JSON.stringify(besideCheck));

      /* Above callout panel mode: zoomed panel sits completely above main plot area with orthogonal connectors */
      await setOpt(p, 'o-zoomInsetPos', 'above'); await h.wait(500);
      const posVal = await p.$eval('#o-zoomInsetPos', e => e.value);
      const svgAbove = await h.exportSvg(), mAbove = await h.svgBoxes(svgAbove);
      const aboveCheck = await inspectSvg(p, svgAbove, () => {
        const insGrp = document.querySelector('svg [data-plot="inset"]');
        const mainGrp = document.querySelector('svg [data-plot="main"]');
        const lines = [...document.querySelectorAll('svg #zoom-region line')];
        if (!insGrp || !mainGrp) return {ok: false, why: 'missing groups'};
        const ir = insGrp.getBoundingClientRect(), mr = mainGrp.getBoundingClientRect();
        const ortho = lines.length >= 2 && lines.every(l => Math.abs(+l.getAttribute('x1') - +l.getAttribute('x2')) < 0.05 || Math.abs(+l.getAttribute('y1') - +l.getAttribute('y2')) < 0.05);
        return {ok: ir.bottom <= mr.top + 4 && ortho, irBottom: ir.bottom, mrTop: mr.top, ortho};
      });
      T.check('callout-modes/above-separates-panels',
        posVal === 'above' && aboveCheck.ok && mAbove.clipped.length === 0 && errs.length === 0,
        `pos=${posVal} above=${JSON.stringify(aboveCheck)} clipped=${mAbove.clipped.join(',')}`);
    } finally { await close(); }
  });

  /* A full workflow figure (IMAC with its gel, anion exchange, SEC) with every panel's inset on: each inset must really magnify its
     window (its plot area wider than the marked source region: on a 0.35-wide inset the axis chrome left less than the region's own width), cover no text of its own panel's main plot, and no
     connector may run horizontally over the marked region (where it reads as a second frame on it) or cross a label. Measured on the exported SVG. */
  await T.t('wf-readable', async () => {
    const {p, errs, close} = await open({width: 1600, height: 1100}), h = H(p);
    try {
      await h.newProject('wf readable inset');
      for (const k of ['his', 'q', 's200']) { await h.addRun(src(k)); await h.suggest(); if (k === 'his') { await p.setInputFiles('#gelFile', src('gel')); await h.wait(2500); } }
      await h.step('figure'); await h.wait(700);
      for (const ch of ['A', 'B', 'C']) {
        const pt = await p.evaluate(c => { const e = [...document.querySelectorAll('#paper svg text')].find(x => new RegExp('^' + c + '\\s').test(x.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.left + 30, y: r.top + 60}; }, ch);
        if (!pt) continue;
        await p.mouse.click(pt.x, pt.y); await h.wait(300);
        await p.evaluate(() => { const el = document.querySelector('#wfTool input[data-wfz]'); if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); } });
        await h.wait(400);
      }
      await p.keyboard.press('Escape'); await h.wait(300);
      const svg = await h.exportSvg(), m = await h.svgBoxes(svg);
      const g = await inspectSvg(p, svg, () => {
        const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))*Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return [...document.querySelectorAll('svg .zoom-inset')].map(ins => {
          const host = ins.parentElement, bg = ins.querySelector('.zoom-inset-bg'), reg = host.querySelector(':scope > .zoom-inset-region'), main = host.querySelector(':scope > [data-plot="main"]');
          if (!bg || !reg || !main) return {bad: 'missing parts'};
          const br = bg.getBoundingClientRect(), cp = ins.querySelector('clipPath[id$="zi-plot-area"] rect');
          if (!cp) return {bad: 'no inset plot area'};
          /* the inset's plot area and the marked region are both in the panel's own units */
          const cw = +cp.getAttribute('width'), sw = +reg.querySelector('rect').getAttribute('width');
          const covered = [...main.querySelectorAll('text')].filter(t => t.textContent.trim() && ov(t.getBoundingClientRect(), br) > 1).map(t => t.textContent.trim());
          /* a horizontal connector run over the marked region, outside the inset, reads as a second frame on it (connectors and the region share the panel's coordinates) */
          const rr = reg.querySelector('rect'), rx0 = +rr.getAttribute('x'), rx1 = rx0 + +rr.getAttribute('width'), ry0 = +rr.getAttribute('y');
          const along = [...reg.querySelectorAll('line')].map(l => [+l.getAttribute('x1'), +l.getAttribute('y1'), +l.getAttribute('x2'), +l.getAttribute('y2')])
            .filter(([x1, y1, x2, y2]) => Math.abs(y1 - y2) < 0.05 && y1 < ry0 - 0.5 && Math.min(Math.max(x1, x2), rx1) - Math.max(Math.min(x1, x2), rx0) > 2).length;
          const tb = [...main.querySelectorAll('text')].filter(t => t.textContent.trim()).map(t => ({t: t.textContent.trim(), r: t.getBoundingClientRect()}));
          const crossed = [...reg.querySelectorAll('line')].flatMap(l => { const lr = l.getBoundingClientRect(), r2 = {left: lr.left - 0.3, right: lr.right + 0.3, top: lr.top - 0.3, bottom: lr.bottom + 0.3}; return tb.filter(o => ov(r2, o.r) > 0.6).map(o => o.t); });
          return {mag: sw > 0 ? cw/sw : 0, covered, along, crossed};
        });
      });
      const bad = g.filter(x => x.bad);
      T.check('wf-readable/three-insets', g.length === 3 && !bad.length, `insets=${g.length} ${JSON.stringify(bad)}`);
      T.check('wf-readable/insets-magnify', g.length === 3 && g.every(x => x.mag >= 1.2), 'magnification ' + g.map(x => (x.mag || 0).toFixed(2)).join(', '));
      T.check('wf-readable/insets-cover-no-main-text', g.length === 3 && g.every(x => x.covered && !x.covered.length), g.map(x => (x.covered || []).join('|')).join(' ; '));
      T.check('wf-readable/no-connector-over-region', g.length === 3 && g.every(x => x.along === 0), 'horizontal connector runs over the marked region: ' + g.map(x => x.along).join(', '));
      T.check('wf-readable/connectors-cross-no-text', g.length === 3 && g.every(x => x.crossed && !x.crossed.length), 'connectors cross: ' + g.map(x => (x.crossed || []).join('|')).join(' ; '));
      T.check('wf-readable/nothing-clipped', m.clipped.length === 0 && errs.length === 0, m.clipped.concat(errs).slice(0, 5).join(' | '));
    } finally { await close(); }
  });

  /* A workflow step can show its magnified window as a large second panel beside the full chromatogram ("As: Large panel"), while other
     steps keep the inset. Measured on the exported SVG: the large panel's plot is about as big as the full trace's, sits wholly to the
     right of it, collides with nothing, and the choice is saved with the project. */
  await T.t('wf-panel', async () => {
    const {p, errs, close} = await open({width: 1600, height: 1100}), h = H(p);
    try {
      await h.newProject('wf large zoom panel');
      for (const k of ['his', 'q', 's200']) { await h.addRun(src(k)); await h.suggest(); }
      await h.step('figure'); await h.wait(700);
      const pick = async (ch, style) => {
        const pt = await p.evaluate(c => { const e = [...document.querySelectorAll('#paper svg text')].find(x => new RegExp('^' + c + '\\s').test(x.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.left + 30, y: r.top + 60}; }, ch);
        if (!pt) return null;
        await p.mouse.click(pt.x, pt.y); await h.wait(300);
        const before = await p.evaluate(() => { const s = document.querySelector('#wfTool select[data-wfzs]'); return s ? {disabled: s.disabled, opts: [...s.options].map(o => o.value)} : null; });
        await p.evaluate(() => { const el = document.querySelector('#wfTool input[data-wfz]'); if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); } });
        await h.wait(400);
        const sel = await p.$('#wfTool select[data-wfzs]'); let enabled = false;
        if (sel) { enabled = !(await sel.isDisabled()); if (style) { await sel.selectOption(style); await h.wait(600); } }
        await p.keyboard.press('Escape'); await h.wait(300);
        return {before, enabled};
      };
      const a = await pick('A'), b = await pick('B'), c = await pick('C', 'panel');
      T.check('wf-panel/choice-offered', !!(c && c.before && c.before.disabled && c.enabled && c.before.opts.join() === 'inset,panel'), JSON.stringify(c));
      const svg = await h.exportSvg(), m = await h.svgBoxes(svg);
      const g = await inspectSvg(p, svg, () => {
        const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))*Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return [...document.querySelectorAll('svg .zoom-inset')].map(ins => {
          const host = ins.parentElement, main = host.querySelector(':scope > [data-plot="main"]'), mp = main && main.querySelector('clipPath[id$="plot-area"]:not([id*="zi-"]) rect'), zp = ins.querySelector('clipPath[id$="zi-plot-area"] rect');
          if (!main || !mp || !zp) return {bad: 'missing parts'};
          const bgd = !!ins.querySelector('.zoom-inset-bg'), mt = [...main.querySelectorAll('text')].filter(t => t.textContent.trim()).map(t => t.getBoundingClientRect()), zt = [...ins.querySelectorAll('text')].filter(t => t.textContent.trim()).map(t => t.getBoundingClientRect());
          const ir = ins.getBoundingClientRect(), mRight = Math.max(...mt.map(r => r.right));
          return {inset: bgd, wr: +zp.getAttribute('width')/+mp.getAttribute('width'), hr: +zp.getAttribute('height')/+mp.getAttribute('height'), leftOfZoom: ir.left - mRight, hits: zt.reduce((n, r) => n + mt.filter(q => ov(r, q) > 0.5).length, 0)};
        });
      });
      const big = g.filter(x => !x.bad && !x.inset), small = g.filter(x => !x.bad && x.inset);
      T.check('wf-panel/one-large-panel-two-insets', g.length === 3 && big.length === 1 && small.length === 2, JSON.stringify(g));
      T.check('wf-panel/panel-as-big-as-trace', big.length === 1 && big[0].wr >= 0.8 && big[0].hr >= 0.9, big.length ? `width ${big[0].wr.toFixed(2)}, height ${big[0].hr.toFixed(2)} of the full trace` : 'no large panel');
      T.check('wf-panel/panel-beside-not-over', big.length === 1 && big[0].leftOfZoom >= 0, big.length ? `gap to the full trace's rightmost text ${big[0].leftOfZoom.toFixed(1)} px` : 'no large panel');
      T.check('wf-panel/no-collisions', big.length === 1 && big[0].hits === 0 && m.clipped.length === 0 && errs.length === 0, JSON.stringify({hits: big.length && big[0].hits, clipped: m.clipped.slice(0, 3), errs: errs.slice(0, 3)}));
      const dl = p.waitForEvent('download', {timeout: 10000}).catch(() => null); await p.click('#projSave'); const d = await dl; let saved = null;
      if (d) { const fp = path.join(require('os').tmpdir(), 'wf_panel_' + Date.now() + '.json'); await d.saveAs(fp); const fsm = require('fs'), j = JSON.parse(fsm.readFileSync(fp, 'utf8')); fsm.rmSync(fp, {force: true}); saved = JSON.stringify(j).match(/"wfZoomStyle":"(\w+)"/g); }
      T.check('wf-panel/choice-saved-with-project', !!(saved && saved.length === 1 && saved[0].includes('panel')), JSON.stringify(saved));
    } finally { await close(); }
  });

  T.done();

})();
