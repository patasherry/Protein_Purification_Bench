const {open, H, suite} = require('../lib/harness');

(async () => {
  const T = suite('1661_construct_protein_subcategories');

  await T.t('construct_panel_and_sequence_priority', async () => {
    const {p, errs, close} = await open(), h = H(p);
    await h.newProject('Construct Subcategories');

    const g = await p.evaluate(() => {
      const box = sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return {
          vis: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
          top: Math.round(r.top),
          bottom: Math.round(r.bottom)
        };
      };
      const subs = rootSel => [...document.querySelectorAll(`${rootSel} .subhead`)].map(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return {
          text: el.textContent.trim(),
          vis: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
          top: Math.round(r.top),
          bottom: Math.round(r.bottom)
        };
      });
      return {
        prep: box('#prepPanel'),
        prot: box('#protPanel'),
        foot: box('#stepFoot'),
        more: box('#moreOpts'),
        seq: box('#protSeq'),
        tagPreset: box('#o-tagPreset2'),
        epsMode: box('#o-epsMode'),
        eps: box('#o-eps'),
        pdb: box('#pdbCode'),
        parentId: box('#pr-parentConstructId'),
        derivedIds: box('#pr-derivedConstructIds'),
        cMethod: box('#pr-cMethod'),
        notice: box('#pr-cTemplateNotice'),
        protSubs: subs('#protPanel'),
        conSubs: subs('[data-sub="pcon"]')
      };
    });

    T.check(
      'prot_panel_below_prep_above_more',
      !!(g.prep && g.prot && g.foot && g.more && g.prep.vis && g.prot.vis && g.foot.vis && g.more.vis &&
        g.prep.bottom <= g.prot.top + 2 && g.prot.bottom <= g.foot.top + 2 && g.prot.bottom <= g.more.top + 2),
      `prep=${JSON.stringify(g.prep)} prot=${JSON.stringify(g.prot)} foot=${JSON.stringify(g.foot)} more=${JSON.stringify(g.more)}`
    );

    T.check(
      'seq_and_tag_above_overrides_and_pdb',
      !!(g.seq && g.tagPreset && g.epsMode && g.pdb && g.seq.vis && g.tagPreset.vis && g.epsMode.vis && g.pdb.vis &&
        g.seq.top < g.epsMode.top && g.tagPreset.top < g.epsMode.top && g.epsMode.top < g.pdb.top),
      `seq=${g.seq && g.seq.top} tag=${g.tagPreset && g.tagPreset.top} eps=${g.epsMode && g.epsMode.top} pdb=${g.pdb && g.pdb.top}`
    );

    const extSub = g.protSubs.find(s => /Extinction & mass overrides/i.test(s.text));
    const pdbSub = g.protSubs.find(s => /3D structure \(optional\)/i.test(s.text));
    const linSub = g.conSubs.find(s => /Lineage & cloning record \(optional\)/i.test(s.text));

    T.check(
      'subheads_visible_and_ordered',
      !!(extSub && extSub.vis && extSub.bottom <= g.epsMode.top + 2 &&
        pdbSub && pdbSub.vis && g.epsMode.bottom <= pdbSub.top + 2 && pdbSub.bottom <= g.pdb.top + 2 &&
        linSub && linSub.vis && linSub.bottom <= g.parentId.top + 2 && linSub.bottom <= g.cMethod.top + 2 &&
        g.parentId.vis && g.derivedIds.vis && g.cMethod.vis && g.notice.vis && g.epsMode.vis && g.eps.vis),
      `protSubs=${JSON.stringify(g.protSubs)} conSubs=${JSON.stringify(g.conSubs)}`
    );

    const what = ((await p.textContent('#ssWhat')) || '').trim();
    const notice = ((await p.textContent('#pr-cTemplateNotice')) || '').trim();
    T.check(
      'sswhat_concise_not_duplicated',
      /Paste the protein sequence/i.test(what) &&
        !/records rather than scientific validation/i.test(what) &&
        /records rather than scientific validation/i.test(notice),
      `ssWhat="${what}" notice="${notice}"`
    );

    const initTagSeqVis = await p.locator('#tagSeq').isVisible();
    const initTagPosVis = await p.locator('#o-tagPos').isVisible();
    T.check(
      'tag_fields_hidden_when_no_tag',
      !initTagSeqVis && !initTagPosVis,
      `tagSeqVis=${initTagSeqVis} tagPosVis=${initTagPosVis}`
    );

    const emptyWrapDisp = await p.$eval('#protPanel .tablewrap', e => getComputedStyle(e).display);
    await p.fill('#protSeq', 'MKTAYIAKQRQISFVX');
    await p.dispatchEvent('#protSeq', 'input');
    await p.dispatchEvent('#protSeq', 'change');
    await h.wait(150);
    const unkTableVis = await p.locator('#protTable').isVisible();
    const unkText = ((await p.textContent('#protTable')) || '').trim();
    await p.fill('#protSeq', '');
    await p.dispatchEvent('#protSeq', 'input');
    await p.dispatchEvent('#protSeq', 'change');
    await h.wait(150);
    const clearedWrapDisp = await p.$eval('#protPanel .tablewrap', e => getComputedStyle(e).display);
    const clearedTableVis = await p.locator('#protTable').isVisible();
    T.check(
      'prot_table_auto_hides_empty_and_shows_unknown_residue',
      emptyWrapDisp === 'none' && unkTableVis && /unknown residue/i.test(unkText) && clearedWrapDisp === 'none' && !clearedTableVis,
      `emptyDisp=${emptyWrapDisp} unkVis=${unkTableVis} unkText="${unkText}" clearedDisp=${clearedWrapDisp} clearedVis=${clearedTableVis}`
    );

    await p.fill('#panelSearch', 'tag sequence');
    await h.wait(150);
    const searchSeqVis = await p.locator('#tagSeq').isVisible();
    await p.fill('#panelSearch', '');
    await h.wait(150);
    const afterClearVis = await p.locator('#tagSeq').isVisible();
    T.check(
      'tag_fields_searchable_when_no_tag',
      searchSeqVis && !afterClearVis,
      `searchSeqVis=${searchSeqVis} afterClearVis=${afterClearVis}`
    );

    const subVis = async () => p.evaluate(() => {
      const v = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
      };
      const findSub = (root, re) => [...document.querySelectorAll(`${root} .subhead`)].find(s => re.test(s.textContent));
      return {
        ext: v(findSub('#protPanel', /Extinction & mass overrides/i)),
        pdb: v(findSub('#protPanel', /3D structure \(optional\)/i)),
        lin: v(findSub('[data-sub="pcon"]', /Lineage & cloning record \(optional\)/i))
      };
    });

    await p.fill('#panelSearch', 'extinction');
    await h.wait(150);
    const qExt = {
      epsMode: await p.locator('#o-epsMode').isVisible(),
      eps: await p.locator('#o-eps').isVisible(),
      empty: await p.locator('#searchEmpty').isVisible(),
      subs: await subVis()
    };

    await p.fill('#panelSearch', '3d structure');
    await h.wait(150);
    const qPdb = {
      pdbCode: await p.locator('#pdbCode').isVisible(),
      empty: await p.locator('#searchEmpty').isVisible(),
      subs: await subVis()
    };

    await p.fill('#panelSearch', 'lineage');
    await h.wait(150);
    const qLin = {
      parent: await p.locator('#pr-parentConstructId').isVisible(),
      derived: await p.locator('#pr-derivedConstructIds').isVisible(),
      empty: await p.locator('#searchEmpty').isVisible(),
      subs: await subVis()
    };

    await p.fill('#panelSearch', 'plasmid name');
    await h.wait(150);
    const qPlasmid = {
      name: await p.locator('#pr-name').isVisible(),
      empty: await p.locator('#searchEmpty').isVisible(),
      subs: await subVis()
    };

    await p.fill('#panelSearch', 'sequence');
    await h.wait(150);
    const qSeq = {
      protSeq: await p.locator('#protSeq').isVisible(),
      empty: await p.locator('#searchEmpty').isVisible(),
      subs: await subVis()
    };

    await p.fill('#panelSearch', '');
    await h.wait(150);
    const qClear = {
      tagSeq: await p.locator('#tagSeq').isVisible(),
      tagPos: await p.locator('#o-tagPos').isVisible(),
      empty: await p.locator('#searchEmpty').isVisible(),
      subs: await subVis()
    };

    T.check(
      'subhead_groups_searchable_without_orphans',
      qExt.epsMode && qExt.eps && !qExt.empty && qExt.subs.ext && !qExt.subs.pdb &&
        qPdb.pdbCode && !qPdb.empty && qPdb.subs.pdb && !qPdb.subs.ext &&
        qLin.parent && qLin.derived && !qLin.empty && qLin.subs.lin &&
        qPlasmid.name && !qPlasmid.empty && !qPlasmid.subs.lin &&
        qSeq.protSeq && !qSeq.empty && !qSeq.subs.ext && !qSeq.subs.pdb && !qSeq.subs.lin &&
        !qClear.tagSeq && !qClear.tagPos && !qClear.empty && qClear.subs.ext && qClear.subs.pdb && qClear.subs.lin,
      `ext=${JSON.stringify(qExt)} pdb=${JSON.stringify(qPdb)} lin=${JSON.stringify(qLin)} plasmid=${JSON.stringify(qPlasmid)} seq=${JSON.stringify(qSeq)} clear=${JSON.stringify(qClear)}`
    );

    await p.selectOption('#o-tagPreset2', 'sumo');
    await h.wait(150);
    const sumoSeqVis = await p.locator('#tagSeq').isVisible();
    const sumoPosVis = await p.locator('#o-tagPos').isVisible();

    await p.selectOption('#o-tagPreset2', '');
    await h.wait(150);
    const backNoTagVis = await p.locator('#tagSeq').isVisible();

    await p.selectOption('#o-tagPreset2', 'custom');
    await h.wait(150);
    const customSeqVis = await p.locator('#tagSeq').isVisible();
    await p.fill('#tagSeq', 'WSHPQFEK');
    await p.dispatchEvent('#tagSeq', 'change');
    await h.wait(500);

    await p.reload();
    await h.wait(800);
    if (await p.locator('#projList .pcard').first().isVisible()) {
      await p.locator('#projList .pcard', {hasText: 'Construct Subcategories'}).first().click();
      await h.wait(600);
    }
    await h.step('construct');
    await h.wait(200);
    const reloadSeqVis = await p.locator('#tagSeq').isVisible();
    const reloadVal = await p.$eval('#tagSeq', e => e.value);

    T.check(
      'tag_fields_visible_on_preset_and_reload',
      sumoSeqVis && sumoPosVis && !backNoTagVis && customSeqVis && reloadSeqVis && reloadVal === 'WSHPQFEK',
      `sumo=${sumoSeqVis}/${sumoPosVis} backNoTag=${backNoTagVis} custom=${customSeqVis} reload=${reloadSeqVis} val="${reloadVal}"`
    );

    T.check('no_page_errors', errs.length === 0, errs.join(' | '));
    await close();
  });

  T.done();
})();
