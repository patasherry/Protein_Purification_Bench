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

  await T.t('timeline_keyboard_nav', async () => {
    await h.step('construct');
    await h.wait(200);
    const steps0 = await p.$$eval('#tl .tl-i[data-step]', els => els.filter(e => !e.hidden && e.getClientRects().length > 0).map(e => e.dataset.step));
    await p.locator('#tl .tl-i[data-step="construct"]').focus();
    await p.keyboard.press('ArrowDown');
    await h.wait(200);
    const afterDown = await p.$eval('#tl .tl-i[aria-current="step"]', e => ({step: e.dataset.step, focused: document.activeElement === e}));
    T.check('tl_kbd.arrow_down_advances_step', steps0.length >= 2 && afterDown.step === steps0[1] && afterDown.focused, `expected=${steps0[1]}, got=${JSON.stringify(afterDown)}`);

    await p.keyboard.press('End');
    await h.wait(200);
    const afterEnd = await p.$eval('#tl .tl-i[aria-current="step"]', e => e.dataset.step);
    await p.keyboard.press('Home');
    await h.wait(200);
    const afterHome = await p.$eval('#tl .tl-i[aria-current="step"]', e => e.dataset.step);
    T.check('tl_kbd.end_and_home_jump', afterEnd === steps0[steps0.length - 1] && afterHome === steps0[0], `afterEnd=${afterEnd}, afterHome=${afterHome}, steps=${JSON.stringify(steps0)}`);
  });

  T.check('no_page_errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
