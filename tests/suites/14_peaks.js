const {open, H, suite, path, fs, DATA} = require('../lib/harness');
const EXP = JSON.parse(fs.readFileSync(path.join(DATA, 'expected_peaks.json'), 'utf8')), CH = path.join(DATA, 'chrom');
const T = suite('14_peaks');

// The integration helper functions similar to what's in 10_data_truth.js
const num = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
const setOpt = (p, id, v) => p.evaluate(([id, v]) => { const el = document.getElementById(id); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); return true; }, [id, String(v)]);

async function peaks(p, h) {
  const t = await h.peakTable(); if (!t.length) return {head: [], rows: []};
  const head = t[0];
  const iv = head.findIndex(c => /^(Ve|Center|Apex|Elution time)\b/.test(c)), ia = head.findIndex(c => /^Area/.test(c));
  const rows = t.slice(1).filter(r => r.length > 3).map(r => ({name: r[0], a: num(r[1]), b: num(r[2]), ve: iv >= 0 ? num(r[iv]) : NaN, area: ia >= 0 ? num(r[ia]) : NaN}));
  return {head, rows};
}

async function detect(p) {
  await p.evaluate(() => { const b = document.getElementById('intAuto'); if (b) b.click(); });
  await p.waitForTimeout(900);
}

async function peakFile(e) {
  const id = e.file.replace(/\.[^.]+$/, '');
  const {p, errs, close} = await open(), h = H(p);
  try {
    await h.newProject('peaks ' + id);
    await h.addRun(path.join(CH, e.file));
    await p.waitForTimeout(300);

    // Check all combinations of method and baseline to ensure no page errors are thrown
    const methods = ['gauss', 'trap'];
    const baselines = ['line', 'zero'];

    for (const m of methods) {
      for (const b of baselines) {
        await setOpt(p, 'o-intMethod', m);
        await setOpt(p, 'o-intBase', b);

        await p.evaluate(pool => {
            const el = document.querySelector('.trace.run.sel [data-k=shade]');
            if (el) {
                el.value = pool || '';
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            }
        }, e.pool);
        await detect(p);
        await p.waitForTimeout(300);
      }
    }

    // Now perform the specific checks using default settings (gauss + line) which are usually used
    await setOpt(p, 'o-intMethod', 'gauss');
    await setOpt(p, 'o-intBase', 'line');
    await p.evaluate(pool => {
            const el = document.querySelector('.trace.run.sel [data-k=shade]');
            if (el) {
                el.value = pool || '';
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            }
        }, e.pool);
    await detect(p);

    const P = await peaks(p, h);
    const pk = P.rows.filter(r => !/^pool/i.test(r.name)); // Filter out the pool row itself

    if (e.type === 'isolated') {
      const p1 = pk[0];
      if (T.check(`${id}/found-peak`, p1 != null, `Found peak`)) {
        T.check(`${id}/apex`, Math.abs(p1.ve - e.true_ve) <= 0.05, `Apex position ${p1.ve} within 1 sample (0.05) of ${e.true_ve}`);
        T.check(`${id}/area`, Math.abs(p1.area - e.true_area) / e.true_area <= 0.02, `Area ${p1.area} within 2% of true area ${e.true_area}`);
      }
    }
    else if (e.type === 'separated') {
      for (const expectedPeak of e.peaks) {
        const found = pk.find(p => Math.abs(p.ve - expectedPeak.ve) <= 0.05);
        T.check(`${id}/apex-${expectedPeak.ve}`, found != null, `Found peak near ${expectedPeak.ve}`);
        if (found) {
          // Increase tolerance for peak area checking because Gaussian fitting or numerical integration
          // might have some slight noise or variations.
          T.check(`${id}/area-${expectedPeak.ve}`, Math.abs(found.area - expectedPeak.area) / expectedPeak.area <= 0.03, `Area ${found.area} within 3% of ${expectedPeak.area}`);
        }
      }
    }
    else if (e.type === 'overlapping') {
      let sumArea = 0;
      for (const p of pk) {
        sumArea += p.area;
      }
      T.check(`${id}/area-sum`, Math.abs(sumArea - e.total_area) / e.total_area <= 0.02, `Overlapping area sum ${sumArea} within 2% of total ${e.total_area}`);
    }
    else if (e.type === 'ratio') {
      const P_res = await peaks(p, h);
      const pk_res = P_res.rows.filter(r => !/^pool/i.test(r.name));
            const moreBtn = await p.$('#intMore'); if (moreBtn) await p.evaluate(() => document.getElementById('intMore').click()); await p.waitForTimeout(300);
            const t = await h.peakTable();
      const head = t[0];
      const ratCol = head.findIndex(c => c.includes('A260/A280') || c.includes('A₂₆₀/A₂₈₀'));
      let ratioStr = '';
      if (pk_res.length > 0 && ratCol >= 0) {
         // Re-fetch the table because the raw array from peaks() doesn't include the ratio column if we didn't parse it.
         // Let's modify `peaks` or just parse the table here.
         const row = t[1];
         ratioStr = row[ratCol];
      }

      T.check(`${id}/ratio-col-exists`, ratCol >= 0, `A260/A280 column exists`);
      T.check(`${id}/ratio-val`, Math.abs(parseFloat(ratioStr) - e.expected_ratio) <= 0.05, `Ratio ${ratioStr} is near ${e.expected_ratio}`);
    }
    else if (e.type === 'sloped') {
      // 1. check area with baseline subtraction (line)
      await setOpt(p, 'o-intBase', 'line');
      await detect(p);
      const pkLine = (await peaks(p, h)).rows.filter(r => !/^pool/i.test(r.name));
      const areaLine = pkLine[0] ? pkLine[0].area : 0;

      // 2. check area with no baseline subtraction (zero)
      await setOpt(p, 'o-intBase', 'zero');
      await detect(p);
      const pkZero = (await peaks(p, h)).rows.filter(r => !/^pool/i.test(r.name));
      const areaZero = pkZero[0] ? pkZero[0].area : 0;

      T.check(`${id}/baseline-subtraction`, areaLine < areaZero, `Sloped baseline area with subtraction (${areaLine}) < area without subtraction (${areaZero})`);
    }
    else if (e.type === 'issue790') {
      const p1 = pk.find(p => Math.abs(p.ve - e.true_ve1) <= 0.05);
      const p2 = pk.find(p => Math.abs(p.ve - e.true_ve2) <= 0.05);
      T.check(`${id}/apex-1`, p1 != null, `Found peak 1 near ${e.true_ve1}`);
      T.check(`${id}/apex-2`, p2 != null, `Found peak 2 near ${e.true_ve2}`);
      if (p1) {
        T.check(`${id}/area-1`, Math.abs(p1.area - e.true_area1) / e.true_area1 <= 0.01, `Peak 1 area ${p1.area} within 1% of true area ${e.true_area1}`);
      }
      if (p2) {
        T.check(`${id}/area-2`, Math.abs(p2.area - e.true_area2) / e.true_area2 <= 0.01, `Peak 2 area ${p2.area} within 1% of true area ${e.true_area2}`);
      }
    }

  } finally {
    T.check(`${id}/no-page-errors`, !errs.length, errs.join(' | '));
    await close();
  }
}


