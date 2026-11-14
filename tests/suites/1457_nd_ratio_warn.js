const {open, H, suite, path, DATA} = require('../lib/harness');
const T = suite('1457_nd_ratio_warn');

/* A280/A260 of a pure protein lies in 1.5 to 2.5 (#1457). The app reads and shows A260/A280,
   so A280/A260 0.7 is A260/A280 1.43 (outside), and A280/A260 2.0 is A260/A280 0.50 (inside). */
const csv = (name, r) => `Date,Sample Name,Protein (mg/mL),A280,A260/A280,Sample Type,MW,E / 1000,Extinction coefficient,Baseline Correction (nm),Baseline Absorbance\n10/24/2026 10:00:00 AM,${name},1.0,1.000,${r},1 Abs = 1 mg / mL,,,,340,0.012`;
const RE = /ratio|outside|expected/i;

async function fresh(id, fn){
  await T.t(id, async () => { const app = await open();
    try { await fn(app.p, H(app.p)); }
    finally { T.check(id + '/no-page-errors', !app.errs.length, app.errs.join(' | ')); await app.close(); }
  });
}

/* visible text in the reading's row of the NanoDrop panel that matches the warning pattern */
const warnings = (p, name) => p.$$eval('.ndr', (rows, a) => { const re = new RegExp(a.re, 'i');
  const row = rows.find(r => (r.querySelector('input[data-ndk="name"]') || {}).value === a.name); if (!row) return null;
  return [...row.querySelectorAll('.nd-flags span')].filter(e => e.getClientRects().length && re.test(e.textContent)).map(e => e.textContent.trim()); }, {name, re: RE.source});

(async () => {
  for (const [id, name, r, want] of [['ratio_0.7_warns', 'Pool low ratio', 1.43, true], ['ratio_2.0_quiet', 'Pool good ratio', 0.5, false]])
    await fresh(id, async (p, h) => {
      await h.newProject('NanoDrop ratio ' + id);
      await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
      await p.waitForTimeout(500);
      await h.step('final');
      await p.waitForTimeout(200);
      await p.setInputFiles('#ndFile', {name: 'nd_ratio.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(name, r))});
      await p.waitForFunction(() => document.querySelectorAll('.ndr').length > 0, null, {timeout: 10000});
      const w = await warnings(p, name);
      T.check(id + '/row', w != null, 'the reading row was not found in the NanoDrop panel');
      if (want) T.check(id + '/warning-visible', w && w.some(t => /outside expected range for pure protein/i.test(t)), `A280/A260 0.7 (A260/A280 ${r}) should show the out-of-range warning; got ${JSON.stringify(w)}`);
      else T.check(id + '/no-warning', w && !w.length, `A280/A260 2.0 (A260/A280 ${r}) should show no warning; got ${JSON.stringify(w)}`);
    });
  T.done();
})();
