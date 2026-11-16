const {open, H, suite, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('1502_agarose_lanes');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('lane_editor_keeps_labels_without_editing_overlays', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVQIW2Nk+M/wnwEJMDHAAQYGAAB+Dgb+y4e1wQAAAABJRU5ErkJggg==';
      const file = path.join(require('os').tmpdir(), 'synthetic_agarose_lanes.png');
      fs.writeFileSync(file, Buffer.from(png, 'base64'));
      const upload = async () => {
        const b64 = fs.readFileSync(file).toString('base64');
        await p.evaluate(async ([b, name]) => {
          const u = Uint8Array.from(atob(b), c => c.charCodeAt(0)), dt = new DataTransfer();
          dt.items.add(new File([u], name, {type:'image/png'}));
          const z = document.querySelector('#clonePanel .cl-gel-upload');
          z.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true}));
        }, [b64, path.basename(file)]);
      };

      await h.newProject('Agarose lanes synthetic', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click(); await h.wait(500);
      await go(h, 'Agarose-gel verification'); await upload(); await h.wait(600);

      const auto = p.locator('#ag-auto-lanes');
      T.check('editor/auto-detect-control', await auto.count() === 1, 'Auto-detect lanes button missing');
      if (await auto.count()) { await auto.click(); await h.wait(450); }
      const zones = p.locator('#ag-lane-editor .ag-lane-zone');
      T.check('editor/detects-at-least-two-lanes', await zones.count() >= 2, String(await zones.count()));

      if (await zones.count() >= 3) {
        await p.selectOption('#ag-lane-type-0', 'DNA ladder'); await p.fill('#ag-lane-label-0', 'M'); await p.dispatchEvent('#ag-lane-label-0', 'change');
        await p.selectOption('#ag-lane-type-1', 'Sample'); await p.fill('#ag-lane-label-1', 'PCR-1'); await p.dispatchEvent('#ag-lane-label-1', 'change');
        await p.selectOption('#ag-lane-type-2', 'No-template control'); await p.fill('#ag-lane-label-2', 'NTC'); await p.dispatchEvent('#ag-lane-label-2', 'change');
      }
      T.check('editor/labels-accept-lane-types', await p.inputValue('#ag-lane-label-0') === 'M' && await p.inputValue('#ag-lane-label-1') === 'PCR-1' && await p.inputValue('#ag-lane-type-2') === 'No-template control', await cl(p).innerText());

      await p.click('#ag-add-lane'); await h.wait(250);
      const editCount = await zones.count();
      const pub = p.locator('#ag-publication-view');
      T.check('editor/publication-control', await pub.count() === 1, 'Publication view button missing');
      if (await pub.count()) { await pub.click(); await h.wait(250); }
      const publication = await p.evaluate(() => {
        const e = document.querySelector('#ag-lane-editor');
        return {pub: !!(e && e.classList.contains('pub')), shade: e && e.querySelector('.ag-lane-shade') ? getComputedStyle(e.querySelector('.ag-lane-shade')).display : '', labels: e ? [...e.querySelectorAll('.ag-lane-label')].map(x => x.textContent.trim()) : []};
      });
      T.check('editor/publication-hides-editing-shading', publication.pub && publication.shade === 'none' && publication.labels.includes('M') && publication.labels.includes('PCR-1'), JSON.stringify(publication));

      if (await p.locator('#ag-publication-view').count()) { await p.click('#ag-publication-view'); await h.wait(250); }
      const retained = await p.evaluate(() => ({zones: document.querySelectorAll('#ag-lane-editor .ag-lane-zone').length, last: (document.querySelectorAll('#ag-lane-list [data-lane-k="label"]')[document.querySelectorAll('#ag-lane-list [data-lane-k="label"]').length - 1] || {}).value || ''}));
      T.check('editor/unassigned-lane-remains-visible', retained.zones === editCount && retained.last === '', JSON.stringify({editCount, retained}));
      T.check('editor/no-page-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });
  T.done();
})();
