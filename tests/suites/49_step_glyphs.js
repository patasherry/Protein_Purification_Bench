// 49 step glyphs: publication-grade 180x116 inline SVG schematics for non-data workflow and standalone steps.
// Verifies UI-driven rendering, dynamic data-truth binding (zero hardcoded contradictions), exported SVG validity,
// zero duplicate element IDs, zero text clipping/overlap, PNG export, and legacy project backward compatibility.
const {open, H, suite, path, fs, DATA, ROOT, RES, src} = require('../lib/harness');

const parseExportSvg = (p, svg) => svg ? p.evaluate(raw => {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  const ids = [...doc.querySelectorAll('[id]')].map(e => e.getAttribute('id'));
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  const glyphs = [...doc.querySelectorAll('svg[viewBox="0 0 180 116"]')].map(g => {
    const texts = [...g.querySelectorAll('text')].map(t => t.textContent.trim()).filter(Boolean);
    const strokes = [...g.querySelectorAll('[stroke]')].filter(e => e.getAttribute('stroke') !== 'none')
      .map(e => ({stroke: e.getAttribute('stroke'), sw: parseFloat(e.getAttribute('stroke-width') || e.closest('[stroke-width]')?.getAttribute('stroke-width') || '1')}));
    const fills = [...g.querySelectorAll('text[fill]')].map(e => e.getAttribute('fill'));
    const paths = [...g.querySelectorAll('path')].map(e => e.getAttribute('d') || '').join('|');
    const lines = g.querySelectorAll('line').length;
    const circles = g.querySelectorAll('circle').length;
    return {
      glyph: g.getAttribute('data-glyph') || '',
      lysisMode: g.getAttribute('data-lysis-mode') || '',
      hasSnow: !!g.querySelector('[data-fin-snow]'),
      trCue: g.querySelector('[data-tr-cue]')?.getAttribute('data-tr-cue') || '',
      texts,
      minStroke: strokes.length ? Math.min(...strokes.map(s => s.sw)) : 1,
      badYellow: strokes.some(s => /^#f0e442$/i.test(s.stroke || '')) || fills.some(f => /^#f0e442$/i.test(f || '')),
      sig: `${paths.length}:${lines}:${circles}`
    };
  });
  return {xmlOk: !err, err: err ? err.textContent : '', idCount: ids.length, dupIds, glyphs};
}, svg) : Promise.resolve({xmlOk: false, err: 'empty', idCount: 0, dupIds: [], glyphs: []});

const safeExportSvg = async (p, h) => (await p.locator('#paper svg').count()) ? await h.exportSvg() : '';

const fillAndRender = async (p, h, sel, val) => {
  const loc = p.locator(sel);
  if (!(await loc.count())) return;
  if (!(await loc.isVisible())) {
    const det = loc.locator('xpath=ancestor::details[not(@open)]');
    const n = await det.count();
    for (let i = 0; i < n; i++) await det.nth(i).locator('summary').first().click();
    await h.wait(100);
  }
  const tag = await loc.evaluate(e => e.tagName.toLowerCase());
  if (tag === 'select') await loc.selectOption(String(val));
  else { await loc.fill(String(val)); await loc.dispatchEvent('change'); }
  await h.wait(320);
};

(async () => {
  const T = suite('49_step_glyphs');

  await T.t('upstream_and_cleave_schematics', async () => {
    const {p, errs, close} = await open({width: 1400, height: 960}), h = H(p);
    await h.newProject('Step Glyphs Upstream');

    /* 1. Transformation: blank defaults -> heat shock vs electroporation & selection binding */
    await h.step('transform');
    const svgTr0 = await safeExportSvg(p, h), tr0 = await parseExportSvg(p, svgTr0);
    const gTr0 = tr0.glyphs[0];
    T.check('tr.renders_180x116_glyph', !!(tr0.xmlOk && gTr0 && gTr0.glyph === 'transform'), JSON.stringify(tr0));
    T.check('tr.blank_no_hardcoded_antibiotic', !!(gTr0 && gTr0.texts.includes('Selection') && !gTr0.texts.some(t => /Kan|Amp|LB/i.test(t))), gTr0 && gTr0.texts.join(' | '));
    T.check('tr.default_has_thermal_cue', !!(gTr0 && gTr0.trCue === 'thermal'), gTr0 && gTr0.trCue);

    await fillAndRender(p, h, '#pr-trMethod', 'electroporation');
    await fillAndRender(p, h, '#pr-trSel', '50 µg/mL kanamycin');
    const svgTr1 = await safeExportSvg(p, h), tr1 = await parseExportSvg(p, svgTr1), gTr1 = tr1.glyphs[0];
    T.check('tr.electroporation_hides_thermal_and_binds_sel', !!(gTr1 && gTr1.trCue === 'pulse' && gTr1.texts.includes('Electroporation') && gTr1.texts.some(t => /50 µg\/mL Kan/i.test(t))), gTr1 && JSON.stringify(gTr1));

    /* 2. Expression: blank defaults -> autoinduction -> IPTG + OD + temp */
    await h.step('expr');
    const svgEx0 = await safeExportSvg(p, h), ex0 = await parseExportSvg(p, svgEx0), gEx0 = ex0.glyphs[0];
    T.check('expr.blank_no_hardcoded_iptg_or_temp', !!(gEx0 && gEx0.glyph === 'expr' && gEx0.texts.includes('+ Inducer') && !gEx0.texts.some(t => /IPTG|18\s*°C|OD/i.test(t))), gEx0 && gEx0.texts.join(' | '));

    await fillAndRender(p, h, '#pr-indKind', 'auto');
    const gExAuto = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('expr.autoinduction_pill', !!(gExAuto && gExAuto.texts.includes('Auto-ind.')), gExAuto && gExAuto.texts.join(' | '));

    await fillAndRender(p, h, '#pr-indKind', 'IPTG');
    await fillAndRender(p, h, '#pr-inducer', '0.5');
    await fillAndRender(p, h, '#pr-temp', '18');
    await fillAndRender(p, h, '#pr-od', '0.7');
    const gExIptg = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('expr.iptg_od_temp_bound', !!(gExIptg && gExIptg.texts.includes('0.5 mM IPTG') && gExIptg.texts.some(t => /OD 0\.7.*18 °C/.test(t))), gExIptg && gExIptg.texts.join(' | '));

    /* 3. Lysis: blank fallback -> sonication -> homogenizer -> chemical + clarify binding */
    await h.step('lysis');
    const gLy0 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('lysis.blank_generic_label', !!(gLy0 && gLy0.glyph === 'lysis' && gLy0.texts.includes('Cell lysis') && gLy0.texts.includes('S') && gLy0.texts.includes('P')), gLy0 && gLy0.texts.join(' | '));

    await fillAndRender(p, h, '#pr-lysMethod', 'Sonication');
    await fillAndRender(p, h, '#pr-clarify', '30,000 × g, 45 min');
    const gLySon = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];

    await fillAndRender(p, h, '#pr-lysMethod', 'Microfluidizer');
    const gLyHom = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];

    await fillAndRender(p, h, '#pr-lysMethod', 'BugBuster detergent');
    const gLyChem = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];

    T.check('lysis.three_distinct_modes_and_clarify', !!(
      gLySon && gLySon.lysisMode === 'sonicate' && gLySon.texts.includes('Sonication') && gLySon.texts.some(t => /30,000 × g/.test(t)) &&
      gLyHom && gLyHom.lysisMode === 'homogenize' && gLyHom.sig !== gLySon.sig &&
      gLyChem && gLyChem.lysisMode === 'chemical' && gLyChem.texts.includes('Chemical lysis') && gLyChem.sig !== gLySon.sig && gLyChem.sig !== gLyHom.sig
    ), JSON.stringify({son: gLySon, hom: gLyHom, chem: gLyChem}));

    /* 4. Dialysis & Protease Cleavage */
    await h.addRun(src('his'));
    await h.suggest();
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="cleave"]');
    await h.wait(400);
    const gClv0 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('cleave.blank_defaults', !!(gClv0 && gClv0.glyph === 'cleave' && gClv0.texts.includes('Dialysis') && gClv0.texts.includes('Protease')), gClv0 && gClv0.texts.join(' | '));

    await fillAndRender(p, h, '#pr-protease', 'TEV');
    await fillAndRender(p, h, '#pr-mwco', '10');
    const gClv1 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('cleave.binds_protease_and_mwco', !!(gClv1 && gClv1.texts.includes('TEV') && gClv1.texts.includes('10 kDa')), gClv1 && gClv1.texts.join(' | '));

    T.check('upstream.no_page_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  await T.t('between_manual_final_and_composite_workflow', async () => {
    const {p, errs, close} = await open({width: 1440, height: 960}), h = H(p);
    await h.newProject('Step Glyphs Full Workflow');
    await h.gb(src('gb'));

    /* Enable optional Transformation panel in workflow */
    await h.step('transform');
    await fillAndRender(p, h, '#pr-trMethod', 'heat shock');
    await fillAndRender(p, h, '#pr-trSel', 'Kanamycin');
    if (await p.locator('#pr-transform').count()) {
      await p.locator('#pr-transform').check();
      await h.wait(250);
    }

    await h.step('expr');
    await fillAndRender(p, h, '#pr-strain', 'BL21(DE3)');
    await fillAndRender(p, h, '#pr-medium', 'TB');
    await fillAndRender(p, h, '#pr-inducer', '0.5');

    await h.step('lysis');
    await fillAndRender(p, h, '#pr-lysMethod', 'Sonication');

    /* Add IMAC + between-column step, cycle through all 5 btw.how modes without NanoDrop spectrum */
    await h.addRun(src('his'));
    await h.suggest();
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="conc"]');
    await h.wait(400);

    /* conc: blank -> populated */
    const gBtwConc0 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.conc_blank_fallbacks', !!(gBtwConc0 && gBtwConc0.glyph === 'btw_conc' && gBtwConc0.texts.includes('MWCO filter') && gBtwConc0.texts.includes('Concentrate')), gBtwConc0 && gBtwConc0.texts.join(' | '));
    await fillAndRender(p, h, '#btw-conc', '2.5');
    await fillAndRender(p, h, '#btw-vOut', '0.5');
    await fillAndRender(p, h, '#btw-vIn', '12');
    await fillAndRender(p, h, '#btw-mwco', '30');
    const gBtwConc1 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.conc_binds_mwco_and_vol', !!(gBtwConc1 && gBtwConc1.texts.includes('30 kDa') && gBtwConc1.texts.some(t => /^12→0\.50? mL$/.test(t))), gBtwConc1 && gBtwConc1.texts.join(' | '));

    /* dil */
    await fillAndRender(p, h, '#btw-how', 'dil');
    const gBtwDil = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.dil_renders', !!(gBtwDil && gBtwDil.glyph === 'btw_dil' && gBtwDil.texts.includes('Pool dilution') && gBtwDil.texts.some(t => /^12→0\.50? mL$/.test(t))), gBtwDil && gBtwDil.texts.join(' | '));

    /* exch */
    await fillAndRender(p, h, '#btw-how', 'exch');
    await fillAndRender(p, h, '#btw-device', 'PD-10');
    const gBtwExch = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.exch_binds_device', !!(gBtwExch && gBtwExch.glyph === 'btw_exch' && gBtwExch.texts.includes('PD-10')), gBtwExch && gBtwExch.texts.join(' | '));

    /* filt: blank device must NOT print 0.22 µm; 0.45 µm must print 0.45 µm */
    await fillAndRender(p, h, '#btw-how', 'filt');
    await fillAndRender(p, h, '#btw-device', '');
    await fillAndRender(p, h, '#btw-note', '');
    const gBtwFilt0 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.filt_blank_never_hardcodes_022', !!(gBtwFilt0 && gBtwFilt0.glyph === 'btw_filt' && gBtwFilt0.texts.includes('Filter') && !gBtwFilt0.texts.some(t => /0\.22/.test(t))), gBtwFilt0 && gBtwFilt0.texts.join(' | '));
    await fillAndRender(p, h, '#btw-device', '0.45 um syringe filter');
    const gBtwFilt1 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.filt_binds_045_um', !!(gBtwFilt1 && gBtwFilt1.texts.includes('0.45 µm') && !gBtwFilt1.texts.some(t => /0\.22/.test(t))), gBtwFilt1 && gBtwFilt1.texts.join(' | '));

    /* hold: blank note must NOT print 4 °C; entering 4 °C binds it */
    await fillAndRender(p, h, '#btw-how', 'hold');
    await fillAndRender(p, h, '#btw-note', '');
    const gBtwHold0 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.hold_blank_never_hardcodes_4c', !!(gBtwHold0 && gBtwHold0.glyph === 'btw_hold' && gBtwHold0.texts.includes('Hold O/N') && !gBtwHold0.texts.some(t => /4\s*°C/.test(t))), gBtwHold0 && gBtwHold0.texts.join(' | '));
    await fillAndRender(p, h, '#btw-note', '4 °C overnight');
    const gBtwHold1 = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('btw.hold_binds_temp', !!(gBtwHold1 && gBtwHold1.texts.includes('4 °C / O/N')), gBtwHold1 && gBtwHold1.texts.join(' | '));

    /* Set btw back to conc so workflow has one btw_conc AND one manual conc to verify zero duplicate IDs */
    await fillAndRender(p, h, '#btw-how', 'conc');
    await fillAndRender(p, h, '#btw-device', 'Amicon Ultra-15');

    /* Manual steps: column (gravity), batch, precip, dialysis (reuses btw_exch), conc (reuses btw_conc), other (custom) */
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="man:column"]');
    await h.wait(350);
    await fillAndRender(p, h, '#man-resin', 'Ni-NTA agarose');
    await fillAndRender(p, h, '#man-arrow', 'Pool E1-E3');
    const gManGrav = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('man.gravity_binds_resin_and_arrow', !!(gManGrav && gManGrav.glyph === 'man_gravity' && gManGrav.texts.includes('Ni-NTA agarose') && gManGrav.texts.includes('Pool E1-E3')), gManGrav && gManGrav.texts.join(' | '));

    await fillAndRender(p, h, '#man-kind', 'batch');
    const gManBatch = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('man.batch_renders', !!(gManBatch && gManBatch.glyph === 'man_batch' && gManBatch.texts.includes('Ni-NTA agarose')), gManBatch && gManBatch.texts.join(' | '));

    await fillAndRender(p, h, '#man-kind', 'precip');
    await fillAndRender(p, h, '#man-resin', '50% AmSO4');
    const gManPrecip = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('man.precip_renders', !!(gManPrecip && gManPrecip.glyph === 'man_precip' && gManPrecip.texts.includes('50% AmSO4') && gManPrecip.texts.includes('Ppt')), gManPrecip && gManPrecip.texts.join(' | '));

    await fillAndRender(p, h, '#man-kind', 'dialysis');
    await fillAndRender(p, h, '#man-resin', 'Slide-A-Lyzer');
    const gManDial = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('man.dialysis_reuses_btw_exch', !!(gManDial && gManDial.glyph === 'btw_exch' && gManDial.texts.includes('Slide-A-Lyzer')), gManDial && gManDial.texts.join(' | '));

    await fillAndRender(p, h, '#man-kind', 'other');
    await fillAndRender(p, h, '#man-name', 'SEC polish');
    const gManCust = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs[0];
    T.check('man.custom_fallback_renders', !!(gManCust && gManCust.glyph === 'man_custom' && gManCust.texts.includes('SEC polish') && gManCust.texts.includes('Input') && gManCust.texts.includes('Output')), gManCust && gManCust.texts.join(' | '));

    /* Add a second manual step of kind 'conc' so composite workflow contains duplicate schematic kinds */
    await p.click('#tl [data-addmenu]');
    await p.click('#tl [data-addstep="man:other"]');
    await h.wait(350);
    await fillAndRender(p, h, '#man-kind', 'conc');
    await fillAndRender(p, h, '#man-resin', 'Vivaspin 10 kDa');
    await fillAndRender(p, h, '#man-vol', '0.2');

    /* Final sample: enable #pr-finPanel, test blank store vs 4 °C (no snowflake) vs -80 °C (with snowflake) */
    await h.step('final');
    await fillAndRender(p, h, '#pr-finConc', '2.4');
    await fillAndRender(p, h, '#pr-finVol', '0.2');
    const finMore = p.locator('#finQcMore');
    if (await finMore.count()) {
      if (!(await finMore.evaluate(e => e.open))) await finMore.locator('summary').click();
      await h.wait(100);
    }
    if (await p.locator('#pr-finPanel').count()) {
      await p.locator('#pr-finPanel').check();
      await h.wait(300);
    }

    await h.step('figure');
    let wfParsed = await parseExportSvg(p, await safeExportSvg(p, h));
    let gFin = wfParsed.glyphs.find(g => g.glyph === 'final_storage');
    T.check('fin.blank_store_no_80c_and_no_snowflake', !!(gFin && gFin.texts.includes('Stored') && !gFin.hasSnow && !gFin.texts.some(t => /80/.test(t))), JSON.stringify(gFin));

    await h.step('final');
    await fillAndRender(p, h, '#pr-store', 'kept at 4 °C');
    await h.step('figure');
    gFin = (await parseExportSvg(p, await safeExportSvg(p, h))).glyphs.find(g => g.glyph === 'final_storage');
    T.check('fin.4c_binds_temp_and_hides_snowflake', !!(gFin && gFin.texts.includes('4 °C') && !gFin.hasSnow), JSON.stringify(gFin));

    await h.step('final');
    await fillAndRender(p, h, '#pr-store', '50 µL aliquots flash-frozen in LN2, stored at -80 °C');
    await h.step('figure');
    const wfSvg = await safeExportSvg(p, h);
    wfParsed = await parseExportSvg(p, wfSvg);
    gFin = wfParsed.glyphs.find(g => g.glyph === 'final_storage');
    T.check('fin.minus80_shows_snowflake_and_conc', !!(gFin && gFin.texts.includes('−80 °C') && gFin.hasSnow && gFin.texts.some(t => /2\.40 mg\/mL/.test(t))), JSON.stringify(gFin));

    /* Composite workflow integrity: valid XML, zero duplicate IDs, stroke >= 0.85, no #F0E442, zero clipping, zero overlap, PNG export */
    T.check('wf.xml_valid_and_no_dup_ids', wfParsed.xmlOk && wfParsed.dupIds.length === 0, `err=${wfParsed.err} dupIds=${wfParsed.dupIds.join(',')}`);
    const concGlyphs = wfParsed.glyphs.filter(g => g.glyph === 'btw_conc');
    T.check('wf.multiple_same_glyphs_collision_free', concGlyphs.length === 2 && wfParsed.glyphs.length >= 7, `glyphs=${wfParsed.glyphs.map(g => g.glyph).join(',')}`);
    T.check('wf.strokes_and_palette_compliant', wfParsed.glyphs.length > 0 && wfParsed.glyphs.every(g => g.minStroke >= 0.85 && !g.badYellow), JSON.stringify(wfParsed.glyphs.map(g => ({k: g.glyph, sw: g.minStroke, y: g.badYellow}))));

    for (const lay of ['row', 'grid', 'stack']) {
      await p.locator(`label[for="wf-${lay}"]`).click();
      await h.wait(450);
      const boxes = await h.svgBoxes(await safeExportSvg(p, h));
      const ov = await h.overlaps();
      T.check(`wf.${lay}_no_clipped_text`, boxes.clipped.length === 0, boxes.clipped.join(' | '));
      T.check(`wf.${lay}_no_overlapping_text`, ov.length === 0, ov.slice(0, 6).join(' | '));
    }

    const [pngDl] = await Promise.all([p.waitForEvent('download', {timeout: 15000}), p.click('#savePng')]);
    const pngPath = path.join(RES, 'export-step-glyphs.png');
    await pngDl.saveAs(pngPath);
    const pngBuf = fs.readFileSync(pngPath);
    T.check('wf.png_export_valid', pngBuf.length > 2000 && pngBuf[0] === 0x89 && pngBuf[1] === 0x50 && pngBuf[2] === 0x4e && pngBuf[3] === 0x47, `bytes=${pngBuf.length}`);

    T.check('wf.no_page_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  await T.t('legacy_project_zero_panel_or_numerical_drift', async () => {
    const {p, errs, close} = await open({width: 1400, height: 900}), h = H(p);
    await p.setInputFiles('#projFile', path.join(ROOT, 'synth/legacy_exact.json'));
    await h.wait(1200);
    await h.step('figure');
    const wfParsed = await parseExportSvg(p, await safeExportSvg(p, h));
    const hasTrOrFin = wfParsed.glyphs.some(g => g.glyph === 'transform' || g.glyph === 'final_storage');
    const sm = p.locator('#sumMore');
    if (await sm.isVisible()) { await sm.click(); await h.wait(150); }
    const rows = await h.sumTable();
    const concRow = rows.find(r => /Concentrated/i.test(r[0] || ''));
    const meth = await h.methods();
    T.check('legacy.no_unrequested_transform_or_final_panel', !hasTrOrFin && wfParsed.glyphs.length === 1 && wfParsed.glyphs[0].glyph === 'btw_conc', wfParsed.glyphs.map(g => g.glyph).join(','));
    T.check('legacy.summary_numbers_preserved', !!(rows.length === 3 && concRow && concRow[2] === '1.0' && /1(?:\.0)?\s*mL/.test(meth)), JSON.stringify(rows));
    T.check('legacy.no_page_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  T.done();
})();
