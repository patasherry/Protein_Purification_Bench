// Issue #936: Rename 'Add a step' to 'Add run'
// Verifies that the purification step addition button in the step timeline says 'Add run' rather than 'Add a step'.
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
  } finally {
    T.check('no page errors', !errs.length, errs.join(' | '));
    await close();
    T.done();
  }
})();
