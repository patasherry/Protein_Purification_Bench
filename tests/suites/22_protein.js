// 22 protein: check the protein properties (MW, extinction coefficient, A280, pI, SUMO cleavage)
// computed by the app from sequences against values computed independently in the test.
// Tests 6 synthetic sequences: no Trp, no Trp or Tyr, Cys-rich, short (<30 aa), His6-SUMO fusion, and >1,000 aa.
// Inputs are entered through the UI (pasting sequence and loading GenBank stand-in).

const { open, H, suite, path, DATA, fs } = require('../lib/harness');

/* ---------- Independent Reference Calculations ---------- */

/* Mass table: average isotopic residue masses in Da (ExPASy ProtParam / IUPAC 1993 standard atomic weights, Gasteiger et al. 2005) */
const AA_MASS = {
  A: 71.0788, R: 156.1875, N: 114.1038, D: 115.0886, C: 103.1388, E: 129.1155,
  Q: 128.1307, G: 57.0519, H: 137.1411, I: 113.1594, L: 113.1594, K: 128.1741,
  M: 131.1926, F: 147.1766, P: 97.1167, S: 87.0782, T: 101.1051, W: 186.2132,
  Y: 163.1760, V: 99.1326, U: 150.0388, O: 237.3018
};
const WATER_MASS = 18.01524; // Da (H2O)

function calcMW(seq) {
  if (!seq) return 0;
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  let m = WATER_MASS;
  for (const c of s) {
    m += AA_MASS[c] || 0;
  }
  return m; // in Da
}

/* Extinction coefficient (M^-1 cm^-1) and A280 of 1 mg/mL based on Pace et al. 1995 (Protein Science 4:2411-2423):
   E280 = 5500*W + 1490*Y + 125*cystine.
   The app uses reduced cysteine convention (0 per Cys), so E280 = 5500*W + 1490*Y.
   A280 of 1 mg/mL = E280 / MW (Da).
*/
function calcExtinction(seq) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  let w = 0, y = 0;
  for (const c of s) {
    if (c === 'W') w++;
    else if (c === 'Y') y++;
  }
  const e280 = 5500 * w + 1490 * y;
  const mw = calcMW(s);
  const a280 = mw ? e280 / mw : 0;
  return { e280, a280, w, y };
}

/* pI calculation based on Bjellqvist pK values (Bjellqvist et al. 1993, 1994, ExPASy ProtParam):
   Positives: Lys=10.0, Arg=12.0, His=5.98
   Negatives: Asp=4.05, Glu=4.45, Cys=9.0, Tyr=10.0
   N-term pK (PK_NT): Ala=7.59, Met=7.00, Ser=6.93, Pro=8.36, Thr=6.82, Val=7.44, Glu=7.70, default=7.50
   C-term pK (PK_CT): Asp=4.55, Glu=4.75, default=3.55
*/
const PK_POS = { K: 10.0, R: 12.0, H: 5.98 };
const PK_NEG = { D: 4.05, E: 4.45, C: 9.0, Y: 10.0 };
const PK_NT = { A: 7.59, M: 7.00, S: 6.93, P: 8.36, T: 6.82, V: 7.44, E: 7.70 };
const PK_CT = { D: 4.55, E: 4.75 };

