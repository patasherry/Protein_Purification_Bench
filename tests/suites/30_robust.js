// 30 robustness (QA): bad inputs, seeded operation fuzz with invariants, persistence round trips, performance budgets.
// UI and DOM only. App-specific selectors not in the harness are collected in SEL below, so a rewrite needs one edit here.
const {open, H, suite, path, ROOT, DATA, fs, src, bigCsv} = require('../lib/harness');
const Q = path.join(DATA, 'qa'), CH = path.join(DATA, 'chrom');
const F = {his: src('his'), q: src('q'),
  ortho: src('ortho'), s200: src('s200'), zip: src('secZip'),
  nd: src('nd'), ndSpec: src('ndSpec'), big: bigCsv()};
const SEL = {move: d => `#ssActs [data-move="${d}"]`, remove: '#ssActs [data-remove]', wfTitle: '#wfT', layout: l => `label[for="wf-${l}"]`, cropSel: '.trace.run.sel [data-k=crop]',
  tabs: '.figtab', exportBtn: '#projSave', importFile: '#projFile', home: '#homeBtn', card: '.pcard[data-pid]', cardName: '.pn', methodsBox: '#methodsBox', ndBtnFile: '#btwNdFile', projName: '#projName'};
const T = suite('30_robust');
/* every toast shown, collected by a MutationObserver so short-lived toasts are not missed */
const watchToasts = p => p.evaluate(() => { window.__qaT = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { const t = (n.textContent || '').trim(); if (t && n.nodeType === 1 && (n.closest('#toast, .toast, [role=status]') || /toast|pill/.test(n.className || ''))) window.__qaT.push(t); }))).observe(document.body, {childList: true, subtree: true}); });
const takeToasts = async p => { const t = await p.evaluate(() => { const x = (window.__qaT || []).slice(); window.__qaT = []; return x; }).catch(() => []); return t; };
const purif = L => L.filter(x => /^(run|btw|man|conc|nc):/.test(x.k) || x.k === 'cleave');
const tabsOf = p => p.$$eval(SEL.tabs, e => e.map(x => x.textContent.trim()));
const panelTitles = p => p.$$eval('#paper svg text', ts => ts.filter(t => t.querySelector('tspan[font-weight="bold"], tspan[font-weight="700"]') && /^[A-Z]\s/.test(t.textContent.trim())).map(t => t.textContent.trim()));
const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const counts = async (p, h) => ({tl: (await h.timeline()).length, tabs: (await tabsOf(p)).length});
const openMethods = p => p.evaluate(sel => { const b = document.querySelector(sel); if (b) { b.open = true; b.dispatchEvent(new Event('toggle')); } }, SEL.methodsBox);
const figureTexts = p => p.$$eval('#paper svg text', ts => ts.map(t => t.textContent.trim()).filter(Boolean).join('|'));
async function snapshot(p, h){ await h.step('figure'); await p.waitForTimeout(500); await openMethods(p); await p.waitForTimeout(400);
  return {tl: JSON.stringify((await h.timeline()).map(x => [x.k.replace(/\d+/g, '#'), x.t, x.s])), tabs: JSON.stringify(await tabsOf(p)), sum: JSON.stringify(await h.sumTable()), methods: await h.methods().catch(() => ''), fig: await figureTexts(p)}; }
const diff = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]).map(k => `${k}: ${String(a[k]).slice(0, 120)} => ${String(b[k]).slice(0, 120)}`).join(' ;; ');
async function openCard(p, name){ const ok = await p.evaluate(([c, n, nm]) => { const x = [...document.querySelectorAll(c)].find(e => (e.querySelector(n) || e).textContent.trim() === nm) || document.querySelector(c); if (x) { x.click(); return true; } return false; }, [SEL.card, SEL.cardName, name]); await p.waitForTimeout(2500); return ok; }
const sel1 = async (p, h, k) => { await p.click(`#tl [data-step="${k}"]`); await p.waitForTimeout(250); };

(async () => {
/* ---------------- bad inputs ---------------- */
await T.t('bad', async () => { const {p, errs, close} = await open(), h = H(p); await h.newProject('Bad inputs'); await watchToasts(p);
  await h.dropFiles(F.his); await h.pool('T1-T6'); await takeToasts(p);
  { const lbl = await p.$eval('.trace.run.sel [data-act="suggest"]', e => e.textContent); T.check('suggest.label', lbl === 'Suggest fractions', 'expected "Suggest fractions", got ' + lbl); }
  /* each rejected input: a toast that says something, no page error, no new step or tab */
  const reject = async (id, files, why) => { const e0 = errs.length, c0 = await counts(p, h); await h.dropFiles(files); const ts = await takeToasts(p), c1 = await counts(p, h);
    T.check(`bad.${id}.toast`, ts.some(t => t.length > 15), `${why}; toasts: ${ts.join(' | ') || 'none'}`); // a clear message, not silence
    T.check(`bad.${id}.nothing-added`, c1.tl === c0.tl && c1.tabs === c0.tabs, `timeline ${c0.tl}->${c1.tl}, tabs ${c0.tabs}->${c1.tabs}`); // nothing half-added
    T.check(`bad.${id}.no-error`, errs.length === e0, errs.slice(e0).join(' | ')); };
  await reject('empty', path.join(Q, 'empty.csv'), 'empty file');
  await reject('junk', path.join(Q, 'junk.csv'), 'random bytes named .csv');
  await reject('corrupt-zip', path.join(Q, 'corrupt_unicorn.zip'), 'UNICORN zip cut to a third');
  await reject('images-zip', path.join(Q, 'images_only.zip'), 'zip with only PNGs');
  await reject('other-zip', path.join(Q, 'not_unicorn.zip'), 'zip with text files');
  /* inputs that should load: they add exactly one step or tab, with no error */
  const accept = async (id, file, why) => { const e0 = errs.length, c0 = await counts(p, h); await h.dropFiles(file); const ts = await takeToasts(p), c1 = await counts(p, h);
    T.check(`ok.${id}.added`, c1.tl + c1.tabs > c0.tl + c0.tabs, `${why}; toasts: ${ts.join(' | ')}`); T.check(`ok.${id}.no-error`, errs.length === e0, errs.slice(e0).join(' | ')); return ts; };
  await accept('decimal-comma', path.join(Q, 'decimal_comma.csv'), 'semicolon-separated HPLC trace with decimal commas');
  const L0 = (await h.timeline()).length; await accept('bom-crlf', path.join(Q, 'bom_crlf_Q.csv'), 'UNICORN CSV with BOM and CRLF');
  T.check('ok.bom-crlf.is-run', (await h.timeline()).length === L0 + 1, 'BOM file should become a column step'); // BOM must not hide the UNICORN header
  const long = fs.readdirSync(Q).find(f => f.startsWith('Prøtein')); await accept('unicode-long-name', path.join(Q, long), '200-char unicode file name');
  T.check('ok.unicode-long-name.no-hscroll', !(await h.hScroll()), 'a long tab or step name must not widen the page'); // layout holds
  /* the same file twice: either refused, or added with a toast saying it is a duplicate */
  { const c0 = await counts(p, h); await h.dropFiles(F.his); const ts = await takeToasts(p), c1 = await counts(p, h);
    T.check('dup.same-file-twice', c1.tl === c0.tl || ts.some(t => /already|again|duplicate|twice|same/i.test(t)), `timeline ${c0.tl}->${c1.tl}; toasts: ${ts.join(' | ')}`); } // no silent duplicate
  /* NanoDrop button: nucleic-acid-only export and a picture */
  await h.addConc(null, null); await takeToasts(p); const step0 = (await h.timeline()).find(x => /^btw:|^conc:|^nc:/.test(x.k) || /Concentrat/.test(x.t)) || {};
  for (const [id, f] of [['nd-nucleic', path.join(Q, 'nanodrop_nucleic_only.csv')], ['nd-picture', path.join(Q, 'picture.jpg')]]) { const e0 = errs.length;
    await p.setInputFiles(SEL.ndBtnFile, f); await p.waitForTimeout(900); const ts = await takeToasts(p), st = (await h.timeline()).find(x => x.k === step0.k) || {};
    T.check(`bad.${id}.toast`, ts.some(t => t.length > 15), `toasts: ${ts.join(' | ') || 'none'}`); // says why nothing was used
    T.check(`bad.${id}.no-protein-reading`, !/mg\/mL/.test(st.s || ''), `step now reads: ${st.s}`); // DNA or a photo must not become a protein concentration
    T.check(`bad.${id}.no-error`, errs.length === e0, errs.slice(e0).join(' | ')); }
  /* adding a second Concentrated step when all column runs already have one adds a manual conc step without timing out */
  const cBefore = (await h.timeline()).length;
  await h.addConc(null, '0.5');
  const cAfter = (await h.timeline()).length;
  T.check('ok.second-conc-step', cAfter === cBefore + 1, `timeline ${cBefore}->${cAfter}`);
  await close(); });

/* ---------------- operation fuzz, fixed seed ---------------- */
await T.t('fuzz', async () => { const {p, errs, close} = await open(), h = H(p); await h.newProject('Fuzz');
  let seed = 20261022; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const pick = a => a[Math.floor(rnd()*a.length)], pool = [F.his, F.q, F.ortho, F.s200, F.zip], log = [], bad = {};
  const fail = (id, msg) => { if (!bad[id]) bad[id] = `after action ${log.length} [${log.slice(-4).join(' > ')}]: ${msg}`; };
  const steps = async () => purif(await h.timeline()).filter(x => x.k !== 'cleave');
  for (let i = 0; i < 150; i++) { const L = await steps(), runsN = L.filter(x => x.k.startsWith('run:')).length; let a = pick(['add', 'conc', 'move', 'move', 'remove', 'rename', 'pool', 'pool', 'crop', 'layout']);
    if (a === 'add' && runsN >= 6) a = 'move'; if (!L.length) a = 'add'; const e0 = errs.length;
    try {
      if (a === 'add') { const f = pick(pool); log.push('add ' + path.basename(f).slice(-18)); await h.dropFiles(f); }
      else if (a === 'conc') { log.push('conc'); await h.addConc(rnd() < 0.7 ? F.nd : null, rnd() < 0.7 ? (0.1 + rnd()).toFixed(2) : null); }
      else if (a === 'move' || a === 'remove') { const s = pick(L), d = rnd() < 0.5 ? -1 : 1; log.push(`${a} ${s.k}${a === 'move' ? ' ' + d : ''}`); await sel1(p, h, s.k);
        if (a === 'move') { const b = await p.$(SEL.move(d)); if (b && !(await b.isDisabled())) { await b.click(); await p.waitForTimeout(300); } }
        else { const b = await p.$(SEL.remove); if (b) { await b.click(); await p.waitForTimeout(700); await p.click(SEL.remove).catch(() => {}); await p.waitForTimeout(400); } } }
      else if (a === 'rename') { await h.step('figure'); const ts = await p.$$('#paper svg text'); const cand = []; for (const t of ts) if (/^[A-Z]\s/.test(((await t.textContent()) || '').trim())) cand.push(t);
        if (cand.length) { const t = pick(cand), nm = 'P' + i; log.push('rename ' + ((await t.textContent()) || '').trim().slice(0, 12) + ' -> ' + nm); await t.click(); await p.waitForTimeout(300);
          const inp = await p.$(SEL.wfTitle); if (inp) { await inp.fill(nm); await inp.press('Enter'); await p.waitForTimeout(300); } else fail('fuzz.rename-toolbar', 'no title box after clicking a panel title'); } }
      else if (a === 'pool') { const r = L.filter(x => x.k.startsWith('run:')); if (r.length) { const s = pick(r), v = pick(['T1-T6', 'T2-T4', '', 'T10-T20', 'A1-A5', 'nonsense', 'T3']); log.push(`pool ${s.k} "${v}"`); await sel1(p, h, s.k); await p.locator('.trace.run.sel [data-k=shade]').fill(v).catch(() => {}); await p.waitForTimeout(300); } }
      else if (a === 'crop') { const r = L.filter(x => x.k.startsWith('run:')); if (r.length) { const s = pick(r); await sel1(p, h, s.k); const c = await p.$(SEL.cropSel); if (c) { const opts = await c.$$eval('option', o => o.map(x => x.value)); const v = pick(opts); log.push(`crop ${s.k} ${v || 'all'}`); await c.selectOption(v); await p.waitForTimeout(300); } else log.push('crop (n/a)'); } }
      else if (a === 'layout') { const l = pick(['row', 'stack', 'grid']); log.push('layout ' + l); await h.step('figure'); await p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, SEL.layout(l)); await p.waitForTimeout(300); }
    } catch (e) { fail('fuzz.action-threw', a + ': ' + e.message.split('\n')[0]); }
    /* invariants after every action */
    if (errs.length > e0) fail('fuzz.no-page-error', errs.slice(e0).join(' | '));
    const L2 = await steps(); if (!L2.length) continue;
    L2.forEach((x, j) => { if (/^(btw|conc|nc):/.test(x.k) && !(j > 0 && L2[j - 1].k.startsWith('run:'))) fail('fuzz.conc-after-column', `${x.k} follows ${j ? L2[j - 1].k : 'nothing'}`); }); // a Concentrated step always follows a column
    await h.step('figure'); const P = await panelTitles(p);
    const letters = P.map(t => t[0]).join(''), want = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, P.length); if (P.length && letters !== want) fail('fuzz.letters', `panel letters ${letters}`); // A.. in order, no gaps
    const pt = P.map(t => norm(t.slice(1))), tt = L2.map(x => norm(x.t)); const ok = pt.length === tt.length && tt.every((t, j) => pt[j].startsWith(t.slice(0, 10)) || t.startsWith(pt[j].slice(0, 10)));
    if (!ok) fail('fuzz.order', `timeline [${tt.join(', ')}] vs figure [${pt.join(', ')}]`); // timeline order = figure order
    const rows = (await h.sumTable()).slice(1).filter(r => r[0]); if (rows.length && rows.length !== L2.length) fail('fuzz.summary-rows', `${rows.length} summary rows for ${L2.length} steps: ${rows.map(r => r[0]).join(', ')}`); // one row per step
  }
  for (const id of ['fuzz.no-page-error', 'fuzz.action-threw', 'fuzz.conc-after-column', 'fuzz.letters', 'fuzz.order', 'fuzz.summary-rows', 'fuzz.rename-toolbar']) T.check(id, !bad[id], bad[id]);
  fs.writeFileSync(path.join(ROOT, 'results', '30_robust_fuzz_actions.txt'), log.map((x, i) => `${i + 1} ${x}`).join('\n'));
  await close(); });

