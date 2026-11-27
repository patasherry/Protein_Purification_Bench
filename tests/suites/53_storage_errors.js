// When browser storage fails, the save status must say so (#1819). Two failures are simulated in the page's own IndexedDB:
// a transaction the browser aborts at commit (what a full disk does), which used to leave "Saving…" forever and block every
// later save, and a QuotaExceededError, which used to read "will retry" although no retry was scheduled.
const {open, H, suite, src} = require('../lib/harness');
(async () => { const T = suite('53_storage_errors');
  const fault = () => { const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { const f = window.__idbFault;
      if (f === 'quota' && this.name === 'projects') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      const r = put.apply(this, a);
      /* abort only after the request has succeeded, as a commit-time quota failure does: no request error fires, only abort */
      if (f === 'abort' && this.name === 'projects') { const tx = this.transaction; r.addEventListener('success', () => { try { tx.abort(); } catch (e) {} }); }
      return r; }; };
  const status = p => p.evaluate(() => { const e = document.querySelector('#saveState'); return e ? e.textContent.trim() : ''; });
  /* wait for the next save to start (the status leaves its old text or shows Saving…), then for it to finish */
  const settle = async (p, ms, before) => { const t0 = Date.now(); let s = '', started = false;
    while (Date.now() - t0 < ms) { s = await status(p); if (!started && (s !== before || /Saving/.test(s))) started = true; if (started && s && !/Saving/.test(s)) break; await p.waitForTimeout(150); }
    return started ? s : `(no new save started; still "${s}")`; };

  for (const kind of ['abort', 'quota']) {
    await T.t(kind, async () => { const {p, errs, close} = await open(), h = H(p);
      try {
        await p.addInitScript(fault); await p.reload(); await p.waitForTimeout(800);
        await h.newProject(`Storage ${kind}`); await p.waitForTimeout(2500);
        T.check(`${kind}/first-save-ok`, /Saved/.test(await status(p)), await status(p));
        await p.evaluate(k => { window.__idbFault = k; }, kind);
        await p.evaluate(() => { document.querySelector('#saveState').textContent = ''; });
        await h.addRun(src('his'));
        const s = await settle(p, 15000, '');
        if (kind === 'abort') T.check('abort/save-settles-with-error', !!s && !/Saving/.test(s) && /Not saved/.test(s), s || '(empty)');
        else T.check('quota/says-storage-full', /storage is full/.test(s), s || '(empty)');
        await p.evaluate(() => { window.__idbFault = null; });
        if (kind === 'abort') { const b2 = await status(p); await h.addRun(src('his')); const s2 = await settle(p, 15000, b2); T.check('abort/later-save-not-blocked', /Saved/.test(s2), s2 || '(empty)'); }
        T.check(`${kind}/no-page-errors`, !errs.filter(e => !/quota|cancelled|AbortError/i.test(e)).length, errs.join(' | '));
      } finally { await close(); }
    });
  }
  T.done(); process.exit(0);
})();
