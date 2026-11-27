// #1815: a UV peak whose top is flat (the detector clipped) shows its mass as a lower bound, with a note; a clean peak beside it
// is not flagged. UI and DOM only; the run is synthetic.
const {open, H, suite} = require('../lib/harness');
function run(){
  const lines = ['Chrom.1\t', 'UV 1_280\t', 'ml\tmAU'];
  for (let i = 0; i <= 800; i++) { const x = i * 0.02, g = (c, hgt) => hgt * Math.exp(-0.5 * ((x - c) / 0.6) ** 2);
    lines.push(`${x.toFixed(2)}\t${Math.min(3000, g(5, 5000) + g(11, 1500)).toFixed(3)}`); }
  return lines.join('\r\n');
}
const show = loc => loc.evaluate(el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
(async () => { const T = suite('1815_flat_top'), {p, errs, close} = await open(), h = H(p); p.setDefaultTimeout(15000);
  try {
    await T.t('flat_top_flagged', async () => {
      await h.newProject('Flat top');
      await h.addRun({name: 'clipped_peak.csv', mimeType: 'text/csv', buffer: Buffer.from(run())});
      const r = (await h.timeline()).find(x => /^run:/.test(x.k)); await h.step(r.k);
      await p.click('#moreBtn').catch(() => {});
      const base = p.locator('#o-intBase'); await show(base); await base.selectOption('zero'); await base.dispatchEvent('change');
      const eps = p.locator('#o-extinction'); await show(eps); await eps.fill('1'); await eps.dispatchEvent('change');
      const svg = await p.locator('#paper svg').boundingBox();
      /* the x axis spans about 0 to 16 mL; read it from the axis rather than guessing: drag, then type exact limits in the table */
      const drag = async (f0, f1) => { await p.mouse.move(svg.x + svg.width * f0, svg.y + svg.height * 0.5); await p.mouse.down(); await p.mouse.move(svg.x + svg.width * f1, svg.y + svg.height * 0.5, {steps: 8}); await p.mouse.up(); await p.waitForTimeout(400); };
      await drag(0.3, 0.4); await drag(0.65, 0.75);
      const setRange = async (k, a, b) => { for (const [id, v] of [[`#ia${k}`, a], [`#ib${k}`, b]]) { await p.evaluate(([id, v]) => { const f = document.querySelector(id); f.value = v; f.dispatchEvent(new Event('change', {bubbles: true})); }, [id, String(v)]); await p.waitForTimeout(300); } };
      await setRange(0, 2.5, 7.5); await setRange(1, 8.5, 13.5);
      const t = await p.evaluate(() => { const rows = [...document.querySelectorAll('#intTable tr')], hd = [...rows[0].cells].map(c => c.textContent.trim()), mi = hd.findIndex(x => /^Protein \(mg\)$|mg\)?$/.test(x));
        return {hd, mg: rows.slice(1).filter(r => r.cells.length > 5).map(r => r.cells[mi] ? r.cells[mi].textContent.trim() : ''), note: (document.querySelector('#intTable .flatnote') || {}).textContent || ''}; });
      T.check('flat_top.clipped_mass_is_lower_bound', /^≥\s*\d/.test(t.mg[0] || ''), JSON.stringify(t));
      T.check('flat_top.clean_peak_not_flagged', /^\d/.test(t.mg[1] || ''), JSON.stringify(t));
      T.check('flat_top.note_names_peak', /saturated/.test(t.note), JSON.stringify(t));
    });
    T.check('no_page_errors', !errs.length, errs.join(' | '));
  } finally { await close(); }
  T.done();
})();
