// 1023 carryover semantics (#1023): what each quantity means when only part of a Concentrated output goes on to the next column.
//   Protein (mg) on the Concentrated row: all the material produced (the measured output, kept-back share included).
//   Step yield (%) of the next column: recovery of the material loaded on it (mg recovered / mg loaded).
//   Yield (%): the route shown, against step 1, so it counts only the loaded share; the kept-back share is named in a note under the
//   table (mg, volume, what it was kept as, and its % of step 1) so it does not read as purification loss.
// Case: IMAC pool (≈20 mL) → concentrated to 5 mL at 5 mg/mL (25 mg) → 1 mL (5 mg) loaded on SEC, 4 mL (20 mg) kept back; and the same
// project with no split (every project saved before #1022), where all 25 mg are loaded and no note appears. Synthetic stand-ins only.
const {open, H, suite, src, path, DATA} = require('../lib/harness');
const num = s => { const m = String(s == null ? '' : s).replace(/[≈~,%]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const CONC = 5, VOUT = 5, VIN = 20;

(async () => { const T = suite('1023_carryover_semantics');
  const scenario = async split => { const {p, close} = await open(), h = H(p); p.on('dialog', d => d.accept());
    const setVal = (sel, v) => p.evaluate(({sel, v}) => { const e = document.querySelector(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return true; }, {sel, v: String(v)});
    try {
      await h.newProject('Carryover');
      await setVal('#o-protKda', 50); await setVal('#o-eps', 1); await h.wait(200);
      await h.addRun(src('his')); await h.pool('T1-T6');
      await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep=conc]'); await h.wait(500);
      await setVal('#btw-vIn', VIN); await setVal('#btw-conc', CONC); await setVal('#btw-vOut', VOUT); await h.wait(300);
      const sum = p.locator('#btwSplitBox > summary'); if (await sum.isVisible()) await sum.click(); await h.wait(150);
      if (split) { for (const [k, v] of Object.entries(split)) await setVal(`#btw-${k}`, v); await h.wait(400); }
      const hint = await p.$eval('#btwSplit', e => e.hidden ? '' : e.textContent).catch(() => '');
      /* the SEC stand-in: a time axis run at 0.5 mL/min, 2 mm path; its pool holds ≈0.4 mg by the UV area, well under the 5 mg loaded */
      await h.addRun(path.join(DATA, 'chrom', 'sec_semicolon_unicorn7.csv')); await h.pool('1.A.1-1.A.3');
      await p.evaluate(() => { for (const [k, v] of [['path', '2'], ['mFlow', '0.5']]) { const el = document.querySelector(`.trace.run.sel [data-k=${k}]`); if (el) { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } } });
      await h.wait(300); await h.step('figure'); await h.wait(400);
      const rs = await h.sumTable(), head = rs[0] || [], rows = rs.slice(1).filter(r => r.length === head.length);
      const col = re => head.findIndex(k => re.test(k)), mi = col(/^Protein \(mg\)/), yi = col(/^Yield/), si = col(/^Step yield/), ci = rows.findIndex(r => /concentrat/i.test(r[0] || ''));
      const g = (r, i) => r && i >= 0 ? num(r[i]) : null, s1 = rows[0], conc = ci >= 0 ? rows[ci] : null, sec = ci >= 0 ? rows[ci + 1] : null;
      const notes = await p.$$eval('#sumNotes li', ls => ls.map(l => l.textContent));
      return {hint, head, notes, s1Mg: g(s1, mi), concMg: g(conc, mi), concY: g(conc, yi), secName: sec ? sec[0] : null, secMg: g(sec, mi), secY: g(sec, yi), secStep: g(sec, si)};
    } finally { await close(); } };
  /* whole-percent cells against values from the 2-decimal mg cells */
  const pct = (a, b) => a > 0 && b > 0 ? 100*a/b : null, near = (got, want) => got != null && want != null && Math.abs(got - want) <= Math.max(1, 0.02*want);

  await T.t('split', async () => { const S = await scenario({vLoad: 1, vKeep: 4, keepAs: 'flash-frozen, -80 °C'}), info = JSON.stringify(S), loaded = CONC*1, kept = CONC*4;
    T.check('split.total_produced', S.concMg === CONC*VOUT, info); /* guards: the Concentrated row is all 25 mg produced */
    T.check('split.hint_loaded', /5\.00 mg \(1\.0 of 5\.0 mL\) went on to the next step, 4\.0 mL kept back/.test(S.hint), S.hint);
    T.check('split.sec_step_yield_from_loaded', near(S.secStep, pct(S.secMg, loaded)), info); /* guards: SEC step yield = SEC mg / 5 mg loaded */
    T.check('split.sec_step_yield_not_over_100', S.secStep != null && S.secStep <= 100, info); /* guards: a kept-back aliquot never pushes SEC recovery above 100% */
    T.check('split.sec_yield_route', near(S.secY, pct(S.secMg, S.s1Mg)), info); /* guards: Yield stays the route shown, against step 1 */
    /* guards (fails on main, which had no such note): the kept-back 20 mg is named, with its share of step 1, as not lost */
    const n = S.notes.find(t => /kept back/.test(t)) || '';
    T.check('split.note_amounts', /25\.00 mg in all; 5\.00 mg \(1\.0 of 5\.0 mL\) was loaded on the next step and 20\.00 mg \(4\.0 mL, flash-frozen, -80 °C\) kept back/.test(n), n || S.notes.join(' | '));
    T.check('split.note_kept_pct', near(num((n.match(/kept back, (\d+)% of step 1/) || [])[1]), pct(kept, S.s1Mg)), n);
    T.check('split.note_label', /Kept back is not lost: the next step's step yield counts from the 5\.00 mg loaded, and Yield after this point counts only the loaded share\./.test(n), n); });

  await T.t('legacy', async () => { const S = await scenario(null), info = JSON.stringify(S);
    T.check('legacy.total_produced', S.concMg === CONC*VOUT, info);
    T.check('legacy.sec_step_yield_from_all', near(S.secStep, pct(S.secMg, CONC*VOUT)), info); /* guards: no split means all 25 mg were loaded */
    T.check('legacy.sec_yield_route', near(S.secY, pct(S.secMg, S.s1Mg)), info);
    T.check('legacy.no_hint', S.hint === '', S.hint);
    T.check('legacy.no_kept_note', !S.notes.some(t => /kept back/.test(t)), S.notes.join(' | ')); });
  await T.t('roundtrip_split', async () => {
    const {p, close} = await open(), h = H(p); p.on('dialog', d => d.accept());
    const setVal = (sel, v) => p.evaluate(({sel, v}) => { const e = document.querySelector(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return true; }, {sel, v: String(v)});
    let buf = null, s1Pre = null, secStepPre = null;
    try {
      await h.newProject('Roundtrip Split');
      await setVal('#o-protKda', 50); await setVal('#o-eps', 1); await h.wait(200);
      await h.addRun(src('his')); await h.pool('T1-T6');
      await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep=conc]'); await h.wait(500);
      await setVal('#btw-conc', '4.0'); await setVal('#btw-vOut', '2.0'); await h.wait(300);
      const sum = p.locator('#btwSplitBox > summary'); if (await sum.isVisible()) await sum.click(); await h.wait(150);
      await setVal('#btw-vLoad', '0.5'); await setVal('#btw-vKeep', '1.5'); await setVal('#btw-keepAs', 'flash-frozen'); await h.wait(300);
      await h.addRun(path.join(DATA, 'chrom', 'sec_semicolon_unicorn7.csv')); await h.pool('1.A.1-1.A.3');
      await p.evaluate(() => { for (const [k, v] of [['path', '2'], ['mFlow', '0.5']]) { const el = document.querySelector(`.trace.run.sel [data-k=${k}]`); if (el) { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } } });
      await h.wait(300); await h.step('figure'); await h.wait(300);
      {
        const rs0 = await h.sumTable(), hd0 = rs0[0] || [], rw0 = rs0.slice(1).filter(r => r.length === hd0.length);
        const mi0 = hd0.findIndex(k => /^Protein \(mg\)/.test(k)), si0 = hd0.findIndex(k => /^Step yield/.test(k)), ci0 = rw0.findIndex(r => /concentrat/i.test(r[0] || ''));
        s1Pre = rw0[0] && mi0 >= 0 ? num(rw0[0][mi0]) : null;
        secStepPre = ci0 >= 0 && rw0[ci0 + 1] && si0 >= 0 ? num(rw0[ci0 + 1][si0]) : null;
      }
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      const chunks = [];
      for await (const ch of await dl.createReadStream()) chunks.push(ch);
      buf = Buffer.concat(chunks);
    } finally { await close(); }

    const app2 = await open(), p2 = app2.p, h2 = H(p2); p2.on('dialog', d => d.accept());
    try {
      await p2.locator('#projFile').setInputFiles({name: 'roundtrip_split.json', mimeType: 'application/json', buffer: buf});
      await h2.wait(800); await h2.step('figure'); await h2.wait(400);
      const rs = await h2.sumTable(), head = rs[0] || [], rows = rs.slice(1).filter(r => r.length === head.length);
      const col = re => head.findIndex(k => re.test(k)), mi = col(/^Protein \(mg\)/), si = col(/^Step yield/), ci = rows.findIndex(r => /concentrat/i.test(r[0] || ''));
      const g = (r, i) => r && i >= 0 ? num(r[i]) : null;
      const s1Mg = g(rows[0], mi), concMg = g(ci >= 0 ? rows[ci] : null, mi), secStep = g(ci >= 0 ? rows[ci + 1] : null, si);
      const notes = await p2.$$eval('#sumNotes li', ls => ls.map(l => l.textContent));
      const hasLossWarn = notes.some(t => /most protein was lost here/i.test(t));
      const detail = JSON.stringify({s1Pre, s1Mg, concMg, secStepPre, secStep, notes});
      T.check('roundtrip_split.s1_area_preserved', s1Mg != null && s1Pre != null && s1Mg === s1Pre && s1Mg < 7.8, detail);
      T.check('roundtrip_split.conc_mg_preserved', concMg === 8, detail);
      T.check('roundtrip_split.sec_step_yield_no_false_loss', secStep != null && secStep === secStepPre && secStep >= 20 && !hasLossWarn, detail);
    } finally { await app2.close(); }
  });

  await T.t('hold_pool_nd_split', async () => {
    const {p, close} = await open(), h = H(p); p.on('dialog', d => d.accept());
    const setVal = (sel, v) => p.evaluate(({sel, v}) => { const e = document.querySelector(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return true; }, {sel, v: String(v)});
    try {
      await h.newProject('Hold Pool ND Split');
      await setVal('#o-protKda', 50); await setVal('#o-eps', 1); await h.wait(200);
      await h.addRun(src('his')); await h.pool('T1-T6');
      await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep=conc]'); await h.wait(400);
      const bm = p.locator('#btwMore');
      if (await bm.count() && !(await bm.evaluate(e => e.open))) { await bm.locator('summary').click(); await h.wait(100); }
      await p.selectOption('#btw-how', 'hold'); await h.wait(150);
      await setVal('#btw-conc', ''); await setVal('#btw-vOut', '5'); await h.wait(200);
      const sb = p.locator('#btwSplitBox');
      if (await sb.count() && !(await sb.evaluate(e => e.open))) { await sb.locator('summary').click(); await h.wait(100); }
      await setVal('#btw-vLoad', '1.25'); await setVal('#btw-vKeep', '3.75'); await h.wait(250);
      await h.addRun(src('q')); await h.pool('T11-T16'); await h.wait(250);
      const ndTsv = 'Sample ID\tUser name\tDate\tTime\tmg/ml\tA280 10 mm\tA260 10 mm\t260/280\n' +
        'IMAC pool\tPS\t10/22/2026\t15:00\t2.000\t2.000\t1.14\t0.57\n' +
        'Q pool\tPS\t10/22/2026\t15:30\t1.000\t1.000\t0.57\t0.57';
      await p.setInputFiles('#ndFile', {name: 'hold_pool_nd.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(ndTsv)});
      await h.wait(500);
      await h.step('final');
      await p.evaluate(() => document.querySelectorAll('.nd-edit').forEach(e => { e.open = true; }));
      await p.locator('#ndList select[data-ndk="runId"]').nth(0).selectOption({index: 1}); await h.wait(200);
      await p.evaluate(() => document.querySelectorAll('.nd-edit').forEach(e => { e.open = true; }));
      await p.locator('#ndList select[data-ndk="runId"]').nth(1).selectOption({index: 2}); await h.wait(200);
      const ndVols = p.locator('#ndList [data-ndr="ndVol"]');
      if (await ndVols.count() >= 2) {
        await ndVols.nth(0).fill('5'); await ndVols.nth(0).dispatchEvent('change');
        await ndVols.nth(1).fill('2'); await ndVols.nth(1).dispatchEvent('change');
      }
      await h.wait(300); await h.step('figure'); await h.wait(400);
      const rs = await h.sumTable(), head = rs[0] || [], rows = rs.slice(1).filter(r => r.length === head.length);
      const col = re => head.findIndex(k => re.test(k)), mi = col(/^Protein \(mg\)/), yi = col(/^Yield \(%\)/), si = col(/^Step yield/);
      const hi = rows.findIndex(r => /held overnight/i.test(r[0] || ''));
      const g = (r, i) => r && i >= 0 ? num(r[i]) : null;
      const holdMg = g(hi >= 0 ? rows[hi] : null, mi), qRow = hi >= 0 ? rows[hi + 1] : null;
      const qYield = g(qRow, yi), qStep = g(qRow, si);
      const yTip = await p.evaluate(yCol => {
        const trs = [...document.querySelectorAll('#sumTable tr')].slice(1);
        const qTr = trs.find(tr => /^2\./.test((tr.cells[0] && tr.cells[0].textContent || '').trim()));
        return qTr && qTr.cells[yCol] ? (qTr.cells[yCol].getAttribute('title') || '') : '';
      }, yi);
      const detail = JSON.stringify({holdMg, qYield, qStep, yTip});
      T.check('hold_pool_nd_split.propagates_split', holdMg === 10 && qYield === 20 && qStep === 80, detail);
      T.check('hold_pool_nd_split.tooltip_split_adjusted', /20% of step 1 along this route \(80% split-adjusted/.test(yTip), detail);
    } finally { await close(); }
  });
  T.done();
})();
