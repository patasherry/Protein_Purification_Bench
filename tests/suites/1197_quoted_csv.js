// Issue #1197: a generic CSV whose quoted headings contain commas or escaped quotes keeps its channels intact
const {open, H, suite, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('1197_quoted_csv'), {p, errs, close} = await open(), h = H(p);
  const rows = n => Array.from({length: n}, (_, i) => [(i * 0.1).toFixed(1), (50 * Math.exp(-((i - 20) ** 2) / 40)).toFixed(3), (10 + i * 0.05).toFixed(2)]);
  const card = name => p.locator('.trace:not(.run)').filter({has: p.locator(`input[data-k=name][value="${name}"]`)}).first();
  const opts = async (c, k) => c.locator(`select[data-k=${k}] option`).allTextContents();
  const sel = async (c, k) => c.locator(`select[data-k=${k}] option:checked`).textContent();
  const load = async (name, text) => { await p.setInputFiles('#file', {name: name + '.csv', mimeType: 'text/csv', buffer: Buffer.from(text)}); await h.wait(900); };

  await T.t('quoted-commas-and-escaped-quotes', async () => {
    await p.click('#homeQuick'); await h.wait(800);

    // 1. Comma-delimited, headings with quoted commas, plus a quoted text field with a comma in every data row
    await load('quoted_comma', ['Time (min),"UV, 280 nm (mAU)","Cond, mS/cm",Note', ...rows(40).map(r => r.join(',') + ',"lot 5, A"')].join('\n'));
    const c1 = card('quoted_comma');
    T.check('comma_card_present', (await c1.count()) === 1, 'trace card for quoted_comma');
    const o1 = await opts(c1, 'yc');
    T.check('comma_channels_intact', JSON.stringify(o1) === JSON.stringify(['Time (min)', 'UV, 280 nm (mAU)', 'Cond, mS/cm', 'Note']), `channels: ${JSON.stringify(o1)}`);
    const x1 = await sel(c1, 'xc'), y1 = await sel(c1, 'yc');
    T.check('comma_plotted_trace', x1 === 'Time (min)' && y1 === 'UV, 280 nm (mAU)', `x=${x1} y=${y1}`);

    // 2. Semicolon-delimited with decimal commas and an escaped quote in a heading
    await load('escaped_quote', ['"Time; min";"Sample ""A"" signal (mAU)";"pH; probe"', ...rows(40).map(r => r.map(v => v.replace('.', ',')).join(';'))].join('\n'));
    const c2 = card('escaped_quote');
    const o2 = await opts(c2, 'yc');
    T.check('semicolon_channels_intact', JSON.stringify(o2) === JSON.stringify(['Time; min', 'Sample "A" signal (mAU)', 'pH; probe']), `channels: ${JSON.stringify(o2)}`);
    const y2 = await sel(c2, 'yc');
    T.check('semicolon_plotted_trace', y2 === 'Sample "A" signal (mAU)', `y=${y2}`);

    // 3. An unquoted inch mark (odd quote count) still splits exactly as before
    await load('inch_mark', ['Time (min),Signal 1" cell (mAU),Cond', ...rows(40).map(r => r.join(','))].join('\n'));
    const o3 = await opts(card('inch_mark'), 'yc');
    T.check('unbalanced_quote_unchanged', JSON.stringify(o3) === JSON.stringify(['Time (min)', 'Signal 1" cell (mAU)', 'Cond']), `channels: ${JSON.stringify(o3)}`);
  });

  await T.t('akta-quoted-fractions-and-tidy-csv', async () => {
    const project = async name => { const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]); const file = path.join(__dirname, '..', 'results', name); await dl.saveAs(file); return JSON.parse(fs.readFileSync(file, 'utf8')); };
    await p.reload(); await h.wait(500); await h.newProject('quoted ÄKTA fractions');
    const quotedFractions = ['UV 1_280\t\tFraction\t', 'mL\tmAU\tmL\tFraction', '0\t1\t0\t" ""F1"""', '1\t2\t1\t" ""F2"""', '2\t1\t2\t" ""F3"""'].join('\n');
    await p.setInputFiles('#file', {name: 'quoted_fractions.asc', mimeType: 'text/plain', buffer: Buffer.from(quotedFractions)}); await h.wait(700);
    let d = await project('quoted_fractions.json'), r = (d.runs || []).find(x => x.file === 'quoted_fractions');
    T.check('akta_fraction_label_unquoted', !!r && JSON.stringify(r.fracs.map(f => f.label)) === JSON.stringify(['F1', 'F2', 'F3']), JSON.stringify(r && r.fracs));

    await p.reload(); await h.wait(500); await h.newProject('tidy ÄKTA CSV');
    const tidy = ['mL,CV,Channel,Value', '0,0,UV280,1', '0,0,Cond,5', '0,0,Conc B,0', '1,1,UV280,2', '1,1,Cond,6', '1,1,Conc B,25', '2,2,UV280,1', '2,2,Cond,7', '2,2,Conc B,50'].join('\n');
    await p.setInputFiles('#file', {name: 'tidy_akta.csv', mimeType: 'text/csv', buffer: Buffer.from(tidy)}); await h.wait(700);
    d = await project('tidy_akta.json'); r = (d.runs || []).find(x => x.file === 'tidy_akta');
    T.check('tidy_akta_pivots_uv_and_cond', !!r && r.uvs.length === 1 && !!r.cond && r.uvs[0].xs.length === 3 && r.cond.xs.length === 3, JSON.stringify(r && {uvs: r.uvs, cond: r.cond, grad: r.grad}));
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
