// Issue #1750: OD600 Growth Monitoring section in the expression workflow.
// Verifies manual entry, raw * dilution calculation, preservation of raw/corrected/blank/metadata,
// multi-culture CSV import, NanoDrop full-spectrum attachment with 600 nm mark, no fabricated spectra,
// no smoothing/extrapolation/error-bars/phase-inference, culture & harvest linking, 390px no-hscroll,
// standalone SVG export geometry (svgBoxes), CSV export, and project round-trip persistence.
const {open, H, suite, fs} = require('../lib/harness');
const T = suite('1750_od600_growth');

(async () => {
  await T.t('manual_entry_calculation_linking_and_strict_plotting', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('OD600 Manual & Linking');
      await h.step('expr');
      await h.wait(250);

      const secVis = await p.locator('#odGrowthSec').isVisible();
      T.check('od600/section-visible', secVis, 'OD600 growth monitoring section visible on Expression step');
      if (!secVis) return;

      await p.fill('#pr-strain', 'BL21(DE3)');
      await p.dispatchEvent('#pr-strain', 'change');
      await p.fill('#pr-medium', 'TB');
      await p.dispatchEvent('#pr-medium', 'change');
      await p.fill('#pr-cultureL', '2');
      await p.dispatchEvent('#pr-cultureL', 'change');
      await p.fill('#pr-pellet', '8.4');
      await p.dispatchEvent('#pr-pellet', 'change');
      const expMore = p.locator('#expMore');
      if (!(await expMore.evaluate(e => e.open))) await expMore.locator('summary').click();
      await p.fill('#pr-exHarvest', '4,000 × g, 20 min, 4 °C');
      await p.dispatchEvent('#pr-exHarvest', 'change');
      await h.wait(200);

      // Reading 1: inoculation at t=0
      await p.click('#odAddBtn');
      let rows = p.locator('#odTableBody tr');
      await rows.nth(0).locator('[data-od="timestamp"]').fill('2026-11-24 08:00');
      await rows.nth(0).locator('[data-od="elapsed"]').fill('0');
      await rows.nth(0).locator('[data-od="cultureId"]').fill('TB Flask 1');
      await rows.nth(0).locator('[data-od="rawOd"]').fill('0.08');
      await rows.nth(0).locator('[data-od="dilution"]').fill('1');
      await rows.nth(0).locator('[data-od="blank"]').fill('0.03');
      await rows.nth(0).locator('[data-od="instrument"]').fill('Cuvette spec');
      await rows.nth(0).locator('[data-od="operator"]').fill('PS');
      await rows.nth(0).locator('[data-od="marker"]').selectOption('inoculation');
      await rows.nth(0).locator('[data-od="notes"]').fill('1:100 starter');

      // Reading 2: induction at t=2.5, raw=0.42, dil=2 -> corrected=0.84 (blank recorded without subtracting)
      await p.click('#odAddBtn');
      await rows.nth(1).locator('[data-od="timestamp"]').fill('2026-11-24 10:30');
      await rows.nth(1).locator('[data-od="elapsed"]').fill('2.5');
      await rows.nth(1).locator('[data-od="cultureId"]').fill('TB Flask 1');
      await rows.nth(1).locator('[data-od="rawOd"]').fill('0.42');
      await rows.nth(1).locator('[data-od="dilution"]').fill('2');
      await rows.nth(1).locator('[data-od="blank"]').fill('0.03');
      await rows.nth(1).locator('[data-od="instrument"]').fill('Cuvette spec');
      await rows.nth(1).locator('[data-od="operator"]').fill('PS');
      await rows.nth(1).locator('[data-od="marker"]').selectOption('induction');
      await rows.nth(1).locator('[data-od="notes"]').fill('0.5 mM IPTG');

      // Reading 3: harvest at t=18, raw=0.68, dil=10 -> corrected=6.80
      await p.click('#odAddBtn');
      await rows.nth(2).locator('[data-od="timestamp"]').fill('2026-11-25 02:00');
      await rows.nth(2).locator('[data-od="elapsed"]').fill('18');
      await rows.nth(2).locator('[data-od="cultureId"]').fill('TB Flask 1');
      await rows.nth(2).locator('[data-od="rawOd"]').fill('0.68');
      await rows.nth(2).locator('[data-od="dilution"]').fill('10');
      await rows.nth(2).locator('[data-od="marker"]').selectOption('harvest');
      await rows.nth(2).locator('[data-od="notes"]').fill('8.4 g pellet');
      await h.wait(300);

      const st = await p.evaluate(() => {
        const trs = [...document.querySelectorAll('#odTableBody tr')];
        const vals = trs.map(tr => ({
          ts: tr.querySelector('[data-od="timestamp"]').value,
          el: tr.querySelector('[data-od="elapsed"]').value,
          cult: tr.querySelector('[data-od="cultureId"]').value,
          raw: tr.querySelector('[data-od="rawOd"]').value,
          dil: tr.querySelector('[data-od="dilution"]').value,
          corr: tr.querySelector('.od-corr').textContent.trim(),
          blank: tr.querySelector('[data-od="blank"]').value,
          inst: tr.querySelector('[data-od="instrument"]').value,
          op: tr.querySelector('[data-od="operator"]').value,
          marker: tr.querySelector('[data-od="marker"]').value,
          notes: tr.querySelector('[data-od="notes"]').value
        }));
        const svg = document.querySelector('#odGrowthPlot svg[data-chart="od-growth"]');
        const pathD = svg ? (svg.querySelector('path[data-culture]')?.getAttribute('d') || '') : '';
        const pts = svg ? [...svg.querySelectorAll('circle[data-pt-od]')].map(c => ({t: +c.dataset.ptT, od: +c.dataset.ptOd, cx: +c.getAttribute('cx')})) : [];
        const markers = svg ? [...svg.querySelectorAll('.od-marker')].map(m => m.dataset.marker) : [];
        const svgText = svg ? svg.textContent : '';
        return {
          vals,
          prepOd: document.querySelector('#pr-od')?.value || '',
          summary: document.querySelector('#odLinkSummary')?.textContent || '',
          specHidden: !!document.querySelector('#odSpecPlot')?.hidden,
          pathD,
          pts,
          markers,
          hasBezier: /[CQST]/i.test(pathD),
          hasErrBars: !!(svg && svg.querySelector('.error-bar, [data-err]')),
          hasPhaseText: /\b(lag phase|exponential phase|log phase|stationary phase|death phase)\b/i.test(svgText)
        };
      });

      T.check('od600/raw-times-dilution-and-metadata',
        st.vals.length === 3 &&
        st.vals[1].raw === '0.42' && st.vals[1].dil === '2' && st.vals[1].corr === '0.840' &&
        st.vals[1].blank === '0.03' && st.vals[1].inst === 'Cuvette spec' && st.vals[1].op === 'PS' &&
        st.vals[2].raw === '0.68' && st.vals[2].dil === '10' && st.vals[2].corr === '6.800',
        JSON.stringify(st.vals));

      T.check('od600/linked-to-culture-induction-and-harvest',
        (st.prepOd === '0.84' || st.prepOd === '0.840') &&
        /BL21\(DE3\)/.test(st.summary) && /2(?:\.0)?\s*L/.test(st.summary) && /8\.4\s*g/.test(st.summary) &&
        /0\.84/.test(st.summary) && /6\.80/.test(st.summary),
        `prepOd=${st.prepOd} | summary=${st.summary}`);

      // Verify path starts cleanly at first point and ends at last point (no smoothing, no extrapolation, no error bars, no phases)
      const pathCoords = [...st.pathD.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)].map(m => +m[1]);
      T.check('od600/strict-linear-segments-no-extrapolation',
        st.pts.length === 3 && pathCoords.length === 3 &&
        Math.abs(pathCoords[0] - st.pts[0].cx) < 0.2 && Math.abs(pathCoords[2] - st.pts[2].cx) < 0.2 &&
        !st.hasBezier && !st.hasErrBars && !st.hasPhaseText,
        JSON.stringify({pathD: st.pathD, pts: st.pts, hasBezier: st.hasBezier}));

      T.check('od600/markers-and-no-fabricated-spectrum',
        st.markers.includes('inoculation') && st.markers.includes('induction') && st.markers.includes('harvest') && st.specHidden,
        JSON.stringify({markers: st.markers, specHidden: st.specHidden}));
    } finally {
      T.check('od600/manual-no-errors', !errs.length, errs.join(' | '));
      await close();
    }
  });

  await T.t('csv_multiculture_and_390px_mobile_layout', async () => {
    const {p, errs, close} = await open({width: 390, height: 860}), h = H(p);
    try {
      await h.newProject('OD600 Mobile & CSV');
      await h.step('expr');
      await h.wait(250);

      const secVis = await p.locator('#odGrowthSec').isVisible();
      T.check('od600/mobile-section', secVis, 'OD600 section visible at 390px');
      if (!secVis) return;

      const csv = [
        'Timestamp,Elapsed (h),Culture ID,Raw OD600,Dilution factor,Blank,Instrument,Operator,Marker,Notes',
        '2026-11-24 09:00,0,37C Control,0.06,1,0.02,Genesys 10S,PS,inoculation,start',
        '2026-11-24 11:00,2,37C Control,0.38,2,0.02,Genesys 10S,PS,sampling,mid',
        '2026-11-24 15:00,6,37C Control,0.52,5,0.02,Genesys 10S,PS,harvest,done',
        '2026-11-24 09:00,0,18C Shift,0.06,1,0.02,Genesys 10S,PS,inoculation,start',
        '2026-11-24 11:30,2.5,18C Shift,0.41,2,0.02,Genesys 10S,PS,temp_shift,shifted to 18C',
        '2026-11-25 01:00,16,18C Shift,0.64,8,0.02,Genesys 10S,PS,harvest,overnight harvest'
      ].join('\n');

      await p.setInputFiles('#odCsvFile', {name: 'synth_growth.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
      await h.wait(350);

      const info = await p.evaluate(() => {
        const svg = document.querySelector('#odGrowthPlot svg[data-chart="od-growth"]');
        const paths = svg ? [...svg.querySelectorAll('path[data-culture]')].map(e => ({c: e.dataset.culture, stroke: e.getAttribute('stroke')})) : [];
        const markers = svg ? [...svg.querySelectorAll('.od-marker')].map(e => e.dataset.marker) : [];
        return {
          rows: document.querySelectorAll('#odTableBody tr').length,
          paths,
          markers,
          specHidden: !!document.querySelector('#odSpecPlot')?.hidden
        };
      });

      T.check('od600/csv-separate-culture-lines',
        info.rows === 6 && info.paths.length === 2 &&
        info.paths.some(x => x.c === '37C Control') && info.paths.some(x => x.c === '18C Shift') &&
        info.paths[0].stroke !== info.paths[1].stroke &&
        info.markers.includes('sampling') && info.markers.includes('temp_shift') && info.specHidden,
        JSON.stringify(info));

      const hLight = await h.hScroll();
      await p.emulateMedia({colorScheme: 'dark'});
      await h.wait(150);
      const hDark = await h.hScroll();
      T.check('od600/390px-no-hscroll', !hLight && !hDark, `light=${hLight}, dark=${hDark}`);
    } finally {
      T.check('od600/csv-no-errors', !errs.length, errs.join(' | '));
      await close();
    }
  });

  await T.t('nanodrop_spectrum_exports_and_project_persistence', async () => {
    const {p, errs, close} = await open({width: 1280, height: 900}), h = H(p);
    try {
      await h.newProject('OD600 Spectrum & Persistence');
      await h.step('expr');
      await h.wait(250);

      const secVis = await p.locator('#odGrowthSec').isVisible();
      T.check('od600/spec-section', secVis, 'OD600 section visible');
      if (!secVis) return;

      const specLines = ['Harvest Culture Sample', '2026-11-24 18:00', 'Wavelength (nm)\t10mm Absorbance'];
      for (let w = 400; w <= 750; w += 10) {
        const ab = +(0.12 + 0.52 * Math.exp(-Math.pow((w - 600) / 55, 2))).toFixed(4);
        specLines.push(`${w}\t${ab}`);
      }
      await p.setInputFiles('#odNdFile', {
        name: 'synth_nanodrop_od600.tsv',
        mimeType: 'text/tab-separated-values',
        buffer: Buffer.from(specLines.join('\n'))
      });
      await h.wait(350);

      // Update dilution to 5 -> 0.64 * 5 = 3.200
      const row0 = p.locator('#odTableBody tr').first();
      await row0.locator('[data-od="dilution"]').fill('5');
      await row0.locator('[data-od="dilution"]').dispatchEvent('change');
      await h.wait(250);

      const nd = await p.evaluate(() => {
        const r = document.querySelector('#odTableBody tr');
        const sp = document.querySelector('#odSpecPlot');
        const svg = sp && sp.querySelector('svg[data-chart="od-spectrum"]');
        return {
          raw: r?.querySelector('[data-od="rawOd"]')?.value || '',
          corr: r?.querySelector('.od-corr')?.textContent.trim() || '',
          inst: r?.querySelector('[data-od="instrument"]')?.value || '',
          specVisible: !!(sp && !sp.hidden && svg),
          mark600: !!(svg && svg.querySelector('[data-mark-600="1"]'))
        };
      });

      T.check('od600/nanodrop-600nm-and-spectrum-plot',
        nd.inst === 'NanoDrop' && Math.abs(+nd.raw - 0.64) < 0.005 && nd.corr === '3.200' && nd.specVisible && nd.mark600,
        JSON.stringify(nd));

      // Show standalone figure and check exported SVG geometry with harness svgBoxes
      await p.click('#odFigBtn');
      await h.wait(250);
      const svgText = await h.exportSvg();
      const boxes = await h.svgBoxes(svgText);
      const txtAll = boxes.texts.map(x => x.t).join(' | ');
      T.check('od600/exported-svg-geometry-unclipped',
        boxes.clipped.length === 0 && /Elapsed time/i.test(txtAll) && /Wavelength/i.test(txtAll) && /600 nm/.test(txtAll),
        `clipped=${JSON.stringify(boxes.clipped)} | texts=${txtAll.slice(0, 200)}`);

      // Export CSV
      const [csvDl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#odExportCsvBtn')]);
      const csvOut = fs.readFileSync(await csvDl.path(), 'utf8');
      T.check('od600/csv-export-preserves-raw-and-corrected',
        /Timestamp.*Elapsed time \(h\).*Culture ID.*Raw OD600.*Dilution factor.*Corrected OD600.*Blank.*Instrument.*Operator.*Marker.*Notes/.test(csvOut) &&
        csvOut.includes('0.64') && csvOut.includes('3.2') && csvOut.includes('NanoDrop'),
        csvOut.slice(0, 260));

      // Export & re-import project JSON
      const [projDl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      const projJson = JSON.parse(fs.readFileSync(await projDl.path(), 'utf8'));
      T.check('od600/project-json-persists-growth-and-spectrum',
        Array.isArray(projJson.prep?.growth) && projJson.prep.growth.length === 1 &&
        Math.abs(+projJson.prep.growth[0].rawOd - 0.64) < 0.005 &&
        Math.abs(+projJson.prep.growth[0].correctedOd - 3.2) < 0.005 &&
        Array.isArray(projJson.prep.growth[0].spec?.wl) && projJson.prep.growth[0].spec.wl.length === 36,
        JSON.stringify(projJson.prep?.growth?.[0]?.id));

      await p.click('#homeBtn');
      await h.wait(400);
      await p.setInputFiles('#projFile', {
        name: 'OD600_Restored_project.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(projJson))
      });
      await h.wait(1200);
      await h.step('expr');
      await h.wait(300);

      const restored = await p.evaluate(() => {
        const r = document.querySelector('#odTableBody tr');
        const sp = document.querySelector('#odSpecPlot');
        return {
          raw: r?.querySelector('[data-od="rawOd"]')?.value || '',
          corr: r?.querySelector('.od-corr')?.textContent.trim() || '',
          specVisible: !!(sp && !sp.hidden && sp.querySelector('svg[data-chart="od-spectrum"] [data-mark-600="1"]'))
        };
      });
      T.check('od600/project-reload-restores-ui-and-spectrum',
        Math.abs(+restored.raw - 0.64) < 0.005 && restored.corr === '3.200' && restored.specVisible,
        JSON.stringify(restored));
    } finally {
      T.check('od600/spec-no-errors', !errs.length, errs.join(' | '));
      await close();
    }
  });

  T.done();
})();
