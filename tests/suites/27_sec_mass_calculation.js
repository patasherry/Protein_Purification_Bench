const {open, H, suite, path, DATA} = require('../lib/harness');
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
      const lines = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', 'ml,mAU,ml,Fraction'];
      for (let i = 0; i <= 400; i++) {
        const x = i * 0.05;
        const y = 100 * Math.exp(-0.5 * Math.pow((x - 4) / 0.5, 2)) + 200 * Math.exp(-0.5 * Math.pow((x - 14) / 0.5, 2));
        const fx = i <= 20 ? i.toFixed(3) : '';
        const fl = i < 20 ? `"F${i + 1}"` : i === 20 ? '"Waste"' : '';
        lines.push(`${x.toFixed(3)},${y.toFixed(4)},${fx},${fl}`);
      }
      await p2.click('#tl [data-addmenu]');
      await p2.click('#tl [data-addstep=run]');
      await p2.setInputFiles('#file', {name: 'imac_two_peak_synth.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'))});
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

      await h2.step('figure');
      await h2.wait(300);
      const st = (await h2.sumTable()).map(r => r.join(' | ')).join('\n');
      T.check('sumtable_conc_mg_unchanged', /\b0\.50?\b/.test(st), st.slice(0, 300));
      T.check('pooled_nd_no_page_errors', !errs2.length, errs2.join(' | '));
    } finally {
      await close2();
    }
  });

  T.done();
})();