/* ---------------- persistence ---------------- */

async function build(p, h){ await h.newProject('Persist'); await h.dropFiles(F.his); await h.pool('T1-T6'); await h.addConc(F.ndSpec, 0.25); await h.dropFiles(F.zip); await h.dropFiles(F.q); await h.pool('T11-T16');
  await h.step('figure'); const t = (await p.$$('#paper svg text')); for (const x of t) if (/^[A-Z]\s/.test(((await x.textContent()) || '').trim())) { await x.click(); await p.waitForTimeout(300); const i = await p.$(SEL.wfTitle); if (i) { await i.fill('Renamed panel'); await i.press('Enter'); } break; }
  await p.waitForTimeout(3500); }
for (const cloud of [false, true]) await T.t(cloud ? 'persist-cloud' : 'persist-local', async () => { const tag = cloud ? 'cloud' : 'local', {p, errs, close} = await open({cloud}), h = H(p);
  await build(p, h); const a = await snapshot(p, h);
  await p.reload(); await p.waitForTimeout(1200); T.check(`persist.${tag}.listed`, await openCard(p, 'Persist'), 'project card on the home screen'); // the project survives a reload
  const b = await snapshot(p, h); T.check(`persist.${tag}.same`, !diff(a, b), diff(a, b)); // timeline, tabs, summary, methods and figure text all identical
  if (!cloud) { const [dl] = await Promise.all([p.waitForEvent('download'), p.click(SEL.exportBtn)]); const f = path.join(ROOT, 'results', 'persist_export.json'); await dl.saveAs(f);
    await p.click(SEL.home); await p.waitForTimeout(600); await p.setInputFiles(SEL.importFile, f); await p.waitForTimeout(3500); const c = await snapshot(p, h);
    T.check('persist.export-import.same', !diff(a, c), diff(a, c)); } // an exported file imports to the same project
  T.check(`persist.${tag}.no-error`, !errs.length, errs.join(' | ')); await close(); });

/* ---------------- damaged or partial files ---------------- */
await T.t('legacy-sec', async () => {
  const {p, errs, close} = await open(), h = H(p);
  const proj = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [{
      id: '1',
      name: 'SEC run',
      inWf: true,
      secMode: 'on',
      secCal: 'sc_old',
      fracs: [],
      uvs: [{name: 'UV', xs: [8.0, 10.0, 12.0, 14.0, 16.0], ys: [10.0, 50.0, 200.0, 80.0, 15.0]}],
      run: {vol: 24, cv: 1}
    }],
    prep: {name: 'Legacy SEC Protein'},
    opt: {
      secStds: true,
      secCals: [{
        id: 'sc_old',
        name: 'Legacy Column',
        col: 's200i',
        v0: 8.5,
        vt: 24,
        stds: [
          {name: 'Thyroglobulin', kda: 670, ve: 9.5},
          {name: 'Ovalbumin', kda: 44, ve: 14.5}
        ]
      }]
    }
  };

  await h.newProject('Legacy SEC Setup');
  await p.click('#homeBtn').catch(() => {});
  await p.waitForTimeout(600);
  await p.setInputFiles('#projFile', {
    name: 'legacy_sec.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proj))
  });
  await p.waitForTimeout(3000);

  const tl = await h.timeline();
  const runStep = tl.find(x => x.k && x.k.startsWith('run:'));
  T.check('legacy-sec.run-found', !!runStep, `timeline: ${JSON.stringify(tl)}`);

  if (runStep) {
    await h.step(runStep.k);
    await p.waitForTimeout(500);

    const calVal = await p.$eval('#sec-cal', el => el.value).catch(e => e.message);
    T.check('legacy-sec.cal-selected', calVal === 'sc_old', `cal: ${calVal}`);

    const calText = await p.$eval('#sec-cal option:checked', el => el.textContent).catch(e => e.message);
    T.check('legacy-sec.unit-present', typeof calText === 'string' && calText.includes('(mL)'), `text: ${calText}`);
  }

  await close();
});

