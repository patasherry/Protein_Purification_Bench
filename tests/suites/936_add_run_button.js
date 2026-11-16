// Issue #936: Rename 'Add a step' to 'Add run'
// Verifies that the purification step addition button in the step timeline says 'Add run' rather than 'Add a step',
// and that a '+' icon directly on the biological stage header enables adding biological stages.
const { open, H, suite, path, DATA } = require('../lib/harness');

(async () => {
  const T = suite('936_add_run_button'), { p, errs, close } = await open(), h = H(p);
  try {
    await T.t('add-run-button-label', async () => {
      await h.newProject('Add Run Label Check');
      await h.wait(500);

      const addBtn = p.locator('#tl [data-addmenu]');
      T.check('button-exists', (await addBtn.count()) === 1, 'expected 1 #tl [data-addmenu] button');

      const label = (await addBtn.textContent())?.trim();
      T.check('add-run-label', label === 'Add run', `expected button text "Add run", got: "${label}"`);

      // Clicking opens the menu and the button toggles to 'Cancel'
      await addBtn.click();
      await h.wait(200);
      const cancelLabel = (await addBtn.textContent())?.trim();
      T.check('cancel-label-when-open', cancelLabel === 'Cancel', `expected "Cancel", got: "${cancelLabel}"`);
      T.check('menu-visible', await p.locator('.tl-menu').isVisible(), 'menu should be visible');

      // Clicking again toggles back to 'Add run'
      await addBtn.click();
      await h.wait(200);
      const restoredLabel = (await addBtn.textContent())?.trim();
      T.check('add-run-label-restored', restoredLabel === 'Add run', `expected "Add run", got: "${restoredLabel}"`);

      // Add a run so wfList is not empty, and verify button still says 'Add run'
      await h.addRun(path.join(DATA, 'standins', 'imac_histrap_1ml_step.csv'));
      await h.wait(500);
      const labelAfterRun = (await p.locator('#tl [data-addmenu]').textContent())?.trim();
      T.check('add-run-label-after-run', labelAfterRun === 'Add run', `expected "Add run", got: "${labelAfterRun}"`);
    });

    await T.t('stage-header-add-stage-button', async () => {
      const stageAddBtn = p.locator('.tl-head [data-addstage]');
      const btnCount = await stageAddBtn.count();
      T.check('stage-header-btn-exists', btnCount >= 1, 'expected at least 1 .tl-head [data-addstage] button');

      if (btnCount >= 1) {
        const icon = (await stageAddBtn.first().textContent())?.trim();
        T.check('stage-header-btn-icon', icon === '+', `expected "+", got: "${icon}"`);

        // Clicking '+' on the stage header activates cloning and navigates to clone:setup
        await stageAddBtn.first().click();
        await h.wait(500);

        const cloneSetupSelected = await p.locator('#tl [data-step="clone:setup"][aria-current="step"]').count();
        T.check('clone-setup-activated', cloneSetupSelected === 1, 'expected clone:setup step to be selected');

        // The Cloning stage header now also has the '+' icon
        const cloningHeadBtn = p.locator('.tl-head:has-text("Cloning") [data-addstage]');
        T.check('cloning-header-btn-exists', (await cloningHeadBtn.count()) === 1, 'expected Cloning header to have + button');

        // Navigate away, then click the Cloning header '+' icon to verify it also navigates to clone:setup
        await h.step('construct');
        await h.wait(200);
        await cloningHeadBtn.click();
        await h.wait(300);

        // The "Add a stage" selector is present in the cloning panel
        const addStageSelect = p.locator('#clonePanel [data-cadd]');
        T.check('add-stage-select-visible', (await addStageSelect.count()) === 1, 'expected [data-cadd] select to exist');
      } else {
        T.check('stage-header-btn-icon', false, 'cannot check icon, button missing');
        T.check('clone-setup-activated', false, 'cannot activate clone setup, button missing');
        T.check('cloning-header-btn-exists', false, 'cannot check cloning header, button missing');
        T.check('add-stage-select-visible', false, 'cannot check add stage select, button missing');
      }
    });
  } finally {
    T.check('no page errors', !errs.length, errs.join(' | '));
    await close();
    T.done();
  }
})();
