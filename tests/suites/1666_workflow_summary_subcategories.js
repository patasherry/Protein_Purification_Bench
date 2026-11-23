// Issue 1658: Workflow figure layout disclosure, summary warning vs assumption split, and parallel branch subheading.
const fs = require('fs');
const {open, H, suite, src} = require('../lib/harness');

(async () => {
  const T = suite('1666_workflow_summary_subcategories');

  await T.t('workflow_summary_and_layout_subcategorization', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Workflow subcategories');
      await h.gb(src('gb'));

      // Add a manual starting step (3.50 mg) so Step 1 has 37% step yield and Step 2 has >105% (234%) step yield.
      await p.click('#tl [data-addmenu]');
      await p.click('#tl [data-addstep="man:other"]');
      await h.wait(350);
      await p.fill('#man-name', 'Clarified lysate');
      await p.fill('#man-vol', '1');
      await p.fill('#man-conc', '3.5');
      await p.locator('#man-conc').dispatchEvent('change');
      await h.wait(350);

      await h.addRun(src('q'));
      await h.suggest();
      await h.addRun(src('his'));
      await h.suggest();

      const runSteps = (await h.timeline()).filter(s => s.k.startsWith('run:'));
      await h.step(runSteps[1].k);

      // 1. Parallel branch (optional) subheading on Step 2 (#ssFromBox)
      const fromInfo = await p.evaluate(() => {
        const box = document.getElementById('ssFromBox');
        const sub = box ? box.querySelector('.subhead') : null;
        const fromSel = document.getElementById('ssFrom');
        const fromNote = document.getElementById('ssFromNote');
        const vis = el => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return !el.closest('[hidden]') && r.width > 0 && r.height > 0;
        };
        const sr = sub ? sub.getBoundingClientRect() : null;
        const fr = fromSel ? fromSel.getBoundingClientRect() : null;
        return {
          subVis: vis(sub),
          subTxt: sub ? sub.textContent.trim() : '',
          above: !!(sr && fr && sr.bottom <= fr.top + 2),
          fromVis: vis(fromSel),
          noteVis: vis(fromNote)
        };
      });
      T.check(
        'ssfrom_parallel_branch_subhead_above_controls',
        fromInfo.subVis && /Parallel branch \(optional\)/i.test(fromInfo.subTxt) && fromInfo.above && fromInfo.fromVis && fromInfo.noteVis,
        JSON.stringify(fromInfo)
      );

      // 2. Navigate to Figure and methods and inspect #sumNotes vs #sumAssumptions + #methodsText
      await h.step('figure');
      await h.wait(400);

      const sumState = await p.evaluate(() => {
        const notesEl = document.getElementById('sumNotes');
        const notesVis = !!(notesEl && !notesEl.hidden && notesEl.getBoundingClientRect().height > 0);
        const notesItems = notesEl ? [...notesEl.querySelectorAll('li')].map(li => li.textContent.trim()) : [];
        const aBox = document.getElementById('sumAssumptions');
        const aSum = document.getElementById('sumAssumptionsSum');
        const mBox = document.getElementById('methodsBox');
        const mTxt = document.getElementById('methodsText');
        return {
          notesVis,
          notesItems,
          hasABox: !!aBox,
          aHidden: aBox ? aBox.hidden : true,
          aOpen: aBox ? aBox.open : true,
          aSumTxt: aSum ? aSum.textContent.trim() : '',
          mOpen: !!(mBox && mBox.open),
          mRows: mTxt ? +(mTxt.getAttribute('rows') || 0) : 0,
          mLen: mTxt ? mTxt.value.trim().length : 0
        };
      });

      const hasGainWarn = sumState.notesItems.some(t => /Step 2 \(IMAC\):.*234%.*can't be a real gain/i.test(t));
      const leakedAssumed = sumState.notesItems.some(t => /mm is assumed|No purity gel/i.test(t));
      T.check(
        'sum_notes_keeps_urgent_yield_warning_clean',
        sumState.notesVis && sumState.notesItems.length === 1 && hasGainWarn && !leakedAssumed,
        JSON.stringify(sumState.notesItems)
      );

      T.check(
        'sum_assumptions_closed_by_default_with_count',
        sumState.hasABox && !sumState.aHidden && sumState.aOpen === false && sumState.aSumTxt === 'Assumptions and notes (2)',
        JSON.stringify({hasABox: sumState.hasABox, aHidden: sumState.aHidden, aOpen: sumState.aOpen, aSumTxt: sumState.aSumTxt})
      );

      if (await p.locator('#sumAssumptions > summary').count()) {
        await p.click('#sumAssumptions > summary');
        await h.wait(150);
      }

      const assumOpenState = await p.evaluate(() => {
        const aBox = document.getElementById('sumAssumptions');
        const aList = document.getElementById('sumAssumptionsList');
        const vis = !!(aList && !aList.closest('[hidden]') && aList.getBoundingClientRect().height > 0);
        const items = aList ? [...aList.querySelectorAll('li')].map(li => li.textContent.trim()) : [];
        return {open: !!(aBox && aBox.open), vis, items};
      });
      const uvBullets = assumOpenState.items.filter(t => /the UV path is not in the file/i.test(t));
      const hasConsolidatedUv = uvBullets.length === 1 && /Step 1 \(Anion exchange\) and Step 2 \(IMAC\): the UV path is not in the file, so 2(?:\.0)? mm is assumed\. Enter it on each run card/i.test(uvBullets[0]);
      const hasMissingGel = assumOpenState.items.some(t => t === 'No purity gel for Anion exchange or IMAC.');
      T.check(
        'sum_assumptions_consolidates_uv_path_and_missing_gel',
        assumOpenState.open && assumOpenState.vis && assumOpenState.items.length === 2 && hasConsolidatedUv && hasMissingGel,
        JSON.stringify(assumOpenState)
      );

      T.check(
        'methods_box_open_with_compact_7_rows',
        sumState.mOpen && sumState.mRows === 7 && sumState.mLen > 40,
        JSON.stringify({mOpen: sumState.mOpen, mRows: sumState.mRows, mLen: sumState.mLen})
      );

      // 3. #wfMore primary controls visible vs #wfLayoutMore secondary controls folded by default
      const primaryIds = ['#o-wfGels', '#o-wfGelFull', '#o-wfFull', '#wfFullView', '#o-runCond', '#o-wfYield'];
      const secondaryIds = ['#o-wfH', '#o-wfTitle', '#o-wfPad', '#o-wfLetters', '#o-wfArrows', '#o-noGelSlot', '#o-wfFit'];
      const visAll = async sels => {
        for (const s of sels) if (!(await p.locator(s).isVisible())) return false;
        return true;
      };
      const hiddenAll = async sels => {
        for (const s of sels) if (await p.locator(s).isVisible()) return false;
        return true;
      };

      const wfLmExists = (await p.locator('#wfLayoutMore').count()) === 1;
      const wfLmInitOpen = wfLmExists ? await p.$eval('#wfLayoutMore', d => d.open) : true;
      const primVis = await visAll(primaryIds);
      const secHidden = await hiddenAll(secondaryIds);
      const gelFullInChecks = (await p.locator('#wfMore .checks #o-wfGelFull').count()) === 1;
      T.check(
        'wf_primary_visible_and_geometry_folded_by_default',
        wfLmExists && !wfLmInitOpen && primVis && secHidden && gelFullInChecks,
        JSON.stringify({wfLmExists, wfLmInitOpen, primVis, secHidden, gelFullInChecks})
      );

      // 4. #panelSearch expands #wfLayoutMore on match and restores closed state when cleared
      await p.fill('#panelSearch', 'Margin under text panels');
      await h.wait(200);
      const srchOpen = wfLmExists ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const padVisDuringSearch = await p.locator('#o-wfPad').isVisible();
      await p.fill('#panelSearch', '');
      await h.wait(200);
      const srchRestoredClosed = wfLmExists ? !(await p.$eval('#wfLayoutMore', d => d.open)) : false;
      const padHiddenAfterClear = !(await p.locator('#o-wfPad').isVisible());
      T.check(
        'panel_search_expands_and_restores_wf_layout_more',
        wfLmExists && srchOpen && padVisDuringSearch && srchRestoredClosed && padHiddenAfterClear,
        JSON.stringify({wfLmExists, srchOpen, padVisDuringSearch, srchRestoredClosed, padHiddenAfterClear})
      );

      // 5. Modifying an option inside #wfLayoutMore persists and auto-opens #wfLayoutMore on reload
      if (wfLmExists && !(await p.$eval('#wfLayoutMore', d => d.open))) {
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
      }
      await p.fill('#o-wfPad', '24');
      await p.locator('#o-wfPad').dispatchEvent('change');
      await h.wait(450);
      await p.click('#homeBtn');
      await h.wait(600);
      await p.reload();
      await h.wait(900);
      await p.locator('#projList [data-pid]').first().click();
      await h.wait(800);
      await h.step('figure');
      await h.wait(400);

      const wfLmExistsReload = (await p.locator('#wfLayoutMore').count()) === 1;
      const wfLmOpenReload = wfLmExistsReload ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const padVisReload = await p.locator('#o-wfPad').isVisible();
      const padValReload = await p.locator('#o-wfPad').inputValue();
      T.check(
        'wf_layout_more_auto_opens_on_reload_when_non_default',
        wfLmExistsReload && wfLmOpenReload && padVisReload && padValReload === '24' && errs.length === 0,
        JSON.stringify({wfLmExistsReload, wfLmOpenReload, padVisReload, padValReload, errs})
      );

      // 6. Editing a second geometry control during #panelSearch when manually closed keeps #wfLayoutMore open on clear
      let closedBeforeSrchEdit = false, openAfterSrchEdit = false, wfHVisAfterSrchEdit = false, wfHValAfterSrchEdit = '';
      if (wfLmExistsReload) {
        if (!(await p.$eval('#wfLayoutMore', d => d.open))) {
          await p.click('#wfLayoutMore > summary');
          await h.wait(150);
        }
        await p.fill('#o-wfPad', '22');
        await p.locator('#o-wfPad').dispatchEvent('change');
        await h.wait(200);
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
        closedBeforeSrchEdit = !(await p.$eval('#wfLayoutMore', d => d.open));
      }
      await p.fill('#panelSearch', 'Chromatogram height');
      await h.wait(200);
      await p.fill('#o-wfH', '3.2');
      await p.locator('#o-wfH').dispatchEvent('change');
      await h.wait(200);
      await p.fill('#panelSearch', '');
      await h.wait(200);
      openAfterSrchEdit = wfLmExistsReload ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      wfHVisAfterSrchEdit = await p.locator('#o-wfH').isVisible();
      wfHValAfterSrchEdit = await p.locator('#o-wfH').inputValue();
      T.check(
        'search_edit_second_geometry_control_when_closed_keeps_open',
        wfLmExistsReload && closedBeforeSrchEdit && openAfterSrchEdit && wfHVisAfterSrchEdit && wfHValAfterSrchEdit === '3.2',
        JSON.stringify({wfLmExistsReload, closedBeforeSrchEdit, openAfterSrchEdit, wfHVisAfterSrchEdit, wfHValAfterSrchEdit})
      );

      // 7. Leaving a project via #homeBtn from a run step and reopening auto-opens #wfLayoutMore and resets #sumAssumptions closed
      let wfClosedBeforeLeave = false, assumOpenBeforeLeave = false;
      if (wfLmExistsReload) {
        if (await p.$eval('#wfLayoutMore', d => d.open)) {
          await p.click('#wfLayoutMore > summary');
          await h.wait(150);
        }
        wfClosedBeforeLeave = !(await p.$eval('#wfLayoutMore', d => d.open));
      }
      if ((await p.locator('#sumAssumptions').count()) === 1) {
        if (!(await p.$eval('#sumAssumptions', d => d.open))) {
          await p.click('#sumAssumptions > summary');
          await h.wait(150);
        }
        assumOpenBeforeLeave = await p.$eval('#sumAssumptions', d => d.open);
      }
      const runStepsReopen = (await h.timeline()).filter(s => s.k.startsWith('run:'));
      await h.step(runStepsReopen[0].k);
      await h.wait(300);
      await p.click('#homeBtn');
      await h.wait(600);
      await p.locator('#projList [data-pid]').first().click();
      await h.wait(800);
      await h.step('figure');
      await h.wait(400);
      const hasWfLmReopen = (await p.locator('#wfLayoutMore').count()) === 1;
      const wfOpenAfterRunReopen = hasWfLmReopen ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const hasAssumReopen = (await p.locator('#sumAssumptions').count()) === 1;
      const assumClosedAfterRunReopen = hasAssumReopen ? !(await p.$eval('#sumAssumptions', d => d.open)) : false;
      T.check(
        'reopen_project_after_leaving_from_run_step_auto_opens_wf_and_resets_assumptions',
        hasWfLmReopen && hasAssumReopen && wfClosedBeforeLeave && assumOpenBeforeLeave && wfOpenAfterRunReopen && assumClosedAfterRunReopen,
        JSON.stringify({hasWfLmReopen, hasAssumReopen, wfClosedBeforeLeave, assumOpenBeforeLeave, wfOpenAfterRunReopen, assumClosedAfterRunReopen})
      );

      // 8. Manual close sticks across renderSumTable(), and #optReset restores defaults and closes #wfLayoutMore
      let closedAfterRender = false, reopenedBeforeReset = false, padAfterReset = '24', closedAfterReset = false, padHiddenAfterReset = false;
      if (hasWfLmReopen) {
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
        await p.click('#o-wfGels');
        await h.wait(150);
        await p.click('#o-wfGels');
        await h.wait(150);
        closedAfterRender = !(await p.$eval('#wfLayoutMore', d => d.open));
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
        reopenedBeforeReset = await p.$eval('#wfLayoutMore', d => d.open);
        if (!(await p.locator('#optReset').isVisible())) {
          await p.click('#moreBtn');
          await h.wait(150);
        }
        if (!(await p.locator('#optReset').isVisible())) {
          await p.locator('#panel > .grp.optsec > h2', {hasText: 'Figure style'}).click();
          await h.wait(150);
        }
        await p.click('#optReset');
        await h.wait(250);
        padAfterReset = await p.locator('#o-wfPad').inputValue();
        closedAfterReset = !(await p.$eval('#wfLayoutMore', d => d.open));
        padHiddenAfterReset = !(await p.locator('#o-wfPad').isVisible());
      }
      T.check(
        'wf_layout_more_respects_manual_close_and_opt_reset',
        wfLmExistsReload && closedAfterRender && reopenedBeforeReset && padAfterReset === '' && closedAfterReset && padHiddenAfterReset,
        JSON.stringify({wfLmExistsReload, closedAfterRender, reopenedBeforeReset, padAfterReset, closedAfterReset, padHiddenAfterReset})
      );

      // 9. Searching 'Panel geometry' in #panelSearch matches #o-wfH, opens #wfLayoutMore, and hides #searchEmpty
      await p.fill('#panelSearch', 'Panel geometry');
      await h.wait(200);
      const geomOpen = wfLmExistsReload ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const wfHVis = await p.locator('#o-wfH').isVisible();
      const empHidden = await p.$eval('#searchEmpty', e => e.hidden);
      await p.fill('#panelSearch', '');
      await h.wait(200);
      const geomClosedAfter = wfLmExistsReload ? !(await p.$eval('#wfLayoutMore', d => d.open)) : false;
      T.check(
        'panel_search_geometry_heading_matches_controls',
        wfLmExistsReload && geomOpen && wfHVis && empHidden && geomClosedAfter && errs.length === 0,
        JSON.stringify({wfLmExistsReload, geomOpen, wfHVis, empHidden, geomClosedAfter, errs})
      );

      // 10. Multi-prep roundtrip via a new construct-step preparation resets #sumAssumptions closed and auto-opens #wfLayoutMore
      if (wfLmExistsReload && !(await p.$eval('#wfLayoutMore', d => d.open))) {
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
      }
      await p.fill('#o-wfPad', '18');
      await p.locator('#o-wfPad').dispatchEvent('change');
      await h.wait(250);
      let prepWfClosedBefore = false, prepAssumOpenBefore = false;
      if (wfLmExistsReload) {
        if (await p.$eval('#wfLayoutMore', d => d.open)) {
          await p.click('#wfLayoutMore > summary');
          await h.wait(150);
        }
        prepWfClosedBefore = !(await p.$eval('#wfLayoutMore', d => d.open));
      }
      if ((await p.locator('#sumAssumptions').count()) === 1) {
        if (!(await p.$eval('#sumAssumptions', d => d.open))) {
          await p.click('#sumAssumptions > summary');
          await h.wait(150);
        }
        prepAssumOpenBefore = await p.$eval('#sumAssumptions', d => d.open);
      }
      await p.click('#openDirBtn');
      await h.wait(250);
      await p.click('#dirNewPrep');
      await h.wait(200);
      await p.fill('#dirPromptInput', 'Prep 2');
      await p.click('#dirPromptConfirm');
      await h.wait(350);
      await p.click('#dirContent [data-dir-name="Prep 2"] [data-dir-open]');
      await h.wait(500);
      const crumbsPrep2 = await p.$eval('#projDirCrumbs', el => /Prep 2/.test(el.textContent || ''));
      await p.click('#openDirBtn');
      await h.wait(250);
      await p.click('#dirContent [data-dir-type="prep"]:not(.active-prep) [data-dir-open]');
      await h.wait(500);
      await h.step('figure');
      await h.wait(350);
      const hasWfLmPrep = (await p.locator('#wfLayoutMore').count()) === 1;
      const hasAssumPrep = (await p.locator('#sumAssumptions').count()) === 1;
      const wfOpenAfterPrep = hasWfLmPrep ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const assumClosedAfterPrep = hasAssumPrep ? !(await p.$eval('#sumAssumptions', d => d.open)) : false;
      const padValAfterPrep = await p.locator('#o-wfPad').inputValue();
      T.check(
        'multi_prep_roundtrip_via_construct_resets_assumptions_and_auto_opens_wf',
        hasWfLmPrep && hasAssumPrep && prepWfClosedBefore && prepAssumOpenBefore && crumbsPrep2 && wfOpenAfterPrep && assumClosedAfterPrep && padValAfterPrep === '18',
        JSON.stringify({hasWfLmPrep, hasAssumPrep, prepWfClosedBefore, prepAssumOpenBefore, crumbsPrep2, wfOpenAfterPrep, assumClosedAfterPrep, padValAfterPrep})
      );

      // 11. Quick-mode #file .json roundtrip syncs #wfLayoutMore.open (true for non-default, false for default) and resets #sumAssumptions.open === false
      await p.click('#homeBtn');
      await h.wait(500);
      await p.click('#homeQuick');
      await h.wait(600);
      await p.setInputFiles('#file', [src('q'), src('his')]);
      await h.wait(2200);
      const sbs = p.locator('#list .trace.run [data-act="suggest"]');
      const sCount = await sbs.count();
      for (let i = 0; i < sCount; i++) {
        await sbs.nth(i).click();
        await h.wait(300);
      }
      if (await p.locator('#figtabs [data-fig="workflow"][aria-selected="false"]').count()) {
        await p.click('#figtabs [data-fig="workflow"]');
        await h.wait(300);
      }
      const hasWfQ = (await p.locator('#wfLayoutMore').count()) === 1;
      const hasAssumQ = (await p.locator('#sumAssumptions').count()) === 1;
      if (hasWfQ && !(await p.$eval('#wfLayoutMore', d => d.open))) {
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
      }
      await p.fill('#o-wfPad', '');
      await p.locator('#o-wfPad').dispatchEvent('change');
      await h.wait(250);
      const [dlDef] = await Promise.all([p.waitForEvent('download', {timeout: 15000}), p.click('#projSave')]);
      const defBuf = fs.readFileSync(await dlDef.path());
      if (hasWfQ && !(await p.$eval('#wfLayoutMore', d => d.open))) {
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
      }
      await p.fill('#o-wfPad', '26');
      await p.locator('#o-wfPad').dispatchEvent('change');
      await h.wait(250);
      const [dlNd] = await Promise.all([p.waitForEvent('download', {timeout: 15000}), p.click('#projSave')]);
      const ndBuf = fs.readFileSync(await dlNd.path());

      if (hasAssumQ && !(await p.$eval('#sumAssumptions', d => d.open))) {
        await p.click('#sumAssumptions > summary');
        await h.wait(150);
      }
      await p.setInputFiles('#file', {name: 'quick_default_project.json', mimeType: 'application/json', buffer: defBuf});
      await h.wait(700);
      const closedOnDef = hasWfQ ? !(await p.$eval('#wfLayoutMore', d => d.open)) : false;
      const assumClosedOnDef = hasAssumQ ? !(await p.$eval('#sumAssumptions', d => d.open)) : false;
      const padOnDef = await p.locator('#o-wfPad').inputValue();

      if (hasAssumQ && !(await p.$eval('#sumAssumptions', d => d.open))) {
        await p.click('#sumAssumptions > summary');
        await h.wait(150);
      }
      await p.setInputFiles('#file', {name: 'quick_nondef_project.json', mimeType: 'application/json', buffer: ndBuf});
      await h.wait(700);
      const openOnNd = hasWfQ ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const assumClosedOnNd = hasAssumQ ? !(await p.$eval('#sumAssumptions', d => d.open)) : false;
      const padOnNd = await p.locator('#o-wfPad').inputValue();

      if (hasWfQ && (await p.$eval('#wfLayoutMore', d => d.open))) {
        await p.click('#wfLayoutMore > summary');
        await h.wait(150);
      }
      if (hasAssumQ && !(await p.$eval('#sumAssumptions', d => d.open))) {
        await p.click('#sumAssumptions > summary');
        await h.wait(150);
      }
      await p.setInputFiles('#file', {name: 'quick_nondef2_project.json', mimeType: 'application/json', buffer: ndBuf});
      await h.wait(700);
      const reopenOnNd = hasWfQ ? await p.$eval('#wfLayoutMore', d => d.open) : false;
      const assumReclosedOnNd = hasAssumQ ? !(await p.$eval('#sumAssumptions', d => d.open)) : false;
      T.check(
        'quick_file_picker_json_roundtrip_syncs_wf_layout_more',
        hasWfQ && hasAssumQ && closedOnDef && assumClosedOnDef && padOnDef === '' && openOnNd && assumClosedOnNd && padOnNd === '26' && reopenOnNd && assumReclosedOnNd && errs.length === 0,
        JSON.stringify({hasWfQ, hasAssumQ, closedOnDef, assumClosedOnDef, padOnDef, openOnNd, assumClosedOnNd, padOnNd, reopenOnNd, assumReclosedOnNd, errs})
      );
    } finally {
      await close();
    }
  });

  T.done();
})();
