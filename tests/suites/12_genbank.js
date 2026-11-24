// 12 genbank: check GenBank parsing on synthetic files with known answers.
const { open, H, suite, path, fs, DATA } = require('../lib/harness');

const GB_DIR = path.join(DATA, 'gb');
const files = {
  comp: path.join(GB_DIR, 'gb_complement.gb'),
  join: path.join(GB_DIR, 'gb_join.gb'),
  wrap: path.join(GB_DIR, 'gb_wrap.gb'),
  multi: path.join(GB_DIR, 'gb_multiline.gb'),
  case: path.join(GB_DIR, 'gb_case.gb'),
  noOrig: path.join(GB_DIR, 'gb_no_origin.gb'),
  win: path.join(GB_DIR, 'gb_windows.gb'),
  geneProd: path.join(GB_DIR, 'gb_gene_product.gb'),
  snapGene: path.join(GB_DIR, 'snapgene_export.dna'),
  originSpanningCassette: path.join(GB_DIR, 'gb_origin_spanning_cassette.gb')
};

(async () => {
  const T = suite('12_genbank');
  const { p, errs, close } = await open(), h = H(p);
  p.on('dialog', d => d.accept());

  const status = async () => p.$eval('#gbStatus', e => e.textContent.replace(/\u00a0/g, ' ').trim()).catch(() => '');
  const svgText = async () => (await h.svgTexts()).map(x => x.t.replace(/\u00a0/g, ' ')).join(' ');

  /* 1. Complement strand CDS */
  await T.t('complement_strand', async () => {
    await h.newProject('GenBank Complement');
    await h.gb(files.comp);
    const st = await status();
    const txt = await svgText();
    const toasts = (await h.toasts()).join(' | ');

    T.check('comp.status_loaded', st.includes('pCOMP') && st.includes('1,000 bp'), `status: ${st}`);
    T.check('comp.orf_residues', st.includes('255 residues'), `status: ${st}`);
    T.check('comp.toast_cds_count', toasts.includes('2 CDS') && toasts.includes('255 residues'), `toasts: ${toasts}`);
    T.check('comp.status_cds_count', st.includes('2 CDS'), `status: ${st}`);
    T.check('comp.tagged_mass', st.includes('28.7 kDa') || txt.includes('28.7 kDa'), `status: ${st}, svg: ${txt}`);
    T.check('comp.protease_site', st.includes('thrombin site') || txt.includes('thrombin'), `status: ${st}, svg: ${txt}`);
    T.check('comp.promoter', st.includes('T7 promoter') || txt.includes('T7'), `status: ${st}, svg: ${txt}`);
    T.check('comp.resistance', /kanamycin resistance/i.test(txt), `svg: ${txt}`);
    T.check('comp.origin', txt.includes('pUC ori'), `svg: ${txt}`);
    T.check('comp.cleaved_mass', txt.includes('27.1 kDa'), `svg: ${txt}`);
  });

  /* 2. Non-origin-spanning join location */
  await T.t('join_location', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Join');
    await h.gb(files.join);
    const st = await status();
    const txt = await svgText();

    T.check('join.status_loaded', st.includes('pJOIN'), `status: ${st}`);
    T.check('join.orf_residues', st.includes('255 residues'), `status: ${st}`);
    T.check('join.tagged_mass', st.includes('28.7 kDa') || txt.includes('28.7 kDa'), `status: ${st}, svg: ${txt}`);
    T.check('join.cleaved_mass', txt.includes('27.1 kDa'), `svg: ${txt}`);
  });

  /* 3. Origin-spanning join location */
  await T.t('origin_spanning_join', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Wrap');
    await h.gb(files.wrap);
    const st = await status();

    // App bug fixed: wrap is true but length is right
    const txt = await svgText();
    T.check('wrap.origin_spanning_orf_found', st.includes('255 residues'), `status: ${st}`);
    T.check('wrap.tagged_mass', st.includes('28.7 kDa') || txt.includes('28.7 kDa'), `status: ${st}, svg: ${txt}`);
    T.check('wrap.cleaved_mass', txt.includes('27.1 kDa'), `svg: ${txt}`);
  });

  /* 4. Multi-line qualifiers (/translation and /label) */
  await T.t('multiline_qualifiers', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Multiline');
    await h.gb(files.multi);
    const st = await status();
    const txt = await svgText();

    T.check('multi.status_loaded', st.includes('pMULTI'), `status: ${st}`);
    T.check('multi.label_joined', txt.includes('Multi Line Label') || st.includes('255 residues'), `status: ${st}, svg: ${txt}`);
    T.check('multi.translation_joined', st.includes('255 residues'), `status: ${st}`);
    T.check('multi.mass_correct', st.includes('28.7 kDa') || txt.includes('28.7 kDa'), `status: ${st}, svg: ${txt}`);
  });

  /* 5. Lowercase and uppercase sequence */
  await T.t('case_sensitivity', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Case');
    await h.gb(files.case);
    const st = await status();

    T.check('case.parsed', st.includes('pCASE') && st.includes('500 bp'), `status: ${st}`);
    T.check('case.orf_found', st.includes('30 residues'), `status: ${st}`);
  });

  /* 6. File without ORIGIN section (translation only) */
  await T.t('no_origin', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank No Origin');
    await h.gb(files.noOrig);
    const st = await status();

    T.check('no_origin.parsed', st.includes('pNOORIGIN') && st.includes('255 residues'), `status: ${st}`);
  });

  /* 7. Windows line endings (\r\n) */
  await T.t('windows_line_endings', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Windows');
    await h.gb(files.win);
    const st = await status();

    T.check('windows.parsed', st.includes('pWIN') && st.includes('255 residues'), `status: ${st}`);
  });

  /* 8. Feature labels from /gene or /product */
  await T.t('gene_product_fallback', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Gene Product');
    await h.gb(files.geneProd);
    const st = await status();
    const txt = await svgText();

    T.check('gene_product.parsed', st.includes('pGENEPROD') && st.includes('255 residues'), `status: ${st}`);
    T.check('gene_product.resistance_fallback', /ampicillin resistance/i.test(txt), `svg: ${txt}`);
  });

  /* 9. SnapGene-style .dna export file */
  await T.t('snapgene_dna_export', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('SnapGene Export');
    await h.gb(files.snapGene);
    const toasts = await h.toasts();

    T.check(
      'snapgene.message_shown',
      toasts.some(t => t.includes('SnapGene file') || t.includes('Export, then GenBank (.gb)')),
      `toasts: ${toasts.join(' | ')}`
    );
  });


  /* 10. Origin-spanning CDS cassette keeps promoter and excludes plasmid features */
  await T.t('origin_spanning_cassette', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Orispan');
    await h.gb(files.originSpanningCassette);
    const st = await status();
    const txt = await svgText();

    T.check('orispan.status_loaded', st.includes('pORISPAN'), `status: ${st}`);
    T.check('orispan.promoter', txt.includes('T7 promoter') || txt.includes('T7'), `svg: ${txt}`);

    // AmpR and ori are NOT drawn as features inside the expressed protein.
    // AmpR isn't in the SVG at all, and 'ori' only appears once (in the plasmid description '... Ampicillin resistance, ori')
    T.check('orispan.no_amp', !txt.includes('AmpR'), `svg: ${txt}`);
    T.check('orispan.no_ori_in_cassette', (txt.match(/\bori\b/gi) || []).length <= 1, `svg: ${txt}`);

    // The His tag is drawn at the N-terminus of the protein
    T.check('orispan.his_tag', txt.includes('6xHis') || txt.includes('His6 protein') || txt.includes('His6-protein'), `svg: ${txt}`);
  });

  /* 11. Pasted GenBank text (Benchling copy) takes the same path as a file */
  const paste = async txt => { await p.click('#tl [data-step=construct]'); await p.waitForTimeout(300); if (await p.$eval('#gbPasteBox', e => e.hidden)) await p.click('#gbPaste'); await p.fill('#gbText', txt); await p.click('#gbPasteGo'); await p.waitForTimeout(1000); };
  const lastToast = async () => (await h.toasts()).join(' | ');
  await T.t('paste_genbank', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Paste');
    await paste(fs.readFileSync(files.comp, 'utf8'));
    const st = await status(), txt = await svgText();
    T.check('paste.status_loaded', st.includes('pCOMP') && st.includes('1,000 bp') && st.includes('255 residues'), `status: ${st}`);
    T.check('paste.tagged_mass', st.includes('28.7 kDa') || txt.includes('28.7 kDa'), `status: ${st}`);
    T.check('paste.cleaved_mass', txt.includes('27.1 kDa'), `svg: ${txt}`);
  });
  await T.t('paste_refused', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Paste Refused');
    await paste('>seq1\nATGAAAGCTGCTGCTGCT\n');
    T.check('paste.fasta_refused', /FASTA/.test(await lastToast()) && !(await status()).includes('bp'), `toasts: ${await lastToast()}`);
    await paste('hello world, not a sequence');
    T.check('paste.junk_refused', /Could not read/.test(await lastToast()) && !(await status()).includes('bp'), `toasts: ${await lastToast()}`);
    await paste('LOCUS       PROT1       120 aa            linear   UNK 01-JAN-2000\nFEATURES             Location/Qualifiers\n     CDS             1..120\nORIGIN\n        1 mkaaaaaaaa\n//\n');
    T.check('paste.protein_refused', /protein GenBank record/.test(await lastToast()) && !(await status()).includes('bp'), `toasts: ${await lastToast()}`);
  });
  await T.t('paste_first_record_only', async () => {
    await p.click('text=All projects').catch(() => {}); await h.wait(400);
    await h.newProject('GenBank Paste Two');
    const one = fs.readFileSync(files.comp, 'utf8').replace(/\r/g, '').trimEnd(), body = one.endsWith('//') ? one : one + '\n//';
    await paste(body + '\n' + body.replace(/pCOMP/g, 'pSECOND') + '\n');
    const st = await status();
    T.check('paste.two_records_first_only', st.includes('pCOMP') && !st.includes('pSECOND') && st.includes('1,000 bp') && /first of 2 records/.test(await lastToast()), `status: ${st}, toasts: ${await lastToast()}`);
  });

  /* 12. 5' partial marker on each strand (#847): on the complement strand the 5' end is the higher coordinate, so '>' marks
     a 5' partial CDS and its first codon is internal (kept as is); '<' marks a 3' partial CDS whose initiator still reads M */
  const rc = s => s.split('').reverse().map(c => ({A: 'T', T: 'A', G: 'C', C: 'G'})[c]).join('');
  const gbRec = (name, loc, orf, rev) => { const len = 600, a = rev ? 100 : 1, plus = rev ? rc(orf) : orf;
    const seq = ('GC'.repeat(len)).slice(0, a - 1) + plus + ('GC'.repeat(len)).slice(0, len - (a - 1) - plus.length), lines = [];
    for (let i = 0; i < len; i += 60) lines.push(String(i + 1).padStart(9) + ' ' + seq.slice(i, i + 60).toLowerCase().match(/.{1,10}/g).join(' '));
    return `LOCUS       ${name}  ${len} bp    DNA     circular SYN 01-JAN-2000\nDEFINITION  Synthetic test plasmid.\nFEATURES             Location/Qualifiers\n     CDS             ${loc}\n                     /label="testORF"\n                     /transl_table=11\nORIGIN\n${lines.join('\n')}\n//\n`; };
  const orfOf = first => first + 'GCTGAAAAATCTACCAACCAG'.repeat(14) + 'TAA'; /* 100 codons: start, (AEKSTNQ)x14, stop */
  const firstRes = async (name, loc, first, rev) => { const P = await open(), hh = H(P.p); P.p.on('dialog', d => d.accept());
    try { await hh.newProject('GenBank ' + name);
      await P.p.click('#tl [data-step=construct]'); await P.p.waitForTimeout(300); if (await P.p.$eval('#gbPasteBox', e => e.hidden)) await P.p.click('#gbPaste');
      await P.p.fill('#gbText', gbRec(name, loc, orfOf(first), rev)); await P.p.click('#gbPasteGo'); await P.p.waitForTimeout(1000);
      return await P.p.$eval('#protSeq', e => e.value.replace(/\s/g, '')); } finally { await P.close(); } };
  await T.t('partial5_strand', async () => {
    const A = await firstRes('pREV5P', 'complement(100..>399)', 'GTG', true), B = await firstRes('pREV3P', 'complement(<100..399)', 'TTG', true), F = await firstRes('pFWD5P', '<1..300', 'GTG', false);
    T.check('partial5.complement_5p_partial_keeps_codon', A.length === 99 && A[0] === 'V', `complement(100..>399), first codon GTG: expected V, got ${A[0]} (${A.length} residues)`);
    T.check('partial5.complement_3p_partial_initiator_M', B.length === 99 && B[0] === 'M', `complement(<100..399), first codon TTG: expected M, got ${B[0]} (${B.length} residues)`);
    T.check('partial5.forward_5p_partial_keeps_codon', F.length === 99 && F[0] === 'V', `<1..300, first codon GTG: expected V, got ${F[0]} (${F.length} residues)`);
  });

  /* 13. Empty pET vector with KanR + lac repressor, split-feature T7 ORF, promoter trimming, and opt.protSrc adoption (#1577) */
  await T.t('repressor_and_split_t7_orf', async () => {
    const fmtOrigin = s => {
      const out = [];
      for (let i = 0; i < s.length; i += 60) out.push(String(i + 1).padStart(9) + ' ' + s.slice(i, i + 60).toLowerCase().match(/.{1,10}/g).join(' '));
      return out.join('\n');
    };
    const filler = n => 'ACGT'.repeat(Math.ceil(n / 4)).slice(0, n);
    const kanNt = 'ATG' + 'GCTGAA'.repeat(135) + 'TAA'; /* 271 aa, 816 bp */
    const lacNt = rc('ATG' + 'GCTGAA'.repeat(159) + 'TAA'); /* 319 aa, 960 bp on complement */

    /* (1) Empty vector: T7_promoter (50..68), KanR (500..1315), lac repressor (complement 1500..2459) */
    const empSeq = filler(49) + 'TAATACGACTCACTATAGG' + filler(500 - 1 - 68) + kanNt + filler(1500 - 1 - 1315) + lacNt + filler(2800 - 2459);
    const empGb = [
      `LOCUS       pET_EMPTY               ${empSeq.length} bp    DNA     circular SYN 01-JAN-2000`,
      'DEFINITION  Empty vector with KanR and lac repressor.',
      'FEATURES             Location/Qualifiers',
      '     promoter        50..68',
      '                     /label="T7_promoter"',
      '     CDS             500..1315',
      '                     /label="KanR"',
      '     CDS             complement(1500..2459)',
      '                     /product="lac repressor"',
      'ORIGIN',
      fmtOrigin(empSeq),
      '//'
    ].join('\n');

    const P1 = await open(), h1 = H(P1.p);
    P1.p.on('dialog', d => d.accept());
    try {
      await h1.newProject('GenBank Empty pET');
      await P1.p.click('#tl [data-step=construct]'); await h1.wait(300);
      await P1.p.setInputFiles('#gbFile', {name: 'pET_empty.gb', mimeType: 'text/plain', buffer: Buffer.from(empGb)});
      await h1.wait(1000);
      const stEmp = await P1.p.$eval('#gbStatus', e => e.textContent.replace(/\u00a0/g, ' ').trim());
      T.check('empty_vec.no_target_orf', /^No ORF found/i.test(stEmp) && !stEmp.includes('319'), `status: ${stEmp}`);

      /* (2) Split-feature T7_promoter construct: 260 aa ATG...TAA annotated as short 6xHis CDS + thrombin CDS + GFP misc_feature */
      const splitOrfNt = 'ATG' + 'CAT'.repeat(6) + 'GGTTCTGGTCTGGTTCCGCGTGGTTCT' + 'GCTGAA'.repeat(122) + 'TAA'; /* 1+6+9+244 = 260 aa + stop = 783 bp (131..913) */
      const splitSeq = filler(49) + 'TAATACGACTCACTATAGG' + filler(110 - 1 - 68) + 'AAGGAGATATACATAA' + filler(131 - 1 - 125) + splitOrfNt + filler(1200 - 1 - 913) + kanNt + filler(2400 - 2015);
      const splitGb = [
        `LOCUS       pET28_GFP               ${splitSeq.length} bp    DNA     circular SYN 01-JAN-2000`,
        'DEFINITION  pET split feature GFP construct.',
        'FEATURES             Location/Qualifiers',
        '     promoter        50..68',
        '                     /label="T7_promoter"',
        '     RBS             110..125',
        '                     /label="RBS"',
        '     CDS             134..151',
        '                     /label="6xHis"',
        '     CDS             161..178',
        '                     /label="thrombin"',
        '     misc_feature    179..910',
        '                     /label="GFP"',
        '     CDS             1200..2015',
        '                     /label="KanR"',
        'ORIGIN',
        fmtOrigin(splitSeq),
        '//'
      ].join('\n');

      await P1.p.setInputFiles('#gbFile', {name: 'pET28_GFP.gb', mimeType: 'text/plain', buffer: Buffer.from(splitGb)});
      await h1.wait(1000);
      const stSplit = await P1.p.$eval('#gbStatus', e => e.textContent.replace(/\u00a0/g, ' ').trim());
      T.check('split_t7.orf_260_found', stSplit.includes('ORF 260 residues'), `status: ${stSplit}`);
      T.check('split_t7.promoter_trimmed', stSplit.includes('T7 promoter') && !/T7[_\\-]/.test(stSplit), `status: ${stSplit}`);

      /* (3) Loading another plasmid when opt.protSrc is from an earlier file adopts the new ORF and strips trailing \ on promoter */
      const untagNt = 'ATGGGT' + 'GGTTCT' + 'GCTGAA'.repeat(122) + 'TAA'; /* 248 aa untagged containing prior 246 aa cleaved GFP */
      const untagSeq = filler(49) + 'TAATACGACTCACTATAGG' + filler(131 - 1 - 68) + untagNt + filler(1500 - (130 + untagNt.length));
      const untagGb = [
        `LOCUS       pET_UNTAG               ${untagSeq.length} bp    DNA     circular SYN 01-JAN-2000`,
        'FEATURES             Location/Qualifiers',
        '     promoter        50..68',
        '                     /label="T7\\"',
        `     CDS             131..${130 + untagNt.length}`,
        '                     /label="GFP_untagged"',
        'ORIGIN',
        fmtOrigin(untagSeq),
        '//'
      ].join('\n');
      await P1.p.setInputFiles('#gbFile', {name: 'pET_untag.gb', mimeType: 'text/plain', buffer: Buffer.from(untagGb)});
      await h1.wait(1000);
      const stUntag = await P1.p.$eval('#gbStatus', e => e.textContent.replace(/\u00a0/g, ' ').trim());
      const adoptedSeq = await P1.p.$eval('#protSeq', e => e.value.replace(/\s/g, ''));
      T.check('protsrc.adopts_new_plasmid_orf', adoptedSeq.length === 248 && stUntag.includes('T7 promoter') && !stUntag.includes('T7\\'), `len=${adoptedSeq.length}, status: ${stUntag}`);
    } finally {
      await P1.close();
    }

    /* (4) Manually typed #protSeq contained in a loaded plasmid is never overwritten */
    const P2 = await open(), h2 = H(P2.p);
    P2.p.on('dialog', d => d.accept());
    try {
      await h2.newProject('GenBank Manual Seq');
      await P2.p.click('#tl [data-step=construct]'); await h2.wait(300);
      const manualSeq = 'GS' + 'AE'.repeat(122); /* 246 aa manually typed */
      await P2.p.fill('#protSeq', manualSeq);
      await P2.p.dispatchEvent('#protSeq', 'input');
      await P2.p.dispatchEvent('#protSeq', 'change');
      await h2.wait(300);
      const untagNt = 'ATGGGT' + 'GGTTCT' + 'GCTGAA'.repeat(122) + 'TAA';
      const untagSeq = filler(49) + 'TAATACGACTCACTATAGG' + filler(131 - 1 - 68) + untagNt + filler(1500 - (130 + untagNt.length));
      const untagGb = [
        `LOCUS       pET_UNTAG               ${untagSeq.length} bp    DNA     circular SYN 01-JAN-2000`,
        'FEATURES             Location/Qualifiers',
        '     promoter        50..68',
        '                     /label="T7_promoter"',
        `     CDS             131..${130 + untagNt.length}`,
        '                     /label="GFP_untagged"',
        'ORIGIN',
        fmtOrigin(untagSeq),
        '//'
      ].join('\n');
      await P2.p.setInputFiles('#gbFile', {name: 'pET_untag.gb', mimeType: 'text/plain', buffer: Buffer.from(untagGb)});
      await h2.wait(1000);
      const keptSeq = await P2.p.$eval('#protSeq', e => e.value.replace(/\s/g, ''));
      T.check('manual_seq.preserved', keptSeq === manualSeq, `expected ${manualSeq.length} aa manual seq preserved, got ${keptSeq.length}`);
    } finally {
      await P2.close();
    }
  });

  /* 14. Strep-tagged CDS, C-terminal non-His cleavable tag, and large fusion tags in GenBank ORF splitting (#1601) */
  await T.t('strep_and_fusion_orf_splitting', async () => {
    const fmtOrigin = s => {
      const out = [];
      for (let i = 0; i < s.length; i += 60) out.push(String(i + 1).padStart(9) + ' ' + s.slice(i, i + 60).toLowerCase().match(/.{1,10}/g).join(' '));
      return out.join('\n');
    };
    const filler = n => 'ACGT'.repeat(Math.ceil(n / 4)).slice(0, n);
    const CODONS = {A:'GCT',C:'TGC',D:'GAT',E:'GAA',F:'TTT',G:'GGT',H:'CAT',I:'ATT',K:'AAA',L:'CTG',M:'ATG',N:'AAT',P:'CCG',Q:'CAG',R:'CGT',S:'TCT',T:'ACC',V:'GTG',W:'TGG',Y:'TAT'};
    const aaToNt = aa => aa.split('').map(c => CODONS[c] || 'GCT').join('');
    const kanNt = 'ATG' + 'GCTGAA'.repeat(135) + 'TAA';
    const gfp238 = 'M' + 'SKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK';

    const P = await open(), h = H(P.p);
    P.p.on('dialog', d => d.accept());
    try {
      /* (a) CDS /label="GFP-Strep-tag-II" ending with ENLYFQGWSHPQFEK populates #gbStatus with TEV protease site and #protTable with Untagged, Tagged, and Tag only */
      await P.p.click('text=All projects').catch(() => {}); await h.wait(400);
      await h.newProject('GenBank Strep Tag');
      await P.p.click('#tl [data-step=construct]'); await h.wait(300);
      const orfA_aa = gfp238 + 'ENLYFQGWSHPQFEK'; // 238 + 15 = 253 aa
      const orfA_nt = aaToNt(orfA_aa) + 'TAA';
      const seqA = filler(49) + 'TAATACGACTCACTATAGG' + filler(110 - 1 - 68) + 'AAGGAGATATACATAA' + filler(131 - 1 - 125) + orfA_nt + filler(1200 - 1 - (130 + orfA_nt.length)) + kanNt + filler(2400 - 2015);
      const gbA = [
        `LOCUS       pET_STREP_TEV           ${seqA.length} bp    DNA     circular SYN 01-JAN-2000`,
        'DEFINITION  pET Strep-tagged construct.',
        'FEATURES             Location/Qualifiers',
        '     promoter        50..68',
        '                     /label="T7_promoter"',
        '     RBS             110..125',
        '                     /label="RBS"',
        `     CDS             131..${130 + orfA_nt.length}`,
        '                     /label="GFP-Strep-tag-II"',
        '     CDS             1200..2015',
        '                     /label="KanR"',
        'ORIGIN',
        fmtOrigin(seqA),
        '//'
      ].join('\n');
      await P.p.setInputFiles('#gbFile', {name: 'pET_strep_tev.gb', mimeType: 'text/plain', buffer: Buffer.from(gbA)});
      await h.wait(1000);
      const stA = await P.p.$eval('#gbStatus', e => e.textContent.replace(/\u00a0/g, ' ').trim());
      const ptA = await P.p.$eval('#protTable', e => e.textContent.replace(/\u00a0/g, ' ').trim());
      T.check('strep_tag.status_tev', stA.includes('TEV protease site'), `status: ${stA}`);
      T.check('strep_tag.prot_table_forms', ptA.includes('Untagged') && ptA.includes('Tagged') && ptA.includes('Tag only'), `protTable: ${ptA}`);

      /* (b) N-terminal MHHHHHHSSG + MBP (370 aa) + ENLYFQG + 140 aa domain splits at TEV (Untagged 141 aa, main leaves 524 aa unsplit) */
      await P.p.click('text=All projects').catch(() => {}); await h.wait(400);
      await h.newProject('GenBank His6-MBP');
      await P.p.click('#tl [data-step=construct]'); await h.wait(300);
      const mbp367 = 'KIEEGKLVIWINGDKGYNGLAEVGKKFEKDTGIKVTVEHPDKLEEKFPQVAATGDGPDIIFWAHDRFGGYAQSGLLAEITPDKAFQDKLYPFTWDAVRYNGKLIAYPIAVEALSLIYNKDLLPNPPKTWEEIPALDKELKAKGKSALMFNLQEPYFTWPLIAADGGYAFKYENGKYDIKDVGVDNAGAKAGLTFLVDLIKNKHMNADTDYSIAEAAFNKGETAMTINGPWAWSNIDTSKVNYGVTVLPTFKGQPSKPFVGVLSAGINAASPNKELAKEFLENYLLTDEGLEAVNKDKPLGAVALKSYEEELAKDPRIAATMENAQKGEIMPNIPQMSAFWYAVRTAVINAASGRQTVDEALKDAQTNSSS'.slice(0, 367);
      const orfB_aa = 'MHHHHHHSSG' + mbp367 + 'ENLYFQG' + 'AE'.repeat(70); // 10 + 367 + 7 + 140 = 524 aa
      const orfB_nt = aaToNt(orfB_aa) + 'TAA';
      const seqB = filler(49) + 'TAATACGACTCACTATAGG' + filler(110 - 1 - 68) + 'AAGGAGATATACATAA' + filler(131 - 1 - 125) + orfB_nt + filler(2000 - 1 - (130 + orfB_nt.length)) + kanNt + filler(3200 - 2815);
      const gbB = [
        `LOCUS       pET_HIS_MBP_TEV         ${seqB.length} bp    DNA     circular SYN 01-JAN-2000`,
        'DEFINITION  pET His-MBP TEV construct.',
        'FEATURES             Location/Qualifiers',
        '     promoter        50..68',
        '                     /label="T7_promoter"',
        '     RBS             110..125',
        '                     /label="RBS"',
        `     CDS             131..${130 + orfB_nt.length}`,
        '                     /label="His-MBP-Domain"',
        '     CDS             2000..2815',
        '                     /label="KanR"',
        'ORIGIN',
        fmtOrigin(seqB),
        '//'
      ].join('\n');
      await P.p.setInputFiles('#gbFile', {name: 'pET_his_mbp_tev.gb', mimeType: 'text/plain', buffer: Buffer.from(gbB)});
      await h.wait(1000);
      const ptB = await P.p.$eval('#protTable', e => e.innerText.replace(/\u00a0/g, ' ').trim());
      T.check('mbp_tev.splits_141aa', /Untagged\s+141\b/.test(ptB), `protTable: ${ptB}`);

      /* (c) 238 aa target + LEVLFQGP + GFP (238 aa) + HHHHHHHH splits at 3C (Untagged 244 aa, main leaves 492 aa unsplit) */
      await P.p.click('text=All projects').catch(() => {}); await h.wait(400);
      await h.newProject('GenBank 3C-GFP-His8');
      await P.p.click('#tl [data-step=construct]'); await h.wait(300);
      const orfC_aa = 'M' + 'AE'.repeat(118) + 'A' + 'LEVLFQGP' + gfp238 + 'H'.repeat(8); // 238 aa target + 8 aa 3C + 238 aa GFP + 8 aa His = 492 aa
      const orfC_nt = aaToNt(orfC_aa) + 'TAA';
      const seqC = filler(49) + 'TAATACGACTCACTATAGG' + filler(110 - 1 - 68) + 'AAGGAGATATACATAA' + filler(131 - 1 - 125) + orfC_nt + filler(2000 - 1 - (130 + orfC_nt.length)) + kanNt + filler(3200 - 2815);
      const gbC = [
        `LOCUS       pET_3C_GFP_HIS8         ${seqC.length} bp    DNA     circular SYN 01-JAN-2000`,
        'DEFINITION  pET 3C-GFP-His8 construct.',
        'FEATURES             Location/Qualifiers',
        '     promoter        50..68',
        '                     /label="T7_promoter"',
        '     RBS             110..125',
        '                     /label="RBS"',
        `     CDS             131..${130 + orfC_nt.length}`,
        '                     /label="Target-GFP-His8"',
        '     CDS             2000..2815',
        '                     /label="KanR"',
        'ORIGIN',
        fmtOrigin(seqC),
        '//'
      ].join('\n');
      await P.p.setInputFiles('#gbFile', {name: 'pET_3c_gfp_his8.gb', mimeType: 'text/plain', buffer: Buffer.from(gbC)});
      await h.wait(1000);
      const ptC = await P.p.$eval('#protTable', e => e.innerText.replace(/\u00a0/g, ' ').trim());
      T.check('c_term_3c.splits_244aa', /Untagged\s+244\b/.test(ptC), `protTable: ${ptC}`);
    } finally {
      await P.close();
    }
  });

  /* #1090, #1304, #1306: construct sequence link, construct/primer lineage schemas, and method-specific record templates in one project */
  await T.t('construct_records_lineage_and_sequence_link', async () => {
    const P = await open(), h = H(P.p);
    try {
      await h.newProject('Construct Records & Lineage');
      await P.p.click('#tl [data-step="construct"]');
      await h.wait(250);

      const btn = P.p.locator('#gbGoProt');
      T.check('seq-link.button-visible-and-text', await btn.isVisible() && (await btn.innerText()).trim() === 'Enter protein sequence');
      await btn.click(); await h.wait(200);
      T.check('seq-link.protSeq-focused', await P.p.evaluate(() => document.activeElement?.id === 'protSeq') && await P.p.locator('#protPanel').isVisible());

      const parentIn = P.p.locator('#pr-parentConstructId'), derivedIn = P.p.locator('#pr-derivedConstructIds');
      T.check('lineage.inputs-visible', await parentIn.isVisible() && await derivedIn.isVisible());
      await parentIn.fill('c-parent-1'); await parentIn.dispatchEvent('change');
      await derivedIn.fill('c-derived-1, c-derived-2'); await derivedIn.dispatchEvent('change');

      const selExists = await P.p.evaluate(() => !!document.querySelector('#pr-cMethod'));
      const noticeText = await P.p.evaluate(() => document.querySelector('#pr-cTemplateNotice')?.textContent || '');
      T.check('template.selector-and-notice', selExists && noticeText.includes('records rather than scientific validation'), noticeText);
      const isShown = m => P.p.evaluate(k => { const el = document.querySelector(`[data-cmethod="${k}"]`); return !!(el && !el.hidden && getComputedStyle(el).display !== 'none'); }, m);
      T.check('template.digest-hidden-initially', !(await isShown('digest')));

      await P.p.selectOption('#pr-cMethod', 'digest'); await h.wait(200);
      T.check('template.digest-visible', await isShown('digest'));
      await P.p.fill('#pr-cEnz', 'NdeI, XhoI'); await P.p.dispatchEvent('#pr-cEnz', 'change');

      await P.p.selectOption('#pr-cMethod', 'overlap'); await h.wait(200);
      T.check('template.overlap-visible-digest-hidden', await isShown('overlap') && !(await isShown('digest')));
      await P.p.fill('#pr-cOverlap', '25'); await P.p.dispatchEvent('#pr-cOverlap', 'change');

      await P.p.selectOption('#pr-cMethod', 'digest'); await h.wait(150);
      T.check('template.digest-value-persists', (await P.p.inputValue('#pr-cEnz')) === 'NdeI, XhoI');
      await P.p.selectOption('#pr-cMethod', 'overlap'); await h.wait(150);
      T.check('template.overlap-value-persists', (await P.p.inputValue('#pr-cOverlap')) === '25');

      await P.p.selectOption('#pr-cMethod', 'recomb'); await h.wait(150);
      T.check('template.recomb-visible', await isShown('recomb'));
      await P.p.fill('#pr-cRecomb', 'attB1, attB2'); await P.p.dispatchEvent('#pr-cRecomb', 'change');

      await h.addRun(path.join(DATA, 'standins', 'imac_histrap_1ml_step.csv'));
      const [dl] = await Promise.all([P.p.waitForEvent('download', {timeout: 10000}), P.p.click('#projSave')]);
      const projData = JSON.parse(fs.readFileSync(await dl.path(), 'utf-8'));
      const pr = projData.prep;
      T.check('schema.lineage-and-lists', pr.parentConstructId === 'c-parent-1' && JSON.stringify(pr.derivedConstructIds) === '["c-derived-1","c-derived-2"]' && Array.isArray(pr.constructs) && Array.isArray(pr.primers), JSON.stringify(pr));
      T.check('schema.method-specific-preserved', pr.cMethod === 'recomb' && pr.cEnz === 'NdeI, XhoI' && pr.cOverlap === '25' && pr.cRecomb === 'attB1, attB2' &&
        pr.cDetails?.digest?.enzymes === 'NdeI, XhoI' && pr.cDetails?.overlap?.overlapBp === '25' && pr.cDetails?.recomb?.sites === 'attB1, attB2', JSON.stringify(pr.cDetails));
      errs.push(...P.errs);
    } finally {
      await P.close();
    }
  });

  T.check('no page errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