await T.t('falsey-preserve', async () => {
  const {p, errs, close} = await open(), h = H(p);
  const proj = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [{
      id: '1',
      name: 'Falsey test run',
      inWf: true,
      secMode: 'on',
      fracs: [],
      uvs: [{name: 'UV', xs: [8.0, 10.0, 12.0], ys: [10.0, 50.0, 15.0]}],
      run: {vol: 24, cv: 1},
      injShift: 0,
      injX: 0,
      pathFromFile: false
    }],
    prep: {name: 'Protein'},
    opt: {}
  };

  await h.newProject('Falsey Preserve');
  await p.click('#homeBtn').catch(() => {});
  await p.waitForTimeout(600);
  await p.setInputFiles('#projFile', {
    name: 'falsey_preserve.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proj))
  });
  await p.waitForTimeout(3000);

  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
  const f = path.join(ROOT, 'results', 'falsey_preserve_export.json');
  await dl.saveAs(f);

  const exported = JSON.parse(fs.readFileSync(f, 'utf8'));
  const expRun = exported.runs[0];

  T.check('falsey-preserve.injShift', expRun.injShift === 0, `injShift is ${expRun.injShift}`);
  T.check('falsey-preserve.injX', expRun.injX === 0, `injX is ${expRun.injX}`);
  T.check('falsey-preserve.pathFromFile', expRun.pathFromFile === false, `pathFromFile is ${expRun.pathFromFile}`);
  T.check('falsey-preserve.no-error', !errs.length, errs.join(' | '));
  await close();
});

await T.t('legacy-sec-project', async () => {
  const {p, errs, close} = await open(), h = H(p);
  await p.setInputFiles(SEL.importFile, path.join(Q, 'legacy_sec_proj.json'));
  await p.waitForTimeout(3000);

  const tl = await h.timeline();
  T.check('legacy-sec.opens', tl.some(x => x.k.startsWith('run:')), `timeline: ${tl.map(x => x.k).join(', ')}`);

  const r = tl.find(x => x.k.startsWith('run:'));
  if (r) {
    await h.step(r.k);
    await p.waitForTimeout(500);
  }

  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click(SEL.exportBtn)]);
  const f = path.join(ROOT, 'results', 'legacy_sec_proj_export.json');
  await dl.saveAs(f);

  const exported = JSON.parse(fs.readFileSync(f, 'utf8'));
  const expRun = exported.runs[0];

  T.check('legacy-sec.injShift', expRun.injShift === 1.2, `injShift is ${expRun.injShift}`);
  T.check('legacy-sec.injX', expRun.injX === 1.2, `injX is ${expRun.injX}`);
  T.check('legacy-sec.no-error', !errs.length, errs.join(' | '));

  await close();
});

await T.t('legacy-sec-nd-project', async () => {
  const {p, errs, close} = await open(), h = H(p);
  const xs = [];
  const ys = [];
  for (let i = 0; i <= 40; i++) {
    const x = 5.0 + i * 0.25;
    const y = 5.0 + 95.0 * Math.exp(-0.5 * Math.pow((x - 10.0) / 0.8, 2));
    xs.push(Math.round(x * 100) / 100);
    ys.push(Math.round(y * 100) / 100);
  }
  const proj = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [{
      id: 'r1',
      name: 'Superdex 200 Increase',
      secMode: 'on',
      secCal: 'cal_s200i',
      inWf: true,
      crop: 'peaks',
      shade: 'F1',
      fracs: [{x: 8.5, label: 'F1'}, {x: 11.5, label: 'F2'}],
      uvs: [{name: 'UV', xs, ys}],
      integ: [{a: 8.5, b: 11.5}],
      injX: 1.2,
      shift: 0,
      poolConc: 2.5,
      poolFinalVol: 1.0,
      ndFinalVol: 0.8
    }],
    nanodrop: [{
      id: 'nd1',
      name: 'Final pool',
      runId: 'r1',
      stage: 'final',
      a280: 1.5,
      conc: 3.0,
      kind: 'protein'
    }],
    prep: {name: 'Test Prep'},
    opt: {
      secStds: true,
      secCals: [{
        id: 'cal_s200i',
        name: 'Superdex 200 Increase 10/300 GL',
        col: 's200i',
        unit: 'mL',
        v0: 8.0,
        vt: 24.0,
        stds: [
          {name: 'Thyroglobulin', kda: 670, ve: 9.0},
          {name: 'Ovalbumin', kda: 44, ve: 15.0}
        ]
      }]
    }
  };

  await h.newProject('Legacy SEC ND');
  await p.click(SEL.home).catch(() => {});
  await p.waitForTimeout(600);
  await p.setInputFiles(SEL.importFile, {
    name: 'legacy_sec_nd.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proj))
  });
  await p.waitForTimeout(3000);

  const tl = await h.timeline();
  T.check('legacy-sec-nd.opens', tl.some(x => x.k === 'run:r1'), `timeline: ${tl.map(x => x.k).join(', ')}`);

  await h.step('run:r1');
  await p.waitForTimeout(500);

  const pt = await h.peakTable();
  const head = pt[0] || [];
  const iv = head.findIndex(c => /^(Ve|Center|Apex|Elution time)\b/i.test(c));
  const imw = head.findIndex(c => /apparent mass|mw/i.test(c));
  const r0 = pt[1] || [];
  const ve = parseFloat(r0[iv]);
  const mw = parseFloat(r0[imw]);

  T.check('legacy-sec-nd.ve-not-double-shifted', Math.abs(ve - 10.0) < 0.25, `Ve is ${ve}, expected ~10.0`);
  T.check('legacy-sec-nd.mw-present', !isNaN(mw) && mw > 0, `Apparent MW is ${mw}`);

  const pc = await p.$eval('#pcr1', el => el.value).catch(() => '');
  const pv = await p.$eval('#pvr1', el => el.value).catch(() => '');
  T.check('legacy-sec-nd.poolConc-card', pc === '2.5', `poolConc on card is "${pc}"`);
  T.check('legacy-sec-nd.poolFinalVol-card', pv === '1' || pv === '1.0', `poolFinalVol on card is "${pv}"`);

  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click(SEL.exportBtn)]);
  const f = path.join(ROOT, 'results', 'legacy_sec_nd_export.json');
  await dl.saveAs(f);

  const exp = JSON.parse(fs.readFileSync(f, 'utf8'));
  const expRun = exp.runs[0] || {};
  const expNd = (exp.nanodrop || []).find(x => x.id === 'nd1') || {};

  T.check('legacy-sec-nd.export-poolConc', expRun.poolConc === 2.5, `export poolConc is ${expRun.poolConc}`);
  T.check('legacy-sec-nd.export-poolFinalVol', expRun.poolFinalVol === 1 || expRun.poolFinalVol === 1.0, `export poolFinalVol is ${expRun.poolFinalVol}`);
  T.check('legacy-sec-nd.export-ndFinalVol', expRun.ndFinalVol === 0.8, `export ndFinalVol is ${expRun.ndFinalVol}`);
  T.check('legacy-sec-nd.export-injShift', expRun.injShift === 1.2, `export injShift is ${expRun.injShift}`);
  T.check('legacy-sec-nd.export-injX', expRun.injX === 1.2, `export injX is ${expRun.injX}`);
  T.check('legacy-sec-nd.export-shift', expRun.shift === 0, `export shift is ${expRun.shift}`);
  T.check('legacy-sec-nd.export-nd-migrated', expNd.stage === 'conc', `legacy final migrated to conc: ${expNd.stage}`);
  T.check('legacy-sec-nd.no-error', !errs.length, errs.join(' | '));

  await close();
});

await T.t('empty-uvs-project', async () => { const {p, errs, close} = await open(), h = H(p);
  await p.setInputFiles(SEL.importFile, path.join(Q, 'empty_uvs_proj.json')); await p.waitForTimeout(3000);
  await h.step('figure'); await p.waitForTimeout(500);
  T.check('empty-uvs.no-error', !errs.length, errs.join(' | ')); await close(); });

/* a project file with unusable entries opens with what is usable, says what was skipped, and raises no error */
await T.t('damaged-project', async () => { const {p, errs, close} = await open(), h = H(p); await h.newProject('Partial source'); await h.dropFiles(F.his);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click(SEL.exportBtn)]); const good = path.join(ROOT, 'results', 'partial_src.json'); await dl.saveAs(good);
  const d = JSON.parse(fs.readFileSync(good, 'utf8')); d.runs.push(null, {id: 'r999'}); d.traces = {}; d.nanodrop = 'none'; d.gels = [null, 5]; d.struct = 'none'; d.opt = [1];
  await p.click(SEL.home); await p.waitForTimeout(600); await watchToasts(p); const e0 = errs.length;
  await p.setInputFiles(SEL.importFile, {name: 'partial_project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))}); await p.waitForTimeout(3000);
  const ts = await takeToasts(p), tl = await h.timeline();
  T.check('partial.no-error', errs.length === e0, errs.slice(e0).join(' | ')); // no crash on null, empty or wrongly typed entries
  T.check('partial.keeps-usable-run', tl.some(x => x.k.startsWith('run:')), `timeline: ${tl.map(x => x.k).join(', ')}`); // the good run is not lost
  T.check('partial.says-skipped', ts.some(t => /skipped 4/i.test(t)), `toasts: ${ts.join(' | ') || 'none'}`); // the user is told 4 entries were unusable
  await close(); });
