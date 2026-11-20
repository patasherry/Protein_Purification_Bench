const {open, H, suite, src, fs, path, DATA} = require('../lib/harness');

(async () => {
  const T = suite('669_persistence_roundtrip');

  await T.t('round-trip-yields-and-methods', async () => {
    const {p, errs, close} = await open(), h = H(p);

    const F = {gb: src('gb'), imac: src('his'), sec: path.join(DATA, 'science/sec_inject2.csv'), q: src('q')};

    await h.newProject('Split Yield Persistence');
    await h.gb(F.gb);
    await h.addRun(F.imac);
    await h.pool('T1-T6');
    await h.addRun(F.sec);
    await h.suggest();
    await h.addRun(F.q);
    await h.suggest();

    const tl = (await h.timeline()).filter(x => x.k.startsWith('run:'));
    const ids = tl.map(x => x.k.slice(4));

    // Branch both SEC and Q from IMAC
    const setFrom = async (stepKey, value) => { await h.step(stepKey); await p.selectOption('#ssFrom', value); await p.waitForTimeout(500); };
    await setFrom(tl[2].k, ids[0]);
    await p.fill('#ssFromNote', 'fractions B9-B12');
    await p.dispatchEvent('#ssFromNote', 'change');
    await h.wait(300);

    await h.step(tl[1].k);
    await p.fill('#ssFromNote', 'fractions B5-B8');
    await p.dispatchEvent('#ssFromNote', 'change');
    await h.wait(300);

    // Turn on Yield line
    await p.click('#tl [data-step=figure]'); await p.waitForTimeout(700);
    await p.evaluate(() => {
      const el = document.getElementById('o-wfYield');
      if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
    });
    await h.wait(500);

    // Save state before persistence
    const brTextsBefore = (await h.svgTexts()).filter(t => /Final (pool|sample)/.test(t.t));
    const methBefore = await h.methods();
    const sumRowsBefore = await p.$$eval('#sumTable tbody tr', rows => rows.map(r => r.innerText));

    // Persist via export
    const downloadPromise = p.waitForEvent('download');
    await p.click('#projSave');
    const download = await downloadPromise;
    const savePath = await download.path();

    // Reopen App
    await p.click('#homeBtn').catch(() => {});
    await h.wait(500);
    await p.click('#homeQuick');
    await h.wait(1500);

    await p.setInputFiles('#projFile', savePath);
    await h.wait(3000);

    // Ensure Yield line is active
    await p.click('#tl [data-step=figure]'); await p.waitForTimeout(700);

    const brTextsAfter = (await h.svgTexts()).filter(t => /Final (pool|sample)/.test(t.t));
    const methAfter = await h.methods();
    const sumRowsAfter = await p.$$eval('#sumTable tbody tr', rows => rows.map(r => r.innerText));

    const clean = t => t.map(x => x.t).sort().join(' | ');
    T.check('round-trip: branch texts preserved', clean(brTextsBefore) === clean(brTextsAfter), `Before: ${clean(brTextsBefore)} | After: ${clean(brTextsAfter)}`);
    T.check('round-trip: methods preserved', methBefore === methAfter, 'Methods changed');
    T.check('round-trip: methods contains split', /split:/i.test(methAfter), methAfter);
    T.check('round-trip: summary table preserved', JSON.stringify(sumRowsBefore) === JSON.stringify(sumRowsAfter), `Before: ${JSON.stringify(sumRowsBefore)} | After: ${JSON.stringify(sumRowsAfter)}`);

    T.check('no page errors', !errs.length, errs.join(' | '));
    await close();
  });

  await T.t('custom-tagseq-stashed-across-preset-switch', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await p.click('#homeQuick');
    await h.wait(400);
    await p.setInputFiles('#gelFile', src('gel'));
    await h.wait(900);
    await p.$eval('details[data-sub="gcleave"]', d => { d.open = true; });
    await p.selectOption('#o-tagPreset', 'custom');
    await h.wait(150);
    await p.fill('#tagSeq', 'WSHPQFEK');
    await p.locator('#tagSeq').blur();
    await h.wait(150);
    await p.selectOption('#o-tagPreset', 'his');
    await h.wait(150);
    const onHis = await p.$eval('#tagSeq', e => e.value);
    await p.selectOption('#o-tagPreset', 'custom');
    await h.wait(150);
    const restored = await p.$eval('#tagSeq', e => e.value);
    T.check('custom-tagseq: restored on switching back to custom', onHis === '' && restored === 'WSHPQFEK', `onHis="${onHis}" restored="${restored}"`);
    T.check('custom-tagseq: no page errors', !errs.length, errs.join(' | '));
    await close();
  });

  await T.t('optreset-preserves-myquick-and-epsmode', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await h.newProject('Reset Persistence');
    await p.fill('#protSeq', 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEK');
    await h.wait(150);
    await p.selectOption('#o-epsMode', 'tagged');
    await h.wait(150);

    await h.step('expr');
    await p.fill('#pr-medium', '2xYT');
    await p.fill('#pr-temp', '20');
    await h.wait(150);
    await p.click('#ssQuick [data-qsave="1"]');
    await h.wait(200);
    const chipsBefore = await p.$$eval('#ssQuick .qchip.mine', els => els.map(e => e.textContent.trim()));

    if (await p.isVisible('#moreBtn')) {
      const exp = await p.getAttribute('#moreBtn', 'aria-expanded');
      if (exp !== 'true') { await p.click('#moreBtn'); await h.wait(200); }
    }
    await p.click('#optReset');
    await h.wait(300);

    const chipsAfter = await p.$$eval('#ssQuick .qchip.mine', els => els.map(e => e.textContent.trim()));
    await h.step('construct');
    const epsAfter = await p.$eval('#o-epsMode', e => e.value);

    T.check('optreset: custom quick-fill chip preserved', chipsBefore.length === 1 && JSON.stringify(chipsAfter) === JSON.stringify(chipsBefore), `before=${JSON.stringify(chipsBefore)} after=${JSON.stringify(chipsAfter)}`);
    T.check('optreset: epsMode preserved', epsAfter === 'tagged', `got: "${epsAfter}"`);
    T.check('optreset: no page errors', !errs.length, errs.join(' | '));
    await close();
  });

  await T.t('companion-drop-loads-project-and-trace', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await h.newProject('Companion Drop Project');
    await h.addRun(src('his'));

    const dl = p.waitForEvent('download');
    await p.click('#projSave');
    const projPath = await (await dl).path();
    const projJson = fs.readFileSync(projPath, 'utf8');
    const csvText = 'Time (min),Signal (mAU)\n0.0,1.2\n1.0,42.5\n2.0,3.4\n3.0,1.1\n';

    await p.click('#homeBtn');
    await h.wait(500);

    await p.evaluate(([pText, cText]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([pText], 'companion_bundle_project.json', {type: 'application/json'}));
      dt.items.add(new File([cText], 'companion_trace.csv', {type: 'text/csv'}));
      document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true}));
    }, [projJson, csvText]);
    await h.wait(2500);

    const projOpen = await p.$eval('#projBar', e => !e.hidden);
    const runCards = await p.$$eval('#list .trace[data-kind="run"]', els => els.length);
    const traceNames = await p.$$eval('#list .trace[data-kind="trace"] [data-k="name"]', els => els.map(e => e.value));

    T.check('companion-drop: project opened with its run and companion csv trace added', projOpen && runCards === 1 && traceNames.includes('companion_trace'), `projOpen=${projOpen} runs=${runCards} traces=${JSON.stringify(traceNames)}`);
    T.check('companion-drop: no page errors', !errs.length, errs.join(' | '));
    await close();
  });

  T.done();
})();
