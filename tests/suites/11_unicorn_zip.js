// Tests for UNICORN 7 result archives (.zip)
const {open, H, suite, src, path, DATA} = require('../lib/harness');

const card = p => p.locator('.trace.run.sel').first();
const field = async (p, k) => { const el = card(p).locator(`[data-k=${k}]`).first(); if (!(await el.count())) return ''; const v = await el.inputValue().catch(() => ''); return v || (await el.getAttribute('placeholder')) || ''; };
const num = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
const setRun = async (p, k, v) => { const l = p.locator(`.trace.run.sel [data-k=${k}]`).first(); await l.evaluate(e => { let d = e.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } }); await l.fill(String(v)); await l.dispatchEvent('change'); await p.waitForTimeout(400); };
const detect = async p => { await p.evaluate(() => { const b = document.getElementById('intAuto'); if (b) b.click(); }); await p.waitForTimeout(900); };
/* Stored ZIPs keep this fixture self-contained; the app sees only a File selected through its picker. */
const storedZip = entries => Buffer.concat(entries.flatMap(({name, data}) => { const nm = Buffer.from(name), body = Buffer.from(data), h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(body.length, 22); h.writeUInt16LE(nm.length, 26); return [h, nm, body]; }));
const singles = vals => { const b = Buffer.alloc(vals.length * 4); vals.forEach((v, i) => b.writeFloatLE(v, 4*i)); return b; };
function nestedRawUnicorn(){ const xs = Array.from({length: 241}, (_, i) => i/10), ys = xs.map(x => 2 + 80*Math.exp(-0.5*((x - 12)/0.45)**2));
  const points = storedZip([{name: 'CoordinateData.VolumesDataType', data: 'System.Single[]\r\n'}, {name: 'CoordinateData.Volumes', data: singles(xs)}, {name: 'CoordinateData.AmplitudesDataType', data: 'System.Single[]\r\n'}, {name: 'CoordinateData.Amplitudes', data: singles(ys)}]);
  const xml = '<Chromatogram><Curves><Curve><Name>UV 1_280</Name><VolumeUnit>ml</VolumeUnit><AmplitudeUnit>mAU</AmplitudeUnit><CurvePoints><CurvePoint><IsFullResolution>true</IsFullResolution><BinaryCurvePointsFileName>Chrom.1_1_True</BinaryCurvePointsFileName></CurvePoint></CurvePoints></Curve></Curves><EventCurves /></Chromatogram>';
  return {name: 'nested_raw_unicorn.zip', mimeType: 'application/zip', buffer: storedZip([{name: 'Folder/Copy of Chrom.1.Xml', data: xml}, {name: 'Folder/Chrom.1_1_True', data: points}])}; }
const legacyRes = () => ({name: 'legacy_unicorn.res', mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from([0x11, 0x47, 0x11, 0x47]), Buffer.from('UNICORN legacy result\0'), Buffer.alloc(6)])});

async function peaks(p, h){ const t = await h.peakTable(); if (!t.length) return {head: [], rows: []}; const head = t[0];
  const iv = head.findIndex(c => /^(Ve|Center|Apex|Elution time)\b/.test(c)), ia = head.findIndex(c => /^Area/.test(c)), im = head.findIndex(c => /^Protein/.test(c)), ip = head.findIndex(c => /% of regions/.test(c));
  const rows = t.slice(1).filter(r => r.length > 3).map(r => ({name: r[0], a: num(r[1]), b: num(r[2]), ve: iv >= 0 ? num(r[iv]) : NaN, area: ia >= 0 ? num(r[ia]) : NaN, mg: im >= 0 ? num(r[im]) : NaN, pct: ip >= 0 ? num(r[ip]) : NaN}));
  return {head, unit: (head[iv] || '').match(/\((\w+)\)/) ? (head[iv].match(/\((\w+)\)/)[1]) : '', rows}; }