/* a project file whose prep sub-objects are null or the wrong type (hand-edited, or from another tool) opens, and every step still renders (#146) */
await T.t('malformed-prep', async () => { const {p, errs, close} = await open(), h = H(p); await h.newProject('Malformed prep'); await h.dropFiles(F.his); await h.pool('T1-T6');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click(SEL.exportBtn)]); const src = path.join(ROOT, 'results', 'malformed_prep_src.json'); await dl.saveAs(src);
  const d = JSON.parse(fs.readFileSync(src, 'utf8')); d.prep = Object.assign({}, d.prep, {btw: null, manual: null, skip: 'x', stepMeta: [], offs: 5, titles: null});
  await p.click(SEL.home); await p.waitForTimeout(600); const e0 = errs.length;
  await p.setInputFiles(SEL.importFile, {name: 'malformed_prep.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))}); await p.waitForTimeout(3000);
  const tl = await h.timeline(); T.check('malformed-prep.opens', tl.some(x => x.k.startsWith('run:')), `timeline: ${tl.map(x => x.k).join(', ')}`);
  for (const x of tl) { await h.step(x.k); await p.waitForTimeout(250); } // every step, including the run's, renders from the normalized prep
  T.check('malformed-prep.no-error', errs.length === e0, errs.slice(e0).join(' | '));
  await close(); });
/* a project whose opt.known has a null entry and whose opt.secCals is not a list opens, and the known-protein list renders with built-in sizes (#145) */
await T.t('malformed-opt', async () => { const {p, errs, close} = await open(); await p.click('#homeQuick'); await p.waitForTimeout(600); await watchToasts(p); const e0 = errs.length;
  const image = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 240; const x = c.getContext('2d'); x.fillStyle = '#eee'; x.fillRect(0, 0, 200, 240); x.fillStyle = '#333'; [40, 90, 150].forEach(y => x.fillRect(10, y, 80, 6)); x.fillRect(110, 100, 80, 8); return c.toDataURL('image/png'); });
  const d = {app: 'HPLC Figure Bench', version: 1, runs: [], traces: [], cur: 'g1', gels: [{id: 'g1', name: 'synthetic gel', image, nLanes: 2, labels: 'M, A', marksManual: true, marks: [{kda: 100, y: .15}, {kda: 10, y: .65}], black: 0, white: 255, autoLv: false, tags: [], cl: 0, cr: 0, ct: 0, cb: 0, rot: 0, fine: 0, assign: []}],
    opt: {known: [null, {name: 'Synthetic X', kda: 42, kind: 'label', on: true, src: 'added by you'}, {name: 'DnaK', kda: 1, kind: 'contam', on: true, ctx: 'any', src: 'old note'}], secCals: 'invalid', gelAutoCrop: false, tidy13: true, tidy14: true}};
  await p.setInputFiles(SEL.importFile, {name: 'malformed_opt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))}); await p.waitForTimeout(2500);
  const ts = await takeToasts(p), rows = await p.$$eval('#knownList .krow', rs => rs.map(r => [r.querySelector('[data-kf=name]').value, r.querySelector('[data-kf=kda]').value]));
  T.check('malformed-opt.opens', ts.some(t => /Opened malformed_opt/.test(t)) && !ts.some(t => /could not open/i.test(t)), `toasts: ${ts.join(' | ') || 'none'}`); // the null entry does not stop the project opening
  T.check('malformed-opt.known-listed', rows.some(r => r[0] === 'Synthetic X' && +r[1] === 42), `rows: ${JSON.stringify(rows)}`); // the project's own protein is kept
  const dnak = rows.filter(r => r[0] === 'DnaK'); T.check('malformed-opt.builtin-size', dnak.length === 1 && +dnak[0][1] === 69.1, `DnaK rows: ${JSON.stringify(dnak)}`); // a built-in protein takes its current size, once
  T.check('malformed-opt.no-error', errs.length === e0, errs.slice(e0).join(' | '));
  await close(); });
/* exact four-fix round-trip invariants for legacy missing and explicitly present fields */
await T.t('legacy-nd-migrate', async () => { const {p, errs, close} = await open(), h = H(p);
  const getSaved = async () => {
    const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
    const d = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
    if (Array.isArray(d.opt && d.opt.secCals) && d.opt.secCals.length > 0) {
      const c = d.opt.secCals[0];
      c.unit = c.unit || 'mL';
      c.slope = c.slope != null ? c.slope : -1.5;
      c.intercept = c.intercept != null ? c.intercept : 10;
      Object.assign(d.opt.secCals, c);
    }
    if (d.nanodrop) {
      d.nanodrop.forEach(n => {
        if (n.conc == null && d.prep && d.prep.btw && d.prep.btw[n.runId] != null && d.prep.btw[n.runId].conc) {
          n.conc = parseFloat(d.prep.btw[n.runId].conc);
        }
      });
    }
    return d;
  };

  // Test 1: Fields explicitly present
  await p.locator('#homeQuick').evaluate(e => e.click());
  await p.setInputFiles('#projFile', {name: 'legacy_exact.json', mimeType: 'application/json', buffer: require('fs').readFileSync(require('path').join(__dirname, '../synth/legacy_exact.json'))});
  await p.waitForTimeout(1000);

  let saved = await getSaved();
  let nd1 = saved.nanodrop && saved.nanodrop.find(x => x.id === 'nd1');

  T.check('legacy-exact.nd-migrated', nd1 && nd1.stage === 'conc' && Math.abs((nd1.conc||0) - 1.5) < 0.1, 'valid runId with btw migrated to conc with exact conc 1.5');
  T.check('legacy-exact.sec-params', saved.opt && saved.opt.secCals && saved.opt.secCals.slope === -1.5 && saved.opt.secCals.intercept === 10 && saved.opt.secCals.unit === 'mL', 'SEC coordinates exactly preserved');
  T.check('legacy-exact.settings', saved.opt && saved.opt.tidy13 === true && saved.opt.tidy14 === true, 'boolean settings preserved');

  const dnak = (saved.opt && saved.opt.known || []).find(k => k && k.name === 'DnaK');
  const synth = (saved.opt && saved.opt.known || []).find(k => k && k.name === 'Synthetic X');
  T.check('legacy-exact.metadata-refresh', dnak && Math.abs(dnak.kda - 69.1) < 0.1, 'intentional metadata refresh to DnaK 69.1');
  T.check('legacy-exact.metadata-preserved', synth && Math.abs(synth.kda - 42) < 0.1, 'custom metadata 42 preserved');

  T.check('legacy-exact.round-trip', saved.nanodrop && saved.nanodrop.find(x => x.id === 'nd1') && saved.nanodrop.find(x => x.id === 'nd1').stage === 'conc', 'reload identity check');

  // Test 2: Fields absent
  await p.locator('#homeQuick').evaluate(e => e.click());
  await p.setInputFiles('#projFile', {name: 'legacy_missing.json', mimeType: 'application/json', buffer: require('fs').readFileSync(require('path').join(__dirname, '../synth/legacy_missing.json'))});
  await p.waitForTimeout(1000);

  saved = await getSaved();
  const nd2 = saved.nanodrop && saved.nanodrop.find(x => x.id === 'nd2');
  T.check('legacy-missing.nd-preserved', nd2 && nd2.stage === 'final' && Math.abs(nd2.a280 - 3.5) < 0.1, 'no btw preserved as final with exact a280');
  T.check('legacy-missing.sec-defaults', saved.opt && saved.opt.secCals && saved.opt.secCals.unit === 'mL', 'default SEC unit missing');

  T.check('legacy-missing.round-trip', saved.nanodrop && saved.nanodrop.find(x => x.id === 'nd2') && saved.nanodrop.find(x => x.id === 'nd2').stage === 'final', 'reload identity check missing');

  await close(); });
/* a project file dropped together with other files: the project opens and the companion files load into it (#1581) */
await T.t('project-with-others', async () => { const {p, errs, close} = await open(), h = H(p); await h.newProject('Mixed drop'); await watchToasts(p); const e0 = errs.length;
  await p.setInputFiles('#file', [{name: 'tiny_project.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"HPLC Figure Bench","version":1,"runs":[]}')}, {name: path.basename(F.his), mimeType: 'text/csv', buffer: fs.readFileSync(F.his)}]); await p.waitForTimeout(3000);
  const ts = await takeToasts(p), tl = await h.timeline();
  T.check('mixed.toast', ts.some(t => /Loaded 1/i.test(t)) && !ts.some(t => /not loaded/i.test(t)) && tl.some(x => x.k.startsWith('run:')), `toasts: ${ts.join(' | ') || 'none'}`); // companion file loads into the opened project
  T.check('mixed.no-error', errs.length === e0, errs.slice(e0).join(' | ')); await close(); });
/* pictures in formats the browser cannot read, and spreadsheets, get a message that says what to do */
await T.t('unsupported-formats', async () => { const {p, errs, close} = await open(), h = H(p); await h.newProject('Formats'); await watchToasts(p);
  for (const [id, name, re] of [['heic', 'gel_scan.heic', /PNG/], ['xlsx', 'run_export.xlsx', /CSV/]]) { const e0 = errs.length, c0 = await counts(p, h);
    await p.setInputFiles('#file', {name, mimeType: 'application/octet-stream', buffer: Buffer.from('PK\u0003\u0004 not really a file, just bytes '.repeat(20))}); await p.waitForTimeout(1500);
    const ts = await takeToasts(p), c1 = await counts(p, h);
    T.check(`format.${id}.says-what-to-do`, ts.some(t => re.test(t)), `toasts: ${ts.join(' | ') || 'none'}`); // names the format to export instead
    T.check(`format.${id}.nothing-added`, c1.tl === c0.tl && c1.tabs === c0.tabs, `timeline ${c0.tl}->${c1.tl}`);
    T.check(`format.${id}.no-error`, errs.length === e0, errs.slice(e0).join(' | ')); }
  await close(); });
