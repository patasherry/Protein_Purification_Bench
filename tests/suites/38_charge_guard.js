// 38 charge guard: Isoelectric precipitation risk and ion-exchange resin charge compatibility guard.
// Asserts that buffer pH near protein pI flags precipitation risk,
// and opposite-charge buffer pH flags anion/cation exchange non-binding.
// Also asserts that clicking the pI in the Protein table displays the net charge curve Z(pH).

const { open, H, suite, src } = require('../lib/harness');

(async () => {
  const T = suite('38_charge_guard');

  await T.t('isoelectric_precipitation_and_iex_charge_guard', async () => {
    const { p, errs, close } = await open({ width: 1400, height: 1000 });
    const h = H(p);
    try {
      await h.newProject('Charge Guard Test');

      // Set opt.protSeq to a sequence with theoretical pI 6.5 (MHERA: Bjellqvist pI = 6.50)
      const protInput = p.locator('#protSeq');
      await protInput.fill('MHERA');
      await protInput.dispatchEvent('input');
      await protInput.dispatchEvent('change');
      await p.waitForTimeout(200);

      // Verify the theoretical pI 6.5 is displayed in the Protein table
      const piCell = p.locator('#protTable .prot-pi-cell, #protTable tr td:nth-child(4)').first();
      const piText = (await piCell.textContent().catch(() => '')) || '';
      T.check('protein-pi-6.5', /6\.5/i.test(piText), `Expected pI ~6.5 in protein table, got "${piText}"`);

      // Load a run and configure column 'HiTrap Q HP' and bufA containing 'pH 6.4'
      await h.addRun(src('his'));
      const card = p.locator('.trace.run.sel').first();

      // Ensure run conditions details are open
      const runcond = card.locator('details.runcond');
      await runcond.evaluate(d => { d.open = true; });

      const colInput = card.locator('[data-k="mCol"]');
      await colInput.fill('HiTrap Q HP');
      await colInput.dispatchEvent('change');

      const bufAInput = card.locator('[data-k="mBufA"]');
      await bufAInput.fill('50 mM Tris pH 6.4');
      await bufAInput.dispatchEvent('input');
      await bufAInput.dispatchEvent('change');
      await p.waitForTimeout(300);

      // Assert that the near-pI precipitation warning badge is rendered in the run conditions view
      const badgeA = card.locator('[data-charge-badge="mBufA"], .charge-badge, .charge-precip-warn').first();
      const badgeAVisible = await badgeA.isVisible().catch(() => false);
      const badgeAText = badgeAVisible ? (await badgeA.textContent().catch(() => '')).trim() : '';
      T.check(
        'near-pi-precipitation-warning-rendered',
        badgeAVisible && /precipitation/i.test(badgeAText) && /near[- ]pI/i.test(badgeAText),
        `Expected near-pI precipitation warning badge visible, got visible=${badgeAVisible}, text="${badgeAText}"`
      );

      // Set bufA to 'pH 5.5'
      await bufAInput.fill('50 mM MES pH 5.5');
      await bufAInput.dispatchEvent('input');
      await bufAInput.dispatchEvent('change');
      await p.waitForTimeout(300);

      // Assert that setting bufA to 'pH 5.5' renders the anion-exchange opposite-charge non-binding warning
      const badgeAVisible2 = await badgeA.isVisible().catch(() => false);
      const badgeAText2 = badgeAVisible2 ? (await badgeA.textContent().catch(() => '')).trim() : '';
      T.check(
        'anion-exchange-opposite-charge-non-binding-warning',
        badgeAVisible2 && /anion/i.test(badgeAText2) && /opposite.*charge|non[- ]binding/i.test(badgeAText2),
        `Expected anion-exchange opposite-charge non-binding warning, got visible=${badgeAVisible2}, text="${badgeAText2}"`
      );

      // Setting bufA to compatible pH 8.0 should clear the warning
      await bufAInput.fill('50 mM Tris pH 8.0');
      await bufAInput.dispatchEvent('input');
      await bufAInput.dispatchEvent('change');
      await p.waitForTimeout(200);
      const badgeAHidden = await badgeA.isHidden().catch(() => true);
      T.check('compatible-ph-no-warning', badgeAHidden, 'Expected badge to be hidden for compatible pH 8.0');

      // Assert that clicking the pI in the Protein table displays the net charge curve Z(pH)
      await h.step('construct');
      const piClickCell = p.locator('.prot-pi-cell').first();
      if (await piClickCell.count() > 0) {
        await piClickCell.click();
        await p.waitForTimeout(300);
        const chargeCard = p.locator('#protChargeCard');
        const curveVis = await chargeCard.isVisible().catch(() => false);
        const svgCount = await chargeCard.locator('svg').count().catch(() => 0);
        T.check(
          'charge-curve-displayed-on-pi-click',
          curveVis && svgCount > 0,
          `Expected net charge curve Z(pH) displayed on clicking pI, got vis=${curveVis}, svgCount=${svgCount}`
        );
      } else {
        T.check('charge-curve-displayed-on-pi-click', false, 'Missing .prot-pi-cell in protein table');
      }
    } finally {
      await close();
    }
  });

  process.exit(T.done() ? 0 : 1);
})();
