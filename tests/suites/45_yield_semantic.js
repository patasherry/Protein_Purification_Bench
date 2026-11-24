const {open, H, suite, fs, path, DATA} = require('../lib/harness');
const T = suite('45_yield_semantic');

async function fresh(id, fn){
  await T.t(id, async () => { const app = await open();
    try { await fn(app.p, H(app.p)); }
    finally { T.check(id + '/no-page-errors', !app.errs.length, app.errs.join(' | ')); await app.close(); }
  });
}

(async () => {
  await fresh('zero_yield_line', async (p, h) => {
    const openFolds = loc => loc.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });
    const setField = async (sel, v) => { const l = p.locator(sel).first(); await openFolds(l); await l.fill(String(v)); await l.dispatchEvent('change'); await h.wait(150); };
    const methods = async () => { await h.step('figure'); await p.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; }); await h.wait(400); return h.methods(); };

    await h.newProject('Zero vs unknown yield semantic tests');
    await h.gb(path.join(DATA, 'standins', 'pET28-SUMO-standin.gb'));
    await h.addRun(path.join(DATA, 'chrom', 'sec_semicolon_unicorn7.csv'));
    await h.pool('1.A.1-1.A.3');
    await p.evaluate(() => { const el = document.querySelector('.trace.run.sel [data-k=path]'); if (el) { el.value = '10'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } const f = document.querySelector('.trace.run.sel [data-k=mFlow]'); if (f) { f.value = '1'; f.dispatchEvent(new Event('input', {bubbles: true})); f.dispatchEvent(new Event('change', {bubbles: true})); } });

    await p.evaluate(() => document.querySelector('#tl [data-addmenu]').click()); await h.wait(100);
    await p.evaluate(() => document.querySelector('#tl [data-addstep="man:other"]').click()); await h.wait(500);
    await setField('#man-name', 'Final buffer exchange');
    await setField('#man-conc', '0');
    await setField('#man-vol', '10');

    await h.step('figure');
    await p.evaluate(() => {
      const el = document.getElementById('o-wfYield');
      if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
    });
    await h.step('figure');
    await h.wait(500);

    // Because SVG text layout can be tricky to grab from harness `svgTexts` reliably
    // we use `methodsText` and check `#sumTable` for 0.00 verification where it also affects
    let m = await methods();
    let res = (m.match(/Results:[^]*/) || [''])[0];
    T.check('zero_measured_shows_sample_in_methods', /After the Final buffer exchange step, the sample held 0\.00 mg/.test(res), `Results: ${res}`);

    // And also check SVG directly
    let html = await p.evaluate(() => document.querySelector('#paper').innerHTML);
    T.check('zero_measured_shows_sample_svg', html.includes('Final sample:') || html.includes('Final sample ('), `SVG includes Final sample: ${html.includes('Final sample:')}`);

    // 2. Now let's test missing/unknown data by disabling the reading
    const steps = await p.$$eval('#tl button[data-step]', els => els.map(e => e.getAttribute('data-step')));
    const manStep = steps.find(s => s.startsWith('man:'));
    await p.click(`#tl [data-step="${manStep}"]`);
    await h.wait(400);

    await setField('#man-conc', ''); // Unknown!

    await h.step('figure');
    await h.wait(500);

    let m2 = await methods();
    let res2 = (m2.match(/Results:[^]*/) || [''])[0];
    T.check('unknown_shows_pool_methods', !/the sample held 0\.00 mg/.test(res2), `Unknown text type: ${res2}`);

    let html2 = await p.evaluate(() => document.querySelector('#paper').innerHTML);
    T.check('unknown_shows_pool', html2.includes('Final pool:') || html2.includes('Final pool ('), `SVG includes Final pool: ${html2.includes('Final pool:')}`);

    // Case 3: Purity Zero vs Missing
    await p.evaluate(() => {
      const b = document.querySelector('#pr-qcPurity');
      if (b) { b.value = '0% pure by gel'; b.dispatchEvent(new Event('input', {bubbles: true})); b.dispatchEvent(new Event('change', {bubbles: true})); }
    });
    await h.step('figure');
    await h.wait(500);
    html2 = await p.evaluate(() => document.querySelector('#paper').innerHTML);
    T.check('purity_zero_shows_in_svg', html2.includes('0% pure'), `SVG includes 0% pure: ${html2.includes('0% pure')}`);
    T.check('purity_string_test', html2.includes('0% pure by gel'), `SVG includes 0% pure by gel: ${html2.includes('0% pure by gel')}`);

    await p.evaluate(() => {
      const b = document.querySelector('#pr-qcPurity');
      if (b) { b.value = ''; b.dispatchEvent(new Event('input', {bubbles: true})); b.dispatchEvent(new Event('change', {bubbles: true})); }
    });
    await h.step('figure');
    await h.wait(500);
    html2 = await p.evaluate(() => document.querySelector('#paper').innerHTML);
    T.check('purity_missing_not_shown_in_svg', !html2.includes('0% pure'), `SVG does not include 0% pure`);
  });

  /* #1022 & #1023: downstream allocation and kept-back carryover semantics tested across all 5 split states in one project */
  await fresh('downstream_allocation_and_carryover', async (p, h) => {
    p.on('dialog', d => d.accept());
    const num = s => { const m = String(s == null ? '' : s).replace(/[≈~,%]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
    const pct = (a, b) => a > 0 && b > 0 ? 100 * a / b : null;
    const near = (got, want) => got != null && want != null && Math.abs(got - want) <= Math.max(1, 0.02 * want);
    const setVal = (sel, v) => p.evaluate(({sel, v}) => { const e = document.querySelector(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return true; }, {sel, v: String(v)});
    const CONC = 5, VOUT = 5, VIN = 20;

    await h.newProject('Allocation and Carryover');
    await setVal('#o-protKda', 50); await setVal('#o-eps', 1); await h.wait(150);
    await h.addRun(path.join(DATA, 'standins', 'imac_histrap_1ml_step.csv')); await h.pool('T1-T6');
    await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep=conc]'); await h.wait(400);
    await setVal('#btw-vIn', VIN); await setVal('#btw-conc', CONC); await setVal('#btw-vOut', VOUT); await h.wait(250);
    const sum = p.locator('#btwSplitBox > summary'); if (await sum.isVisible()) await sum.click(); await h.wait(150);
    const fields = await p.evaluate(() => ['#btw-vLoad', '#btw-vKeep', '#btw-keepAs'].map(s => { const e = document.querySelector(s); return !!e && !!e.offsetParent; }));
    T.check('split.fields_shown', fields.every(Boolean), JSON.stringify(fields));

    await h.addRun(path.join(DATA, 'chrom', 'sec_semicolon_unicorn7.csv')); await h.pool('1.A.1-1.A.3');
    await p.evaluate(() => { for (const [k, v] of [['path', '2'], ['mFlow', '0.5']]) { const el = document.querySelector(`.trace.run.sel [data-k=${k}]`); if (el) { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } } });
    await h.wait(250);

    const concKey = (await h.timeline()).find(x => /^btw:|^conc:|^nc:/.test(x.k)).k;
    const probe = async ({vLoad = '', vKeep = '', keepAs = ''} = {}) => {
      await h.step(concKey);
      const sumOpen = await p.locator('#btwSplitBox').evaluate(d => d && d.open).catch(() => true);
      if (!sumOpen) { await p.locator('#btwSplitBox > summary').click(); await h.wait(100); }
      await setVal('#btw-vLoad', vLoad); await setVal('#btw-vKeep', vKeep); await setVal('#btw-keepAs', keepAs); await h.wait(250);
      const hint = await p.$eval('#btwSplit', e => e.hidden ? '' : e.textContent).catch(() => '');
      await h.step('figure'); await h.wait(250);
      const rs = await h.sumTable(), head = rs[0] || [], rows = rs.slice(1).filter(r => r.length === head.length);
      const col = re => head.findIndex(k => re.test(k)), mi = col(/^Protein \(mg\)/), yi = col(/^Yield/), si = col(/^Step yield/), ci = rows.findIndex(r => /concentrat/i.test(r[0] || ''));
      const g = (r, i) => r && i >= 0 ? num(r[i]) : null, s1 = rows[0], conc = rows[ci], sec = rows[ci + 1];
      const notes = await p.$$eval('#sumNotes li', ls => ls.map(l => l.textContent));
      return {hint, notes, s1Mg: g(s1, mi), concMg: g(conc, mi), secMg: g(sec, mi), secY: g(sec, yi), secStep: g(sec, si)};
    };

    // 1. Legacy (no split): all 25 mg loaded, no hint, no kept-back note
    const leg = await probe();
    T.check('legacy.conc_mg', leg.concMg === CONC * VOUT, JSON.stringify(leg));
    T.check('legacy.step_yield_from_all', near(leg.secStep, pct(leg.secMg, CONC * VOUT)) && near(leg.secY, pct(leg.secMg, leg.s1Mg)), JSON.stringify(leg));
    T.check('legacy.no_hint_or_note', leg.hint === '' && !leg.notes.some(t => /kept back/.test(t)), JSON.stringify(leg));

    // 2. Split (1 mL loaded, 4 mL kept back): step yield from 5 mg loaded, route yield vs step 1, kept-back note shown
    const sp = await probe({vLoad: 1, vKeep: 4, keepAs: 'flash-frozen, -80 °C'});
    const note = sp.notes.find(t => /kept back/.test(t)) || '';
    T.check('split.conc_mg_whole_output', sp.concMg === CONC * VOUT, JSON.stringify(sp));
    T.check('split.hint_names_loaded', /5\.00 mg \(1\.0 of 5\.0 mL\) went on to the next step, 4\.0 mL kept back/.test(sp.hint), sp.hint);
    T.check('split.step_yield_from_loaded', near(sp.secStep, pct(sp.secMg, CONC * 1)) && sp.secStep <= 100 && near(sp.secY, pct(sp.secMg, sp.s1Mg)), JSON.stringify(sp));
    T.check('split.kept_note_complete', /25\.00 mg in all; 5\.00 mg \(1\.0 of 5\.0 mL\) was loaded on the next step and 20\.00 mg \(4\.0 mL, flash-frozen, -80 °C\) kept back/.test(note) &&
      near(num((note.match(/kept back, (\d+)% of step 1/) || [])[1]), pct(CONC * 4, sp.s1Mg)) &&
      /Kept back is not lost: the next step's step yield counts from the 5\.00 mg loaded/.test(note), note);

    // 3. Kept-only (4 mL kept -> 1 mL loaded), Over-split (2+4 > 5 mL), and Zero-loaded (0 mL)
    const ko = await probe({vKeep: 4});
    T.check('kept_only.step_yield_from_rest', near(ko.secStep, pct(ko.secMg, CONC * 1)) && /5\.00 mg \(1\.0 of 5\.0 mL\)/.test(ko.hint), JSON.stringify(ko));
    const ov = await probe({vLoad: 2, vKeep: 4});
    T.check('over.flagged_and_falls_back_to_all', /is 6\.0 mL, more than the 5\.0 mL/.test(ov.hint) && near(ov.secStep, pct(ov.secMg, CONC * VOUT)), JSON.stringify(ov));
    const zr = await probe({vLoad: 0, vKeep: 5});
    T.check('zero.flagged_and_falls_back_to_all', /load of 0 mL/.test(zr.hint) && near(zr.secStep, pct(zr.secMg, CONC * VOUT)), JSON.stringify(zr));
  });

  T.done();
})();
