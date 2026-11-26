// 1741_qc_passport_svg: QC Passport SVG rendering and export (#1776, Part 2 of 3 of #1771).
// Drives the application strictly through UI controls, downloads, and svgBoxes().
const {open, H, suite, src, RES, path, fs} = require('../lib/harness');

(async () => {
  const T = suite('1741_qc_passport_svg');
  const {p, errs, close} = await open(), h = H(p);

  const exportPassportBtn = async () => {
    if (!(await p.isVisible('#savePassportSvg'))) return '';
    const [dl] = await Promise.all([
      p.waitForEvent('download', {timeout: 15000}),
      p.click('#savePassportSvg')
    ]);
    const f = path.join(RES, 'passport-' + Date.now() + '.svg');
    await dl.saveAs(f);
    return fs.readFileSync(f, 'utf8');
  };

  const inspectSvgDom = async svg => {
    const pg = await p.context().newPage();
    try {
      await pg.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:0">' + svg + '</body>');
      await pg.waitForSelector('svg', {timeout: 5000});
      return await pg.evaluate(() => {
        const boxOf = sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {w: r.width, h: r.height, x: r.x, y: r.y};
        };
        const texts = [...document.querySelectorAll('svg text')].map(t => {
          const r = t.getBoundingClientRect();
          return {t: (t.textContent || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom};
        }).filter(x => x.t && x.w > 0);
        const overlaps = [];
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i], b = texts[j];
            const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
            if (w > 0 && h > 0 && w * h > 0.25 * Math.min(a.w * a.h, b.w * b.h)) {
              overlaps.push(`${a.t} × ${b.t}`);
            }
          }
        }
        const cap = document.querySelector('#qcPassportCaption');
        const ndSec = document.querySelector('.passport-nd');
        return {
          chromCurve: boxOf('.passport-chrom-curve'),
          poolShade: boxOf('.passport-pool-shade'),
          ndPlot: boxOf('.passport-nd-plot'),
          gelCrop: boxOf('.passport-gel-crop'),
          lineageCount: document.querySelectorAll('.passport-lineage').length,
          captionText: cap ? cap.textContent.replace(/\s+/g, ' ').trim() : '',
          ndText: ndSec ? ndSec.textContent.replace(/\s+/g, ' ').trim() : '',
          overlaps
        };
      });
    } finally {
      await pg.close();
    }
  };

  await T.t('passport_svg_rendering_caption_and_export', async () => {
    await h.newProject('QC Passport SVG');
    await h.addRun(src('his'));
    await h.suggest();
    await h.wait(300);

    const tlRun = (await h.timeline()).find(x => /^run:/.test(x.k));
    const rid = tlRun ? tlRun.k.slice(4) : '';
    T.check('setup.run_ready', !!rid, `rid=${rid}`);

    // Set measured 5 mm UV detector path on the run card
    await h.step('run:' + rid);
    const condDetails = p.locator(`#list .trace.run[data-id="${rid}"] details.runcond`);
    if (await condDetails.count()) await condDetails.evaluate(d => { d.open = true; });
    const pathInp = p.locator(`#list .trace.run[data-id="${rid}"] [data-k="path"]`);
    if (await pathInp.count()) {
      await pathInp.evaluate(el => { const m = el.closest('details'); if (m) m.open = true; });
      await pathInp.fill('5');
      await pathInp.dispatchEvent('change');
      await h.wait(200);
    }

    // Add 1 gel image with lane T4 assigned to the run
    await p.setInputFiles('#gelFile', [src('gel')]);
    await h.wait(1500);
    const gelOpenBtn = p.locator('#ssGels [data-gelopen]').first();
    if (await gelOpenBtn.count()) {
      await gelOpenBtn.click();
      await h.wait(300);
    }
    await p.evaluate(() => { document.querySelectorAll('#panel details').forEach(d => { d.open = true; }); });
    await p.fill('#g-n', '2');
    await p.dispatchEvent('#g-n', 'input');
    await p.dispatchEvent('#g-n', 'change');
    await h.wait(200);
    await p.fill('#g-labels', 'M, T4');
    await p.dispatchEvent('#g-labels', 'input');
    await p.dispatchEvent('#g-labels', 'change');
    await h.wait(350);

    // Add 1 NanoDrop reading with A280 and 260/280 ratio linked to the run
    await h.step('final');
    await h.wait(250);
    await p.click('#ndManual');
    await h.wait(200);
    await p.fill('#ndList .ndr [data-ndk="name"]', 'IMAC Eluate');
    await p.dispatchEvent('#ndList .ndr [data-ndk="name"]', 'change');
    await p.fill('#ndList .ndr [data-ndk="a280"]', '1.60');
    await p.dispatchEvent('#ndList .ndr [data-ndk="a280"]', 'change');
    await p.fill('#ndList .ndr [data-ndk="r280"]', '0.55');
    await p.dispatchEvent('#ndList .ndr [data-ndk="r280"]', 'change');
    await p.locator('#ndList .ndr details.nd-edit').evaluate(d => { d.open = true; });
    await p.selectOption('#ndList .ndr select[data-ndk="runId"]', rid);
    await h.wait(300);

    // 1. Export via dedicated #savePassportSvg button
    const btnVis = await p.isVisible('#savePassportSvg');
    T.check('export_btn_visible', btnVis, 'Export QC Passport button visible');
    const svg1 = btnVis ? await exportPassportBtn() : '';
    const boxes1 = svg1 ? await h.svgBoxes(svg1) : {clipped: ['missing'], texts: []};
    const dom1 = svg1 ? await inspectSvgDom(svg1) : null;

    T.check(
      'svg_sections_and_lineage_present',
      !!dom1 &&
        !!dom1.chromCurve && dom1.chromCurve.w > 20 && dom1.chromCurve.h > 8 &&
        !!dom1.poolShade && dom1.poolShade.w > 1 &&
        !!dom1.ndPlot && dom1.ndPlot.w > 10 && dom1.ndPlot.h > 4 &&
        !!dom1.gelCrop && dom1.gelCrop.w > 6 && dom1.gelCrop.h > 15 &&
        dom1.lineageCount >= 2,
      JSON.stringify(dom1)
    );
    T.check(
      'svg_labels_fit_without_clipping_or_overlap',
      boxes1.clipped.length === 0 && boxes1.texts.length >= 8 && !!dom1 && dom1.overlaps.length === 0,
      JSON.stringify({clipped: boxes1.clipped, overlaps: dom1 && dom1.overlaps})
    );
    T.check(
      'caption_mentions_a280_a260_and_measured',
      !!dom1 && /A280\/A260/.test(dom1.captionText) && /\bmeasured\b/i.test(dom1.captionText),
      dom1 ? dom1.captionText : 'no dom1'
    );

    // 2. Also verify QC Passport mode on Figure step exports via normal #saveSvg (H(p).exportSvg())
    await h.step('figure');
    await h.wait(250);
    const modeChk = p.locator('#o-qcPassport');
    if (await modeChk.count()) {
      await modeChk.check();
      await h.wait(250);
    }
    const modeSvg = await h.exportSvg();
    const modeBoxes = await h.svgBoxes(modeSvg);
    T.check(
      'passport_mode_exports_via_normal_save_svg',
      /Purification QC Passport/.test(modeSvg) && modeBoxes.clipped.length === 0,
      JSON.stringify({clipped: modeBoxes.clipped})
    );

    // 3. Remove the NanoDrop reading and verify 'No data' placeholder and 'absent' caption
    await h.step('final');
    await h.wait(250);
    await p.click('#ndList .ndr [data-nddel]');
    await h.wait(300);

    const svgNoNd = await exportPassportBtn();
    const boxesNoNd = svgNoNd ? await h.svgBoxes(svgNoNd) : {clipped: ['missing']};
    const domNoNd = svgNoNd ? await inspectSvgDom(svgNoNd) : null;

    T.check(
      'removed_nd_shows_no_data_and_absent_caption',
      boxesNoNd.clipped.length === 0 &&
        !!domNoNd &&
        !domNoNd.ndPlot &&
        /No data/i.test(domNoNd.ndText) &&
        /NanoDrop[^.;]*(absent|No data)/i.test(domNoNd.captionText),
      JSON.stringify(domNoNd && {ndText: domNoNd.ndText, captionText: domNoNd.captionText, clipped: boxesNoNd.clipped})
    );
  });

  T.check('no_page_errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
