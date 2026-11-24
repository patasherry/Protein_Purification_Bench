const {open, H, suite, fs, path, DATA, src} = require('../lib/harness');
const IMAC = require('../data/gen_imac_missing');

(async () => {
  const T = suite('18_hplc_load');
  const {p, errs, close} = await open();
  const h = H(p);

  await T.t('hplc_load', async () => {
    await h.newProject('hplc export');

    // Load directly through #file input instead of addRun for generic loadFiles pathway
    await p.setInputFiles('#file', {
      name: 'hplc_export.csv',
      mimeType: 'text/csv',
      buffer: fs.readFileSync(path.join(DATA, 'chrom', 'hplc_export.csv'))
    });

    await p.waitForTimeout(500);

    // Verify it appears in trace list
    const traces = await p.$$eval('.trace', els => els.map(e => e.textContent));
    T.check('hplc_export/loads', traces.length > 0, 'HPLC export file loaded successfully and appears in trace list');

    // Export project JSON
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
    const fPath = path.join(__dirname, '..', 'results', 'hplc_export_proj.json');
    await dl.saveAs(fPath);
    const d = JSON.parse(fs.readFileSync(fPath, 'utf8'));

    // According to loadFiles/parseText, trace will be created (not runs)
    const r = (d.traces || []).find(x => x.name === 'hplc_export');
    T.check('hplc_export/has-trace', !!r, 'Project has the trace');
    if (r) {
      T.check('hplc_export/cols', r.cols[0] === 'Time (min)' && r.cols[1] === 'UV 280 (mAU)', 'Headers parsed correctly: ' + r.cols.join(', '));
      T.check('hplc_export/points', r.rows.length === 601, 'Correct number of points loaded: ' + r.rows.length);
      T.check('hplc_export/values', Math.abs(r.rows[0][0]) < 0.001 && Math.abs(r.rows[300][1] - 10) < 0.001, 'Correct first x and apex y value: ' + r.rows[0][0] + ', ' + r.rows[300][1]);
    }
  });

  await T.t('ezstart_sampling_rate_asc', async () => {
    await p.reload();
    await h.wait(500);
    await h.newProject('EZStart sampling rate');
    const content = ['Sampling Rate: 2 Hz', 'Total Data Points: 4 Pts', '1', '2', '3', '4', '10', '20', '30', '40'].join('\n');
    await p.setInputFiles('#file', {name: 'ezstart_2hz.asc', mimeType: 'text/plain', buffer: Buffer.from(content)});
    await h.wait(700);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
    const fPath = path.join(__dirname, '..', 'results', 'ezstart_2hz.json');
    await dl.saveAs(fPath);
    const d = JSON.parse(fs.readFileSync(fPath, 'utf8')), tr = (d.traces || []).find(x => x.name === 'ezstart_2hz');
    T.check('ezstart_sampling_rate_minutes', !!tr && tr.cols[0] === 'Time (min)' && tr.rows.length === 4 && Math.abs(tr.rows[1][0] - 1/120) < 1e-12 && JSON.stringify(tr.rows[0].slice(1)) === JSON.stringify([1, 10]), JSON.stringify(tr && {cols: tr.cols, rows: tr.rows}));
  });


  await T.t('leading_id_csv_axis_selection', async () => {
    await p.reload();
    await h.wait(500);
    await h.newProject('leading id axis selection');
    const content = 'Sample ID,Time (min),UV 280 (mAU)\n' +
      'A1,0.0,10.0\n' +
      'A1,0.1,12.0\n' +
      'A1,0.2,15.0\n' +
      'A1,0.3,9.0\n' +
      'A1,0.4,11.0\n' +
      'A1,0.5,10.0\n' +
      'A1,0.6,12.0\n' +
      'A1,0.7,15.0\n' +
      'A1,0.8,9.0\n' +
      'A1,0.9,11.0\n';
    await p.setInputFiles('#file', {name: 'generic_with_id.csv', mimeType: 'text/csv', buffer: Buffer.from(content)});
    await p.waitForTimeout(600);

    // A generic trace may not be in timeline by default, but is accessible via DOM.
    // Let's create a timeline step to display it if needed.
    await h.wait(500);
    await p.locator('#add-step-btn, #addBtn, .add-btn').first().click().catch(()=>{});
    await h.wait(200);
    await p.locator('text="Generic trace"').click().catch(()=>{});
    await h.wait(500);

    const xSel = await p.locator('select[data-k="xc"]').first().inputValue().catch(()=>'err');
    const ySel = await p.locator('select[data-k="yc"]').first().inputValue().catch(()=>'err');
    T.check('axis_sel/correct_axes', xSel === '1' && ySel === '2', 'Axes are X=1 Y=2: ' + xSel + ', ' + ySel);

  });
  await T.t('zero_measurement_diagnostics', async () => {
    await p.reload();
    await h.wait(500);
    await h.newProject('zero measurements');
    const cases = [
      ['akta', 'empty_akta.csv', 'UV 1_280\tCond\nml\tmAU\tml\tmS/cm\n', /ÄKTA|UNICORN/i, /no usable UV traces/i],
      ['nanodrop', 'empty_nd.csv', 'Date,Sample Name,Protein (mg/mL),A280,A260/A280,Sample Type\n', /NanoDrop/i, /no usable measurements/i],
      ['hplc', 'empty_hplc.csv', 'Time (min),UV 280 (mAU)\n', /chromatogram/i, /no data points/i]
    ];
    for (const [id, name, content, reFmt, reWhy] of cases) {
      await p.setInputFiles('#file', {name, mimeType: 'text/csv', buffer: Buffer.from(content)});
      await p.waitForTimeout(600);
      const toasts = await h.toasts();
      T.check(`zero_meas/${id}/diagnosed`, toasts.some(t => reFmt.test(t) && reWhy.test(t) && !/no columns of numbers found/i.test(t)), `toasts: ${toasts.join(' | ') || 'none'}`);
    }
  });

  await T.t('zero_measurement_long_header', async () => {
    await p.reload();
    await h.wait(500);
    await h.newProject('zero measurements, long header');
    /* synthetic ASCII export with 0 points: the column header sits below 25 lines of metadata */
    const meta = ['[Header]', 'Application Name\tLabSolutions', 'Version\t5.97', 'Data File Name\tC:\\Data\\blank_run.lcd', 'Output Date\t2026/01/05', 'Output Time\t10:00:00',
      '[File Information]', 'Type\tData File', 'Generated\t2026/01/05 09:00:00', 'Generated by\tSystem Administrator', 'Modified\t2026/01/05 09:30:00', 'Modified by\tSystem Administrator',
      '[Sample Information]', 'Operator\tSystem Administrator', 'Acquired\t2026/01/05 09:00:00', 'Sample Name\tblank', 'Sample ID\tblank', 'Vial#\t1', 'Injection Volume\t10',
      '[LC Chromatogram(Detector A-Ch1)]', 'Interval(msec)\t500', '# of Points\t0', 'Start Time(min)\t0.000', 'End Time(min)\t30.000', 'Intensity Units\tmAU', 'Intensity Multiplier\t1', 'Wavelength(nm)\t280'];
    const content = meta.concat(['R.Time (min)\tIntensity', '']).join('\r\n');
    await p.setInputFiles('#file', {name: 'empty_ascii_export.txt', mimeType: 'text/plain', buffer: Buffer.from(content)});
    await p.waitForTimeout(600);
    const toasts = await h.toasts();
    T.check('zero_meas/hplc_long_header/diagnosed', toasts.some(t => /empty_ascii_export\.txt/.test(t) && /chromatogram/i.test(t) && /no data points/i.test(t) && !/no columns of numbers found/i.test(t)), `toasts: ${toasts.join(' | ') || 'none'}`);
  });

  /* An explicit acceptance matrix (issue #594) distinguishing legitimate zero from blank/absent or malformed data. */
  await T.t('zero_measurement_matrix', async () => {
    await p.reload();
    await h.wait(500);
    await h.newProject('zero measurements matrix');
    const load = async (name, content) => { await p.evaluate(() => document.querySelectorAll('.toast, #toast').forEach(e => { e.textContent = ''; })); await p.setInputFiles('#file', {name, mimeType: 'text/csv', buffer: Buffer.from(content)}); await p.waitForTimeout(700); return h.toasts(); };

    // 1. Generic HPLC parses (CSV, generic text format)
    const hdr = 'Time (min),UV 280 (mAU)\n';

    // Issue #442: valid zero values
    let t = await load('442_valid_zero.csv', hdr + '0,0\n1,0\n2,0\n3,0\n');
    T.check('matrix/442_valid_zero/loads', t.some(x => /Loaded 1 trace \(UV 280, mAU over 3 min\)/i.test(x)), `toasts: ${t.join(' | ')}`);
    T.check('matrix/442_valid_zero/nothing-left-out', !t.some(x => /left out/i.test(x)), `toasts: ${t.join(' | ')}`);

    // Issue #446: malformed rows rejected
    t = await load('446_malformed.csv', hdr + '0,0bad\n1,0bad\n2,0bad\n');
    T.check('matrix/446_malformed/rejected', t.some(x => /446_malformed\.csv/.test(x) && /no data points/i.test(x)) && !t.some(x => /Loaded/.test(x)), `toasts: ${t.join(' | ')}`);

    // Issue #454: mixed valid and malformed rows (longest block kept)
    t = await load('454_mixed.csv', hdr + '0,0\n1,0bad\n2,0\n3,0\n');
    T.check('matrix/454_mixed/loads', t.some(x => /Loaded 1 trace/.test(x)), `toasts: ${t.join(' | ')}`);
    /* issue #527: the malformed row and the valid zero reading before it are left out, so the load message says so */
    T.check('matrix/454_mixed/warns-left-out', t.some(x => /Loaded 1 trace/.test(x) && /Left out 2 rows of 454_mixed:/.test(x) && /unreadable value/.test(x)), `toasts: ${t.join(' | ')}`);

    // A trailing row with a missing value and no readings after it loses nothing, so no warning
    t = await load('527_trailing_blank.csv', hdr + '0,0\n1,0\n2,0\n3,\n');
    T.check('matrix/527_trailing_blank/no-warning', t.some(x => /Loaded 1 trace/.test(x)) && !t.some(x => /left out/i.test(x)), `toasts: ${t.join(' | ')}`);

    // Absent value checks: a comma without a number should not be parsed as zero
    t = await load('absent_value_hplc.csv', hdr + '0,\n1,\n2,\n3,\n');
    T.check('matrix/absent/hplc-rejected', t.some(x => /absent_value_hplc\.csv/.test(x) && /no data points/i.test(x)) && !t.some(x => /Loaded/.test(x)), `toasts: ${t.join(' | ')}`);

    // Issue #617 (rebuild of #442): a Time/Signal header with no rows is an empty chromatogram, while the same header over zero readings loads every zero
    t = await load('617_signal_empty.txt', 'Time\tSignal\n');
    T.check('matrix/617_signal_empty/diagnosed', t.some(x => /617_signal_empty\.txt/.test(x) && /chromatogram file, but has no data points/i.test(x)) && !t.some(x => /no columns of numbers found|Loaded/i.test(x)), `toasts: ${t.join(' | ')}`);
    t = await load('617_signal_zeros.txt', 'Time\tSignal\n0.0\t0.0\n1.0\t0.0\n2.0\t0.0\n3.0\t0.0\n');
    T.check('matrix/617_signal_zeros/loads', t.some(x => /Loaded 1 trace/.test(x)) && !t.some(x => /left out|Could not read/i.test(x)), `toasts: ${t.join(' | ')}`);

    // 2. ÄKTA specific parses (UNICORN exports with specific headers)
    const akta = 'UV 1_280\tCond\nml\tmAU\tml\tmS/cm\n';

    // Issue #527: valid zeros and malformed
    t = await load('527_akta_valid.csv', akta + '0\t0\t0\t10\n1\t0\t1\t10\n2\t0\t2\t10\n3\t0\t3\t10\n');
    T.check('matrix/527_akta_valid/loads', t.some(x => /Loaded 1 ÄKTA run \(UV 1_280, mAU over 3 ml\)/i.test(x)), `toasts: ${t.join(' | ')}`);

    t = await load('527_akta_malformed.csv', akta + '0\t0bad\t0\t10\n1\t0bad\t1\t10\n2\t0bad\t2\t10\n');
    T.check('matrix/527_akta_malformed/rejected', t.some(x => /527_akta_malformed\.csv/.test(x) && /no usable UV traces/i.test(x)) && !t.some(x => /Loaded/.test(x)), `toasts: ${t.join(' | ')}`);

    // Absent value checks for ÄKTA
    t = await load('absent_value_akta.csv', akta + '0\t\t0\t10\n1\t\t1\t10\n2\t\t2\t10\n3\t\t3\t10\n');
    T.check('matrix/absent/akta-rejected', t.some(x => /absent_value_akta\.csv/.test(x) && /no usable UV traces/i.test(x)) && !t.some(x => /Loaded/.test(x)), `toasts: ${t.join(' | ')}`);


    // Verify internal state matches the assertions on what should load
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
    const fPath = path.join(__dirname, '..', 'results', 'zero_matrix_proj.json');
    await dl.saveAs(fPath);
    const d = JSON.parse(fs.readFileSync(fPath, 'utf8'));

    const z = (d.traces || []).find(x => x.name === '442_valid_zero');
    const m = (d.traces || []).find(x => x.name === '454_mixed');

    T.check('matrix/442_valid_zero/values', !!z && z.rows.length === 4 && z.rows.every(r => r[1] === 0), JSON.stringify(z && z.rows));
    /* existing behaviour: the longest contiguous block is kept; the bad value never becomes a number */
    T.check('matrix/454_mixed/keeps-longest-block', !!m && JSON.stringify(m.rows) === '[[2,0],[3,0]]', JSON.stringify(m && m.rows));
    const sz = (d.traces || []).find(x => x.name === '617_signal_zeros');
    T.check('matrix/617_signal_zeros/values', !!sz && JSON.stringify(sz.rows) === '[[0,0],[1,0],[2,0],[3,0]]' && sz.cols[1] === 'Signal', JSON.stringify(sz && {cols: sz.cols, rows: sz.rows}));
  });

  await T.t('imac_missing_fields', async () => {
    await p.reload();
    await h.wait(500);
    await h.newProject('IMAC missing fields');
    for (const c of IMAC.missingCases()) {
      await p.locator('#toast').evaluate(e => e.replaceChildren());
      await p.setInputFiles('#file', c.file);
      await h.wait(400);
      const toasts = (await h.toasts()).filter(t => t.includes(c.file.name));
      // One consolidated, format-specific list; optional gradient/fractions/flow are never requirements.
      const list = 'Missing or unreadable required fields: ' + c.fields.join('; ') + '. Export';
      T.check(`imac/${c.id}/fields`, toasts.length === 1 && toasts[0].includes(list) &&
        (toasts[0].match(/Missing or unreadable required fields:/g) || []).length === 1, toasts.join(' | '));
      T.check(`imac/${c.id}/rejected`, toasts.some(t => /no usable UV traces/.test(t)) &&
        !(await h.timeline()).some(s => /^run:/.test(s.k)), toasts.join(' | '));
    }
    for (const c of IMAC.validCases()) {
      const before = (await h.timeline()).filter(s => /^run:/.test(s.k)).length;
      await p.locator('#toast').evaluate(e => e.replaceChildren());
      await p.setInputFiles('#file', c.file);
      await h.wait(400);
      const toasts = await h.toasts();
      // A usable UV trace still loads without requiring other channels or reporting missing optional fields.
      T.check(`imac/${c.id}/loads-without-warning`, (await h.timeline()).filter(s => /^run:/.test(s.k)).length === before + 1 &&
        toasts.some(t => /Loaded 1 ÄKTA run/.test(t)) && !toasts.some(t => /Missing or unreadable|Could not read/.test(t)), toasts.join(' | '));
    }
  });

  /* #1415 & #1582: plain HPLC trace in project gets its own timeline step, poolConc IDs stay unique, and deleting a run card clears dangling links */
  await T.t('hplc_in_project_and_run_card_links', async () => {
    const csvRows = ['Time (min),UV 280 (mAU)'];
    for (let i = 0; i <= 200; i++) { const t = i / 50; csvRows.push(`${t.toFixed(2)},${(2 + 80 * Math.exp(-0.5 * ((t - 2) / 0.1) ** 2)).toFixed(3)}`); }
    const traceFile = {name: 'synthetic_hplc.csv', mimeType: 'text/csv', buffer: Buffer.from(csvRows.join('\n') + '\n')};
    const title = () => p.$eval('#ssTitle', e => e.textContent.trim());
    const drawn = () => p.$eval('#paper svg', e => e.textContent.includes('synthetic_hplc')).catch(() => false);

    await p.reload(); await h.wait(400);
    await h.newProject('Plain trace');
    T.check('step/absent-before', !(await h.timeline()).some(x => x.k === 'hplc'));
    await h.addRun(traceFile);
    const tl = await h.timeline();
    T.check('step/own-step-no-run', !tl.some(x => /^run:/.test(x.k)) && tl.some(x => x.k === 'hplc' && /1 trace/.test(x.s)) && await title() === 'HPLC traces' && await drawn() && await p.locator('#list .trace').first().isVisible());
    await h.step('construct');
    T.check('step/leaves', await title() === 'Construct' && !(await drawn()));
    await h.step('hplc');
    T.check('step/comes-back', await title() === 'HPLC traces' && await drawn());
    await p.locator('#list .trace [data-act=del]').first().click(); await h.wait(400);
    T.check('step/gone-with-the-trace', !(await h.timeline()).some(x => x.k === 'hplc') && await title() === 'Construct');

    // Add run, verify poolConc unique IDs on re-import, and verify run-card deletion cleans btw/nd/cleaveAfter links
    await h.addRun(src('his')); await h.pool('T1-T6');
    const rid = (await h.timeline()).find(x => x.k.startsWith('run:')).k.slice(4);
    await h.addConc(null, 2.0);
    await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep=cleave]'); await h.wait(350);
    await h.step('final'); await p.click('#ndManual'); await h.wait(250);
    await p.locator('#ndList .nd-edit > summary').first().click(); await h.wait(150);
    await p.locator('#ndList [data-ndk="runId"]').first().selectOption(rid); await h.wait(250);

    const [dl0] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
    const data0 = JSON.parse(fs.readFileSync(await dl0.path(), 'utf8'));
    data0.runs[0].poolConc = '2.5';

    // Delete run card -> clears dangling btw, ndSamples.runId, and cleaveAfter
    await h.step('run:' + rid);
    await p.locator(`#list .trace.run[data-id="${rid}"] [data-act="del"]`).click(); await h.wait(400);
    const [dl1] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
    const dDel = JSON.parse(fs.readFileSync(await dl1.path(), 'utf8'));
    T.check('delrun/clears-dangling-links', !(dDel.prep?.btw && Object.prototype.hasOwnProperty.call(dDel.prep.btw, rid)) && (dDel.nanodrop || []).every(x => x.runId !== rid) && dDel.prep?.cleaveAfter !== rid);

    // Import saved poolConc project and check unique #pc<id> vs #pcap<id> + compact krow checkbox
    await p.click('#homeBtn').catch(() => {}); await h.wait(350);
    await p.click('#homeQuick'); await h.wait(600);
    await p.setInputFiles('#projFile', {name: 'poolconc.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data0))});
    await h.wait(1500);
    T.check('poolconc/unique-ids', (await p.locator(`[id="pc${rid}"]`).count()) === 1 && (await p.locator(`#pcap${rid}`).count()) === 1);
    await h.dropFiles(src('gel'));
    await p.locator('details[data-sub="gknown"] > summary').click(); await h.wait(300);
    const cbW = await p.locator('#knownList .krow input[type="checkbox"]').first().evaluate(e => e.getBoundingClientRect().width);
    T.check('krow/compact-checkbox-width', cbW > 0 && cbW <= 20, `width=${cbW}`);
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
