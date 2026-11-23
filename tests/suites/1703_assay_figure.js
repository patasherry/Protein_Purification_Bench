const {open, H, suite, fits, src, RES, path, fs} = require('../lib/harness');
const T = suite('1703_assay_figure');

function makeSecChromProject(inWf) {
  const xs = [], ys = [];
  for (let i = 0; i <= 120; i++) {
    const v = 8 + i * 0.1;
    xs.push(+v.toFixed(2));
    const p1 = 180 * Math.exp(-0.5 * Math.pow((v - 14.0) / 0.65, 2));
    ys.push(+p1.toFixed(3));
  }
  return {
    app: 'Protein Purification Bench',
    version: 1,
    schemaVersion: 1,
    quick: !inWf,
    cur: 'r1',
    name: 'SEC Activity Figure Prep',
    runs: [{
      id: 'r1', name: 'Superdex 200 SEC', inWf: !!inWf, color: '#0072B2',
      uvs: [{name: 'UV 280', unit: 'mAU', xs, ys}],
      fracs: [
        {x: 12.5, label: 'T1'}, {x: 13.0, label: 'T2'}, {x: 13.5, label: 'T3'},
        {x: 14.0, label: 'T4'}, {x: 14.5, label: 'T5'}, {x: 15.0, label: 'T6'}
      ],
      fracEnd: 15.5,
      phases: [], shade: 'T3-T5', integ: []
    }],
    traces: [], gels: [], ndSamples: [],
    prep: inWf ? {on: true, name: 'SEC Prep', qcActivity: 'Legacy note'} : {on: false},
    opt: {sec: 'none'},
    assays: [{
      id: 'a1',
      name: 'Phosphatase Fractions',
      mode: 'fractions',
      runId: 'r1',
      protocol: {substrate: 'pNPP', eps_mM: 18.0, pathCm: 1.0, rxnVolMl: 1.0, enzVolMl: 0.05},
      blanks: [],
      entries: [
        {fracLabel: 'T2', rawVals: [0.5, 1.0, 1.5], rawUnit: 'U/mL', dil: 1, protMgMl: 0.25},
        {fracLabel: 'T3', rawVals: [4.2, 5.0, 5.8], rawUnit: 'U/mL', dil: 1, protMgMl: 0.80},
        {fracLabel: 'T4', rawVals: [8.8, 10.0, 11.2], rawUnit: 'U/mL', dil: 1, protMgMl: 1.25},
        {fracLabel: 'T5', rawVals: [5.2, 6.0, 6.8], rawUnit: 'U/mL', dil: 1, protMgMl: 0.75},
        {fracLabel: 'T6', rawVals: [1.0, 1.5, 2.0], rawUnit: 'U/mL', dil: 1, protMgMl: 0.20}
      ],
      display: {visible: true, placement: 'track', color: '#D55E00', showErr: 'sd', yUnit: 'U/mL'}
    }]
  };
}

async function loadProj(p, h, inWf, fname) {
  await p.locator('#projFile').setInputFiles({
    name: fname,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(makeSecChromProject(inWf)))
  });
  await h.wait(600);
  if (inWf) await h.step('run:r1');
}

