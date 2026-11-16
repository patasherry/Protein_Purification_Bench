const {open, H, suite, path, DATA, fs} = require('../lib/harness');
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

  T.done();
})();
