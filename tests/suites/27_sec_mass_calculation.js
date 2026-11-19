const {open, H, suite, path, DATA, fs} = require('../lib/harness');
const {pooledNdRun, pooledNdReading} = require('../data/gen_pooled_nd');
const num = s => { const m = String(s == null ? '' : s).replace(/[≈~,]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

(async () => {
  const T = suite('27_sec_mass');
  const {p, errs, close} = await open(), h = H(p);
  p.on('dialog', d => d.accept());

  await T.t('sec_mass_regression', async () => {
    await h.newProject('SEC mass calc');
    await h.addRun(path.join(DATA, 'science/sec_inject2.csv'));

    let runStep;
    for (let t0 = Date.now(); !runStep && Date.now() - t0 < 10000; await h.wait(250)) runStep = (await h.timeline()).find(x => /^run:/.test(x.k));
    if (runStep) await h.step(runStep.k);
    await h.wait(400);

    const openFolds = loc => loc.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });

    await p.click('#moreBtn').catch(() => {});
    const stdsChk = p.locator('#o-secStds');
    await openFolds(stdsChk);
    await stdsChk.check({force: true});
    await h.wait(300);

    await p.locator('#sec-v0').fill('8'); await p.locator('#sec-v0').dispatchEvent('change');
    await p.locator('#sec-vt').fill('24'); await p.locator('#sec-vt').dispatchEvent('change');

    while (await p.locator('#secStdList .krow').count() < 2) {
      await p.click('#sec-addStd');
      await h.wait(150);
    }
    await p.locator('#ss-n0').fill('Std1'); await p.locator('#ss-k0').fill('100'); await p.locator('#ss-v0').fill('12');
    await p.locator('#ss-n0').dispatchEvent('change'); await p.locator('#ss-k0').dispatchEvent('change'); await p.locator('#ss-v0').dispatchEvent('change');
    await p.locator('#ss-n1').fill('Std2'); await p.locator('#ss-k1').fill('10'); await p.locator('#ss-v1').fill('16');
    await p.locator('#ss-n1').dispatchEvent('change'); await p.locator('#ss-k1').dispatchEvent('change'); await p.locator('#ss-v1').dispatchEvent('change');
    await h.wait(500);

    await p.click('#intAuto').catch(() => {});
    await h.wait(500);

    const pt = await h.peakTable();
    const mwCol = pt[0].findIndex(c => /^Apparent mass|Apparent MW/i.test(c));
    const veCol = pt[0].findIndex(c => /^Ve|Center|Elution/i.test(c));
    const sampleRows = pt.slice(1);
    let found = false;
    for (let r of sampleRows) {
      const veVal = num(r[veCol]), mwVal = num(r[mwCol]);
      if (veVal != null && mwVal != null) {
        const kav = (veVal - 8) / 16;
        const expMw = Math.pow(10, 3 - 4 * kav);
        T.check(`mass_${veVal}_near_${expMw.toFixed(1)}`, Math.abs(mwVal - expMw) / expMw < 0.05, `Ve=${veVal}, MW=${mwVal}, expected=${expMw.toFixed(1)}`);
        found = true;
      }
    }
    T.check('peaks_checked', found, 'checked at least one peak mass');
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();

  await T.t('pooled_nd_peak_scope', async () => {
    const {p: p2, errs: errs2, close: close2} = await open(), h2 = H(p2);
    p2.on('dialog', d => d.accept());
    try {
      await h2.newProject('Pooled NanoDrop peak scope');
      await p2.click('#tl [data-addmenu]');
      await p2.click('#tl [data-addstep=run]');
      p2.setDefaultTimeout(15000);
      await p2.setInputFiles('#file', {name: 'imac_two_peak_synth.csv', mimeType: 'text/csv', buffer: Buffer.from(pooledNdRun())});
      await h2.wait(1500);

      const openFolds = loc => loc.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });
      await h2.step('construct');
      const epsInp = p2.locator('#o-eps');
      await openFolds(epsInp);
      await epsInp.fill('1.0');
      await epsInp.dispatchEvent('input');
      await epsInp.dispatchEvent('change');
      await h2.wait(250);

      const runStep = (await h2.timeline()).find(x => /^run:/.test(x.k));
      if (runStep) await h2.step(runStep.k);
      await h2.wait(300);

      await h2.pool('F13-F16');

      await p2.click('#tl [data-addmenu]');
      await p2.click('#tl [data-addstep=conc]');
      await h2.wait(400);
      await openFolds(p2.locator('#btw-conc'));
      await p2.locator('#btw-conc').fill('1.0');
      await p2.locator('#btw-conc').dispatchEvent('input');
      await p2.locator('#btw-conc').dispatchEvent('change');
      await p2.locator('#btw-vOut').fill('0.5');
      await p2.locator('#btw-vOut').dispatchEvent('input');
      await p2.locator('#btw-vOut').dispatchEvent('change');
      await h2.wait(500);

      await p2.setInputFiles('#btwNdFile', {name: 'pooled_nd.csv', mimeType: 'text/csv', buffer: Buffer.from(pooledNdReading())});
      await h2.wait(500);
      T.check('concentrated_nanodrop_loaded', /1 reading/.test(await p2.locator('#btwNdList').innerText()), await p2.locator('#btwNdList').innerText());

      await h2.step(runStep.k);
      await h2.wait(300);
      await p2.click('#intAuto');
      await h2.wait(500);

      const pt = await h2.peakTable();
      const apexCol = pt[0].findIndex(c => /^Ve|Center|Apex|Elution/i.test(c));
      const areaCol = pt[0].findIndex(c => /^Area/i.test(c));
      const mgCol = pt[0].findIndex(c => /^Protein \(mg\)/i.test(c));
      const p1 = pt.slice(1).find(r => /^P1$/i.test(r[0]) || (num(r[apexCol]) != null && Math.abs(num(r[apexCol]) - 4) < 1));
      const p2Row = pt.slice(1).find(r => /^P2$/i.test(r[0]) || (num(r[apexCol]) != null && Math.abs(num(r[apexCol]) - 14) < 1));
      const p1Area = p1 ? num(p1[areaCol]) : null;
      const p1Mg = p1 ? num(p1[mgCol]) : null;
      const p2Mg = p2Row ? num(p2Row[mgCol]) : null;
      const expP1UvMg = p1Area != null ? (p1Area / 1000) / (1.0 * 0.2) : 0.6267;

      T.check('pooled_peak_scales_to_nanodrop', p2Mg != null && Math.abs(p2Mg - 0.50) <= 0.02, `P2 mg=${p2Mg}, expected=0.50`);
      T.check('unpooled_peak_keeps_uv_mg', p1Mg != null && Math.abs(p1Mg - expP1UvMg) <= 0.02, `P1 mg=${p1Mg}, expected unscaled UV mg≈${expP1UvMg.toFixed(2)}`);

      T.check('scaled_peak_mg_disclosed', p2Row && p2Row[mgCol] === '≈0.50', `P2 cell=${p2Row && p2Row[mgCol]}, expected=≈0.50`);
      T.check('peak_mg_digits_unchanged', p1 && p2Row && p1[mgCol] === '0.62' && p2Row[mgCol].replace(/^≈/, '') === '0.50', `P1=${p1 && p1[mgCol]}, P2=${p2Row && p2Row[mgCol]}`);
      const disclosure = await p2.locator('#intTable').evaluate(tb => {
        const col = [...tb.rows[0].cells].findIndex(c => /^Protein \(mg\)/.test(c.textContent));
        const row = [...tb.rows].find(r => r.cells[0].textContent.trim() === 'P2');
        return {title: row.cells[col].title, note: [...tb.querySelectorAll('caption, .empty-row')].map(e => e.textContent).join(' ')};
      });
      T.check('scaled_peak_tooltip', /pool/i.test(disclosure.title) && /NanoDrop/.test(disclosure.title), disclosure.title);
      T.check('scaled_peak_footnote', /≈/.test(disclosure.note) && /pool/i.test(disclosure.note) && /NanoDrop/.test(disclosure.note), disclosure.note);
      const [dl] = await Promise.all([p2.waitForEvent('download', {timeout: 15000}), p2.click('#intCsv')]);
      const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split(/\r?\n/).map(r => r.split(','));
      const scaleCol = csv[0].indexOf('Scale'), csvMgCol = csv[0].indexOf('Protein (mg)');
      const csvP1 = csv.find(r => r[1] === 'P1'), csvP2 = csv.find(r => r[1] === 'P2'), csvPool = csv.find(r => /^"?Pool /.test(r[1]));
      T.check('integration_csv_scale', scaleCol >= 0 && csvP1[scaleCol] === 'Beer-Lambert' && csvP2[scaleCol] === 'NanoDrop-scaled' && csvPool[scaleCol] === 'NanoDrop', `Scale column=${scaleCol}; P1=${csvP1[scaleCol]}, P2=${csvP2[scaleCol]}, Pool=${csvPool[scaleCol]}`);
      T.check('integration_csv_columns_aligned', csv.every(r => r.length === csv[0].length), csv.map(r => r.length).join(','));
      T.check('integration_csv_numeric_mg', /^0\.\d{4}$/.test(csvP1[csvMgCol]) && Math.abs(+csvP1[csvMgCol] - expP1UvMg) < 0.003 && /^0\.\d{4}$/.test(csvP2[csvMgCol]) && Math.abs(+csvP2[csvMgCol] - 0.5) < 0.02 && csvPool[csvMgCol] === '0.5000', `CSV mg: ${[csvP1, csvP2, csvPool].map(r => r[csvMgCol]).join(', ')}`);

      await h2.step('figure');
      await h2.wait(300);
      const st = (await h2.sumTable()).map(r => r.join(' | ')).join('\n');
      T.check('sumtable_conc_mg_unchanged', /\b0\.50?\b/.test(st), st.slice(0, 300));
      T.check('pooled_nd_no_page_errors', !errs2.length, errs2.join(' | '));
    } finally {
      await close2();
    }
  });

  await T.t('ul_pool_and_concentrated_volumes_are_ml_for_mass', async () => {
    const {p: q, errs: qe, close: qclose} = await open(), hq = H(q);
    q.on('dialog', d => d.accept());
    try {
      q.setDefaultTimeout(10000);
      const file = (name, unit) => {
        const scale = unit === 'mL' ? 1 : 1000, lines = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', `${unit},mAU,${unit},Fraction`];
        for (let i = 0; i <= 20; i++) { const x = i*scale, y = 100*Math.exp(-0.5*Math.pow((i - 14)/1.1, 2)); lines.push(`${x},${y.toFixed(4)},${x},"F${i + 1}"`); }
        return {name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'))};
      };
      await hq.newProject('mL and uL pooled mass');
      await q.click('#tl [data-addmenu]'); await q.click('#tl [data-addstep=run]');
      await q.setInputFiles('#file', [file('ml_pooled_mass.csv', 'mL'), file('ul_pooled_mass.csv', '\u00b5L')]);
      await hq.wait(1400);
      const steps = (await hq.timeline()).filter(x => /^run:/.test(x.k));
      T.check('ul_two_runs_loaded', steps.length === 2, JSON.stringify(steps));
      if (steps.length !== 2) return;
      await hq.step('construct');
      const openFolds = loc => loc.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });
      const eps = q.locator('#o-eps'); await openFolds(eps);
      await eps.fill('1.0'); await eps.dispatchEvent('input'); await eps.dispatchEvent('change'); await hq.wait(250);
      for (const s of steps) { await hq.step(s.k); await hq.pool('F13-F16'); }
      await hq.step('figure');
      await q.click('#sumMore').catch(() => {}); await hq.wait(250);
      const tb0 = await hq.sumTable(), hd0 = tb0[0] || [], at = (row, re) => num((row || [])[hd0.findIndex(x => re.test(x))]);
      const mlRow = tb0.find(r => /^1\./.test(r[0] || '')), ulRow = tb0.find(r => /^2\./.test(r[0] || ''));
      const ml = {vol: at(mlRow, /^Volume/), area: at(mlRow, /^A/), mg: at(mlRow, /^Protein/)};
      const ul = {vol: at(ulRow, /^Volume/), area: at(ulRow, /^A/), mg: at(ulRow, /^Protein/)};
      ['vol', 'area', 'mg'].forEach(k => T.check(`ul_${k}_matches_ml`, ml[k] != null && ul[k] != null && Math.abs(ml[k] - ul[k]) <= Math.max(0.02, Math.abs(ml[k])*0.02), `mL=${ml[k]}, uL=${ul[k]}`));

      await hq.step(steps[1].k); await hq.addConc(null); await hq.wait(300);
      const concInput = q.locator('#btw-conc'); await openFolds(concInput);
      const btwLabel = await q.locator('#btw-vOut').evaluate(e => e.closest('label').textContent);
      T.check('ul_concentrated_field_says_ul', /µL/.test(btwLabel || '') && !/mL/.test(btwLabel || ''), `Volume label: ${btwLabel}`);
      await concInput.fill('2.5'); await concInput.dispatchEvent('input'); await concInput.dispatchEvent('change'); await hq.wait(250);
      await hq.step('figure'); await hq.wait(200);
      const tbUnmeas = await hq.sumTable(), ulUnmeasMg = at(tbUnmeas.find(r => /^2\./.test(r[0] || '')), /^Protein/);
      T.check('ul_unmeasured_vout_keeps_uv_mg', ulUnmeasMg != null && ml.mg != null && Math.abs(ulUnmeasMg - ml.mg) <= 0.02, `unmeasured vOut run mg=${ulUnmeasMg}, expected UV mg=${ml.mg}`);

      const btwStep = (await hq.timeline()).find(x => /^btw:/.test(x.k));
      if (btwStep) await hq.step(btwStep.k);
      await q.locator('#btw-vOut').fill('50'); await q.locator('#btw-vOut').dispatchEvent('input'); await q.locator('#btw-vOut').dispatchEvent('change'); await hq.wait(300);
      await hq.step('figure');
      await q.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; }); await hq.wait(300);
      const tb1 = await hq.sumTable(), concRow = tb1.find(r => /Concentrated/i.test(r[0] || '')) || [];
      const concMg = at(concRow, /^Protein/), concVolMl = at(concRow, /^Volume/);
      const mth = await hq.methods();
      T.check('ul_concentrated_50ul_is_013mg', concMg != null && Math.abs(concMg - 0.13) <= 0.01 && concVolMl != null && Math.abs(concVolMl - 0.05) <= 0.005, `Concentrated mg=${concMg}, vol(mL)=${concVolMl}`);
      T.check('ul_methods_keeps_mgml_and_50ul', /2\.5(?:0)? mg\/mL in 50 µL/.test(mth) && !/mg\/µL/.test(mth), mth.slice(-300));
      T.check('ul_pool_no_page_errors', !qe.length, qe.join(' | '));
    } finally {
      await qclose();
    }
  });

  T.done();
})();
