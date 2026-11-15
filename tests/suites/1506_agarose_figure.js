const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1506_agarose_figure');
  const cl = p => p.locator('#clonePanel');
  const rows = async h => { await h.allSteps(); return (await h.timeline()).filter(x => /^clone:/.test(x.k)); };
  const go = async (h, title) => { const r = (await rows(h)).find(x => x.t === title); if (!r) throw new Error(`no stage "${title}"`); await h.step(r.k); };

  await T.t('agarose_gel_publication_figure', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      p.setDefaultTimeout(15000);

      // 1. Open a cloning project and navigate to the Agarose-gel verification stage
      await h.newProject('Agarose Figure Test', 'cloning');
      await cl(p).locator('[data-cl=tpl][data-v=ath]').click();
      await h.wait(600);

      await go(h, 'Agarose-gel verification');
      await h.wait(400);

      // 2. Set up a gel with:
      // - 1 kb ladder in lane 1 (M)
      // - sample in lane 2 (PCR-1) with expected product at 1200 bp
      // - no-template control in lane 3 (NTC)
      // - metadata: ladder product, catalog #, agarose %, buffer, stain, voltage, duration
      const ladderProd = p.locator('#ag-ladder-product');
      if (await ladderProd.count() > 0) {
        await ladderProd.fill('1 kb ladder');
        await ladderProd.dispatchEvent('change');
      }

      const ladderCat = p.locator('#ag-ladder-cat');
      if (await ladderCat.count() > 0) {
        await ladderCat.fill('N3232S');
        await ladderCat.dispatchEvent('change');
      }

      const pctInput = p.locator('#ag-pct');
      if (await pctInput.count() > 0) {
        await pctInput.fill('1%');
        await pctInput.dispatchEvent('change');
      }

      const bufInput = p.locator('#ag-buffer');
      if (await bufInput.count() > 0) {
        await bufInput.fill('TAE 1x');
        await bufInput.dispatchEvent('change');
      }

      const voltInput = p.locator('#ag-voltage');
      if (await voltInput.count() > 0) {
        await voltInput.fill('100 V');
        await voltInput.dispatchEvent('change');
      }

      // Lane 1: M, DNA ladder
      const l1Label = p.locator('#ag-lane-label-0');
      if (await l1Label.count() > 0) {
        await l1Label.fill('M');
        await l1Label.dispatchEvent('change');
      }
      const l1Type = p.locator('#ag-lane-type-0');
      if (await l1Type.count() > 0) {
        await l1Type.selectOption('DNA ladder');
        await l1Type.dispatchEvent('change');
      }

      // Lane 2: PCR-1, Sample, expected product 1200 bp
      const l2Label = p.locator('#ag-lane-label-1');
      if (await l2Label.count() > 0) {
        await l2Label.fill('PCR-1');
        await l2Label.dispatchEvent('change');
      }
      const l2Type = p.locator('#ag-lane-type-1');
      if (await l2Type.count() > 0) {
        await l2Type.selectOption('Sample');
        await l2Type.dispatchEvent('change');
      }
      const l2Exp = p.locator('#ag-lane-exp-1');
      if (await l2Exp.count() > 0) {
        await l2Exp.fill('1200 bp');
        await l2Exp.dispatchEvent('change');
      }

      // Lane 3: NTC, No-template control
      const l3Label = p.locator('#ag-lane-label-2');
      if (await l3Label.count() > 0) {
        await l3Label.fill('NTC');
        await l3Label.dispatchEvent('change');
      }
      const l3Type = p.locator('#ag-lane-type-2');
      if (await l3Type.count() > 0) {
        await l3Type.selectOption('No-template control');
        await l3Type.dispatchEvent('change');
      }

      // 3. Generate the figure
      const genBtn = p.locator('#cl-gen-ag-fig');
      T.check('generate_button_present', await genBtn.count() > 0, 'Generate figure button exists');

      if (await genBtn.count() > 0) {
        await genBtn.click();
        await h.wait(600);
      }

      // 4. Verify the SVG contains:
      // - text M, PCR-1, NTC
      // - ladder sizes 100 through 1000
      // - arrow with label Expected product: 1.2 kb
      // - legend block listing lane contents, ladder product, agarose %, buffer, voltage
      // - 600 dpi and Arial
      const exportedSvg = await h.exportSvg();
      const boxes = await h.svgBoxes(exportedSvg);
      const textStrings = boxes.texts.map(x => x.t);

      // Check lane labels
      T.check('has_lane_m', textStrings.some(t => t.trim() === 'M'), 'contains text M');
      T.check('has_lane_pcr1', textStrings.some(t => t.trim() === 'PCR-1'), 'contains text PCR-1');
      T.check('has_lane_ntc', textStrings.some(t => t.trim() === 'NTC'), 'contains text NTC');

      // Check ladder sizes 100 through 1000
      const ladderSizes = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const hasAllLadderSizes = ladderSizes.every(sz => textStrings.some(t => t.trim() === String(sz)));
      T.check('has_ladder_sizes_100_to_1000', hasAllLadderSizes, 'contains ladder sizes 100 through 1000');

      // Check expected product arrow and label
      const hasExpectedArrow = exportedSvg.includes('marker-end=') && textStrings.some(t => t.includes('Expected product: 1.2 kb'));
      T.check('has_expected_product_arrow_label', hasExpectedArrow, 'contains arrow with Expected product: 1.2 kb');

      // Check legend block
      const hasLegendLaneContents = textStrings.some(t => /Lane contents/i.test(t) || (/Lane 1/i.test(t) && /Lane 2/i.test(t)));
      const hasLegendLadder = textStrings.some(t => /1 kb ladder/i.test(t));
      const hasLegendAgarose = textStrings.some(t => /1%/i.test(t) || /agarose/i.test(t));
      const hasLegendBuffer = textStrings.some(t => /TAE/i.test(t));
      const hasLegendVoltage = textStrings.some(t => /100\s*V/i.test(t));

      T.check('legend_lane_contents', hasLegendLaneContents, 'legend lists lane contents');
      T.check('legend_ladder_product', hasLegendLadder, 'legend lists ladder product');
      T.check('legend_agarose_pct', hasLegendAgarose, 'legend lists agarose %');
      T.check('legend_buffer', hasLegendBuffer, 'legend lists buffer');
      T.check('legend_voltage', hasLegendVoltage, 'legend lists voltage');

      // Check 600 dpi and Arial
      const is600Dpi = exportedSvg.includes('data-dpi="600"') || (await p.$eval('#o-dpi', e => +e.value || 600) === 600);
      T.check('figure_is_600_dpi', is600Dpi, 'figure is 600 dpi');

      const usesArial = exportedSvg.includes('Arial') || (await p.$eval('#paper svg', e => getComputedStyle(e).fontFamily.includes('Arial')));
      T.check('figure_uses_arial', usesArial, 'figure uses Arial');

      // Check no text is clipped outside the exported SVG viewBox
      T.check('no_clipped_text', boxes.clipped.length === 0, 'clipped: ' + boxes.clipped.join(' | '));

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
