// Issue #1750: Add an OD600 Growth Monitoring section to the expression workflow.
const fs = require('fs');
const {open, H, suite, path, DATA} = require('../lib/harness');
const T = suite('1750_od600_growth');

(async () => {
  // Test 1: Manual entry, calculation of corrected OD600 (raw * dil), preservation of values, markers, and growth plot
  await T.t('od600_manual_entry_and_calculation', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('OD600 Growth Test');
      await h.step('expr');
      await h.wait(300);

      // Verify the OD600 section exists in the Expression workflow
      const secVisible = await p.evaluate(() => {
        const sec = document.getElementById('odGrowthSec');
        return !!(sec && !sec.hidden);
      });
      T.check('od600/section-visible', secVisible, 'OD600 Growth Monitoring section is present');

      // Add first reading: t=0, raw=0.45, dil=5 -> corr=2.25, marker=inoculation
      await p.click('#odAddBtn');
      await h.wait(100);

      await p.locator('#odTableBody tr').first().locator('input[data-grk="time"]').fill('09:00');
      await p.locator('#odTableBody tr').first().locator('input[data-grk="elapsed"]').fill('0');
      await p.locator('#odTableBody tr').first().locator('input[data-grk="rawOd"]').fill('0.45');
      await p.locator('#odTableBody tr').first().locator('input[data-grk="dil"]').fill('5');
      await p.locator('#odTableBody tr').first().locator('input[data-grk="dil"]').dispatchEvent('change');
      await p.locator('#odTableBody tr').first().locator('select[data-grk="marker"]').selectOption('inoculation');
      await h.wait(200);

      const r1Values = await p.evaluate(() => {
        const row = document.querySelector('#odTableBody tr');
        if (!row) return null;
        const raw = row.querySelector('input[data-grk="rawOd"]')?.value;
        const dil = row.querySelector('input[data-grk="dil"]')?.value;
        const corr = row.querySelector('.od-corr')?.textContent.trim();
        const marker = row.querySelector('select[data-grk="marker"]')?.value;
        return {raw, dil, corr, marker};
      });

      // 0.45 * 5 = 2.25
      T.check('od600/calc-corr-od', r1Values && r1Values.raw === '0.45' && r1Values.dil === '5' && r1Values.corr === '2.250', JSON.stringify(r1Values));
      T.check('od600/marker-inoculation', r1Values && r1Values.marker === 'inoculation', JSON.stringify(r1Values));

      // Add second reading: elapsed=3, raw=0.8, dil=4 -> corr=3.2, marker=induction -> links to prep.od
      await p.click('#odAddBtn');
      await h.wait(100);
      const rows = p.locator('#odTableBody tr');
      await rows.nth(1).locator('input[data-grk="elapsed"]').fill('3');
      await rows.nth(1).locator('input[data-grk="rawOd"]').fill('0.8');
      await rows.nth(1).locator('input[data-grk="dil"]').fill('4');
      await rows.nth(1).locator('input[data-grk="dil"]').dispatchEvent('change');
      await rows.nth(1).locator('select[data-grk="marker"]').selectOption('induction');
      await rows.nth(1).locator('select[data-grk="marker"]').dispatchEvent('change');
      await h.wait(250);

      // Verify induction syncs to prep.od
      const prepOdVal = await p.evaluate(() => {
        const inp = document.getElementById('pr-od');
        return inp ? inp.value : '';
      });
      T.check('od600/link-induction-od', prepOdVal === '3.2' || prepOdVal === '3.20', `prep.od is ${prepOdVal}`);

      // Add third reading: elapsed=16, raw=0.7, dil=10 -> corr=7.0, marker=harvest
      await p.click('#odAddBtn');
      await h.wait(100);
      await rows.nth(2).locator('input[data-grk="elapsed"]').fill('16');
      await rows.nth(2).locator('input[data-grk="rawOd"]').fill('0.7');
      await rows.nth(2).locator('input[data-grk="dil"]').fill('10');
      await rows.nth(2).locator('input[data-grk="dil"]').dispatchEvent('change');
      await rows.nth(2).locator('select[data-grk="marker"]').selectOption('harvest');
      await rows.nth(2).locator('select[data-grk="marker"]').dispatchEvent('change');
      await h.wait(300);

      // Verify chart SVG has 3 points and markers
      const chartInfo = await p.evaluate(() => {
        const svg = document.querySelector('#odGrowthPlot svg[data-chart="od-growth"]');
        if (!svg) return null;
        const pts = svg.querySelectorAll('circle[data-pt-od]');
        const markers = [...svg.querySelectorAll('.od-marker')].map(m => m.dataset.marker);
        const path = svg.querySelector('path[data-culture]');
        return {
          hasSvg: true,
          pointCount: pts.length,
          markers,
          hasPath: !!path,
          specHidden: document.getElementById('odSpecPlot')?.hidden
        };
      });

      T.check('od600/chart-rendered-with-points', chartInfo && chartInfo.pointCount === 3, JSON.stringify(chartInfo));
      T.check('od600/chart-markers', chartInfo && chartInfo.markers.includes('induction') && chartInfo.markers.includes('harvest'), JSON.stringify(chartInfo));
      T.check('od600/no-fabricated-spectrum', chartInfo && chartInfo.specHidden === true, 'No spectrum fabricated for manual OD600 values');

    } finally {
      T.check('od600/manual-no-errors', !errs.length, errs.join(' | '));
      await close();
    }
  });

  // Test 2: CSV import with multiple cultures, elapsed time, and dilution
  await T.t('od600_csv_import_and_multiculture', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('OD600 CSV Import');
      await h.step('expr');
      await h.wait(200);

      const csvData = [
        'Elapsed (h),Culture,Raw OD600,Dilution,Marker,Notes',
        '0,Flask A,0.15,1,inoculation,t0',
        '2,Flask A,0.40,1,sampling,early log',
        '4,Flask A,0.45,4,induction,induced',
        '8,Flask A,0.60,8,sampling,late log',
        '16,Flask A,0.70,10,harvest,harvested',
        '0,Flask B,0.15,1,inoculation,control',
        '4,Flask B,0.30,4,temp_shift,shifted to 18C',
        '16,Flask B,0.50,10,harvest,control harvest'
      ].join('\n');

      const tmpCsv = path.join(DATA, 'od600_synth_growth.csv');
      fs.writeFileSync(tmpCsv, csvData, 'utf8');

      try {
        await p.setInputFiles('#odCsvFile', tmpCsv);
        await h.wait(400);

        const importStats = await p.evaluate(() => {
          const rows = document.querySelectorAll('#odTableBody tr');
          const svg = document.querySelector('#odGrowthPlot svg[data-chart="od-growth"]');
          const paths = svg ? [...svg.querySelectorAll('path[data-culture]')].map(p => p.dataset.culture) : [];
          const pts = svg ? svg.querySelectorAll('circle[data-pt-od]').length : 0;
          return {
            rowCount: rows.length,
            cultures: paths,
            pointCount: pts
          };
        });

        T.check('od600/csv-imported-rows', importStats.rowCount === 8, `Expected 8 rows, got ${importStats.rowCount}`);
        T.check('od600/csv-multiculture-lines', importStats.cultures.includes('Flask A') && importStats.cultures.includes('Flask B'), JSON.stringify(importStats));
        T.check('od600/csv-chart-points', importStats.pointCount === 8, `Expected 8 plotted points, got ${importStats.pointCount}`);

      } finally {
        if (fs.existsSync(tmpCsv)) fs.unlinkSync(tmpCsv);
      }
    } finally {
      T.check('od600/csv-no-errors', !errs.length, errs.join(' | '));
      await close();
    }
  });

  // Test 3: NanoDrop file attachment with full spectrum, 600 nm marking, and CSV export / project persistence
  await T.t('od600_nanodrop_spectrum_and_persistence', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('OD600 NanoDrop & Persistence');
      await h.step('expr');
      await h.wait(200);

      // Create a synthetic NanoDrop file with spectrum spanning 500-700 nm, having an OD at 600 nm
      const wls = [];
      const absVals = [];
      for (let w = 500; w <= 700; w += 2) {
        wls.push(w);
        // Peak around 600 nm: 0.62 at 600
        const val = 0.2 + 0.42 * Math.exp(-Math.pow((w - 600)/40, 2));
        absVals.push(+val.toFixed(4));
      }

      // Format as NanoDrop Single Spectrum TSV
      const ndText = [
        'Culture OD600 Sample',
        '2026-11-24 10:30',
        'Wavelength (nm)\t10mm Absorbance',
        ...wls.map((w, i) => `${w}\t${absVals[i]}`)
      ].join('\n');

      const tmpNd = path.join(DATA, 'od600_synth_nanodrop.tsv');
      fs.writeFileSync(tmpNd, ndText, 'utf8');

      try {
        await p.setInputFiles('#odNdFile', tmpNd);
        await h.wait(400);

        const ndInfo = await p.evaluate(() => {
          const row = document.querySelector('#odTableBody tr');
          const raw = row ? row.querySelector('input[data-grk="rawOd"]')?.value : '';
          const inst = row ? row.querySelector('input[data-grk="instrument"]')?.value : '';
          const specPlot = document.getElementById('odSpecPlot');
          const specSvg = specPlot ? specPlot.querySelector('svg[data-chart="od-spectrum"]') : null;
          const mark600 = specSvg ? specSvg.querySelector('[data-mark-600]') : null;
          return {
            raw,
            inst,
            specVisible: !!(specPlot && !specPlot.hidden),
            hasSpecSvg: !!specSvg,
            hasMark600: !!mark600
          };
        });

        // 600 nm value should be approx 0.62
        T.check('od600/nanodrop-extracted-a600', ndInfo.inst === 'NanoDrop' && Math.abs(parseFloat(ndInfo.raw) - 0.62) < 0.05, JSON.stringify(ndInfo));
        T.check('od600/nanodrop-spec-plot', ndInfo.specVisible && ndInfo.hasSpecSvg && ndInfo.hasMark600, JSON.stringify(ndInfo));

        // Test Export CSV
        const [download] = await Promise.all([
          p.waitForEvent('download'),
          p.click('#odExportCsvBtn')
        ]);
        const exportedCsv = fs.readFileSync(await download.path(), 'utf8');
        T.check('od600/export-csv-headers', /Timestamp.*Elapsed.*Culture.*Raw OD600.*Dilution.*Corrected OD600/i.test(exportedCsv), exportedCsv.slice(0, 100));
        T.check('od600/export-csv-content', exportedCsv.includes('NanoDrop') && exportedCsv.includes('0.62'), exportedCsv);

        // Test Project Persistence
        const [projDl] = await Promise.all([
          p.waitForEvent('download'),
          p.click('#projSave')
        ]);
        const projData = JSON.parse(fs.readFileSync(await projDl.path(), 'utf8'));
        T.check('od600/proj-exported-growth', Array.isArray(projData.prep?.growth) && projData.prep.growth.length === 1 && projData.prep.growth[0].instrument === 'NanoDrop', JSON.stringify(projData.prep?.growth));

        // Reload project and verify everything is restored
        await p.click('#homeBtn').catch(() => {});
        await h.wait(400);
        await p.click('#homeQuick');
        await h.wait(700);
        await p.setInputFiles('#projFile', {
          name: 'restored_growth_project.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(projData))
        });
        await h.wait(1200);
        await h.step('expr');
        await h.wait(400);

        const restoredInfo = await p.evaluate(() => {
          const row = document.querySelector('#odTableBody tr');
          const raw = row ? row.querySelector('input[data-grk="rawOd"]')?.value : '';
          const specPlot = document.getElementById('odSpecPlot');
          return {
            raw,
            specVisible: !!(specPlot && !specPlot.hidden)
          };
        });

        T.check('od600/proj-restored-growth', Math.abs(parseFloat(restoredInfo.raw) - 0.62) < 0.05 && restoredInfo.specVisible, JSON.stringify(restoredInfo));

      } finally {
        if (fs.existsSync(tmpNd)) fs.unlinkSync(tmpNd);
      }
    } finally {
      T.check('od600/nd-no-errors', !errs.length, errs.join(' | '));
      await close();
    }
  });

  T.done();
})();
