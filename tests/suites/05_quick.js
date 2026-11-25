// Quick-Figure mode: checks behavior of `#quick` URL and Quick button on home screen.
// UI and DOM only.
const {open, H, suite, src, fs, path, APP} = require('../lib/harness');

(async () => {
  const T = suite('05_quick'), {b, ctx, p, errs, close} = await open(), h = H(p);

  await T.t('quick_mode', async () => {
    // 1. Open the app with `#quick`
    // Go home, then to quick mode, ensuring example data generates
    await p.click('#homeBtn').catch(() => {});
    await h.wait(500);
    await p.click('#homeQuick');
    await h.wait(1500);

    // Make sure we evaluate something that gives time for traces to show
    const getTraces = async () => await p.$$eval('.trace', els => els.map(e => ({kind: e.dataset.kind, name: e.querySelector('.name') ? e.querySelector('.name').value || e.querySelector('.name').textContent : ''})));
    let traces = await getTraces();

    T.check('example_data_loaded', traces.length > 0, `Example chromatograms should load. Found: ${JSON.stringify(traces)}`);

    // Check we are not in home screen anymore and view is visible
    const isProj = await p.evaluate(() => document.body.classList.contains('proj'));
    T.check('not_in_proj', !isProj, 'Should not be in a project');
    const isAppHidden = await p.evaluate(() => document.querySelector('.app') ? document.querySelector('.app').hidden : true);
    T.check('in_project_view', !isAppHidden, 'App view should be visible');

    // 3. Dropping a synthetic HPLC CSV adds a trace
    const initialTraceCount = traces.length;
    await h.dropFiles(src('s200')); // 's200' points to 'chrom/sec_S200_Increase_minutes_u7.csv'
    await h.wait(1000);

    const newTraces = await getTraces();
    // Trace count increases, or if dropping replaces, check that there is at least one run
    const runTraces = newTraces.filter(t => t.kind === 'run');
    T.check('trace_added', runTraces.length > 0, `Added a run trace. Found: ${JSON.stringify(newTraces)}`);

    const uiPolish = await p.evaluate(() => {
      const h2 = document.querySelector('#dataPanel > h2');
      const h2Cs = h2 ? getComputedStyle(h2) : null;
      const h2After = h2 ? getComputedStyle(h2, '::after') : null;
      const tabs = [...document.querySelectorAll('#figtabs [role="tab"]')];
      return {
        h2Cursor: h2Cs ? h2Cs.cursor : '',
        h2AfterContent: h2After ? h2After.content : '',
        tabCount: tabs.length,
        tabsAriaOk: tabs.length >= 1 && tabs.every(t => t.hasAttribute('aria-selected') && !t.hasAttribute('aria-pressed'))
      };
    });
    T.check('data_heading_non_collapsible', uiPolish.h2Cursor === 'default' && uiPolish.h2AfterContent === 'none', JSON.stringify(uiPolish));
    T.check('figtabs_aria_selected_without_pressed', uiPolish.tabsAriaOk, JSON.stringify(uiPolish));

    // 4. SVG and PNG export work
    const download = async (selector, timeout = 10000) => {
      const loc = p.locator(selector);
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const [dl] = await Promise.all([
        p.waitForEvent('download', { timeout }).catch(() => null),
        loc.click()
      ]);
      return !!dl;
    };

    // Make sure figure settings groups are open
    await p.evaluate(() => {
      document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
      document.querySelectorAll('details').forEach(d => d.open = true);
    });
    await h.wait(500);

    const svgOk = await download('#saveSvg');
    T.check('svg_export', svgOk, 'SVG download triggered');

    const pngOk = await download('#savePng');
    T.check('png_export', pngOk, 'PNG download triggered');

    // 5. Nothing is saved as a project (home screen project list unchanged after reload)
    await p.click('#homeBtn');
    await h.wait(500);

    const getProjects = () => p.$$eval('#projList .p-card .p-name', els => els.map(e => e.textContent.trim()));
    const projectsBefore = await getProjects();

    // Reload the page
    await p.reload();
    await h.wait(1000);

    const projectsAfter = await getProjects();
    T.check('no_project_saved', JSON.stringify(projectsBefore) === JSON.stringify(projectsAfter), 'Project list should not change');

    // 6. Switching back to a project and then to Quick mode again does not mix traces
    await h.newProject('Test Project');
    await h.wait(500);

    // Add a file to this project
    await h.addRun(src('s200'));
    await h.wait(1000);

    const projectTraces = await p.$$eval('.trace', els => els.length);
    T.check('project_has_trace', projectTraces > 0, `Project has ${projectTraces} traces`);

    // Go home, then Quick mode again
    await p.click('#homeBtn');
    await h.wait(500);

    await p.click('#homeQuick');
    await h.wait(1500);

    const quickTracesAfter = await p.$$eval('.trace', els => els.length);
    T.check('quick_traces_reset', quickTracesAfter === (initialTraceCount > 0 ? initialTraceCount : 2), `Quick mode has ${quickTracesAfter} traces, expected ${initialTraceCount > 0 ? initialTraceCount : 2} (no mix)`);
  });

  await T.t('home_drop_auto_quick_and_button_labels', async () => {
    const {p: p2, errs: errs2, close: close2} = await open(), h2 = H(p2);
    try {
      await h2.wait(400);
      const homeCta = await p2.evaluate(() => {
        const vis = e => !!(e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        const prims = [...document.querySelectorAll('#home .btn.primary')].filter(vis).map(e => e.id || e.textContent.trim());
        const mv = document.querySelector('#homeMove'), rn = document.querySelector('#homeRename');
        const emp = document.querySelector('#projList .empty-p');
        return {
          prims,
          formVis: vis(document.querySelector('#newProj')) && vis(document.querySelector('#npName')) && vis(document.querySelector('#homeNewProj')),
          mvDisabled: !!(mv && mv.disabled),
          rnDisabled: !!(rn && rn.disabled),
          emptyAlign: emp ? getComputedStyle(emp).textAlign : 'center'
        };
      });
      T.check('home_single_primary_cta_and_disabled_selection_actions',
        homeCta.prims.length === 1 && homeCta.formVis && homeCta.mvDisabled && homeCta.rnDisabled && homeCta.emptyAlign === 'center',
        JSON.stringify(homeCta));
      const homeImportTxt = await p2.$eval('#homeImport', e => e.textContent.trim());
      T.check('home_import_btn_label', homeImportTxt === 'Open project (.json)', `got "${homeImportTxt}"`);

      // Dropping an unsupported .pdf on #home stays on #home with an error toast
      await p2.locator('#toast').evaluate(e => e.replaceChildren());
      await p2.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['%PDF-1.4'], 'unsupported.pdf', {type: 'application/pdf'}));
        document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true}));
      });
      await h2.wait(400);
      const pdfHomeVis = await p2.$eval('#home', e => !e.hidden);
      const pdfAppHid = await p2.$eval('.app', e => e.hidden);
      const pdfToasts = await h2.toasts();
      T.check('home_drop_pdf_stays_home', pdfHomeVis && pdfAppHid && pdfToasts.some(t => /Could not read unsupported\.pdf/i.test(t)), `home=${pdfHomeVis} appHid=${pdfAppHid} toasts=${pdfToasts.join(' | ')}`);

      // Dropping a chromatogram CSV on #home enters Quick mode and renders on #paper svg
      await p2.evaluate(() => {
        const csv = 'Time (min),UV 280 (mAU)\n0.0,1.0\n1.0,85.0\n2.0,4.0\n3.0,1.0\n';
        const dt = new DataTransfer();
        dt.items.add(new File([csv], 'home_drop_trace.csv', {type: 'text/csv'}));
        document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true}));
      });
      await h2.wait(700);
      const homeHid = await p2.$eval('#home', e => e.hidden);
      const appVis = await p2.$eval('.app', e => !e.hidden);
      const quickSaveVis = await p2.$eval('#quickSave', e => !e.hidden);
      const projOpenTxt = await p2.$eval('#projOpen', e => e.textContent.trim());
      const projSaveTxt = await p2.$eval('#projSave', e => e.textContent.trim());
      const svgDrawn = await p2.$eval('#paper svg', e => !!e && e.querySelectorAll('path').length > 0).catch(() => false);
      const names1 = await p2.$$eval('#list .trace [data-k="name"]', els => els.map(e => e.value.trim()));
      T.check('home_drop_csv_enters_quick_and_renders', homeHid && appVis && quickSaveVis && svgDrawn && names1.includes('home_drop_trace'), `homeHid=${homeHid} appVis=${appVis} quickSave=${quickSaveVis} svg=${svgDrawn} names=${JSON.stringify(names1)}`);
      T.check('header_open_and_export_labels', projOpenTxt === 'Open project (.json)' && projSaveTxt === 'Export project', `open="${projOpenTxt}" save="${projSaveTxt}"`);

      // Returning to #home stashes QUICK, and dropping a second CSV restores QUICK instead of wiping it
      if (await p2.isVisible('#homeBtn')) await p2.click('#homeBtn');
      await h2.wait(400);
      await p2.evaluate(() => {
        const csv2 = 'Time (min),UV 280 (mAU)\n0.0,2.0\n1.5,110.0\n3.0,2.0\n';
        const dt = new DataTransfer();
        dt.items.add(new File([csv2], 'second_quick_trace.csv', {type: 'text/csv'}));
        document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true}));
      });
      await h2.wait(700);
      const names2 = await p2.$$eval('#list .trace [data-k="name"]', els => els.map(e => e.value.trim()));
      T.check('home_drop_restores_stashed_quick', names2.includes('home_drop_trace') && names2.includes('second_quick_trace'), `names2=${JSON.stringify(names2)}`);

      errs.push(...errs2);
    } finally {
      await close2();
    }
  });

  await T.t('multi_trace_overlay_ergonomics', async () => {
    const {p: p3, errs: errs3, close: close3} = await open(), h3 = H(p3);
    try {
      await p3.click('#homeBtn').catch(() => {});
      await h3.wait(300);
      await p3.click('#homeQuick');
      await h3.wait(600);

      const files = Array.from({length: 9}, (_, idx) => {
        const rows = ['Time (min),UV 280 (mAU)'];
        const mu = 2 + idx * 0.8;
        for (let k = 0; k <= 120; k++) {
          const t = +(k * 0.1).toFixed(1);
          const y = +(100 * Math.exp(-0.5 * Math.pow((t - mu) / 0.25, 2))).toFixed(3);
          rows.push(`${t},${y}`);
        }
        return {name: `ov_trace_${idx + 1}.csv`, mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n'))};
      });
      await p3.setInputFiles('#file', files);
      await h3.wait(900);

      const nCards = await p3.locator('#list .trace[data-kind="trace"]').count();
      const foldCount = await p3.locator('#list .trace[data-kind="trace"] details[data-fold="sliders"]').count();
      const anyFoldOpen = await p3.$$eval('#list .trace[data-kind="trace"] details[data-fold="sliders"]', ds => ds.some(d => d.open));
      T.check('overlay_9traces_folded_sliders', nCards === 9 && foldCount === 9 && !anyFoldOpen, `cards=${nCards}, folds=${foldCount}, anyOpen=${anyFoldOpen}`);

      // Show all / Hide all bulk controls when traces.length >= 3
      const hideBtn = p3.locator('#list .trace-bulk [data-bulk="hideAll"]');
      const showBtn = p3.locator('#list .trace-bulk [data-bulk="showAll"]');
      const hasBulk = (await hideBtn.count()) > 0 && (await showBtn.count()) > 0;
      T.check('overlay_bulk_buttons_visible', hasBulk && await hideBtn.isVisible() && await showBtn.isVisible(), 'Show all / Hide all visible');
      let visAfterHide = -1, visAfterShow = -1;
      if (hasBulk) {
        await hideBtn.click();
        await h3.wait(200);
        visAfterHide = await p3.$$eval('#list .trace[data-kind="trace"] input[data-k="visible"]', cs => cs.filter(c => c.checked).length);
        await showBtn.click();
        await h3.wait(200);
        visAfterShow = await p3.$$eval('#list .trace[data-kind="trace"] input[data-k="visible"]', cs => cs.filter(c => c.checked).length);
      }
      T.check('overlay_bulk_hide_and_show_all', visAfterHide === 0 && visAfterShow === 9, `afterHide=${visAfterHide}, afterShow=${visAfterShow}`);

      // Move down button (data-act="down") reorders traces
      const beforeNames = await p3.$$eval('#list .trace[data-kind="trace"] input[data-k="name"]', els => els.map(e => e.value));
      const downBtn = p3.locator('#list .trace[data-kind="trace"]').first().locator('[data-act="down"]');
      if ((await downBtn.count()) > 0) {
        await downBtn.click();
        await h3.wait(250);
      }
      const afterNames = await p3.$$eval('#list .trace[data-kind="trace"] input[data-k="name"]', els => els.map(e => e.value));
      T.check('overlay_move_down_reorders', beforeNames.length === 9 && afterNames[0] === beforeNames[1] && afterNames[1] === beforeNames[0], `before=${beforeNames.slice(0, 2)}, after=${afterNames.slice(0, 2)}`);

      // #intPanel visible on overlay when peaks exist with Trace | Peak | RT | Height | Area | % Area
      await p3.click('#list .trace[data-kind="trace"] [data-act="detect"]');
      await h3.wait(300);
      const intVis = await p3.locator('#intPanel').isVisible();
      const ptOv = await h3.peakTable();
      T.check(
        'overlay_intpanel_columns',
        intVis && JSON.stringify(ptOv[0]) === JSON.stringify(['Trace', 'Peak', 'RT', 'Height', 'Area', '% Area']) && ptOv.length >= 2,
        `vis=${intVis}, head=${JSON.stringify(ptOv[0])}, rows=${ptOv.length}`
      );

      // Exported SVG: Trace 9 (index 8 in plot-area) has a non-empty stroke-dasharray
      const svg9 = await h3.exportSvg();
      const dashInfo = await p3.evaluate(raw => {
        const host = document.createElement('div');
        host.innerHTML = raw;
        const paths = [...host.querySelectorAll('g[clip-path*="plot-area"] > path')];
        return paths.map(el => el.getAttribute('stroke-dasharray') || '');
      }, svg9);
      T.check(
        'overlay_trace9_has_stroke_dasharray',
        dashInfo.length === 9 && dashInfo.slice(0, 8).every(d => d === '') && dashInfo[8].trim().length > 0,
        `dashInfo=${JSON.stringify(dashInfo)}`
      );

      errs.push(...errs3);
    } finally {
      await close3();
    }
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
