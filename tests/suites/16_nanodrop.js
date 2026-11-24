const {open, H, suite, path, DATA, fs} = require('../lib/harness');
const F = require('../data/gen_import_sec');
const T = suite('16_nanodrop');
const SEL = {quick: '#homeQuick', project: '#projFile', save: '#projSave', file: '#file', nd: '#ndFile',
  row: '.ndr', edit: '.nd-edit summary', run: '[data-ndk="runId"]', stage: '[data-ndk="stage"]',
  dilution: '[data-ndk="dil"]', concentration: '.nd-v', poolStats: '.ndg-s', finalStats: '.ndg-lab', mass: '.ndg-mg',
  poolVolume: '[data-ndr="ndVol"]', finalVolume: '[data-ndr="ndFinalVol"]'};
const click = (p, sel) => p.locator(sel).evaluate(e => e.click());

async function saved(p){
  const download = p.waitForEvent('download'); await click(p, SEL.save);
  return JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
}

async function fresh(id, fn){
  await T.t(id, async () => { const app = await open();
    try { await fn(app.p, H(app.p)); }
    finally { T.check(id + '/no-page-errors', !app.errs.length, app.errs.join(' | ')); await app.close(); }
  });
}

(async () => {
  // Two 1 mg/mL readings become 3 and 1 while editing: mean 2, sample SD sqrt(2), mass 4 mg in 2 mL.
  for (const stage of ['pool', 'final']) await fresh('live-dilution-' + stage, async (p, h) => {
    const id = 'nd/live-dilution/' + stage;
    await h.newProject('Live dilution ' + stage);
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    await p.setInputFiles(SEL.nd, F.nd('live-dilution.tsv', [['Replicate 1', 1, 1], ['Replicate 2', 1, 1]], false));
    await p.locator(SEL.row).nth(1).waitFor();
    for (let i = 0; i < 2; i++) {
      const row = p.locator(SEL.row).nth(i);
      await row.locator(SEL.edit).click();
      await row.locator(SEL.run).selectOption({index: 1});
      if (stage === 'final') {
        await row.locator(SEL.edit).click();
        await row.locator(SEL.stage).selectOption('final');
      }
    }
    const stats = p.locator(stage === 'pool' ? SEL.poolStats : SEL.finalStats);
    const mass = p.locator(SEL.mass).nth(stage === 'pool' ? 0 : 1);
    await p.locator(stage === 'pool' ? SEL.poolVolume : SEL.finalVolume).fill('2');
    const initial = await stats.textContent();
    T.check(id + '/initial', initial === (stage === 'final' ? 'Final ' : '') + '1.00 ± 0.00 mg/mL, n 2' && await mass.textContent() === '2.00 mg', initial);
    await p.locator(SEL.row).first().locator(SEL.edit).click();
    const input = await p.locator(SEL.dilution).first().elementHandle();
    await input.fill('3');
    // Inspect the original node, not a locator that could resolve to a replacement after a panel rebuild.
    const editing = await input.evaluate(e => ({connected: e.isConnected, active: document.activeElement === e, value: e.value}));
    T.check(id + '/input-preserved', editing.connected && editing.active && editing.value === '3', JSON.stringify(editing));
    const values = await p.locator(SEL.concentration).allTextContents();
    T.check(id + '/individuals', JSON.stringify(values) === JSON.stringify(['3.00 mg/mL', '1.00 mg/mL']), JSON.stringify(values));
    const current = await stats.textContent();
    T.check(id + '/statistics', current === (stage === 'final' ? 'Final ' : '') + '2.00 ± 1.41 mg/mL, n 2', current);
    T.check(id + '/mass', await mass.textContent() === '4.00 mg', await mass.textContent());
  });

  const expected = JSON.parse(fs.readFileSync(path.join(DATA, 'expected.json'), 'utf8')).nd;
  for (const exp of expected) {
    if (exp.file === 'nd_acclaro_ug_ml.csv') continue; // Do not test the Acclaro corrected value, which is being fixed in #96.

    await fresh(exp.file.replace('.csv', '').replace('.tsv', ''), async (p, h) => {
      await h.newProject('NanoDrop test ' + exp.file);

      // We must add a run so that we are allowed to save the project
      await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
      await p.waitForTimeout(500);

      await h.step('final');
      await p.waitForTimeout(200);

      await p.setInputFiles('#ndFile', path.join(DATA, 'nd', exp.file));
      await p.waitForTimeout(400);

      // Now we wait and read DOM table if protein!
      if (exp.n > 0) {
        // Wait for the table row to appear in #ndList
        await p.waitForFunction(() => document.querySelectorAll('.ndg-r, .ndr').length > 0 || document.querySelector('.toast'));

        // Let's use `.ndr` which is the correct class
        const tableRows = await p.$$eval('.ndr', rows => rows.map(r => {
            const valText = r.querySelector('.nd-v')?.textContent || '';
            const nameEl = r.querySelector('input[data-ndk="name"]');
            const ratioText = r.querySelector('.nd-r')?.textContent || '';
            const match = ratioText.match(/260\/280\s+([0-9.]+)/);
            return {
                name: nameEl?.value?.trim(),
                r280: match ? parseFloat(match[1]) : null,
                conc: parseFloat(valText.split(' ')[0]) || null,
                unit: valText.split(' ')[1] || '',
                src: r.querySelector('.nd-v')?.title || ''
            };
        }));

        // Find which table rows correspond to protein readings based on name matching expected names
        const protRows = tableRows.filter(r => exp.names.includes(r.name));
        T.check('nd/' + exp.file + '/table_names', JSON.stringify(protRows.map(n => n.name)) === JSON.stringify(exp.names), `Expected table names ${JSON.stringify(exp.names)}, got ${JSON.stringify(protRows.map(n => n.name))}`);
        T.check('nd/' + exp.file + '/table_r280', JSON.stringify(protRows.map(n => n.r280)) === JSON.stringify(exp.r280), `Expected table r280 ${JSON.stringify(exp.r280)}, got ${JSON.stringify(protRows.map(n => n.r280))}`);

        // Read DOM table stats
        if (exp.n > 1) {
            const stats = await p.$$eval('.ndg-s', els => els.map(e => e.textContent).filter(t => t.includes('mg/mL'))[0] || '');
            if (stats) {
                const parsedMean = parseFloat(stats.split(' ± ')[0]);
                const parsedSD = parseFloat(stats.split(' ± ')[1]?.split(' ')[0]);
                T.check('nd/' + exp.file + '/table_stats', Math.abs(parsedMean - exp.mean_abs1) < 0.01 && Math.abs(parsedSD - exp.sd_abs1) < 0.01, `Expected DOM table stats to match ${exp.mean_abs1} ± ${exp.sd_abs1}, got ${stats}`);
            }
        }
      }

      // Save and parse the project JSON
      const data = await saved(p);
      const nd = data.nanodrop || [];

      // Check n
      T.check('nd/' + exp.file + '/n', nd.filter(n => n.kind !== 'nucleic').length === exp.n, `Expected ${exp.n} protein readings, got ${nd.filter(n => n.kind !== 'nucleic').length}`);

      if (exp.n > 0) {
        const prot = nd.filter(n => n.kind !== 'nucleic');

        // Check concentrations match file, converted to mg/mL
        const mean = prot.reduce((a, b) => a + (b.a280 != null ? b.a280 : b.conc), 0) / prot.length;
        T.check('nd/' + exp.file + '/mean_abs1', Math.abs(mean - exp.mean_abs1) < 0.001, `Expected mean ${exp.mean_abs1}, got ${mean}`);

        if (exp.n > 1) {
            const sd = Math.sqrt(prot.reduce((a, b) => a + Math.pow((b.a280 != null ? b.a280 : b.conc) - mean, 2), 0) / (prot.length - 1));
            T.check('nd/' + exp.file + '/sd_abs1', Math.abs(sd - exp.sd_abs1) < 0.005, `Expected SD ${exp.sd_abs1}, got ${sd}`);
        }
      }


      // Nucleic acid readings shouldn't be counted as protein. Check they are marked as nucleic
      if (exp.nucleic !== undefined) {
          T.check('nd/' + exp.file + '/nucleic', nd.filter(n => n.kind === 'nucleic').length === exp.nucleic, `Expected ${exp.nucleic} nucleic acid readings, got ${nd.filter(n => n.kind === 'nucleic').length}`);
      }

      // Specifically test the new multiline preamble file for expected parsed concentration
      if (exp.file === 'nd_multiline_preamble.csv') {
          const prot = nd.filter(n => n.kind !== 'nucleic');
          // Find the concentration for Sample 1
          const s1 = prot.find(n => n.name === 'Sample 1');
          T.check('nd/' + exp.file + '/s1_conc', s1 && Math.abs((s1.a280 != null ? s1.a280 : s1.conc) - 2.5) < 0.001, `Expected Sample 1 concentration 2.5, got ${s1 ? (s1.a280 != null ? s1.a280 : s1.conc) : 'not found'}`);
      }

      // Check UNICORN metadata specific case
      if (exp.file === 'nd_unicorn_metadata.txt') {
          const prot = nd.filter(n => n.kind !== 'nucleic');
          const p1 = prot.find(n => n.name === 'Pool 1');
          T.check('nd/' + exp.file + '/p1_conc', p1 && Math.abs((p1.a280 != null ? p1.a280 : p1.conc) - 1.5) < 0.001, `Expected Pool 1 concentration 1.5, got ${p1 ? (p1.a280 != null ? p1.a280 : p1.conc) : 'not found'}`);
      }

    });
  }





  await T.t('malformed-header-toast', async () => {
    const app = await open();
    const p = app.p, h = H(p);

    await h.newProject('malformed_header_test');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await p.waitForTimeout(500);

    await h.step('final');
    await p.waitForTimeout(200);

    // Provide a newly generated file using the file path
    await p.setInputFiles('#file', path.join(DATA, 'nd/nd_malformed_header.csv'));

    // Wait for the toast to appear
    await p.waitForSelector('#toast .pill', {timeout: 2000});

    // Check if the toast has the correct text
    const toastText = await p.locator('#toast').textContent();
    T.check('nd/malformed-header-toast', toastText.includes('has no usable measurements'), 'Expected toast to mention "no usable measurements", got: ' + toastText);

    await app.close();
  });


  await T.t('nanodrop-metadata-positive', async () => {
    const app = await open();
    const p = app.p, h = H(p);

    await h.newProject('metadata_positive_test');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await p.waitForTimeout(500);

    await h.step('final');
    await p.waitForTimeout(200);

    // Provide the multiline preamble file
    await p.setInputFiles('#ndFile', path.join(DATA, 'nd/nd_multiline_preamble.csv'));
    await p.waitForTimeout(400);

    await p.waitForFunction(() => document.querySelectorAll('.ndr').length > 0 || document.querySelector('.toast'), {timeout: 2000}).catch(() => {});

    // Read DOM table stats for Sample 1
    const s1Row = await p.$$eval('.ndr', rows => {
        for (const r of rows) {
            const nameEl = r.querySelector('input[data-ndk="name"]');
            if (nameEl && nameEl.value.trim() === 'Sample 1') {
                const valText = r.querySelector('.nd-v')?.textContent || '';
                return {
                    conc: parseFloat(valText.split(' ')[0]) || null
                };
            }
        }
        return null;
    });

    T.check('nd/metadata-positive/s1_conc', s1Row && Math.abs(s1Row.conc - 2.5) < 0.001, 'Expected Sample 1 concentration 2.5, got ' + (s1Row ? s1Row.conc : 'not found'));

    // Verify it handles full vendor extraction by saving and checking JSON (like the exp loop does)
    const download = p.waitForEvent('download'); await click(p, SEL.save);
    const data = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
    const nd = data.nanodrop || [];
    const s1 = nd.find(n => n.name === 'Sample 1');
    T.check('nd/metadata-positive/json_conc', s1 && Math.abs((s1.a280 != null ? s1.a280 : s1.conc) - 2.5) < 0.001, `Expected Sample 1 json concentration 2.5, got ${s1 ? (s1.a280 != null ? s1.a280 : s1.conc) : 'not found'}`);

    await app.close();
  });

  await T.t('nanodrop-metadata-skip', async () => {
    const app = await open();
    const p = app.p, h = H(p);

    await h.newProject('metadata_test');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await p.waitForTimeout(500);

    await h.step('final');
    await p.waitForTimeout(200);

    await p.evaluate(([id]) => { const el = document.getElementById(id); if (el) el.checked = false; }, ['o-ndCorr']);
    await p.evaluate(() => { const el = document.getElementById('o-ndNorm'); if (el) { el.value = 'raw'; el.dispatchEvent(new Event('change', {bubbles: true})); } });
    await p.waitForTimeout(200);

    await p.setInputFiles('#ndFile', path.join(DATA, 'nanodrop_metadata.txt'));
    await p.waitForTimeout(400);

    await p.waitForFunction(() => document.querySelectorAll('.ndr').length === 10 || document.querySelector('.toast'), {timeout: 2000}).catch(() => {});

    T.check('nanodrop-metadata-skip', await p.locator('.ndr').count() === 10, 'Expected 10 data rows after skipping metadata');

    await app.close();
  });

  // Agilent-style preamble: a metadata row naming "Sample Name:" and "Conc (mg/mL)" must not be taken for the table header.
  await fresh('nanodrop-metadata-agilent', async (p, h) => {
    await h.newProject('Agilent metadata');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    await p.setInputFiles(SEL.nd, path.join(DATA, 'nanodrop_metadata_agilent.txt'));
    await p.locator(SEL.row).first().waitFor();
    const rows = await p.$$eval(SEL.row, els => els.map(el => ({name: el.querySelector('input[data-ndk="name"]')?.value, value: el.querySelector('.nd-v')?.textContent.trim()})));
    T.check('nd/metadata-agilent', JSON.stringify(rows) === JSON.stringify([{name: 'Pool A', value: '1.25 mg/mL'}, {name: 'Pool B', value: '2.50 mg/mL'}, {name: 'Pool C', value: '0.75 mg/mL'}]), JSON.stringify(rows));
  });

  // A measured zero is valid, but a malformed token beginning with zero is not a measurement.
  await fresh('zero-measurement-validation', async (p, h) => {
    await h.newProject('Zero measurement validation');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    await p.setInputFiles(SEL.nd, F.nd('zero-measurements.tsv', [['Measured zero', '0', '0'], ['Malformed zero', '0bad', '0bad']], false));
    await p.locator(SEL.row).first().waitFor();
    const rows = await p.$$eval(SEL.row, els => els.map(el => ({name: el.querySelector('input[data-ndk="name"]')?.value, value: el.querySelector('.nd-v')?.textContent.trim()})));
    T.check('nd/zero-measurement-validation', JSON.stringify(rows) === JSON.stringify([{name: 'Measured zero', value: '0.00 mg/mL'}]), JSON.stringify(rows));
  });

  // Suffix numbers like 0.05A or 1.23* should be parsed as 0.05 and 1.23
  await fresh('suffix-measurement-validation', async (p, h) => {
    await h.newProject('Suffix measurement validation');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    await p.setInputFiles(SEL.nd, F.nd('suffix-measurements.tsv', [['Suffixed A', '0.05A', '0.05A'], ['Suffixed Star', '1.23*', '1.23*']], false));
    await p.locator(SEL.row).first().waitFor();
    const rows = await p.$$eval(SEL.row, els => els.map(el => ({name: el.querySelector('input[data-ndk="name"]')?.value, value: el.querySelector('.nd-v')?.textContent.trim()})));
    T.check('nd/suffix-measurement-validation', JSON.stringify(rows) === JSON.stringify([{name: 'Suffixed A', value: '0.05 mg/mL'}, {name: 'Suffixed Star', value: '1.23 mg/mL'}]), JSON.stringify(rows));
  });

  // Rows where sample name starts with "Vendor" or ends with ":" should be excluded.
  await fresh('vendor-preamble-validation', async (p, h) => {
    await h.newProject('Vendor preamble validation');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    await p.setInputFiles(SEL.nd, F.nd('vendor-preamble.tsv', [['Vendor: Preamble', '1.0', '1.0'], ['Some:', '1.0', '1.0'], ['Real sample', '1.5', '1.5']], false));
    await p.locator(SEL.row).first().waitFor();
    const rows = await p.$$eval(SEL.row, els => els.map(el => ({name: el.querySelector('input[data-ndk="name"]')?.value, value: el.querySelector('.nd-v')?.textContent.trim()})));
    T.check('nd/vendor-preamble-validation', JSON.stringify(rows) === JSON.stringify([{name: 'Real sample', value: '1.50 mg/mL'}]), JSON.stringify(rows));
  });

  // #626: a concentration in a unit the app does not convert is kept as read and flagged for review, not silently passed off as mg/mL.
  await fresh('unit-review-flag', async (p, h) => {
    await h.newProject('Unit review flag');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    const files = [F.ndUnit('unit-pmol.tsv', 'pmol/µL', [['Molar head', '0.50', '12.5']]), F.ndUnit('unit-col-uM.tsv', 'µM', [['Molar col', '0.40', '8']], true),
      F.ndUnit('unit-mg.tsv', 'mg/mL', [['Mass mg', '2.00', '2']]), F.ndUnit('unit-ug.tsv', 'µg/mL', [['Mass ug', '1.50', '1500']])];
    const toasts = [], order = ['Molar head', 'Molar col', 'Mass mg', 'Mass ug'];
    for (let i = 0; i < files.length; i++) {
      await p.setInputFiles(SEL.nd, files[i]);
      await p.waitForFunction(n => document.querySelectorAll('.ndr').length === n, i + 1);
      toasts.push((await p.locator('#toast .pill').allTextContents()).filter(t => t.startsWith('Added')).pop() || '');
    }
    const rows = await p.$$eval(SEL.row, els => els.map(el => ({name: el.querySelector('input[data-ndk="name"]')?.value, value: el.querySelector('.nd-v')?.textContent.trim(), flag: el.querySelector('.nd-unit')?.textContent.trim() || ''}))).then(r => r.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)));
    const want = [{name: 'Molar head', value: '12.50 mg/mL', flag: '▲ Review required: pmol/µL'}, {name: 'Molar col', value: '8.00 mg/mL', flag: '▲ Review required: µM'},
      {name: 'Mass mg', value: '2.00 mg/mL', flag: ''}, {name: 'Mass ug', value: '1.50 mg/mL', flag: ''}];
    T.check('nd/unit-review/rows', JSON.stringify(rows) === JSON.stringify(want), JSON.stringify(rows));
    T.check('nd/unit-review/toast', /Review required: unrecognised concentration unit pmol\/µL, kept as read/.test(toasts[0]) && /Review required: unrecognised concentration unit µM/.test(toasts[1]) && !/Review required/.test(toasts[2] + toasts[3]), JSON.stringify(toasts));
    const nd = (await saved(p)).nanodrop || [];
    T.check('nd/unit-review/saved', JSON.stringify(nd.map(s => [s.name, s.conc, s.unitWarn || ''])) === JSON.stringify([['Molar head', 12.5, 'pmol/µL'], ['Molar col', 8, 'µM'], ['Mass mg', 2, ''], ['Mass ug', 1.5, '']]), JSON.stringify(nd.map(s => [s.name, s.conc, s.unitWarn])));
  });

  // #846: on a minutes axis the pool volume left blank is the pool width times the flow, as for the UV mass.
  // Pool F1-F6 runs 17 to 23 min; at 2.5 mL/min that is 15 mL, and readings of 1.3, 1.4, 1.5 mg/mL give 1.40 x 15 = 21.00 mg.
  // Without a flow there is no volume to use, so the amount stays blank.
  for (const flow of ['2.5', '']) await fresh('pool-volume-minutes-' + (flow ? 'flow' : 'no-flow'), async (p, h) => {
    const id = 'nd/pool-volume-minutes/' + (flow ? 'flow' : 'no-flow');
    await h.newProject('Minutes pool ' + (flow || 'no flow'));
    await h.addRun(path.join(DATA, 'chrom/hplc_min_flow_missing_u7.csv'));
    await h.pool('F1-F6');
    if (flow) { const f = p.locator('.trace.run.sel [data-k=mFlow]').first();
      await f.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });
      await f.fill(flow); await f.dispatchEvent('change'); await p.waitForTimeout(400); }
    await h.step('final');
    await p.setInputFiles(SEL.nd, F.nd('minutes-pool.tsv', [['Pool 1', 1.3, 1.3], ['Pool 2', 1.4, 1.4], ['Pool 3', 1.5, 1.5]], false));
    await p.locator(SEL.row).nth(2).waitFor();
    for (let i = 0; i < 3; i++) { const row = p.locator(SEL.row).nth(i); await row.locator(SEL.edit).click(); await row.locator(SEL.run).selectOption({index: 1}); }
    const stats = await p.locator(SEL.poolStats).first().textContent(), mass = (await p.locator(SEL.mass).first().textContent()).trim(),
      vol = await p.locator(SEL.poolVolume).first().getAttribute('placeholder');
    T.check(id + '/statistics', stats === '1.40 ± 0.10 mg/mL, n 3', stats);
    if (flow) {
      T.check(id + '/volume', vol === '15.0', `expected 15.0 mL (6 min x 2.5 mL/min), got placeholder ${vol}`);
      T.check(id + '/mass', mass === '21.00 mg', `expected 21.00 mg (1.40 mg/mL x 15 mL), got "${mass}"`);
    } else {
      T.check(id + '/volume', vol === 'pool', `expected no volume without a flow, got placeholder ${vol}`);
      T.check(id + '/mass', mass === '', `expected no mass without a flow, got "${mass}"`);
    }
  });

  // #1065: tied best NanoDrop assignment scores leave readings unassigned with a review prompt; unique best matches assign automatically.
  await fresh('tied-assignment-review', async (p, h) => {
    const id = 'nd/tied-assignment';
    await h.newProject('Tied assignment review');
    await h.addRun(F.unicorn('imac_affinity_step.tsv'));
    await h.addRun(F.unicorn('imac_polishing_step.tsv'));
    await h.step('final');

    // Load two readings:
    // 1. "IMAC pool" matches both runs equally (word 'IMAC') -> tied, must remain unassigned with review prompt.
    // 2. "Polishing pool" uniquely matches run 2 (word 'POLISHING') -> unique match, must auto-assign to run 2 without review prompt.
    await p.setInputFiles(SEL.nd, F.nd('tied_and_unique.tsv', [
      ['IMAC pool', '2.00', '2.00'],
      ['Polishing pool', '3.00', '3.00']
    ], false));
    await p.locator(SEL.row).nth(1).waitFor();

    // Check rows and flags
    const rows = await p.$$eval(SEL.row, els => els.map(el => ({
      name: el.querySelector('input[data-ndk="name"]')?.value,
      value: el.querySelector('.nd-v')?.textContent.trim(),
      flag: el.querySelector('.nd-tied')?.textContent.trim() || ''
    }))).then(r => r.sort((a, b) => a.name.localeCompare(b.name)));
    T.check(id + '/flags', JSON.stringify(rows) === JSON.stringify([
      {name: 'IMAC pool', value: '2.00 mg/mL', flag: '▲ Review required: select step'},
      {name: 'Polishing pool', value: '3.00 mg/mL', flag: ''}
    ]), JSON.stringify(rows));

    // Neither run should have pool stats for the tied reading:
    // Run 1 has 0 readings assigned -> no stats
    // Run 2 has only "Polishing pool" (3.00 mg/mL) assigned -> "3.00 mg/mL"
    const stats = await p.$$eval(SEL.poolStats, els => els.map(e => e.textContent.trim()).filter(Boolean));
    T.check(id + '/run-stats-initial', JSON.stringify(stats) === JSON.stringify(['3.00 mg/mL']), JSON.stringify(stats));

    // Find the tied reading ("IMAC pool") row and verify option prompt
    const tiedIdx = await p.$$eval(SEL.row, els => els.findIndex(el => el.querySelector('input[data-ndk="name"]')?.value === 'IMAC pool'));
    const tiedRow = p.locator(SEL.row).nth(tiedIdx);
    await tiedRow.locator(SEL.edit).click();
    const promptOpt = await tiedRow.locator(SEL.run + ' option').first().textContent();
    T.check(id + '/dropdown-prompt', promptOpt === 'Select step…', promptOpt);

    // Manually assign the tied reading to Run 1 (index 1)
    await tiedRow.locator(SEL.run).selectOption({index: 1});

    // Flag should disappear from the row
    const flagAfter = await tiedRow.locator('.nd-tied').count();
    T.check(id + '/flag-cleared-after-select', flagAfter === 0, 'Expected flag to be cleared');

    // Both runs now have their respective readings assigned
    const statsAfter = await p.$$eval(SEL.poolStats, els => els.map(e => e.textContent.trim()).filter(Boolean));
    T.check(id + '/run-stats-after-select', JSON.stringify(statsAfter) === JSON.stringify(['2.00 mg/mL', '3.00 mg/mL']), JSON.stringify(statsAfter));
  });

  // #1519: Warn when A340 exceeds a turbidity threshold in the NanoDrop panel
  await fresh('turbidity-a340-warning', async (p, h) => {
    const id = 'nd/turbidity-warning';
    await h.newProject('A340 turbidity warning');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');

    const tsv = 'Sample Name\tA280\tA340\nTurbid Sample\t1.00\t0.50\nClean Sample\t1.00\t0.05';
    await p.setInputFiles(SEL.nd, {name: 'turbidity.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(tsv)});
    await p.locator(SEL.row).nth(1).waitFor();

    const rowOf = name => p.locator(SEL.row).filter({has: p.locator(`input[data-ndk="name"][value="${name}"]`)});
    const turbidRow = rowOf('Turbid Sample');
    const cleanRow = rowOf('Clean Sample');

    const turbidWarn = turbidRow.locator('.nd-turbid, .nd-flags span').filter({hasText: /turbid|a340/i});
    const cleanWarn = cleanRow.locator('.nd-turbid, .nd-flags span').filter({hasText: /turbid|a340/i});

    T.check(id + '/turbid-warns', await turbidWarn.count() > 0 && await turbidWarn.first().isVisible(), 'Turbid sample with A340 = 0.50 should show a visible turbidity warning');
    T.check(id + '/clean-quiet', await cleanWarn.count() === 0, 'Clean sample with A340 = 0.05 should not show a turbidity warning');

    // Threshold setting in settings UI can be adjusted
    const warnInput = p.locator('#o-ndA340Warn');
    T.check(id + '/setting-default', await warnInput.count() > 0 && await warnInput.inputValue() === '0.1', 'Setting #o-ndA340Warn should default to 0.1');

    await warnInput.fill('0.6');
    await warnInput.dispatchEvent('input');
    T.check(id + '/higher-thresh-clears', await turbidWarn.count() === 0, 'Raising threshold to 0.6 should clear turbidity warning for A340 = 0.50');

    await warnInput.fill('0.1');
    await warnInput.dispatchEvent('input');
    T.check(id + '/restore-thresh-warns', await turbidWarn.count() > 0 && await turbidWarn.first().isVisible(), 'Restoring threshold to 0.1 should re-display turbidity warning');
  });

  // #1574: synthetic spectra, a Gaussian band at 280 nm with heights 0.5, 1.0 and 1.5
  const band = (w, h) => (h * Math.exp(-Math.pow((w - 280) / 15, 2))).toFixed(4);
  const ndSpectra = async (p, file) => {
    await p.click(SEL.quick); await p.waitForTimeout(600);
    await p.setInputFiles(SEL.nd, file); await p.waitForTimeout(800);
    const names = await p.$$eval('#ndList .ndr input[data-ndk="name"]', es => es.map(e => e.value.trim()));
    const tab = p.locator('#figtabs .figtab').filter({hasText: /nanodrop/i}).first();
    if (await tab.count()) { await tab.click(); await p.waitForTimeout(400); }
    const paths = await p.$$eval('#paper svg g[clip-path="url(#ndclip)"] path', es => es.length);
    return {names, paths};
  };
  // (1) NanoDrop One .tsv with three per-sample blocks stacked: every block loads, not only the first
  await fresh('nd-one-stacked-blocks', async p => {
    const id = 'nd/one-stacked-blocks';
    const block = (name, h) => [name, '11/18/2026 10:0' + h * 2 + ' AM', 'Wavelength (nm)\t10mm Absorbance', '// calibration comment',
      ...Array.from({length: 61}, (_, i) => `${220 + i * 2}\t${band(220 + i * 2, h)}`)].join('\n');
    const tsv = [block('Peak A', 0.5), block('Pool B', 1.0), block('Final C', 1.5)].join('\n');
    const r = await ndSpectra(p, {name: 'stacked.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(tsv)});
    T.check(id + '/rows', JSON.stringify(r.names) === JSON.stringify(['Peak A', 'Pool B', 'Final C']), JSON.stringify(r.names));
    // each block keeps its own A280 (0.5 : 1.0 : 1.5), whatever coefficient converts it
    const conc = await p.$$eval('#ndList .ndr .nd-v', es => es.map(e => parseFloat(e.textContent)));
    T.check(id + '/a280', conc.length === 3 && conc[0] > 0 && Math.abs(conc[1] / conc[0] - 2) < 0.05 && Math.abs(conc[2] / conc[0] - 3) < 0.05, JSON.stringify(conc));
    T.check(id + '/spectra', r.paths === 3, `${r.paths} spectrum paths`);
  });
  // (2) NanoDrop Eight .txt: UUID Sample Id, Sample Name blank on row 2, comma-decimal wavelength headers 250,0..300,0
  await fresh('nd-eight-names-comma-wl', async p => {
    const id = 'nd/eight-names-comma-wl';
    const wl = Array.from({length: 51}, (_, i) => 250 + i), uuid = ['3f2a9c1e-0b7d-4e5a-9c21-7d8e6f5a4b31', '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'];
    const txt = [['Sample Id', 'Sample Name', 'Date', 'A280', 'A260/A280', ...wl.map(w => w + ',0')].join('\t'),
      [uuid[0], 'Pool B', '18.11.2026', '1,00', '0,57', ...wl.map(w => band(w, 1.0).replace('.', ','))].join('\t'),
      [uuid[1], '', '18.11.2026', '1,50', '0,58', ...wl.map(w => band(w, 1.5).replace('.', ','))].join('\t')].join('\n');
    const r = await ndSpectra(p, {name: 'eight.txt', mimeType: 'text/plain', buffer: Buffer.from(txt)});
    T.check(id + '/names', JSON.stringify(r.names) === JSON.stringify(['Pool B', uuid[1]]), JSON.stringify(r.names));
    T.check(id + '/spectra', r.paths === 2, `${r.paths} spectrum paths`);
  });

  // Deduplicated unit conversions (ng/µL, µg/µL), unsupported-unit quarantine (#1064, #1518), and A260/A280 ratio warning (#1457)
  await fresh('units-quarantine-and-ratio-warn', async (p, h) => {
    await h.newProject('Units quarantine and ratio');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.pool('A1-A3');
    await h.step('final');
    const rowsOf = () => p.$$eval('.ndr', rows => rows.map(r => ({
      name: r.querySelector('input[data-ndk="name"]')?.value?.trim(),
      val: r.querySelector('.nd-v')?.textContent?.trim() || '',
      warn: r.querySelector('.nd-unit')?.textContent?.trim() || '',
      flags: [...r.querySelectorAll('.nd-flags span')].filter(e => e.getClientRects().length).map(e => e.textContent.trim())
    })));
    const loadNd = async (name, mimeType, text, expectedCount) => {
      await p.setInputFiles('#ndFile', {name, mimeType, buffer: Buffer.from(text)});
      await p.waitForFunction(n => document.querySelectorAll('.ndr').length === n, expectedCount);
    };

    // 1. Unsupported unit (12.5 pmol/µL) quarantined from group stats & summary CSV
    await loadNd('nd_pmol.tsv', 'text/tab-separated-values', 'Sample Name\tSample Type\tConcentration\tUnits\tA280\tA260/A280\nSample pmol\tProtein A280\t12.5\tpmol/µL\t1.000\t0.57', 1);
    const row0 = p.locator('.ndr').first();
    await row0.locator('summary').click();
    await row0.locator('select[data-ndk="runId"]').selectOption({index: 1});
    await p.locator('input[data-ndr="ndVol"]').fill('10');
    await p.locator('input[data-ndr="ndVol"]').dispatchEvent('change');
    await p.waitForTimeout(200);
    T.check('nd/quarantine/group_stats_excluded', (await p.locator('.ndg-h .ndg-s').textContent()).trim() === '' && (await p.locator('.ndg-h .ndg-mg').first().textContent()).trim() === '', 'unsupported unit excluded from group stats/mass');

    await h.step('figure'); await p.waitForTimeout(250);
    const [d1] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#sumCsv')]);
    const csv1 = fs.readFileSync(await d1.path(), 'utf8').split(/\r?\n/).map(l => l.split(','));
    T.check('nd/quarantine/csv_excluded', (csv1[1][6] || '') === '' && (csv1[1][10] || '') === '', JSON.stringify(csv1[1]));

    // Adding valid 2.0 mg/mL reading to same run populates stats/CSV using only the valid reading
    await h.step('final');
    await loadNd('nd_valid.tsv', 'text/tab-separated-values', 'Sample Name\tSample Type\tConcentration\tUnits\tA280\tA260/A280\nSample valid_mg\tProtein A280\t2.0\tmg/mL\t1.000\t0.57', 2);
    await p.locator('.ndr').nth(1).locator('summary').click();
    await p.locator('.ndr').nth(1).locator('select[data-ndk="runId"]').selectOption({index: 1});
    await p.waitForTimeout(250);
    T.check('nd/quarantine/group_stats_only_valid', (await p.locator('.ndg-h .ndg-s').textContent()).trim() === '2.00 mg/mL' && (await p.locator('.ndg-h .ndg-mg').first().textContent()).trim() === '20.00 mg', 'valid reading used');

    // 2. ng/µL -> mg/mL and µg/µL (Units col + header) -> mg/mL without unit warning
    await loadNd('nd_ng.csv', 'text/csv', 'Date,Sample Name,Protein (ng/µL),A280,A260/A280,Sample Type\n10/24/2026 10:00:00 AM,Sample ng_uL,1000.0,1.000,0.50,1 Abs = 1 mg / mL', 3);
    await loadNd('nd_ugul_col.tsv', 'text/tab-separated-values', 'Sample Name\tSample Type\tConcentration\tUnits\tA280\tA260/A280\nSample units_ugul\tProtein A280\t5.0\tug/uL\t1.000\t1.43', 4);
    await loadNd('nd_ugul_head.tsv', 'text/tab-separated-values', 'Sample Name\tSample Type\tProtein (µg/µL)\tA280\tA260/A280\nSample head_ugul\tProtein A280\t5.0\t1.000\t0.57', 5);
    const rs = await rowsOf();
    const byName = n => rs.find(x => x.name === n);
    T.check('nd/unit/ng_uL', !!byName('Sample ng_uL') && byName('Sample ng_uL').val.startsWith('1.00 mg/mL'), JSON.stringify(byName('Sample ng_uL')));
    T.check('nd/unit/ug_uL_units_col', !!byName('Sample units_ugul') && byName('Sample units_ugul').val.startsWith('5.00 mg/mL') && !byName('Sample units_ugul').warn, JSON.stringify(byName('Sample units_ugul')));
    T.check('nd/unit/ug_uL_header', !!byName('Sample head_ugul') && byName('Sample head_ugul').val.startsWith('5.00 mg/mL') && !byName('Sample head_ugul').warn, JSON.stringify(byName('Sample head_ugul')));
    T.check('nd/ratio_0.7_warns', !!byName('Sample units_ugul') && byName('Sample units_ugul').flags.some(t => /outside expected range for pure protein/i.test(t)), JSON.stringify(byName('Sample units_ugul')));
    T.check('nd/ratio_2.0_quiet', !!byName('Sample ng_uL') && !byName('Sample ng_uL').flags.some(t => /outside expected range/i.test(t)), JSON.stringify(byName('Sample ng_uL')));
  });

  // #1726: #ndManual ("Type a reading") starts blank (no 1.00 or null*1 === 0.00 mg/mL), renders inline A280/mg/mL/260/280 inputs, and updates .nd-v and .nd-flags live without dropping focus.
  await fresh('manual_typed_reading', async (p, h) => {
    const id = 'nd/manual_typed_reading';
    await h.newProject('Manual typed reading');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await h.step('final');
    await p.click('#ndManual');
    await p.locator(SEL.row).first().waitFor();

    const initVal = (await p.locator('.ndr .nd-v').first().textContent()).trim();
    T.check(id + '/starts_empty', initVal === '', `expected empty .nd-v before typing, got "${initVal}"`);

    const aInp = await p.$('.ndr input[data-ndk="a280"]');
    const cInp = await p.$('.ndr input[data-ndk="conc"]');
    const rInp = await p.$('.ndr input[data-ndk="r280"]');
    const vis = async el => el ? await el.isVisible() : false;
    const hasInputs = (await vis(aInp)) && (await vis(cInp)) && (await vis(rInp));
    T.check(id + '/has_inline_inputs', hasInputs, `a280=${!!aInp} conc=${!!cInp} r280=${!!rInp}`);

    let a280Focus = false, valAfterA280 = '', flagsAfterR280 = '', r280Focus = false, valAfterConc = '', a280Cleared = false, clearedStaysEmpty = false;
    if (aInp && cInp && rInp) {
      a280Focus = await aInp.evaluate(e => document.activeElement === e);
      await aInp.fill('2.80');
      const stA = await aInp.evaluate(e => ({connected: e.isConnected, active: document.activeElement === e, value: e.value}));
      a280Focus = a280Focus && stA.connected && stA.active && stA.value === '2.80';
      valAfterA280 = (await p.locator('.ndr .nd-v').first().textContent()).trim();

      await rInp.fill('0.95');
      const stR = await rInp.evaluate(e => ({connected: e.isConnected, active: document.activeElement === e, value: e.value}));
      r280Focus = stR.connected && stR.active && stR.value === '0.95';
      flagsAfterR280 = (await p.locator('.ndr .nd-flags').first().textContent()).trim();

      await cInp.fill('3.50');
      const stC = await cInp.evaluate(e => ({connected: e.isConnected, active: document.activeElement === e, value: e.value}));
      valAfterConc = stC.connected && stC.active ? (await p.locator('.ndr .nd-v').first().textContent()).trim() : '';
      a280Cleared = await aInp.evaluate(e => e.value === '');

      await cInp.fill('');
      clearedStaysEmpty = (await p.locator('.ndr .nd-v').first().textContent()).trim() === '';
      await aInp.fill('2.80');
    }
    T.check(id + '/live_a280_and_focus', a280Focus && valAfterA280 === '2.80 mg/mL', `focus=${a280Focus} val="${valAfterA280}"`);
    T.check(id + '/live_r280_flags_and_focus', r280Focus && /260\/280\s+0\.95/.test(flagsAfterR280) && /▲/.test(flagsAfterR280), `focus=${r280Focus} flags="${flagsAfterR280}"`);
    T.check(id + '/live_conc_and_null_guard', valAfterConc === '3.50 mg/mL' && a280Cleared && clearedStaysEmpty, `val="${valAfterConc}" a280Cleared=${a280Cleared} clearedStaysEmpty=${clearedStaysEmpty}`);

    await p.setViewportSize({width: 390, height: 844});
    const noOverflow390 = hasInputs && await p.$eval('.ndr', el => el.scrollWidth <= el.clientWidth + 1);
    T.check(id + '/fits_390px', noOverflow390, 'manual inputs fit within .ndr at 390px width without horizontal overflow');
  });

  T.done();
})();
