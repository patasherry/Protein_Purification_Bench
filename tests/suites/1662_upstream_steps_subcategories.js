// 1662 upstream steps subcategories: Transformation card order & clone subheading, Concentrated manual reading promotion, and upstream/manual/final supplemental folds. UI and DOM only.
const {open, H, suite, src} = require('../lib/harness');

(async () => {
  const T = suite('1662_upstream_steps_subcategories');

  await T.t('transformation_order_and_cleave_switch', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await h.newProject('M2 Transform Order');
    await h.step('transform');

    const box = sel => p.locator(sel).boundingBox();
    const prepBox = await box('#prepPanel');
    const cloneBox = await box('#clonePanel');
    const footBox = await box('#stepFoot');
    const moreBox = await box('#moreOpts');

    T.check(
      'transform_prep_above_clone_when_cloning_off',
      !!(prepBox && cloneBox && prepBox.y + prepBox.height <= cloneBox.y + 2),
      `prep=${JSON.stringify(prepBox)} clone=${JSON.stringify(cloneBox)}`
    );
    T.check(
      'transform_clone_above_foot_and_more',
      !!(cloneBox && footBox && moreBox && cloneBox.y + cloneBox.height <= footBox.y + 2 && footBox.y + footBox.height <= moreBox.y + 2),
      `clone=${JSON.stringify(cloneBox)} foot=${JSON.stringify(footBox)} more=${JSON.stringify(moreBox)}`
    );

    const subLoc = p.locator('[data-sub="ptr"] .subhead');
    const hasSub = (await subLoc.count()) === 1 && (await subLoc.isVisible());
    const subTxt = hasSub ? (await subLoc.textContent()).trim() : '';
    const subBox = hasSub ? await subLoc.boundingBox() : null;
    const stockBox = await box('#pr-trStock');
    const colBox = await box('#pr-trCol');
    const addBox = await box('#prCloneAdd');
    const primaryVis = (await p.locator('#pr-trPlasmid').isVisible()) &&
      (await p.locator('#pr-strain2').isVisible()) &&
      (await p.locator('#pr-trMethod').isVisible()) &&
      (await p.locator('#pr-trSel').isVisible()) &&
      (await p.locator('#pr-trStock').isVisible()) &&
      (await p.locator('#pr-trCol').isVisible()) &&
      (await p.locator('#prCloneAdd').isVisible());

    T.check(
      'transform_subhead_between_stock_and_colonies',
      !!(hasSub && primaryVis && subTxt === 'Colonies & clone tracking (optional)' &&
        stockBox && subBox && colBox && addBox &&
        stockBox.y + stockBox.height <= subBox.y + 2 &&
        subBox.y + subBox.height <= colBox.y + 2 &&
        colBox.y + colBox.height <= addBox.y + 2),
      `sub="${subTxt}" stock=${JSON.stringify(stockBox)} subBox=${JSON.stringify(subBox)} col=${JSON.stringify(colBox)}`
    );

    const psDet = p.locator('details.proj-settings');
    if (!(await psDet.evaluate(e => e.open))) {
      await psDet.locator('summary').click();
      await h.wait(100);
    }
    await p.click('#projType');
    await h.wait(350);
    const tplBtn = p.locator('#clonePanel [data-cl="tpl"]').first();
    if ((await tplBtn.count()) === 1 && (await tplBtn.isVisible())) {
      await tplBtn.click();
      await h.wait(300);
    }
    await h.step('transform');
    const prepOn = await box('#prepPanel');
    const cloneOn = await box('#clonePanel');
    T.check(
      'transform_clone_above_prep_when_cloning_on',
      !!(prepOn && cloneOn && cloneOn.y + cloneOn.height <= prepOn.y + 2),
      `cloneOn=${JSON.stringify(cloneOn)} prepOn=${JSON.stringify(prepOn)}`
    );

    if (!(await psDet.evaluate(e => e.open))) {
      await psDet.locator('summary').click();
      await h.wait(100);
    }
    await p.click('#projType');
    await h.wait(400);
    const prepOff = await box('#prepPanel');
    const cloneOff = await box('#clonePanel');
    T.check(
      'transform_prep_restored_above_clone_when_cloning_off_again',
      !!(prepOff && cloneOff && prepOff.y + prepOff.height <= cloneOff.y + 2),
      `prepOff=${JSON.stringify(prepOff)} cloneOff=${JSON.stringify(cloneOff)}`
    );

    await h.addRun(src('his'));
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="cleave"]');
    await h.wait(350);
    const cleaveSwitchHidden = !(await p.locator('#pr-cleave').isVisible());
    const proteaseVis = await p.locator('#pr-protease').isVisible();
    T.check(
      'cleave_redundant_switch_hidden_in_project',
      cleaveSwitchHidden && proteaseVis,
      `cleaveHidden=${cleaveSwitchHidden} proteaseVis=${proteaseVis}`
    );
    T.check('transform_no_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  await T.t('concentrated_manual_reading_and_narrow_budget', async () => {
    const {p, errs, close} = await open({width: 390, height: 860}), h = H(p);
    await h.newProject('M2 Conc Narrow');
    await h.addRun(src('his'));
    await h.suggest();
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="conc"]');
    await h.wait(450);

    const btwMoreOpen0 = await p.locator('#btwMore').evaluate(e => e.open);
    const splitOpen0 = await p.locator('#btwSplitBox').evaluate(e => e.open);
    const concVis0 = await p.locator('#btw-conc').isVisible();
    const vOutVis0 = await p.locator('#btw-vOut').isVisible();

    T.check(
      'conc_manual_reading_visible_without_opening_more',
      !btwMoreOpen0 && !splitOpen0 && concVis0 && vOutVis0,
      `btwMoreOpen=${btwMoreOpen0} splitOpen=${splitOpen0} concVis=${concVis0}`
    );

    let concVal = '';
    let btwMoreAfterType = true;
    if (concVis0) {
      await p.fill('#btw-conc', '4.25');
      await p.dispatchEvent('#btw-conc', 'change');
      await h.wait(250);
      concVal = await p.inputValue('#btw-conc');
      btwMoreAfterType = await p.locator('#btwMore').evaluate(e => e.open);
    }
    T.check(
      'conc_typing_manual_reading_keeps_more_closed',
      concVis0 && concVal === '4.25' && !btwMoreAfterType,
      `concVal="${concVal}" btwMoreOpen=${btwMoreAfterType}`
    );

    await p.setInputFiles('#btwNdFile', src('nd'));
    await h.wait(600);
    const concHiddenAfterNd = !(await p.locator('#btw-conc').isVisible());
    const panelH = await p.locator('#panel').evaluate(e => e.scrollHeight);
    const noHScroll = !(await h.hScroll());
    T.check(
      'conc_nd_export_hides_manual_box_and_fits_narrow_budget',
      concHiddenAfterNd && panelH <= 1500 && noHScroll,
      `concHidden=${concHiddenAfterNd} panelH=${panelH} noHScroll=${noHScroll}`
    );
    T.check('conc_no_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  await T.t('supplemental_folds_search_edit_and_persistence', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await h.newProject('M2 Folds');
    await h.gb(src('gb'));
    await h.addRun(src('his'));
    await h.suggest();

    const tl0 = await h.timeline();
    const runStep = (tl0.find(x => /^run:/.test(x.k)) || {}).k;

    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="cleave"]');
    await h.wait(300);

    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="man:column"]');
    await h.wait(300);

    await h.step(runStep);
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="conc"]');
    await h.wait(350);

    const tl = await h.timeline();
    const manStep = (tl.find(x => /^man:/.test(x.k)) || {}).k;
    const btwStep = (tl.find(x => /^btw:/.test(x.k)) || {}).k;

    const specs = [
      {id: 'expr', step: 'expr', fold: '#expMore', pri: ['#pr-strain', '#pr-medium', '#pr-cultureL', '#pr-temp', '#pr-pellet'], sup: ['#pr-od', '#pr-exStarter', '#pr-exHarvest', '#pr-exStore', '#pr-expr'], q: 'Starter culture', qInp: '#pr-exStarter', editInp: '#pr-od', editVal: '0.85'},
      {id: 'lysis', step: 'lysis', fold: '#lysMore', pri: ['#pr-lysMethod', '#pr-lysVol', '#pr-lysBuffer'], sup: ['#pr-lysAdd', '#pr-lysSet', '#pr-clarify', '#pr-lysLanes', '#pr-lysis'], q: 'Sonication or press', qInp: '#pr-lysSet', editInp: '#pr-clarify', editVal: '30,000 x g, 45 min'},
      {id: 'cleave', step: 'cleave', fold: '#clvMore', pri: ['#pr-cleaveAfter', '#pr-protease', '#pr-ratio', '#pr-dialBuffer', '#pr-clvTemp', '#pr-clvTime'], sup: ['#pr-mwco', '#pr-dialVol', '#pr-dialChanges'], q: 'Buffer changes', qInp: '#pr-dialChanges', editInp: '#pr-mwco', editVal: '10'},
      {id: 'manual', step: manStep, fold: '#manMore', pri: ['#man-kind', '#man-name', '#man-after', '#man-resin', '#man-buffer', '#man-wash', '#man-elution', '#man-vol', '#man-conc'], sup: ['#man-note', '#man-arrow'], q: 'Arrow label', qInp: '#man-arrow', editInp: '#man-note', editVal: 'Pooled synthetic gravity fractions'},
      {id: 'final', step: 'final', fold: '#finQcMore', pri: ['#pr-finConc', '#pr-finVol', '#pr-finRatio', '#pr-finBuffer', '#pr-store'], sup: ['#pr-qcPurity', '#pr-qcMass', '#pr-qcActivity'], q: 'Intact mass', qInp: '#pr-qcMass', editInp: '#pr-qcMass', editVal: '49,213 Da'}
    ];

    for (const s of specs) {
      await h.step(s.step);
      const hasFold = (await p.locator(s.fold).count()) === 1;
      const isOpen = hasFold ? await p.locator(s.fold).evaluate(e => e.open) : true;
      let priOk = true;
      for (const sel of s.pri) {
        if (!(await p.locator(sel).isVisible())) priOk = false;
      }
      let supHidden = true;
      for (const sel of s.sup) {
        if (await p.locator(sel).isVisible()) supHidden = false;
      }
      T.check(
        `fold_${s.id}_starts_closed_with_primary_visible`,
        hasFold && !isOpen && priOk && supHidden,
        `hasFold=${hasFold} isOpen=${isOpen} priOk=${priOk} supHidden=${supHidden}`
      );

      await p.fill('#panelSearch', s.q);
      await h.wait(200);
      const searchOpen = hasFold && (await p.locator(s.fold).evaluate(e => e.open)) && (await p.locator(s.qInp).isVisible());
      await p.fill('#panelSearch', '');
      await h.wait(200);
      const clearClosed = hasFold && !(await p.locator(s.fold).evaluate(e => e.open)) && !(await p.locator(s.qInp).isVisible());
      T.check(
        `fold_${s.id}_expands_on_search_and_closes_on_clear`,
        searchOpen && clearClosed,
        `searchOpen=${searchOpen} clearClosed=${clearClosed}`
      );
    }

    await h.step('final');
    const ndSub = p.locator('#ndPanel .subhead');
    const hasNdSub = (await ndSub.count()) === 1 && (await ndSub.isVisible());
    const ndSubTxt = hasNdSub ? (await ndSub.textContent()).trim() : '';
    const ndSubBox = hasNdSub ? await ndSub.boundingBox() : null;
    const ndFigBox = await p.locator('#o-ndFig').boundingBox();
    const ndOptsVis = (await p.locator('#o-ndFig').isVisible()) &&
      (await p.locator('#o-ndCorr').isVisible()) &&
      (await p.locator('#o-ndA340Warn').isVisible());
    T.check(
      'nd_panel_display_subhead_above_visible_controls',
      !!(hasNdSub && ndSubTxt === 'Display & quality checks' && ndOptsVis && ndSubBox && ndFigBox && ndSubBox.y + ndSubBox.height <= ndFigBox.y + 2),
      `ndSub="${ndSubTxt}" ndOptsVis=${ndOptsVis}`
    );

    await h.step('expr');
    let stayOpenMidEdit = false;
    if ((await p.locator('#expMore').count()) === 1) {
      await p.locator('#expMore > summary').click();
      await h.wait(100);
      await p.fill('#pr-od', '0.6');
      await h.wait(350);
      await p.fill('#pr-od', '');
      await h.wait(350);
      await p.fill('#pr-medium', 'TB');
      await h.wait(350);
      stayOpenMidEdit = await p.locator('#expMore').evaluate(e => e.open);
    }
    T.check('fold_stays_open_during_active_edit', stayOpenMidEdit, `stayOpenMidEdit=${stayOpenMidEdit}`);

    for (const s of specs) {
      await h.step(s.step);
      if ((await p.locator(s.fold).count()) === 1) {
        const openNow = await p.locator(s.fold).evaluate(e => e.open);
        if (!openNow) {
          await p.locator(`${s.fold} > summary`).click();
          await h.wait(100);
        }
      }
      if (await p.locator(s.editInp).isVisible()) {
        await p.fill(s.editInp, s.editVal);
        await p.dispatchEvent(s.editInp, 'change');
      }
    }

    await h.step(btwStep);
    if (!(await p.locator('#btwMore').evaluate(e => e.open))) {
      await p.locator('#btwMore > summary').click();
      await h.wait(100);
    }
    await p.fill('#btw-device', 'Amicon Ultra-15');
    await p.dispatchEvent('#btw-device', 'change');
    if (!(await p.locator('#btwSplitBox').evaluate(e => e.open))) {
      await p.locator('#btwSplitBox > summary').click();
      await h.wait(100);
    }
    await p.fill('#btw-vKeep', '0.05');
    await p.dispatchEvent('#btw-vKeep', 'change');
    await h.wait(500);

    const [dl] = await Promise.all([
      p.waitForEvent('download', {timeout: 10000}),
      p.click('#projSave')
    ]);
    const savePath = await dl.path();

    await p.click('#homeBtn');
    await h.wait(600);
    await p.reload();
    await h.wait(900);
    await p.locator('#projList .pcard', {hasText: 'M2 Folds'}).first().click();
    await h.wait(900);

    const tlReopen = await h.timeline();
    const manReopen = (tlReopen.find(x => /^man:/.test(x.k)) || {}).k;
    const btwReopen = (tlReopen.find(x => /^btw:/.test(x.k)) || {}).k;

    const checkPopulatedOpen = async (manKey, btwKey, label) => {
      const checks = [
        ['expr', '#expMore', '#pr-od', '0.85'],
        ['lysis', '#lysMore', '#pr-clarify', '30,000 x g, 45 min'],
        ['cleave', '#clvMore', '#pr-mwco', '10'],
        [manKey, '#manMore', '#man-note', 'Pooled synthetic gravity fractions'],
        [btwKey, '#btwMore', '#btw-device', 'Amicon Ultra-15'],
        ['final', '#finQcMore', '#pr-qcMass', '49,213 Da']
      ];
      const details = [];
      let allOk = true;
      for (const [stKey, foldSel, inpSel, want] of checks) {
        await h.step(stKey);
        const exists = (await p.locator(foldSel).count()) === 1;
        const openSt = exists ? await p.locator(foldSel).evaluate(e => e.open) : false;
        const visSt = await p.locator(inpSel).isVisible();
        const valSt = await p.inputValue(inpSel);
        const ok = exists && openSt && visSt && valSt === want;
        if (!ok) allOk = false;
        details.push(`${foldSel.slice(1)}:open=${openSt},vis=${visSt},val="${valSt}"`);
      }
      T.check(`populated_folds_auto_open_after_${label}`, allOk, details.join(' | '));
    };

    await checkPopulatedOpen(manReopen, btwReopen, 'idb_reload');

    await p.click('#homeBtn');
    await h.wait(500);
    await h.newProject('M2 Fresh Empty');
    const allFoldSels = ['#expMore', '#lysMore', '#clvMore', '#manMore', '#finQcMore', '#btwMore', '#btwSplitBox'];
    let allSevenClosed = true;
    const sevenDiag = [];
    for (const sel of allFoldSels) {
      const cnt = await p.locator(sel).count();
      const op = cnt === 1 ? await p.locator(sel).evaluate(e => e.open) : true;
      if (cnt !== 1 || op) allSevenClosed = false;
      sevenDiag.push(`${sel.slice(1)}:${cnt === 1 ? op : 'missing'}`);
    }
    T.check(
      'fresh_project_resets_all_seven_folds_immediately',
      allSevenClosed,
      sevenDiag.join(' ')
    );
    await h.step('expr');
    const freshExpClosed = (await p.locator('#expMore').count()) === 1 && !(await p.locator('#expMore').evaluate(e => e.open));
    await h.step('lysis');
    const freshLysClosed = (await p.locator('#lysMore').count()) === 1 && !(await p.locator('#lysMore').evaluate(e => e.open));
    await h.step('final');
    const freshFinClosed = (await p.locator('#finQcMore').count()) === 1 && !(await p.locator('#finQcMore').evaluate(e => e.open));
    T.check(
      'fresh_project_resets_folds_closed',
      freshExpClosed && freshLysClosed && freshFinClosed,
      `exp=${freshExpClosed} lys=${freshLysClosed} fin=${freshFinClosed}`
    );

    await p.setInputFiles('#projFile', savePath);
    await h.wait(1500);
    const tlImp = await h.timeline();
    const manImp = (tlImp.find(x => /^man:/.test(x.k)) || {}).k;
    const btwImp = (tlImp.find(x => /^btw:/.test(x.k)) || {}).k;
    await checkPopulatedOpen(manImp, btwImp, 'json_import');

    T.check('folds_no_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  await T.t('lifecycle_sibling_and_search_cross_context_regressions', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await h.newProject('M2 Lifecycle');
    await h.addRun(src('his'));
    await h.suggest();
    await h.addRun(src('q'));
    await h.suggest();

    const runs0 = (await h.timeline()).filter(x => /^run:/.test(x.k));
    const run1 = runs0[0].k;
    const run2 = runs0[1].k;

    await h.step(run1);
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="conc"]');
    await h.wait(350);

    if (!(await p.locator('#btwMore').evaluate(e => e.open))) {
      await p.locator('#btwMore > summary').click();
      await h.wait(100);
    }
    await p.fill('#btw-device', 'Amicon Ultra-15');
    await p.dispatchEvent('#btw-device', 'change');
    if (!(await p.locator('#btwSplitBox').evaluate(e => e.open))) {
      await p.locator('#btwSplitBox > summary').click();
      await h.wait(100);
    }
    await p.fill('#btw-vKeep', '0.05');
    await p.dispatchEvent('#btw-vKeep', 'change');
    await h.wait(250);

    await p.click('#ssActs [data-remove]');
    await h.wait(700);
    await p.click('#ssActs [data-remove]');
    await h.wait(350);

    await h.step(run1);
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="conc"]');
    await h.wait(350);

    const readdMoreOpen = await p.locator('#btwMore').evaluate(e => e.open);
    const readdSplitOpen = await p.locator('#btwSplitBox').evaluate(e => e.open);
    const readdConcVis = await p.locator('#btw-conc').isVisible();
    const readdDevVal = await p.inputValue('#btw-device');
    T.check(
      'conc_remove_and_readd_resets_folds_closed',
      !readdMoreOpen && !readdSplitOpen && readdConcVis && readdDevVal === '',
      `moreOpen=${readdMoreOpen} splitOpen=${readdSplitOpen} concVis=${readdConcVis} dev="${readdDevVal}"`
    );

    if (!(await p.locator('#btwMore').evaluate(e => e.open))) {
      await p.locator('#btwMore > summary').click();
      await h.wait(100);
    }
    await p.fill('#btw-device', 'Amicon Ultra-4');
    await p.dispatchEvent('#btw-device', 'change');
    await h.wait(250);

    await h.step(run2);
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="conc"]');
    await h.wait(350);

    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="man:column"]');
    await h.wait(300);
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="man:column"]');
    await h.wait(300);

    const tlNow = await h.timeline();
    const btwSteps = tlNow.filter(x => /^btw:/.test(x.k)).map(x => x.k);
    const manSteps = tlNow.filter(x => /^man:/.test(x.k)).map(x => x.k);
    const btw1 = btwSteps[0], btw2 = btwSteps[1];
    const man1 = manSteps[0], man2 = manSteps[1];

    const hasManMore = (await p.locator('#manMore').count()) === 1;
    await h.step(man1);
    if (hasManMore && !(await p.locator('#manMore').evaluate(e => e.open))) {
      await p.locator('#manMore > summary').click();
      await h.wait(100);
    }
    if (await p.locator('#man-arrow').isVisible()) {
      await p.fill('#man-arrow', 'Pool 1');
      await p.dispatchEvent('#man-arrow', 'change');
      await h.wait(250);
    }

    await h.step(man2);
    const m2Open = hasManMore ? await p.locator('#manMore').evaluate(e => e.open) : true;
    await h.step(man1);
    const m1Open = hasManMore ? await p.locator('#manMore').evaluate(e => e.open) : false;
    await h.step(btw2);
    const b2Open = await p.locator('#btwMore').evaluate(e => e.open);
    await h.step(btw1);
    const b1Open = await p.locator('#btwMore').evaluate(e => e.open);
    T.check(
      'sibling_steps_preserve_populated_and_reset_empty',
      hasManMore && m1Open && !m2Open && b1Open && !b2Open,
      `hasMan=${hasManMore} m1=${m1Open} m2=${m2Open} b1=${b1Open} b2=${b2Open}`
    );

    await h.step(man1);
    await p.fill('#panelSearch', 'Arrow');
    await h.wait(150);
    await h.step(man2);
    await p.fill('#panelSearch', '');
    await h.wait(200);
    const man2ClosedAfterSearch = hasManMore && !(await p.locator('#manMore').evaluate(e => e.open)) && !(await p.locator('#man-arrow').isVisible());

    await h.step(btw1);
    await p.fill('#panelSearch', 'Device');
    await h.wait(150);
    await h.step(btw2);
    await p.fill('#panelSearch', '');
    await h.wait(200);
    const btw2ClosedAfterSearch = !(await p.locator('#btwMore').evaluate(e => e.open)) && !(await p.locator('#btw-device').isVisible());

    T.check(
      'search_cross_sibling_steps_keeps_empty_folds_closed',
      man2ClosedAfterSearch && btw2ClosedAfterSearch,
      `man2Closed=${man2ClosedAfterSearch} btw2Closed=${btw2ClosedAfterSearch}`
    );

    await h.step('expr');
    const hasExpMore = (await p.locator('#expMore').count()) === 1;
    if (hasExpMore && !(await p.locator('#expMore').evaluate(e => e.open))) {
      await p.locator('#expMore > summary').click();
      await h.wait(100);
    }
    if (await p.locator('#pr-exStarter').isVisible()) {
      await p.fill('#pr-exStarter', '50 mL LB overnight');
      await p.dispatchEvent('#pr-exStarter', 'change');
      await h.wait(350);
    }
    await p.fill('#panelSearch', 'Starter');
    await h.wait(150);

    await p.click('#homeBtn');
    await h.wait(400);
    await h.newProject('M2 Search Fresh');
    await h.step('expr');
    await p.fill('#panelSearch', '');
    await h.wait(200);

    const exprPrimaryVis = await p.locator('#pr-strain').isVisible();
    const freshExpClosedAfterSearch = hasExpMore && !(await p.locator('#expMore').evaluate(e => e.open)) && !(await p.locator('#pr-exStarter').isVisible());
    T.check(
      'search_across_new_project_keeps_fresh_folds_closed',
      exprPrimaryVis && freshExpClosedAfterSearch,
      `exprPrimaryVis=${exprPrimaryVis} freshExpClosed=${freshExpClosedAfterSearch}`
    );

    await p.click('#homeBtn');
    await h.wait(400);
    await p.click('#homeQuick');
    await h.wait(500);
    await p.setInputFiles('#file', src('his'));
    await h.wait(2200);
    if (!(await p.locator('#pr-on').isChecked())) {
      await p.check('#pr-on');
      await h.wait(150);
    }
    const pexpSub = p.locator('#prepPanel details.sub[data-sub="pexp"]');
    if (await pexpSub.evaluate(e => e.open)) {
      await p.locator('#prepPanel details.sub[data-sub="pexp"] > summary').click();
      await h.wait(100);
    }
    const closedInQuick = !(await pexpSub.evaluate(e => e.open));
    await p.fill('#panelSearch', 'Starter');
    await h.wait(150);
    await p.click('#quickSave');
    await h.wait(600);
    await h.step('expr');
    await p.fill('#panelSearch', '');
    await h.wait(200);
    const pexpOpenAfterClear = await pexpSub.evaluate(e => e.open);
    const strainVisAfterClear = await p.locator('#pr-strain').isVisible();
    T.check(
      'quick_closed_sub_stays_open_after_proj_search_clear',
      closedInQuick && pexpOpenAfterClear && strainVisAfterClear,
      `closedInQuick=${closedInQuick} pexpOpen=${pexpOpenAfterClear} strainVis=${strainVisAfterClear}`
    );

    T.check('lifecycle_no_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  if (T.done) T.done();
})();
