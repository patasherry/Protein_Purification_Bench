// Issue #936: separate a specific chromatography run from a biological workflow stage.
const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('936_add_run_stage_control'), {p, errs, close} = await open(), h = H(p);

  await T.t('run-button-and-stage-header-are-distinct', async () => {
    await h.newProject('Add Run and Stage Test');
    await h.wait(300);

    const run = p.locator('#tl [data-addrun]');
    const hasRun = await run.count() === 1 && await run.isVisible();
    T.check('add-run-button-visible', hasRun);
    T.check('add-run-button-label', hasRun && (await run.innerText()).trim() === 'Add run');

    const stageHead = p.locator('#tl li.tl-head', {hasText: 'Purification'});
    const addStage = stageHead.locator('button[data-addmenu]');
    const hasAddStage = await addStage.count() === 1 && await addStage.isVisible();
    T.check('add-stage-icon-in-purification-header', hasAddStage);
    T.check('add-stage-icon-label', hasAddStage && (await addStage.getAttribute('aria-label')) === 'Add purification stage');

    if (hasRun) {
      const chooser = p.waitForEvent('filechooser', {timeout: 3000});
      await run.click();
      await chooser;
    }
    T.check('add-run-opens-instrument-file-chooser', hasRun);

    const before = await p.locator('#tl [data-step^="man:"]').count();
    if (hasAddStage) await addStage.click();
    const menu = stageHead.locator('.tl-menu');
    const hasMenu = hasAddStage && await menu.isVisible();
    T.check('stage-menu-visible-from-header', hasMenu);
    T.check('stage-menu-has-no-chromatogram-run-option', hasMenu && await menu.locator('[data-addstep="run"]').count() === 0);
    if (hasMenu) {
      await menu.locator('[data-addstep="man:other"]').click();
      await h.wait(300);
    }
    T.check('stage-menu-creates-biological-stage', hasMenu && await p.locator('#tl [data-step^="man:"]').count() === before + 1);
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
