// The app shows its version on Home and writes it into exported projects (#1844), so a figure or project can be traced to the build
// that made it.
const {open, H, suite, fs, src} = require('../lib/harness');
(async () => { const T = suite('55_version'), {p, errs, close} = await open(), h = H(p);
  await T.t('version', async () => {
    await p.click('#homeBtn').catch(() => {}); await p.waitForTimeout(300);
    const shown = await p.$eval('#appVersion', e => e.textContent.trim()).catch(() => '');
    T.check('version/shown-on-home', /^Version \d{4}\.\d{2}\.\d{2}$/.test(shown), shown || 'no #appVersion');
    await h.newProject('Version export'); await h.addRun(src('his'));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#projSave').evaluate(e => e.click())]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    T.check('version/in-exported-project', !!j.appVersion && shown.endsWith(j.appVersion), JSON.stringify({appVersion: j.appVersion, shown}));
  });
  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close(); T.done(); process.exit(0);
})();
