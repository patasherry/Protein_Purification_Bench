// #1685: recovery uses the target band's tagged intensity as a share of all lane stain.
// This is driven through the UI and DOM only; the run and gel are synthetic.
const {open, H, suite} = require('../lib/harness');

const number = text => {
  const m = String(text || '').match(/-?\d+(?:\.\d+)?/);
  return m ? +m[0] : null;
};

function fractionRun() {
  const lines = ['Chrom.1\t\tChrom.1\t', 'UV 1_280\t\tFraction\t', 'ml\tmAU\tml\tFraction'];
  const fracs = [[2, 'F1'], [6, 'F2'], [10, 'F3'], [14, 'Waste']];
  for (let i = 0; i <= 160; i++) {
    const x = (i / 10).toFixed(1), f = i < fracs.length ? `${fracs[i][0]}\t"${fracs[i][1]}"` : '\t';
    lines.push(`${x}\t100\t${f}`);
  }
  return lines.join('\r\n');
}

async function gelPng(p) {
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 360;
    const ctx = c.getContext('2d'), im = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const lane = Math.floor(x / 100), w = Math.exp(-0.5 * Math.pow(Math.abs(x % 100 - 50) / 22, 6));
      const bands = lane === 0 ? [[70, 60], [145, 60], [220, 60], [290, 60]] : lane === 1 ? [[120, 100], [200, 50], [280, 100]] : [[140, 40]];
      const dark = bands.reduce((sum, [mid, height]) => sum + height * Math.exp(-0.5 * Math.pow((y - mid) / 7, 2)), 0) * w;
      const value = Math.round(Math.max(15, 240 - dark)), i = 4 * (y * c.width + x);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = value; im.data[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0); return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

async function show(loc) {
  await loc.evaluate(el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
}

async function clickBandNear(p, y, times) {
  const chips = p.locator('#bandTable tr', {hasText: 'F2'}).locator('.bchip');
  for (let i = 0; i < times; i++) {
    const index = await chips.evaluateAll((els, y) => els.reduce((best, item, index) => !best || Math.abs(+item.dataset.by - y) < best.distance ? {index, distance: Math.abs(+item.dataset.by - y)} : best, null).index, y);
    await chips.nth(index).click();
    await p.waitForTimeout(120);
  }
}

(async () => {
  const T = suite('1700_recovery_matrix');
  const {p, errs, close} = await open(), h = H(p);
  p.setDefaultTimeout(15000);
  try {
    await T.t('lane_intensity_purity', async () => {
      await h.newProject('Lane intensity purity');
      await h.addRun({name: 'recovery_fractions.csv', mimeType: 'text/csv', buffer: Buffer.from(fractionRun())});
      const run = (await h.timeline()).find(x => /^run:/.test(x.k));
      T.check('run_loaded', !!run, JSON.stringify(await h.timeline()));
      await h.step(run.k);
      await p.click('#moreBtn').catch(() => {});
      const baseline = p.locator('#o-intBase'); await show(baseline); await baseline.selectOption('zero'); await baseline.dispatchEvent('change');

      const gel = await gelPng(p);
      await p.setInputFiles('#gelFile', {name: 'lane_intensity.png', mimeType: 'image/png', buffer: gel});
      await h.wait(1400);
      const gelControl = p.locator('#g-n');
      T.check('gel_loaded', await gelControl.count() === 1, `toast=${await p.locator('#toast').textContent()}`);
      if (!(await gelControl.count())) return;
      await p.click('#moreBtn').catch(() => {});
      for (const [id, value] of [['#g-cl', '0'], ['#g-cr', '0'], ['#g-ct', '0'], ['#g-cb', '0'], ['#g-n', '3'], ['#g-labels', 'M, F2, Other']]) {
        const field = p.locator(id); await show(field); await field.fill(value); await field.dispatchEvent('input'); await field.dispatchEvent('change');
      }
      const autoCrop = p.locator('#o-gelAutoCrop'); await show(autoCrop); if (await autoCrop.isChecked()) await autoCrop.uncheck();
      const purityBasis = p.locator('#o-purBase'); await show(purityBasis); await purityBasis.selectOption('tagged'); await purityBasis.dispatchEvent('change');
      await h.wait(500);

      const assignment = p.locator('#la1'); await show(assignment); await assignment.selectOption(run.k.slice(4));
      await h.wait(300);
      await clickBandNear(p, 120 / 360, 1); // target: 100 intensity units
      await h.wait(200);
      await clickBandNear(p, 200 / 360, 3); // contaminant: 50 intensity units
      await h.wait(500);

      const marked = await p.evaluate(() => {
        const headers = [...document.querySelectorAll('#bandTable th')].map(th => th.textContent.trim());
        const row = [...document.querySelectorAll('#bandTable tr')].find(tr => tr.cells[1] && tr.cells[1].textContent.trim() === 'F2');
        return {headers, cells: row ? [...row.cells].map(td => td.textContent.trim()) : []};
      });
      const markedColumn = marked.headers.findIndex(h => /^Purity$/i.test(h));
      const markedPurity = markedColumn >= 0 ? number(marked.cells[markedColumn]) : null;
      T.check('marked_band_setting_is_exercised', markedPurity != null && markedPurity > 60, `marked purity=${markedPurity}; ${JSON.stringify(marked)}`);

      await h.step('figure');
      await h.wait(400);
      const values = await p.evaluate(() => {
        const rows = [...document.querySelectorAll('#fracYieldTable tr')].map(tr => [...tr.cells].map(td => td.textContent.trim()));
        return {headers: rows[0] || [], cells: rows.slice(1).find(row => row[0] === 'F2') || []};
      });
      const purityColumn = values.headers.findIndex(h => /purity/i.test(h));
      const displayed = purityColumn >= 0 ? number(values.cells[purityColumn]) : null;
      // Target / all lane stain = 100 / (100 + 50 + 100) = 40%. The marked-only setting would be 66.7%.
      T.check('target_intensity_is_normalized_to_total_lane', displayed != null && Math.abs(displayed - 40) < 4, `purity=${displayed}; ${JSON.stringify(values)}`);
    });
    T.check('no_page_errors', errs.length === 0, errs.join(' | '));
  } finally { await close(); }
  T.done();
})();
