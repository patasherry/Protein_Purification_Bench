const {open, H, suite, src, fs, path} = require('../lib/harness');

const num = s => { const m = String(s == null ? '' : s).replace(/[≈~,]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

(async () => {
  const T = suite('28_sec_figure'), {p, errs, close} = await open(), h = H(p);
  p.on('dialog', d => d.accept());

  const openFolds = loc => loc.evaluate(e => {
    let d = e.closest('details');
    while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
  });

  const setField = async (sel, v) => {
    const l = p.locator(sel).first();
    await openFolds(l);
    await l.fill(String(v));
    await l.dispatchEvent('change');
    await h.wait(150);
  };

  let mwFromKav, V0 = 8.0, Vt = 24.0, expectedPeaks = [];

  await T.t('setup_sec_run_and_calibration', async () => {
    await h.newProject('SEC Figure Test');
    await h.addRun(src('secZip')); // 'secZip' -> 'chrom/sec_Sup6_basic_unicorn7.zip', it's an SEC run

    // Select the SEC run in timeline
    const runStep = (await h.timeline()).find(x => /^run:/.test(x.k));
    if (runStep) await h.step(runStep.k);
    await h.wait(400);

    // Turn off automatic integration
    await p.click('#intAuto').catch(() => {});
    await h.wait(600);

    // Open more options
    if (await p.isVisible('#moreBtn') && /More options/i.test(await p.locator('#moreBtn').textContent().catch(() => ''))) {
      await p.click('#moreBtn').catch(() => {});
      await h.wait(300);
    }

    const stdsChk = p.locator('#o-secStds');
    await openFolds(stdsChk);
    if (!(await stdsChk.isChecked())) {
      await stdsChk.check({force: true});
      await h.wait(300);
    }

    // Set V0 and Vt by hand
    await setField('#sec-v0', V0);
    await setField('#sec-vt', Vt);

    // Enter 4 standards by hand
    const stds = [
      { name: 'S1', kda: 670, ve: 10.0 },
      { name: 'S2', kda: 158, ve: 15.0 },
      { name: 'S3', kda: 44, ve: 20.0 },
      { name: 'S4', kda: 17, ve: 22.0 }
    ];

    while (await p.locator('#secStdList .krow').count() < stds.length) {
      await p.click('#sec-addStd');
      await h.wait(150);
    }

    for (let i = 0; i < stds.length; i++) {
      const s = stds[i], nIn = p.locator(`#ss-n${i}`), kIn = p.locator(`#ss-k${i}`), vIn = p.locator(`#ss-v${i}`);
      await nIn.fill(s.name); await nIn.dispatchEvent('change');
      await kIn.fill(String(s.kda)); await kIn.dispatchEvent('change');
      await vIn.fill(String(s.ve)); await vIn.dispatchEvent('change');
      await h.wait(150);
    }

    // Turn automatic integration back on
    await p.click('#intAuto').catch(() => {});
    await h.wait(600);

    // Read peaks from peak table
    const pt = await h.peakTable();
    if (pt.length >= 2) {
      const head = pt[0];
      const veCol = head.findIndex(c => /^Ve|Center|Elution/i.test(c));
      const mwCol = head.findIndex(c => /^Apparent mass|Apparent MW/i.test(c));
      const sampleRows = pt.slice(1);
      for (let i = 0; i < sampleRows.length; i++) {
        const row = sampleRows[i], veVal = num(row[veCol]), mwVal = num(row[mwCol]);
        if (veVal != null && mwVal != null) {
          expectedPeaks.push({ve: veVal, mw: mwVal});
        }
      }
    }
  });

  await T.t('export_and_check_figure', async () => {
    const download = async (selector, timeout = 10000) => {
      const loc = p.locator(selector);
      if (await loc.count() === 0) return null;
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

    const svg = await download('#saveSvg');
    T.check('svg_downloaded', !!svg, 'SVG downloaded');
    if (svg) {
       const s = svg.str;

       // "x tick labels are elution volumes in mL counted from the injection."
       const hasVolume = /Volume/i.test(s) || /mL/i.test(s) || /Elution/i.test(s);
       T.check('x_axis_is_volume', hasVolume && !s.includes('Retention time'), 'x axis label is volume (mL), not Retention time');

       // "If the figure shows a molecular weight axis or labels, each labelled peak MW matches the calibration fit shown in the SEC panel (within 2%). Peaks outside the standards range are marked as extrapolated, or not given an MW (record which in the PR)."
       const texts = [...s.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]);
       const hasMwAxis = texts.some(t => /kDa/.test(t) || /~/.test(t));

       if (hasMwAxis) {
           T.check('has_mw_axis', true, 'contains Molecular weight labels');

           const extrapolated = texts.filter(t => /~/.test(t));
           // Record extrapolated peaks if requested
           if (extrapolated.length > 0) {
              T.check('has_extrapolated', true, `Extrapolated peaks: ${extrapolated.join(', ')}`);
           }

           // We need to check if the label values match the SEC calibration fit within 2%
           const kdaLabels = texts.filter(t => /kDa/.test(t) || /~/.test(t));

           let allMatch = true;
           for (const label of kdaLabels) {
              // Extract the numeric value
              const m = label.match(/[\d.]+/);
              if (!m) continue;
              const mwOnChart = parseFloat(m[0]);

              // Find the closest expected peak from the SEC panel table
              let matched = false;
              for (const ep of expectedPeaks) {
                 const ratio = mwOnChart / ep.mw;
                 if (Math.abs(ratio - 1) <= 0.02) {
                    matched = true;
                    break;
                 }
              }
              if (!matched) {
                 // Check if it's one of the standard marks drawn on the axis
                 if ([670, 158, 44, 17].some(st => Math.abs(st - mwOnChart) < 1)) {
                    matched = true;
                 }
              }

              if (!matched) {
                 allMatch = false;
                 T.check(`mw_label_match_${mwOnChart}`, false, `Label ${mwOnChart} kDa did not match any peak MW from panel within 2%`);
              }
           }

           T.check('peak_mw_labels_match', allMatch, 'Peak MW labels match expected values within 2%');
       } else {
           T.check('has_mw_axis', false, 'contains Molecular weight axis or label');
       }
    }
  });

  await T.t('baseline_corrected_integration_fill_tracks_uv', async () => {
    const aktaCsv = () => {
      const rows = ['Chrom.1,,Chrom.1,,Chrom.1,', 'UV 1_280,,Gradient Concentration,,Fraction,', 'ml,mAU,ml,%B,ml,Fraction'];
      for (let i = 0; i <= 200; i++) {
        const x = i / 10, peak = 140 * Math.exp(-0.5 * ((x - 10) / 0.9) ** 2), y = 180 + 0.8 * x + peak;
        rows.push(`${x.toFixed(3)},${y.toFixed(3)},${x.toFixed(3)},0.00,,`);
      }
      return rows.join('\n');
    };
    const {p: p2, errs: errs2, close: close2} = await open(), h2 = H(p2);
    try {
      const areas = async () => p2.$$eval('#intTable tr', rs => {
        const head = [...(rs[0] || {}).cells || []].map(c => c.textContent.trim()), i = head.findIndex(t => /^Area/.test(t));
        return i < 0 ? [] : rs.slice(1).map(r => r.cells[i] && r.cells[i].textContent.trim()).filter(Boolean);
      });
      const traceSelector = 'g[fill="none"][stroke-linejoin="round"] path:last-child';
      const checkFill = async (method, baseline) => {
        const svg = await h2.exportSvg(), fillSelector = method === 'gauss' ? 'path[fill-opacity="0.18"]' : 'path[fill-opacity="0.22"]';
        const fill = await h2.svgBoxes(svg, fillSelector), trace = await h2.svgBoxes(svg, traceSelector);
        const delta = fill.box && trace.box ? Math.abs(fill.box.y - trace.box.y) : Infinity;
        T.check(`baseline_${baseline}_${method}_fill_top`, delta <= 5,
          `integration fill top ${fill.box && fill.box.y}, UV trace top ${trace.box && trace.box.y}, delta ${delta.toFixed(2)} px`);
      };

      await h2.newProject('Baseline-shift SVG');
      await h2.addRun({name: 'baseline_offset_akta.csv', mimeType: 'text/csv', buffer: Buffer.from(aktaCsv())});
      const runStep = (await h2.timeline()).find(x => /^run:/.test(x.k));
      if (runStep) await h2.step(runStep.k);
      await openFolds(p2.locator('#o-intMethod'));
      await openFolds(p2.locator('#o-baseline'));

      for (const method of ['gauss', 'trap']) {
        await p2.selectOption('#o-intMethod', method, {force: true});
        await p2.click('#intClear');
        await p2.selectOption('#o-baseline', 'min', {force: true});
        await p2.click('#intAuto');
        await h2.wait(400);
        const minAreas = await areas();
        T.check(`baseline_min_${method}_has_area`, minAreas.length > 0, `areas: ${minAreas.join(', ')}`);
        await checkFill(method, 'min');

        await p2.selectOption('#o-baseline', 'linear', {force: true});
        await h2.wait(300);
        const linearAreas = await areas();
        T.check(`baseline_linear_${method}_area_unchanged`, JSON.stringify(linearAreas) === JSON.stringify(minAreas),
          `min ${minAreas.join(', ')}, linear ${linearAreas.join(', ')}`);
        await checkFill(method, 'linear');
      }
      T.check('baseline_corrected_integration_no_page_errors', !errs2.length, errs2.join(' | '));
    } finally { await close2(); }
  });

  await T.t('sec_peak_near_v0_no_marker_overlap', async () => {
    const {p: p3, errs: errs3, close: close3} = await open(), h3 = H(p3);
    try {
      await h3.newProject('SEC V0 Label Clearance');
      const rows = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', 'ml,mAU,ml,Fraction'];
      for (let i = 0; i <= 260; i++) {
        const x = i * 0.1;
        const y = 180 * Math.exp(-0.5 * ((x - 8.35) / 0.22) ** 2) + 60 * Math.exp(-0.5 * ((x - 15.0) / 0.4) ** 2);
        rows.push(`${x.toFixed(2)},${y.toFixed(3)},,`);
      }
      await h3.addRun({name: 'sec_Superdex_200_v0_peak.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n'))});
      const runStep = (await h3.timeline()).find(x => /^run:/.test(x.k));
      if (runStep) await h3.step(runStep.k);
      if (await p3.isVisible('#moreBtn')) await p3.click('#moreBtn').catch(() => {});
      await p3.evaluate(() => {
        for (const id of ['o-secStds', 'sec-v0']) {
          const el = document.getElementById(id);
          let d = el && el.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
        }
        const st = document.getElementById('o-secStds');
        if (st && !st.checked) { st.checked = true; st.dispatchEvent(new Event('input', {bubbles: true})); st.dispatchEvent(new Event('change', {bubbles: true})); }
      });
      await h3.wait(300);
      await p3.fill('#sec-v0', '8.0'); await p3.dispatchEvent('#sec-v0', 'change');
      await p3.fill('#sec-vt', '24.0'); await p3.dispatchEvent('#sec-vt', 'change');
      const stds = [['S1', 670, 9.0], ['S2', 158, 13.0], ['S3', 44, 17.0], ['S4', 17, 20.5]];
      while (await p3.locator('#secStdList .krow').count() < stds.length) { await p3.click('#sec-addStd'); await h3.wait(100); }
      for (let i = 0; i < stds.length; i++) {
        await p3.fill(`#ss-n${i}`, stds[i][0]); await p3.dispatchEvent(`#ss-n${i}`, 'change');
        await p3.fill(`#ss-k${i}`, String(stds[i][1])); await p3.dispatchEvent(`#ss-k${i}`, 'change');
        await p3.fill(`#ss-v${i}`, String(stds[i][2])); await p3.dispatchEvent(`#ss-v${i}`, 'change');
      }
      await p3.click('#intAuto'); await h3.wait(500);
      const svg = await h3.exportSvg(), m = await h3.svgBoxes(svg);
      const v0 = m.texts.find(t => t.t.trim() === 'V₀'), kda = m.texts.filter(t => /kDa/.test(t.t));
      const hits = v0 ? m.texts.filter(t => t !== v0 && Math.min(t.right, v0.right) - Math.max(t.x, v0.x) > 0.5 && Math.min(t.bottom, v0.bottom) - Math.max(t.y, v0.y) > 0.5) : [m];
      T.check('sec_v0_peak_label_no_overlap', !!v0 && kda.length >= 2 && hits.length === 0 && !errs3.length,
        `v0=${JSON.stringify(v0)} hits=${JSON.stringify(hits.map(x => x.t))} errs=${errs3.join(' | ')}`);
    } finally { await close3(); }
  });

  await T.t('sec_narrow_workflow_panel_v0_vt_clearance', async () => {
    const {p: p4, errs: errs4, close: close4} = await open(), h4 = H(p4);
    try {
      const secXs = [], secYs = [];
      for (let i = 0; i <= 250; i++) {
        const x = i * 0.1;
        const y = 20 * Math.exp(-0.5 * ((x - 8.0) / 0.3) ** 2)
                + 40 * Math.exp(-0.5 * ((x - 14.0) / 0.5) ** 2)
                + 140 * Math.exp(-0.5 * ((x - 20.8) / 0.35) ** 2);
        secXs.push(+x.toFixed(2));
        secYs.push(+y.toFixed(3));
      }
      const proj = {
        app: 'HPLC Figure Bench', version: 1,
        runs: [
          {
            id: 'r1', name: 'IMAC', inWf: true, uvi: 0,
            uvs: [{name: 'UV', yu: 'mAU', xs: [0, 5, 10, 15], ys: [0, 20, 80, 0]}],
            fracs: [], phases: [], integ: []
          },
          {
            id: 'r2', name: 'SEC', inWf: true, uvi: 0, secMode: 'on', secCal: 'c1', wfW: 0.6,
            uvs: [{name: 'UV', yu: 'mAU', xs: secXs, ys: secYs}],
            fracs: [], phases: [],
            integ: [
              {apex: 20.8, apexY: 140, a: 20.0, b: 21.6, area: 150, name: 'Peak 3'}
            ]
          }
        ],
        traces: [], gels: [], cur: 'fig',
        opt: {
          preset: 'column', fs: 9, w: 3.5, h: 2.2, wfW: 2.5, wfH: 1.8,
          secStds: true, secMarks: 'both', secLabel: 'mw',
          secCals: [
            {
              id: 'c1', name: 'Superdex 200', unit: 'mL', col: 'custom',
              v0: 15.0, vt: 21.0,
              stds: [
                {name: 'S1', kda: 670, ve: 15.5},
                {name: 'S2', kda: 158, ve: 17.0},
                {name: 'S3', kda: 44, ve: 19.0},
                {name: 'S4', kda: 17, ve: 20.8}
              ]
            }
          ],
          tidy13: true, tidy14: true
        }
      };
      await p4.setInputFiles('#projFile', {name: 'test_sec_narrow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(proj))});
      await h4.wait(500);
      await p4.evaluate(() => {
        const b = document.querySelector('[data-fig="workflow"]');
        if (b) b.click();
      });
      await h4.wait(600);
      const svg = await h4.exportSvg(), m = await h4.svgBoxes(svg);
      const v0 = m.texts.find(t => t.t.trim() === 'V₀');
      const vt = m.texts.find(t => t.t.trim() === 'Vₜ');
      const kda = m.texts.filter(t => /kDa/.test(t.t));
      const dist = (v0 && vt) ? Math.abs(vt.x - v0.x) : Infinity;
      const overlaps = [];
      for (const kt of kda) {
        for (const marker of [v0, vt]) {
          if (!marker) continue;
          const ox = Math.min(kt.right, marker.right) - Math.max(kt.x, marker.x);
          const oy = Math.min(kt.bottom, marker.bottom) - Math.max(kt.y, marker.y);
          if (ox > 1 && oy > 1) overlaps.push({kda: kt.t, marker: marker.t, ox, oy, pct: oy / kt.h});
        }
      }
      T.check('sec_narrow_wf_v0_vt_distance', dist < 25, `V0-Vt distance: ${dist}`);
      T.check('sec_late_peak_kda_present', !!v0 && !!vt && kda.length > 0, `v0=${!!v0} vt=${!!vt} kda=${kda.map(x => x.t)}`);
      T.check('sec_late_peak_no_v0_vt_overlap', overlaps.length === 0, `overlaps=${JSON.stringify(overlaps)}`);
      T.check('sec_narrow_wf_no_errors', !errs4.length, errs4.join(' | '));
    } finally { await close4(); }
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
