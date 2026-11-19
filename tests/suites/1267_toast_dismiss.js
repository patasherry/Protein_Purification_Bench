// 1267 status notifications: a toast sits below the header (it must not cover the top navigation) and a click on it dismisses it.
// Trigger: a synthetic malformed NanoDrop file loaded in a project, which shows a "has no usable measurements" toast.
const {open, H, suite, path, DATA} = require('../lib/harness');

(async () => { const T = suite('1267_toast_dismiss');
  for (const [k, vp] of [['desktop', {width: 1280, height: 860}], ['phone', {width: 390, height: 860}]]) await T.t('toast_' + k, async () => {
    const {p, close} = await open(vp), h = H(p);
    try {
      await h.newProject('Toast ' + k); await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip')); await h.step('final');
      await p.setInputFiles('#file', path.join(DATA, 'nd/nd_malformed_header.csv'));
      await p.waitForSelector('#toast .pill', {timeout: 3000});
      const g = await p.evaluate(() => { const t = document.querySelector('#toast .pill').getBoundingClientRect(), hd = document.querySelector('header.top').getBoundingClientRect(); return {toastTop: t.top, headerBottom: hd.bottom, scrolled: window.scrollY}; });
      T.check(`1267.${k}.below_header`, g.scrolled > 0 || g.toastTop >= g.headerBottom - 0.5, JSON.stringify(g));
      const bad = p.locator('#toast .pill', {hasText: 'no usable measurements'}); await bad.click();
      await h.wait(200);
      T.check(`1267.${k}.click_dismisses`, (await bad.count()) === 0, 'the toast is still shown after a click');
    } finally { await close(); } });

  await T.t('undo_del_card', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Toast Undo');
      await h.addRun(path.join(DATA, 'chrom/valid_unicorn.zip'));
      await h.pool('T3-T6');
      const csv = () => { const rows = ['Time (min),UV 280 (mAU)']; for (let i = 0; i <= 600; i++) { const t = i/100; rows.push(`${t.toFixed(2)},${(2 + 80*Math.exp(-0.5*((t - 3)/0.08)**2)).toFixed(3)}`); } return rows.join('\n') + '\n'; };
      const traceFile = {name: 'synthetic_trace.csv', mimeType: 'text/csv', buffer: Buffer.from(csv())};
      await h.addRun(traceFile);
      await h.wait(500);

      // Verify initial cards
      const runsTl = (await h.timeline()).filter(x => x.k.startsWith('run:'));
      const rid = runsTl[0].k.slice(4);
      await h.step('run:' + rid);
      T.check('run/card-listed', await p.locator(`#list .trace.run[data-id="${rid}"]`).isVisible(), 'run card not visible');

      // 1-click immediate deletion on run card
      await p.locator(`#list .trace.run[data-id="${rid}"] [data-act="del"]`).click();
      await h.wait(300);
      T.check('run/immediate-removal', (await p.locator(`#list .trace.run[data-id="${rid}"]`).count()) === 0, 'run card still in #list after del click');

      // Undo button in toast
      const runUndo = p.locator('#toast .pill button', {hasText: 'Undo'});
      const runUndoOk = await runUndo.isVisible();
      T.check('run/toast-undo-visible', runUndoOk, 'Undo button not visible in toast');
      if (runUndoOk) await runUndo.click();
      await h.wait(400);

      // Assert restored card and pooled fractions
      T.check('run/card-restored', await p.locator(`#list .trace.run[data-id="${rid}"]`).isVisible(), 'run card not restored after Undo');
      const poolVal = await p.locator(`#list .trace.run[data-id="${rid}"] [data-k="shade"]`).inputValue().catch(() => '');
      T.check('run/pool-restored', poolVal === 'T3-T6', `pooled fractions expected 'T3-T6', got '${poolVal}'`);

      // Switch to HPLC traces step for the trace card
      await h.step('hplc');
      const traceCard = p.locator('#list .trace[data-kind="trace"]').first();
      T.check('trace/card-listed', await traceCard.isVisible(), 'trace card not visible');

      // 1-click immediate deletion on trace card
      await traceCard.locator('[data-act="del"]').click();
      await h.wait(300);
      T.check('trace/immediate-removal', (await p.locator('#list .trace[data-kind="trace"]').count()) === 0, 'trace card still in #list after del click');

      // Undo button in toast for trace
      const traceUndo = p.locator('#toast .pill button', {hasText: 'Undo'});
      const traceUndoOk = await traceUndo.isVisible();
      T.check('trace/toast-undo-visible', traceUndoOk, 'Undo button not visible in toast for trace');
      if (traceUndoOk) await traceUndo.click();
      await h.wait(400);

      // Assert restored trace card
      T.check('trace/card-restored', (await p.locator('#list .trace[data-kind="trace"]').count()) === 1, 'trace card not restored after Undo');
      T.check('undo/no-page-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });
  T.done();
})();