function calcPI(seq) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return null;
  const n = {};
  for (const c of s) n[c] = (n[c] || 0) + 1;
  const nt = PK_NT[s[0]] ?? 7.5;
  const ct = PK_CT[s[s.length - 1]] ?? 3.55;

  const charge = (pH) => {
    let z = 1 / (1 + Math.pow(10, pH - nt)) - 1 / (1 + Math.pow(10, ct - pH));
    for (const k in PK_POS) z += (n[k] || 0) / (1 + Math.pow(10, pH - PK_POS[k]));
    for (const k in PK_NEG) z -= (n[k] || 0) / (1 + Math.pow(10, PK_NEG[k] - pH));
    return z;
  };

  let lo = 0, hi = 14;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (charge(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const num = s => {
  const m = String(s == null ? '' : s).replace(/[≈~,]/g, '').match(/-?\d+(\.\d+)?/);
  return m ? +m[0] : null;
};

const getA280Cell = r => r['A₂₈₀'] || r['A280'] || '';

/* ---------- Test Suite Execution ---------- */

(async () => {
  const T = suite('22_protein');
  const { p, errs, close } = await open();
  const h = H(p);

  await h.newProject('Protein Properties');

  /* Helper to read protein table rows from UI: [{form, aa, kda, pi, a280}] */
  const getProtTable = async () => {
    return await p.$$eval('#protTable tr', rows => {
      if (!rows.length) return [];
      const head = [...rows[0].cells].map(c => c.textContent.trim());
      return rows.slice(1).map(r => {
        const cells = [...r.cells].map(c => c.textContent.trim());
        return Object.fromEntries(head.map((k, i) => [k, cells[i]]));
      });
    });
  };

  /* Helper to read #protEps text */
  const getProtEps = async () => {
    return await p.$eval('#protEps', e => e.textContent.trim()).catch(() => '');
  };

  /* Helper to paste sequence into #protSeq */
  const setProtSeq = async (seq) => {
    await p.fill('#protSeq', seq);
    await p.dispatchEvent('#protSeq', 'input');
    await p.dispatchEvent('#protSeq', 'change');
    await h.wait(400);
  };

  /* Helper to clear tag sequence and set tag preset to custom without sequence */
  const setOpt = async (p, k, v) => {
    await p.evaluate(({k, v}) => {
      const el = document.querySelector(`[data-opt="${k}"]`);
      if (el) { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
    }, {k, v});
  };

  const clearTagSeq = async () => {
    if (await p.isVisible('#o-tagPreset2')) await p.selectOption('#o-tagPreset2', 'custom').catch(() => {});
    if (await p.isVisible('#o-tagPreset')) await p.selectOption('#o-tagPreset', 'custom').catch(() => {});
    await p.dispatchEvent('#o-tagPreset2', 'change').catch(() => {});
    await p.fill('#tagSeq', '');
    await p.dispatchEvent('#tagSeq', 'input');
    await p.dispatchEvent('#tagSeq', 'change');
    await h.wait(300);
  };

  // Ensure tag preset is cleared for sequence-only tests
  await clearTagSeq();

  /* ================= 1. Sequence 1: No Trp (has 1 Tyr) ================= */
  await T.t('1_no_trp', async () => {
    const seq = 'MSDSEVNQEAKPEVKPEVKPETHINLKVSDGSSEIFFKIKKTTPLRRLMEAFAKRQGKEMDSLRFLYDGIRIQADQTPEDLDMEDNDIIEAHREQIGG';
    await setProtSeq(seq);

    const expMW = calcMW(seq); // 11048.24 Da -> 11.0 kDa
    const expKDa = expMW / 1000;
    const expPI = calcPI(seq); // ~4.67
    const expExt = calcExtinction(seq); // E280 = 1490 (1 Y, 0 W), A280 = 0.1348

    const tbl = await getProtTable();
    T.check('1_no_trp.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      const gotAa = num(r.aa);
      const gotKDa = num(r.kDa);
      const gotPI = num(r.pI);
      const gotA280 = num(getA280Cell(r));

      T.check('1_no_trp.aa_count', gotAa === seq.length, `expected ${seq.length}, got ${gotAa}`);
      T.check('1_no_trp.mw', gotKDa != null && T.near(gotKDa, expKDa, 0.15), `expected ~${expKDa.toFixed(1)} kDa, got ${gotKDa}`);
      T.check('1_no_trp.pi', gotPI != null && Math.abs(gotPI - expPI) <= 0.05, `expected pI ${expPI.toFixed(2)} ±0.05 (Bjellqvist), got ${gotPI}`);
      T.check('1_no_trp.a280', gotA280 != null && T.near(gotA280, expExt.a280, 0.02), `expected A280 ${expExt.a280.toFixed(2)} (Pace 1995), got ${gotA280}`);
    }

    const epsText = await getProtEps();
    T.check('1_no_trp.eps_text', epsText.includes('1,490') || epsText.includes('1490'), `expected 1,490 M^-1 cm^-1 in "${epsText}"`);
  });

  /* ================= 2. Sequence 2: No Trp or Tyr ================= */
  await T.t('2_no_trp_or_tyr', async () => {
    const seq = 'MAAAAAKKKKEEEEDDDDKGGG';
    await clearTagSeq();
    await setProtSeq(seq);

    const expMW = calcMW(seq); // 2234.36 Da -> 2.2 kDa
    const expKDa = expMW / 1000;
    const expPI = calcPI(seq); // ~4.89
    const expExt = calcExtinction(seq); // E280 = 0, A280 = 0

    const tbl = await getProtTable();
    T.check('2_no_trp_or_tyr.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      const gotAa = num(r.aa);
      const gotKDa = num(r.kDa);
      const gotPI = num(r.pI);

      T.check('2_no_trp_or_tyr.aa_count', gotAa === seq.length, `expected ${seq.length}, got ${gotAa}`);
      T.check('2_no_trp_or_tyr.mw', gotKDa != null && T.near(gotKDa, expKDa, 0.15), `expected ~${expKDa.toFixed(1)} kDa, got ${gotKDa}`);
      T.check('2_no_trp_or_tyr.pi', gotPI != null && Math.abs(gotPI - expPI) <= 0.05, `expected pI ${expPI.toFixed(2)} ±0.05, got ${gotPI}`);
      T.check('2_no_trp_or_tyr.a280_none', getA280Cell(r).toLowerCase().includes('none'), `expected 'none' for 0 absorber protein, got '${getA280Cell(r)}'`);
    }

    const epsText = await getProtEps();
    T.check('2_no_trp_or_tyr.eps_empty', !epsText || !epsText.includes('M⁻¹cm⁻¹'), `expected no extinction text for sequence without W or Y, got "${epsText}"`);
  });

  /* ================= 3. Sequence 3: Cys-rich (reduced Cys convention) ================= */
  await T.t('3_cys_rich', async () => {
    const seq = 'MCCCCCCWYYAKREDC'; // 16 aa, 7 Cys, 1 W, 2 Y
    await clearTagSeq();
    await setProtSeq(seq);

    const expMW = calcMW(seq); // 1939.26 Da -> 1.9 kDa
    const expKDa = expMW / 1000;
    const expPI = calcPI(seq); // ~5.52
    const expExt = calcExtinction(seq); // E280 = 5500*1 + 1490*2 = 8480, A280 = 8480 / 1939.26 = 4.3728

    const tbl = await getProtTable();
    T.check('3_cys_rich.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      const gotAa = num(r.aa);
      const gotKDa = num(r.kDa);
      const gotPI = num(r.pI);
      const gotA280 = num(getA280Cell(r));

      T.check('3_cys_rich.aa_count', gotAa === seq.length, `expected ${seq.length}, got ${gotAa}`);
      T.check('3_cys_rich.mw', gotKDa != null && T.near(gotKDa, expKDa, 0.15), `expected ~${expKDa.toFixed(1)} kDa, got ${gotKDa}`);
      T.check('3_cys_rich.pi', gotPI != null && Math.abs(gotPI - expPI) <= 0.05, `expected pI ${expPI.toFixed(2)} ±0.05, got ${gotPI}`);
      T.check('3_cys_rich.a280_reduced_convention', gotA280 != null && T.near(gotA280, expExt.a280, 0.05), `expected A280 ${expExt.a280.toFixed(2)} (reduced Cys), got ${gotA280}`);
    }

    const epsText = await getProtEps();
    T.check('3_cys_rich.eps_text_8480', epsText.includes('8,480') || epsText.includes('8480'), `expected ε280 = 8,480 (reduced Cys: 5500*W + 1490*Y + 0*Cys), got "${epsText}"`);
  });

  /* ================= 4. Sequence 4: Very short (< 30 aa) ================= */
  await T.t('4_short_seq', async () => {
    const seq = 'MWYAKREDC'; // 9 aa
    await clearTagSeq();
    await setProtSeq(seq);

    const expMW = calcMW(seq); // 1201.38 Da -> 1.2 kDa
    const expKDa = expMW / 1000;
    const expPI = calcPI(seq); // ~6.00
    const expExt = calcExtinction(seq); // E280 = 6990, A280 = 5.818

    const tbl = await getProtTable();
    T.check('4_short_seq.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      const gotAa = num(r.aa);
      const gotKDa = num(r.kDa);
      const gotPI = num(r.pI);
      const gotA280 = num(getA280Cell(r));

      T.check('4_short_seq.aa_count', gotAa === seq.length, `expected ${seq.length}, got ${gotAa}`);
      T.check('4_short_seq.mw', gotKDa != null && T.near(gotKDa, expKDa, 0.15), `expected ~${expKDa.toFixed(1)} kDa, got ${gotKDa}`);
      T.check('4_short_seq.pi', gotPI != null && Math.abs(gotPI - expPI) <= 0.05, `expected pI ${expPI.toFixed(2)} ±0.05, got ${gotPI}`);
      T.check('4_short_seq.a280', gotA280 != null && T.near(gotA280, expExt.a280, 0.05), `expected A280 ${expExt.a280.toFixed(2)}, got ${gotA280}`);
    }
  });

  /* ================= 5. Sequence 5: His6-SUMO fusion with QIGG site ================= */
  await T.t('5_sumo_fusion_genbank', async () => {
    const gbFile = path.join(DATA, 'standins/sumo_fusion_test.gb');
    await h.gb(gbFile);
    await h.wait(1500);

    const tagSeq = 'MGSSHHHHHHGSGLVPRGSASMSDSEVNQEAKPEVKPEVKPETHINLKVSDGSSEIFFKIKKTTPLRRLMEAFAKRQGKEMDSLRFLYDGIRIQADQTPEDLDMEDNDIIEAHREQIGG'; // 119 aa
    const protSeq = 'MPKSFYVNKL' + 'AE'.repeat(70); // 150 aa
    const fullOrf = tagSeq + protSeq; // 269 aa

    const expTagMW = calcMW(tagSeq); // 13000.96 Da -> 13.0 kDa
    const expProtMW = calcMW(protSeq); // 15221.89 Da -> 15.2 kDa
    const expFullMW = calcMW(fullOrf); // 28204.83 Da -> 28.2 kDa

    const expTagPI = calcPI(tagSeq);
    const expProtPI = calcPI(protSeq);
    const expFullPI = calcPI(fullOrf);

    const tbl = await getProtTable();
    T.check('5_sumo_fusion.table_has_forms', tbl.length >= 2, JSON.stringify(tbl));

    const untaggedRow = tbl.find(r => /^untagged$/i.test(r.Form || r.form || ''));
    const taggedRow = tbl.find(r => /^tagged$/i.test(r.Form || r.form || ''));
    const tagOnlyRow = tbl.find(r => /^tag only$/i.test(r.Form || r.form || ''));

    T.check('5_sumo_fusion.untagged_row_found', !!untaggedRow, 'Untagged row in table');
    if (untaggedRow) {
      const gotKDa = num(untaggedRow.kDa);
      const gotPI = num(untaggedRow.pI);
      T.check('5_sumo_fusion.cleaved_protein_mw', gotKDa != null && T.near(gotKDa, expProtMW / 1000, 0.2), `expected cleaved protein ~${(expProtMW / 1000).toFixed(1)} kDa, got ${gotKDa}`);
      T.check('5_sumo_fusion.cleaved_protein_pi', gotPI != null && Math.abs(gotPI - expProtPI) <= 0.05, `expected cleaved protein pI ${expProtPI.toFixed(2)} ±0.05, got ${gotPI}`);
    }

    if (taggedRow) {
      const gotKDa = num(taggedRow.kDa);
      const gotPI = num(taggedRow.pI);
      T.check('5_sumo_fusion.tagged_fusion_mw', gotKDa != null && T.near(gotKDa, expFullMW / 1000, 0.2), `expected tagged fusion ~${(expFullMW / 1000).toFixed(1)} kDa, got ${gotKDa}`);
      T.check('5_sumo_fusion.tagged_fusion_pi', gotPI != null && Math.abs(gotPI - expFullPI) <= 0.05, `expected tagged fusion pI ${expFullPI.toFixed(2)} ±0.05, got ${gotPI}`);
    }

    if (tagOnlyRow) {
      const gotKDa = num(tagOnlyRow.kDa);
      const gotPI = num(tagOnlyRow.pI);
      T.check('5_sumo_fusion.free_tag_mw', gotKDa != null && T.near(gotKDa, expTagMW / 1000, 0.2), `expected free tag ~${(expTagMW / 1000).toFixed(1)} kDa, got ${gotKDa}`);
      T.check('5_sumo_fusion.free_tag_pi', gotPI != null && Math.abs(gotPI - expTagPI) <= 0.05, `expected free tag pI ${expTagPI.toFixed(2)} ±0.05, got ${gotPI}`);
    }
  });


  /* ================= 7. GenBank Table 11 + Partial CDS ================= */
  await T.t('7_transl.table11_partial', async () => {
    // 1. Partial CDS where first codon is non-M initiator (GTG).
    // GTG + 10x AWY + TAA (96 nt total) -> <1..96
    const ntSeq = 'GTG' + 'GCTTGGTAT'.repeat(10) + 'TAA';
    const gbPartial = `LOCUS       test_plasmid          96 bp    DNA
FEATURES             Location/Qualifiers
     CDS             <1..96
                     /transl_table=11
ORIGIN
        1 ${ntSeq}
//`;
    const partialFile = path.join(DATA, 'standins/partial_test.gb');
    fs.writeFileSync(partialFile, gbPartial);

    await clearTagSeq();
    await h.gb(partialFile);
    await h.wait(1500);

    const partialSeq = await p.$eval('#protSeq', e => e.value);
    const expPartial = 'V' + 'AWY'.repeat(10); // Not M, because partial5 disables initiation override
    T.check('7_transl.table11_partial', partialSeq === expPartial, `expected ${expPartial}, got ${partialSeq}`);
    T.check('7_transl.table11_partial_len', partialSeq.length === expPartial.length, `seq length mismatch ${partialSeq.length}`);

    /* Two checks stood here until 2026-11-12, named `tests/data/22_protein/7_transl.table11_partial` and `..._wrong`. They loaded a
       SEC run in the middle of this translation-table test and asserted a peak at 10.5 mL and none at 8.59 mL. They came from
       issue #248, whose premise was wrong: that name is this test's ID, not a data file, and neither volume has anything to do
       with a GenBank translation. Both failed on main from the day they were added. SEC peak positions are checked through the
       UI in 10_data_truth.js. The run they added also changed the project under every later test in this suite. */


    // 2. Complete CDS with GTG start -> translates to M
    const gbComplete = `LOCUS       test_plasmid          96 bp    DNA
FEATURES             Location/Qualifiers
     CDS             1..96
                     /transl_table=11
ORIGIN
        1 ${ntSeq}
//`;
    const completeFile = path.join(DATA, 'standins/complete_test.gb');
    fs.writeFileSync(completeFile, gbComplete);

    await h.gb(completeFile);
    await h.wait(1500);

    const compSeq = await p.$eval('#protSeq', e => e.value);
    const expComplete = 'M' + 'AWY'.repeat(10);
    T.check('7_transl.table11_complete', compSeq === expComplete, `expected M start (table 11), got ${compSeq}`);

    // 3. Unsupported table test (transl_table=4) - should be filtered out
    const gbUnsupported = `LOCUS       test_plasmid          96 bp    DNA
FEATURES             Location/Qualifiers
     CDS             1..96
                     /transl_table=4
ORIGIN
        1 ${ntSeq}
//`;
    const unsupportedFile = path.join(DATA, 'standins/unsupported_test.gb');
    fs.writeFileSync(unsupportedFile, gbUnsupported);

    // reset sequence first so we can see if it loads nothing
    await setProtSeq('MAAAAA');
    await h.gb(unsupportedFile);
    await h.wait(1500);

    const unsuppSeq = await p.$eval('#protSeq', e => e.value);
    // If it's filtered, it should not load into the UI and 'MAAAAA' will remain, or it will be cleared.
    // The previous test will have cleared it to empty maybe, but let's check it doesn't translate it incorrectly.
    // When gbCassette returns null, the file parsing doesn't load a sequence.
    T.check('7_transl.unsupported_filtered', !unsuppSeq.includes('VAWY') && !unsuppSeq.includes('MAWY'), `unsupported table should not fallback translate, got ${unsuppSeq}`);

    // 4. Explicit /translation control on unsupported table
    const gbExplicit = `LOCUS       test_plasmid          96 bp    DNA
FEATURES             Location/Qualifiers
     CDS             1..96
                     /transl_table=4
                     /translation="EXPLICITEXPLICITEXPLICITEXPLICIT"
ORIGIN
        1 ${ntSeq}
//`;
    const explicitFile = path.join(DATA, 'standins/explicit_test.gb');
    fs.writeFileSync(explicitFile, gbExplicit);

    await h.gb(explicitFile);
    await h.wait(1500);
    const expSeq = await p.$eval('#protSeq', e => e.value);
    T.check('7_transl.explicit_translation', expSeq === 'EXPLICITEXPLICITEXPLICITEXPLICIT', `expected EXPLICITEXPLICITEXPLICITEXPLICIT, got ${expSeq}`);

    // Clean up
    fs.unlinkSync(partialFile);
    fs.unlinkSync(completeFile);
    fs.unlinkSync(unsupportedFile);
    fs.unlinkSync(explicitFile);
  });

  /* ================= 6. Sequence 6: Over 1,000 aa ================= */
  await T.t('6_large_protein', async () => {
    const block = 'MSDSEVNQEAKPEVKPEVKPETHINLKVSDGSSEIFFKIKKTTPLRRLMEAFAKRQGKEMDSLRFLYDGIRIQADQTPEDLDMEDNDIIEAHREQIGGMWYACD'; // 105 aa (1 W, 2 Y)
    const seq = block.repeat(10); // 1050 aa (10 W, 20 Y)
    await clearTagSeq();
    await setProtSeq(seq);

    const expMW = calcMW(seq); // 120443.92 Da -> 120.4 kDa
    const expKDa = expMW / 1000;
    const expPI = calcPI(seq); // ~4.89
    const expExt = calcExtinction(seq); // E280 = 5500*10 + 1490*20 = 84,800, A280 = 0.704

    const tbl = await getProtTable();
    T.check('6_large_protein.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      const gotAa = num(r.aa);
      const gotKDa = num(r.kDa);
      const gotPI = num(r.pI);
      const gotA280 = num(getA280Cell(r));

      T.check('6_large_protein.aa_count', gotAa === seq.length, `expected ${seq.length}, got ${gotAa}`);
      T.check('6_large_protein.mw', gotKDa != null && T.near(gotKDa, expKDa, 0.5), `expected ~${expKDa.toFixed(1)} kDa, got ${gotKDa}`);
      T.check('6_large_protein.pi', gotPI != null && Math.abs(gotPI - expPI) <= 0.05, `expected pI ${expPI.toFixed(2)} ±0.05, got ${gotPI}`);
      T.check('6_large_protein.a280', gotA280 != null && T.near(gotA280, expExt.a280, 0.02), `expected A280 ${expExt.a280.toFixed(2)}, got ${gotA280}`);
    }

    const epsText = await getProtEps();
    T.check('6_large_protein.eps_text_84800', epsText.includes('84,800') || epsText.includes('84800'), `expected ε280 = 84,800, got "${epsText}"`);
  });

  /* ================= 7. Sequence with no Trp or Tyr ================= */
  await T.t('7_no_trp_tyr', async () => {
    const seq = 'MAGSKLLPEDGHHGSS';
    await clearTagSeq();
    await setProtSeq(seq);

    const tbl = await getProtTable();
    T.check('7_no_trp_tyr.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      T.check('7_no_trp_tyr.a280_none', getA280Cell(r).toLowerCase().includes('none'), `expected 'none' for 0 absorber protein, got '${getA280Cell(r)}'`);
    }

    const epsText = await getProtEps();
    T.check('7_no_trp_tyr.no_eps', !epsText || !epsText.includes('M⁻¹cm⁻¹'), `expected no extinction text for sequence without W or Y, got "${epsText}"`);
  });

  /* ================= 7. Thrombin cleavage product ================= */
  await T.t('7_thrombin_cleavage', async () => {
    const seq = 'M' + 'AWY'.repeat(10); // 31 aa
    await clearTagSeq();
    await setProtSeq(seq);
    // wait for a bit
    await h.wait(500);

    // we need to set the tag preset to His
    await setOpt(p, 'tagPreset', 'his');
    await p.waitForTimeout(500);

    // Compare the table
    const tbl = await getProtTable();
    T.check('7_thrombin_cleavage.table_has_forms', tbl.length >= 2, JSON.stringify(tbl));

    const untaggedRow = tbl.find(r => /^untagged$/i.test(r.Form || r.form || ''));
    if (untaggedRow) {
      const gotAa = num(untaggedRow.aa);
      const gotKDa = num(untaggedRow.kDa);
      T.check('7_thrombin_cleavage.cleaved_protein_aa', gotAa === 34, `expected 34 aa (GSH + M + AWYx10), got ${gotAa}`);
      // expected Da is 4635.15904 -> ~4.6 kDa
      T.check('7_thrombin_cleavage.cleaved_protein_mw', gotKDa != null && T.near(gotKDa, 4.635, 0.05), `expected cleaved protein ~4.6 kDa, got ${gotKDa}`);
    }

    // Compare the construct figure and post-cleavage NanoDrop conversion?
    const epsText = await getProtEps();
    // E280 for 10 W, 10 Y = 5500*10 + 1490*10 = 69900.
    // MW = 4635.159. 69900 / 4635.159 = 15.0803887
    T.check('7_thrombin_cleavage.eps_text', epsText.includes('15.08'), `expected 15.08, got "${epsText}"`);
  });







  /* ================= 7. Sequence 7: Unknown Residues ================= */
  await T.t('7_unknown_residues', async () => {
    // A sequence with unknown residues (30 X's) and W to trigger A280 computation.
    const unkSeq = 'M' + 'X'.repeat(30) + 'W';
    await clearTagSeq();
    await setProtSeq(unkSeq);

    let tbl = await getProtTable();
    T.check('7_unknown_residues.table_has_row', tbl.length >= 1, JSON.stringify(tbl));
    if (tbl.length) {
      const r = tbl[0];
      T.check('7_unknown_residues.mw_approx', r.kDa && r.kDa.includes('≈'), `expected kDa to be prefixed with '≈', got ${r.kDa}`);
      T.check('7_unknown_residues.pi_approx', r.pI && r.pI.includes('≈'), `expected pI to be prefixed with '≈', got ${r.pI}`);
      T.check('7_unknown_residues.a280_approx', getA280Cell(r).includes('≈'), `expected A280 to be prefixed with '≈', got ${getA280Cell(r)}`);

      const formText = r.Form || r.form || '';
      T.check('7_unknown_residues.approx_label', formText.includes('approximate: 30 unknown residues counted as average'), `expected approximation label in form cell, got ${formText}`);
    }

    let epsText = await getProtEps();
    T.check('7_unknown_residues.eps_approx_label', epsText.includes('approximate: 30 unknown residues counted as average'), `expected approximation label in eps text, got "${epsText}"`);

    // Control: Resolved sequence without X's
    const resolvedSeq = 'MW';
    await setProtSeq(resolvedSeq);

    tbl = await getProtTable();
    if (tbl.length) {
      const r = tbl[0];
      T.check('7_unknown_residues.control_mw_exact', r.kDa && !r.kDa.includes('≈'), `expected resolved kDa to not be prefixed with '≈', got ${r.kDa}`);
      T.check('7_unknown_residues.control_pi_exact', r.pI && !r.pI.includes('≈'), `expected resolved pI to not be prefixed with '≈', got ${r.pI}`);
      T.check('7_unknown_residues.control_a280_exact', !getA280Cell(r).includes('≈'), `expected resolved A280 to not be prefixed with '≈', got ${getA280Cell(r)}`);

      const formText = r.Form || r.form || '';
      T.check('7_unknown_residues.control_no_approx_label', !formText.includes('approximate'), `expected no approximation label in resolved form cell, got ${formText}`);
    }

    epsText = await getProtEps();
    T.check('7_unknown_residues.control_eps_no_approx_label', !epsText.includes('approximate'), `expected no approximation label in resolved eps text, got "${epsText}"`);
  });

  /* ================= 8. Cleared sequence ================= */
  await T.t('8_cleared_seq', async () => {
    await clearTagSeq();
    await setProtSeq('MAWYKLLPEDG');

    const tbl = await getProtTable();
    T.check('8_cleared_seq.has_rows_first', tbl.length >= 1, `expected at least 1 row before clearing, got ${tbl.length}`);

    await setProtSeq('');

    const tbl2 = await getProtTable();
    T.check('8_cleared_seq.no_rows', tbl2.length === 0, `expected no rows after clearing, got ${tbl2.length}`);

    const epsText = await getProtEps();
    T.check('8_cleared_seq.eps_empty', epsText === '', `expected eps text to be empty after clearing, got "${epsText}"`);
  });


  /* ================= 9. Tag preset without a sequence (GST) must not use the untagged coefficient ================= */
  await T.t('9_gst_empty_tag', async () => {
    const protSeq = 'M' + 'AWY'.repeat(10);
    await setProtSeq(protSeq);
    await clearTagSeq();
    await p.selectOption('#o-tagPreset2', 'gst'); await h.wait(400);
    T.check('9_gst_empty_tag.preset_has_no_tagged_row', (await getProtTable()).length === 1, 'GST has no built-in sequence, so only the Untagged row should show');
    await setOpt(p, 'eps', ''); await h.wait(200);
    await h.addRun(path.join(DATA, 'chrom', 'imac_HisTrap_FF_1mL_step_u7.csv')); await h.pool('T1-T3');
    await h.addConc(path.join(DATA, 'nd', 'nd_one_protein_a280.csv'), 0.5); await h.wait(400);
    const col = async () => {
      await h.step('figure'); const dp = p.waitForEvent('download', {timeout: 8000}).catch(() => null); await p.click('#sumCsv'); const dl = await dp; if (!dl) throw new Error('no download; toasts: ' + (await h.toasts()).join('/') + ' sumTable rows ' + (await h.sumTable()).length);
      const txt = fs.readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, '');
      const rows = txt.trim().split(/\r?\n/).map(l => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; });
      const i = rows[0].indexOf('A280 of 1 mg/mL used'), j = rows[0].indexOf('NanoDrop mg/mL');
      const r = rows.slice(1).find(x => x[j] !== '' && x[j] != null);
      return i < 0 || !r ? null : r[i];
    };
    const untagged = calcExtinction(protSeq).a280;
    T.check('9_gst_empty_tag.untagged_value', Math.abs(untagged - 16.0546) < 0.001, `independent untagged A280 ${untagged}`);
    const v0 = await col();
    T.check('9_gst_empty_tag.withheld', v0 === '', `expected the A280 column empty (withheld), got "${v0}" (main gives 16.05, the untagged target)`);
    await setOpt(p, 'eps', '40'); await h.wait(400);
    const v1 = await col();
    T.check('9_gst_empty_tag.manual_value', v1 !== null && Math.abs(num(v1) - 40) < 0.001, `expected 40 with a typed coefficient, got "${v1}"`);
    await setOpt(p, 'eps', '');
    const tag = 'AWYAWY';
    await p.evaluate(t => { const e = document.querySelector('#tagSeq'); e.value = t; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, tag); await h.wait(500);
    const fus = calcExtinction(tag + protSeq).a280;
    const v2 = await col();
    T.check('9_gst_empty_tag.fusion_value', v2 !== null && v2 !== '' && Math.abs(num(v2) - fus) < 0.002 && Math.abs(num(v2) - 16.0546) > 0.01, `expected fusion ${fus.toFixed(4)}, got "${v2}"`);
  });


    /* ================= 10. Cleavage consistency ================= */
  await T.t('10_cleavage_consistency', async () => {
    // 1. New project; add the synthetic gel stand-in and select the gel step so the gel figure is shown.
    const { p: p10, close: close10 } = await open();
    try {
      await p10.evaluate(() => { document.querySelector('#pickGel').click(); });
      await p10.setInputFiles('#gelFile', [path.join(DATA, 'standins', 'gel_photo.jpg')]);
      await p10.waitForTimeout(400);

      // 2. Paste the 100-residue sequence into `#protSeq`; leave `#o-tagPreset` at `sumo`.
      const seq = 'ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY';

      await p10.evaluate(() => {
        const e = document.querySelector('#o-tagPreset');
        e.value = 'sumo';
        e.dispatchEvent(new Event('input', {bubbles: true}));
        e.dispatchEvent(new Event('change', {bubbles: true}));
      });
      await p10.waitForTimeout(200);

      // Paste sequence
      await p10.evaluate(t => {
        const e = document.querySelector('#protSeq');
        e.value = t;
        e.dispatchEvent(new Event('input', {bubbles: true}));
        e.dispatchEvent(new Event('change', {bubbles: true}));
      }, seq);
      await p10.waitForTimeout(500);

      // 3. Read the kDa cell of the `Tag only` row of `#protTable`.
      const tagOnlyKDa = await p10.evaluate(() => {
        const tbl = document.querySelector('#protTable');
        if (!tbl) return null;
        for (const r of Array.from(tbl.querySelectorAll('tr')).slice(1)) {
          const cells = r.querySelectorAll('td');
          if (cells.length > 2 && cells[0].textContent.includes('Tag only')) return parseFloat(cells[2].textContent);
        }
        return null;
      });

      const untaggedKDa = await p10.evaluate(() => {
        const tbl = document.querySelector('#protTable');
        if (!tbl) return null;
        for (const r of Array.from(tbl.querySelectorAll('tr')).slice(1)) {
          const cells = r.querySelectorAll('td');
          if (cells.length > 2 && cells[0].textContent.includes('Untagged')) return parseFloat(cells[2].textContent);
        }
        return null;
      });

    T.check('10_cleavage_consistency.tag_only_kda_not_null', tagOnlyKDa !== null, 'Tag only kDa is null');
    T.check('10_cleavage_consistency.untagged_kda_not_null', untaggedKDa !== null, 'Untagged kDa is null');

      // 4. Tick `#o-cleaveDetect`; type the `Untagged` kDa into `#o-protKda`.
      await p10.evaluate(() => {
        const e = document.querySelector('#o-cleaveDetect');
        if (e && !e.checked) e.click();
      });
      await p10.waitForTimeout(200);

      await p10.evaluate(t => {
        const e = document.querySelector('#o-protKda');
        if (!e) return;
        e.value = t;
        e.dispatchEvent(new Event('input', {bubbles: true}));
        e.dispatchEvent(new Event('change', {bubbles: true}));
      }, untaggedKDa);
      await p10.waitForTimeout(500);

      // 5. Parse the kDa after "free His-SUMO" out of `#cleaveInfo`.
      const cleaveInfoText = await p10.evaluate(() => {
        const e = document.querySelector('#cleaveInfo');
        return e ? e.textContent : null;
      });

      let freeSumoKDa = null;
      if (cleaveInfoText) {
        const mm = cleaveInfoText.match(/free His-SUMO\s+([0-9.]+)\s+kDa/);
        if (mm) freeSumoKDa = parseFloat(mm[1]);
      }

    T.check('10_cleavage_consistency.free_sumo_kda_not_null', freeSumoKDa !== null, `Could not parse free His-SUMO kDa from: ${cleaveInfoText}`);

      // 6. Assert the two agree within 0.15 kDa.
      if (tagOnlyKDa !== null && freeSumoKDa !== null) {
        const diff = Math.abs(tagOnlyKDa - freeSumoKDa);
        T.check('10_cleavage_consistency.consistency', diff <= 0.15, `Tag only kDa (${tagOnlyKDa}) and free His-SUMO kDa (${freeSumoKDa}) disagree by ${diff}`);
      }
    } finally {
      await close10();
    }
  });

  /* ================= 11. Extinction coefficient selector ================= */
  await T.t('11_eps_selector', async () => {
    // Drop file to create project
    const { p: p11, close: close11 } = await open();
    try {
      const h11 = H(p11);
      await h11.newProject('Test11');
      await h11.addRun([path.join(DATA, 'chrom', 'imac_HisTrap_FF_1mL_step_u7.csv')]);
      await h11.wait(500);

      // Go to Protein tab
      await h11.step('construct');
      await h11.wait(200);

      const protSeq = 'M' + 'AWY'.repeat(5);
      const tagSeq = 'M' + 'AWY'.repeat(2);

      // Set up sequences
      await p11.evaluate(t => { const e = document.querySelector('#protSeq'); e.value = t; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, protSeq);
      await h11.wait(200);
      await p11.evaluate(t => { const e = document.querySelector('#tagSeq'); e.value = t; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, tagSeq);
      await h11.wait(500);

      const optText = await p11.evaluate(() => {
        const sel = document.getElementById('o-epsMode');
        return sel ? Array.from(sel.options).map(o => o.textContent).join(' | ') : null;
      });

    T.check('11_eps_selector.options_display_values', optText && optText.includes('Untagged (') && optText.includes('Tagged ('), `Expected selector to display values, got: ${optText}`);

      // Go to Run tab and pool
      const runStep = (await h11.timeline()).find(x => x.k.startsWith('run:'));
      if (runStep) await h11.step(runStep.k);
      await h11.wait(200);
      await h11.pool('T1-T3');
      await h11.wait(500);

      // Read the mass from the summary table
      await h11.step('figure');
      await h11.wait(500);
      const getMass = async () => { const rows = await h11.sumTable(); const row = rows.slice(1).find(r => r.length > 5); return row ? row[4] : null; };

      const massAuto = await getMass();
    T.check('11_eps_selector.mass_auto', !!massAuto, 'Auto mass should be calculated');

      // Force Untagged
      await h11.step('construct');
      await h11.wait(200);
      await p11.selectOption('#o-epsMode', 'untagged');
      await h11.wait(500);

      // Read mass again
      await h11.step('figure');
      await h11.wait(500);
      const massUntagged = await getMass();

    T.check('11_eps_selector.mass_changes', massAuto !== massUntagged, `Expected mass to change when forcing Untagged, but it stayed ${massAuto}`);
    } finally {
      await close11();
    }
  });

  /* ================= 12. Reduced-cysteine disclosure (Pace 1995) ================= */
  await T.t('12_reduced_cysteine_disclosure', async () => {
    const seq = 'M' + 'CWAK'.repeat(2) + 'CAGC' + 'GSAEKL'.repeat(10); // 4 Cys and 2 Trp
    const nC = [...seq].filter(c => c === 'C').length, nW = [...seq].filter(c => c === 'W').length;
    const {p: p12, errs: errs12, close: close12} = await open();
    try {
      const h12 = H(p12);
      await h12.newProject('Test12');
      await h12.addRun(path.join(DATA, 'chrom', 'imac_HisTrap_FF_1mL_step_u7.csv')); await h12.pool('T1-T3'); await h12.wait(300);
      await h12.step('construct'); await h12.wait(200);
      await p12.fill('#protSeq', seq); await p12.dispatchEvent('#protSeq', 'input'); await p12.dispatchEvent('#protSeq', 'change'); await h12.wait(400);
      const eps = await p12.$eval('#protEps', e => e.textContent.trim());
      const base = calcExtinction(seq).a280;
      T.check('12_cys.counts', nC === 4 && nW === 2, `nC ${nC} nW ${nW}`);
      const m = eps.match(/ε₂₈₀ ([\d,]+) M/);
      const mass = calcMW(seq);
      T.check('12_cys.eps_unchanged', !!m && Math.abs(+m[1].replace(/,/g, '') - Math.round(base * mass)) <= 2, `eps text: ${eps}; expected about ${Math.round(base * mass)}`);
      T.check('12_cys.disclosed', /reduced cysteines/.test(eps) && /cystine/.test(eps) && /Pace/.test(eps), eps);
      const m2 = eps.match(/cystine, ε₂₈₀ ([\d,]+)/);
      T.check('12_cys.cystine_value', !!m2 && Math.abs(+m2[1].replace(/,/g, '') - (Math.round(base * mass) + 125 * Math.floor(nC / 2))) <= 2, eps);
      await h12.addConc(path.join(DATA, 'nd', 'nd_one_protein_a280.csv'), 0.5); await h12.wait(400);
      await h12.step('figure');
      await p12.evaluate(() => { const b = document.querySelector('#methodsBox'); if (b) b.open = true; }); await h12.wait(500);
      const mt = await p12.$eval('#methodsText', e => e.value);
      T.check('12_cys.methods', /reduced cysteines/.test(mt), mt.slice(0, 400));
      const [dl] = await Promise.all([p12.waitForEvent('download', {timeout: 8000}).catch(() => null), p12.click('#sumCsv')]);
      const txt = dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
      T.check('12_cys.csv_column', /Extinction basis/.test(txt.split(/\r?\n/)[0] || '') && /reduced cysteines/.test(txt), txt.slice(0, 300));
      errs.push(...errs12);
    } finally { await close12(); }
  });

  /* ================= 13. Tag mass sync & His6-GST preset (#796) ================= */
  await T.t('13_tag_mass_and_hisgst_preset', async () => {
    const {p: p13, errs: errs13, close: close13} = await open(), h13 = H(p13);
    try {
      await p13.evaluate(() => { document.querySelector('#pickGel').click(); });
      await p13.setInputFiles('#gelFile', [path.join(DATA, 'standins', 'gel_photo.jpg')]);
      await h13.wait(400);
      const seq100 = 'ACDEFGHIKLMNPQRSTVWY'.repeat(5);
      await p13.evaluate(t => {
        const tp = document.querySelector('#o-tagPreset'); tp.value = 'sumo'; tp.dispatchEvent(new Event('input', {bubbles: true})); tp.dispatchEvent(new Event('change', {bubbles: true}));
        const ps = document.querySelector('#protSeq'); ps.value = t; ps.dispatchEvent(new Event('input', {bubbles: true})); ps.dispatchEvent(new Event('change', {bubbles: true}));
      }, seq100);
      await h13.wait(400);
      const {tagKda, untagKda} = await p13.evaluate(() => {
        const rows = [...document.querySelectorAll('#protTable tr')].slice(1);
        const cell = label => { const r = rows.find(x => x.cells.length > 2 && x.cells[0].textContent.includes(label)); return r ? parseFloat(r.cells[2].textContent) : null; };
        return {tagKda: cell('Tag only'), untagKda: cell('Untagged')};
      });
      await p13.evaluate(m => {
        const c = document.querySelector('#o-cleaveDetect'); if (c && !c.checked) c.click();
        const k = document.querySelector('#o-protKda'); k.value = m; k.dispatchEvent(new Event('input', {bubbles: true})); k.dispatchEvent(new Event('change', {bubbles: true}));
      }, untagKda || 0);
      await h13.wait(350);
      const freeTag = await p13.$eval('#cleaveInfo', e => { const m = (e.textContent || '').match(/free His-SUMO\s+([0-9.]+)\s+kDa/); return m ? parseFloat(m[1]) : null; }).catch(() => null);
      T.check('13_tag_mass.agree', tagKda != null && freeTag != null && Math.abs(tagKda - freeTag) <= 0.15, `Tag=${tagKda}, Free=${freeTag}`);

      await p13.click('#homeBtn').catch(() => {}); await h13.wait(400);
      await h13.newProject('His6-GST Preset');
      await h13.gb(path.join(DATA, 'gb', 'gb_his6_gst.gb'));
      const preset = await p13.$eval('#o-tagPreset', e => e.value);
      T.check('13_his6_gst.preset_equals_hisgst', preset === 'hisgst', `got '${preset}'`);
      errs.push(...errs13);
    } finally { await close13(); }
  });

  /* ================= 14. Untagged default vs chosen/saved His-SUMO (#1007) ================= */
  await T.t('14_untagged_default_and_saved_sumo', async () => {
    const SEQ = 'M' + 'AKWYE'.repeat(20), PATH_MM = 2;
    const num = s => { const m = String(s == null ? '' : s).replace(/[≈~,]/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
    const expMg = (area, e) => area > 0 && e > 0 ? area / 1000 / (e * PATH_MM / 10) : null;
    const nearMg = (got, exp) => got != null && exp != null && Math.abs(got - exp) <= Math.max(0.011, 0.01 * exp);

    // Check bare sequence untagged default AND switching to His-SUMO in one project
    {
      const {p: p14, errs: errs14, close: close14} = await open(), h14 = H(p14);
      p14.on('dialog', d => d.accept());
      try {
        await h14.newProject('Tag default');
        await h14.step('construct');
        const setVal = (sel, v) => p14.evaluate(({sel, v}) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, {sel, v});
        const shown0 = await p14.$eval('#o-tagPreset2', e => e.value);
        await setVal('#protSeq', SEQ); await h14.wait(350);
        await h14.addRun(path.join(DATA, 'standins', 'imac_histrap_1ml_step.csv')); await h14.pool('T1-T6');
        const l = p14.locator('.trace.run.sel [data-k=path]').first();
        await l.evaluate(e => { for (let d = e.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; });
        await l.fill(String(PATH_MM)); await l.dispatchEvent('change'); await h14.wait(300);
        const readState = async () => {
          await h14.step('construct');
          const prot = await p14.$$eval('#protTable tr', rs => rs.slice(1).map(r => [...r.cells].map(c => c.textContent.trim())));
          const a280 = k => { const r = prot.find(c => c[0].startsWith(k)); return r ? num(r[r.length - 1]) : null; };
          const rStep = (await h14.timeline()).find(x => /^run:/.test(x.k)); await h14.step(rStep.k);
          const area = await p14.$$eval('#intTable tr', rs => { const hd = [...(rs[0] || {cells: []}).cells].map(c => c.textContent.trim()), pr = rs.find(r => r.classList.contains('pool')); const i = hd.findIndex(t => /^Area/.test(t)); return pr && i >= 0 ? pr.cells[i].textContent.trim() : null; });
          await h14.step('figure');
          const rs = await h14.sumTable(), hd = rs[0] || [], mi = hd.findIndex(k => /^Protein \(mg\)/.test(k));
          const row = rs.slice(1).find(r => r.length === hd.length && mi >= 0 && num(r[mi]) > 0);
          return {untagged: a280('Untagged'), tagged: a280('Tagged'), area: num(area), mg: row ? num(row[mi]) : null};
        };
        const s0 = await readState();
        T.check('14_no_tag.default_untagged', shown0 === '' && s0.untagged > 0 && s0.tagged == null && nearMg(s0.mg, expMg(s0.area, s0.untagged)), JSON.stringify({shown0, s0}));
        await h14.step('construct'); await setVal('#o-tagPreset2', 'sumo'); await h14.wait(250);
        const s1 = await readState();
        T.check('14_sumo_chosen.uses_tagged_coeff', s1.tagged > 0 && s1.tagged < s1.untagged && nearMg(s1.mg, expMg(s1.area, s1.tagged)), JSON.stringify(s1));
        errs.push(...errs14);
      } finally { await close14(); }
    }

    // Legacy saved settings without tagPreset keep migrated His-SUMO
    for (const [k, saved] of [['saved_sumo', {tagPreset: 'sumo', tidy13: true, tidy14: true}], ['saved_no_key', {tidy13: true, tidy14: true}]]) {
      const {p: ps, errs: es, close: cs} = await open(), hs = H(ps);
      try {
        await ps.addInitScript(s => { localStorage.setItem('hplc-fig-opt', s); }, JSON.stringify(saved));
        await ps.reload(); await ps.waitForSelector('#npName', {state: 'visible', timeout: 15000});
        await hs.newProject('Saved ' + k); await hs.step('construct');
        const shown = await ps.$eval('#o-tagPreset2', e => e.value);
        T.check(`14_${k}.keeps_sumo`, shown === 'sumo', `shown=${shown}`);
        errs.push(...es);
      } finally { await cs(); }
    }
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();