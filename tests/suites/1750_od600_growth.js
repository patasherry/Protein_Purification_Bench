// Issue #1750: OD600 readings stay as measurements, with a separate curve per culture.
const fs = require('fs');
const {open, H, suite} = require('../lib/harness');
const T = suite('1750_od600_growth');

(async () => {
  await T.t('od600_manual_import_spectrum_and_export', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Synthetic OD600 growth');
      await h.step('expr');
      await h.wait(250);
      T.check('growth/section', await p.locator('#odGrowthSec').isVisible());

      await p.click('#odAddBtn');
      const row = p.locator('#odTableBody tr').first();
      await row.locator('[data-growth="elapsed"]').fill('0');
      await row.locator('[data-growth="cultureId"]').fill('Flask A');
      await row.locator('[data-growth="rawOd"]').fill('0.45');
      await row.locator('[data-growth="dilution"]').fill('5');
      await row.locator('[data-growth="marker"]').selectOption('inoculation');
      await h.wait(250);
      const manual = await p.evaluate(() => {
        const r = document.querySelector('#odTableBody tr');
        return {raw: r.querySelector('[data-growth="rawOd"]').value, corr: r.querySelector('.od-corr').textContent.trim(), marker: r.querySelector('[data-growth="marker"]').value, points: document.querySelectorAll('#odGrowthPlot [data-pt-od]').length, hidden: document.querySelector('#odSpecPlot').hidden};
      });
      T.check('growth/raw-and-corrected-preserved', manual.raw === '0.45' && manual.corr === '2.250' && manual.marker === 'inoculation', JSON.stringify(manual));
      T.check('growth/manual-no-spectrum', manual.points === 1 && manual.hidden, JSON.stringify(manual));

      const csv = [
        'Timestamp,Elapsed (h),Culture,Raw OD600,Dilution,Blank,Instrument,Operator,Marker,Notes',
        '2026-01-01 11:00,2,Flask A,0.40,2,0.02,Reader A,PS,sampling,synthetic A',
        '2026-01-01 11:00,2,Flask B,0.30,4,0.02,Reader A,PS,temp shift,synthetic B',
        '2026-01-01 13:00,4,Flask B,0.55,4,0.02,Reader A,PS,harvest,synthetic B harvest'
      ].join('\n');
      await p.setInputFiles('#odCsvFile', {name:'synthetic_growth.csv', mimeType:'text/csv', buffer:Buffer.from(csv)});
      await h.wait(350);
      const imported = await p.evaluate(() => { const r = document.querySelectorAll('#odTableBody tr')[1]; return {rows: document.querySelectorAll('#odTableBody tr').length, cultures:[...document.querySelectorAll('#odGrowthPlot [data-culture]')].map(x => x.dataset.culture), points:document.querySelectorAll('#odGrowthPlot [data-pt-od]').length, harvest:[...document.querySelectorAll('#odGrowthPlot .od-marker')].some(x => x.dataset.marker === 'harvest'), time:r.querySelector('[data-growth="time"]').value, blank:r.querySelector('[data-growth="blank"]').value, instrument:r.querySelector('[data-growth="instrument"]').value, operator:r.querySelector('[data-growth="operator"]').value}; });
      T.check('growth/csv-multiculture-curve', imported.rows === 4 && imported.points === 4 && imported.cultures.includes('Flask A') && imported.cultures.includes('Flask B') && imported.harvest && imported.time === '2026-01-01 11:00' && imported.blank === '0.02' && imported.instrument === 'Reader A' && imported.operator === 'PS', JSON.stringify(imported));

      const spec = ['Synthetic NanoDrop OD600','2026-01-01 09:00','Wavelength (nm)\t10mm Absorbance','500\t0.20','525\t0.28','550\t0.39','575\t0.53','600\t0.62','650\t0.38','700\t0.21'].join('\n');
      await p.setInputFiles('#odNdFile', {name:'synthetic_nanodrop.tsv', mimeType:'text/tab-separated-values', buffer:Buffer.from(spec)});
      await h.wait(350);
      const spectrum = await p.evaluate(() => ({shown:!document.querySelector('#odSpecPlot').hidden, mark:!!document.querySelector('#odSpecPlot [data-mark-600]'), raw:[...document.querySelectorAll('#odTableBody [data-growth="rawOd"]')].pop().value, inst:[...document.querySelectorAll('#odTableBody [data-growth="instrument"]')].pop().value}));
      T.check('growth/nanodrop-spectrum-at-600', spectrum.shown && spectrum.mark && Math.abs(+spectrum.raw - .62) < .001 && spectrum.inst === 'NanoDrop', JSON.stringify(spectrum));

      const [csvDl] = await Promise.all([p.waitForEvent('download', {timeout:15000}), p.click('#odExportCsvBtn')]);
      const out = fs.readFileSync(await csvDl.path(), 'utf8');
      T.check('growth/csv-export-fields', /Raw OD600.*Dilution factor.*Corrected OD600/.test(out) && /NanoDrop/.test(out), out.slice(0,300));
      const [projectDl] = await Promise.all([p.waitForEvent('download', {timeout:15000}), p.click('#projSave')]);
      const saved = JSON.parse(fs.readFileSync(await projectDl.path(), 'utf8'));
      T.check('growth/project-persistence', Array.isArray(saved.prep.growth) && saved.prep.growth.length === 5 && saved.prep.growth.some(r => r.instrument === 'NanoDrop' && r.spec && r.spec.wl.length === 7), JSON.stringify(saved.prep.growth));
    } finally {
      T.check('growth/no-page-errors', errs.length === 0, errs.join(' | '));
      await close();
    }
  });
  T.done();
})();