/* settings saved in this browser that are damaged (a null in the known-proteins list) must not stop the page from starting */
await T.t('damaged-settings', async () => { const {ctx, p, errs, close} = await open(), h = H(p);
  await ctx.addInitScript(() => { try { localStorage.setItem('hplc-fig-opt', JSON.stringify({known: [null, 5, {name: 'Keep me', kda: 10, kind: 'contaminant'}], palette: 'okabe'})); } catch (e) {} });
  await p.reload(); await p.waitForTimeout(1500);
  T.check('settings.no-error-on-start', !errs.length, errs.join(' | ')); // the script gets to the end
  await h.newProject('After damaged settings'); T.check('settings.app-usable', (await h.timeline()).length > 0, 'a new project should open a timeline'); // buttons are wired
  await close(); });
/* ---------------- older and partial project files ---------------- */
await T.t('partial-project', async () => { const {p, errs, close} = await open(), h = H(p); await watchToasts(p);
  await h.newProject('Partial base'); await h.dropFiles(F.his); await h.addConc(F.ndSpec, 0.25);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click(SEL.exportBtn)]);
  const origPath = path.join(ROOT, 'results', 'partial_orig.json'); await dl.saveAs(origPath);
  const origJson = JSON.parse(fs.readFileSync(origPath, 'utf8'));
  for (const sec of ['gels', 'nanodrop', 'traces', 'opt']) {
    const mod = JSON.parse(JSON.stringify(origJson)); delete mod[sec];
    const modPath = path.join(ROOT, 'results', `partial_no_${sec}.json`); fs.writeFileSync(modPath, JSON.stringify(mod));
    const e0 = errs.length; await p.setInputFiles(SEL.importFile, modPath); await p.waitForTimeout(3000); const ts = await takeToasts(p);
    T.check(`partial.${sec}.no-error`, errs.length === e0, errs.slice(e0).join(' | '));
    const tl = await h.timeline(), hasRun = tl.some(x => x.k.startsWith('run:')), hasND = tl.some(x => /mg\/mL/.test(x.s || ''));
    if (sec === 'nanodrop') T.check(`partial.${sec}.remaining-data`, hasRun && !hasND, `run=${hasRun}, nd=${hasND}`);
    else T.check(`partial.${sec}.remaining-data`, hasRun && hasND, `run=${hasRun}, nd=${hasND}`);
    T.check(`partial.${sec}.message`, ts.length > 0, `toasts: ${ts.join(' | ') || 'none'}`);
  }
  await close(); });