(async () => {
  const T = suite('11_unicorn_zip');
  const {p, errs, close} = await open();
  const h = H(p);

  await T.t('valid archive', async () => {
    await h.newProject('Unicorn 7 valid');
    await h.addRun(path.join(DATA, 'chrom', 'valid_unicorn.zip'));

    // The name comes from the file name, without extension
    const tl = await h.timeline();
    T.check('valid loads', tl.some(x => /valid unicorn/i.test(x.t)));

    const texts = await h.svgTexts();
    const textsArr = texts.map(x => x.t);

    const a1Text = texts.find(x => x.t === 'A1');
    T.check('fraction label A1 visible', !!a1Text);

    T.check('flow rate visible', textsArr.includes('0.50 mL/min'));

    await detect(p);
    const P = await peaks(p, h);

    const pk = P.rows.filter(r => !/Pool/i.test(r.name));
    T.check('peaks detected', pk.length >= 2, `found ${pk.length} peaks`);
    if (pk.length >= 2) {
      T.check('peak 1 x value', Math.abs(pk[0].ve - 13.0) < 0.2, `expected ~13.0, got ${pk[0].ve}`);
      T.check('peak 2 x value', Math.abs(pk[1].ve - 17.0) < 0.2, `expected ~17.0, got ${pk[1].ve}`);
      T.check('peak 2 has larger area than peak 1', pk[1].area > pk[0].area);
    }

    const flow = num(await field(p, 'mFlow'));
    T.check('flow input', flow === 0.5, `expected 0.5, got ${flow}`);

    const toasts = await h.toasts();
    T.check('no error toast', !toasts.some(t => /error|failed/i.test(t)), toasts.join(', ')); T.check('valid loads parsed-facts', toasts.some(t => /Loaded 1 ÄKTA run.*UV.*mAU over 30 ml/i.test(t)), toasts.join(', '));

    // Test for injection mark spatial positioning in the SVG:
    // The injection label 'Inj' is drawn if there is an injection event.
    // And its x position should be less than the A1 fraction.
    const injText = texts.find(x => x.t === 'Inj' || x.t === '1' || x.t === 'Injection' || x.t === '1.0');
    if (a1Text) {
       T.check('A1 has coordinates', a1Text.x > 0 && a1Text.y > 0);
       if (injText) {
          T.check('injection position is left of fractions', injText.x < a1Text.x, `inj x=${injText.x}, A1 x=${a1Text.x}`);
       }
    }
  });

  await T.t('missing curve archive', async () => {
    await p.reload();
    await h.wait(900);
    await h.newProject('Unicorn 7 missing curve');
    await h.addRun(path.join(DATA, 'chrom', 'missing_curve.zip'));

    await h.wait(1500);
    const badFiles = await p.$$eval('#badFiles li', els => els.map(e => e.textContent));
    const toasts = await h.toasts();
    // Missing UV curve causes parseUnicornZip to return null, which pushes "not a UNICORN result archive".
    // Guards: an archive missing a curve must say so (which curve, or that something was skipped), not only report a normal load.
    T.check('gives a message for missing curve', [...badFiles, ...toasts].some(t => /missing|not found|no .*curve|skipp|without/i.test(t)), `badFiles: ${badFiles.join(' | ') || 'none'}, toasts: ${toasts.join(' | ') || 'none'}`);
    T.check('no page errors for missing curve', !errs.length, errs.join(' | '));
  });

  await T.t('zero measurement archive', async () => {
    await p.reload();
    await h.wait(900);
    await h.newProject('Unicorn 7 zero measurement');
    await h.addRun(path.join(DATA, 'chrom', 'zero_measurement.zip'));
    await h.wait(1500);
    const toasts = await h.toasts();
    T.check('gives a message for zero measurement', toasts.some(t => /no readable data points/i.test(t)), `toasts: ${toasts.join(' | ') || 'none'}`);
    T.check('no page errors for zero measurement', !errs.length, errs.join(' | '));
  });

  await T.t('not unicorn archive', async () => {
    await p.reload();
    await h.wait(900);
    await h.newProject('Unicorn 7 invalid');
    await h.addRun(path.join(DATA, 'chrom', 'not_unicorn.zip'));

    await h.wait(1500);
    const badFiles = await p.$$eval('#badFiles li', els => els.map(e => e.textContent));
    const toasts = await h.toasts();
    T.check('invalid format message', badFiles.some(t => /not a UNICORN result archive/i.test(t)) || toasts.some(t => /not a UNICORN result archive/i.test(t)), `badFiles: ${badFiles}, toasts: ${toasts}`);
    T.check('no page errors for not unicorn', !errs.length, errs.join(' | '));
  });

  await T.t('data descriptor archive', async () => {
    await p.reload();
    await h.wait(900);
    await h.newProject('Unicorn 7 descriptor');
    await h.addRun(path.join(DATA, 'chrom', 'descriptor_unicorn.zip'));

    await h.wait(1500);
    const tl = await h.timeline();
    T.check('descriptor run appears in timeline', tl.some(x => /descriptor unicorn/i.test(x.t)), `timeline: ${JSON.stringify(tl)}`);
    T.check('exactly one selected run card', (await card(p).count()) === 1);
    const toasts = await h.toasts();
    T.check('no error toast for descriptor archive', !toasts.some(t => /error|failed|not a unicorn/i.test(t)), toasts.join(', '));
    T.check('no page errors for descriptor archive', !errs.length, errs.join(' | '));
  });

  await T.t('nested raw Float32 archive', async () => {
    await p.reload();
    await h.wait(900);
    await h.newProject('Nested raw UNICORN');
    await h.addRun(nestedRawUnicorn());
    const tl = await h.timeline();
    T.check('nested raw Float32 loads as AKTA run', tl.some(x => /nested raw unicorn/i.test(x.t)) && (await card(p).count()) === 1, JSON.stringify(tl));
    await detect(p);
    const P = await peaks(p, h), pk = P.rows.find(r => !/Pool/i.test(r.name));
    T.check('nested raw Float32 UV peak', !!pk && Math.abs(pk.ve - 12) < 0.2, `expected ~12.0, got ${pk ? pk.ve : 'none'}`);
  });

  await T.t('legacy res guidance', async () => {
    await p.reload();
    await h.wait(900);
    await h.newProject('Legacy UNICORN result');
    await h.addRun(legacyRes());
    const toasts = await h.toasts();
    T.check('legacy res explains UNICORN Evaluation export', toasts.some(t => /legacy UNICORN 3-5 binary result/i.test(t) && /export.*\.asc.*\.csv from UNICORN Evaluation/i.test(t)), toasts.join(' | '));
  });

  await T.t('nominal UV path normalization and uvpath curve', async () => {
    const mkPathZip = (fileName, uvInfoXml, pathCm) => {
      const xs = Array.from({length: 601}, (_, i) => i * 0.05);
      const amp = 1000 / (0.5 * Math.sqrt(2 * Math.PI));
      const ys = xs.map(x => amp * Math.exp(-0.5 * ((x - 15) / 0.5) ** 2));
      const uvPts = storedZip([
        {name: 'CoordinateData.VolumesDataType', data: 'System.Single[]\r\n'},
        {name: 'CoordinateData.Volumes', data: singles(xs)},
        {name: 'CoordinateData.AmplitudesDataType', data: 'System.Single[]\r\n'},
        {name: 'CoordinateData.Amplitudes', data: singles(ys)}
      ]);
      const entries = [{name: 'Chrom.1_1_True', data: uvPts}];
      let pathCurveXml = '';
      if (pathCm != null) {
        const pPts = storedZip([
          {name: 'CoordinateData.VolumesDataType', data: 'System.Single[]\r\n'},
          {name: 'CoordinateData.Volumes', data: singles([0])},
          {name: 'CoordinateData.AmplitudesDataType', data: 'System.Single[]\r\n'},
          {name: 'CoordinateData.Amplitudes', data: singles([pathCm])}
        ]);
        entries.push({name: 'Chrom.1_2_True', data: pPts});
        pathCurveXml = '<Curve><Name>UV cell path length</Name><VolumeUnit>ml</VolumeUnit><AmplitudeUnit>cm</AmplitudeUnit><CurvePoints><CurvePoint><IsFullResolution>true</IsFullResolution><BinaryCurvePointsFileName>Chrom.1_2_True</BinaryCurvePointsFileName></CurvePoint></CurvePoints></Curve>';
      }
      const evXml = [[10, 'T1'], [13, 'T2'], [17, 'T3'], [20, 'T4'], [23, 'Waste']].map(([v, l]) => `<Event><EventVolume>${v}</EventVolume><EventText>${l}</EventText></Event>`).join('');
      const xml = `<Chromatogram><Curves><Curve><Name>UV 1_280</Name><VolumeUnit>ml</VolumeUnit><AmplitudeUnit>mAU</AmplitudeUnit><CurvePoints><CurvePoint><IsFullResolution>true</IsFullResolution><BinaryCurvePointsFileName>Chrom.1_1_True</BinaryCurvePointsFileName></CurvePoint></CurvePoints>${uvInfoXml}</Curve>${pathCurveXml}</Curves><EventCurves><EventCurve EventCurveType="Fraction"><Events>${evXml}</Events></EventCurve></EventCurves></Chromatogram>`;
      entries.unshift({name: 'Chrom.1.Xml', data: xml});
      return {name: fileName, mimeType: 'application/zip', buffer: storedZip(entries)};
    };
    const withFresh = async fn => {
      const {p: px, errs: ex, close: cx} = await open();
      const hx = H(px);
      const sumMg = async () => {
        await hx.step('figure');
        const rs = await hx.sumTable();
        if (rs.length < 2) return NaN;
        const idx = rs[0].findIndex(k => /^Protein \(mg\)$/.test(k));
        return idx >= 0 ? num(rs[1][idx]) : NaN;
      };
      try { await fn(px, hx, sumMg); } finally { errs.push(...ex); await cx(); }
    };
    await withFresh(async (px, hx, sumMg) => {
      await hx.newProject('Nominal UV path UNICORN');
      await px.evaluate(() => { const el = document.getElementById('o-eps'); if (el) { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } });
      await hx.wait(200);
      const normInfo = '<CurveUVInfo><IsUVValuesNormalizedToNominalUVPathLength>true</IsUVValuesNormalizedToNominalUVPathLength><UVPathLength>2</UVPathLength><NominalUVPathLength>10</NominalUVPathLength><IsSystemProvided>true</IsSystemProvided></CurveUVInfo>';
      await hx.addRun(mkPathZip('norm_10mm_u7.zip', normInfo, 0.2));
      await hx.pool('T1-T3');
      const normPath = await field(px, 'path');
      const diagTxt = await px.locator('.trace.run.sel .source-diag').textContent().catch(() => '');
      const normMg = await sumMg();
      T.check('nominal_uv_path_10mm', normPath === '10', `expected path 10, got "${normPath}"`);
      T.check('nominal_uv_path_1mg_not_5mg', T.near(normMg, 1.0, 0.02), `expected 1.00 mg (not 5.00 mg), got ${normMg}`);
      T.check('nominal_uv_path_diag_note', /UV normalized to 10 mm nominal path \(physical cell 2 mm\)/.test(diagTxt), `diag: ${diagTxt}`);
    });
    await withFresh(async (px, hx, sumMg) => {
      await hx.newProject('Curve-only 1pt cm UV path UNICORN');
      await px.evaluate(() => { const el = document.getElementById('o-eps'); if (el) { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); } });
      await hx.wait(200);
      await hx.addRun(mkPathZip('curve_1cm_u7.zip', '', 1.0));
      await hx.pool('T1-T3');
      const curvePath = await field(px, 'path');
      const curveMg = await sumMg();
      T.check('zip_uvpath_1pt_cm_10mm', curvePath === '10', `expected path 10, got "${curvePath}"`);
      T.check('zip_uvpath_1pt_cm_1mg_not_5mg', T.near(curveMg, 1.0, 0.02), `expected 1.00 mg (not 5.00 mg), got ${curveMg}`);
    });
  });

  T.check('no page errors overall', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
