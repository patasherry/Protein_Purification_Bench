// 32 project UX: Construct PDB toggle + visible controls, Concentrated quick-fill presets, and Project NanoDrop toast (#1578).
const {open, H, suite, RES, path, fs, src} = require('../lib/harness');

const atomCa = (n, res, seq, x, y, z) =>
  'ATOM  ' + String(n).padStart(5) + '  CA  ' + res.padStart(3) + ' A' + String(seq).padStart(4) + '    ' +
  x.toFixed(3).padStart(8) + y.toFixed(3).padStart(8) + z.toFixed(3).padStart(8) + '  1.00 20.00           C';

const SYN_PDB = [
  'HEADER'.padEnd(62, ' ') + '1ABC',
  'TITLE     SYNTHETIC TEST STRUCTURE',
  'SEQRES   1 A    6  MET ALA GLY TRP TYR LEU',
  atomCa(1, 'MET', 1, 0.0, 0.0, 0.0),
  atomCa(2, 'ALA', 2, 3.8, 0.2, 0.0),
  atomCa(3, 'GLY', 3, 7.2, 1.9, 0.5),
  atomCa(4, 'TRP', 4, 10.6, 0.4, 1.4),
  atomCa(5, 'TYR', 5, 14.1, 1.8, 2.2),
  atomCa(6, 'LEU', 6, 17.5, 0.1, 3.0),
  'END'
].join('\n') + '\n';

