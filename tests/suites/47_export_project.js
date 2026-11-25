const {open, H, suite, src, fs, path, DATA} = require('../lib/harness');

(async () => {
  const T = suite('47_export_project');

  await T.t('export-import-and-raw-blobs', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      const F = {gb: src('gb'), imac: src('his'), sec: path.join(DATA, 'science/sec_inject2.csv'), q: src('q')};
      const origRaw = fs.readFileSync(F.imac);

      await h.newProject('Export Test Project');
      T.check('no raw files section before any upload', !(await p.isVisible('#rawPanel')), 'panel visible with nothing uploaded');
      await h.gb(F.gb);
      await h.addRun(F.imac);
      await h.pool('T1-T6');
      T.check('raw files section lists the upload', await p.isVisible('#rawPanel') && /Raw files \(1\)/.test(await p.$eval('#rawSum', e => e.textContent)), await p.$eval('#rawSum', e => e.textContent));

      await h.addRun(F.sec);
      await h.suggest();
      await h.addRun(F.q);
      await h.suggest();

      const tl = (await h.timeline()).filter(x => x.k.startsWith('run:'));
      const ids = tl.map(x => x.k.slice(4));
      await h.step(tl[2].k);
      await p.selectOption('#ssFrom', ids[0]); await h.wait(400);
      await p.fill('#ssFromNote', 'fractions B9-B12'); await p.dispatchEvent('#ssFromNote', 'change');
      await h.step(tl[1].k);
      await p.fill('#ssFromNote', 'fractions B5-B8'); await p.dispatchEvent('#ssFromNote', 'change');

      await h.step('figure');
      await p.evaluate(() => {
        const el = document.getElementById('o-wfYield');
        if (el) { el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
      });
      await h.wait(400);

      const brTextsBefore = (await h.svgTexts()).filter(t => /Final (pool|sample)/.test(t.t));
      const methBefore = await h.methods();
      const sumRowsBefore = await p.$$eval('#sumTable tbody tr', rows => rows.map(r => r.innerText));

      const btnText = await p.$eval('#projSave', el => el.innerText);
      T.check('export project button text', btnText === 'Export project', `Expected "Export project", got "${btnText}"`);

      const [download] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
      const savePath = await download.path();

      await p.click('#homeBtn').catch(() => {});
      await h.wait(500);
      const homeGuidance = await p.$eval('#homeWhere', el => el.textContent);
      const saveHiddenHome = await p.$eval('#projSave', el => el.hidden);

      await p.click('#projList .pcard');
      await h.wait(1000);
      const saveVisibleStored = await p.isVisible('#projSave');
      const rawSum = await p.$eval('#rawSum', e => e.textContent), rawVis = await p.isVisible('#rawPanel');
      T.check('raw file is listed again after reopening the project from the browser database', rawVis && /Raw files \(3\)/.test(rawSum), `visible ${rawVis}, "${rawSum}"`);
      await p.click('#rawSum');
      const [rawDl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#rawList [data-rawdl]')]);
      const gotRaw = fs.readFileSync(await rawDl.path());
      T.check('downloaded raw file is byte-identical to the upload', gotRaw.equals(origRaw) && rawDl.suggestedFilename() === F.imac.split('/').pop(), `${gotRaw.length} vs ${origRaw.length}`);

      const rawHint = (await p.locator('#rawList .hint').count()) ? await p.$eval('#rawList .hint', e => e.textContent) : '';
      const rawZipBtn = p.locator('#rawList [data-rawzip]');
      let zipOk = false, zipDetail = `hint="${rawHint}"`;
      if (await rawZipBtn.count()) {
        const [zipDl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), rawZipBtn.click()]);
        const zipBuf = fs.readFileSync(await zipDl.path());
        const zipStr = zipBuf.toString('latin1');
        zipOk = zipBuf.length > origRaw.length && zipBuf.readUInt32LE(0) === 0x04034b50 &&
          zipStr.includes(path.basename(F.imac)) && zipStr.includes(path.basename(F.sec)) && zipStr.includes(path.basename(F.q)) &&
          zipBuf.includes(origRaw);
        zipDetail = `zipLen=${zipBuf.length} fn=${zipDl.suggestedFilename()} hint="${rawHint}"`;
      }
      T.check('rawPanel shows browser-only hint and Download all (ZIP) bundles raw uploads', /browser only/i.test(rawHint) && zipOk, zipDetail);

      const rec = await p.evaluate(() => new Promise(res => { const q = indexedDB.open('hfb-projects'); q.onsuccess = () => { const db = q.result, tx = db.transaction(['projects', 'blobs'], 'readonly'), a = tx.objectStore('projects').getAll(), b = tx.objectStore('blobs').getAll();
        tx.oncomplete = () => res({data: a.result.map(x => x.data).join(''), raws: b.result.filter(x => /^raw-/.test(x.id)).length, blobs: b.result.length}); }; q.onerror = () => res(null); }));
      const st = rec ? JSON.parse(rec.data) : {};
      T.check('project state keeps file metadata and a reference, not the file contents', rec && rec.raws === 3 && st.rawFiles && st.rawFiles[0].blobId && st.rawFiles[0].size === origRaw.length && !('data' in st.rawFiles[0]) && !('_f' in st.rawFiles[0]), JSON.stringify(rec && {raws: rec.raws}));

      await p.click('#homeBtn').catch(() => {});
      await h.wait(500);
      await p.click('#homeQuick');
      await h.wait(1000);
      await p.setInputFiles('#projFile', savePath);
      await h.wait(2500);

      const saveVisibleImported = await p.isVisible('#projSave');
      T.check('home guidance explains export availability and export control is available when open',
        homeGuidance.includes('Open a project, then choose Export project') && saveHiddenHome && saveVisibleStored && saveVisibleImported,
        `Guidance: ${homeGuidance}, hiddenOnHome: ${saveHiddenHome}, visibleInStored: ${saveVisibleStored}, visibleInImported: ${saveVisibleImported}`);

      await h.step('figure');
      const brTextsAfter = (await h.svgTexts()).filter(t => /Final (pool|sample)/.test(t.t));
      const methAfter = await h.methods();
      const sumRowsAfter = await p.$$eval('#sumTable tbody tr', rows => rows.map(r => r.innerText));
      const clean = t => t.map(x => x.t).sort().join(' | ');
      T.check('round-trip: branch texts preserved', brTextsBefore.length > 0 && clean(brTextsBefore) === clean(brTextsAfter), `Before: ${clean(brTextsBefore)} | After: ${clean(brTextsAfter)}`);
      T.check('round-trip: methods preserved', methBefore === methAfter && /split:/i.test(methAfter), 'Methods changed or missing split');
      T.check('round-trip: summary table preserved', JSON.stringify(sumRowsBefore) === JSON.stringify(sumRowsAfter), `Before: ${JSON.stringify(sumRowsBefore)} | After: ${JSON.stringify(sumRowsAfter)}`);

      const exportedData = JSON.parse(fs.readFileSync(savePath, 'utf8'));
      const exportedBundlesBlobs = exportedData.runs && exportedData.runs.length > 0 &&
        Array.isArray(exportedData.runs[0].uvs) && exportedData.runs[0].uvs.length > 0 && !exportedData.runs[0].blobId;
      T.check('raw instrument files backed by IndexedDB blobs store and bundled into project export',
        rec && rec.blobs > 0 && exportedBundlesBlobs, `blobs: ${rec && rec.blobs}, bundled: ${exportedBundlesBlobs}`);
      T.check('exported project JSON contains schemaVersion key', exportedData.schemaVersion === 1, `schemaVersion: ${exportedData.schemaVersion}`);

      const legacyPath = path.join(path.dirname(savePath), 'legacy_no_schema_project.json');
      const legacyData = JSON.parse(fs.readFileSync(savePath, 'utf8'));
      delete legacyData.schemaVersion;
      fs.writeFileSync(legacyPath, JSON.stringify(legacyData), 'utf8');
      await p.click('#homeBtn').catch(() => {}); await h.wait(400);
      await p.click('#homeQuick'); await h.wait(1000);
      await p.setInputFiles('#projFile', legacyPath); await h.wait(2500);
      const legacyRuns = await p.$$eval('.trace.run[data-kind="run"] input[data-k="name"]', els => els.map(e => e.value));
      const legacyTlRuns = (await h.timeline()).filter(x => /^run:/.test(x.k));
      T.check('import project JSON without schemaVersion preserves runs',
        legacyRuns.length > 0 && legacyTlRuns.length > 0 && legacyRuns[0] === legacyData.runs[0].name,
        `runs: ${legacyRuns.join(', ')}, timeline runs: ${legacyTlRuns.length}`);

      T.check('no page errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  await T.t('settings-and-companion-persistence', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick'); await h.wait(400);
      await p.setInputFiles('#gelFile', src('gel')); await h.wait(900);
      await p.$eval('details[data-sub="gcleave"]', d => { d.open = true; });
      await p.selectOption('#o-tagPreset', 'custom'); await h.wait(150);
      await p.fill('#tagSeq', 'WSHPQFEK'); await p.locator('#tagSeq').blur(); await h.wait(150);
      await p.selectOption('#o-tagPreset', 'his'); await h.wait(150);
      const onHis = await p.$eval('#tagSeq', e => e.value);
      await p.selectOption('#o-tagPreset', 'custom'); await h.wait(150);
      const restored = await p.$eval('#tagSeq', e => e.value);
      T.check('custom-tagseq: restored on switching back to custom', onHis === '' && restored === 'WSHPQFEK', `onHis="${onHis}" restored="${restored}"`);

      await p.click('#homeBtn').catch(() => {}); await h.wait(400);
      await h.newProject('Reset Persistence');
      await p.fill('#protSeq', 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEK'); await h.wait(150);
      await p.selectOption('#o-epsMode', 'tagged'); await h.wait(150);
      await h.step('expr');
      await p.fill('#pr-medium', '2xYT'); await p.fill('#pr-temp', '20'); await h.wait(150);
      await p.click('#ssQuick [data-qsave="1"]'); await h.wait(200);
      const chipsBefore = await p.$$eval('#ssQuick .qchip.mine', els => els.map(e => e.textContent.trim()));
      if (await p.isVisible('#moreBtn')) {
        const exp = await p.getAttribute('#moreBtn', 'aria-expanded');
        if (exp !== 'true') { await p.click('#moreBtn'); await h.wait(200); }
      }
      await p.click('#optReset'); await h.wait(300);
      const chipsAfter = await p.$$eval('#ssQuick .qchip.mine', els => els.map(e => e.textContent.trim()));
      await h.step('construct');
      const epsAfter = await p.$eval('#o-epsMode', e => e.value);
      T.check('optreset: custom quick-fill chip preserved', chipsBefore.length === 1 && JSON.stringify(chipsAfter) === JSON.stringify(chipsBefore), `before=${JSON.stringify(chipsBefore)} after=${JSON.stringify(chipsAfter)}`);
      T.check('optreset: epsMode preserved', epsAfter === 'tagged', `got: "${epsAfter}"`);

      await h.addRun(src('his'));
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#projSave')]);
      const projJson = fs.readFileSync(await dl.path(), 'utf8');
      const csvText = 'Time (min),Signal (mAU)\n0.0,1.2\n1.0,42.5\n2.0,3.4\n3.0,1.1\n';
      await p.click('#homeBtn'); await h.wait(500);
      await p.evaluate(([pText, cText]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([pText], 'companion_bundle_project.json', {type: 'application/json'}));
        dt.items.add(new File([cText], 'companion_trace.csv', {type: 'text/csv'}));
        document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true}));
      }, [projJson, csvText]);
      await h.wait(2200);
      const projOpen = await p.$eval('#projBar', e => !e.hidden);
      const runCards = await p.$$eval('#list .trace[data-kind="run"]', els => els.length);
      const traceNames = await p.$$eval('#list .trace[data-kind="trace"] [data-k="name"]', els => els.map(e => e.value));
      T.check('companion-drop: project opened with its run and companion csv trace added', projOpen && runCards === 1 && traceNames.includes('companion_trace'), `projOpen=${projOpen} runs=${runCards} traces=${JSON.stringify(traceNames)}`);
      T.check('settings-companion: no page errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