async function overlap() {
  const {p, errs, close} = await open(), h = H(p);
  try {
    let csv = 'Time (min),UV (mAU)\n';
    for (let i = 0; i <= 200; i++) {
        const x = i/10;
        csv += x.toFixed(1) + ',' + (100*Math.exp(-((x-10)**2)/(2*0.02)) + 100*Math.exp(-((x-10.4)**2)/(2*0.02))).toFixed(3) + '\n';
    }
    await p.click('#homeQuick'); await p.waitForTimeout(800);
    await p.setInputFiles('#file', {name: 'overlap.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
    await p.waitForTimeout(600);
    const card = () => p.locator('.trace:not(.run)').filter({has: p.locator('input[value="overlap"], input[value="overlap.csv"]')}).first();
    await p.evaluate(() => { const el = document.getElementById('o-intLabel'); if (el) { el.value = 'x'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } }); await p.waitForTimeout(300);
    await p.evaluate(() => { const el = document.getElementById('o-intProm'); if (el) { el.value = '0'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } }); await p.waitForTimeout(300);
    await p.evaluate(() => { const el = document.getElementById('o-peakDec'); if (el) { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } }); await p.waitForTimeout(300);
    await p.evaluate(() => {
        const traces = document.querySelectorAll('.trace');
        traces.forEach(t => {
            const btn = t.querySelector('[data-act=detect]');
            if (btn) btn.click();
        });
    });
    await p.waitForTimeout(600);
    const rects = await p.locator('svg text').evaluateAll(els => els.map(el => {
       const rect = el.getBoundingClientRect();
       return {x: rect.x, y: rect.y, w: rect.width, h: rect.height, txt: el.textContent};
    }));
    const overlapLabels = rects.filter(r => r.txt === '10.0' || r.txt === '10.4');
    T.check('overlap/2-labels-found', overlapLabels.length === 2, 'Found 2 close peak labels');
    if (overlapLabels.length === 2) {
       const [r1, r2] = overlapLabels;
       const intersect = !(r1.x > r2.x + r2.w || r1.x + r1.w < r2.x || r1.y > r2.y + r2.h || r1.y + r1.h < r2.y);
       T.check('overlap/no-intersection', !intersect, 'Bounding boxes of close labels do not intersect');
    }
  } finally { T.check('overlap/no-page-errors', !errs.length, errs.join(' | ')); await close(); }
}

// #1141: a peak tag at the left plot edge must not overlap a y-axis tick label.
async function axisTickCollision() {
  const {p, errs, close} = await open(), h = H(p);
  try {
    let csv = 'Time (min),UV (mAU)\n';
    for (let i = 0; i <= 100; i++) {
      const x = i / 10, y = i === 0 ? 75 : 0;
      csv += x.toFixed(1) + ',' + y + '\n';
    }
    await p.click('#homeQuick'); await h.wait(800);
    await p.setInputFiles('#file', {name: 'axis_tick_tag.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
    await h.wait(600);
    await p.evaluate(() => {
      [['o-xmin', '0'], ['o-xmax', '10'], ['o-ymin', '73'], ['o-ymax', '77']].forEach(([id, value]) => {
        const el = document.getElementById(id); el.value = value;
        el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
      });
      const ticks = document.getElementById('o-ticksOut'); ticks.checked = false;
      ticks.dispatchEvent(new Event('input', {bubbles: true})); ticks.dispatchEvent(new Event('change', {bubbles: true}));
      const peaks = document.querySelector('input[data-k="peaks"]'); peaks.value = '0:T13';
      peaks.dispatchEvent(new Event('input', {bubbles: true})); peaks.dispatchEvent(new Event('change', {bubbles: true}));
    });
    await h.wait(500);
    const boxes = await p.evaluate(() => {
      const svg = document.querySelector('#paper svg');
      const box = text => { const el = [...svg.querySelectorAll('text')].find(t => t.textContent.trim() === text); if (!el) return null; const r = el.getBoundingClientRect(); return {l:r.left, r:r.right, t:r.top, b:r.bottom}; };
      return {tag: box('T13'), tick: box('75')};
    });
    T.check('axis_tick/tag-and-tick-found', !!boxes.tag && !!boxes.tick, `tag: ${JSON.stringify(boxes.tag)}, tick: ${JSON.stringify(boxes.tick)}`);
    if (boxes.tag && boxes.tick) {
      const hit = boxes.tag.l < boxes.tick.r && boxes.tag.r > boxes.tick.l && boxes.tag.t < boxes.tick.b && boxes.tag.b > boxes.tick.t;
      T.check('axis_tick/tag-does-not-overlap-tick', !hit, `tag ${JSON.stringify(boxes.tag)}, tick ${JSON.stringify(boxes.tick)}`);
    }
    await p.evaluate(() => {
      [['o-ymin', '74'], ['o-ymax', '76']].forEach(([id, value]) => {
        const el = document.getElementById(id); el.value = value;
        el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
      });
    });
    await h.wait(300);
    const zoomed = await p.evaluate(() => {
      const svg = document.querySelector('#paper svg');
      const box = match => { const el = [...svg.querySelectorAll('text')].find(match); if (!el) return null; const r = el.getBoundingClientRect(); return {l:r.left, r:r.right, t:r.top, b:r.bottom}; };
      return {tag: box(t => t.textContent.trim() === 'T13'), tick: box(t => Number(t.textContent.trim()) === 75)};
    });
    const zoomHit = zoomed.tag && zoomed.tick && zoomed.tag.l < zoomed.tick.r && zoomed.tag.r > zoomed.tick.l && zoomed.tag.t < zoomed.tick.b && zoomed.tag.b > zoomed.tick.t;
    T.check('axis_tick/zoomed-tag-does-not-overlap-tick', !!zoomed.tag && !!zoomed.tick && !zoomHit, `tag ${JSON.stringify(zoomed.tag)}, tick ${JSON.stringify(zoomed.tick)}`);
  } finally { T.check('axis_tick/no-page-errors', !errs.length, errs.join(' | ')); await close(); }
}

// #398: a zoom window too narrow to search (under 7 points) falls back to the whole trace, keeping peaks inside the window
async function zoomPeak() {
  const {p, errs, close} = await open(), h = H(p);
  try {
    await p.click('#homeQuick'); await p.waitForTimeout(800);  // overlay traces (with Detect peaks) live in Quick mode; in a project a CSV becomes a run
    let csv = 'Time (min),UV (mAU)\n'; for (let i = 0; i <= 1000; i++) { const x = i/10; csv += x.toFixed(1) + ',' + (100*Math.exp(-((x-50)**2)/(2*4))).toFixed(3) + '\n'; }
    await p.setInputFiles('#file', {name: 'zoom_peak.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
    await p.waitForTimeout(600);
    const card = () => p.locator('.trace:not(.run)').filter({has: p.locator('input[value="zoom_peak"], input[value="zoom_peak.csv"]')}).first();
    const chips = async () => (await card().locator('.chip input').evaluateAll(els => els.map(e => parseFloat(e.placeholder || e.value))));
    T.check('zoom_peak/unzoomed', (await chips()).some(x => Math.abs(x - 50) < 0.3), 'peak at 50 found without zoom: ' + (await chips()));
    await card().locator('[data-act=clear]').click();
    await setOpt(p, 'o-xmin', '49.8'); await setOpt(p, 'o-xmax', '50.2'); await p.waitForTimeout(300);
    await card().locator('[data-act=detect]').click(); await p.waitForTimeout(300);
    const c = await chips();
    T.check('zoom_peak/found-when-zoomed', c.some(x => Math.abs(x - 50) < 0.3), 'peak at 50 found inside a 5-point zoom window: [' + c + ']');
  } finally { T.check('zoom_peak/no-page-errors', !errs.length, errs.join(' | ')); await close(); }
}





async function zoomToPeakButton() {
  const {p, errs, close} = await open(), h = H(p);
  try {
    let csv = 'Time (min),UV (mAU)\n'; for (let i = 0; i <= 1000; i++) { const x = i/10; csv += x.toFixed(1) + ',' + (100*Math.exp(-((x-50)**2)/(2*4))).toFixed(3) + '\n'; }
    await p.click('#homeQuick'); await p.waitForTimeout(800);
    await p.setInputFiles('#file', {name: 'trace2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
    await p.waitForTimeout(600);

    await p.evaluate(() => { const el = document.querySelector('#detectAll'); if(el) el.click(); });
    await p.waitForTimeout(500);

    await p.evaluate(() => { const el = document.querySelector('#zoomPeak'); if(el) el.click(); });
    await p.waitForTimeout(500);

    const xmin = await p.evaluate(() => document.querySelector('#o-xmin').value);
    const xmax = await p.evaluate(() => document.querySelector('#o-xmax').value);

    // The peak is at 50, window should center around it
    T.check('zoom_to_peak_button_updates_window_xmin', Number(xmin) > 30 && Number(xmin) < 50, `Zoom to peak adjusts xmin (actual: ${xmin})`);
    T.check('zoom_to_peak_button_updates_window_xmax', Number(xmax) > 50 && Number(xmax) < 70, `Zoom to peak adjusts xmax (actual: ${xmax})`);
  } finally { T.check('zoom_to_peak_button_no_errors', !errs.length, errs.join(' | ')); await close(); }
}

// Issue #828: Migrate peak field separator from 'x' to comma, with UI input hint and legacy 'x' fallback
async function peakSeparator() {
  const {p, errs, close} = await open(), h = H(p);
  try {
    await p.click('#homeQuick');
    await p.waitForTimeout(600);

    const pkInput = p.locator('input[data-k="peaks"]').first();
    const exists = (await pkInput.count()) > 0;
    const placeholder = exists ? await pkInput.getAttribute('placeholder') : '';
    T.check('peaks_field_hint_comma', placeholder === 'e.g. 5.2, 8.4', `Peaks input placeholder: "${placeholder}", expected "e.g. 5.2, 8.4"`);

    if (exists) {
      // 1. Comma-separated input
      await pkInput.fill('5.0, 7.5');
      await pkInput.dispatchEvent('change');
      await p.waitForTimeout(400);

      const val = await pkInput.inputValue();
      const chips = await p.$$eval('.peaks .chip input', els => els.map(e => e.placeholder));
      T.check('peaks_comma_separated_parsing', val.includes('5.00') && val.includes('7.50') && val.includes(',') && chips.includes('5.00') && chips.includes('7.50'), `Parsed comma peaks: "${val}", chips: ${JSON.stringify(chips)}`);

      // 2. Legacy 'x'-delimited fallback
      await pkInput.fill('4.2 x 6.8');
      await pkInput.dispatchEvent('change');
      await p.waitForTimeout(400);

      const valFallback = await pkInput.inputValue();
      const chipsFallback = await p.$$eval('.peaks .chip input', els => els.map(e => e.placeholder));
      T.check('peaks_legacy_x_fallback', valFallback.includes('4.20') && valFallback.includes('6.80') && valFallback.includes(',') && chipsFallback.includes('4.20') && chipsFallback.includes('6.80'), `Migrated legacy 'x' to comma: "${valFallback}", chips: ${JSON.stringify(chipsFallback)}`);
    } else {
      T.check('peaks_comma_separated_parsing', false, 'Peaks input missing');
      T.check('peaks_legacy_x_fallback', false, 'Peaks input missing');
    }

    // 3. Legacy project file import with 'x'-delimited string peaks (zero data loss)
    const legacyProject = {
      app: 'HPLC Figure Bench',
      version: 1,
      runs: [],
      traces: [{
        id: 1,
        name: 'Legacy Trace',
        rows: [[0, 0], [3.2, 100], [5.0, 10], [8.6, 120], [10, 0]],
        peaks: '3.2 x 8.6'
      }]
    };
    await p.click('#homeBtn');
    await p.waitForTimeout(400);
    await p.setInputFiles('#projFile', {
      name: 'legacy_x_peaks_proj.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacyProject))
    });
    await p.waitForTimeout(600);

    const legacyInput = p.locator('input[data-k="peaks"]').first();
    const legacyVal = (await legacyInput.count() > 0) ? await legacyInput.inputValue() : '';
    const legacyChips = await p.$$eval('.peaks .chip input', els => els.map(e => e.placeholder));
    T.check('legacy_project_x_peaks_restored', legacyVal.includes('3.20') && legacyVal.includes('8.60') && legacyChips.includes('3.20') && legacyChips.includes('8.60'), `Restored legacy project peaks: "${legacyVal}", chips: ${JSON.stringify(legacyChips)}`);
  } finally {
    T.check('peak_separator/no-page-errors', !errs.length, errs.join(' | '));
    await close();
  }
}

// Issue #1634: default UV pathlength is 0.2 cm (2 mm) with an ÄKTA optical cell selector in Run conditions
async function uvPathCellSelector() {
  const {p, errs, close} = await open(), h = H(p);
  p.on('dialog', d => d.accept());
  try {
    const lines = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', 'mL,mAU,mL,Fraction'];
    const xs = [], ys = [];
    for (let i = 0; i <= 200; i++) {
      const x = +(i / 10).toFixed(1);
      const y = +(100 * Math.exp(-0.5 * Math.pow((x - 10) / 1.0, 2))).toFixed(4);
      xs.push(x); ys.push(y);
      lines.push(`${x},${y},${i % 10 === 0 ? x : ''},${i % 10 === 0 ? '"F' + (i / 10 + 1) + '"' : ''}`);
    }
    const readPeakMg = async () => {
      const t = await h.peakTable();
      if (!t.length) return null;
      const head = t[0];
      const ia = head.findIndex(c => /^Area/i.test(c));
      const im = head.findIndex(c => /^Protein \(mg\)/i.test(c));
      const row = t.slice(1).find(r => r.length === head.length && !/^pool/i.test(r[0]) && num(r[ia]) > 0);
      if (!row || ia < 0 || im < 0) return null;
      const area = num(row[ia]), mg = num(row[im]);
      return {area, mg, effCm: area > 0 && mg > 0 ? (area / 1000) / (1.0 * mg) : NaN};
    };

    await h.newProject('UV path cell selector');
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep=run]');
    await p.setInputFiles('#file', {name: 'akta_no_path.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'))});
    await h.wait(800);

    const runStep = (await h.timeline()).find(x => /^run:/.test(x.k));
    if (runStep) await h.step(runStep.k);
    await h.wait(300);

    await setOpt(p, 'o-eps', '1.0');
    await detect(p);

    // 1. Run with no explicit pathlength defaults to effective pathlength 0.2 cm (2 mm)
    const defPeak = await readPeakMg();
    T.check('path_default/effective-0.2cm', defPeak != null && Math.abs(defPeak.effCm - 0.2) <= 0.01, `Default path peak: ${JSON.stringify(defPeak)}, expected effCm ≈ 0.2`);

    // 2. Optical cell selector in Run conditions updates the run's pathlength to 1.0 cm (10 mm)
    const runCond = p.locator('.trace.run.sel details.runcond').first();
    await runCond.evaluate(d => { d.open = true; });
    const cellSel = runCond.locator('select[data-k="pathCell"]').first();
    const hasSel = (await cellSel.count()) > 0;
    T.check('path_cell/selector-in-runcond', hasSel, 'UV optical cell selector present inside Run conditions');

    if (hasSel) {
      await cellSel.selectOption('10');
      await h.wait(400);
      const pathVal10 = await p.locator('.trace.run.sel input[data-k="path"]').first().inputValue();
      const peak10 = await readPeakMg();
      T.check('path_cell/1cm-sets-path-10mm', Math.abs(num(pathVal10) / 10 - 1.0) < 0.001, `Path input="${pathVal10}" mm (${num(pathVal10)/10} cm), expected 1.0 cm`);
      T.check('path_cell/1cm-effective-1.0cm', peak10 != null && Math.abs(peak10.effCm - 1.0) <= 0.03 && defPeak != null && Math.abs(defPeak.mg / peak10.mg - 5.0) <= 0.25, `1 cm peak: ${JSON.stringify(peak10)}, 0.2 cm mg: ${defPeak && defPeak.mg}`);

      await cellSel.selectOption('2');
      await h.wait(400);
      const pathVal2 = await p.locator('.trace.run.sel input[data-k="path"]').first().inputValue();
      const peak2 = await readPeakMg();
      T.check('path_cell/2mm-sets-path-2mm', Math.abs(num(pathVal2) / 10 - 0.2) < 0.001 && peak2 != null && Math.abs(peak2.effCm - 0.2) <= 0.01, `Path input="${pathVal2}" mm, peak: ${JSON.stringify(peak2)}`);
    } else {
      T.check('path_cell/1cm-sets-path-10mm', false, 'Optical cell selector missing');
      T.check('path_cell/1cm-effective-1.0cm', false, 'Optical cell selector missing');
      T.check('path_cell/2mm-sets-path-2mm', false, 'Optical cell selector missing');
    }

    // 3. Saved project with no pathlength value defaults to 0.2 cm even if session had 10 mm
    await setOpt(p, 'o-path', '10');
    await h.wait(200);
    const savedNoPath = {
      app: 'HPLC Figure Bench',
      version: 1,
      runs: [{
        id: 'r1',
        name: 'Saved No Path',
        inWf: true,
        uvi: 0,
        uvs: [{name: 'UV 1_280', xu: 'mL', yu: 'mAU', xs, ys}],
        fracs: [],
        integ: []
      }],
      traces: []
    };
    await p.click('#homeBtn');
    await h.wait(500);
    await p.setInputFiles('#projFile', {
      name: 'saved_no_path.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(savedNoPath))
    });
    await h.wait(1000);
    const savedStep = (await h.timeline()).find(x => /^run:/.test(x.k));
    if (savedStep) await h.step(savedStep.k);
    await h.wait(300);
    await setOpt(p, 'o-eps', '1.0');
    await detect(p);
    const savedPeak = await readPeakMg();
    T.check('path_saved/defaults-to-0.2cm', savedPeak != null && Math.abs(savedPeak.effCm - 0.2) <= 0.01, `Saved project (no path) peak: ${JSON.stringify(savedPeak)}, expected effCm ≈ 0.2`);
  } finally {
    T.check('path_cell/no-page-errors', !errs.length, errs.join(' | '));
    await close();
  }
}

async function theoPeakMassTest() {
  const {p, errs, close} = await open(), h = H(p);
  try {
    const H_val = 1998.6147;
    const lines = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', 'min,mAU,min,Fraction'];
    for (let i = 0; i <= 200; i++) {
      const x = +(i / 10).toFixed(1);
      const y = +(H_val * Math.exp(-0.5 * Math.pow((x - 10) / 1.0, 2))).toFixed(4);
      lines.push(`${x},${y},${i % 10 === 0 ? x : ''},${i % 10 === 0 ? '"F' + (i / 10 + 1) + '"' : ''}`);
    }

    await h.newProject('Theoretical peak mass');
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep=run]');
    await p.setInputFiles('#file', {name: 'theo_mass_synth.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'))});
    await h.wait(800);

    const runStep = (await h.timeline()).find(x => /^run:/.test(x.k));
    if (runStep) await h.step(runStep.k);
    await h.wait(300);

    const runCond = p.locator('.trace.run.sel details.runcond').first();
    await runCond.evaluate(d => { d.open = true; });
    const flowInput = runCond.locator('input[data-k="mFlow"]').first();
    await flowInput.fill('1');
    await flowInput.dispatchEvent('change');
    await h.wait(300);

    await setOpt(p, 'protSeq', 'MKWYYY');
    await setOpt(p, 'o-intMethod', 'trap');
    await setOpt(p, 'o-intBase', 'zero');
    await detect(p);
    await h.wait(300);

    let pt = await h.peakTable();
    let head = pt[0] || [];
    let theoCol = head.findIndex(c => /^Theo\. mass/i.test(c));
    T.check('theo_mass/column-present', theoCol >= 0, 'Theo. mass column present when sequence and flow are loaded');

    let pRow = pt.slice(1).find(r => !/^pool/i.test(r[0]));
    let theoVal = pRow && theoCol >= 0 ? pRow[theoCol] : '';
    T.check('theo_mass/value-with-mw', theoVal === '2390.0 µg', `Peak theoretical mass cell reads '${theoVal}', expected '2390.0 µg' (area 5000 mAU·min, flow 1 mL/min, path 0.2 cm, MKWYYY MW 953.1 Da, ε 9970 M⁻¹cm⁻¹)`);

    const [dlSeq] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#intCsv')]);
    const csvSeq = fs.readFileSync(await dlSeq.path(), 'utf8').trim().split(/\r?\n/).map(r => r.split(','));
    const csvTheoCol = csvSeq[0].indexOf('theo_mass_ug');
    const csvP1 = csvSeq.find(r => r[1] === 'P1');
    const theoCsvVal = csvP1 && csvTheoCol >= 0 ? csvP1[csvTheoCol] : '';
    T.check('theo_mass/csv-with-seq', csvTheoCol >= 0 && theoCsvVal === '2390.0', `CSV export has theo_mass_ug column with value '${theoCsvVal}', expected '2390.0'`);

    await setOpt(p, 'protSeq', '');
    await h.wait(300);

    pt = await h.peakTable();
    head = pt[0] || [];
    theoCol = head.findIndex(c => /^Theo\. mass/i.test(c));
    T.check('theo_mass/column-hidden-without-seq', theoCol === -1, 'Theo. mass column disappears when sequence is toggled off');

    const [dlNoSeq] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#intCsv')]);
    const csvNoSeq = fs.readFileSync(await dlNoSeq.path(), 'utf8').trim().split(/\r?\n/).map(r => r.split(','));
    const csvTheoColNoSeq = csvNoSeq[0].indexOf('theo_mass_ug');
    const csvP1NoSeq = csvNoSeq.find(r => r[1] === 'P1');
    const noSeqTheoVal = csvP1NoSeq && csvTheoColNoSeq >= 0 ? csvP1NoSeq[csvTheoColNoSeq] : '';
    T.check('theo_mass/csv-without-seq', csvTheoColNoSeq === -1 || noSeqTheoVal === '', `CSV export without sequence has no theo_mass_ug column or column is empty (colIdx=${csvTheoColNoSeq})`);

    await setOpt(p, 'protSeq', 'MKWYYY');
    await h.wait(300);
    await flowInput.fill('');
    await flowInput.dispatchEvent('change');
    await h.wait(300);

    pt = await h.peakTable();
    head = pt[0] || [];
    theoCol = head.findIndex(c => /^Theo\. mass/i.test(c));
    T.check('theo_mass/column-hidden-without-flow', theoCol === -1, 'Theo. mass column disappears when flow is cleared');

    // Restore flow rate calibrated to 500.0 µg theoretical mass
    const targetFlow = String(+((500 * 9970 * 0.2) / (5000 * 953.123)).toFixed(6));
    await flowInput.fill(targetFlow);
    await flowInput.dispatchEvent('change');
    await h.wait(300);

    pt = await h.peakTable();
    head = pt[0] || [];
    theoCol = head.findIndex(c => /^Theo\. mass/i.test(c));
    pRow = pt.slice(1).find(r => !/^pool/i.test(r[0]));
    let theo500 = pRow && theoCol >= 0 ? pRow[theoCol] : '';
    T.check('theo_mass/target-500ug', theo500 === '500.0 µg', `Theoretical mass set to '${theo500}', expected '500.0 µg'`);

    // Pool the peak and enter NanoDrop mass 400 µg (calibrated to 400.0 µg peak share) via Concentrate step
    await h.pool('F1-F21');
    await h.wait(300);
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep=conc]');
    await h.wait(400);
    const openFolds = loc => loc.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });
    const concInp = p.locator('#btw-conc');
    await openFolds(concInp);
    await concInp.fill('0.40082');
    await concInp.dispatchEvent('input');
    await concInp.dispatchEvent('change');
    const vOutInp = p.locator('#btw-vOut');
    await openFolds(vOutInp);
    await vOutInp.fill('1');
    await vOutInp.dispatchEvent('input');
    await vOutInp.dispatchEvent('change');
    await h.wait(400);

    await h.step(runStep.k);
    await h.wait(400);

    const badge = p.locator('#intTable .delta-badge').first();
    const hasBadge = (await badge.count()) > 0;
    const badgeText = hasBadge ? (await badge.innerText()).trim() : '';
    const isAmber = hasBadge && (await badge.evaluate(el => {
      const cs = getComputedStyle(el);
      return el.classList.contains('amber') || cs.color.includes('138, 90') || cs.color.includes('226, 180');
    }));
    T.check('theo_mass/nanodrop-comparison-badge', badgeText === '−20 %' && isAmber, `Badge text '${badgeText}', amber=${isAmber}, expected '−20 %' in amber`);

    pt = await h.peakTable();
    head = pt[0] || [];
    theoCol = head.findIndex(c => /^Theo\. mass/i.test(c));
    pRow = pt.slice(1).find(r => !/^pool/i.test(r[0]));
    const fullVal = pRow && theoCol >= 0 ? pRow[theoCol] : '';
    T.check('theo_mass/side-by-side-values', fullVal.includes('500.0 µg') && fullVal.includes('400.0 µg'), `Cell text '${fullVal}', expected both 500.0 µg and 400.0 µg side by side`);

    // Disagreement below 20% (450 µg, -10%) does not turn amber
    const concStep = (await h.timeline()).find(x => /^btw:/.test(x.k));
    if (concStep) await h.step(concStep.k);
    await h.wait(300);
    await concInp.fill('0.45');
    await concInp.dispatchEvent('input');
    await concInp.dispatchEvent('change');
    await h.wait(400);

    await h.step(runStep.k);
    await h.wait(400);
    const badge10 = p.locator('#intTable .delta-badge').first();
    const badge10Has = (await badge10.count()) > 0;
    const badge10Text = badge10Has ? (await badge10.innerText()).trim() : '';
    const isAmber10 = badge10Has && (await badge10.evaluate(el => el.classList.contains('amber')));
    T.check('theo_mass/badge-below-20pct-not-amber', badge10Text === '−10 %' && !isAmber10, `Badge text '${badge10Text}', amber=${isAmber10}, expected '−10 %' without amber`);
  } finally {
    T.check('theo_mass/no-page-errors', !errs.length, errs.join(' | '));
    await close();
  }
}