(async () => {
  await T.t('track-and-error-bars', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      await loadProj(p, h, true, 'fig_track.json');

      const svgSd = await h.exportSvg();
      const mTrack = await h.svgBoxes(svgSd, '.assay-track');
      const mErrSd = await h.svgBoxes(svgSd, '.assay-err');

      T.check('track/rendered-in-bounds',
        !!mTrack.box && mTrack.box.w > 80 && mTrack.box.h > 35 && fits(mTrack.box, mTrack.root, 2),
        JSON.stringify({box: mTrack.box, root: mTrack.root}));
      T.check('track/no-clipped-text', mTrack.clipped.length === 0, JSON.stringify(mTrack.clipped));
      T.check('track/default-axis-label-upml',
        mTrack.texts.some(t => t.t.trim() === 'Activity (U/mL)'),
        JSON.stringify(mTrack.texts.map(t => t.t)));
      T.check('track/sd-error-bars-shown',
        !!mErrSd.box && mErrSd.box.h > 4,
        JSON.stringify(mErrSd.box));

      const errSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="showErr"]');
      const hasControls = (await errSel.count()) > 0 && await errSel.isVisible();
      if (hasControls) {
        await errSel.selectOption('sem');
        await h.wait(250);
      }
      const svgSem = await h.exportSvg();
      const mErrSem = await h.svgBoxes(svgSem, '.assay-err');
      T.check('track/sem-smaller-than-sd',
        hasControls && !!mErrSd.box && !!mErrSem.box && mErrSem.box.h < mErrSd.box.h * 0.75 && mErrSem.box.h > mErrSd.box.h * 0.42,
        JSON.stringify({sdH: mErrSd.box && mErrSd.box.h, semH: mErrSem.box && mErrSem.box.h}));

      if (hasControls) {
        await errSel.selectOption('points');
        await h.wait(250);
      }
      const svgPts = await h.exportSvg();
      const mPtsNoErr = await h.svgBoxes(svgPts, '.assay-err');
      const mPtsReps = await h.svgBoxes(svgPts, '.assay-reps');
      T.check('track/points-mode-replaces-errbars',
        hasControls && mPtsNoErr.box === null && !!mPtsReps.box && mPtsReps.box.h > 2,
        JSON.stringify({errBox: mPtsNoErr.box, repBox: mPtsReps.box}));
      T.check('track/no-page-errors', !errs.length, errs.join('; '));
    } finally { await close(); }
  });

  await T.t('yunit-updates-and-overlay', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      await loadProj(p, h, true, 'fig_units.json');

      const unitSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="yUnit"]');
      const placeSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="placement"]');
      const hasControls = (await unitSel.count()) > 0 && await unitSel.isVisible() && (await placeSel.count()) > 0;

      if (hasControls) { await unitSel.selectOption('nkat/mL'); await h.wait(250); }
      const svgNkat = await h.exportSvg();
      const bNkat = await h.svgBoxes(svgNkat, '.assay-track');
      T.check('yunit/nkat-label-and-scale',
        hasControls && bNkat.texts.some(t => t.t.trim() === 'Activity (nkat/mL)') &&
        !bNkat.texts.some(t => t.t.trim() === 'Activity (U/mL)') &&
        bNkat.texts.some(t => Number.isFinite(+t.t) && +t.t >= 100) && bNkat.clipped.length === 0,
        JSON.stringify({texts: bNkat.texts.map(t => t.t), clipped: bNkat.clipped}));

      if (hasControls) { await unitSel.selectOption('U/mg'); await h.wait(250); }
      const svgSa = await h.exportSvg();
      const bSa = await h.svgBoxes(svgSa, '.assay-track');
      T.check('yunit/umg-specific-activity-label',
        hasControls && bSa.texts.some(t => t.t.trim() === 'Specific activity (U/mg)') && bSa.clipped.length === 0,
        JSON.stringify({texts: bSa.texts.map(t => t.t), clipped: bSa.clipped}));

      if (hasControls) { await unitSel.selectOption('rel%'); await h.wait(250); }
      const svgRel = await h.exportSvg();
      const bRel = await h.svgBoxes(svgRel, '.assay-track');
      T.check('yunit/relpct-label-and-100-scale',
        hasControls && bRel.texts.some(t => t.t.trim() === 'Relative activity (%)') &&
        bRel.texts.some(t => +t.t === 100) && bRel.clipped.length === 0,
        JSON.stringify({texts: bRel.texts.map(t => t.t), clipped: bRel.clipped}));

      if (hasControls) { await placeSel.selectOption('overlay'); await h.wait(250); }
      const svgOv = await h.exportSvg();
      const bOv = await h.svgBoxes(svgOv, '.assay-overlay');
      const rightLabel = bOv.texts.find(t => t.t.trim() === 'Relative activity (%)');
      T.check('overlay/rendered-with-right-axis',
        hasControls && !!bOv.box && bOv.box.w > 40 && !!rightLabel && rightLabel.x > bOv.root.w * 0.7 && bOv.clipped.length === 0,
        JSON.stringify({ovBox: bOv.box, rightLabel, root: bOv.root, clipped: bOv.clipped}));
      T.check('overlay/no-page-errors', !errs.length, errs.join('; '));
    } finally { await close(); }
  });

  await T.t('panel-placement-and-pub-export', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      await loadProj(p, h, true, 'fig_panel.json');

      const placeSel = p.locator('#assayPanel [data-assay-id="a1"] select[data-ad="placement"]');
      const hasPlace = (await placeSel.count()) > 0 && await placeSel.isVisible();
      if (hasPlace) { await placeSel.selectOption('panel'); await h.wait(300); }

      const svgComp = await h.exportSvg();
      const mRun = await h.svgBoxes(svgComp, '[data-wfp="r1"]');
      const mAssay = await h.svgBoxes(svgComp, '[data-wfp="assay:a1"]');
      T.check('panel/separate-non-overlapping-panel-in-run',
        hasPlace && !!mRun.box && !!mAssay.box && mAssay.box.w > 80 && mAssay.box.h > 60 &&
        mAssay.box.x >= mRun.box.right - 2 && mAssay.clipped.length === 0,
        JSON.stringify({runBox: mRun.box, assayBox: mAssay.box, clipped: mAssay.clipped}));

      await h.step('figure');
      const svgWf = await h.exportSvg();
      const mWfAssay = await h.svgBoxes(svgWf, '[data-wfp="assay:a1"]');
      T.check('panel/separate-panel-in-workflow',
        hasPlace && !!mWfAssay.box && mWfAssay.box.w > 80 && mWfAssay.clipped.length === 0,
        JSON.stringify({wfAssayBox: mWfAssay.box, clipped: mWfAssay.clipped}));

      T.check('panel/no-page-errors', !errs.length, errs.join('; '));
    } finally { await close(); }
  });

  await T.t('quick-mode-standalone-assay-tab-arial-600dpi', async () => {
    const {p, close, errs} = await open();
    try {
      p.setDefaultTimeout(12000);
      const h = H(p);
      await p.click('#homeQuick');
      await h.wait(400);
      await p.setInputFiles('#file', src('his'));
      await h.wait(1200);

      const openBtn = p.locator('#assayOpenBtn');
      const hasBtn = (await openBtn.count()) > 0 && await openBtn.isVisible();
      if (hasBtn) {
        await openBtn.click();
        await h.wait(200);
        await p.click('#assayPasteToggle');
        await p.fill('#assayPaste', '[S] (mM),Rep1,Rep2,Rep3\n0.05,48,50,52\n0.2,115,120,125\n1.0,175,180,185\n');
        await p.click('#assayPasteGo');
        await h.wait(250);
      }

      const aTab = p.locator('.figtab[data-fig^="assay:"]').first();
      const hasTab = (await p.locator('.figtab[data-fig^="assay:"]').count()) > 0 && await aTab.isVisible();
      T.check('solo/standalone-figtab-visible', hasTab, 'visible=' + hasTab);

      if (hasTab) {
        await aTab.click();
        await h.wait(250);
      }
      const svgAssay = await h.exportSvg();
      const mSolo = await h.svgBoxes(svgAssay, '.assay-fit-curve');
      T.check('solo/arial-and-no-clipped-text',
        hasTab && /font-family="Arial/i.test(svgAssay) && !!mSolo.box && mSolo.box.w > 60 && mSolo.clipped.length === 0,
        JSON.stringify({arial: /font-family="Arial/i.test(svgAssay), box: mSolo.box, clipped: mSolo.clipped}));

      let pngDpiOk = false, pngName = '';
      if (hasTab) {
        const [d] = await Promise.all([
          p.waitForEvent('download', {timeout: 12000}),
          p.click('#savePng')
        ]);
        pngName = d.suggestedFilename();
        const tmp = path.join(RES, 'assay-600-' + Date.now() + '.png');
        await d.saveAs(tmp);
        const buf = fs.readFileSync(tmp);
        for (let i = 8; i < Math.min(buf.length - 12, 200); i++) {
          if (buf[i] === 112 && buf[i + 1] === 72 && buf[i + 2] === 89 && buf[i + 3] === 115) {
            const ppmX = buf.readUInt32BE(i + 4);
            if (Math.abs(ppmX - Math.round(600 / 0.0254)) <= 2) pngDpiOk = true;
          }
        }
      }
      T.check('solo/png-600dpi-export', hasTab && /^assay_.*_600dpi\.png$/.test(pngName) && pngDpiOk, pngName + ' dpiOk=' + pngDpiOk);
      T.check('solo/no-page-errors', !errs.length, errs.join('; '));
    } finally { await close(); }
  });

  T.done();
})();
