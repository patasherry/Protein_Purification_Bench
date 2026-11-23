// Suite 1665: Agarose Gel Studio primary analysis order, metadata subheadings, and single-attempt duplicate suppression
const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1665_agarose_gel_subcategories');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('primary_analysis_order_and_single_attempt_dedup', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      await h.newProject('Agarose Studio Order', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      await p.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 100;
        const x = c.getContext('2d');
        x.fillStyle = 'rgb(16, 16, 16)'; x.fillRect(0, 0, 160, 100);
        x.fillStyle = 'rgb(224, 224, 224)';
        [12, 24, 36, 52, 70].forEach(y => x.fillRect(10, y, 24, 3));
        x.fillStyle = 'rgb(176, 176, 176)'; x.fillRect(60, 30, 26, 5);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const file = new File([blob], 'synthetic_gel.png', {type: 'image/png'});
        const dt = new DataTransfer(); dt.items.add(file);
        const el = document.querySelector('#clonePanel .cl-gel-upload');
        el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
        el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      });
      await h.wait(700);

      await p.evaluate(() => {
        const pn = document.querySelector('#panel');
        if (pn) pn.scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await h.wait(100);

      const m = await p.evaluate(() => {
        const vis = e => !!(e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        const box = sel => {
          const e = document.querySelector(sel);
          if (!vis(e)) return null;
          const r = e.getBoundingClientRect();
          return {y: r.top, b: r.bottom, w: r.width, h: r.height};
        };
        const lum = c => {
          const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const rgba = s => { const q = (s || '').match(/[\d.]+/g); return q ? [+q[0], +q[1], +q[2], q.length > 3 ? +q[3] : 1] : [0, 0, 0, 0]; };
        const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
        const bgOf = e => {
          const st = [];
          for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c[3] > 0) { st.push(c); if (c[3] >= 1) break; }
          }
          let c = [255, 255, 255, 1];
          for (let i = st.length - 1; i >= 0; i--) c = over(st[i], c);
          return c;
        };
        const ratioOf = e => {
          const cs = getComputedStyle(e), bg = bgOf(e), fg = over(rgba(cs.color), bg);
          const L1 = lum(fg), L2 = lum(bg);
          return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        };

        const agIds = [
          '#ag-ladder-preset', '#ag-ladder-sizes',
          '#ag-pct', '#ag-buffer', '#ag-stain', '#ag-voltage', '#ag-duration', '#ag-orientation',
          '#ag-date', '#ag-operator', '#ag-experiment', '#ag-ladder-product', '#ag-ladder-manufacturer', '#ag-ladder-cat',
          '#ag-instrument', '#ag-exposure', '#ag-brightness', '#ag-bottom-to-top', '#ag-show-migration', '#ag-adj-brightness', '#ag-lanes-adjusted', '#ag-notes'
        ];
        const visibleAgCount = agIds.filter(s => vis(document.querySelector(s))).length;
        const subheads = [...document.querySelectorAll('#clonePanel .cl-ag-subhead')].map(e => ({
          text: e.textContent.trim(),
          vis: vis(e),
          y: e.getBoundingClientRect().top,
          ratio: Math.round(ratioOf(e) * 100) / 100
        }));

        return {
          canvas: box('#ag-canvas'),
          genFig: box('#cl-gen-ag-fig'),
          laneEditor: box('#ag-lane-editor'),
          autoLanes: box('#ag-auto-lanes'),
          addLane: box('#ag-add-lane'),
          ladderPreset: box('#ag-ladder-preset'),
          ladderSizes: box('#ag-ladder-sizes'),
          calibration: box('#ag-calibration'),
          bandsSection: box('#ag-bands-section'),
          pct: box('#ag-pct'),
          date: box('#ag-date'),
          instrument: box('#ag-instrument'),
          exposure: box('#ag-exposure'),
          subheads,
          visibleAgCount,
          dupPctCount: document.querySelectorAll('#clonePanel [data-cf="pct"]').length,
          dupCfCount: document.querySelectorAll('#clonePanel [data-cf]:not([data-cf^="_"])').length
        };
      });

      const topAboveLanes = !!(m.canvas && m.genFig && m.laneEditor && m.canvas.y < m.laneEditor.y && m.genFig.y < m.laneEditor.y);
      T.check('top_preview_and_gen_above_lanes', topAboveLanes, 'Gel preview canvas and Generate figure stay at top above lane editor');

      const lanesAboveMeta = !!(
        m.laneEditor && m.addLane && m.pct && m.instrument && m.exposure &&
        m.laneEditor.y < m.pct.y && m.laneEditor.y < m.instrument.y &&
        m.addLane.y < m.pct.y && m.addLane.y < m.exposure.y
      );
      T.check('lanes_above_metadata', lanesAboveMeta, `laneEditor.y=${m.laneEditor ? Math.round(m.laneEditor.y) : 'none'} addLane.y=${m.addLane ? Math.round(m.addLane.y) : 'none'} pct.y=${m.pct ? Math.round(m.pct.y) : 'none'} instrument.y=${m.instrument ? Math.round(m.instrument.y) : 'none'}`);

      const calAndBandsAboveMeta = !!(
        m.ladderPreset && m.ladderSizes && m.calibration && m.bandsSection && m.pct && m.date && m.instrument &&
        m.ladderPreset.y < m.pct.y && m.ladderSizes.y < m.pct.y &&
        m.calibration.y < m.pct.y && m.bandsSection.y < m.pct.y &&
        m.bandsSection.y < m.date.y && m.bandsSection.y < m.instrument.y
      );
      T.check('calibration_and_bands_above_metadata', calAndBandsAboveMeta, `bandsSection.y=${m.bandsSection ? Math.round(m.bandsSection.y) : 'none'} pct.y=${m.pct ? Math.round(m.pct.y) : 'none'}`);

      const wantHeads = ['Electrophoresis conditions', 'Provenance & ladder catalog', 'Imaging & figure disclosures'];
      const subheadsOrdered = !!(
        m.subheads.length === 3 &&
        m.subheads.every((s, idx) => s.vis && s.text === wantHeads[idx]) &&
        m.bandsSection && m.pct && m.date && m.instrument &&
        m.bandsSection.y < m.subheads[0].y &&
        m.subheads[0].y < m.pct.y && m.pct.y < m.subheads[1].y &&
        m.subheads[1].y < m.date.y && m.date.y < m.subheads[2].y &&
        m.subheads[2].y < m.instrument.y
      );
      T.check('subheads_grouped_and_ordered', subheadsOrdered, JSON.stringify(m.subheads.map(s => s.text)));

      const subheadsContrastOk = m.subheads.length === 3 && m.subheads.every(s => s.ratio >= 4.5);
      T.check('subheads_wcag_contrast', subheadsContrastOk, JSON.stringify(m.subheads.map(s => s.ratio)));

      T.check('all_22_ag_inputs_visible', m.visibleAgCount === 22, `visibleAgCount=${m.visibleAgCount}`);
      T.check('single_attempt_no_duplicate_pct', m.dupPctCount === 0 && m.dupCfCount === 0, `dupPctCount=${m.dupPctCount} dupCfCount=${m.dupCfCount}`);

      await p.locator('#ag-pct').fill('1.5');
      await p.locator('#ag-pct').dispatchEvent('change');
      await p.locator('#ag-ladder-product').fill('NEB 1 kb');
      await p.locator('#ag-ladder-product').dispatchEvent('change');
      await p.locator('#ag-lane-exp-1').fill('1500 bp');
      await p.locator('#ag-lane-exp-1').dispatchEvent('change');
      await h.wait(300);

      const afterMirror = await p.evaluate(() => ({
        dupCfCount: document.querySelectorAll('#clonePanel [data-cf]:not([data-cf^="_"])').length,
        moreCount: document.querySelectorAll('#clonePanel details.more').length,
        moreFieldCount: document.querySelectorAll('#clonePanel details.more [data-cf^="_"]').length
      }));
      const mirrorStaysDeduped = afterMirror.dupCfCount === 0 && afterMirror.moreCount === 1 && afterMirror.moreFieldCount === 4;
      T.check('studio_mirror_keeps_duplicates_hidden', mirrorStaysDeduped, `dupCf=${afterMirror.dupCfCount} more=${afterMirror.moreCount} moreFields=${afterMirror.moreFieldCount}`);

      await p.locator('#ag-ladder-preset').selectOption('neb100');
      await h.wait(200);
      await p.locator('#clonePanel [data-cl="split-ag-lane"][data-lane-idx="0"]').click();
      await h.wait(200);
      for (const fname of ['second_gel.png', 'third_gel.png']) {
        await p.evaluate(async name => {
          const c = document.createElement('canvas'); c.width = 140; c.height = 90;
          const x = c.getContext('2d');
          x.fillStyle = 'rgb(20, 20, 20)'; x.fillRect(0, 0, 140, 90);
          x.fillStyle = 'rgb(210, 210, 210)'; x.fillRect(40, 28, 24, 4);
          const blob = await new Promise(r => c.toBlob(r, 'image/png'));
          const file = new File([blob], name, {type: 'image/png'});
          const dt = new DataTransfer(); dt.items.add(file);
          const el = document.querySelector('#clonePanel .cl-gel-upload');
          el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
          el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
        }, fname);
        await h.wait(500);
      }

      const afterPresetSplitReplace = await p.evaluate(() => ({
        dupCfCount: document.querySelectorAll('#clonePanel [data-cf]:not([data-cf^="_"])').length,
        gelName: (document.querySelector('#clonePanel .cl-gel-name') ? document.querySelector('#clonePanel .cl-gel-name').textContent.trim() : '')
      }));
      const presetSplitReplaceDeduped = afterPresetSplitReplace.dupCfCount === 0 && afterPresetSplitReplace.gelName === 'third_gel.png';
      T.check('preset_split_and_3x_replace_no_duplicates', presetSplitReplaceDeduped, `dupCf=${afterPresetSplitReplace.dupCfCount} gelName=${afterPresetSplitReplace.gelName}`);

      const hScrollDesktop = await h.hScroll();
      T.check('no_hscroll_desktop', !hScrollDesktop, `hScrollDesktop=${hScrollDesktop}`);

      await p.setViewportSize({width: 390, height: 860});
      await h.wait(250);
      const hScrollMobile = await h.hScroll();
      T.check('no_hscroll_mobile_390', !hScrollMobile, `hScrollMobile=${hScrollMobile}`);

      T.check('no_console_errors_studio', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  await T.t('legacy_populated_gel_attempt_and_multi_attempt_compat', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const legacyProj = {
        app: 'HPLC Figure Bench',
        version: 1,
        schemaVersion: 1,
        name: 'Legacy Gel Synthetic',
        step: 'clone:s1',
        runs: [],
        traces: [],
        gels: [],
        prep: {
          on: true,
          includeCloning: true,
          cloning: {
            type: 'cloning',
            tpl: 'ath',
            ext: {src: '', ver: '', note: ''},
            stages: [
              {
                id: 's1',
                kind: 'gel',
                name: '',
                skip: false,
                at: [
                  {
                    id: 'a1',
                    st: 'done',
                    from: '',
                    ck: {},
                    f: {pct: '1.8', obsSize: '1200'}
                  }
                ]
              }
            ]
          }
        }
      };

      await p.setInputFiles('#projFile', {
        name: 'legacy_gel_synthetic.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(legacyProj))
      });
      await h.wait(1500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      const legacyPctLoc = cl(p).locator('[data-cf="pct"]');
      const legacyObsLoc = cl(p).locator('[data-cf="obsSize"]');
      const pctVis = (await legacyPctLoc.count()) === 1 && (await legacyPctLoc.isVisible());
      const obsVis = (await legacyObsLoc.count()) === 1 && (await legacyObsLoc.isVisible());
      const pctVal = pctVis ? await legacyPctLoc.inputValue() : '';
      const obsVal = obsVis ? await legacyObsLoc.inputValue() : '';
      const legacyPreserved = pctVis && obsVis && pctVal === '1.8' && obsVal === '1200';
      T.check('legacy_gel_attempt_fields_visible', legacyPreserved, `pct=${pctVal} obsSize=${obsVal}`);

      await cl(p).locator('[data-cl="addat"]').click();
      await h.wait(400);
      const atCount = await cl(p).locator('details.cl-at').count();
      const multiPctCount = await cl(p).locator('details.cl-at[open] [data-cf="pct"]').count();
      const multiAttemptOk = atCount === 2 && multiPctCount === 1;
      T.check('multi_attempt_gel_stage_intact', multiAttemptOk, `atCount=${atCount} multiPctCount=${multiPctCount}`);
      T.check('no_console_errors_legacy', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  await T.t('legacy_expsize_only_persists_across_step_revisit', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);
      const legacyExpProj = {
        app: 'HPLC Figure Bench',
        version: 1,
        schemaVersion: 1,
        name: 'Legacy ExpSize Only Synthetic',
        step: 'clone:s1',
        runs: [],
        traces: [],
        gels: [],
        prep: {
          on: true,
          includeCloning: true,
          cloning: {
            type: 'cloning',
            tpl: 'ath',
            ext: {src: '', ver: '', note: ''},
            stages: [
              {
                id: 's1',
                kind: 'gel',
                name: '',
                skip: false,
                at: [
                  {
                    id: 'a1',
                    st: 'done',
                    from: '',
                    ck: {},
                    f: {expSize: '950'}
                  }
                ]
              }
            ]
          }
        }
      };

      await p.setInputFiles('#projFile', {
        name: 'legacy_expsize_only.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(legacyExpProj))
      });
      await h.wait(1500);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      const expLoc1 = cl(p).locator('[data-cf="expSize"]');
      const vis1 = (await expLoc1.count()) === 1 && (await expLoc1.isVisible());
      const val1 = vis1 ? await expLoc1.inputValue() : '';
      const firstVisitOk = vis1 && val1 === '950';
      T.check('legacy_expsize_visible_visit_1', firstVisitOk, `vis1=${vis1} val1=${val1}`);

      await h.step('construct');
      await h.wait(250);
      await go(h, 'Agarose-gel verification');
      await h.wait(300);

      const expLoc2 = cl(p).locator('[data-cf="expSize"]');
      const vis2 = (await expLoc2.count()) === 1 && (await expLoc2.isVisible());
      const val2 = vis2 ? await expLoc2.inputValue() : '';
      const secondVisitOk = vis2 && val2 === '950';
      T.check('legacy_expsize_visible_visit_2', secondVisitOk, `vis2=${vis2} val2=${val2}`);
      T.check('no_console_errors_legacy_expsize', errs.length === 0, errs.join('; '));
    } finally {
      await close();
    }
  });

  T.done();
})();
