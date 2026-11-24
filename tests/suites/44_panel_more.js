// 44 panel more: rarely used settings sit under a "More options" disclosure in their section; a changed setting stays visible; the search box finds them. UI and DOM only.
const {open, H, suite, src} = require('../lib/harness');

(async () => {
  const T = suite('44_panel_more'), {p, errs, close} = await open(), h = H(p);
  const vis = sel => p.locator(sel).isVisible();
  const more = '#panel details.more[data-more="Figure style"]';

  await T.t('panel_more', async () => {
    await p.click('#homeQuick'); await h.wait(1200);
    T.check('line_width_hidden_at_first', await p.locator('#o-lw').count() === 1 && !(await vis('#o-lw')), 'Line width should start under More options');
    T.check('common_setting_visible', await vis('#o-w'), 'Width stays in view');
    await p.locator(more + ' > summary').click(); await h.wait(200);
    T.check('more_options_shows_it', await vis('#o-lw'), 'Line width visible after clicking More options');
    await p.locator(more + ' > summary').click(); await h.wait(200);
    T.check('closes_again', !(await vis('#o-lw')), 'closed again');

    /* search finds it, and clearing restores the closed state */
    await p.fill('#panelSearch', 'line width'); await h.wait(250);
    T.check('search_shows_it', await vis('#o-lw'), 'typing the label shows the control');
    T.check('search_hides_others', !(await vis('#o-fs')), 'other controls are filtered out');
    await p.fill('#panelSearch', ''); await h.wait(250);
    T.check('search_clear_restores', !(await vis('#o-lw')) && await vis('#o-fs'), 'back to the first look');

    /* a changed setting is never hidden, also after a reload */
    await p.locator(more + ' > summary').click(); await h.wait(150);
    await p.fill('#o-lw', '1.5'); await p.dispatchEvent('#o-lw', 'input'); await p.dispatchEvent('#o-lw', 'change'); await h.wait(400);
    await p.locator(more + ' > summary').click(); await h.wait(150);
    await p.reload(); await h.wait(900); await p.click('#homeQuick'); await h.wait(1200);
    T.check('changed_stays_visible_after_reload', await vis('#o-lw') && (await p.inputValue('#o-lw')) === '1.5', 'line width 1.5 visible');
  });

  /* UI fixes for hidden options and cut-off labels (#659, #591) */
  await T.t('findable_options_and_labels', async () => {
    // 1. Home quick button
    await p.click('#homeBtn'); await h.wait(400);
    const hq = p.locator('#homeQuick');
    const hqClass = await hq.getAttribute('class');
    const hqText = await hq.textContent();
    T.check('home_quick_button_look', !/quiet/.test(hqClass) && /btn/.test(hqClass), 'homeQuick has button styling');
    T.check('home_quick_mentions_example_data', /example data/i.test(hqText), hqText);

    // 2. Trace names in quick mode & detect button
    await p.click('#homeQuick'); await h.wait(1200);
    const traceName = p.locator('.trace .thead input[type=text]').first();
    const tVal = await traceName.inputValue();
    const tTitle = await traceName.getAttribute('title');
    const tEllipsis = await traceName.evaluate(e => getComputedStyle(e).textOverflow);
    T.check('trace_name_has_title', tTitle === tVal && tTitle.length > 0, `title: ${tTitle}`);
    T.check('trace_name_has_ellipsis', tEllipsis === 'ellipsis', `text-overflow: ${tEllipsis}`);

    // Detect button
    const detBtn = p.locator('.trace button[data-act="detect"]').first();
    const detText = (await detBtn.textContent()).trim();
    T.check('detect_button_says_detect_peaks', detText === 'Detect peaks', detText);

    // 3. Zoom inset in Window section (not Axes)
    const zoomSec = await p.evaluate(() => {
      const el = document.getElementById('o-zoomInset');
      const h2 = el && el.closest('section') && el.closest('section').querySelector('h2');
      return h2 && h2.firstChild ? h2.firstChild.textContent.trim() : null;
    });
    T.check('zoom_inset_in_window_section', zoomSec === 'Window', `Show Inset View is in section: ${zoomSec}`);

    // 4. UV path input width fits "assumed: 2" and More options links in project
    await p.click('#homeBtn'); await h.wait(400);
    await h.newProject('Visual checks');
    await h.addRun(src('s200'));
    const pathInput = p.locator('.cardopts input[data-k="path"]').first();
    const pathWidth = await pathInput.evaluate(e => e.getBoundingClientRect().width);
    T.check('uv_path_input_fits_placeholder', pathWidth >= 65, `path width: ${pathWidth}px`);

    // More options what links clickable
    const secLink = p.locator('#moreWhat [data-more-sec="Size exclusion (SEC)"]');
    T.check('more_what_sec_link_exists', (await secLink.count()) === 1, 'SEC link in moreWhat');
    await secLink.click(); await h.wait(400);
    T.check('sec_col_visible_after_clicking_more_what', await vis('#sec-col'), 'SEC column selector visible');

    // 5. Workflow full chromatogram visible by default
    await h.step('figure'); await h.wait(400);
    T.check('wf_full_visible_by_default', await vis('#o-wfFull'), 'Full chromatogram checkbox visible');

    // 6. Check search placeholder text (#895)
    const searchPlaceholder = await p.getAttribute('#panelSearch', 'placeholder');
    T.check('search_placeholder_text', searchPlaceholder === 'Search settings/data/files', 'Search placeholder should be "Search settings/data/files" to reduce ambiguity');

    // 7. Project name field has an explicit visible label beside it that stays visible at narrow width (#1038)
    await p.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
    const projLab = p.locator('label[for="projName"]');
    const projLabText = (await projLab.count()) ? (await projLab.textContent()).trim() : '';
    const projPlaceholder = await p.getAttribute('#projName', 'placeholder');
    T.check('proj_name_label_visible', (await projLab.count()) === 1 && (await projLab.isVisible()) && /^project(\s+name)?$/i.test(projLabText) && /^project(\s+name)?$/i.test(projPlaceholder || ''), `label="${projLabText}" placeholder="${projPlaceholder}"`);
    const {p: pNarrow, errs: errsN, close: closeN} = await open({width: 390, height: 844}), hN = H(pNarrow);
    await hN.newProject('UX save');
    await pNarrow.evaluate(() => { const d = document.querySelector('details.proj-settings'); if (d) d.open = true; });
    const narrowGeom = await pNarrow.evaluate(() => {
      const lab = document.querySelector('label[for="projName"]'), inp = document.getElementById('projName');
      if (!lab || !inp) return null;
      const lr = lab.getBoundingClientRect(), ir = inp.getBoundingClientRect(), cs = getComputedStyle(lab);
      return {
        vis: lr.width > 0 && lr.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0,
        inView: lr.left >= 0 && lr.right <= window.innerWidth && ir.left >= 0 && ir.right <= window.innerWidth,
        beside: lr.right <= ir.left + 2 && Math.abs((lr.top + lr.bottom) / 2 - (ir.top + ir.bottom) / 2) < 16,
        inpW: ir.width,
        noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1
      };
    });
    T.check('proj_name_label_narrow_visible', !!narrowGeom && narrowGeom.vis && narrowGeom.inView && narrowGeom.beside && narrowGeom.inpW >= 60 && narrowGeom.noHScroll, JSON.stringify(narrowGeom));
    errs.push(...errsN);
    await closeN();
  });


  await T.t('gel-meta-tooltip', async () => {
    try {
        await p.setInputFiles('#file', [require('path').join(__dirname, '../data/chrom/fixture_gauss_resolved.csv')]);
        await p.waitForTimeout(500);

        await p.setInputFiles('#file', [require('path').join(__dirname, '../data/qa/picture.jpg')]);
        await p.waitForTimeout(500);

        await p.evaluate(() => {
          const selectEl = document.querySelector('#laneTable .lrow select[data-lk="assign"]');
          if (selectEl) {
             selectEl.selectedIndex = 2; // the run
             selectEl.dispatchEvent(new Event('change', {bubbles: true}));
          }
        });
        await p.waitForTimeout(500);

        const htmlContent = await p.evaluate(() => {
           const el = document.querySelector('.gelc .meta');
           return el ? el.innerHTML : 'no-meta';
        });
        T.check('gel-meta-tooltip.has-title', htmlContent.includes('<span title="fixture gauss resolved">fixture gauss res…</span>'), 'HTML: ' + htmlContent);
    } catch(e) {
        T.check('gel-meta-tooltip.has-title', false, 'Timeout or Error: ' + e.message);
    }
  });

  await T.t('search_savitzky_cards_and_empty', async () => {
    await p.setInputFiles('#file', src('ndSpec'));
    await h.wait(500);
    await h.step('figure');
    await h.wait(300);

    await p.fill('#panelSearch', 'Savitzky');
    await h.wait(250);
    const smoothShown = await vis('#o-smooth');
    await p.fill('#panelSearch', 'SEC calibrations');
    await h.wait(250);
    const fsHiddenOnHint = !(await vis('#o-fs'));
    T.check('search_savitzky_without_hint_bleed', smoothShown && fsHiddenOnHint, `smooth=${smoothShown} fsHidden=${fsHiddenOnHint}`);

    await p.fill('#panelSearch', 'S200');
    await h.wait(250);
    const traceVis = await p.$$eval('#list .trace', els => els.filter(e => !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none').map(e => {
      const inp = e.querySelector('.thead input[type=text]');
      return inp ? inp.value : e.textContent.trim();
    }));
    T.check('search_matches_trace_card', traceVis.length === 1 && /S200/i.test(traceVis[0]), JSON.stringify(traceVis));

    await p.fill('#panelSearch', 'Sample 2');
    await h.wait(250);
    const ndVis = await p.$$eval('#ndList .ndr', els => els.filter(e => !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none').map(e => {
      const inp = e.querySelector('input[data-ndk="name"]');
      return inp ? inp.value : e.textContent.trim();
    }));
    T.check('search_matches_nd_card', ndVis.length === 1 && ndVis[0] === 'Sample 2', JSON.stringify(ndVis));

    await p.fill('#panelSearch', 'zzzznonexistent');
    await h.wait(250);
    const emptyVis = await vis('#searchEmpty');
    const ph = await p.getAttribute('#panelSearch', 'placeholder');
    await p.fill('#panelSearch', '');
    await h.wait(250);
    const emptyCleared = !(await vis('#searchEmpty'));
    T.check('search_empty_state_hint', emptyVis && emptyCleared && ph === 'Search settings/data/files', `emptyVis=${emptyVis} emptyCleared=${emptyCleared} ph=${ph}`);
  });

  /* #431, #936, #1060: UI tokens/switches/reduced-motion, timeline 'Add run' & '+' stage controls, and 2-line trace title clamping in existing browser */
  await T.t('ui_tokens_timeline_buttons_and_trace_wrap', async () => {
    await h.step('figure'); await h.wait(250);
    const ui = await p.evaluate(() => {
      const px = s => parseFloat(s) || 0;
      const prim = [...document.querySelectorAll('.btn.primary')].find(e => e.getClientRects().length) || document.querySelector('.btn.primary');
      const pc = prim ? getComputedStyle(prim) : null, pr = prim ? prim.getBoundingClientRect() : null;
      const cb = document.querySelector('#panel input[type=checkbox]'), cs = cb ? getComputedStyle(cb) : null, ca = cb ? getComputedStyle(cb, '::after') : null;
      const seg = document.querySelector('#panel .seg'), segL = seg ? seg.querySelector('label') : null;
      const grp = document.querySelector('#panel > .grp'), h2 = grp ? grp.querySelector('h2') : null;
      const root = getComputedStyle(document.documentElement), svg = document.querySelector('#paper svg');
      const tt = document.querySelector('.tl .tt'), tts = tt ? getComputedStyle(tt) : null;
      const tracesEl = document.querySelector('.traces');
      return {
        primOk: !!(prim && px(pc.borderTopLeftRadius) >= 8 && pr.height >= 31.5),
        swOk: !!(cb && cs.appearance === 'none' && px(cs.width) >= 1.5 * px(cs.height) && px(cs.borderTopLeftRadius) >= px(cs.height) / 2 - 1 && ca.content !== 'none' && ca.content !== 'normal'),
        segOk: !!(seg && segL && px(getComputedStyle(seg).borderTopLeftRadius) >= 8 && px(getComputedStyle(segL).borderTopLeftRadius) >= 6),
        grpOk: !!(grp && h2 && px(getComputedStyle(grp).borderTopLeftRadius) >= 10 && px(getComputedStyle(grp).borderTopLeftRadius) <= 12 && /caps/.test(getComputedStyle(h2).fontVariantCaps) && px(getComputedStyle(h2).fontSize) <= 13.5),
        tokOk: /^-apple-system/.test(getComputedStyle(document.body).fontFamily) && ['--accent', '--ios-blue', '--card', '--sep', '--label', '--label2', '--panel'].every(k => root.getPropertyValue(k).trim()),
        figFontOk: !!(svg && /Arial/.test(svg.getAttribute('font-family') || '') && !/apple-system/.test(svg.getAttribute('font-family') || '')),
        clampOk: !!(tts && tts.whiteSpace === 'normal' && (tts.webkitLineClamp || tts.getPropertyValue('-webkit-line-clamp')) === '2' && tracesEl && getComputedStyle(tracesEl).overflowY === 'auto')
      };
    });
    T.check('ios_look.controls_tokens_and_figure_font', ui.primOk && ui.swOk && ui.segOk && ui.grpOk && ui.tokOk && ui.figFontOk, JSON.stringify(ui));
    T.check('sidebar_wrap.clamp_and_scroll', ui.clampOk, JSON.stringify(ui));

    const wrapH = await p.evaluate(() => {
      const tt = document.querySelector('.tl li .tt');
      if (!tt) return 0;
      const prev = tt.textContent;
      tt.textContent = 'Superdex 200 Increase 10/300 GL - Preparative size-exclusion chromatography of target protein peak';
      const h = tt.offsetHeight;
      tt.textContent = prev;
      return h;
    });
    T.check('sidebar_wrap.long_title_wraps', wrapH > 24, `height=${wrapH}`);

    await p.emulateMedia({reducedMotion: 'reduce'}); await h.wait(100);
    const noTrans = await p.evaluate(() => { const c = document.querySelector('#panel input[type=checkbox]'); return !!c && [getComputedStyle(c).transitionDuration, getComputedStyle(c, '::after').transitionDuration].every(d => d.split(',').every(x => parseFloat(x) === 0)); });
    T.check('ios_look.reduced_motion', noTrans);
    await p.emulateMedia({reducedMotion: 'no-preference'});

    // #936: Add run menu toggle & '+' biological stage button
    const addBtn = p.locator('#tl [data-addmenu]');
    T.check('add_run_button.label', (await addBtn.textContent())?.trim() === 'Add run');
    await addBtn.click(); await h.wait(150);
    T.check('add_run_button.cancel_and_menu', (await addBtn.textContent())?.trim() === 'Cancel' && await p.locator('.tl-menu').isVisible());
    await addBtn.click(); await h.wait(150);
    T.check('add_run_button.restored', (await addBtn.textContent())?.trim() === 'Add run');

    const stageAddBtn = p.locator('.tl-head [data-addstage]').first();
    T.check('stage_header_add_btn', await stageAddBtn.count() >= 1 && (await stageAddBtn.textContent())?.trim() === '+');
    await stageAddBtn.click(); await h.wait(350);
    T.check('stage_header_activates_clone_setup', await p.locator('#tl [data-step="clone:setup"][aria-current="step"]').count() === 1 && await p.locator('#clonePanel [data-cadd]').count() === 1);
  });

  /* #1267: toast placement below header across desktop/phone, click-to-dismiss, and 1-click run/trace deletion Undo */
  await T.t('toast_dismiss_and_card_undo', async () => {
    const pathMod = require('path'), {DATA} = require('../lib/harness');
    const at = await open({width: 1280, height: 860}), {p: pt} = at, ht = H(pt);
    try {
      await ht.newProject('Toast & Undo');
      await ht.addRun(pathMod.join(DATA, 'chrom/valid_unicorn.zip'));
      await ht.pool('T3-T6');

      for (const [k, w] of [['desktop', 1280], ['phone', 390]]) {
        await pt.setViewportSize({width: w, height: 860}); await ht.wait(150);
        await ht.step('final');
        await pt.setInputFiles('#file', pathMod.join(DATA, 'nd/nd_malformed_header.csv'));
        await pt.waitForSelector('#toast .pill', {timeout: 5000});
        const g = await pt.evaluate(() => { const t = document.querySelector('#toast .pill').getBoundingClientRect(), hd = document.querySelector('header.top').getBoundingClientRect(); return {toastTop: t.top, headerBottom: hd.bottom, scrolled: window.scrollY}; });
        const bad = pt.locator('#toast .pill', {hasText: 'no usable measurements'});
        await bad.click(); await ht.wait(150);
        T.check(`toast_${k}_below_header_and_dismisses`, (g.scrolled > 0 || g.toastTop >= g.headerBottom - 0.5) && (await bad.count()) === 0, JSON.stringify(g));
      }

      await pt.setViewportSize({width: 1280, height: 860});
      const csvRows = ['Time (min),UV 280 (mAU)'];
      for (let i = 0; i <= 100; i++) { const t = i / 20; csvRows.push(`${t.toFixed(2)},${(2 + 80 * Math.exp(-0.5 * ((t - 2.5) / 0.1) ** 2)).toFixed(3)}`); }
      await ht.addRun({name: 'synthetic_trace.csv', mimeType: 'text/csv', buffer: Buffer.from(csvRows.join('\n') + '\n')});

      const rid = (await ht.timeline()).find(x => x.k.startsWith('run:')).k.slice(4);
      await ht.step('run:' + rid);
      await pt.locator(`#list .trace.run[data-id="${rid}"] [data-act="del"]`).click(); await ht.wait(250);
      T.check('undo/run-immediate-removal', (await pt.locator(`#list .trace.run[data-id="${rid}"]`).count()) === 0);
      await pt.locator('#toast .pill button', {hasText: 'Undo'}).click(); await ht.wait(350);
      T.check('undo/run-and-pool-restored', await pt.locator(`#list .trace.run[data-id="${rid}"]`).isVisible() && (await pt.locator(`#list .trace.run[data-id="${rid}"] [data-k="shade"]`).inputValue()) === 'T3-T6');

      await ht.step('hplc');
      await pt.locator('#list .trace[data-kind="trace"] [data-act="del"]').first().click(); await ht.wait(250);
      T.check('undo/trace-immediate-removal', (await pt.locator('#list .trace[data-kind="trace"]').count()) === 0);
      await pt.locator('#toast .pill button', {hasText: 'Undo'}).click(); await ht.wait(350);
      T.check('undo/trace-restored', (await pt.locator('#list .trace[data-kind="trace"]').count()) === 1);
      errs.push(...at.errs);
    } finally { await at.close(); }
  });

  T.check('no_errors', !errs.length, errs.join('|'));
  await close();
  if (T.done) T.done();
})();
