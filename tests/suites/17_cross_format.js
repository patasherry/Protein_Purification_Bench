const {open, H, suite, path, DATA, fs: hfs} = require('../lib/harness');
async function saved(p) { const dl = p.waitForEvent('download'); await p.locator('#projSave').evaluate(e => e.click()); return JSON.parse(hfs.readFileSync(await (await dl).path(), 'utf8')); }
const T = suite('17_cross_format');
const CH = path.join(DATA, 'chrom');

async function testFormat(filename, desc) {
  const {p, errs, close} = await open();
  const h = H(p);
  const card = p => p.locator('.trace.run.sel').first();
  const num = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };

  async function peaks(p, h){
    const t = await h.peakTable();
    if (!t.length) return {head: [], rows: []};
    const head = t[0];
    const iv = head.findIndex(c => /^(Ve|Center|Apex|Elution time)\b/.test(c));
    const ia = head.findIndex(c => /^Area/.test(c));
    const ih = head.findIndex(c => /Height/i.test(c));
    const rows = t.slice(1).filter(r => r.length > 3).map(r => ({
        name: r[0], a: num(r[1]), b: num(r[2]),
        ve: iv >= 0 ? num(r[iv]) : NaN,
        area: ia >= 0 ? num(r[ia]) : NaN,
        height: ih >= 0 ? num(r[ih]) : NaN
    }));
    return {head, rows};
  }

  try {
    await h.newProject('cross_format ' + desc);
    const f = require('path').join(__dirname, '..', 'data', 'chrom', filename);
    await h.addRun(f);
    await p.waitForTimeout(1000);

    const hasCard = await card(p).count();
    T.check(`${desc}/loads`, hasCard > 0, 'Run card should be visible');

    if (hasCard) {
        // 1. Navigate to the run step before clicking #intAuto
        const runStep = (await h.timeline()).find(x => x.k.startsWith('run:'));
        if (runStep) {
          await h.step(runStep.k);
          await p.waitForTimeout(500);
        }

        const setOpt = (p, id, v) => p.evaluate(([id, v]) => { const el = document.getElementById(id); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); return true; }, [id, String(v)]);

        await setOpt(p, 'o-eps', 1.0);
        await setOpt(p, 'o-path', 2.0);
        // Use setOpt to set prominence to 0.5 before detect
        await setOpt(p, 'o-intProm', 0.5);

        // Wait for intAuto to be visible and click it
        await p.waitForSelector('#intAuto', { state: 'visible', timeout: 5000 }).catch(() => {});
        await p.locator('#intAuto').evaluate(el => el.click());
        await p.waitForTimeout(600);

        const P = await peaks(p, h);
        const pk = P.rows;

        T.check(`${desc}/peak-table-rows`, pk.length > 0, `Peak table should have rows, got ${pk.length}`);

        if (pk.length > 0) {
          const hit = pk[0];
          T.check(`${desc}/ve`, Math.abs(hit.ve - 5.0) < 0.1, `Apex should be around 5.0, got ${hit.ve}`);

          if (hit.height != null && !isNaN(hit.height)) {
             T.check(`${desc}/height`, Math.abs(hit.height - 100.0) < 1.0, `Height should be around 100.0, got ${hit.height}`);
          }
          // Area = 100 * sqrt(2*pi) * 0.2 ~= 50.1
          T.check(`${desc}/area`, Math.abs(hit.area - 50.1) < 5.0, `Area should be around 50.1, got ${hit.area}`);
        }
    }

    T.check(`${desc}/no-errors`, errs.length === 0, errs.join(' | '));
    return await saved(p);
  } finally {
    await close();
  }
}

