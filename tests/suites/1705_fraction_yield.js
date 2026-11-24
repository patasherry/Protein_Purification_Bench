// 1705 fraction yield (#1678): cross-reference chromatographic fractions (run.fracs) with assigned SDS-PAGE gel lanes (gel.assign)
// and band tags (gel.tags / tagRaw) to compute target protein mass (mg) and specific recovery yield (%).
// Driven strictly via UI and DOM controls, never internal globals. All data synthetic.
const {open, H, suite, fs} = require('../lib/harness');

const num = s => {
  const m = String(s == null ? '' : s).replace(/[≈~,%]/g, '').trim().match(/-?\d+(\.\d+)?/);
  return m ? +m[0] : null;
};

function makeSynthAktaCsv() {
  const lines = [
    'Chrom.1\t\tChrom.1\t',
    'UV 1_280\t\tFraction\t',
    'ml\tmAU\tml\tFraction'
  ];
  const fracs = [[2.0, 'F1'], [6.0, 'F2'], [10.0, 'F3'], [14.0, 'Waste']];
  const n = 161;
  for (let i = 0; i < n; i++) {
    const x = +(i * 0.1).toFixed(2);
    const y = +(200 * Math.exp(-0.5 * Math.pow((x - 8.0) / 1.0, 2))).toFixed(3);
    const f = i < fracs.length ? `${fracs[i][0]}\t"${fracs[i][1]}"` : '\t';
    lines.push(`${x}\t${y}\t${f}`);
  }
  return lines.join('\r\n');
}

