// 1740_qc_passport: QC Passport data model and row assembly (#1775, Part 1 of 3 of #1771).
// Drives the app strictly through its UI and DOM (never window.__HFB or window.__PPB).
const {open, H, suite, src} = require('../lib/harness');

(async () => {
  const T = suite('1740_qc_passport');
  const {p, errs, close} = await open(), h = H(p);

  const readPassport = () => p.evaluate(() => {
    const el = document.querySelector('#qcPassportData');
    if (!el || !el.textContent.trim()) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  });

  await T.t('row_assembly_and_unlinked_evidence', async () => {
    await h.newProject('QC Passport Model');
    await h.addRun(src('his'));
    await h.suggest();
    await h.wait(300);

    const tlRun = (await h.timeline()).find(x => /^run:/.test(x.k));
    const rid = tlRun ? tlRun.k.slice(4) : '';
    T.check('setup.run_created', !!rid, `rid=${rid}`);

    // Set explicit detector path on the run card through the UI
    await h.step('run:' + rid);
    const condDetails = p.locator(`#list .trace.run[data-id="${rid}"] details.runcond`);
    if (await condDetails.count()) {
      await condDetails.evaluate(d => { d.open = true; });
    }
    const pathInp = p.locator(`#list .trace.run[data-id="${rid}"] [data-k="path"]`);
    if (await pathInp.count()) {
      await pathInp.evaluate(el => {
        const m = el.closest('details');
        if (m) m.open = true;
      });
      await pathInp.fill('5');
      await pathInp.dispatchEvent('change');
      await h.wait(200);
    }

    // Attach 1 gel with 1 sample lane (M, T4) assigned to the IMAC run
    await p.setInputFiles('#gelFile', [src('gel')]);
    await h.wait(1500);
    const gelOpenBtn = p.locator('#ssGels [data-gelopen]').first();
    if (await gelOpenBtn.count()) {
      await gelOpenBtn.click();
      await h.wait(300);
    }
    await p.evaluate(() => {
      document.querySelectorAll('#panel details').forEach(d => { d.open = true; });
    });
    await p.fill('#g-n', '2');
    await p.dispatchEvent('#g-n', 'input');
    await p.dispatchEvent('#g-n', 'change');
    await h.wait(200);
    await p.fill('#g-labels', 'M, T4');
    await p.dispatchEvent('#g-labels', 'input');
    await p.dispatchEvent('#g-labels', 'change');
    await h.wait(350);

    // Add 1 NanoDrop reading and link it to the run through the UI
    await h.step('final');
    await h.wait(250);
    await p.click('#ndManual');
    await h.wait(200);
    await p.fill('#ndList .ndr [data-ndk="name"]', 'IMAC Pool');
    await p.dispatchEvent('#ndList .ndr [data-ndk="name"]', 'change');
    await p.fill('#ndList .ndr [data-ndk="a280"]', '1.25');
    await p.dispatchEvent('#ndList .ndr [data-ndk="a280"]', 'change');
    await p.fill('#ndList .ndr [data-ndk="r280"]', '0.56');
    await p.dispatchEvent('#ndList .ndr [data-ndk="r280"]', 'change');
    await p.locator('#ndList .ndr details.nd-edit').evaluate(d => { d.open = true; });
    await p.selectOption('#ndList .ndr select[data-ndk="runId"]', rid);
    await h.wait(300);

    const linked = await readPassport();
    T.check(
      'passport.single_row_with_run_nd_and_gel',
      !!linked &&
        Array.isArray(linked.rows) &&
        linked.rows.length === 1 &&
        linked.rows[0].runId === rid &&
        linked.rows[0].chromatogram &&
        linked.rows[0].chromatogram.source === 'shade' &&
        linked.rows[0].chromatogram.pool &&
        linked.rows[0].chromatogram.points.length > 0 &&
        linked.rows[0].detector &&
        Number(linked.rows[0].detector.effPathMm) === 5 &&
        linked.rows[0].detector.pathAssumed === false &&
        linked.rows[0].nanodrop &&
        linked.rows[0].nanodrop.samples.length === 1 &&
        linked.rows[0].nanodrop.samples[0].a280 === 1.25 &&
        linked.rows[0].nanodrop.samples[0].r260_280 === 0.56 &&
        Array.isArray(linked.rows[0].gelLanes) &&
        linked.rows[0].gelLanes.length === 1 &&
        linked.rows[0].gelLanes[0].label === 'T4',
      JSON.stringify(linked)
    );
    T.check(
      'passport.unlinked_lists_empty_when_linked',
      !!linked &&
        Array.isArray(linked.unlinkedNd) &&
        linked.unlinkedNd.length === 0 &&
        Array.isArray(linked.unlinkedGelLanes) &&
        linked.unlinkedGelLanes.length === 0,
      JSON.stringify(linked && {unlinkedNd: linked.unlinkedNd, unlinkedGelLanes: linked.unlinkedGelLanes})
    );

    // Unlink the NanoDrop reading from the run via UI
    await p.locator('#ndList .ndr details.nd-edit').evaluate(d => { d.open = true; });
    await p.selectOption('#ndList .ndr select[data-ndk="runId"]', '');
    await h.wait(300);

    const afterNdUnlink = await readPassport();
    T.check(
      'passport.unlinked_nd_moves_to_unlinked_list',
      !!afterNdUnlink &&
        afterNdUnlink.rows.length === 1 &&
        afterNdUnlink.rows[0].nanodrop === null &&
        afterNdUnlink.unlinkedNd.length === 1 &&
        afterNdUnlink.unlinkedNd[0].name === 'IMAC Pool' &&
        afterNdUnlink.unlinkedNd[0].a280 === 1.25 &&
        afterNdUnlink.unlinkedGelLanes.length === 0,
      JSON.stringify(afterNdUnlink)
    );

    // Unlink the gel lane via UI and verify run.integ fallback when shade is cleared
    await h.step('run:' + rid);
    await h.wait(250);
    const shadeInp = p.locator(`#list .trace.run[data-id="${rid}"] [data-k="shade"]`);
    await shadeInp.fill('');
    await shadeInp.dispatchEvent('input');
    await shadeInp.dispatchEvent('change');
    await h.wait(200);
    await p.click('#intAuto');
    await h.wait(400);

    const gelOpen2 = p.locator('#ssGels [data-gelopen]').first();
    if (await gelOpen2.count()) {
      await gelOpen2.click();
      await h.wait(250);
    }
    await p.evaluate(() => {
      document.querySelectorAll('#panel details').forEach(d => { d.open = true; });
    });
    await p.selectOption('#laneTable select[data-lane="1"]', '');
    await h.wait(250);

    const afterGelUnlink = await readPassport();
    T.check(
      'passport.integ_fallback_and_unlinked_gel_lane',
      !!afterGelUnlink &&
        afterGelUnlink.rows.length === 1 &&
        afterGelUnlink.rows[0].chromatogram.source === 'integ' &&
        afterGelUnlink.rows[0].chromatogram.integ.length >= 1 &&
        afterGelUnlink.rows[0].gelLanes.length === 0 &&
        afterGelUnlink.unlinkedGelLanes.length === 1 &&
        afterGelUnlink.unlinkedGelLanes[0].label === 'T4',
      JSON.stringify(afterGelUnlink)
    );
  });

  T.check('no_page_errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
