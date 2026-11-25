// #1402: the cloning workflow engine. A new project has an Include Cloning switch (#1433), a cloning project picks a
// workflow whose stages appear in the step list, each stage keeps every attempt (a failed one included), rules flag
// a record and never fill it in, and the whole record survives an export and import. Older projects open unchanged.
// Everything is driven through the UI. All values are synthetic.
const {open, H, suite, fs, path, DATA} = require('../lib/harness');

(async () => {
  const T = suite('1402_cloning_engine');
  const cl = p => p.locator('#clonePanel');
  // every stage, unfolded first (#1436 folds a long Cloning group in the step list)
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const row = async (h, title) => (await rows(h)).find(x => x.t === title);
  const go = async (h, title) => { const r = await row(h, title); if (!r) throw new Error(`no stage "${title}" in the step list`); await h.step(r.k); return r.k; };
  const field = (p, label) => cl(p).locator(':is(.cl-single, .cl-at[open]) label.f', {hasText: label}).locator('input, textarea, select').first();
  const setStatus = async (p, h, n, v) => { await cl(p).locator('[data-cst]').nth(n).selectOption(v); await h.wait(300); };
  const exportJson = async p => { const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]); return fs.readFileSync(await dl.path(), 'utf8'); };
  const ATH = ['Construct and mutation design', 'Forward and reverse primer design', 'Primer ordering, resuspension and working stocks', 'Q5 PCR setup', 'Thermocycler program', 'Agarose-gel verification',
    'Selection of successful PCR product', 'KLD treatment', 'Cloning transformation', 'Colony selection', 'Overnight culture', 'Miniprep', 'Sequencing and alignment', 'Selection of a sequence-verified clone'];
  // #1439: the cloning-strain transformation is named "Cloning transformation", and Transfer to expression is recorded at the
  // Transformation step instead of in a row of its own (Patrick's request). The template still holds 15 stages.
  const trRow = async h => (await h.timeline()).find(x => x.k === 'transform');
  const trPlasmid = async (p, h, v) => { await p.locator('#pr-trPlasmid').fill(v); await p.locator('#pr-trPlasmid').dispatchEvent('change'); await h.wait(250); };

  await T.t('entry', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      // #1433 replaced the Yes and No answers with one Include Cloning switch, off by default (Patrick on #222, 2026-11-13).
      // The two checks that required an answer (entry/no-preselection, entry/choice-required) went with them, on his request.
      T.check('entry/switch-off-by-default', await p.locator('#npCloning').getAttribute('aria-checked') === 'false', await p.locator('#npCloning').getAttribute('aria-checked'));

      await h.newProject('Expression only', 'expression');
      T.check('entry/expression-has-no-cloning-rows', (await rows(h)).length === 0, JSON.stringify(await rows(h)));
      T.check('entry/expression-header', await p.locator('#projType').getAttribute('aria-checked') === 'false', await p.locator('#projType').getAttribute('aria-checked'));
      await h.step('transform');
      T.check('entry/expression-says-cloning-outside', /outside this workflow/.test(await cl(p).innerText()), await cl(p).innerText());
      // a construct is not recorded as sequence verified without saying how
      await cl(p).locator('[data-cext=ver]').selectOption('yes'); await h.wait(300);
      T.check('entry/verified-needs-evidence', await cl(p).locator('.cl-flag').count() === 1, 'no flag for a verified construct with no evidence');
      await cl(p).locator('[data-cext=note]').fill('Whole-plasmid sequencing, synthetic record'); await cl(p).locator('[data-cext=note]').dispatchEvent('change'); await h.wait(300);
      T.check('entry/verified-with-evidence', await cl(p).locator('.cl-flag').count() === 0, 'the flag stayed after the evidence was entered');
      // cloning can be added later, and nothing is lost
      await p.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
      await p.locator('#projType').click(); await h.wait(500);
      T.check('entry/cloning-added-later', (await rows(h)).some(x => x.k === 'clone:setup'), JSON.stringify(await rows(h)));
      T.check('entry/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  let saved = '';
  await T.t('ath', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('ATH synthetic', 'cloning');
      T.check('ath/opens-on-cloning', (await rows(h)).length === 1 && /Choose a cloning workflow/.test((await rows(h))[0].s), JSON.stringify(await rows(h)));
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(500);
      const got = (await rows(h)).slice(1).map(x => x.t);
      T.check('ath/stages-in-order', JSON.stringify(got) === JSON.stringify(ATH), got.join(' | '));
      T.check('ath/upstream-steps-kept', ['construct', 'transform', 'expr', 'lysis'].every(k => true) && (await h.timeline()).filter(x => ['construct', 'transform', 'expr', 'lysis'].includes(x.k)).length === 4, 'an existing step is missing');

      // a failed PCR stays in the record when the step is repeated
      await go(h, 'Q5 PCR setup');
      await field(p, 'Polymerase or master mix').fill('Q5 synthetic mix'); await field(p, 'Polymerase or master mix').dispatchEvent('change'); await h.wait(250);
      await setStatus(p, h, 0, 'fail');
      T.check('ath/failed-not-done', !(await row(h, 'Q5 PCR setup')).done, 'a failed attempt marked the stage done');
      const svg = await h.exportSvg(), bx = await h.svgBoxes(svg);
      const ATH_SHORT = ['Design', 'Primers', 'Stocks', 'PCR', 'Cycler', 'Gel', 'Pick PCR', 'KLD', 'Transform', 'Colonies', 'Culture', 'Miniprep', 'Seq', 'Verify', 'Transfer'];
      T.check('ath/tracker-stage-labels', ATH_SHORT.every(t => bx.texts.some(x => x.t === t)), 'missing stage label in SVG: ' + ATH_SHORT.filter(t => !bx.texts.some(x => x.t === t)).join(', '));
      T.check('ath/tracker-not-clipped', bx.clipped.length === 0, bx.clipped.join(' | '));
      const pg = await p.context().newPage();
      let marks = {total: 0, done: 0, fail: 0};
      try {
        await pg.setContent('<!doctype html><meta charset="utf-8"><body>' + svg + '</body>');
        marks = await pg.evaluate(() => ({
          total: document.querySelectorAll('svg [data-mark]').length,
          done: document.querySelectorAll('svg [data-mark="done"]').length,
          fail: document.querySelectorAll('svg [data-mark="fail"]').length
        }));
      } finally { await pg.close(); }
      T.check('ath/failed-not-completed', marks.total === 15 && marks.fail === 1 && marks.done === 0 && !svg.includes('Not started'), JSON.stringify(marks));
      await cl(p).locator('[data-cl=addat]').click(); await h.wait(300);
      T.check('ath/repeat-keeps-failure', await cl(p).locator('.cl-at').count() === 2 && /Failed/.test(await cl(p).locator('.cl-at').first().locator('summary').innerText()), await cl(p).innerText());
      await setStatus(p, h, 1, 'done');
      const pcr = await row(h, 'Q5 PCR setup');
      T.check('ath/attempt-summary', /2 attempts: 1 completed, 1 failed/.test(pcr.s) && pcr.done, pcr.s);

      // a selected product must come from a gel record and name its lane
      await go(h, 'Agarose-gel verification'); await setStatus(p, h, 0, 'done');
      await go(h, 'Selection of successful PCR product'); await setStatus(p, h, 0, 'done');
      let pick = await row(h, 'Selection of successful PCR product');
      T.check('ath/pick-flagged-without-gel', pick.warn && !pick.done && /gel record/.test(pick.s), pick.s);
      await cl(p).locator('[data-cfrom]').first().selectOption({index: 1}); await h.wait(300);
      pick = await row(h, 'Selection of successful PCR product');
      T.check('ath/pick-flagged-without-lane', pick.warn && /lane/.test(pick.s), pick.s);
      await field(p, 'Gel lane of the selected product').fill('Lane 3'); await field(p, 'Gel lane of the selected product').dispatchEvent('change'); await h.wait(300);
      pick = await row(h, 'Selection of successful PCR product');
      T.check('ath/pick-linked', pick.done && !pick.warn, pick.s);

      // a clone is not sequence verified without a completed sequencing record
      await go(h, 'Selection of a sequence-verified clone'); await setStatus(p, h, 0, 'done');
      const sel = await row(h, 'Selection of a sequence-verified clone');
      T.check('ath/verified-needs-sequencing', sel.warn && !sel.done, sel.s);
      // and moving on without one has to be said out loud
      await h.step('transform'); await setStatus(p, h, 0, 'done');
      T.check('ath/transfer-flagged', (await trRow(h)).warn, (await trRow(h)).s);
      await cl(p).locator('[data-cf=bypass]').check(); await h.wait(300);
      T.check('ath/bypass-recorded', !(await trRow(h)).warn, (await trRow(h)).s);
      await trPlasmid(p, h, 'pET28-ATH-syn');
      await field(p, 'Clone ID').fill('Clone 4'); await field(p, 'Clone ID').dispatchEvent('change'); await h.wait(200);

      // transformation step and methods text reflect the cloning transfer attempt and bypass
      await h.step('transform');
      const trLine = await cl(p).innerText();
      T.check('ath/transform-names-plasmid', trLine.includes('pET28-ATH-syn'), trLine);
      T.check('ath/transform-bypassed-says-unverified', /verification was not recorded/.test(trLine), trLine);
      await h.step('figure'); await p.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; }); await h.wait(300);
      const mText = await h.methods();
      T.check('ath/methods-names-plasmid', mText.includes('pET28-ATH-syn'), mText);
      T.check('ath/methods-bypassed-says-unverified', /verification was not recorded/.test(mText), mText);

      // a stage can be skipped, and the miniprep carries its checklist and its recipe note
      await go(h, 'Overnight culture'); await cl(p).locator('[data-cl=skip]').click(); await h.wait(300);
      T.check('ath/skip', /Skipped/.test((await row(h, 'Overnight culture')).s), (await row(h, 'Overnight culture')).s);
      await go(h, 'Miniprep');
      T.check('ath/miniprep-checklist', await cl(p).locator('[data-cck]').count() === 11, String(await cl(p).locator('[data-cck]').count()));
      T.check('ath/n3-requires-review', /N3:.*Requires review/.test(await cl(p).innerText()), 'the N3 recipe is not marked Requires review');

      // the lineage names the failure as a failure and claims no verified clone
      await h.step('clone:setup');
      const lin = await p.locator('#clLineage').innerText();
      T.check('ath/lineage-keeps-failure', /Q5 PCR setup, attempt 1: failed/.test(lin) && /Q5 PCR setup, attempt 2: completed/.test(lin), lin);
      T.check('ath/lineage-not-verified', /No sequence-verified clone is recorded yet/.test(lin), lin);

      saved = await exportJson(p);
      const d = JSON.parse(saved), c = d.prep && d.prep.cloning;
      T.check('ath/export-carries-record', !!c && c.type === 'cloning' && c.tpl === 'ath' && c.stages.length === 15 && c.stages.find(s => s.kind === 'pcr_setup').at.length === 2, JSON.stringify(c).slice(0, 300));
      T.check('ath/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('reload', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      if (!saved) throw new Error('nothing was exported by the ath test');
      await p.setInputFiles('#projFile', {name: 'ath_synthetic.json', mimeType: 'application/json', buffer: Buffer.from(saved)}); await h.wait(1500);
      const got = (await rows(h)).slice(1).map(x => x.t);
      T.check('reload/stages', JSON.stringify(got) === JSON.stringify(ATH), got.join(' | '));
      const pcr = await row(h, 'Q5 PCR setup');
      T.check('reload/attempts', !!pcr && /2 attempts: 1 completed, 1 failed/.test(pcr.s), pcr && pcr.s);
      await go(h, 'Q5 PCR setup');
      await cl(p).locator('.cl-at').first().locator('summary').click(); await h.wait(200);
      T.check('reload/field-value', await cl(p).locator('.cl-at').first().locator('[data-cf=pol]').inputValue() === 'Q5 synthetic mix', 'the typed value did not come back');
      T.check('reload/skip-kept', /Skipped/.test((await row(h, 'Overnight culture')).s), (await row(h, 'Overnight culture')).s);
      T.check('reload/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('other-workflows', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('HiFi synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=hifi]').click(); await h.wait(500);
      const hf = (await rows(h)).slice(1).map(x => x.t);
      T.check('hifi/stages', hf.length === 16 && hf[0] === 'gBlock and final-construct design' && hf.includes('Gradient PCR') && hf.includes('HiFi assembly') && hf.includes('Glycerol-stock creation') && hf.includes('Whole-plasmid sequencing') && hf.includes('Miniprep'), hf.join(' | '));
      // the HiFi reaction must name its input DNA
      await go(h, 'HiFi assembly'); await setStatus(p, h, 0, 'done');
      T.check('hifi/needs-input', /input DNA/.test((await row(h, 'HiFi assembly')).s), (await row(h, 'HiFi assembly')).s);

      // competent cells: a batch is not Qualified without a test, and a transformation can name the batch
      await h.step('clone:setup');
      await cl(p).locator('[data-cadd]').selectOption('cc:all'); await h.wait(500);
      const cc = (await rows(h)).map(x => x.t).filter(t => /^Competent/.test(t));
      T.check('cc/stages', cc.length === 6, cc.join(' | '));
      await go(h, 'Competent-cell batch');
      await field(p, 'Batch ID').fill('CC-SYN-01'); await field(p, 'Batch ID').dispatchEvent('change'); await h.wait(250);
      await field(p, 'Batch state').selectOption('Qualified'); await h.wait(300);
      T.check('cc/qualified-needs-test', /competency/.test((await row(h, 'Competent-cell batch')).s), (await row(h, 'Competent-cell batch')).s);
      await field(p, 'Competency-test result').fill('1e7 cfu per µg pUC19, synthetic'); await field(p, 'Competency-test result').dispatchEvent('change'); await h.wait(300);
      T.check('cc/qualified-with-test', !/competency/.test((await row(h, 'Competent-cell batch')).s), (await row(h, 'Competent-cell batch')).s);
      await go(h, 'Competent cells: growth and harvest');
      await field(p, 'OD600 at harvest').fill('0.9'); await field(p, 'OD600 at harvest').dispatchEvent('change'); await h.wait(300);
      T.check('cc/od-range-flagged', /outside 0\.4 to 0\.6/.test((await row(h, 'Competent cells: growth and harvest')).s), (await row(h, 'Competent cells: growth and harvest')).s);
      await go(h, 'Cloning transformation');
      T.check('cc/batch-offered-to-transformation', await cl(p).locator('#clBatches option[value="CC-SYN-01"]').count() === 1, 'the batch made in this project is not offered as the cell source');
      await setStatus(p, h, 0, 'done');
      T.check('cc/transformation-needs-batch', /competent-cell batch/.test(await cl(p).innerText()), 'a completed transformation with no batch was not flagged');
      T.check('other/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('legacy', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await p.setInputFiles('#projFile', {name: 'legacy_project.json', mimeType: 'application/json', buffer: fs.readFileSync(path.join(DATA, 'legacy_project.json'))}); await h.wait(1500);
      const tl = await h.timeline();
      T.check('legacy/opens', tl.length > 3 && tl.some(x => x.k === 'construct'), JSON.stringify(tl.map(x => x.k)));
      T.check('legacy/no-cloning-rows', !tl.some(x => /^clone:/.test(x.k)), JSON.stringify(tl.map(x => x.k)));
      await p.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
      const inProj = await p.locator('#projType').isVisible();
      // a project saved before #1402 holds no cloning record, so Include Cloning opens off (#1433)
      if (inProj) T.check('legacy/cloning-off', await p.locator('#projType').getAttribute('aria-checked') === 'false', await p.locator('#projType').getAttribute('aria-checked'));
      T.check('legacy/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('stage-rename-dup', async () => {
    let exported = '';
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Stage dup synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(400);
      await go(h, 'Q5 PCR setup');

      // two attempts so duplication proves it carries the last attempt's fields
      await field(p, 'Polymerase or master mix').fill('Old synthetic mix'); await field(p, 'Polymerase or master mix').dispatchEvent('change'); await h.wait(200);
      await setStatus(p, h, 0, 'fail');
      await cl(p).locator('[data-cl=addat]').click(); await h.wait(300);
      await field(p, 'Polymerase or master mix').fill('Q5 synthetic mix'); await field(p, 'Polymerase or master mix').dispatchEvent('change'); await h.wait(200);
      await field(p, 'Reaction volume').fill('25'); await field(p, 'Reaction volume').dispatchEvent('change'); await h.wait(200);
      await field(p, 'Date').fill('2026-11-12'); await field(p, 'Date').dispatchEvent('change'); await h.wait(200);
      await field(p, 'Deviations').fill('Synthetic deviation'); await field(p, 'Deviations').dispatchEvent('change'); await h.wait(200);
      await field(p, 'Result and notes').fill('Synthetic note'); await field(p, 'Result and notes').dispatchEvent('change'); await h.wait(200);
      await setStatus(p, h, 1, 'done');

      const nameBox = cl(p).locator('label.f', {hasText: 'Stage name'}).locator('input');
      const dupBtn = cl(p).locator('button', {hasText: 'Duplicate this stage'});
      T.check('dupst/rename-field-present', await nameBox.isVisible(), 'no stage rename field');
      T.check('dupst/button-present', await dupBtn.isVisible(), 'no Duplicate this stage button');
      if (await nameBox.isVisible() && await dupBtn.isVisible()) {
        await nameBox.fill('Q5 PCR, insert 1'); await h.wait(250);
        T.check('dupst/renamed', !!(await row(h, 'Q5 PCR, insert 1')) && !(await row(h, 'Q5 PCR setup')) && /Q5 PCR, insert 1/.test(await p.locator('#ssTitle').innerText()), JSON.stringify(await rows(h)));
        await nameBox.fill(''); await h.wait(250);
        T.check('dupst/empty-uses-default', !!(await row(h, 'Q5 PCR setup')) && /Q5 PCR setup/.test(await p.locator('#ssTitle').innerText()), await p.locator('#ssTitle').innerText());
        await nameBox.fill('Q5 PCR, insert 1'); await h.wait(250);

        await dupBtn.click(); await h.wait(400);
        const list = (await rows(h)).slice(1).map(x => x.t), idx = list.indexOf('Q5 PCR, insert 1');
        T.check('dupst/inserted-after', idx >= 0 && list[idx + 1] === 'Q5 PCR setup', list.join(' | '));
        T.check('dupst/one-not-started-attempt', await cl(p).locator('.cl-at').count() === 0 && await cl(p).locator('[data-cst]').first().inputValue() === 'todo', await cl(p).innerText());
        T.check('dupst/carries-last-fields', await field(p, 'Polymerase or master mix').inputValue() === 'Q5 synthetic mix' && await field(p, 'Reaction volume').inputValue() === '25', await field(p, 'Polymerase or master mix').inputValue());
        T.check('dupst/drops-date-notes-dev', await field(p, 'Date').inputValue() === '' && await field(p, 'Deviations').inputValue() === '' && await field(p, 'Result and notes').inputValue() === '', 'date, deviations or notes were copied');

        await nameBox.fill('Q5 PCR, insert 2'); await h.wait(250);
        exported = await exportJson(p);
      }
      T.check('dupst/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }

    if (exported) {
      const {p: p2, errs: errs2, close: close2} = await open(), h2 = H(p2);
      try {
        p2.setDefaultTimeout(15000);
        await p2.setInputFiles('#projFile', {name: 'stage_dup_synthetic.json', mimeType: 'application/json', buffer: Buffer.from(exported)}); await h2.wait(1500);
        const list = (await rows(h2)).slice(1).map(x => x.t), idx = list.indexOf('Q5 PCR, insert 1');
        T.check('dupst/reload-both-names', idx >= 0 && list[idx + 1] === 'Q5 PCR, insert 2', list.join(' | '));
        await go(h2, 'Q5 PCR, insert 1');
        T.check('dupst/reload-orig-name-box', await cl(p2).locator('label.f', {hasText: 'Stage name'}).locator('input').inputValue() === 'Q5 PCR, insert 1', 'original stage name lost');
        await go(h2, 'Q5 PCR, insert 2');
        T.check('dupst/reload-dup-name-box', await cl(p2).locator('label.f', {hasText: 'Stage name'}).locator('input').inputValue() === 'Q5 PCR, insert 2', 'duplicated stage name lost');
        T.check('dupst/reload-copied-field', await field(p2, 'Polymerase or master mix').inputValue() === 'Q5 synthetic mix' && await field(p2, 'Reaction volume').inputValue() === '25', await field(p2, 'Polymerase or master mix').inputValue());
        T.check('dupst/reload-not-started', await cl(p2).locator('[data-cst]').first().inputValue() === 'todo' && await field(p2, 'Date').inputValue() === '' && await field(p2, 'Deviations').inputValue() === '' && await field(p2, 'Result and notes').inputValue() === '', 'status/date/notes/dev changed after reload');
        T.check('dupst/reload no page errors', errs2.length === 0, errs2.join(' | '));
      } finally { await close2(); }
    }
  });

  await T.t('cloning-methods-and-transform', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      // Expression project: plasmid source record
      await h.newProject('Expr Source Synthetic', 'expression');
      await h.step('transform');
      await cl(p).locator('[data-cext=src]').fill('Addgene #12345'); await cl(p).locator('[data-cext=src]').dispatchEvent('change'); await h.wait(200);
      await cl(p).locator('[data-cext=ver]').selectOption('yes'); await h.wait(200);
      await h.step('figure'); await p.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; }); await h.wait(300);
      let m = await h.methods();
      T.check('expr-source/unverified-without-note', m.includes('Addgene #12345') && !m.includes('sequence verified'), m);
      await h.step('transform');
      await cl(p).locator('[data-cext=note]').fill('Whole-plasmid sequencing'); await cl(p).locator('[data-cext=note]').dispatchEvent('change'); await h.wait(200);
      await h.step('figure'); await h.wait(300);
      m = await h.methods();
      T.check('expr-source/verified-with-note', m.includes('Addgene #12345') && m.includes('sequence verified') && m.includes('Whole-plasmid sequencing'), m);
      T.check('expr-source/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }

    const {p: p2, errs: errs2, close: close2} = await open(), h2 = H(p2);
    try {
      p2.setDefaultTimeout(15000);
      // Cloning ATH project: fully verified
      await h2.newProject('ATH Verified Synthetic', 'cloning');
      await cl(p2).locator('[data-cl=tpl][data-v=ath]').click(); await h2.wait(400);
      await go(h2, 'Construct and mutation design');
      await field(p2, 'Parent plasmid').fill('pET28-SUMO'); await field(p2, 'Parent plasmid').dispatchEvent('change'); await h2.wait(200);
      await field(p2, 'Mutation type').selectOption('Substitution'); await h2.wait(200);
      await field(p2, 'Mutation position').fill('K12A'); await field(p2, 'Mutation position').dispatchEvent('change'); await h2.wait(200);
      await setStatus(p2, h2, 0, 'done');

      await go(h2, 'Q5 PCR setup');
      await field(p2, 'Polymerase or master mix').fill('Q5 High-Fidelity DNA Polymerase'); await field(p2, 'Polymerase or master mix').dispatchEvent('change'); await h2.wait(200);
      await setStatus(p2, h2, 0, 'done');

      await go(h2, 'KLD treatment');
      await setStatus(p2, h2, 0, 'done');

      await go(h2, 'Cloning transformation');
      await field(p2, 'Host strain').fill('NEB 5-alpha'); await field(p2, 'Host strain').dispatchEvent('change'); await h2.wait(200);
      await setStatus(p2, h2, 0, 'done');

      await go(h2, 'Sequencing and alignment');
      await field(p2, 'Sequencing provider').fill('Plasmidsaurus'); await field(p2, 'Sequencing provider').dispatchEvent('change'); await h2.wait(200);
      await setStatus(p2, h2, 0, 'done');

      await go(h2, 'Selection of a sequence-verified clone');
      await cl(p2).locator('[data-cfrom]').first().selectOption({index: 1}); await h2.wait(200);
      await field(p2, 'Verification status').selectOption('Sequence verified'); await h2.wait(200);
      await setStatus(p2, h2, 0, 'done');

      await h2.step('transform');
      await trPlasmid(p2, h2, 'pET28-SUMO-K12A');
      await field(p2, 'Clone ID').fill('Clone 1'); await field(p2, 'Clone ID').dispatchEvent('change'); await h2.wait(200);
      await setStatus(p2, h2, 0, 'done');

      await h2.step('transform');
      const trText = await cl(p2).innerText();
      T.check('verified/transform-names-plasmid', trText.includes('pET28-SUMO-K12A'), trText);
      T.check('verified/transform-names-clone', trText.includes('Clone 1'), trText);
      T.check('verified/transform-shows-verified', /sequence-verified clone recorded/.test(trText), trText);

      await h2.step('figure'); await p2.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) b.open = true; }); await h2.wait(300);
      const mVerified = await h2.methods();
      T.check('verified/methods-names-plasmid', mVerified.includes('pET28-SUMO-K12A'), mVerified);
      T.check('verified/methods-names-workflow', mVerified.includes('Around-the-Horn mutagenesis'), mVerified);
      T.check('verified/methods-names-polymerase', mVerified.includes('Q5 High-Fidelity DNA Polymerase'), mVerified);
      T.check('verified/methods-names-kld', /KLD treatment/.test(mVerified), mVerified);
      T.check('verified/methods-names-host', mVerified.includes('NEB 5-alpha'), mVerified);
      T.check('verified/methods-names-sequencing', mVerified.includes('Plasmidsaurus') && /confirmed the sequence/.test(mVerified), mVerified);

      T.check('methods-transform/no page errors', errs2.length === 0, errs2.join(' | '));
    } finally { await close2(); }
  });

  await T.t('picker', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Picker synthetic', 'cloning');
      T.check('picker/buttons-before-choice', await p.locator('#clonePanel [data-cl=tpl]').count() > 0, 'no template buttons before choice');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(400);

      // no template buttons on a stage panel
      await go(h, 'Construct and mutation design');
      T.check('picker/no-buttons-on-stage', await p.locator('#clonePanel [data-cl=tpl]').count() === 0, 'template buttons found on stage panel');

      // finds "Change workflow" on the workflow step
      await h.step('clone:setup');
      T.check('picker/no-buttons-after-choice', await p.locator('#clonePanel [data-cl=tpl]').count() === 0, 'template buttons still visible on workflow step');
      const chg = p.locator('#clonePanel [data-cl=chgwf]');
      T.check('picker/change-workflow-link', await chg.count() > 0 && /Change workflow/.test(await chg.innerText()), 'Change workflow link not found');
      T.check('picker/shows-workflow-name', (await p.locator('#clonePanel').innerText()).includes('Around-the-Horn mutagenesis'), 'chosen workflow name not found in panel');

      // buttons return after clicking it
      if (await chg.count() > 0) {
        await chg.click(); await h.wait(300);
        T.check('picker/buttons-return', await p.locator('#clonePanel [data-cl=tpl]').count() > 0, 'template buttons did not return after clicking Change workflow');
      } else {
        T.check('picker/buttons-return', false, 'Change workflow link not present to click');
      }
      T.check('picker/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('figure-card', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('ATH card synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(500);
      await go(h, 'Construct and mutation design'); await setStatus(p, h, 0, 'done');
      await go(h, 'Forward and reverse primer design'); await setStatus(p, h, 0, 'done');
      await go(h, 'Primer ordering, resuspension and working stocks'); await setStatus(p, h, 0, 'done');
      await go(h, 'Q5 PCR setup'); await setStatus(p, h, 0, 'fail');
      const svg = await h.exportSvg(), bx = await h.svgBoxes(svg);
      const pg = await p.context().newPage();
      let info = {total: 0, filled: 0, failed: 0};
      try {
        await pg.setContent('<!doctype html><meta charset="utf-8"><body>' + svg + '</body>');
        info = await pg.evaluate(() => {
          const ms = [...document.querySelectorAll('svg [data-mark]')];
          return {
            total: ms.length,
            filled: ms.filter(e => { const f = (e.getAttribute('fill') || '').toLowerCase(); return f && f !== 'none' && f !== '#ffffff' && f !== '#fff'; }).length,
            failed: ms.filter(e => e.getAttribute('data-mark') === 'fail').length
          };
        });
      } finally { await pg.close(); }
      T.check('figure-card/15-marks', info.total === 15, `marks=${info.total}`);
      T.check('figure-card/3-filled', info.filled === 3, `filled=${info.filled}`);
      T.check('figure-card/1-failed', info.failed === 1, `failed=${info.failed}`);
      T.check('figure-card/no-not-started', !svg.includes('Not started'), 'found "Not started" in saved SVG');
      T.check('figure-card/not-clipped', bx.clipped.length === 0, bx.clipped.join(' | '));
      T.check('figure-card/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  await T.t('stage-quick-fill-and-attempts', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Quick fill cloning', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(400);

      await go(h, 'Thermocycler program');
      const cycWhat = await p.locator('#ssWhat').innerText();

      await go(h, 'Q5 PCR setup');
      const pcrWhat = await p.locator('#ssWhat').innerText();
      T.check('q5/stage-specific-what', /Polymerase/.test(pcrWhat) && pcrWhat !== cycWhat, pcrWhat);
      T.check('q5/status-at-top', await cl(p).locator('.cl-top [data-cst]').isVisible(), 'status selector not at top');
      T.check('q5/no-attempt-card-initially', await cl(p).locator('.cl-at').count() === 0, 'Attempt 1 card shown before Record another attempt');

      const chip = p.locator('#ssQuick .qchip', {hasText: 'Q5, 25 µL, 0.5 µM primers'});
      T.check('q5/chip-visible', await chip.isVisible(), 'Q5 quick-fill chip not visible');
      await chip.click(); await h.wait(300);

      const pol = await field(p, 'Polymerase or master mix').inputValue();
      const tpl = await field(p, 'Template amount').inputValue();
      const prm = await field(p, 'Primer concentration').inputValue();
      const vol = await field(p, 'Reaction volume').inputValue();
      T.check('q5/four-fields-filled', pol.includes('Q5') && tpl === '1 ng' && prm === '0.5' && vol === '25', `pol=${pol}, tpl=${tpl}, prm=${prm}, vol=${vol}`);

      const addBtn = cl(p).locator('[data-cl=addat]', {hasText: 'Record another attempt'});
      T.check('q5/record-another-btn', await addBtn.isVisible(), 'Record another attempt button not visible');
      await addBtn.click(); await h.wait(300);
      T.check('q5/attempts-list-shown', await cl(p).locator('.cl-at').count() === 2, 'attempt list did not appear after Record another attempt');
      T.check('q5/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* #1433/#1434: Include Cloning switch keyboard/settings, confirmation modal, migration, archival progress & restore (deduplicated against entry above) */
  await T.t('include-cloning-lifecycle', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const sw = p.locator('#npCloning');
      const openSettings = () => p.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
      const headOn = async () => await p.locator('#projType').getAttribute('aria-checked') === 'true';
      const clickHead = async () => { await openSettings(); await p.locator('#projType').click(); };
      const setPrep = async (sel, val) => { await p.locator(sel).fill(val); await p.locator(sel).dispatchEvent('change'); await h.wait(250); };
      const importObj = async (name, data) => {
        await p.click('#homeBtn').catch(() => {}); await h.wait(350); await p.click('#homeQuick'); await h.wait(700);
        await p.setInputFiles('#projFile', {name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data))}); await h.wait(1500);
      };

      // Switch keyboard handling (click/Space/Enter without submitting form)
      T.check('switch/labelled-and-no-radios', await sw.count() === 1 && await p.locator('#newProj input[type=radio]').count() === 0 && (await sw.innerText()).trim() === 'Include Cloning' && await sw.getAttribute('role') === 'switch');
      await sw.click(); await h.wait(100);
      await sw.focus(); await p.keyboard.press('Space'); await h.wait(100);
      T.check('switch/space-toggles-off', await sw.getAttribute('aria-checked') === 'false');
      await p.fill('#npName', ''); await sw.focus(); await p.keyboard.press('Enter'); await h.wait(200);
      T.check('switch/enter-toggles-without-submit', await sw.getAttribute('aria-checked') === 'true' && await p.locator('#npName').isVisible());
      await sw.click(); await h.wait(100);

      // Closed details.proj-settings block + Restore button hidden when empty
      await h.newProject('Settings check', 'expression');
      T.check('settings-block-contains-both', await p.evaluate(() => {
        const d = document.querySelector('details.proj-settings');
        return !!(d && !d.open && d.querySelector('.clone-toggle') && d.querySelector('input[type=text][name=projName]'));
      }));
      await openSettings();
      const restoreBtn = p.locator('details.proj-settings #projCloneRestore');
      T.check('archive/restore-hidden-when-empty', !(await restoreBtn.isVisible()));

      // Confirmation modal (cancel vs confirm) + archival progress + restore
      await p.click('#homeBtn'); await h.wait(500);
      await h.newProject('Archive & Restore Synthetic', 'cloning');
      await openSettings();
      T.check('archive/restore-hidden-when-active', !(await restoreBtn.isVisible()));
      await cl(p).locator('[data-cl=tpl][data-v=pcr]').click(); await h.wait(400);
      const cRowsBefore = await rows(h);
      await h.step(cRowsBefore[1].k);
      await cl(p).locator('[data-cf="construct"]').fill('pSYN-GFP'); await cl(p).locator('[data-cf="construct"]').dispatchEvent('change');
      await cl(p).locator('select[data-cst]').selectOption('done'); await h.wait(250);
      const pcrRow = cRowsBefore.find(r => /PCR amplification/i.test(r.t)), gelRow = cRowsBefore.find(r => /PCR product analysis/i.test(r.t));
      await h.step(pcrRow.k);
      const fromVal = await cl(p).locator('select[data-cfrom] option').nth(1).getAttribute('value');
      await cl(p).locator('select[data-cfrom]').selectOption(fromVal);
      await cl(p).locator('select[data-cst]').selectOption('done'); await h.wait(250);
      const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      await h.step(gelRow.k);
      await p.setInputFiles('#clonePanel .cl-gel-file', {name: 'syn_agarose.png', mimeType: 'image/png', buffer: png1x1}); await h.wait(500);
      await cl(p).locator('select[data-cst]').selectOption('done'); await h.wait(250);

      // Clone connection validation while on
      await h.step('expr'); await setPrep('#pr-medium', 'TB');
      await p.waitForFunction(() => !/Starter, induction/.test((document.querySelector('#tl [data-step="expr"] .ts') || {}).textContent || ''), {timeout: 5000});
      let exprStep = (await h.timeline()).find(x => x.k === 'expr');
      T.check('validate/on-needs-clone', exprStep.warn && /Connect the clone/.test(exprStep.s), JSON.stringify(exprStep));
      await h.step('transform'); await setPrep('#pr-strain2', 'BL21(DE3)'); await setPrep('#pr-trSel', 'Kanamycin');
      await p.click('#prCloneAdd'); await h.wait(200);
      const cRow = p.locator('#prClones [data-clone]').first();
      await cRow.locator('input[type=text]').first().fill('C3 synthetic'); await cRow.locator('input[type=text]').first().dispatchEvent('change');
      await cRow.locator('input[type=radio]').first().check(); await h.wait(300);
      exprStep = (await h.timeline()).find(x => x.k === 'expr');
      T.check('validate/selected-clone-connects', !exprStep.warn && !/Connect the clone/.test(exprStep.s), JSON.stringify(exprStep));

      await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep="man:column"]'); await h.wait(300);
      await setPrep('#man-resin', '2 mL Ni-NTA'); await setPrep('#man-elution', '250 mM imidazole'); await setPrep('#man-vol', '4'); await setPrep('#man-conc', '2.5');

      await h.allSteps();
      const tlOn = await h.timeline(), cloneCountOn = tlOn.filter(s => /^clone:/.test(s.k)).length, cloneDoneOn = tlOn.filter(s => /^clone:/.test(s.k) && s.done && !s.warn).length;
      const totalOn = tlOn.length, doneOn = tlOn.filter(s => s.done && !s.warn).length;
      const progText = async () => (await p.locator('#stepsProg').innerText()).trim();
      const progBefore = await progText();
      const beforeStages = JSON.parse(await exportJson(p)).prep.cloning.stages;

      // Cancel archive modal -> stays ON; confirm archive modal -> archives stages & updates progress
      const modal = p.locator('#cloneArchiveModal');
      await clickHead(); await h.wait(250);
      T.check('dialog/visible-when-data-exists', await modal.isVisible());
      await p.locator('#cloneArchiveCancel').click(); await h.wait(200);
      T.check('dialog/cancel-keeps-on', !(await modal.isVisible()) && await headOn() && (await rows(h)).length === cloneCountOn);
      await clickHead(); await h.wait(250);
      await p.locator('#cloneArchiveConfirm').click(); await h.wait(300);
      const expectedArchivedProg = `${doneOn - cloneDoneOn} of ${totalOn - cloneCountOn} steps done`;
      await openSettings();
      T.check('archive/active-progress-and-restore-btn', !(await headOn()) && await restoreBtn.isVisible() && progBefore === `${doneOn} of ${totalOn} steps done` && (await progText()) === expectedArchivedProg);
      const archivedJson = JSON.parse(await exportJson(p));
      T.check('archive/records-kept-when-off', archivedJson.prep.includeCloning === false && archivedJson.prep.cloning.stages.length === beforeStages.length);

      // Restore via button restores stages, gel attachment, links, and progress
      await restoreBtn.click(); await h.wait(400);
      await openSettings();
      const restoredStages = JSON.parse(await exportJson(p)).prep.cloning.stages;
      T.check('archive/restore-preserves-everything', await headOn() && !(await restoreBtn.isVisible()) && (await progText()) === `${doneOn} of ${totalOn} steps done` &&
        restoredStages.length === beforeStages.length && restoredStages.find(s => s.kind === 'pcr_setup')?.at[0]?.from === fromVal &&
        /^data:image\/png/.test(restoredStages.find(s => s.kind === 'gel')?.gel?.image || ''));

      // Legacy migration inference
      const legacy = cloning => ({app: 'HPLC Figure Bench', version: 1, name: 'legacy', runs: [], traces: [], gels: [], prep: Object.assign({on: true, name: 'pSYN-1'}, cloning === undefined ? {} : {cloning})});
      await importObj('old_with_stages.json', legacy({type: '', tpl: '', stages: [{id: 's1', kind: 'design', name: '', skip: false, at: []}], ext: {src: '', ver: '', note: ''}}));
      T.check('migrate/stages-imply-on', await headOn());
      await importObj('old_before_cloning.json', legacy(undefined));
      T.check('migrate/no-record-off', !(await headOn()) && (await rows(h)).length === 0 && JSON.parse(await exportJson(p)).prep.includeCloning === false);
      T.check('include-cloning/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* #1436 & #1439: stage folding ("Show all stages", "N done") and Transformation join / legacy transfer migration */
  await T.t('fold-and-transformation-join', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const vis = async () => (await h.timeline()).filter(x => /^clone:/.test(x.k));
      await h.newProject('Fold and Join', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(500);
      let v = await vis();
      T.check('fold/at-most-4-rows', v.length <= 4 && v[0].k === 'clone:setup', JSON.stringify(v.map(x => x.t)));
      const all = p.locator('#tl [data-clall="1"]');
      T.check('fold/show-all-link', /Show all stages \(14\)/.test(await all.innerText()));
      await all.click(); await h.wait(250);
      v = await vis();
      T.check('fold/show-all-shows-15-and-join-names', v.length === 15 && !v.some(x => x.t === 'Transfer to expression') && v.some(x => x.t === 'Cloning transformation'));
      await h.step('expr'); await h.step('clone:setup');
      T.check('fold/show-all-holds', (await vis()).length === 15);

      const first3 = v.slice(1, 4);
      for (const s of first3.slice(0, 2)) { await h.step(s.k); await cl(p).locator('[data-cst]').first().selectOption('done'); await h.wait(250); }
      await p.locator('#tl [data-clall="0"]').click(); await h.wait(200);
      await h.step('construct');
      v = await vis();
      const done = p.locator('#tl [data-cldone]');
      T.check('fold/done-row-and-next-stage', (await done.count()) === 1 && /2 done/.test(await done.innerText()) && v.some(x => x.k === first3[2].k) && !v.some(x => x.k === first3[0].k));
      await done.click(); await h.wait(250);
      v = await vis();
      T.check('fold/done-row-lists-finished', v.some(x => x.k === first3[0].k) && v.some(x => x.k === first3[1].k));

      // Verified clone fills Transformation & Construct plasmid unless user typed a custom value (#1439)
      await go(h, 'Selection of a sequence-verified clone');
      await field(p, 'Plasmid name').fill('pSYN-7'); await field(p, 'Plasmid name').dispatchEvent('change');
      await field(p, 'Verification status').selectOption('Sequence verified');
      await cl(p).locator('[data-cst]').first().selectOption('done'); await h.wait(300);
      await h.step('transform');
      T.check('join/verified-clone-fills-and-transfer-at-transform', await p.locator('#pr-trPlasmid').inputValue() === 'pSYN-7' && /Transfer to expression/.test(await cl(p).innerText()) && await cl(p).locator('[data-cf=plasmid], [data-cf=host], [data-cf=marker]').count() === 0);
      await h.step('construct');
      T.check('join/verified-clone-fills-construct', await p.locator('#pr-name').inputValue() === 'pSYN-7');
      await h.step('transform'); await trPlasmid(p, h, 'pMINE-1');
      await go(h, 'Selection of a sequence-verified clone');
      await field(p, 'Plasmid name').fill('pSYN-8'); await field(p, 'Plasmid name').dispatchEvent('change'); await h.wait(300);
      await h.step('transform');
      T.check('join/typed-value-kept', await p.locator('#pr-trPlasmid').inputValue() === 'pMINE-1');

      // Older project with legacy transfer stage migrates cleanly (#1439)
      const oldProj = trP => ({app: 'HPLC Figure Bench', version: 1, name: 'older', runs: [], traces: [], gels: [],
        prep: {on: true, name: '', trPlasmid: trP, strain: '', trSel: '', cloning: {type: 'cloning', tpl: '', ext: {src: '', ver: '', note: ''},
          stages: [{id: 's1', kind: 'transfer', name: '', skip: false, at: [{id: 'a1', st: 'done', from: '', ck: {}, f: {plasmid: 'pOLD-1', host: 'BL21(DE3)', marker: 'kanamycin', clone: 'C3', bypass: true}}]}]}}});
      const loadOld = async (nm, d) => { await p.click('#homeBtn').catch(() => {}); await h.wait(350); await p.click('#homeQuick'); await h.wait(700);
        await p.setInputFiles('#projFile', {name: nm, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))}); await h.wait(1500); };
      await loadOld('older_empty.json', oldProj(''));
      await h.step('transform');
      T.check('older/plasmid-and-strain-moved', await p.locator('#pr-trPlasmid').inputValue() === 'pOLD-1' && await p.locator('#pr-strain2').inputValue() === 'BL21(DE3)');
      await loadOld('older_differs.json', oldProj('pOTHER-2'));
      await h.step('transform');
      const jDiff = JSON.parse(await exportJson(p));
      T.check('older/typed-wins-and-notes-keep-old', await p.locator('#pr-trPlasmid').inputValue() === 'pOTHER-2' && /pOLD-1/.test(jDiff.prep.cloning.stages.find(s => s.kind === 'transfer').at[0].f._n || ''));
      T.check('fold-join/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* #1305 & #1582: selected clone handoff, live glycerol-stock sync on edit, failed deselection, and canonical import */
  await T.t('selected-clone-handoff-and-stock-sync', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const set = async (loc, val) => { await loc.fill(val); await loc.dispatchEvent('change'); await h.wait(320); };
      const readMethods = async () => { await p.evaluate(() => { const b = document.getElementById('methodsBox'); if (b) { b.open = false; b.open = true; } }); await h.wait(250); return h.methods(); };
      const cRow = i => p.locator('#prClones [data-clone]').nth(i);
      const USED = /used for expression/;

      await h.newProject('Clone handoff');
      await h.step('construct'); await set(p.locator('#pr-name'), 'pSYN-1305');
      await h.step('transform'); await set(p.locator('#pr-trMethod'), 'heat shock'); await set(p.locator('#pr-trStock'), 'box 1, B2');
      await p.click('#prCloneAdd'); await h.wait(200); await p.click('#prCloneAdd'); await h.wait(200);
      await set(cRow(0).locator('[data-cl=name]'), 'A1');
      await set(cRow(1).locator('[data-cl=name]'), 'A2');
      await set(cRow(1).locator('[data-cl=stock]'), 'box 3, A4');
      await cRow(0).locator('[data-cl=status]').selectOption('failed'); await h.wait(250);

      T.check('clone/failed-disabled-and-unselected-default', await cRow(0).locator('[data-cl=sel]').isDisabled() && await p.locator('#prClones [data-cl=none]').isChecked() && await p.inputValue('#pr-trStock') === 'box 1, B2' && !USED.test(await readMethods()));

      await cRow(1).locator('[data-cl=status]').selectOption('verified'); await h.wait(250);
      await cRow(1).locator('[data-cl=sel]').click(); await h.wait(300);
      T.check('clone/selection-fills-stock-and-methods', await p.inputValue('#pr-trStock') === 'box 3, A4' && (await readMethods()).includes('Clone A2, verified, was used for expression (glycerol stock box 3, A4).'));

      // Live stock edit on selected clone updates prep.trStock (#1582)
      await set(cRow(1).locator('[data-cl=stock]'), 'box 9, H12');
      const selJson = JSON.parse(await exportJson(p));
      T.check('clone/edit-syncs-trStock-and-export', await p.inputValue('#pr-trStock') === 'box 9, H12' && selJson.prep.trStock === 'box 9, H12' && selJson.prep.selectedCloneId === selJson.prep.clones[1].id);

      // Marking selected clone failed clears selection
      await cRow(1).locator('[data-cl=status]').selectOption('failed'); await h.wait(300);
      T.check('clone/failed-clears-selection', await p.locator('#prClones [data-cl=none]').isChecked() && !USED.test(await readMethods()));

      // Canonical import of failed/missing/legacy selections
      const loadMut = async (nm, mut) => { const d = JSON.parse(JSON.stringify(selJson)); mut(d.prep);
        await p.click('#homeBtn').catch(() => {}); await h.wait(350); await p.click('#homeQuick'); await h.wait(700);
        await p.setInputFiles('#projFile', {name: nm, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(d))}); await h.wait(1500); };
      await loadMut('failed.json', pr => { pr.clones[1].status = 'failed'; });
      T.check('clone/import-failed-null', JSON.parse(await exportJson(p)).prep.selectedCloneId === null && !USED.test(await readMethods()));
      await loadMut('missing.json', pr => { pr.selectedCloneId = 'nope'; });
      T.check('clone/import-missing-null', JSON.parse(await exportJson(p)).prep.selectedCloneId === null);
      await loadMut('legacy.json', pr => { delete pr.clones; delete pr.selectedCloneId; pr.trStock = 'box 1, B2'; });
      const legD = JSON.parse(await exportJson(p));
      T.check('clone/import-legacy', Array.isArray(legD.prep.clones) && !legD.prep.clones.length && legD.prep.selectedCloneId === null && legD.prep.trStock === 'box 1, B2');
      T.check('clone/no-page-errors', !errs.length, errs.join(' | '));
    } finally { await close(); }
  });

  /* #1755: Reset cloning timeline folding between preparations */
  await T.t('reset-cloning-timeline-folding', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('ATH first', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(500);

      const all = p.locator('#tl [data-clall="1"]');
      T.check('fold-reset/show-all-initial', /Show all stages \(14\)/.test(await all.innerText()));
      await all.click(); await h.wait(250);

      const vis1 = await p.$$eval('#tl [data-step^="clone:"]', els => els.filter(el => {
        const s = window.getComputedStyle(el);
        return s && s.display !== 'none' && s.visibility !== 'hidden' && (el.offsetWidth > 0 || el.offsetHeight > 0);
      }).length);
      T.check('fold-reset/first-shows-15-stages', vis1 === 15, `expected 15, got ${vis1}`);

      await p.click('#homeBtn'); await h.wait(400);
      await h.newProject('ATH second', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(500);

      const vis2 = await p.$$eval('#tl [data-step^="clone:"]', els => els.filter(el => {
        const s = window.getComputedStyle(el);
        return s && s.display !== 'none' && s.visibility !== 'hidden' && (el.offsetWidth > 0 || el.offsetHeight > 0);
      }).length);
      T.check('fold-reset/second-rows-at-most-four', vis2 <= 4, `expected at most 4 visible clone rows, got ${vis2}`);

      const showAllEls = await p.$$eval('#tl [data-clall="1"]', els => els.filter(el => {
        const s = window.getComputedStyle(el);
        return s && s.display !== 'none' && s.visibility !== 'hidden' && (el.offsetWidth > 0 || el.offsetHeight > 0);
      }).map(el => (el.textContent || '').trim()));
      T.check('fold-reset/exactly-one-show-all-with-text', showAllEls.length === 1 && /Show all stages \(14\)/.test(showAllEls[0]), JSON.stringify(showAllEls));
      T.check('fold-reset/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  T.done();
})();
