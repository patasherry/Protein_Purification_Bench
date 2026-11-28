// Toasts that explain a failure or carry a button stay long enough to read and act on, and never close under the pointer
// (#1823, WCAG 2.2.1 Timing Adjustable). Before, every toast closed after 6 s at most, hovered or not.
const {open, H, suite, RES, path, fs} = require('../lib/harness');
(async () => { const T = suite('54_toasts'), {p, errs, close} = await open(), h = H(p);
  const bad = path.join(RES, 'toast_bad.csv'); fs.writeFileSync(bad, 'just some words\nand more words\n');
  const shown = () => p.$$eval('#toast .pill', ps => ps.map(x => x.textContent.trim()).filter(t => /Could not read/.test(t)).length);

  await T.t('error-toast-stays', async () => {
    await h.newProject('Toasts'); await h.addRun(bad);
    T.check('toasts/error-shown', await shown() > 0, 'no "Could not read" toast');
    await p.waitForTimeout(6500);
    T.check('toasts/error-still-shown-after-8s', await shown() > 0, 'the error toast closed within about 8 s');
  });

  await T.t('hover-holds-toast', async () => {
    const pill = p.locator('#toast .pill', {hasText: 'Could not read'}).first();
    if (await pill.count()) { await pill.hover(); await p.waitForTimeout(16000); }
    T.check('toasts/hovered-toast-not-closed', await shown() > 0, 'the toast closed while the pointer was on it');
    await p.mouse.move(2, 2); await p.waitForTimeout(500);
    if (await pill.count()) await pill.click();
    T.check('toasts/click-dismisses', await shown() === 0, 'clicking did not dismiss the toast');
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close(); T.done(); process.exit(0);
})();
