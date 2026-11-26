// 1742_qc_passport_footer: QC Passport unlinked evidence footer (#1777, Part 3 of 3 of #1771).
// Drives the application strictly through UI controls, downloads, and svgBoxes().
const {open, H, suite, src, RES, path, fs, fits} = require('../lib/harness');

(async () => {
  const T = suite('1742_qc_passport_footer');
  const {p, errs, close} = await open(), h = H(p);

  const exportPassportBtn = async () => {
    if (!(await p.isVisible('#savePassportSvg'))) return '';
    const [dl] = await Promise.all([
      p.waitForEvent('download', {timeout: 15000}),
      p.click('#savePassportSvg')
    ]);
    const f = path.join(RES, 'passport-footer-' + Date.now() + '.svg');
    await dl.saveAs(f);
    return fs.readFileSync(f, 'utf8');
  };

  const inspectFooterDom = async svg => {
    const pg = await p.context().newPage();
    try {
      await pg.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:0">' + svg + '</body>');
      await pg.waitForSelector('svg', {timeout: 5000});
      return await pg.evaluate(() => {
        const foot = document.querySelector('#qcPassportUnlinkedFooter');
        const footBg = document.querySelector('#qcPassportUnlinkedFooter .passport-footer-bg');
        const rowCard = document.querySelector('.passport-row-card');
        const rowsText = [...document.querySelectorAll('.passport-row')].map(e => e.textContent).join(' ');
        const footStyle = footBg ? getComputedStyle(footBg) : null;
        const rowStyle = rowCard ? getComputedStyle(rowCard) : null;
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
        return {
          hasFooter: !!foot,
          footerText: foot ? foot.textContent.replace(/\s+/g, ' ').trim() : '',
          rowsText: rowsText.replace(/\s+/g, ' ').trim(),
          visuallyDistinct: !!(footStyle && rowStyle && (footStyle.fill !== rowStyle.fill || footStyle.strokeDasharray !== rowStyle.strokeDasharray)),
          overlaps
        };
      });
    } finally {
      await pg.close();
    }
  };

  await T.t('unlinked_evidence_footer_shown_only_when_unmatched', async () => {
    await h.newProject('QC Passport Footer');
    await h.addRun(src('his'));
    await h.suggest();
    await h.wait(300);

    const tlRun = (await h.timeline()).find(x => /^run:/.test(x.k));
    const rid = tlRun ? tlRun.k.slice(4) : '';
    T.check('setup.run_ready', !!rid, `rid=${rid}`);

    // Load 1 gel with 3 lanes: M (ladder), T4 (assigned to run), ExtraWash (intentionally unassigned)
    await p.setInputFiles('#gelFile', [src('gel')]);
    await h.wait(1500);
    const gelOpenBtn = p.locator('#ssGels [data-gelopen]').first();
    if (await gelOpenBtn.count()) {
      await gelOpenBtn.click();
      await h.wait(300);
    }
    await p.evaluate(() => { document.querySelectorAll('#panel details').forEach(d => { d.open = true; }); });
    await p.fill('#g-n', '3');
    await p.dispatchEvent('#g-n', 'input');
    await p.dispatchEvent('#g-n', 'change');
    await h.wait(200);
    await p.fill('#g-labels', 'M, T4, ExtraWash');
    await p.dispatchEvent('#g-labels', 'input');
    await p.dispatchEvent('#g-labels', 'change');
    await h.wait(350);
    await p.selectOption('#laneTable select[data-lane="1"]', rid);
    await p.selectOption('#laneTable select[data-lane="2"]', '');
    await h.wait(250);

    // Add 1 NanoDrop reading and leave it UNLINKED from the run
    await h.step('final');
    await h.wait(250);
    await p.click('#ndManual');
    await h.wait(200);
    await p.fill('#ndList .ndr [data-ndk="name"]', 'Unmatched Aliquot');
    await p.dispatchEvent('#ndList .ndr [data-ndk="name"]', 'change');
    await p.fill('#ndList .ndr [data-ndk="a280"]', '0.92');
    await p.dispatchEvent('#ndList .ndr [data-ndk="a280"]', 'change');
    await p.locator('#ndList .ndr details.nd-edit').evaluate(d => { d.open = true; });
    await p.selectOption('#ndList .ndr select[data-ndk="runId"]', '');
    await h.wait(300);

    // 1. Export SVG while NanoDrop and ExtraWash lane are unlinked
    const svgUnlinked = await exportPassportBtn();
    const boxesUnlinked = svgUnlinked ? await h.svgBoxes(svgUnlinked, '#qcPassportUnlinkedFooter') : {clipped: ['missing'], box: null};
    const domUnlinked = svgUnlinked ? await inspectFooterDom(svgUnlinked) : null;

    T.check(
      'footer_present_and_mentions_unlinked_nd',
      !!domUnlinked &&
        domUnlinked.hasFooter &&
        !!boxesUnlinked.box &&
        boxesUnlinked.box.w > 50 &&
        boxesUnlinked.box.h > 14 &&
        fits(boxesUnlinked.box, boxesUnlinked.root, 2) &&
        domUnlinked.visuallyDistinct &&
        /Unlinked evidence/i.test(domUnlinked.footerText) &&
        /Unmatched Aliquot/.test(domUnlinked.footerText),
      JSON.stringify({box: boxesUnlinked.box, dom: domUnlinked})
    );
    T.check(
      'unassigned_gel_lane_only_in_footer_and_no_clip',
      boxesUnlinked.clipped.length === 0 &&
        !!domUnlinked &&
        domUnlinked.overlaps.length === 0 &&
        /ExtraWash/.test(domUnlinked.footerText) &&
        !/ExtraWash/.test(domUnlinked.rowsText),
      JSON.stringify({clipped: boxesUnlinked.clipped, overlaps: domUnlinked && domUnlinked.overlaps, footer: domUnlinked && domUnlinked.footerText, rows: domUnlinked && domUnlinked.rowsText})
    );

    // 2. Link BOTH the NanoDrop reading and the ExtraWash lane to the run, then re-export and verify footer is absent
    await p.locator('#ndList .ndr details.nd-edit').evaluate(d => { d.open = true; });
    await p.selectOption('#ndList .ndr select[data-ndk="runId"]', rid);
    await h.wait(250);

    await h.step('run:' + rid);
    await h.wait(250);
    const gelOpen2 = p.locator('#ssGels [data-gelopen]').first();
    if (await gelOpen2.count()) {
      await gelOpen2.click();
      await h.wait(250);
    }
    await p.evaluate(() => { document.querySelectorAll('#panel details').forEach(d => { d.open = true; }); });
    await p.selectOption('#laneTable select[data-lane="2"]', rid);
    await h.wait(300);

    const svgLinked = await exportPassportBtn();
    const boxesLinked = svgLinked ? await h.svgBoxes(svgLinked, '#qcPassportUnlinkedFooter') : {clipped: ['missing'], box: {}};
    const domLinked = svgLinked ? await inspectFooterDom(svgLinked) : null;

    T.check(
      'footer_absent_when_all_evidence_linked',
      !!svgLinked &&
        boxesLinked.clipped.length === 0 &&
        boxesLinked.box === null &&
        !!domLinked &&
        !domLinked.hasFooter &&
        domLinked.overlaps.length === 0 &&
        !/Unlinked evidence/i.test(svgLinked),
      JSON.stringify({box: boxesLinked.box, dom: domLinked, clipped: boxesLinked.clipped})
    );
  });

  T.check('no_page_errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
