const {open, H, suite, path, fs} = require('../lib/harness');
const {pooledNdRun} = require('../data/gen_pooled_nd');
const num = s => { const m = String(s == null ? '' : s).replace(/[≈~,]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

(async () => {
  const T = suite('1700_recovery_matrix');
  const {p, errs, close} = await open(), h = H(p);
  p.on('dialog', d => d.accept());
  p.setDefaultTimeout(15000);

  const ensureVisible = loc => loc.evaluate(e => {
    let cur = e;
    while (cur && cur !== document.body) {
      if (cur.tagName === 'DETAILS') cur.open = true;
      if (cur.classList && cur.classList.contains('collapsed')) cur.classList.remove('collapsed');
      cur = cur.parentElement;
    }
  });

  await T.t('peak_mass_beer_lambert', async () => {
    await h.newProject('Recovery matrix peak mass');
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep=run]');
    await p.setInputFiles('#file', {name: 'recovery_synth.csv', mimeType: 'text/csv', buffer: Buffer.from(pooledNdRun())});
    await h.wait(1500);

    const runStep = (await h.timeline()).find(x => /^run:/.test(x.k));
    if (runStep) await h.step(runStep.k);
    await h.wait(300);

    await p.click('#moreBtn').catch(() => {});
    await h.wait(200);

    // Set extinction coefficient using #o-extinction (settings)
    const extInp = p.locator('#o-extinction');
    const hasExtInp = await extInp.count() > 0;
    T.check('extinction_input_present', hasExtInp, 'extinction coefficient input #o-extinction exists in settings');
    if (hasExtInp) {
      await ensureVisible(extInp);
      await extInp.fill('1.0');
      await extInp.dispatchEvent('input');
      await extInp.dispatchEvent('change');
      await h.wait(250);
    }

    // Set UV path to 10 mm (1.0 cm) on the run card
    const pathInp = p.locator('.trace.run.sel [data-k="path"]');
    await ensureVisible(pathInp);
    await pathInp.fill('10');
    await pathInp.dispatchEvent('input');
    await pathInp.dispatchEvent('change');
    await h.wait(250);

    await p.click('#intAuto');
    await h.wait(500);

    const pt = await h.peakTable();
    const head = pt[0] || [];
    const areaCol = head.findIndex(c => /^Area/i.test(c));
    const mgCol = head.findIndex(c => /^Protein \(mg\)/i.test(c));
    T.check('protein_mg_column_present', mgCol >= 0, `Protein (mg) column in head: ${head.join(' | ')}`);

    const p1 = pt.slice(1).find(r => /^P1$/i.test(r[0]));
    const p2 = pt.slice(1).find(r => /^P2$/i.test(r[0]));
    const p1Area = p1 ? num(p1[areaCol]) : null;
    const p1Mg = p1 && mgCol >= 0 ? num(p1[mgCol]) : null;
    const p2Area = p2 ? num(p2[areaCol]) : null;
    const p2Mg = p2 && mgCol >= 0 ? num(p2[mgCol]) : null;

    // Beer-Lambert law: mass (mg) = (area / 1000) / (extinction * (path_mm / 10))
    // With extinction = 1.0, path_mm = 10 (1.0 cm): mass (mg) = area / 1000
    const expP1Mg = p1Area != null ? (p1Area / 1000) / (1.0 * (10 / 10)) : null;
    const expP2Mg = p2Area != null ? (p2Area / 1000) / (1.0 * (10 / 10)) : null;

    T.check('p1_mass_matches_beer_lambert', p1Mg != null && expP1Mg != null && Math.abs(p1Mg - expP1Mg) <= 0.02, `P1: got=${p1Mg}, expected=${expP1Mg ? expP1Mg.toFixed(2) : null}`);
    T.check('p2_mass_matches_beer_lambert', p2Mg != null && expP2Mg != null && Math.abs(p2Mg - expP2Mg) <= 0.02, `P2: got=${p2Mg}, expected=${expP2Mg ? expP2Mg.toFixed(2) : null}`);

    // Change path to 2 mm (0.2 cm): mass should be 5x larger: (area / 1000) / (1.0 * 0.2)
    await ensureVisible(pathInp);
    await pathInp.fill('2');
    await pathInp.dispatchEvent('input');
    await pathInp.dispatchEvent('change');
    await h.wait(300);

    const pt2 = await h.peakTable();
    const p1_2 = pt2.slice(1).find(r => /^P1$/i.test(r[0]));
    const p1Mg_2 = p1_2 && mgCol >= 0 ? num(p1_2[mgCol]) : null;
    const expP1Mg_2 = p1Area != null ? (p1Area / 1000) / (1.0 * (2 / 10)) : null;
    T.check('p1_mass_scaled_with_pathlength', p1Mg_2 != null && expP1Mg_2 != null && Math.abs(p1Mg_2 - expP1Mg_2) <= 0.02, `P1 (2mm): got=${p1Mg_2}, expected=${expP1Mg_2 ? expP1Mg_2.toFixed(2) : null}`);

    // Verify CSV export includes Protein (mg)
    const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 15000}), p.click('#intCsv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split(/\r?\n/).map(r => r.split(','));
    const csvMgCol = csv[0].indexOf('Protein (mg)');
    const csvP1 = csv.find(r => r[1] === 'P1');
    T.check('csv_has_protein_mg', csvMgCol >= 0, `CSV head: ${csv[0].join(',')}`);
    T.check('csv_numeric_peak_mg', csvP1 && csvMgCol >= 0 && Math.abs(+csvP1[csvMgCol] - expP1Mg_2) < 0.005, `CSV P1 mg: ${csvP1 && csvMgCol >= 0 ? csvP1[csvMgCol] : null}, expected=${expP1Mg_2 ? expP1Mg_2.toFixed(4) : null}`);
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