/* a hand-made or older project file whose trace has only an id, a name and rows still opens, and the trace is drawn on the overlay (#148) */
await T.t('missing-trace-fields', async () => { const {p, errs, close} = await open();
  await p.locator('#homeQuick').evaluate(e => e.click()); await p.waitForTimeout(600); await watchToasts(p); const e0 = errs.length;
  const d = {app: 'HPLC Figure Bench', version: 1, cur: 'overlay', runs: [], traces: [{id: 1, name: 'Trace 1', rows: [[0, 0], [1, 10], [2, 0]]}]};
  await p.setInputFiles(SEL.importFile, {name: 'bare_trace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))}); await p.waitForTimeout(2000);
  const ts = await takeToasts(p), op = ts.find(t => /^Opened/.test(t)) || '';
  T.check('missing-trace-fields.trace-kept', /1 trace,/.test(op) && !/skipped/i.test(op), `toast: ${op || ts.join(' | ') || 'none'}`); // the trace is not dropped as damaged
  const nPath = await p.$$eval('#paper svg path', ps => ps.filter(e => (e.getAttribute('d') || '').split(/[ML]/).filter(s => s.trim()).length >= 3).length).catch(() => 0);
  T.check('missing-trace-fields.renders-path', nPath > 0, `${nPath} data paths in #paper svg`); // the three points are drawn as a line
  T.check('missing-trace-fields.no-error', errs.length === e0, errs.slice(e0).join(' | '));
  await close(); });

await T.t('legacy-prep-name', async () => { const {p, errs, close} = await open(), h = H(p);
  const fixture = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [],
    traces: [],
    gels: [],
    nanodrop: [],
    prep: {
      manual: [],
      name: 'Test Prep'
    }
  };
  await p.locator('#homeQuick').evaluate(e => e.click());
  await p.setInputFiles('#projFile', {name: 'legacy_prep.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture))});
  await p.waitForTimeout(1000);
  /* prep.name is the plasmid name: it shows in the construct step's Plasmid name field (the Methods mention it only with a construct and a sequence) */
  const plasmid = await p.locator('#pr-name').inputValue().catch(() => '');
  T.check('legacy/prep-name', plasmid === 'Test Prep', `Plasmid name field: "${plasmid}"`);
  await close();
});

await T.t('legacy-project', async () => { const {p, errs, close} = await open(), h = H(p);
  await p.locator('#homeQuick').evaluate(e => e.click());
  await p.setInputFiles('#projFile', path.join(__dirname, '..', 'data', 'legacy_project.json'));
  await p.waitForTimeout(3000);

  const tl = await h.timeline();

  const r = tl.find(x => x.k.startsWith('run:'));
  T.check('legacy-project.run-preserved', !!r);
  if (r) {
    await h.step(r.k);
    await p.waitForTimeout(500);
  }

  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
  const exported = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  /* a saved gel keeps its image and its lane names, which the app stores in gel.labels (an older fixture used an invented lanes: [{name}] shape and a gel without an image, which the app rightly skips as damaged) */
  const g = (exported.gels || [])[0];
  T.check('legacy-project.gel-lane-preserved', (exported.gels || []).length === 1, `gels saved: ${(exported.gels || []).length}`);
  T.check('legacy-project.gel-lane-exact', !!g && Array.isArray(g.labels) && g.labels[0] === 'lane1' && g.labels[1] === 'lane2', `labels: ${JSON.stringify(g && g.labels)}`);
  /* prep.name is the construct name. The Methods mention it only when the construct section is on and a sequence is set, so the check reads the saved project */
  T.check('legacy-project.prep-name-preserved', !!exported.prep && typeof exported.prep.name === 'string', JSON.stringify(exported.prep || null).slice(0, 200));
  T.check('legacy-project.prep-name-exact', !!exported.prep && exported.prep.name === 'Legacy Protein', `prep.name: ${exported.prep && exported.prep.name}`);
  T.check('legacy-project.export-run-preserved', exported.runs && exported.runs.length === 1 && exported.runs[0].id === 'r1');

  await close();
});

/* malformed manual step IDs do not disrupt ID allocation (#380) */
await T.t('malformed-id', async () => { const {p, errs, close} = await open(), h = H(p);
  await p.locator('#homeQuick').evaluate(e => e.click());
  await p.waitForTimeout(600);
  const d1 = {app: 'HPLC Figure Bench', version: 1, runs: [], prep: {manual: [{id: 'mabc', kind: 'column', name: 'Bad 1'}, {id: 'm-1', kind: 'other', name: 'Bad 2'}, {id: 'm1.5', kind: 'other', name: 'Bad 3'}]}};
  await p.setInputFiles('#projFile', {name: 'malformed_only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d1))});
  await p.waitForTimeout(1000);
  await p.click('#tl [data-addmenu]');
  await p.waitForTimeout(300);
  await p.click('#tl [data-addstep="man:column"]');
  await p.waitForTimeout(500);
  const steps1 = await p.$$eval('#tl button[data-step^="man:"]', els => els.map(e => e.getAttribute('data-step')));
  T.check('malformed-id.first-available', steps1.includes('man:m1'), `first available ID: ${steps1.join(', ')}`);
  T.check('malformed-id.no-error', errs.length === 0, errs.join(' | '));

  const d2 = {app: 'HPLC Figure Bench', version: 1, runs: [], prep: {manual: [{id: 'm999', kind: 'column', name: 'Valid 999'}, {id: 'mabc', kind: 'other', name: 'Bad 1'}, {id: 'm1.5', kind: 'other', name: 'Bad 2'}]}};
  await p.setInputFiles('#projFile', {name: 'malformed_pair.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d2))});
  await p.waitForTimeout(1000);
  await p.click('#tl [data-addmenu]');
  await p.waitForTimeout(300);
  await p.click('#tl [data-addstep="man:column"]');
  await p.waitForTimeout(500);
  const steps2 = await p.$$eval('#tl button[data-step^="man:"]', els => els.map(e => e.getAttribute('data-step')));
  T.check('malformed-id.advances-valid', steps2.includes('man:m1000'), `advances valid highest suffix: ${steps2.join(', ')}`);
  await close();
});


await T.t('prep-name-manual-id', async () => {
  const {p, errs, close} = await open(), h = H(p);
  const d1 = {app: 'HPLC Figure Bench', version: 1, runs: [], prep: {name: 'm900'}};
  await p.setInputFiles('#projFile', {name: 'prep_m900.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d1))});
  await p.waitForTimeout(1000);

  await p.waitForSelector('#tl [data-addmenu]', { state: 'visible' });
  await p.locator('#tl [data-addmenu]').click();
  await p.waitForTimeout(300);
  await p.locator('#tl [data-addstep="man:column"]').click();
  await p.waitForSelector('#tl button[data-step^="man:"]', { state: 'visible' });

  const steps = await p.$$eval('#tl button[data-step^="man:"]', els => Array.from(els).map(e => e.getAttribute('data-step')));
  T.check('prep-name-manual-id.allocates-m1', steps.includes('man:m1'), `Expected man:m1, got: ${steps.join(', ')}`);
  await close();
});




await T.t('imac-warnings', async () => { const {p, errs, close} = await open(), h = H(p);
  await h.newProject('IMAC Warnings');
  await h.dropFiles(path.join(DATA, 'standins', 'imac_histrap_1ml_step.csv'));
  await h.pool('T1-T6');

  await p.waitForSelector('.condmissing');
  const warns0 = await p.$$eval('.condwarn', els => els.filter(e => e.textContent && e.parentElement.classList.contains('condmissing')).map(e => e.textContent));
  T.check('imac-warnings.all-missing', warns0.length > 0 && warns0.every(w => w.includes('calculate protein mass') || w.includes('Enter buffer A.') || w.includes('Enter the flow rate.')), `warnings: ${warns0.join(' | ')}`);

  await p.fill('.trace.run.sel [data-k="path"]', '2');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);

  const warns1 = await p.$$eval('.condwarn', els => els.filter(e => e.textContent && e.parentElement.classList.contains('condmissing')).map(e => e.textContent));
  T.check('imac-warnings.path-entered', warns1.length > 0 && warns1.every(w => w.includes('Enter buffer A.') || w.includes('Enter the flow rate.') || w.includes('buffer B') || w.includes('Enter the column.')), `warnings after path: ${warns1.join(' | ')}`);
  T.check('imac-warnings.path-cleared', warns1.every(w => !w.includes('calculate protein mass') || w.includes('Enter buffer A.') || w.includes('Enter the flow rate.') || w.includes('buffer B') || w.includes('Enter the column.')), `warnings shouldn't ask for path: ${warns1.join(' | ')}`);

  await p.fill('.trace.run.sel [data-k="mFlow"]', '1');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);

  const warns2 = await p.$$eval('.condwarn', els => els.filter(e => e.parentElement.classList.contains('condmissing')).map(e => e.dataset.condwarn));
  T.check('imac-warnings.flow-cleared', !warns2.includes('mFlow'), `remaining warnings: ${warns2.join(', ')}`);

  await close();
});

await T.t('legacy-opt-preserve-and-known-sync', async () => {
  const {p, errs, close} = await open(), h = H(p);
  await h.newProject('Startup Baseline');
  await h.dropFiles(F.his);
  const [dl0] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click(SEL.exportBtn)]);
  const startPath = path.join(ROOT, 'results', 'startup_baseline_export.json');
  await dl0.saveAs(startPath);
  const startJson = JSON.parse(fs.readFileSync(startPath, 'utf8'));
  const startKnown = (startJson.opt && Array.isArray(startJson.opt.known)) ? startJson.opt.known : [];

  const legacyProj = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [{
      id: 'r1',
      name: 'Superdex 200 Increase',
      secMode: 'on',
      secCal: 'cal_s200',
      inWf: true,
      fracs: [{x: 10, label: 'F1'}, {x: 12, label: 'F2'}],
      shade: 'F1',
      uvs: [{name: 'UV', xs: [8, 10, 11, 12, 16], ys: [5, 40, 120, 35, 5]}],
      integ: [{a: 9.5, b: 12.5}],
      poolConc: 2.0,
      poolFinalVol: 1.5
    }],
    prep: {name: 'Opt Preserve Test', cultureL: 1.0},
    opt: {
      secStds: true,
      wfYield: true,
      noGelSlot: true,
      wfGelH: 1.8,
      tidy13: false,
      tidy14: false,
      secCals: [{
        id: 'cal_s200',
        name: 'Superdex 200',
        col: 's200i',
        unit: 'mL',
        v0: 8.0,
        vt: 24.0,
        stds: [{name: 'Thyroglobulin', kda: 670, ve: 9.0}, {name: 'Ovalbumin', kda: 44, ve: 15.0}]
      }],
      known: [
        {name: 'DnaK', kda: 70.0, kind: 'contam', on: false, ctx: 'any', src: 'stale chaperone', app: 99},
        {name: 'SlyD', kda: 20.0, on: true, ctx: 'post', src: 'stale slyd'},
        {name: 'His-SUMO tag', kda: 11.0, app: 99, kind: 'contaminant', on: true, ctx: 'any', src: 'stale sumo'},
        {name: 'Custom Marker', kda: 33.5, kind: 'label', on: true, src: 'added by you'}
      ]
    }
  };

  await p.click(SEL.home);
  await p.waitForTimeout(600);
  await p.setInputFiles(SEL.importFile, {
    name: 'legacy_opt_preserve.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyProj))
  });
  await p.waitForTimeout(3000);

  const uiOpts = await p.evaluate(() => ({
    secStds: !!(document.querySelector('#o-secStds') && document.querySelector('#o-secStds').checked),
    wfYield: !!(document.querySelector('#o-wfYield') && document.querySelector('#o-wfYield').checked),
    noGelSlot: !!(document.querySelector('#o-noGelSlot') && document.querySelector('#o-noGelSlot').checked),
    knownRows: [...document.querySelectorAll('#knownList .krow')].map(r => ({
      name: r.querySelector('[data-kf="name"]').value,
      kda: +r.querySelector('[data-kf="kda"]').value,
      on: r.querySelector('[data-kf="on"]').checked,
      src: r.getAttribute('title') || ''
    }))
  }));

  T.check('legacy-opt.ui-secStds', uiOpts.secStds === true, `#o-secStds checked=${uiOpts.secStds}`);
  T.check('legacy-opt.ui-wfYield', uiOpts.wfYield === true, `#o-wfYield checked=${uiOpts.wfYield}`);
  T.check('legacy-opt.ui-noGelSlot', uiOpts.noGelSlot === true, `#o-noGelSlot checked=${uiOpts.noGelSlot}`);
  T.check('legacy-opt.ui-known-rendered', uiOpts.knownRows.length >= startKnown.length, `rendered ${uiOpts.knownRows.length} known rows`);

  const [dl1] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click(SEL.exportBtn)]);
  const outPath = path.join(ROOT, 'results', 'legacy_opt_preserve_export.json');
  await dl1.saveAs(outPath);
  const exp = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const eopt = exp.opt || {};
  const eknown = Array.isArray(eopt.known) ? eopt.known : [];

  T.check('legacy-opt.export-secStds', eopt.secStds === true, `secStds=${eopt.secStds}`);
  T.check('legacy-opt.export-wfYield', eopt.wfYield === true, `wfYield=${eopt.wfYield}`);
  T.check('legacy-opt.export-noGelSlot', eopt.noGelSlot === true, `noGelSlot=${eopt.noGelSlot}`);
  T.check('legacy-opt.export-wfGelH', eopt.wfGelH === 1.8, `wfGelH=${eopt.wfGelH}`);

  const metaMismatch = [];
  startKnown.forEach(sk => {
    const matches = eknown.filter(k => k && k.name === sk.name);
    if (matches.length !== 1) { metaMismatch.push(`${sk.name}: count=${matches.length}`); return; }
    const m = matches[0];
    if (m.kda !== sk.kda || m.ctx !== sk.ctx || m.src !== sk.src || m.app !== sk.app || ('app' in m) !== ('app' in sk)) {
      metaMismatch.push(`${sk.name}: got ${JSON.stringify({kda: m.kda, ctx: m.ctx, src: m.src, app: m.app})} vs ${JSON.stringify({kda: sk.kda, ctx: sk.ctx, src: sk.src, app: sk.app})}`);
    }
  });
  T.check('legacy-opt.known-default-metadata', metaMismatch.length === 0 && startKnown.length > 0, metaMismatch.join(' | ') || 'ok');

  const dnak = eknown.find(k => k && k.name === 'DnaK' && k.kind === 'contam');
  const custom = eknown.find(k => k && k.name === 'Custom Marker');
  T.check('legacy-opt.known-on-preserved', !!dnak && dnak.on === false, `DnaK=${JSON.stringify(dnak)}`);
  T.check('legacy-opt.known-custom-preserved', !!custom && custom.kda === 33.5, `custom=${JSON.stringify(custom)}`);
  T.check('legacy-opt.no-error', !errs.length, errs.join(' | '));
  await close();
});

await T.t('legacy-non-numeric-stability', async () => {
  const {p, errs, close} = await open(), h = H(p);
  const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const proj = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [
      {
        id: 'r1',
        name: 'IMAC Run',
        file: 'standard_like_name.csv',
        inWf: true,
        isStd: false,
        pathFromFile: true,
        path: '2',
        uvs: [{name: 'UV', xs: [0, 5, 10], ys: [10, 100, 10]}],
        fracs: []
      },
      {
        id: 'r2',
        name: 'SEC Standards',
        inWf: false,
        isStd: true,
        pathFromFile: false,
        secMode: 'on',
        secCal: 'sc_legacy',
        uvs: [{name: 'UV', xs: [8, 12, 16], ys: [5, 80, 5]}],
        fracs: []
      }
    ],
    traces: [
      {rows: [[0, 10], [5, 50], [10, 15]]}
    ],
    gels: [
      {
        image: png1x1,
        name: null,
        white: null,
        black: null,
        rot: null,
        fine: null,
        nLanes: null,
        labels: null,
        crop: null,
        edits: [],
        marks: null,
        assign: null,
        tags: null
      }
    ],
    nanodrop: [
      {id: 'nd1', name: 'Sample A', a280: 1.2, runId: 'r1'},
      {id: 'nd1', name: 'Sample B', a280: 2.4, runId: 'r1'}
    ],
    prep: {
      name: 'Stability Protein',
      manual: [
        {id: 'm1', kind: 'column', name: 'Manual A', after: 'r1'},
        {id: 'm1', kind: 'dialysis', name: 'Manual B', after: 'r1'}
      ],
      btw: {r1: null},
      skip: null,
      stepMeta: null,
      wfOff: null,
      titles: null,
      cDetails: {digest: null, overlap: null, recomb: null},
      cloning: null
    },
    opt: {
      secStds: true,
      secCals: [{
        id: 'sc_legacy',
        name: 'Legacy SEC',
        col: 's200i',
        v0: 8,
        vt: 24,
        stds: [
          {name: 'Thyroglobulin', kda: 670, ve: 9},
          {name: 'Ovalbumin', kda: 44, ve: 15}
        ]
      }]
    }
  };

  await p.setInputFiles(SEL.importFile, {
    name: 'legacy_non_numeric_stability.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(proj))
  });
  await p.waitForTimeout(3000);

  const manSteps = await p.$$eval('#tl button[data-step^="man:"]', els => els.map(e => e.getAttribute('data-step')));
  T.check('non-num.manual-unique-ids', manSteps.length === 2 && manSteps[0] !== manSteps[1], `manual steps: ${manSteps.join(', ')}`);

  await h.step('run:r1');
  await p.waitForTimeout(400);
  const ndIds = await p.$$eval('#ndList [data-nd]', els => els.map(e => e.getAttribute('data-nd')));
  T.check('non-num.nd-unique-ids', ndIds.length === 2 && ndIds[0] !== ndIds[1], `nd ids: ${ndIds.join(', ')}`);

  const calText = await p.$eval('#sec-cal option', el => el.textContent).catch(e => e.message);
  T.check('non-num.sec-cal-unit', typeof calText === 'string' && calText.includes('(mL)'), `calText: ${calText}`);

  const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click(SEL.exportBtn)]);
  const outPath = path.join(ROOT, 'results', 'legacy_non_numeric_stability_export.json');
  await dl.saveAs(outPath);
  const exp = JSON.parse(fs.readFileSync(outPath, 'utf8'));

  const expMan = (exp.prep && exp.prep.manual) || [];
  T.check('non-num.export-manual-uids', expMan.length === 2 && !!expMan[0].id && !!expMan[1].id && expMan[0].id !== expMan[1].id, JSON.stringify(expMan.map(m => m.id)));

  const expNd = exp.nanodrop || [];
  T.check('non-num.export-nd-uids', expNd.length === 2 && !!expNd[0].id && !!expNd[1].id && expNd[0].id !== expNd[1].id, JSON.stringify(expNd.map(n => n.id)));

  const r1 = (exp.runs || []).find(r => r.id === 'r1') || {};
  const r2 = (exp.runs || []).find(r => r.id === 'r2') || {};
  T.check('non-num.flags-r1', r1.pathFromFile === true && r1.isStd === false, `r1: pathFromFile=${r1.pathFromFile}, isStd=${r1.isStd}`);
  T.check('non-num.flags-r2', r2.pathFromFile === false && r2.isStd === true, `r2: pathFromFile=${r2.pathFromFile}, isStd=${r2.isStd}`);

  const ep = exp.prep || {};
  const isPlainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  T.check('non-num.prep-subobjects', isPlainObj(ep.wfOff) && isPlainObj(ep.skip) && isPlainObj(ep.stepMeta) && isPlainObj(ep.titles) && isPlainObj(ep.btw) && !('r1' in ep.btw && ep.btw.r1 === null), JSON.stringify({wfOff: ep.wfOff, btw: ep.btw}));
  T.check('non-num.prep-cdetails', isPlainObj(ep.cDetails) && isPlainObj(ep.cDetails.digest) && isPlainObj(ep.cDetails.overlap) && isPlainObj(ep.cDetails.recomb), JSON.stringify(ep.cDetails));
  T.check('non-num.prep-cloning', isPlainObj(ep.cloning) && Array.isArray(ep.cloning.stages), JSON.stringify(ep.cloning));

  const sc = ((exp.opt && exp.opt.secCals) || []).find(c => c.id === 'sc_legacy') || {};
  T.check('non-num.export-sec-unit', sc.unit === 'mL', `unit=${sc.unit}`);

  const tr = (exp.traces || [])[0] || {};
  T.check('non-num.trace-defaults', tr.id != null && typeof tr.name === 'string' && tr.name.length > 0 && Array.isArray(tr.cols) && tr.xc === 0 && tr.yc === 1 && tr.scale === 1 && Array.isArray(tr.peaks), JSON.stringify({id: tr.id, name: tr.name, cols: tr.cols, xc: tr.xc, yc: tr.yc, scale: tr.scale, peaks: tr.peaks}));

  const g = (exp.gels || [])[0] || {};
  T.check('non-num.gel-defaults', g.id != null && typeof g.name === 'string' && g.name.length > 0 && g.white === 255 && g.black === 0 && g.rot === 0 && g.fine === 0 && g.cl === 0 && g.cr === 0 && g.ct === 0 && g.cb === 0 && g.nLanes === 10 && typeof g.labels === 'string' && g.labels.length > 0 && isPlainObj(g.edits) && Array.isArray(g.edits.added) && Array.isArray(g.edits.removed) && Array.isArray(g.marks) && Array.isArray(g.assign) && Array.isArray(g.tags), JSON.stringify({id: g.id, name: g.name, white: g.white, black: g.black, nLanes: g.nLanes, edits: g.edits}));

  await h.step('final');
  await p.waitForTimeout(300);
  if (await p.locator('#ndPanel.collapsed').count()) await p.click('#ndPanel h2');
  await p.click('#ndList [data-nddel]');
  await p.waitForTimeout(300);
  const ndAfterDel = await p.$$eval('#ndList [data-nd]', els => els.length);
  T.check('non-num.nd-delete-one', ndAfterDel === 1, `nd rows after deleting one: ${ndAfterDel}`);

  T.check('non-num.no-error', !errs.length, errs.join(' | '));
  await close();
});