(async () => {
  let synth, dot, comma;
  await T.t('cross_format_synthetic', async () => { synth = await testFormat('synthetic.csv', 'synthetic'); });
  await T.t('cross_format_dot', async () => { dot = await testFormat('cross_format_dot.csv', 'dot'); });
  await T.t('cross_format_comma', async () => { comma = await testFormat('cross_format_comma.csv', 'comma'); });

  if (synth && dot && comma) {
      T.check('cross_format_invariant/dot_vs_synth_uv', JSON.stringify(dot.runs[0].uvs) === JSON.stringify(synth.runs[0].uvs), 'Dot and Synthetic UVs identical');
      T.check('cross_format_invariant/comma_vs_synth_uv', JSON.stringify(comma.runs[0].uvs) === JSON.stringify(synth.runs[0].uvs), 'Comma and Synthetic UVs identical');
      T.check('cross_format_invariant/dot_peaks', JSON.stringify(dot.runs[0].peaks) === JSON.stringify(synth.runs[0].peaks), 'Dot and Synth peaks identical');
      T.check('cross_format_invariant/comma_peaks', JSON.stringify(comma.runs[0].peaks) === JSON.stringify(synth.runs[0].peaks), 'Comma and Synth peaks identical');
  }

  // #1632: Multi-wavelength diode-array tabular CSV maps primary 280 nm + secondary UV wavelength columns (214 nm, 254 nm, custom nm)
  // as parallel overlay traces while excluding non-chromatogram numeric annotation columns (Peak Index, Temp).
  await T.t('multi_wavelength_dad_csv', async () => {
    const {p, errs, close} = await open();
    const h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('multi-wavelength DAD');
      const lines = ['Time (min),UV 214 nm (mAU),UV 254 nm (mAU),UV 280 nm (mAU),320nm (mAU),Peak Index,Temp (C)'];
      for (let i = 0; i <= 100; i++) {
        const t = i * 0.1;
        const g = (mu, amp) => amp * Math.exp(-0.5 * ((t - mu) / 0.25) ** 2);
        lines.push([
          t.toFixed(2),
          (2 + g(4.0, 250)).toFixed(3),
          (1 + g(5.0, 60)).toFixed(3),
          (1 + g(4.0, 100)).toFixed(3),
          (0.5 + g(6.0, 30)).toFixed(3),
          String(i + 1),
          '25.0'
        ].join(','));
      }
      await p.setInputFiles('#file', {
        name: 'dad_multi.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(lines.join('\n') + '\n')
      });
      await p.waitForTimeout(800);

      const tl = await h.timeline();
      const cards = p.locator('#list .trace:not(.run)');
      const nCards = await cards.count();
      const selectedY = await p.$$eval('#list .trace:not(.run) select[data-k="yc"]', sels => sels.map(s => s.options[s.selectedIndex].textContent));
      const d = await saved(p);
      const trs = d.traces || [];

      T.check('multi_wl/trace-count', nCards === 4 && trs.length === 4 && (d.runs || []).length === 0 && !tl.some(x => /^run:/.test(x.k)),
        `cards=${nCards}, traces=${trs.length}, runs=${(d.runs || []).length}, tl=${tl.map(x => x.k).join(',')}`);
      T.check('multi_wl/primary-280-and-channels',
        selectedY[0] === 'UV 280 nm (mAU)' &&
        JSON.stringify(selectedY) === JSON.stringify(['UV 280 nm (mAU)', 'UV 214 nm (mAU)', 'UV 254 nm (mAU)', '320nm (mAU)']) &&
        trs.every(t => t.yc !== 5 && t.yc !== 6),
        `selectedY=${JSON.stringify(selectedY)}, ycs=${JSON.stringify(trs.map(t => t.yc))}`);

      const svg = await h.exportSvg();
      const boxes = await h.svgBoxes(svg);
      const allText = boxes.texts.map(t => t.t).join(' | ');
      const tracePaths = await p.evaluate(markup => {
        const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
        return [...doc.querySelectorAll('g[clip-path*="plot-area"] path')].map(el => el.getAttribute('stroke')).filter(Boolean);
      }, svg);
      T.check('multi_wl/exported-svg',
        tracePaths.length === 4 && new Set(tracePaths).size === 4 &&
        /280 nm/.test(allText) && /214 nm/.test(allText) && /254 nm/.test(allText) && /320 nm/.test(allText) &&
        !/Peak Index|Temp/.test(allText) && boxes.clipped.length === 0,
        `paths=${tracePaths.length} (${[...new Set(tracePaths)].join(',')}), clipped=${JSON.stringify(boxes.clipped)}, texts=${allText}`);
      T.check('multi_wl/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  /* #1197: quoted CSV headings with commas/escaped quotes, unbalanced inch marks, quoted ÄKTA fractions, and tidy long-format CSV */
  await T.t('quoted_csv_and_tidy_akta', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      const rows = n => Array.from({length: n}, (_, i) => [(i * 0.1).toFixed(1), (50 * Math.exp(-((i - 20) ** 2) / 40)).toFixed(3), (10 + i * 0.05).toFixed(2)]);
      const card = name => p.locator('.trace:not(.run)').filter({has: p.locator(`input[data-k=name][value="${name}"]`)}).first();
      const opts = (c, k) => c.locator(`select[data-k=${k}] option`).allTextContents();
      const sel = (c, k) => c.locator(`select[data-k=${k}] option:checked`).textContent();
      const load = async (name, text) => { await p.setInputFiles('#file', {name: name + '.csv', mimeType: 'text/csv', buffer: Buffer.from(text)}); await h.wait(700); };

      await p.click('#homeQuick'); await h.wait(600);
      await load('quoted_comma', ['Time (min),"UV, 280 nm (mAU)","Cond, mS/cm",Note', ...rows(40).map(r => r.join(',') + ',"lot 5, A"')].join('\n'));
      const c1 = card('quoted_comma');
      T.check('comma_channels_and_plotted', (await c1.count()) === 1 && JSON.stringify(await opts(c1, 'yc')) === JSON.stringify(['Time (min)', 'UV, 280 nm (mAU)', 'Cond, mS/cm', 'Note']) && (await sel(c1, 'xc')) === 'Time (min)' && (await sel(c1, 'yc')) === 'UV, 280 nm (mAU)');

      await load('escaped_quote', ['"Time; min";"Sample ""A"" signal (mAU)";"pH; probe"', ...rows(40).map(r => r.map(v => v.replace('.', ',')).join(';'))].join('\n'));
      const c2 = card('escaped_quote');
      T.check('semicolon_escaped_quote_channels', JSON.stringify(await opts(c2, 'yc')) === JSON.stringify(['Time; min', 'Sample "A" signal (mAU)', 'pH; probe']) && (await sel(c2, 'yc')) === 'Sample "A" signal (mAU)');

      await load('inch_mark', ['Time (min),Signal 1" cell (mAU),Cond', ...rows(40).map(r => r.join(','))].join('\n'));
      T.check('unbalanced_quote_unchanged', JSON.stringify(await opts(card('inch_mark'), 'yc')) === JSON.stringify(['Time (min)', 'Signal 1" cell (mAU)', 'Cond']));

      await p.reload(); await h.wait(400); await h.newProject('quoted ÄKTA and tidy CSV');
      const quotedFractions = ['UV 1_280\t\tFraction\t', 'mL\tmAU\tmL\tFraction', '0\t1\t0\t" ""F1"""', '1\t2\t1\t" ""F2"""', '2\t1\t2\t" ""F3"""'].join('\n');
      await p.setInputFiles('#file', {name: 'quoted_fractions.asc', mimeType: 'text/plain', buffer: Buffer.from(quotedFractions)}); await h.wait(600);
      const tidy = ['mL,CV,Channel,Value', '0,0,UV280,1', '0,0,Cond,5', '0,0,Conc B,0', '1,1,UV280,2', '1,1,Cond,6', '1,1,Conc B,25', '2,2,UV280,1', '2,2,Cond,7', '2,2,Conc B,50'].join('\n');
      await p.setInputFiles('#file', {name: 'tidy_akta.csv', mimeType: 'text/csv', buffer: Buffer.from(tidy)}); await h.wait(600);
      const d = await saved(p), rf = (d.runs || []).find(x => x.file === 'quoted_fractions'), rt = (d.runs || []).find(x => x.file === 'tidy_akta');
      T.check('akta_fraction_label_unquoted', !!rf && JSON.stringify(rf.fracs.map(f => f.label)) === '["F1","F2","F3"]', JSON.stringify(rf && rf.fracs));
      T.check('tidy_akta_pivots_uv_and_cond', !!rt && rt.uvs.length === 1 && !!rt.cond && rt.uvs[0].xs.length === 3 && rt.cond.xs.length === 3, JSON.stringify(rt && {uvs: rt.uvs, cond: rt.cond}));
      T.check('quoted_csv/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  /* #1762: Multi-wavelength ÄKTA CSV prioritizes uniquely identifiable 280 nm UV channel over earlier non-280 nm channels */
  await T.t('multi_wavelength_akta_csv_prioritizes_280', async () => {
    const {p, errs, close} = await open(), h = H(p);
    const num = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('multi-wavelength ÄKTA 280 priority');

      const lines = ['UV 1_214,,UV 2_280,', 'ml,mAU,ml,mAU'];
      for (let i = 0; i <= 200; i++) {
        const x = i * 0.05;
        const g = Math.exp(-0.5 * ((x - 5.0) / 0.2) ** 2);
        lines.push(`${x.toFixed(4)},${(500 * g).toFixed(3)},${x.toFixed(4)},${(100 * g).toFixed(3)}`);
      }
      await p.setInputFiles('#file', {
        name: 'multi_wl_akta.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(lines.join('\n') + '\n')
      });
      await p.waitForTimeout(800);

      const d = await saved(p);
      const run = (d.runs || []).find(r => r.file === 'multi_wl_akta');
      T.check('akta_280/uv-order',
        !!run && run.uvs.length === 2 && run.uvs[0].name === 'UV 2_280' && run.uvs[1].name === 'UV 1_214',
        `uvs=${JSON.stringify(run && run.uvs.map(u => u.name))}`);

      const runStep = (await h.timeline()).find(x => x.k.startsWith('run:'));
      T.check('akta_280/run-step', !!runStep, 'Run step should appear in timeline');
      if (runStep) {
        await h.step(runStep.k);
        await p.waitForTimeout(500);
        await p.waitForSelector('#intAuto', { state: 'visible', timeout: 5000 });
        await p.click('#intAuto');
        await p.waitForTimeout(600);
        if (await p.locator('#intMore').isVisible()) {
          const txt = await p.locator('#intMore').textContent();
          if (/more columns/i.test(txt || '')) {
            await p.click('#intMore');
            await p.waitForTimeout(200);
          }
        }

        const tbl = await h.peakTable();
        const head = tbl[0] || [];
        const ih = head.findIndex(c => /Height/i.test(c));
        const rows = tbl.slice(1).filter(r => r.length > 3);
        const height = rows.length && ih >= 0 ? num(rows[0][ih]) : NaN;
        T.check('akta_280/peak-height-280',
          rows.length > 0 && isFinite(height) && Math.abs(height - 100) < 5,
          `rows=${rows.length}, height=${height}, head=${JSON.stringify(head)}`);
      }

      /* Ambiguous multiple 280 nm channels retain original file order */
      const ambLines = ['UV 1_214,,UV 2_280,,UV 3_280,', 'ml,mAU,ml,mAU,ml,mAU'];
      for (let i = 0; i <= 20; i++) {
        const x = i * 0.5;
        ambLines.push(`${x.toFixed(2)},${(10 + i).toFixed(2)},${x.toFixed(2)},${(5 + i).toFixed(2)},${x.toFixed(2)},${(2 + i).toFixed(2)}`);
      }
      await p.setInputFiles('#file', {
        name: 'multi_wl_akta_ambiguous_280.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(ambLines.join('\n') + '\n')
      });
      await p.waitForTimeout(600);
      const d2 = await saved(p);
      const ambRun = (d2.runs || []).find(r => r.file === 'multi_wl_akta_ambiguous_280');
      T.check('akta_280/ambiguous-keeps-file-order',
        !!ambRun && JSON.stringify(ambRun.uvs.map(u => u.name)) === JSON.stringify(['UV 1_214', 'UV 2_280', 'UV 3_280']),
        `uvs=${JSON.stringify(ambRun && ambRun.uvs.map(u => u.name))}`);

      T.check('akta_280/no-errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
