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
      // - metadata: ladder product, agarose %, buffer, stain, voltage, duration
      // Note: ladderCat is left untouched to verify default N3232S
      const ladderProd = p.locator('#ag-ladder-product');
      if (await ladderProd.count() > 0) {
        await ladderProd.fill('1 kb ladder');
        await ladderProd.dispatchEvent('change');
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

      // Issue #1570 Check (1): untouched default gel shows (Cat. #N3232S), switching preset to custom omits N3232S
      T.check('untouched_has_n3232s', exportedSvg.includes('N3232S'), 'untouched agarose gel shows N3232S');
      await p.locator('#ag-ladder-preset').selectOption('custom');
      await p.locator('#ag-ladder-preset').dispatchEvent('change');
      await p.locator('#cl-gen-ag-fig').click();
      await h.wait(400);
      const svgCustom = await h.exportSvg();
      T.check('custom_ladder_omits_n3232s', !svgCustom.includes('N3232S'), 'switching to custom ladder omits N3232S');

      // Blanking #ag-ladder-cat also omits catalog number
      const ladderCatInput = p.locator('#ag-ladder-cat');
      if (await ladderCatInput.count() > 0) {
        await ladderCatInput.fill('N3231S');
        await ladderCatInput.dispatchEvent('change');
        await p.locator('#cl-gen-ag-fig').click();
        await h.wait(300);
        const svgWithCat = await h.exportSvg();
        T.check('explicit_cat_rendered', svgWithCat.includes('N3231S'), 'explicit catalog number rendered');

        await ladderCatInput.fill('');
        await ladderCatInput.dispatchEvent('change');
        await p.locator('#cl-gen-ag-fig').click();
        await h.wait(300);
        const svgBlankCat = await h.exportSvg();
        T.check('blank_ladder_cat_omitted', !svgBlankCat.includes('N3231S') && !svgBlankCat.includes('N3232S'), 'blanking catalog number omits it from figure');
      }

      // Issue #1570 Check (2): upload synthetic solid RGB(100,100,100) PNG, set #ag-bright to 140,
      // check #ag-adj-brightness and #ag-lanes-adjusted, generate figure, assert embedded PNG pixel > 120,
      // Disclosures: appears, and clipped.length === 0
      await p.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 80; c.height = 60; const x = c.getContext('2d');
        x.fillStyle = 'rgb(100,100,100)'; x.fillRect(0, 0, 80, 60);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], 'solid_gray.png', {type: 'image/png'});
        const dt = new DataTransfer(); dt.items.add(file);
        const el = document.querySelector('#clonePanel .cl-gel-upload');
        el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
        el.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      });
      await h.wait(600);

      const brightSlider = p.locator('#ag-bright');
      if (await brightSlider.count() > 0) {
        await brightSlider.fill('140');
        await brightSlider.dispatchEvent('change');
      }
      await p.locator('#ag-adj-brightness').check();
      await p.locator('#ag-adj-brightness').dispatchEvent('change');
      await p.locator('#ag-lanes-adjusted').check();
      await p.locator('#ag-lanes-adjusted').dispatchEvent('change');

      await p.locator('#cl-gen-ag-fig').click();
      await h.wait(600);

      const adjSvg = await h.exportSvg();
      const adjBoxes = await h.svgBoxes(adjSvg);
      const adjTexts = adjBoxes.texts.map(x => x.t);

      const pixelVal = await p.evaluate(async svg => {
        const m = svg.match(/<image[^>]+(?:href|xlink:href)="([^"]+)"/);
        if (!m) return 0;
        const im = new Image();
        await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = m[1]; });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[0];
      }, adjSvg);

      T.check('pixel_brightened_over_120', pixelVal > 120, `brightened pixel value is ${pixelVal} (> 120)`);
      T.check('disclosures_present', adjTexts.some(t => t.includes('Disclosures:')), 'Disclosures: appears in figure');
      T.check('no_clipped_text_disclosures', adjBoxes.clipped.length === 0, 'no clipped text with disclosures: ' + adjBoxes.clipped.join(' | '));

      T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    } finally {
      await close();
    }
  });

  T.done();
})();