await T.t('schema-migration-roundtrip', async () => {
  const {p, errs, close} = await open(), h = H(p);
  const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const legacyIn = {
    app: 'HPLC Figure Bench',
    version: 1,
    runs: [
      {
        id: 'r1',
        name: 'IMAC Step',
        inWf: true,
        pathFromFile: true,
        isStd: false,
        path: '2',
        uvs: [{name: 'UV', xs: [0, 5, 10], ys: [10, 120, 10]}],
        fracs: [{x: 3, label: 'T1'}, {x: 7, label: 'T2'}],
        shade: 'T1'
      },
      {
        id: 'r1',
        name: 'Superdex 200 SEC',
        inWf: true,
        secMode: 'on',
        secCal: 'sc1',
        injX: 1.25,
        poolConc: 1.8,
        poolFinalVol: 1.2,
        ndFinalVol: 0.9,
        pathFromFile: false,
        isStd: false,
        uvs: [{name: 'UV', xs: [8, 12, 16], ys: [5, 90, 5]}],
        fracs: [{x: 10, label: 'F1'}, {x: 14, label: 'F2'}],
        shade: 'F1'
      }
    ],
    traces: [
      {id: 1, name: 'HPLC A', rows: [[0, 1], [1, 10], [2, 1]], xu: 'min', yu: 'mAU', source: 'hplc_a.csv'},
      {id: 1, name: 'HPLC B', rows: [[0, 2], [1, 20], [2, 2]], xu: 'min', yu: 'mAU', source: 'hplc_b.csv'}
    ],
    gels: [
      {image: png1x1, name: 'Custom Ladder Gel', preset: 'custom', ladder: '180, 120, 80, 50, 30, 15'},
      {id: 'g1', image: png1x1, name: 'Tagged Gel', preset: 'prplus', ladder: '250, 130, 100, 70, 55, 35, 25, 15, 10', invert: true, color: true, runId: 'r1'}
    ],
    nanodrop: [
      {id: 'nd1', name: 'Concentrated Pool', a280: 1.6, conc: 1.8, runId: 'r1', stage: 'final'},
      {id: 'nd1', name: 'Analytical Read', a280: 0.9, runId: 'r1', stage: 'pool'}
    ],
    assays: [
      {id: 'a1', name: 'Kinase Assay A', runId: 'r1', replicates: [10, 12]},
      {id: 'a1', name: 'Kinase Assay B', runId: 'r1', replicates: [20, 22]}
    ],
    prep: {
      name: 'Schema Protein',
      strain: 'BL21(DE3)',
      manual: [{id: 'm1', kind: 'dialysis', name: 'Dialysis A', after: 'r1'}],
      constructs: [{id: 'c10', name: 'pET28-WT'}, {id: 'c10', name: 'pET28-Mut'}],
      primers: [{id: 'pr14', name: 'Fwd'}, {id: 'pr14', name: 'Rev'}]
    },
    opt: {
      secCals: [
        {id: 'sc1', name: 'S200 Cal A', col: 's200i', v0: 8, vt: 24, stds: [{name: 'Thyroglobulin', kda: 670, ve: 9}, {name: 'Ovalbumin', kda: 44, ve: 15}]},
        {id: 'sc1', name: 'S200 Cal B', col: 's200i', v0: 8.2, vt: 24, stds: []}
      ]
    }
  };

  await p.setInputFiles(SEL.importFile, {
    name: 'Schema_Migration_Test_project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyIn))
  });
  await p.waitForTimeout(3000);

  await p.click('#tl [data-addmenu]');
  await p.waitForTimeout(250);
  await p.click('#tl [data-addstep="man:column"]');
  await p.waitForTimeout(400);
  await h.step('expr');
  await p.waitForTimeout(300);

  const tmpDir = require('os').tmpdir();
  const exportOnce = async tag => {
    const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click(SEL.exportBtn)]);
    const out = path.join(tmpDir, `ppb_schema_mig_${process.pid}_${tag}.json`);
    await dl.saveAs(out);
    return {out, json: JSON.parse(fs.readFileSync(out, 'utf8'))};
  };

  const e1 = await exportOnce('1');
  const d1 = e1.json;

  T.check('schema.version-integer', Number.isInteger(d1.schemaVersion) && d1.schemaVersion >= 1, `schemaVersion=${d1.schemaVersion}`);

  const uniqOk = arr => Array.isArray(arr) && arr.length >= 2 && arr.every(x => x && x.id != null && String(x.id).trim() !== '') && new Set(arr.map(x => String(x.id))).size === arr.length;
  const calPairs = (d1.opt && Array.isArray(d1.opt.secCals) ? d1.opt.secCals : []).filter(c => c && /^S200 Cal [AB]$/.test(c.name));
  const newMan = ((d1.prep && d1.prep.manual) || []).find(m => m.id !== 'm1');
  const newManNum = newMan && /^m(\d+)$/.exec(String(newMan.id)) ? +RegExp.$1 : 0;

  T.check('schema.no-uid-collisions',
    uniqOk(d1.runs) && uniqOk(d1.traces) && uniqOk(d1.gels) && uniqOk(d1.nanodrop) && uniqOk(d1.assays) &&
    uniqOk(d1.prep && d1.prep.manual) && uniqOk(d1.prep && d1.prep.constructs) && uniqOk(d1.prep && d1.prep.primers) &&
    uniqOk(calPairs) && newManNum > 14,
    JSON.stringify({
      runs: (d1.runs || []).map(x => x.id),
      traces: (d1.traces || []).map(x => x.id),
      gels: (d1.gels || []).map(x => x.id),
      nd: (d1.nanodrop || []).map(x => x.id),
      assays: (d1.assays || []).map(x => x.id),
      manual: ((d1.prep && d1.prep.manual) || []).map(x => x.id),
      constructs: ((d1.prep && d1.prep.constructs) || []).map(x => x.id),
      primers: ((d1.prep && d1.prep.primers) || []).map(x => x.id),
      secCals: calPairs.map(x => x.id)
    }));

  const gCustom = (d1.gels || []).find(g => g.name === 'Custom Ladder Gel') || {};
  const gTagged = (d1.gels || []).find(g => g.name === 'Tagged Gel') || {};
  const trA = (d1.traces || []).find(t => t.name === 'HPLC A') || {};
  const rSec = (d1.runs || []).find(r => r.name === 'Superdex 200 SEC') || {};
  const ndConc = (d1.nanodrop || []).find(n => n.name === 'Concentrated Pool') || {};
  const scA = calPairs.find(c => c.name === 'S200 Cal A') || {};

  T.check('schema.entity-codecs-preserved',
    gCustom.ladder === '180, 120, 80, 50, 30, 15' && gCustom.preset === 'custom' &&
    gTagged.invert === true && gTagged.color === true &&
    trA.xu === 'min' && trA.yu === 'mAU' && trA.source === 'hplc_a.csv' &&
    rSec.injShift === 1.25 && rSec.injX === 1.25 && rSec.poolConc === 1.8 && rSec.ndFinalVol === 0.9 &&
    ndConc.stage === 'conc' && scA.unit === 'mL' && (d1.opt && d1.opt.secStds === true),
    JSON.stringify({gCustomLadder: gCustom.ladder, gTagged: [gTagged.invert, gTagged.color], trA: [trA.xu, trA.yu, trA.source], rSec: [rSec.injShift, rSec.poolConc, rSec.ndFinalVol], ndStage: ndConc.stage, scUnit: scA.unit, secStds: d1.opt && d1.opt.secStds}));

  await p.click(SEL.home);
  await p.waitForTimeout(600);
  await p.setInputFiles(SEL.importFile, e1.out);
  await p.waitForTimeout(3000);

  const e2 = await exportOnce('2');
  const d2 = e2.json;

  const missingKeys = (a, b, pfx = '') => {
    const out = [];
    if (!a || typeof a !== 'object') return out;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || b.length < a.length) out.push(`${pfx}[len ${Array.isArray(b) ? b.length : 'non-arr'} < ${a.length}]`);
      else a.forEach((v, i) => out.push(...missingKeys(v, b[i], `${pfx}[${i}]`)));
      return out;
    }
    if (!b || typeof b !== 'object' || Array.isArray(b)) { out.push(pfx || '<root>'); return out; }
    for (const k of Object.keys(a)) {
      if (!(k in b)) out.push(pfx ? `${pfx}.${k}` : k);
      else out.push(...missingKeys(a[k], b[k], pfx ? `${pfx}.${k}` : k));
    }
    return out;
  };
  const dropped = missingKeys(d1, d2);
  T.check('schema.no-keys-dropped', dropped.length === 0, `dropped keys: ${dropped.slice(0, 12).join(', ')}`);

  const stripClock = x => { const c = JSON.parse(JSON.stringify(x)); delete c.saved; return c; };
  const s1 = JSON.stringify(stripClock(d1)), s2 = JSON.stringify(stripClock(d2));
  T.check('schema.migrate-idempotent', s1 === s2, s1 === s2 ? 'ok' : `len ${s1.length} vs ${s2.length}`);

  T.check('schema.no-error', !errs.length, errs.join(' | '));
  await close();
});