async function poolDipSameSpan() {
  const {poolDipCsv, trapArea, POOL, A, B} = require('../data/gen_pool_dip');
  const num = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
  const setVal = (p, sel, v) => p.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return true; }, [sel, String(v)]);
  const {p, errs, close} = await open(), h = H(p);
  try {
    await h.newProject('Pool area');
    await h.addRun({name: 'pool_dip.csv', mimeType: 'text/csv', buffer: Buffer.from(poolDipCsv())});
    await setVal(p, '#o-intMethod', 'trap'); await setVal(p, '#o-intBase', 'zero'); await h.wait(300);
    await h.pool(POOL);
    await p.evaluate(() => document.getElementById('intAuto').click()); await h.wait(600);
    await setVal(p, '#ia0', A); await h.wait(250); await setVal(p, '#ib0', B); await h.wait(350);
    const t = await h.peakTable(), head = t[0] || [], ia = head.findIndex(c => /^Area/.test(c));
    const reg = t.find(r => r[0] === 'P1'), pool = t.find(r => /^Pool/.test(r[0] || ''));
    T.check('same_span.rows_shown', ia >= 0 && reg && pool, JSON.stringify(t));
    if (ia >= 0 && reg && pool) {
      const ra = num(reg[ia]), pa = num(pool[ia]), exp = trapArea(A, B, true), info = `region ${reg[ia]}, pool ${pool[ia]}, closed form ${exp.toFixed(3)}`;
      T.check('same_span.same_interval', num(reg[1]) === A && num(reg[2]) === B && num(pool[1]) === A && num(pool[2]) === B, info);
      T.check('same_span.pool_equals_region', Math.abs(pa - ra) <= 1, info);
      T.check('same_span.pool_matches_trapezoid', Math.abs(pa - exp) <= 0.5 + 1e-9, info);
      T.check('same_span.region_matches_trapezoid', Math.abs(ra - exp) <= 0.5 + 1e-9, info);
    }
  } finally {
    T.check('same_span.no_page_errors', !errs.length, errs.join(' | '));
    await close();
  }
}