(async () => {
  const T = suite('32_project_ux');
  const pdbFile = path.join(RES, 'syn_1abc.pdb');
  fs.writeFileSync(pdbFile, SYN_PDB);

  const {p, errs, close} = await open();
  const h = H(p);

  await T.t('construct_pdb', async () => {
    await h.newProject('Project UX');
    await h.gb(src('gb'));
    const before = (await h.svgTexts()).map(x => x.t).join(' | ');
    T.check('construct_pdb.initial_diagram', /Construct/.test(before), before);

    await p.setInputFiles('#pdbFile', pdbFile);
    await h.wait(600);

    const vis = await p.evaluate(() => {
      const ok = s => { const e = document.querySelector(s); return !!(e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'); };
      return {prot: ok('#protPanel'), prep: ok('#prepPanel')};
    });
    T.check('construct_pdb.panels_visible', vis.prot && vis.prep, JSON.stringify(vis));

    const structTxt = (await h.svgTexts()).map(x => x.t).join(' | ');
    T.check('construct_pdb.shows_3d', /1ABC/.test(structTxt), structTxt);

    const toCon = p.locator('#protPanel button', {hasText: /Construct/i}).first();
    if (await toCon.isVisible().catch(() => false)) {
      await toCon.click();
      await h.wait(400);
    }
    const backTxt = (await h.svgTexts()).map(x => x.t).join(' | ');
    const visAfter = await p.evaluate(() => {
      const ok = s => { const e = document.querySelector(s); return !!(e && !e.hidden && e.getClientRects().length > 0); };
      return {prot: ok('#protPanel'), prep: ok('#prepPanel')};
    });
    T.check('construct_pdb.toggle_construct', /Construct/.test(backTxt) && !/1ABC/.test(backTxt) && visAfter.prot && visAfter.prep, backTxt);

    const to3d = p.locator('#protPanel button', {hasText: /3D|Structure/i}).first();
    const can3d = await to3d.isVisible().catch(() => false);
    if (can3d) {
      await to3d.click();
      await h.wait(400);
    }
    const again3d = (await h.svgTexts()).map(x => x.t).join(' | ');
    T.check('construct_pdb.toggle_3d_again', can3d && /1ABC/.test(again3d), again3d);
  });

  await T.t('conc_quick', async () => {
    await h.addRun(src('his'));
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep=conc]');
    await h.wait(500);

    const chips = await p.$$eval('#ssQuick .qchip', els =>
      els.filter(e => !e.hidden && e.getClientRects().length > 0).map(e => e.textContent.trim())
    );
    T.check('conc_quick.four_presets', chips.length === 4 && chips.includes('Amicon 10 kDa'), JSON.stringify(chips));

    if (chips.includes('Amicon 10 kDa')) {
      await p.locator('#ssQuick .qchip', {hasText: 'Amicon 10 kDa'}).click();
      await h.wait(300);
    }
    await p.evaluate(() => { const d = document.querySelector('#btwMore'); if (d) d.open = true; });
    const vals = await p.evaluate(() => ({
      dev: (document.querySelector('#btw-device') || {}).value,
      mwco: (document.querySelector('#btw-mwco') || {}).value
    }));
    T.check('conc_quick.applies_preset', vals.dev === 'Amicon Ultra' && vals.mwco === '10', JSON.stringify(vals));
  });

  await T.t('nd_toast', async () => {
    await p.$$eval('#toast .pill', els => els.forEach(e => e.click()));
    await h.wait(100);
    await p.setInputFiles('#file', src('ndSpec'));
    await h.wait(600);
    const pills = await p.$$eval('#toast .pill', els => els.map(e => e.textContent.trim()));
    const ndMsg = pills.find(t => /Added \d+ NanoDrop reading/i.test(t)) || '';
    T.check('nd_toast.no_hidden_tab', !!ndMsg && !/NanoDrop spectra tab/i.test(ndMsg), ndMsg || JSON.stringify(pills));
  });

    await T.t('universal_labq_and_tidy16_migration', async () => {
    const personalRe = /HsGS|glnA|KPP-MM|hNADK/i;
    const scanStepChips = async stepName => {
      await h.step(stepName); await h.wait(150);
      const moreBtn = p.locator('#ssQuick [data-qall="1"]');
      if (await moreBtn.isVisible().catch(() => false)) { await moreBtn.click(); await h.wait(100); }
      return p.$$eval('#ssQuick .qchip', els => els.map(e => ({
        text: e.textContent.trim(),
        title: e.getAttribute('title') || '',
        mine: e.classList.contains('mine')
      })));
    };

    // Check placeholders on home + workspace while preserving #pr-name / #pr-trPlasmid
    const ph = await p.evaluate(() => ({
      npName: (document.getElementById('npName') || {}).placeholder || '',
      npProt: (document.getElementById('npProt') || {}).placeholder || '',
      targetName: (document.getElementById('o-targetName') || {}).placeholder || '',
      taggedName: (document.getElementById('o-taggedName') || {}).placeholder || '',
      prName: (document.getElementById('pr-name') || {}).placeholder || '',
      trPlasmid: (document.getElementById('pr-trPlasmid') || {}).placeholder || ''
    }));
    T.check('tidy16.placeholders_universal_and_construct_preserved',
      ph.npName === 'e.g. Target-A, prep 1' && ph.npProt === 'e.g. Target-A' &&
      ph.targetName === 'e.g. Target' && ph.taggedName === 'e.g. His-SUMO-Target' &&
      ph.prName === 'e.g. pET28-SUMO-NADK' &&
      !personalRe.test([ph.npName, ph.npProt, ph.targetName, ph.taggedName].join(' ')),
      JSON.stringify(ph));

    // Check universal textbook LABQ presets, field-preview tooltips, and all 4 LABQ.btw chips verbatim
    const lysChips = await scanStepChips('lysis');
    await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep="cleave"]'); await h.wait(250);
    const clvChips = await scanStepChips('cleave');
    const finChips = await scanStepChips('final');
    const runStep = await p.$eval('#tl [data-step^="run:"]', e => e.dataset.step);
    const runChips = await scanStepChips(runStep);
    const btwStep = await p.$eval('#tl [data-step^="btw:"]', e => e.dataset.step);
    const btwChips = await scanStepChips(btwStep);
    const allFresh = [...lysChips, ...clvChips, ...finChips, ...runChips, ...btwChips];
    const btwLabels = btwChips.filter(c => !c.mine).map(c => c.text);

    T.check('tidy16.fresh_labq_universal_and_btw_verbatim',
      lysChips.some(c => c.text === 'Sonication, Tris/NaCl lysis') &&
      clvChips.some(c => c.text === 'Ulp1 / TEV overnight dialysis') &&
      runChips.some(c => c.text === 'HisTrap FF 1 mL, standard IMAC') &&
      finChips.some(c => c.text === 'Standard HEPES/NaCl SEC & storage') &&
      JSON.stringify(btwLabels) === JSON.stringify(['Amicon 10 kDa', 'Amicon 30 kDa', 'HiPrep 26/10 desalting', '0.22 µm spin filter']) &&
      allFresh.every(c => !c.mine && !personalRe.test(c.text + ' ' + c.title) && /^Fills .+ — editable after click$/.test(c.title)),
      JSON.stringify({btwLabels, sampleTip: runChips[0] && runChips[0].title, leaked: allFresh.filter(c => personalRe.test(c.text + ' ' + c.title))}));

    // #optReset + reload must NOT trigger legacy personal-preset seeding
    if (await p.isVisible('#moreBtn')) {
      const exp = await p.getAttribute('#moreBtn', 'aria-expanded');
      if (exp !== 'true') { await p.click('#moreBtn'); await h.wait(150); }
    }
    await p.click('#optReset'); await h.wait(250);
    await p.reload(); await h.wait(500);
    if (!(await p.isVisible('#npName')) && (await p.isVisible('#homeNewProj'))) { await p.click('#homeNewProj'); await h.wait(200); }
    await p.waitForSelector('#npName', {state: 'visible', timeout: 15000});
    await h.newProject('After Reset');
    const lysAfterReset = await scanStepChips('lysis');
    const phAfterReset = await p.evaluate(() => [
      (document.getElementById('npName') || {}).placeholder || '',
      (document.getElementById('o-targetName') || {}).placeholder || ''
    ].join(' '));
    T.check('tidy16.after_optreset_reload_clean',
      lysAfterReset.length > 0 && lysAfterReset.every(c => !c.mine && !personalRe.test(c.text + ' ' + c.title)) && !personalRe.test(phAfterReset),
      JSON.stringify({lysAfterReset, phAfterReset}));

    // Importing a pre-tidy16 .json project must NOT pollute opt.myQuick or localStorage
    const pre16Proj = JSON.stringify({
      app: 'HPLC Figure Bench',
      version: 1,
      name: 'Imported Pre-tidy16 Project',
      opt: {preset: 'single', tidy13: true, tidy14: true, tidy15: true},
      runs: [], traces: [], gels: [], nanodrop: [], assays: [],
      prep: {on: true}
    });
    const pre16Path = path.join(RES, 'syn_pre_tidy16.json');
    fs.writeFileSync(pre16Path, pre16Proj);
    await p.setInputFiles('#projFile', pre16Path); await h.wait(600);
    const lysAfterImport = await scanStepChips('lysis');
    const lsAfterImport = await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hplc-fig-opt') || '{}');
      return Array.isArray(s.myQuick) ? s.myQuick : [];
    });
    T.check('tidy16.import_pre16_json_no_pollution',
      lysAfterImport.every(c => !c.mine && !personalRe.test(c.text + ' ' + c.title)) && lsAfterImport.length === 0,
      JSON.stringify({mine: lysAfterImport.filter(c => c.mine), lsAfterImport}));

    // (b) Seed pre-tidy16 localStorage['hplc-fig-opt'] before reload in an isolated browser -> legacy personal presets preserved in myQuick
    const a2 = await open(), p2 = a2.p, h2 = H(p2);
    try {
      await p2.context().addInitScript(() => {
        if (!sessionStorage.getItem('seeded_pre16')) {
          sessionStorage.setItem('seeded_pre16', '1');
          localStorage.setItem('hplc-fig-opt', JSON.stringify({preset: 'single', tidy13: true, tidy14: true, tidy15: true}));
        }
      });
      await p2.reload(); await p2.waitForSelector('#npName', {state: 'visible', timeout: 15000});
      await h2.newProject('Legacy User');
      await h2.step('lysis'); await h2.wait(200);
      const mineLys = await p2.$$eval('#ssQuick .qchip.mine', els => els.map(e => e.textContent.trim()));
      const storedQuick = await p2.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('hplc-fig-opt') || '{}');
        return {tidy16: !!s.tidy16, names: (s.myQuick || []).map(q => q.n)};
      });
      T.check('tidy16.boot_localstorage_preserves_legacy_myquick',
        storedQuick.tidy16 && mineLys.includes('Sonication, GS base buffer') &&
        storedQuick.names.includes('HisTrap FF 1 mL, ÄKTA go, GS buffers') &&
        storedQuick.names.includes('Store in the Ulp1 storage buffer'),
        JSON.stringify({mineLys, storedQuick}));
      errs.push(...a2.errs);
    } finally { await a2.close(); }
  });

  T.check('no_page_errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();