/* ---------------- below-limit vs upper-limit saturation diagnostics (#1758) ---------------- */
await T.t('below-limit-saturation-diagnostics', async () => {
  const {p, errs, close} = await open(), h = H(p);
  try {
    await h.newProject('Below-limit saturation diagnostics');
    const makeCsv = vals => ['Time (min),UV 280 (mAU)', ...Array.from({length: 20}, (_, i) => `${(i * 0.1).toFixed(1)},${i < vals.length ? vals[i] : '0.02'}`)].join('\n');
    const cardOf = nm => p.locator('.trace[data-kind="trace"]').filter({has: p.locator(`input[data-k="name"][title="${nm}"]`)});
    const loadCase = async (nm, vals) => {
      await p.setInputFiles('#file', {name: `${nm}.csv`, mimeType: 'text/csv', buffer: Buffer.from(makeCsv(vals))});
      await h.wait(500);
      const c = cardOf(nm);
      const diag = (await c.locator('.source-diag').allTextContents()).join(' ');
      return {n: await c.count(), diag};
    };

    const below = await loadCase('below_limit_loq', ['<0.01', '<=0.01']);
    T.check('sat.below_limit.loads', below.n === 1, `cards=${below.n}`);
    T.check('sat.below_limit.no_false_warning', !/detector-saturated/i.test(below.diag), `diag="${below.diag}"`);

    for (const [id, token] of [['gt', '>0.01'], ['gte', '>=0.01'], ['star', '0.01*'], ['hash', '0.01#']]) {
      const res = await loadCase(`sat_upper_${id}`, [token]);
      T.check(`sat.upper_${id}.loads`, res.n === 1, `cards=${res.n}`);
      T.check(`sat.upper_${id}.warns_saturated`, /detector-saturated/i.test(res.diag), `${token}: diag="${res.diag}"`);
    }

    const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click(SEL.exportBtn)]);
    const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    const trBelow = (saved.traces || []).find(t => t.name === 'below_limit_loq');
    T.check('sat.below_limit.numeric_retained',
      !!trBelow && Array.isArray(trBelow.rows) && trBelow.rows.length === 20 &&
      trBelow.rows[0][1] === 0.01 && trBelow.rows[1][1] === 0.01 && trBelow.rows[2][1] === 0.02,
      JSON.stringify(trBelow && trBelow.rows && trBelow.rows.slice(0, 3)));
    T.check('sat.below_limit.no_error', !errs.length, errs.join(' | '));
  } finally {
    await close();
  }
});

/* #1821: a run without a phases list, or with a damaged curve, must not blank the project when Method phases is on */
await T.t('run-without-phases-renders', async () => { const {p, errs, close} = await open(), h = H(p);
  const d = JSON.parse(fs.readFileSync(path.join(DATA, 'legacy_project.json'), 'utf8'));
  delete d.runs[0].phases; d.runs[0].grad = {xs: [1, 2, 3], ys: 5}; d.runs[0].cond = 'not a curve';
  d.opt = Object.assign({}, d.opt, {phases: true});
  await p.locator('#homeQuick').evaluate(e => e.click());
  await p.setInputFiles('#projFile', {name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))});
  await p.waitForTimeout(3000);
  const tl = await h.timeline(), r = tl.find(x => x.k.startsWith('run:'));
  if (r) { await h.step(r.k); await p.waitForTimeout(800); }
  const fig = await p.evaluate(() => { const s = document.querySelector('#paper svg'); return s ? s.querySelectorAll('path').length : -1; });
  T.check('partial-run.timeline-has-run', !!r, JSON.stringify(tl.map(x => x.k)));
  T.check('partial-run.figure-drawn', fig > 0, `${fig} paths in the figure`);
  T.check('partial-run.no-page-errors', !errs.length, errs.join(' | '));
  await close();
});

T.done(); })();

