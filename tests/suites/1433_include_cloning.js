// #1433, #1434: one Include Cloning switch replaces the Yes and No answers at project start (Patrick on #222, 2026-11-13).
// It is off for a new project, it shows or hides the cloning steps and their validation, switching it off keeps every
// cloning record, it is saved as the Boolean project property includeCloning, and a project saved before it existed
// opens on when it holds cloning records and off when it does not. Everything is driven through the UI. All values are synthetic.
const {open, H, suite, fs} = require('../lib/harness');

(async () => {
  const T = suite('1433_include_cloning');
  const sw = p => p.locator('#npCloning');
  const head = p => {
    const loc = p.locator('#projType');
    return {
      getAttribute: (...a) => loc.getAttribute(...a),
      click: async (...a) => {
        await p.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
        return loc.click(...a);
      }
    };
  };
  const on = async l => await l.getAttribute('aria-checked') === 'true';
  // every stage, unfolded first (#1436 folds a long Cloning group in the step list)
  const cloneRows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const exportJson = async p => { const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]); return JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); };
  const setPrep = async (p, h, sel, val) => { await p.locator(sel).fill(val); await p.locator(sel).dispatchEvent('change'); await h.wait(300); };
  const importJson = async (p, h, name, data) => {
    await p.click('#homeBtn').catch(() => {}); await h.wait(400); await p.click('#homeQuick'); await h.wait(900);
    await p.setInputFiles('#projFile', {name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data))}); await h.wait(1800); };
  const legacy = (cloning, extra) => Object.assign({app: 'HPLC Figure Bench', version: 1, name: 'legacy synthetic', runs: [], traces: [], gels: [],
    prep: Object.assign({on: true, name: 'pSYN-1'}, cloning === undefined ? {} : {cloning})}, extra || {});

  await T.t('switch', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      T.check('switch/one-control', await sw(p).count() === 1 && await p.locator('#newProj input[type=radio]').count() === 0, 'the Yes and No answers are still there');
      T.check('switch/labelled', (await sw(p).innerText()).trim() === 'Include Cloning' && await sw(p).getAttribute('role') === 'switch', await sw(p).innerText());
      T.check('switch/off-by-default', !(await on(sw(p))), 'on before anyone touched it');
      await sw(p).click(); await h.wait(150);
      T.check('switch/click-turns-on', await on(sw(p)), 'still off after a click');
      await sw(p).focus(); await p.keyboard.press('Space'); await h.wait(150);
      T.check('switch/space-toggles', !(await on(sw(p))), 'Space did not switch it off');
      await p.fill('#npName', ''); await sw(p).focus(); await p.keyboard.press('Enter'); await h.wait(300);
      T.check('switch/enter-toggles', await on(sw(p)), 'Enter did not switch it on');
      T.check('switch/enter-does-not-start-a-project', await p.locator('#npName').isVisible(), 'Enter on the switch submitted the form');
      T.check('switch/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('visibility', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      // off: the project starts at construct and expression, with no cloning step anywhere
      await h.newProject('Off synthetic', 'expression');
      T.check('off/no-cloning-steps', (await cloneRows(h)).length === 0, JSON.stringify(await cloneRows(h)));
      T.check('off/starts-at-construct', await p.locator('#tl [data-step="construct"]').evaluate(e => !!e.closest('.cur, [aria-current]')), 'the construct step is not the current one');
      T.check('off/header-off', !(await on(head(p))), 'the header switch reads on');
      T.check('settings-block-contains-both', await p.evaluate(() => {
        const d = document.querySelector('details.proj-settings');
        if (!d) return false;
        const bar = document.getElementById('projBar');
        const toggle = d.querySelector('.clone-toggle');
        const nameInp = d.querySelector('input[type=text][name=projName]');
        return !d.open && toggle !== null && nameInp !== null &&
          (!bar || (!bar.querySelector(':scope > .clone-toggle') && !bar.querySelector(':scope > input[name=projName]')));
      }), 'Include Cloning toggle and Project Name field must both live inside a closed <details> settings block');
      await h.step('transform');
      T.check('off/no-template-selector', await p.locator('#clonePanel [data-cl=tpl]').count() === 0, 'the cloning templates show with cloning off');
      // switching on in the project reveals the template selector
      await head(p).click(); await h.wait(500);
      T.check('on/setup-step', (await cloneRows(h)).some(x => x.k === 'clone:setup'), JSON.stringify(await cloneRows(h)));
      T.check('on/template-selector', await p.locator('#clonePanel [data-cl=tpl]').count() > 0, 'no template buttons with cloning on');
      T.check('visibility/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('preserve-and-persist', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Keep synthetic', 'cloning');
      T.check('keep/starts-on', await on(head(p)) && (await cloneRows(h)).length === 1, JSON.stringify(await cloneRows(h)));
      await p.locator('#clonePanel [data-cl=tpl][data-v=ath]').click(); await h.wait(500);
      const n = (await cloneRows(h)).length;
      T.check('keep/stages-added', n > 5, String(n));
      // the saved stage count before switching off. Since #1439 a stage can be recorded at Transformation instead of in a
      // row of its own (Transfer to expression), so the rows no longer give the count.
      const before = (await exportJson(p)).prep.cloning.stages.length;
      await head(p).click(); await h.wait(500);
      T.check('keep/off-hides-steps', (await cloneRows(h)).length === 0, JSON.stringify(await cloneRows(h)));
      let j = await exportJson(p);
      T.check('keep/records-kept-when-off', j.prep.includeCloning === false && j.prep.cloning.stages.length === before && before >= n - 1, `includeCloning ${j.prep.includeCloning}, ${j.prep.cloning.stages.length} stages`);
      await head(p).click(); await h.wait(500);
      T.check('keep/on-brings-them-back', (await cloneRows(h)).length === n, `${(await cloneRows(h)).length} of ${n}`);
      j = await exportJson(p);
      T.check('persist/boolean-in-export', j.prep.includeCloning === true, String(j.prep.includeCloning));
      // reopen from the project list: the saved state comes back
      await head(p).click(); await h.wait(500); await h.wait(2500);
      await p.click('#homeBtn'); await h.wait(700);
      await p.locator('#projList [data-pid]', {hasText: 'Keep synthetic'}).first().click(); await h.wait(2500);
      T.check('persist/reopened-off', !(await on(head(p))) && (await cloneRows(h)).length === 0, JSON.stringify(await cloneRows(h)));
      // an exported file opens with the state it was saved in
      await importJson(p, h, 'on_synthetic.json', j);
      T.check('persist/import-restores-on', await on(head(p)) && (await cloneRows(h)).length === n, `${(await cloneRows(h)).length} rows`);
      T.check('preserve/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('validation', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const expr = async () => (await h.timeline()).find(x => x.k === 'expr');
      // on: expression without a connected clone is flagged
      await h.newProject('Validate on synthetic', 'cloning');
      await h.step('expr'); await setPrep(p, h, '#pr-medium', 'TB');
      let e = await expr();
      T.check('validate/on-needs-clone', e.warn && /Connect the clone/.test(e.s), JSON.stringify(e));
      // selecting a clone at Transformation connects it
      await h.step('transform'); await p.click('#prCloneAdd'); await h.wait(300);
      const row = p.locator('#prClones [data-clone]').first();
      await row.locator('input[type=text]').first().fill('C7 synthetic'); await row.locator('input[type=text]').first().dispatchEvent('change'); await h.wait(200);
      await row.locator('input[type=radio]').first().check(); await h.wait(400);
      e = await expr();
      T.check('validate/selected-clone-connects', !e.warn && !/Connect the clone/.test(e.s), JSON.stringify(e));
      // off: the same expression record is not asked for a clone
      await p.click('#homeBtn'); await h.wait(600);
      await h.newProject('Validate off synthetic', 'expression');
      await h.step('expr'); await setPrep(p, h, '#pr-medium', 'TB');
      e = await expr();
      T.check('validate/off-no-clone-needed', !e.warn && !/Connect the clone/.test(e.s), JSON.stringify(e));
      T.check('validation/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('migration', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const st = [{id: 's1', kind: 'design', name: '', skip: false, at: [{id: 'a1', st: 'done', from: '', f: {}, ck: {}}]}];
      const ext = {src: '', ver: '', note: ''};
      await importJson(p, h, 'old_cloning.json', legacy({type: 'cloning', tpl: 'ath', stages: st, ext}));
      T.check('migrate/cloning-project-on', await on(head(p)) && (await cloneRows(h)).length === 2, JSON.stringify(await cloneRows(h)));
      await importJson(p, h, 'old_unspecified_with_stages.json', legacy({type: '', tpl: '', stages: [{id: 's1', kind: 'design', name: '', skip: false, at: []}], ext}));
      T.check('migrate/records-without-type-on', await on(head(p)), 'a project holding a cloning stage opened with cloning off');
      await importJson(p, h, 'old_expression.json', legacy({type: '', tpl: '', stages: [], ext}));
      T.check('migrate/empty-record-off', !(await on(head(p))) && (await cloneRows(h)).length === 0, JSON.stringify(await cloneRows(h)));
      await importJson(p, h, 'old_before_cloning.json', legacy(undefined));
      T.check('migrate/no-record-off', !(await on(head(p))) && (await cloneRows(h)).length === 0, JSON.stringify(await cloneRows(h)));
      const j = await exportJson(p);
      T.check('migrate/saved-as-boolean', j.prep.includeCloning === false, String(j.prep.includeCloning));
      T.check('migration/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('confirmation-dialog', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const modal = p.locator('#cloneArchiveModal');

      // 1. Data-exist branch: seed a project with cloning stages
      await h.newProject('Confirm synthetic', 'cloning');
      await p.locator('#clonePanel [data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      const n = (await cloneRows(h)).length;
      T.check('dialog/stages-present', n > 5, String(n));

      // Toggle Include Cloning OFF: dialog should appear
      await head(p).click();
      await h.wait(300);
      T.check('dialog/visible-when-data-exists', await modal.isVisible(), 'confirmation dialog not visible');
      T.check('dialog/title-text', await p.locator('text=Remove cloning from this workflow?').isVisible(), 'title missing');
      T.check('dialog/body-text', await p.locator('text=The cloning stage will be hidden, but all cloning data will be saved. You can restore the stage at any time from Project Settings.').isVisible(), 'body missing');
      T.check('dialog/remove-button', await p.locator('#cloneArchiveConfirm').isVisible(), 'Remove and Save Data button missing');
      T.check('dialog/cancel-button', await p.locator('#cloneArchiveCancel').isVisible(), 'Cancel button missing');

      // Cancel path: clicking Cancel closes dialog and keeps cloning ON
      await p.locator('#cloneArchiveCancel').click();
      await h.wait(300);
      T.check('dialog/cancel-closes-dialog', !(await modal.isVisible()), 'dialog still visible after cancel');
      T.check('dialog/cancel-restores-on', await on(head(p)), 'cancel did not restore toggle to ON');
      T.check('dialog/cancel-keeps-stages', (await cloneRows(h)).length === n, `expected ${n} rows after cancel, got ${(await cloneRows(h)).length}`);

      // Toggle OFF again and confirm
      await head(p).click();
      await h.wait(300);
      T.check('dialog/reappears-on-second-toggle', await modal.isVisible(), 'dialog did not reappear on second toggle');
      await p.locator('#cloneArchiveConfirm').click();
      await h.wait(300);
      T.check('dialog/confirm-closes-dialog', !(await modal.isVisible()), 'dialog still visible after confirm');
      T.check('dialog/confirm-toggle-off', !(await on(head(p))), 'toggle not off after confirm');
      T.check('dialog/confirm-hides-stages', (await cloneRows(h)).length === 0, `expected 0 rows after confirm, got ${(await cloneRows(h)).length}`);

      // 2. Empty-cloning branch: seed a project with zero cloning stages
      await p.click('#homeBtn'); await h.wait(600);
      await h.newProject('Empty cloning synthetic', 'cloning');
      T.check('empty/starts-on', await on(head(p)), 'new cloning project toggle should be on');
      const rowsBefore = await cloneRows(h);
      T.check('empty/zero-stages', rowsBefore.length === 1 && rowsBefore[0].k === 'clone:setup', JSON.stringify(rowsBefore));

      const tlBefore = await h.timeline();
      const activeBefore = tlBefore.filter(x => !/^clone:/.test(x.k));

      // Toggle Include Cloning OFF: no dialog should appear
      await head(p).click();
      await h.wait(300);
      T.check('empty/no-dialog-shown', !(await modal.isVisible()), 'dialog should not appear when zero cloning stages');
      T.check('empty/no-title-visible', !(await p.locator('text=Remove cloning from this workflow?').isVisible()), 'title should not be visible');
      T.check('empty/toggle-is-off', !(await on(head(p))), 'toggle should read OFF');

      const tlAfter = await h.timeline();
      const activeAfter = tlAfter.filter(x => !/^clone:/.test(x.k));
      T.check('empty/active-workflow-same-length', activeBefore.length === activeAfter.length, `before: ${activeBefore.length}, after: ${activeAfter.length}`);
      T.check('empty/active-workflow-same-ids', activeBefore.every((x, i) => x.k === activeAfter[i].k), 'stage ids should match');

      T.check('confirmation-dialog/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('archival-progress-and-restore', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const openSettings = () => p.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
      const restoreBtn = p.locator('details.proj-settings #projCloneRestore');
      const progText = async () => (await p.locator('#stepsProg').count()) ? (await p.locator('#stepsProg').innerText()).trim() : '';
      const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

      // Empty expression project: Restore Cloning Workflow is hidden
      await h.newProject('No cloning data synthetic', 'expression');
      await openSettings();
      const hiddenWhenEmpty = !(await restoreBtn.isVisible());

      // Seed a project with cloning stages (completed + parent-child link + gel attachment) and downstream purification steps
      await p.click('#homeBtn'); await h.wait(600);
      await h.newProject('Archive & Restore Synthetic', 'cloning');
      await openSettings();
      const hiddenWhenActive = !(await restoreBtn.isVisible());
      T.check('archive/restore-btn-hidden-when-on-or-empty', hiddenWhenEmpty && hiddenWhenActive, `emptyHidden=${hiddenWhenEmpty}, activeHidden=${hiddenWhenActive}`);

      await p.locator('#clonePanel [data-cl=tpl][data-v=pcr]').click();
      await h.wait(500);
      const cRowsBefore = await cloneRows(h);
      const desRow = cRowsBefore[1]; // Construct design
      const pcrRow = cRowsBefore.find(r => /PCR amplification/i.test(r.t));
      const gelRow = cRowsBefore.find(r => /PCR product analysis/i.test(r.t));

      // Complete stage 1 (Construct design) -> auto-fills downstream construct plasmid name
      await h.step(desRow.k);
      await p.locator('#clonePanel [data-cf="construct"]').fill('pSYN-GFP');
      await p.locator('#clonePanel [data-cf="construct"]').dispatchEvent('change');
      await p.locator('#clonePanel select[data-cst]').selectOption('done');
      await h.wait(300);

      // Complete stage 2 (PCR amplification) linked via Comes from to Construct design attempt
      await h.step(pcrRow.k);
      const fromVal = await p.locator('#clonePanel select[data-cfrom] option').nth(1).getAttribute('value');
      await p.locator('#clonePanel select[data-cfrom]').selectOption(fromVal);
      await p.locator('#clonePanel [data-cf="pol"]').fill('Q5 High-Fidelity 2X Master Mix');
      await p.locator('#clonePanel [data-cf="pol"]').dispatchEvent('change');
      await p.locator('#clonePanel select[data-cst]').selectOption('done');
      await h.wait(300);

      // Upload synthetic agarose gel attachment and complete PCR product analysis stage
      await h.step(gelRow.k);
      await p.setInputFiles('#clonePanel .cl-gel-file', {name: 'syn_agarose.png', mimeType: 'image/png', buffer: png1x1});
      await h.wait(600);
      await p.locator('#clonePanel select[data-cst]').selectOption('done');
      await h.wait(300);

      // Complete Transformation (with selected clone), Expression, and a Purification column step
      await h.step('transform');
      await setPrep(p, h, '#pr-strain2', 'BL21(DE3)');
      await setPrep(p, h, '#pr-trSel', 'Kanamycin');
      await p.click('#prCloneAdd'); await h.wait(250);
      const cRow = p.locator('#prClones [data-clone]').first();
      await cRow.locator('input[type=text]').first().fill('C3 synthetic');
      await cRow.locator('input[type=text]').first().dispatchEvent('change'); await h.wait(200);
      await cRow.locator('input[type=radio]').first().check(); await h.wait(300);

      await h.step('expr');
      await setPrep(p, h, '#pr-medium', 'TB');

      await p.click('#tl [data-addmenu]');
      await p.click('#tl [data-addstep="man:column"]');
      await h.wait(350);
      await setPrep(p, h, '#man-resin', '2 mL Ni-NTA agarose');
      await setPrep(p, h, '#man-elution', '250 mM imidazole');
      await setPrep(p, h, '#man-vol', '4');
      await setPrep(p, h, '#man-conc', '2.5');

      await h.allSteps();
      const tlOn = await h.timeline();
      const cloneCountOn = tlOn.filter(s => /^clone:/.test(s.k)).length;
      const cloneDoneOn = tlOn.filter(s => /^clone:/.test(s.k) && s.done && !s.warn).length;
      const totalOn = tlOn.length;
      const doneOn = tlOn.filter(s => s.done && !s.warn).length;
      const progBefore = await progText();
      const beforeJson = await exportJson(p);
      const beforeStages = beforeJson.prep.cloning.stages;
      const beforeIds = beforeStages.map(s => s.id);
      const beforeAtCounts = beforeStages.map(s => s.at.length);

      // Toggle Include Cloning OFF and confirm archival
      await head(p).click();
      await h.wait(300);
      if (await p.locator('#cloneArchiveConfirm').isVisible()) {
        await p.locator('#cloneArchiveConfirm').click();
        await h.wait(300);
      }
      await openSettings();
      const restoreVis = await restoreBtn.isVisible();
      const restoreLabel = restoreVis ? (await restoreBtn.innerText()).trim() : '';
      T.check('archive/restore-btn-visible', restoreVis && restoreLabel === 'Restore Cloning Workflow', `visible=${restoreVis}, label=${restoreLabel}`);

      const expectedArchivedProg = `${doneOn - cloneDoneOn} of ${totalOn - cloneCountOn} steps done`;
      const progArchived = await progText();
      T.check('archive/active-progress-excludes-archived',
        progBefore === `${doneOn} of ${totalOn} steps done` && progArchived === expectedArchivedProg && cloneDoneOn === 3 && (doneOn - cloneDoneOn) >= 3,
        `before="${progBefore}", archived="${progArchived}", expected="${expectedArchivedProg}"`);

      await h.step('construct');
      const conNameAfterArchive = await p.locator('#pr-name').inputValue();
      await h.step('transform');
      const selCloneChecked = await p.locator('#prClones [data-clone] input[type=radio]').first().isChecked();
      const tlOff = await h.timeline();
      const exprOff = tlOff.find(s => s.k === 'expr');
      const manOff = tlOff.find(s => /^man:/.test(s.k));
      T.check('archive/downstream-links-preserved',
        conNameAfterArchive === 'pSYN-GFP' && selCloneChecked && exprOff && exprOff.done && !exprOff.warn && manOff && manOff.done && !manOff.warn,
        JSON.stringify({conNameAfterArchive, selCloneChecked, exprOff, manOff}));

      // Close project, verify Home card progress matches active-only steps, and reopen project
      await h.wait(600);
      await p.click('#homeBtn');
      await h.wait(900);
      const cardMeta = await p.locator('#projList [data-pid]', {hasText: 'Archive & Restore Synthetic'}).first().locator('.pm').innerText();
      T.check('archive/home-card-excludes-archived', cardMeta.includes(expectedArchivedProg), cardMeta);

      await p.locator('#projList [data-pid]', {hasText: 'Archive & Restore Synthetic'}).first().click();
      await h.wait(2200);
      await openSettings();
      const reopenRestoreVis = await restoreBtn.isVisible();
      const reopenProg = await progText();
      T.check('archive/reopen-stays-archived',
        !(await on(head(p))) && (await cloneRows(h)).length === 0 && reopenRestoreVis && reopenProg === expectedArchivedProg,
        `on=${await on(head(p))}, rows=${(await cloneRows(h)).length}, restoreVis=${reopenRestoreVis}, prog="${reopenProg}"`);

      // Restore cloning workflow via Project Settings Restore Cloning Workflow control
      if (reopenRestoreVis) await restoreBtn.click();
      else await head(p).click();
      await h.wait(500);

      await openSettings();
      T.check('archive/restore-hides-btn-and-enables-toggle', await on(head(p)) && !(await restoreBtn.isVisible()), `on=${await on(head(p))}, restoreVis=${await restoreBtn.isVisible()}`);
      const progRestored = await progText();
      T.check('archive/restore-reverts-progress', progRestored === `${doneOn} of ${totalOn} steps done`, `restored="${progRestored}", expected="${doneOn} of ${totalOn} steps done"`);

      const afterJson = await exportJson(p);
      const afterStages = afterJson.prep.cloning.stages;
      const afterIds = afterStages.map(s => s.id);
      const afterAtCounts = afterStages.map(s => s.at.length);
      const pcrAfter = afterStages.find(s => s.kind === 'pcr_setup');
      const gelAfter = afterStages.find(s => s.kind === 'gel');
      const doneKinds = afterStages.filter(s => s.at.some(a => a.st === 'done')).map(s => s.kind);
      await h.step('construct');
      const conNameRestored = await p.locator('#pr-name').inputValue();
      T.check('archive/restore-preserves-stages-order-links-gel-no-dups',
        afterStages.length === beforeStages.length &&
        afterIds.join(',') === beforeIds.join(',') &&
        afterAtCounts.join(',') === beforeAtCounts.join(',') &&
        doneKinds.length === 3 &&
        pcrAfter && pcrAfter.at[0].from === fromVal &&
        gelAfter && gelAfter.gel && gelAfter.gel.name === 'syn_agarose.png' && /^data:image\/png/.test(gelAfter.gel.image || '') &&
        conNameRestored === 'pSYN-GFP' &&
        (await cloneRows(h)).length === cloneCountOn,
        JSON.stringify({len: afterStages.length, beforeLen: beforeStages.length, doneKinds, from: pcrAfter && pcrAfter.at[0].from, fromVal, gelName: gelAfter && gelAfter.gel && gelAfter.gel.name, hasImg: !!(gelAfter && gelAfter.gel && gelAfter.gel.image), conNameRestored}));

      T.check('archival-progress-and-restore/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  T.done();
})();
