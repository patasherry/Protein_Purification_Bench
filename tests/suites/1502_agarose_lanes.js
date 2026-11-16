const {open, H, suite} = require('../lib/harness');

/* #1483: lanes found from an uploaded image retain their identity in the editor and their labels in the publication SVG. */
(async () => {
  const T = suite('1502_agarose_lanes');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_lane_editor_and_publication_labels', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose lane editor', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500); await go(h, 'Agarose-gel verification'); await h.wait(400);

      await p.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 200; c.height = 110; const x = c.getContext('2d');
        x.fillStyle = '#101010'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#e8e8e8';
        [15, 60, 105, 150].forEach((left, i) => { x.fillRect(left, 20 + i * 7, 24, 5); x.fillRect(left, 65 - i * 5, 24, 4); });
        const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], 'four_lanes.png', {type:'image/png'}), dt = new DataTransfer(); dt.items.add(file);
        document.querySelector('#clonePanel .cl-gel-upload').dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true}));
      });
      await h.wait(900);

      const auto = cl(p).locator('#ag-auto-lanes');
      T.check('auto_detect_control_present', await auto.count() === 1, 'Auto-detect lanes control exists');
      if (await auto.count()) { await auto.click(); await h.wait(500); }
      const laneRows = cl(p).locator('#ag-lane-list [data-lane-row]'), overlay = cl(p).locator('.ag-lane-region');
      const laneCount = await laneRows.count();
      T.check('auto_detect_finds_at_least_two_lanes', laneCount >= 2 && await overlay.count() >= 2, `${laneCount} rows, ${await overlay.count()} overlays`);

      const set = async (i, type, label) => {
        const kind = p.locator(`#ag-lane-type-${i}`), name = p.locator(`#ag-lane-label-${i}`);
        if (!await kind.count() || !await name.count()) return false;
        await kind.selectOption(type); await kind.dispatchEvent('change'); await h.wait(150);
        await name.fill(label); await name.dispatchEvent('change'); await h.wait(150); return true;
      };
      const setup = await set(0, 'DNA ladder', 'M') && await set(1, 'Sample', 'PCR-1') && await set(2, 'No-template control', '');
      T.check('lane_types_and_labels_editable', setup, 'ladder M, sample PCR-1, and no-template control set');
      const unassigned = laneCount > 3 ? await p.locator('#ag-lane-type-3').inputValue() : '';
      T.check('unassigned_lane_remains_visible', laneCount > 3 && unassigned === '' && await p.locator('[data-lane-row="3"]').isVisible(), `lane 4 type ${unassigned || 'unassigned'}`);

      const publication = cl(p).locator('#cl-gen-ag-fig');
      if (await publication.count()) { await publication.click(); await h.wait(400); }
      const overlaysHidden = await cl(p).locator('.ag-lane-overlay').evaluateAll(es => es.every(e => getComputedStyle(e).display === 'none'));
      const svg = await h.exportSvg();
      T.check('publication_hides_editing_shading', overlaysHidden && !svg.includes('ag-lane-overlay'), 'editing overlay hidden outside the publication SVG');
      T.check('publication_keeps_lane_labels', svg.includes('>M<') && svg.includes('>PCR-1<') && svg.includes('No-template control'), 'M, PCR-1, and control label remain in publication figure');

      const edit = cl(p).locator('#ag-edit-lanes'); if (await edit.count()) { await edit.click(); await h.wait(300); }
      T.check('edit_view_restores_unassigned_lane', laneCount > 3 && await p.locator('#ag-lane-type-3').inputValue() === '' && await p.locator('[data-lane-row="3"]').isVisible(), 'unassigned lane returns in edit view');
      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  T.done();
})();