async function seqDerivedPeakMassAndWlGuard() {
  const {src} = require('../lib/harness');
  const {p, errs, close} = await open(), h = H(p);
  try {
    await h.newProject('Seq peak mass mL');
    await h.gb(src('gb'));
    await h.addRun(src('his'));
    await h.pool('T1-T6');
    await detect(p);

    const pt0 = await h.peakTable(), head0 = pt0[0] || [];
    const mgCol0 = head0.findIndex(c => /^Protein \(mg\)$/i.test(c));
    const peakRows0 = pt0.slice(1).filter(r => r.length === head0.length && /^P\d+$/i.test(r[0]));
    const poolRow0 = pt0.slice(1).find(r => r.length === head0.length && /^Pool\b/i.test(r[0]));
    T.check(
      'seq_ml_mass/int_table_protein_mg_shown',
      mgCol0 >= 0 && peakRows0.length > 0 && peakRows0.every(r => num(r[mgCol0]) > 0) && !!poolRow0 && num(poolRow0[mgCol0]) > 0,
      `headers=${JSON.stringify(head0)}, peaks=${JSON.stringify(peakRows0)}, pool=${JSON.stringify(poolRow0)}`
    );

    if (await p.locator('#intMore').isVisible()) {
      await p.click('#intMore');
      await h.wait(300);
    }
    const pt1 = await h.peakTable(), head1 = pt1[0] || [];
    const mgCol1 = head1.findIndex(c => /^Protein \(mg\)$/i.test(c));
    const theoCol1 = head1.findIndex(c => /^Theo\. mass$/i.test(c));
    const peakRows1 = pt1.slice(1).filter(r => r.length === head1.length && /^P\d+$/i.test(r[0]));
    const poolRow1 = pt1.slice(1).find(r => r.length === head1.length && /^Pool\b/i.test(r[0]));
    T.check(
      'seq_ml_mass/theo_mass_matches_mg_x1000',
      theoCol1 >= 0 && mgCol1 >= 0 && peakRows1.length > 0 &&
        peakRows1.every(r => /µg$/.test(r[theoCol1]) && num(r[theoCol1]) > 0 && Math.abs(num(r[theoCol1]) - num(r[mgCol1]) * 1000) <= 5.5) &&
        !!poolRow1 && /µg$/.test(poolRow1[theoCol1]) && Math.abs(num(poolRow1[theoCol1]) - num(poolRow1[mgCol1]) * 1000) <= 5.5,
      `headers=${JSON.stringify(head1)}, peaks=${JSON.stringify(peakRows1)}, pool=${JSON.stringify(poolRow1)}`
    );

    const [dlMl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#intCsv')]);
    const csvMl = fs.readFileSync(await dlMl.path(), 'utf8').trim().split(/\r?\n/).map(r => r.split(','));
    const cMgIdx = csvMl[0].indexOf('Protein (mg)'), cTheoIdx = csvMl[0].indexOf('theo_mass_ug');
    const cP1 = csvMl.find(r => r[1] === 'P1');
    T.check(
      'seq_ml_mass/csv_theo_matches_mg_x1000',
      cMgIdx >= 0 && cTheoIdx >= 0 && !!cP1 && +cP1[cMgIdx] > 0 && Math.abs(+cP1[cTheoIdx] - +cP1[cMgIdx] * 1000) <= 0.2,
      `csv header=${JSON.stringify(csvMl[0])}, P1=${JSON.stringify(cP1)}`
    );

    await h.step('figure');
    await h.wait(400);
    const st = await h.sumTable(), sh = st[0] || [];
    const sMgCol = sh.findIndex(c => /^Protein \(mg\)$/i.test(c));
    const sRow = st.slice(1).find(r => r.length === sh.length && sMgCol >= 0 && num(r[sMgCol]) > 0);
    T.check(
      'seq_ml_mass/matches_sum_table',
      sMgCol >= 0 && !!sRow && !!poolRow0 && mgCol0 >= 0 && Math.abs(num(poolRow0[mgCol0]) - num(sRow[sMgCol])) < 0.005,
      `intTable pool mg=${poolRow0 && poolRow0[mgCol0]}, sumTable mg=${sRow && sRow[sMgCol]}`
    );
  } finally {
    T.check('seq_ml_mass/no_page_errors', !errs.length, errs.join(' | '));
    await close();
  }

  const {p: p2, errs: errs2, close: close2} = await open(), h2 = H(p2);
  try {
    const lines260 = ['Chrom.1,,Chrom.1,', 'UV 1_260,,Fraction,', 'mL,mAU,mL,Fraction'];
    for (let i = 0; i <= 200; i++) {
      const x = +(i / 10).toFixed(1);
      const y = +(500 * Math.exp(-0.5 * Math.pow((x - 10) / 1.0, 2))).toFixed(4);
      lines260.push(`${x},${y},${i % 10 === 0 ? x : ''},${i % 10 === 0 ? '"F' + (i / 10 + 1) + '"' : ''}`);
    }
    await h2.newProject('Non-280 nm mass guard');
    await h2.gb(src('gb'));
    await p2.click('#tl [data-addmenu]');
    await p2.click('#tl [data-addstep=run]');
    await p2.setInputFiles('#file', {name: 'uv260_synth.csv', mimeType: 'text/csv', buffer: Buffer.from(lines260.join('\n'))});
    await h2.wait(800);

    const runCond = p2.locator('.trace.run.sel details.runcond').first();
    await runCond.evaluate(d => { d.open = true; });
    const flowInp = runCond.locator('input[data-k="mFlow"]').first();
    await flowInp.fill('1');
    await flowInp.dispatchEvent('change');
    await h2.wait(300);

    await detect(p2);
    const pt260 = await h2.peakTable(), head260 = pt260[0] || [];
    T.check(
      'seq_ml_mass/non280_withholds_mg_and_theo',
      head260.findIndex(c => /^Protein \(mg\)/i.test(c)) === -1 && head260.findIndex(c => /^Theo\. mass/i.test(c)) === -1,
      `260 nm headers=${JSON.stringify(head260)}`
    );

    await setOpt(p2, 'o-eps', '1.0');
    await h2.wait(300);
    const pt260Eps = await h2.peakTable(), head260Eps = pt260Eps[0] || [];
    T.check(
      'seq_ml_mass/non280_with_manual_eps_withholds_mg_and_theo',
      head260Eps.findIndex(c => /^Protein \(mg\)/i.test(c)) === -1 && head260Eps.findIndex(c => /^Theo\. mass/i.test(c)) === -1,
      `260 nm + manual eps headers=${JSON.stringify(head260Eps)}`
    );

    const [dl260] = await Promise.all([p2.waitForEvent('download', {timeout: 10000}), p2.click('#intCsv')]);
    const csv260 = fs.readFileSync(await dl260.path(), 'utf8').trim().split(/\r?\n/).map(r => r.split(','));
    const csv260MgIdx = csv260[0].indexOf('Protein (mg)'), csv260TheoIdx = csv260[0].indexOf('theo_mass_ug');
    const csv260P1 = csv260.find(r => r[1] === 'P1');
    T.check(
      'seq_ml_mass/non280_csv_withholds_mg_and_theo',
      csv260TheoIdx === -1 && csv260MgIdx >= 0 && !!csv260P1 && csv260P1[csv260MgIdx] === '',
      `260 nm CSV header=${JSON.stringify(csv260[0])}, P1=${JSON.stringify(csv260P1)}`
    );
  } finally {
    T.check('seq_ml_mass/non280_no_page_errors', !errs2.length, errs2.join(' | '));
    await close2();
  }
}

(async () => {
  await T.t('overlap', overlap);
  await T.t('axis_tick_collision', axisTickCollision);
  await T.t('zoom_peak', zoomPeak);
  for (const e of EXP) {
    await T.t(e.file, () => peakFile(e));
  }
  await T.t('zoom_to_peak_button', zoomToPeakButton);
  await T.t('peak_separator', peakSeparator);
  await T.t('uv_path_cell_selector', uvPathCellSelector);
  await T.t('theo_peak_mass', theoPeakMassTest);
  await T.t('pool_dip_same_span', poolDipSameSpan);
  await T.t('seq_derived_peak_mass_and_wl_guard', seqDerivedPeakMassAndWlGuard);
  T.done();
})();