async function makeSynthGelPng(p) {
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 360;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(300, 360);
    for (let y = 0; y < 360; y++) {
      for (let x = 0; x < 300; x++) {
        const lane = Math.floor(x / 100);
        const dx = Math.abs((x % 100) - 50);
        const w = Math.exp(-0.5 * Math.pow(dx / 22, 6));
        const bands = lane === 0
          ? [[72, 65, 4], [145, 65, 4], [216, 65, 4], [288, 70, 4]]
          : lane === 1
            ? [[120, 90, 7], [200, 90, 7]]
            : [[120, 150, 7], [230, 50, 7]]; // Lane 3 (F2): ~75% target at y=120, ~25% contaminant at y=230
        const dark = bands.reduce((s, [mu, h, sd]) => s + h * Math.exp(-0.5 * Math.pow((y - mu) / sd, 2)), 0) * w;
        const v = Math.round(Math.max(15, 240 - dark));
        const j = 4 * (300 * y + x);
        im.data[j] = im.data[j + 1] = im.data[j + 2] = v;
        im.data[j + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

function parseCsv(text) {
  return text.trim().split(/\r?\n/).map(line => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === ',' && !q) {
        out.push(cur); cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

(async () => {
  const T = suite('1705_fraction_yield');
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

  try {
    await T.t('fraction_yield_calculation_and_null_guards', async () => {
      await h.newProject('Fraction Yield Test');

      // 1. Load synthetic ÄKTA run with fractions F1 (2-6 mL), F2 (6-10 mL), F3 (10-14 mL)
      await h.addRun({name: 'synth_frac_run.csv', mimeType: 'text/csv', buffer: Buffer.from(makeSynthAktaCsv())});
      const runStep = (await h.timeline()).find(x => /^run:/.test(x.k));
      T.check('run_loaded', !!runStep, 'synthetic run with fractions loaded');
      await h.step(runStep.k);
      const runId = runStep.k.slice(4);

      // Set extinction = 1.0 (mL mg^-1 cm^-1), zero baseline, path = 10 mm (1.0 cm), and auto-integrate peak
      await p.click('#moreBtn').catch(() => {});
      await h.wait(200);
      for (const [sel, val] of [['#o-extinction', '1.0'], ['#o-intBase', 'zero']]) {
        const el = p.locator(sel);
        if (await el.count()) {
          await ensureVisible(el);
          if (sel === '#o-intBase') await el.selectOption(val);
          else await el.fill(val);
          await el.dispatchEvent('input');
          await el.dispatchEvent('change');
        }
      }
      const pathInp = p.locator('.trace.run.sel [data-k="path"]');
      await ensureVisible(pathInp);
      await pathInp.fill('10');
      await pathInp.dispatchEvent('input');
      await pathInp.dispatchEvent('change');
      await h.wait(250);
      await p.click('#intAuto');
      await h.wait(400);

      // 2. Add synthetic 3-lane gel through the UI
      const gelPng = await makeSynthGelPng(p);
      await p.setInputFiles('#gelFile', {name: 'synth_frac_gel.png', mimeType: 'image/png', buffer: gelPng});
      await h.wait(1200);

      const gelStep = (await h.timeline()).find(x => /^gel:/.test(x.k));
      if (gelStep) await h.step(gelStep.k);
      await h.wait(400);

      // Configure 3 lanes without auto-crop so lane positions are exact: M, Load, F2
      await p.click('#moreBtn').catch(() => {});
      await h.wait(200);
      const autoCropCb = p.locator('#o-gelAutoCrop');
      if (await autoCropCb.count()) {
        await ensureVisible(autoCropCb);
        if (await autoCropCb.isChecked()) await autoCropCb.uncheck();
      }
      for (const [sel, val] of [['#g-cl', '0'], ['#g-cr', '0'], ['#g-ct', '0'], ['#g-cb', '0'], ['#g-n', '3'], ['#g-labels', 'M, Load, F2']]) {
        const el = p.locator(sel);
        if (await el.count()) {
          await ensureVisible(el);
          await el.fill(val);
          await el.dispatchEvent('input');
          await el.dispatchEvent('change');
        }
      }
      await h.wait(500);

      // Missing data check 1: before setting any band tag, fraction yield is null (not shown in #bandTable)
      const headBeforeTag = await p.$$eval('#bandTable th', ths => ths.map(t => t.textContent.trim()));
      T.check('null_without_band_tag', !headBeforeTag.some(h => /fraction yield/i.test(h)), `headers before tag: ${headBeforeTag.join(' | ')}`);

      // Explicitly assign Lane 3 (index 2, label "F2") to the run via #la2 (`gel.assign`), while Lane 2 ("Load") is unassigned
      const la1 = p.locator('#la1'), la2 = p.locator('#la2');
      await ensureVisible(la2);
      if (await la1.count()) await la1.selectOption('');
      await la2.selectOption(runId);
      await h.wait(400);

      // Click the strongest band chip in Lane 3 ("F2") to tag it as 'target'
      const f2Chip = p.locator('#bandTable tr', {hasText: 'F2'}).locator('.bchip').first();
      await ensureVisible(f2Chip);
      await f2Chip.click();
      await h.wait(500);

      // Verify #bandTable now displays Purity, Fraction (mg), and non-zero Fraction yield (%)
      const tbl = await p.evaluate(() => {
        const ths = [...document.querySelectorAll('#bandTable th')].map(t => t.textContent.trim());
        const findRow = lbl => {
          const tr = [...document.querySelectorAll('#bandTable tr')].find(r => r.cells[1] && r.cells[1].textContent.trim() === lbl);
          return tr ? [...tr.cells].map(c => c.textContent.trim()) : null;
        };
        return {ths, f2: findRow('F2'), load: findRow('Load')};
      });

      const purCol = tbl.ths.findIndex(h => /^Purity/i.test(h));
      const mgCol = tbl.ths.findIndex(h => /^Fraction \(mg\)/i.test(h));
      const yldCol = tbl.ths.findIndex(h => /^Fraction yield/i.test(h));

      T.check('fraction_columns_displayed', mgCol >= 0 && yldCol >= 0, `headers: ${tbl.ths.join(' | ')}`);

      const purityVal = tbl.f2 && purCol >= 0 ? num(tbl.f2[purCol]) : null;
      const fracMgVal = tbl.f2 && mgCol >= 0 ? num(tbl.f2[mgCol]) : null;
      const fracYldVal = tbl.f2 && yldCol >= 0 ? num(tbl.f2[yldCol]) : null;

      // Expected: Gaussian peak area = 200 * sqrt(2*pi) = 501.33 mAU*mL (~0.501 mg); F2 (6..10 mL, +-2 SD) = 478.5 mAU*mL (~0.4785 mg)
      // Lane F2 target band purity ~75% => target mg ~0.36 mg, specific recovery yield ~71.6% (> 0)
      T.check('purity_detected_around_75pct', purityVal != null && purityVal > 65 && purityVal < 85, `F2 purity=${purityVal}%`);
      T.check('fraction_mg_nonzero_and_accurate', fracMgVal != null && fracMgVal > 0.30 && fracMgVal < 0.42, `F2 mg=${fracMgVal}`);
      T.check('fraction_yield_nonzero_and_accurate', fracYldVal != null && fracYldVal > 60 && fracYldVal < 85, `F2 yield=${fracYldVal}%`);

      // Unassigned lane ("Load") gracefully has empty fraction yield cells (null calculation)
      const loadYld = tbl.load && yldCol >= 0 ? tbl.load[yldCol] : '';
      T.check('unassigned_lane_returns_null', loadYld === '', `Load lane yield cell="${loadYld}"`);

      // Verify CSV export (#bandCsv) carries exact numeric Fraction protein (mg) and Fraction yield (%)
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#bandCsv')]);
      const csvRows = parseCsv(fs.readFileSync(await dl.path(), 'utf8'));
      const csvHead = csvRows[0] || [];
      const cMg = csvHead.indexOf('Fraction protein (mg)');
      const cYld = csvHead.indexOf('Fraction yield (%)');
      const f2Csv = csvRows.find(r => r[2] === 'F2');
      T.check('band_csv_has_fraction_yield', cMg >= 0 && cYld >= 0 && !!f2Csv && +f2Csv[cMg] > 0.30 && +f2Csv[cYld] > 60, `CSV row=${JSON.stringify(f2Csv)}`);

      // Switch to workflow view and verify the Fraction Yield summary table (#fracYieldBox / #fracYieldTable)
      await h.step('figure');
      await h.wait(400);
      const wfFy = await p.evaluate(() => {
        const panel = document.querySelector('#sumPanel');
        const box = document.querySelector('#fracYieldBox');
        const tbl = document.querySelector('#fracYieldTable');
        const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
        const title = box ? (box.querySelector('.intp-head')?.textContent || '').trim() : '';
        const rows = tbl ? [...tbl.rows].map(r => [...r.cells].map(c => c.textContent.trim())) : [];
        return {panelVis: vis(panel), boxVis: vis(box), title, rows};
      });
      const fyHead = wfFy.rows[0] || [];
      const fyRow = wfFy.rows.slice(1).find(r => r[0] === 'F2');
      const iArea = fyHead.findIndex(h => /UV area/i.test(h));
      const iPur = fyHead.findIndex(h => /purity/i.test(h));
      const iMass = fyHead.findIndex(h => /mass/i.test(h));
      const fyArea = fyRow && iArea >= 0 ? num(fyRow[iArea]) : null;
      const fyPur = fyRow && iPur >= 0 ? num(fyRow[iPur]) : null;
      const fyMass = fyRow && iMass >= 0 ? num(fyRow[iMass]) : null;
      T.check('workflow_fraction_yield_table_visible', wfFy.panelVis && wfFy.boxVis && /Fraction Yield/i.test(wfFy.title) && iArea >= 0 && iPur >= 0 && iMass >= 0, `panelVis=${wfFy.panelVis} boxVis=${wfFy.boxVis} title="${wfFy.title}" head=${fyHead.join('|')}`);
      T.check('workflow_fraction_yield_row_values', !!fyRow && fyArea > 450 && fyArea < 500 && fyPur > 65 && fyPur < 85 && fyMass > 0.30 && fyMass < 0.42, `row=${JSON.stringify(fyRow)} area=${fyArea} pur=${fyPur} mass=${fyMass}`);

      // Missing data check 2: clearing band tags via #g-tagClear returns null gracefully with no errors
      await h.step(runStep.k);
      await p.locator('#ssGels [data-gelopen]').first().click();
      await h.wait(300);
      const clearBtn = p.locator('#g-tagClear');
      await ensureVisible(clearBtn);
      await clearBtn.click();
      await h.wait(400);
      const headAfterClear = await p.$$eval('#bandTable th', ths => ths.map(t => t.textContent.trim()));
      T.check('null_after_tag_clear', !headAfterClear.some(h => /fraction yield/i.test(h)), `headers after clear: ${headAfterClear.join(' | ')}`);
      await h.step('figure');
      await h.wait(300);
      const boxVisAfterClear = await p.evaluate(() => {
        const box = document.querySelector('#fracYieldBox');
        return !!box && !box.hidden && getComputedStyle(box).display !== 'none' && !document.querySelector('#sumPanel')?.hidden;
      });
      T.check('workflow_fraction_yield_hidden_after_clear', !boxVisAfterClear, `boxVisAfterClear=${boxVisAfterClear}`);
    });

    T.check('no_page_errors', !errs.length, errs.join(' | '));
  } finally {
    await close();
  }
  T.done();
})();
