// #1415: a plain time and signal file loaded into a project is an overlay trace, not a purification run. It used to be drawn
// while the step list still showed the old step and had no step of its own, so one click on any step hid it with no way back.
// It now gets an "HPLC traces" step. Everything is driven through the UI, on a synthetic trace built here.
const {open, H, suite, src, fs, path} = require('../lib/harness');
const os = require('os');

(async () => {
  const T = suite('1415_hplc_in_project');
  const csv = () => { const rows = ['Time (min),UV 280 (mAU)']; for (let i = 0; i <= 600; i++) { const t = i/100; rows.push(`${t.toFixed(2)},${(2 + 80*Math.exp(-0.5*((t - 3)/0.08)**2)).toFixed(3)}`); } return rows.join('\n') + '\n'; };
  const file = {name: 'synthetic_hplc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv())};
  const title = p => p.$eval('#ssTitle', e => e.textContent.trim());
  const drawn = p => p.$eval('#paper svg', e => e.textContent.includes('synthetic_hplc')).catch(() => false);

  await T.t('step', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Plain trace');
      T.check('step/absent-before', !(await h.timeline()).some(x => x.k === 'hplc'), 'an HPLC traces step exists in an empty project');
      await h.addRun(file); await h.wait(800);
      const tl = await h.timeline();
      T.check('step/no-run-made', !tl.some(x => /^run:/.test(x.k)), 'a plain trace became a purification run');
      T.check('step/has-its-own-step', tl.some(x => x.k === 'hplc' && /1 trace/.test(x.s)), JSON.stringify(tl.map(x => x.k)));
      T.check('step/selected-on-load', await title(p) === 'HPLC traces' && await drawn(p), `step sheet reads "${await title(p)}", trace drawn: ${await drawn(p)}`);
      T.check('step/trace-listed', await p.locator('#list .trace').first().isVisible(), 'the trace card is not shown on its step');
      // away and back: the trace must be reachable again from the step list
      await h.step('construct');
      T.check('step/leaves', await title(p) === 'Construct' && !(await drawn(p)), `after Construct: "${await title(p)}", trace drawn: ${await drawn(p)}`);
      await h.step('hplc');
      T.check('step/comes-back', await title(p) === 'HPLC traces' && await drawn(p), `after HPLC traces: "${await title(p)}", trace drawn: ${await drawn(p)}`);
      // removing the last trace removes the step and lands somewhere sane
      await p.locator('#list .trace [data-act=del]').first().click(); await h.wait(500);
      const after = await h.timeline();
      T.check('step/gone-with-the-trace', !after.some(x => x.k === 'hplc') && await title(p) === 'Construct', `${JSON.stringify(after.map(x => x.k))}, step sheet "${await title(p)}"`);
      T.check('step/no page errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  // #1582: unique #pc<id> vs #pcap<id> when importing a saved project with run.poolConc
  await T.t('poolconc-unique-id', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('PoolConc ID');
      await h.addRun(src('his'));
      await h.pool('T1-T6');
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      const rid = data.runs[0].id;
      data.runs[0].poolConc = '2.5';
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfb1582-'));
      const filePath = path.join(dir, 'poolconc.json');
      fs.writeFileSync(filePath, JSON.stringify(data));
      await p.click('#homeBtn'); await h.wait(500);
      await p.click('#homeQuick'); await h.wait(1000);
      await p.setInputFiles('#projFile', filePath); await h.wait(2200);
      const pcCount = await p.locator(`[id="pc${rid}"]`).count();
      const pcapCount = await p.locator(`#pcap${rid}`).count();
      T.check('poolconc/unique-pc-id', pcCount === 1, `expected 1 [id="pc${rid}"], got ${pcCount}`);
      T.check('poolconc/has-pcap-id', pcapCount === 1, `expected 1 #pcap${rid}, got ${pcapCount}`);
      T.check('poolconc/no-page-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  // #1582: #knownList .krow checkboxes stay compact native checkboxes (<= 20 px)
  await T.t('known-krow-checkbox-compact', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await p.click('#homeQuick'); await h.wait(1000);
      await h.dropFiles(src('gel'));
      const gknown = p.locator('details[data-sub="gknown"] > summary');
      await gknown.click(); await h.wait(400);
      const cb = p.locator('#knownList .krow input[type="checkbox"]').first();
      await cb.waitFor({state: 'visible', timeout: 5000});
      const width = await cb.evaluate(e => e.getBoundingClientRect().width);
      T.check('krow/compact-checkbox-width', width > 0 && width <= 20, `width=${width}`);
      T.check('krow/no-page-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  // #1582: editing stock of the currently selected colony syncs prep.trStock
  await T.t('selected-clone-stock-sync', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Clone stock sync');
      await h.step('construct');
      await p.fill('#pr-name', 'pSYN-1582'); await p.dispatchEvent('#pr-name', 'change'); await h.wait(300);
      await h.step('transform');
      await p.click('#prCloneAdd'); await h.wait(300);
      const row = p.locator('#prClones [data-clone]').first();
      await row.locator('[data-cl=name]').fill('C1');
      await row.locator('[data-cl=stock]').fill('box 2, A1');
      await row.locator('[data-cl=status]').selectOption('verified'); await h.wait(300);
      await row.locator('[data-cl=sel]').click(); await h.wait(350);
      T.check('clonestock/initial-sync', await p.inputValue('#pr-trStock') === 'box 2, A1', await p.inputValue('#pr-trStock'));
      await row.locator('[data-cl=stock]').fill('box 9, H12');
      await row.locator('[data-cl=stock]').dispatchEvent('change');
      await h.wait(400);
      const trVal = await p.inputValue('#pr-trStock');
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      const d = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      T.check('clonestock/edit-syncs-trStock', trVal === 'box 9, H12' && d.prep.trStock === 'box 9, H12', `input=${trVal}, saved=${d.prep.trStock}`);
      T.check('clonestock/no-page-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  // #1582: deleting a run card in #list clears dangling prep.btw, ndSamples runId, and prep.cleaveAfter
  await T.t('delete-run-card-clears-links', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Delete run links');
      await h.step('construct');
      await p.fill('#pr-name', 'pSYN-del'); await p.dispatchEvent('#pr-name', 'change'); await h.wait(300);
      await h.addRun(src('his'));
      await h.pool('T1-T6');
      const runsTl = (await h.timeline()).filter(x => x.k.startsWith('run:'));
      const rid = runsTl[0].k.slice(4);
      await h.addConc(null, 2.0);
      await p.click('#tl [data-addmenu]'); await p.click('#tl [data-addstep=cleave]'); await h.wait(400);
      await h.step('final');
      await p.click('#ndManual'); await h.wait(300);
      await p.locator('#ndList .nd-edit > summary').first().click(); await h.wait(200);
      await p.locator('#ndList [data-ndk="runId"]').first().selectOption(rid); await h.wait(300);
      await h.step('run:' + rid);
      await p.locator(`#list .trace.run[data-id="${rid}"] [data-act="del"]`).click(); await h.wait(500);
      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      const d = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      const noBtw = !(d.prep && d.prep.btw && Object.prototype.hasOwnProperty.call(d.prep.btw, rid));
      const noNd = (d.nanodrop || []).every(x => x.runId !== rid);
      const noCleave = !(d.prep && d.prep.cleaveAfter === rid);
      T.check('delrun/clears-btw', noBtw, JSON.stringify(d.prep && d.prep.btw));
      T.check('delrun/clears-nd-runId', noNd, JSON.stringify(d.nanodrop));
      T.check('delrun/clears-cleaveAfter', noCleave, String(d.prep && d.prep.cleaveAfter));
      T.check('delrun/no-page-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  T.done();
})();
