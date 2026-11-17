const {open, H, suite, path, DATA, RES, fs} = require('../lib/harness');
const T = suite('test_nanodrop_units');

async function fresh(id, fn){
  await T.t(id, async () => { const app = await open();
    try { await fn(app.p, H(app.p)); }
    finally { T.check(id + '/no-page-errors', !app.errs.length, app.errs.join(' | ')); await app.close(); }
  });
}

(async () => {
  await fresh('nanodrop_unit_conversion', async (p, h) => {
    await h.newProject('Unit conversion test');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await p.waitForTimeout(500);
    await h.step('final');
    await p.waitForTimeout(200);

    // Write a temp file for this test
    const data_ng = `Date,Sample Name,Protein (ng/µL),A280,A260/A280,Sample Type,MW,E / 1000,Extinction coefficient,Baseline Correction (nm),Baseline Absorbance\n10/24/2026 10:00:00 AM,Sample ng_uL,1000.0,1.000,0.57,1 Abs = 1 mg / mL,,,,340,0.012`;
    const data_ug = `Date,Sample Name,Protein (µg/mL),A280,A260/A280,Sample Type,MW,E / 1000,Extinction coefficient,Baseline Correction (nm),Baseline Absorbance\n10/24/2026 10:00:00 AM,Sample ug_mL,1500.0,1.500,0.57,1 Abs = 1 mg / mL,,,,340,0.012`;
    const data_mg = `Date,Sample Name,Protein (mg/mL),A280,A260/A280,Sample Type,MW,E / 1000,Extinction coefficient,Baseline Correction (nm),Baseline Absorbance\n10/24/2026 10:00:00 AM,Sample mg_mL,2.0,2.000,0.57,1 Abs = 1 mg / mL,,,,340,0.012`;
    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_ng.csv', mimeType: 'text/csv', buffer: Buffer.from(data_ng)});
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length > 0);
    let tableRows = await p.$$eval('.ndr', rows => rows.map(r => ({
        name: r.querySelector('input[data-ndk="name"]')?.value?.trim(),
        val: r.querySelector('.nd-v')?.textContent || ''
    })));
    T.check('nd/unit/ng_uL', tableRows.some(r => r.name === 'Sample ng_uL' && r.val.startsWith('1.00 mg/mL')), `Expected 1.00 mg/mL for 1000 ng/µL, got ${tableRows.find(r => r.name === 'Sample ng_uL')?.val}`);

    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_ug.csv', mimeType: 'text/csv', buffer: Buffer.from(data_ug)});
    // wait for 2 rows to appear
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length === 2);
    tableRows = await p.$$eval('.ndr', rows => rows.map(r => ({
        name: r.querySelector('input[data-ndk="name"]')?.value?.trim(),
        val: r.querySelector('.nd-v')?.textContent || ''
    })));
    T.check('nd/unit/ug_mL', tableRows.some(r => r.name === 'Sample ug_mL' && r.val.startsWith('1.50 mg/mL')), `Expected 1.50 mg/mL for 1500 µg/mL, got ${tableRows.find(r => r.name === 'Sample ug_mL')?.val}`);

    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_mg.csv', mimeType: 'text/csv', buffer: Buffer.from(data_mg)});
    // wait for 3 rows to appear
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length === 3);
    tableRows = await p.$$eval('.ndr', rows => rows.map(r => ({
        name: r.querySelector('input[data-ndk="name"]')?.value?.trim(),
        val: r.querySelector('.nd-v')?.textContent || ''
    })));
    T.check('nd/unit/mg_mL', tableRows.some(r => r.name === 'Sample mg_mL' && r.val.startsWith('2.00 mg/mL')), `Expected 2.00 mg/mL for 2 mg/mL, got ${tableRows.find(r => r.name === 'Sample mg_mL')?.val}`);


    });

  // #1518: µg/µL equals mg/mL, so 5 µg/µL reads 5.00 mg/mL with no unit warning. A280 is 1.000 so a fallback to 1 Abs = 1 mg/mL cannot pass
  await fresh('nanodrop_ug_per_uL', async (p, h) => {
    await h.newProject('ug per uL test');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await p.waitForTimeout(500);
    await h.step('final');
    await p.waitForTimeout(200);
    const rowsOf = () => p.$$eval('.ndr', rows => rows.map(r => ({name: r.querySelector('input[data-ndk="name"]')?.value?.trim(), val: r.querySelector('.nd-v')?.textContent || '', warn: !!r.querySelector('.nd-unit')})));
    const units = `Sample Name\tSample Type\tConcentration\tUnits\tA280\tA260/A280\nSample units_ugul\tProtein A280\t5.0\tug/uL\t1.000\t0.57`;
    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_ugul.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(units)});
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length > 0);
    let r = (await rowsOf()).find(x => x.name === 'Sample units_ugul');
    T.check('nd/unit/ug_uL_units_col', !!r && r.val.startsWith('5.00 mg/mL') && !r.warn, `Expected 5.00 mg/mL with no unit warning for Units ug/uL, got ${r ? r.val + (r.warn ? ' [unit warning]' : '') : 'no row'}`);
    const head = `Sample Name\tSample Type\tProtein (µg/µL)\tA280\tA260/A280\nSample head_ugul\tProtein A280\t5.0\t1.000\t0.57`;
    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_ugul_head.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(head)});
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length === 2);
    r = (await rowsOf()).find(x => x.name === 'Sample head_ugul');
    T.check('nd/unit/ug_uL_header', !!r && r.val.startsWith('5.00 mg/mL') && !r.warn, `Expected 5.00 mg/mL with no unit warning for a Protein (µg/µL) column, got ${r ? r.val + (r.warn ? ' [unit warning]' : '') : 'no row'}`);
  });

  // Issue #1064: quarantine unsupported NanoDrop units from mass, yield, and summary calculations
  await fresh('nanodrop_quarantine_unsupported_units', async (p, h) => {
    await h.newProject('Quarantine unsupported units');
    await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
    await p.waitForTimeout(500);
    await h.pool('A1-A3');
    await h.step('final');
    await p.waitForTimeout(200);

    // 1. Load an unsupported unit reading (12.5 pmol/µL)
    const data_pmol = `Sample Name\tSample Type\tConcentration\tUnits\tA280\tA260/A280\nSample pmol\tProtein A280\t12.5\tpmol/µL\t1.000\t0.57`;
    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_pmol.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(data_pmol)});
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length === 1);

    // Assign to run 1
    const row0 = p.locator('.ndr').first();
    await row0.locator('summary').click();
    await row0.locator('select[data-ndk="runId"]').selectOption({index: 1});
    await p.waitForTimeout(300);

    // Enter pool volume 10 mL on the run
    const volInput = p.locator('input[data-ndr="ndVol"]');
    await volInput.waitFor();
    await volInput.fill('10');
    await volInput.dispatchEvent('change');
    await p.waitForTimeout(200);

    // Check individual row preserves raw reading and review warning
    const r0Val = await row0.locator('.nd-v').textContent();
    const r0Warn = await row0.locator('.nd-unit').textContent();
    T.check('nd/quarantine/raw_preserved', r0Val.trim().startsWith('12.50 mg/mL'), `Expected raw value 12.50 mg/mL preserved, got ${r0Val}`);
    T.check('nd/quarantine/warn_prompt', r0Warn.includes('pmol/µL'), `Expected unit review warning prompt, got ${r0Warn}`);

    // Check that group stats and mass are quarantined (empty/null), not 12.50 mg/mL or 125 mg
    const statText = (await p.locator('.ndg-h .ndg-s').textContent()).trim();
    const mgText = (await p.locator('.ndg-h .ndg-mg').first().textContent()).trim();
    T.check('nd/quarantine/group_stats_excluded', statText === '', `Expected empty group stats for unsupported unit, got "${statText}"`);
    T.check('nd/quarantine/group_mass_excluded', mgText === '', `Expected empty group mass for unsupported unit, got "${mgText}"`);

    // Verify CSV export excludes the unsupported unit from NanoDrop mg/mL and NanoDrop mg
    await h.step('figure');
    await p.waitForTimeout(300);
    const d1 = p.waitForEvent('download', {timeout: 10000});
    await p.click('#sumCsv');
    const f1 = path.join(RES, 'quarantine-test-1-' + Date.now() + '.csv');
    await (await d1).saveAs(f1);
    const csv1 = fs.readFileSync(f1, 'utf8').split(/\r?\n/).map(l => l.split(','));
    T.check('nd/quarantine/csv_conc_excluded', (csv1[1][6] || '') === '', `Expected empty NanoDrop mg/mL in CSV, got "${csv1[1][6]}"`);
    T.check('nd/quarantine/csv_mass_excluded', (csv1[1][10] || '') === '', `Expected empty NanoDrop mg in CSV, got "${csv1[1][10]}"`);

    // 2. Load a second reading with a supported unit (2.0 mg/mL) assigned to the same run
    await h.step('final');
    await p.waitForTimeout(200);
    const data_mg = `Sample Name\tSample Type\tConcentration\tUnits\tA280\tA260/A280\nSample valid_mg\tProtein A280\t2.0\tmg/mL\t1.000\t0.57`;
    await p.setInputFiles('#ndFile', {name: 'nd_unit_temp_valid_mg.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(data_mg)});
    await p.waitForFunction(() => document.querySelectorAll('.ndr').length === 2);

    const row1 = p.locator('.ndr').nth(1);
    await row1.locator('summary').click();
    await row1.locator('select[data-ndk="runId"]').selectOption({index: 1});
    await p.waitForTimeout(300);

    // Group stats must now show ONLY the valid reading (2.00 mg/mL, n 1) and mass 20.00 mg, excluding the 12.5 pmol/µL reading
    const statAfterValid = (await p.locator('.ndg-h .ndg-s').textContent()).trim();
    const mgAfterValid = (await p.locator('.ndg-h .ndg-mg').first().textContent()).trim();
    T.check('nd/quarantine/group_stats_only_valid', statAfterValid === '2.00 mg/mL', `Expected "2.00 mg/mL", got "${statAfterValid}"`);
    T.check('nd/quarantine/group_mass_only_valid', mgAfterValid === '20.00 mg', `Expected "20.00 mg", got "${mgAfterValid}"`);

    // Verify CSV export now includes only the valid reading's concentration and mass
    await h.step('figure');
    await p.waitForTimeout(300);
    const d2 = p.waitForEvent('download', {timeout: 10000});
    await p.click('#sumCsv');
    const f2 = path.join(RES, 'quarantine-test-2-' + Date.now() + '.csv');
    await (await d2).saveAs(f2);
    const csv2 = fs.readFileSync(f2, 'utf8').split(/\r?\n/).map(l => l.split(','));
    T.check('nd/quarantine/csv_conc_only_valid', csv2[1][6] === '2.000', `Expected "2.000" in CSV for valid reading, got "${csv2[1][6]}"`);
    T.check('nd/quarantine/csv_mass_only_valid', csv2[1][10] === '20.000', `Expected "20.000" in CSV for valid reading, got "${csv2[1][10]}"`);
  });

  T.done();
})();
