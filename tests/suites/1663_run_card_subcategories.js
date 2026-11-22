// 1663 run card subcategories: core vs optional protocol details in Run conditions, surfaced SEC toggle, and concise hints. UI and DOM only.
const os = require('os');
const {open, H, suite, path, fs, src} = require('../lib/harness');

(async () => {
  const T = suite('1663_run_card_subcategories');
  const CORE_KEYS = ['mCol', 'mBufA', 'mBufB', 'mFlow', 'mGrad', 'pathCell'];
  const MORE_KEYS = ['mCV', 'mFrac', 'mPh', 'mTemp', 'mLoad', 'mWash', 'mInst', 'mOther'];
  const allErrs = [];

  await T.t('core_vs_optional_disclosure_and_rerender', async () => {
    const {p, errs, close} = await open({width: 1400, height: 1000});
    const h = H(p);
    try {
      await h.newProject('Run Card Subcategories');
      await h.addRun(src('his'));
      const card = p.locator('.trace.run.sel').first();

      const coreState = await card.evaluate((el, keys) => {
        const rc = el.querySelector('details.runcond');
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        const vis = n => {
          if (!n) return false;
          const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        const coreVis = keys.every(k => vis(rc && rc.querySelector(`[data-k="${k}"]`)));
        const noneInMore = !more || keys.every(k => !more.querySelector(`[data-k="${k}"]`));
        const warns = [...el.querySelectorAll('[data-condwarn]')].map(w => w.dataset.condwarn);
        const bufIdx = warns.indexOf('mBufA'), flowIdx = warns.indexOf('mFlow');
        return {rcOpen: !!(rc && rc.open), coreVis, noneInMore, warnOrderOk: bufIdx >= 0 && flowIdx > bufIdx};
      }, CORE_KEYS);
      T.check(
        'runcond-auto-open-core-visible',
        coreState.rcOpen && coreState.coreVis && coreState.noneInMore && coreState.warnOrderOk,
        JSON.stringify(coreState)
      );

      const moreLoc = card.locator('details.runcond > details.cardtext.runcond-more');
      const hasMore = (await moreLoc.count()) === 1;
      const moreSummaryTxt = hasMore ? (await moreLoc.locator(':scope > summary').textContent()).trim() : '';
      const moreStartOpen = hasMore ? await moreLoc.evaluate(d => d.open) : true;
      let all8InMore = false;
      let all8Hidden = true;
      for (const k of MORE_KEYS) {
        const inMore = hasMore ? (await moreLoc.locator(`[data-k="${k}"]`).count()) === 1 : false;
        if (!inMore) { all8InMore = false; break; }
        all8InMore = true;
      }
      for (const k of MORE_KEYS) {
        if (await card.locator(`[data-k="${k}"]`).first().isVisible()) { all8Hidden = false; break; }
      }
      const collapsedOk = hasMore && /More protocol details \(optional\)/i.test(moreSummaryTxt) && !moreStartOpen && all8InMore && all8Hidden;
      T.check(
        'secondary-protocol-collapsed-by-default',
        collapsedOk,
        JSON.stringify({hasMore, moreSummaryTxt, moreStartOpen, all8InMore, all8Hidden})
      );

      const moreSum = moreLoc.locator(':scope > summary');
      if (hasMore && await moreSum.isVisible()) {
        await moreSum.click();
        await h.wait(150);
      }
      const moreAfterClickOpen = hasMore ? await moreLoc.evaluate(d => d.open) : false;
      let all8Visible = true;
      for (const k of MORE_KEYS) {
        if (!(await card.locator(`[data-k="${k}"]`).first().isVisible())) { all8Visible = false; break; }
      }
      T.check(
        'expanding-more-reveals-secondary-fields',
        hasMore && moreAfterClickOpen && all8Visible,
        JSON.stringify({hasMore, moreAfterClickOpen, all8Visible})
      );

      const figDet = card.locator('details.cardtext').filter({has: p.locator('summary', {hasText: /^Figure text$/})}).first();
      const layDet = card.locator('details.cardtext').filter({has: p.locator('summary', {hasText: /^Layout$/})}).first();
      if ((await figDet.count()) === 1 && !(await figDet.evaluate(d => d.open))) {
        await figDet.locator(':scope > summary').click();
        await h.wait(100);
      }
      if ((await layDet.count()) === 1 && !(await layDet.evaluate(d => d.open))) {
        await layDet.locator(':scope > summary').click();
        await h.wait(100);
      }

      const cellSel = card.locator('select[data-k="pathCell"]').first();
      if (await cellSel.isVisible()) {
        await cellSel.selectOption('10');
        await h.wait(250);
      }
      const pathInp = card.locator('input[data-k="path"]').first();
      if (await pathInp.isVisible()) {
        await pathInp.fill('2');
        await pathInp.dispatchEvent('change');
        await h.wait(250);
      }

      const afterRerender = await p.locator('.trace.run.sel').first().evaluate(el => {
        const bySum = re => [...el.querySelectorAll('details.cardtext')].find(d => {
          const s = d.querySelector(':scope > summary');
          return s && re.test(s.textContent.trim());
        });
        const rc = el.querySelector('details.runcond');
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        const ft = bySum(/^Figure text$/);
        const ly = bySum(/^Layout$/);
        return {
          hasMore: !!more,
          rcOpen: !!(rc && rc.open),
          moreOpen: !!(more && more.open),
          ftOpen: !!(ft && ft.open),
          lyOpen: !!(ly && ly.open)
        };
      });
      T.check(
        'rerender-preserves-open-disclosures',
        afterRerender.hasMore && afterRerender.rcOpen && afterRerender.moreOpen && afterRerender.ftOpen && afterRerender.lyOpen,
        JSON.stringify(afterRerender)
      );
      allErrs.push(...errs);
    } finally {
      await close();
    }
  });

  await T.t('panel_search_and_persistence_auto_open', async () => {
    const {p, errs, close} = await open({width: 1400, height: 1000});
    const h = H(p);
    const savePath = path.join(os.tmpdir(), `tmp_1663_roundtrip_${process.pid}_${Date.now()}.json`);
    try {
      await h.newProject('Run Card Persistence');
      await h.addRun(src('his'));
      const card = () => p.locator('.trace.run.sel').first();

      await p.fill('#panelSearch', 'Measured buffer pH');
      await h.wait(250);
      const duringPh = await card().evaluate(el => {
        const rc = el.querySelector('details.runcond');
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        return {hasMore: !!more, rcOpen: !!(rc && rc.open), moreOpen: !!(more && more.open)};
      });
      const phVisDuring = await card().locator('[data-k="mPh"]').first().isVisible();

      await p.fill('#panelSearch', 'Title in figure');
      await h.wait(250);
      const duringFig = await card().evaluate(el => {
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        return {moreOpen: !!(more && more.open)};
      });
      const titleVisDuring = await card().locator('[data-k="stepName"]').first().isVisible();

      await p.fill('#panelSearch', '');
      await h.wait(250);
      const afterClear = await card().evaluate(el => {
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        return {moreOpen: !!(more && more.open)};
      });
      const phVisAfter = await card().locator('[data-k="mPh"]').first().isVisible();

      T.check(
        'panel-search-expands-and-restores-more',
        duringPh.hasMore && duringPh.rcOpen && duringPh.moreOpen && phVisDuring && !duringFig.moreOpen && titleVisDuring && !afterClear.moreOpen && !phVisAfter,
        JSON.stringify({duringPh, phVisDuring, duringFig, titleVisDuring, afterClear, phVisAfter})
      );

      const moreLoc = card().locator('details.runcond > details.cardtext.runcond-more');
      if ((await moreLoc.count()) === 1 && !(await moreLoc.evaluate(d => d.open))) {
        await moreLoc.locator(':scope > summary').click();
        await h.wait(150);
      }
      const phInp = card().locator('[data-k="mPh"]').first();
      const instInp = card().locator('[data-k="mInst"]').first();
      if (await phInp.isVisible()) {
        await phInp.fill('7.45');
        await phInp.dispatchEvent('change');
      }
      if (await instInp.isVisible()) {
        await instInp.fill('ÄKTA pure 25');
        await instInp.dispatchEvent('change');
      }
      await h.wait(300);

      await h.addRun(src('q'));
      await h.wait(300);

      await p.click('#homeBtn');
      await h.wait(700);
      const pcard = p.locator('#projList .pcard', {hasText: 'Run Card Persistence'}).first();
      if ((await pcard.count()) === 1) {
        await pcard.click();
        await h.wait(900);
      }

      const tl1 = await h.timeline();
      const runSteps1 = tl1.filter(s => s.k && s.k.startsWith('run:'));
      if (runSteps1[0]) await h.step(runSteps1[0].k);
      const r1Idb = await card().evaluate(el => {
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        const ph = el.querySelector('[data-k="mPh"]');
        const inst = el.querySelector('[data-k="mInst"]');
        return {
          hasMore: !!more,
          moreOpen: !!(more && more.open),
          phVal: ph ? ph.value : '',
          instVal: inst ? inst.value : ''
        };
      });
      const r1PhVisIdb = await card().locator('[data-k="mPh"]').first().isVisible();

      if (runSteps1[1]) await h.step(runSteps1[1].k);
      const r2Idb = await card().evaluate(el => {
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        return {hasMore: !!more, moreOpen: !!(more && more.open)};
      });
      const r2PhVisIdb = await card().locator('[data-k="mPh"]').first().isVisible();

      T.check(
        'populated-secondary-auto-opens-incomplete-core',
        r1Idb.hasMore && r1Idb.moreOpen && r1PhVisIdb && r1Idb.phVal === '7.45' && r1Idb.instVal === 'ÄKTA pure 25' && r2Idb.hasMore && !r2Idb.moreOpen && !r2PhVisIdb,
        JSON.stringify({r1Idb, r1PhVisIdb, r2Idb, r2PhVisIdb})
      );

      if (runSteps1[0]) await h.step(runSteps1[0].k);
      for (const [k, v] of [['mCol', 'HisTrap FF 1 mL'], ['mBufA', '50 mM Tris pH 8.0, 300 mM NaCl'], ['mBufB', '50 mM Tris pH 8.0, 500 mM imidazole'], ['mFlow', '1'], ['mGrad', 'step to 100% B']]) {
        const inp = card().locator(`[data-k="${k}"]`).first();
        if (await inp.isVisible()) {
          await inp.fill(v);
          await inp.dispatchEvent('change');
        }
      }
      await h.wait(300);

      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      await dl.saveAs(savePath);
      await p.click('#homeBtn');
      await h.wait(600);
      await p.setInputFiles('#projFile', savePath);
      await h.wait(1200);

      const tl2 = await h.timeline();
      const runSteps2 = tl2.filter(s => s.k && s.k.startsWith('run:'));
      if (runSteps2[0]) await h.step(runSteps2[0].k);
      const r1Json = await card().evaluate(el => {
        const rc = el.querySelector('details.runcond');
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        const ph = el.querySelector('[data-k="mPh"]');
        const inst = el.querySelector('[data-k="mInst"]');
        return {
          hasMore: !!more,
          rcOpen: !!(rc && rc.open),
          moreOpen: !!(more && more.open),
          phVal: ph ? ph.value : '',
          instVal: inst ? inst.value : ''
        };
      });
      const r1PhVisJson = await card().locator('[data-k="mPh"]').first().isVisible();

      if (runSteps2[1]) await h.step(runSteps2[1].k);
      const r2Json = await card().evaluate(el => {
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        return {hasMore: !!more, moreOpen: !!(more && more.open)};
      });

      T.check(
        'populated-secondary-auto-opens-complete-core-and-json-roundtrip',
        r1Json.hasMore && r1Json.rcOpen && r1Json.moreOpen && r1PhVisJson && r1Json.phVal === '7.45' && r1Json.instVal === 'ÄKTA pure 25' && r2Json.hasMore && !r2Json.moreOpen,
        JSON.stringify({r1Json, r1PhVisJson, r2Json})
      );
      allErrs.push(...errs);
    } finally {
      try { if (fs.existsSync(savePath)) fs.unlinkSync(savePath); } catch (e) {}
      await close();
    }
  });

  await T.t('sec_toggle_surfaced_hints_and_responsive_geometry', async () => {
    const {p, errs, close} = await open({width: 1400, height: 1000});
    const h = H(p);
    try {
      await h.newProject('SEC Toggle & Hints');
      await h.gb(src('gb'));
      await h.addRun(src('his'));
      const card = () => p.locator('.trace.run.sel').first();

      const secPlacement = await card().evaluate(el => {
        const ly = [...el.querySelectorAll('details.cardtext')].find(d => {
          const s = d.querySelector(':scope > summary');
          return s && /^Layout$/.test(s.textContent.trim());
        });
        const topSec = el.querySelector(':scope > .cardopts input[data-k="secOn"]');
        const secInLayout = ly ? ly.querySelectorAll('input[data-k="secOn"]').length : -1;
        const wfInLayout = ly ? ly.querySelectorAll('input[data-k="inWf"]').length : 0;
        const wfwInLayout = ly ? ly.querySelectorAll('input[data-k="wfW"]').length : 0;
        const secId = topSec ? topSec.id : '';
        const idCount = secId ? document.querySelectorAll(`[id="${secId}"]`).length : 0;
        return {
          layoutClosed: !!(ly && !ly.open),
          hasTopSec: !!topSec,
          secInLayout,
          wfInLayout,
          wfwInLayout,
          uniqueId: !!secId && idCount === 1
        };
      });
      const secVisOutside = await card().locator(':scope > .cardopts input[data-k="secOn"]').isVisible();
      T.check(
        'sec-toggle-visible-outside-layout-unique-id',
        secPlacement.layoutClosed && secPlacement.hasTopSec && secVisOutside && secPlacement.secInLayout === 0 && secPlacement.wfInLayout === 1 && secPlacement.wfwInLayout === 1 && secPlacement.uniqueId,
        JSON.stringify({...secPlacement, secVisOutside})
      );

      let secSwitchedOk = false;
      let secRestoredOk = false;
      const secChk = card().locator(':scope > .cardopts input[data-k="secOn"]').first();
      if (await secChk.isVisible()) {
        await secChk.check();
        await h.wait(350);
        const onState = await card().evaluate(el => {
          const bufLab = el.querySelector('[data-k="mBufA"]') && el.querySelector('[data-k="mBufA"]').closest('label');
          const labTxt = bufLab ? bufLab.childNodes[0].textContent.trim() : '';
          return {
            labTxt,
            bufBCount: el.querySelectorAll('[data-k="mBufB"]').length,
            washCount: el.querySelectorAll('[data-k="mWash"]').length
          };
        });
        secSwitchedOk = onState.labTxt === 'Running buffer' && onState.bufBCount === 0 && onState.washCount === 0;

        await card().locator(':scope > .cardopts input[data-k="secOn"]').first().uncheck();
        await h.wait(350);
        const offState = await card().evaluate(el => {
          const bufLab = el.querySelector('[data-k="mBufA"]') && el.querySelector('[data-k="mBufA"]').closest('label');
          const labTxt = bufLab ? bufLab.childNodes[0].textContent.trim() : '';
          const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
          return {
            labTxt,
            bufBCount: el.querySelectorAll('[data-k="mBufB"]').length,
            washInMore: more ? more.querySelectorAll('[data-k="mWash"]').length : 0,
            moreClosed: !!(more && !more.open)
          };
        });
        secRestoredOk = offState.labTxt === 'Buffer A' && offState.bufBCount === 1 && offState.washInMore === 1 && offState.moreClosed;
      }
      T.check(
        'sec-toggle-switches-mode-and-restores',
        secSwitchedOk && secRestoredOk,
        JSON.stringify({secSwitchedOk, secRestoredOk})
      );

      const flowInp = card().locator('[data-k="mFlow"]').first();
      if (await flowInp.isVisible()) {
        await flowInp.fill('1');
        await flowInp.dispatchEvent('change');
        await h.wait(250);
      }
      const uvHintTxt = (await card().locator('.uvhint').count()) ? (await card().locator('.uvhint').first().textContent()).trim() : '';
      const uvHintConcise = /assumed/i.test(uvHintTxt) && /2(?:\.0)?\s*mm/.test(uvHintTxt) && uvHintTxt.length > 0 && uvHintTxt.length <= 95;

      const measureCardOpts = async pg => pg.locator('.trace.run.sel').first().evaluate(el => {
        const sec = el.querySelector(':scope > .cardopts input[data-k="secOn"]');
        const pathEl = el.querySelector(':scope > .cardopts input[data-k="path"]');
        if (!sec || !pathEl) return {ok: false, pathW: 0, secW: 0};
        const sr = sec.getBoundingClientRect(), pr = pathEl.getBoundingClientRect(), vw = window.innerWidth;
        const inView = r => r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= vw + 1;
        return {ok: inView(sr) && inView(pr) && pr.width >= 65, pathW: Math.round(pr.width), secW: Math.round(sr.width)};
      });

      const deskGeom = await measureCardOpts(p);
      const deskNoHScroll = !(await h.hScroll());

      await h.suggest();
      await h.addConc(src('ndSpec'), 0.5);
      const tl = await h.timeline();
      const imacStep = tl.find(s => s.k && s.k.startsWith('run:'));
      if (imacStep) await h.step(imacStep.k);
      const poolHintTxt = await card().evaluate(el => {
        const hs = [...el.querySelectorAll(':scope > p.hint:not(.uvhint)')].map(x => x.textContent.trim());
        return hs.find(t => /after concentrating/i.test(t)) || '';
      });
      const poolHintConcise = /mg after concentrating/i.test(poolHintTxt) && /mg\/mL\s*×/i.test(poolHintTxt) && poolHintTxt.length > 0 && poolHintTxt.length <= 115;
      T.check(
        'concise-uvhint-and-measured-pool-hint',
        uvHintConcise && poolHintConcise,
        JSON.stringify({uvHintTxt, uvLen: uvHintTxt.length, poolHintTxt, poolLen: poolHintTxt.length})
      );

      let mobGeom = {ok: false, pathW: 0, secW: 0};
      let mobNoHScroll = false;
      const {p: pMob, errs: errsMob, close: closeMob} = await open({width: 390, height: 860});
      const hMob = H(pMob);
      try {
        await hMob.newProject('Mobile Cardopts');
        await hMob.addRun(src('his'));
        mobGeom = await measureCardOpts(pMob);
        mobNoHScroll = !(await hMob.hScroll());
        allErrs.push(...errsMob);
      } finally {
        await closeMob();
      }

      T.check(
        'cardopts-geometry-desktop-and-mobile',
        deskGeom.ok && deskNoHScroll && mobGeom.ok && mobNoHScroll,
        JSON.stringify({deskGeom, deskNoHScroll, mobGeom, mobNoHScroll})
      );
      allErrs.push(...errs);
    } finally {
      await close();
    }
  });

  await T.t('search_closed_populated_and_legacy_mph_clear_roundtrip', async () => {
    const {p, errs, close} = await open({width: 1400, height: 1000});
    const h = H(p);
    const stamp = `${process.pid}_${Date.now()}`;
    const legacyPath = path.join(os.tmpdir(), `tmp_1663_legacy_mph_${stamp}.json`);
    const clearedPath = path.join(os.tmpdir(), `tmp_1663_cleared_mph_${stamp}.json`);
    try {
      await h.newProject('Search & Legacy mPH');
      await h.addRun(src('his'));
      await h.addRun(src('q'));
      const card = () => p.locator('.trace.run.sel').first();

      const tl0 = await h.timeline();
      const runSteps0 = tl0.filter(s => s.k && s.k.startsWith('run:'));
      if (runSteps0[0]) await h.step(runSteps0[0].k);

      const more1 = card().locator('details.runcond > details.cardtext.runcond-more');
      const hasMore1 = (await more1.count()) === 1;
      if (hasMore1 && !(await more1.evaluate(d => d.open))) {
        await more1.locator(':scope > summary').click();
        await h.wait(120);
      }
      const ph1 = card().locator('[data-k="mPh"]').first();
      if (await ph1.isVisible()) {
        await ph1.fill('7.40');
        await ph1.dispatchEvent('change');
        await h.wait(120);
      }
      if (hasMore1 && (await more1.evaluate(d => d.open))) {
        await more1.locator(':scope > summary').click();
        await h.wait(120);
      }
      const pre1Closed = hasMore1 && !(await more1.evaluate(d => d.open)) && !(await ph1.isVisible());

      await p.fill('#panelSearch', 'Instrument');
      await h.wait(200);
      const during1Vis = hasMore1 && (await more1.evaluate(d => d.open)) && (await card().locator('[data-k="mInst"]').first().isVisible());

      await p.fill('#panelSearch', '');
      await h.wait(200);
      const post1Closed = hasMore1 && !(await more1.evaluate(d => d.open)) && !(await ph1.isVisible());

      if (runSteps0[1]) await h.step(runSteps0[1].k);
      const more2 = card().locator('details.runcond > details.cardtext.runcond-more');
      const hasMore2 = (await more2.count()) === 1;
      const pre2Closed = hasMore2 && !(await more2.evaluate(d => d.open));

      await p.fill('#panelSearch', 'Measured buffer pH');
      await h.wait(200);
      const ph2 = card().locator('[data-k="mPh"]').first();
      if (await ph2.isVisible()) {
        await ph2.fill('7.65');
        await ph2.dispatchEvent('change');
        await h.wait(150);
      }
      await p.fill('#panelSearch', '');
      await h.wait(200);
      const post2Open = hasMore2 && (await more2.evaluate(d => d.open)) && (await ph2.isVisible()) && (await ph2.inputValue()) === '7.65';

      T.check(
        'panel-search-preserves-closed-populated-and-opens-newly-filled-more',
        pre1Closed && during1Vis && post1Closed && pre2Closed && post2Open,
        JSON.stringify({pre1Closed, during1Vis, post1Closed, pre2Closed, post2Open})
      );

      if (runSteps0[0]) await h.step(runSteps0[0].k);
      for (const [k, v] of [['mCol', 'HisTrap FF 1 mL'], ['mBufA', '50 mM Tris pH 8.0, 300 mM NaCl'], ['mBufB', '50 mM Tris pH 8.0, 500 mM imidazole'], ['mFlow', '1'], ['mGrad', 'step to 100% B']]) {
        const inp = card().locator(`[data-k="${k}"]`).first();
        if (await inp.isVisible()) {
          await inp.fill(v);
          await inp.dispatchEvent('change');
        }
      }
      await h.wait(250);

      const [dl1] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      await dl1.saveAs(legacyPath);
      const legProj = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      if (legProj.runs && legProj.runs[0]) {
        for (const k of MORE_KEYS) delete legProj.runs[0][k];
        legProj.runs[0].mPH = '7.85';
      }
      fs.writeFileSync(legacyPath, JSON.stringify(legProj));

      await p.click('#homeBtn');
      await h.wait(500);
      await p.setInputFiles('#projFile', legacyPath);
      await h.wait(1000);

      const tlLeg = await h.timeline();
      const legSteps = tlLeg.filter(s => s.k && s.k.startsWith('run:'));
      if (legSteps[0]) await h.step(legSteps[0].k);
      const impState = await card().evaluate(el => {
        const rc = el.querySelector('details.runcond');
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        const ph = el.querySelector('[data-k="mPh"]');
        return {hasMore: !!more, rcOpen: !!(rc && rc.open), moreOpen: !!(more && more.open), phVal: ph ? ph.value : ''};
      });
      const impPhVis = await card().locator('[data-k="mPh"]').first().isVisible();
      const impOk = impState.hasMore && impState.rcOpen && impState.moreOpen && impPhVis && impState.phVal === '7.85';

      const legPhInp = card().locator('[data-k="mPh"]').first();
      if (await legPhInp.isVisible()) {
        await legPhInp.fill('');
        await legPhInp.dispatchEvent('change');
        await h.wait(250);
      }

      const [dl2] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
      await dl2.saveAs(clearedPath);
      const clrProj = JSON.parse(fs.readFileSync(clearedPath, 'utf8'));
      const staleLegacyKey = !!(clrProj.runs && clrProj.runs[0] && Object.prototype.hasOwnProperty.call(clrProj.runs[0], 'mPH'));

      await p.click('#homeBtn');
      await h.wait(500);
      await p.setInputFiles('#projFile', clearedPath);
      await h.wait(1000);

      const tlClr = await h.timeline();
      const clrSteps = tlClr.filter(s => s.k && s.k.startsWith('run:'));
      if (clrSteps[0]) await h.step(clrSteps[0].k);
      const clrState = await card().evaluate(el => {
        const rc = el.querySelector('details.runcond');
        const more = el.querySelector('details.runcond > details.cardtext.runcond-more');
        const ph = el.querySelector('[data-k="mPh"]');
        return {hasMore: !!more, rcOpen: !!(rc && rc.open), moreOpen: !!(more && more.open), phVal: ph ? ph.value : ''};
      });
      const clrPhVis = await card().locator('[data-k="mPh"]').first().isVisible();
      const clrOk = clrState.hasMore && !clrState.rcOpen && !clrState.moreOpen && !clrPhVis && clrState.phVal === '' && !staleLegacyKey;

      T.check(
        'legacy-mph-import-clear-and-roundtrip-closes-more',
        impOk && clrOk,
        JSON.stringify({impState, impPhVis, clrState, clrPhVis, staleLegacyKey})
      );
      allErrs.push(...errs);
    } finally {
      try { if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath); } catch (e) {}
      try { if (fs.existsSync(clearedPath)) fs.unlinkSync(clearedPath); } catch (e) {}
      await close();
    }
  });

  T.check('no-page-errors', !allErrs.length, allErrs.join(' | '));
  T.done();
})();
