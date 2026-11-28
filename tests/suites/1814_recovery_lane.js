// #1814: the recovery matrix takes each peak's purity from the lane whose fractions overlap it, not the first lane assigned
// to the run, and a saturated lane gives no purity. UI and DOM only; the run and gel are synthetic.
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

async function gelPng(p, satF2) {
  const b64 = await p.evaluate(satF2 => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 360;
    const ctx = c.getContext('2d'), im = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const lane = Math.floor(x / 100), w = Math.exp(-0.5 * Math.pow(Math.abs(x % 100 - 50) / 22, 6));
      const bands = lane === 0 ? [[70, 60], [145, 60], [220, 60], [290, 60]] : lane === 1 ? [[120, 30], [200, 100]] : [[120, 100], [200, 50], [280, 100]];
      const dark = bands.reduce((sum, [mid, height]) => sum + height * Math.exp(-0.5 * Math.pow((y - mid) / 7, 2)), 0) * w;
      const value = satF2 && lane === 2 && y < 240 ? 0 : Math.round(Math.max(15, 240 - dark)), i = 4 * (y * c.width + x);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = value; im.data[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0); return c.toDataURL('image/png').split(',')[1];
  }, satF2);
  return Buffer.from(b64, 'base64');
}

async function show(loc) {
  await loc.evaluate(el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
}

async function addPeakRegion(p) {
  const box = await p.locator('#paper svg').boundingBox();
  if (!box) throw new Error('run figure did not render');
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, {steps: 8});
  await p.mouse.up();
  await p.waitForTimeout(400);
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
  const T = suite('1814_recovery_lane');
  const setup = async (p, h, satF2) => {
    await h.newProject('Recovery lane ' + (satF2 ? 'saturated' : 'match'));
    await h.addRun({name: 'recovery_fractions.csv', mimeType: 'text/csv', buffer: Buffer.from(fractionRun())});
    const run = (await h.timeline()).find(x => /^run:/.test(x.k)); await h.step(run.k);
    await p.click('#moreBtn').catch(() => {});
    const baseline = p.locator('#o-intBase'); await show(baseline); await baseline.selectOption('zero'); await baseline.dispatchEvent('change');
    const eps = p.locator('#o-extinction'); await show(eps); await eps.fill('2'); await eps.dispatchEvent('change');
    await addPeakRegion(p); // about 6.5 to 12 mL: inside F2 (6 to 10) and F3 (10 to 14), none of F1 (2 to 6)
    await p.setInputFiles('#gelFile', {name: 'two_lanes.png', mimeType: 'image/png', buffer: await gelPng(p, satF2)});
    await h.wait(1400);
    await p.click('#moreBtn').catch(() => {});
    for (const [id, value] of [['#g-cl', '0'], ['#g-cr', '0'], ['#g-ct', '0'], ['#g-cb', '0'], ['#g-n', '3'], ['#g-labels', 'M, F1, F2']]) {
      const field = p.locator(id); await show(field); await field.fill(value); await field.dispatchEvent('input'); await field.dispatchEvent('change'); }
    const autoCrop = p.locator('#o-gelAutoCrop'); await show(autoCrop); if (await autoCrop.isChecked()) await autoCrop.uncheck();
    const purityBasis = p.locator('#o-purBase'); await show(purityBasis); await purityBasis.selectOption('tagged'); await purityBasis.dispatchEvent('change');
    await h.wait(500);
    for (const la of ['#la1', '#la2']) { const a = p.locator(la); await show(a); await a.selectOption(run.k.slice(4)); await h.wait(300); }
    await clickBandNear(p, 120 / 360, 1); await h.wait(200); // the band at 120 is the target in every lane
    await clickBandNear(p, 200 / 360, 3); await h.wait(500); // the band at 200 is a contaminant
    return p.evaluate(() => { const rows = [...document.querySelectorAll('#recoveryMatrixTable tr')].map(tr => [...tr.cells].map(td => td.textContent.trim()));
      const hd = rows[0] || [], r = rows.slice(1).find(x => x[hd.indexOf('Peak Name')] === 'P1') || [];
      return {purity: r[hd.indexOf('Gel Purity (%)')], recovered: r[hd.indexOf('Recovered Pure Mass (mg)')], rows}; });
  };
  for (const satF2 of [false, true]) {
    await T.t(satF2 ? 'saturated_lane' : 'lane_matches_peak', async () => { const {p, errs, close} = await open(), h = H(p); p.setDefaultTimeout(15000);
      try { const m = await setup(p, h, satF2);
        if (!satF2) T.check('peak_uses_overlapping_lane', number(m.purity) != null && Math.abs(number(m.purity) - 40) < 4, `purity ${m.purity} (the F2 lane is 40%; the first lane assigned, F1, has no target band); ${JSON.stringify(m.rows)}`);
        else T.check('saturated_lane_gives_no_purity', /saturated/i.test(m.purity || '') && !(number(m.recovered) > 0), JSON.stringify(m.rows));
        T.check((satF2 ? 'saturated' : 'match') + '.no_page_errors', !errs.length, errs.join(' | '));
      } finally { await close(); } });
  }
  T.done();
})();
