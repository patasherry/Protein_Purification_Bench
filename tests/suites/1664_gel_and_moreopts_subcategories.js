// 1664 gel and moreopts subcategories: Project UI auto-collapses auto-cropped gel sliders, groups band styling under More options, filters step shortcut links, and guards #spec2 on step figures. UI and DOM only.
const {open, H, suite, src} = require('../lib/harness');

const hplcCsv = () => {
  const rows = ['Time (min),UV 280 (mAU)'];
  for (let i = 0; i <= 400; i++) {
    const t = i / 100;
    rows.push(`${t.toFixed(2)},${(2 + 80 * Math.exp(-0.5 * ((t - 2) / 0.08) ** 2)).toFixed(3)}`);
  }
  return rows.join('\n') + '\n';
};

async function makeSyntheticGels(p) {
  const urls = await p.evaluate(() => {
    const draw = dark => {
      const W = 400, Hh = 300, c = document.createElement('canvas');
      c.width = W; c.height = Hh;
      const ctx = c.getContext('2d'), im = ctx.createImageData(W, Hh);
      const lanes = [40, 80, 120, 160, 200, 240, 280, 320, 360];
      const ladderY = [50, 90, 130, 170, 210, 250], sampleY = [110, 190];
      for (let y = 0; y < Hh; y++) {
        for (let x = 0; x < W; x++) {
          let sig = 0;
          for (let li = 0; li < lanes.length; li++) {
            const dx = x - lanes[li];
            if (Math.abs(dx) > 16) continue;
            const wx = Math.exp(-0.5 * (dx / 5) ** 2);
            const ys = li === 0 ? ladderY : sampleY;
            for (let bi = 0; bi < ys.length; bi++) {
              const dy = y - ys[bi];
              if (Math.abs(dy) > 12) continue;
              sig += wx * Math.exp(-0.5 * (dy / 3) ** 2);
            }
          }
          if (sig > 1) sig = 1;
          const v = dark ? Math.round(6 + 234 * sig) : Math.round(242 - 205 * sig);
          const j = 4 * (y * W + x);
          im.data[j] = v; im.data[j + 1] = v; im.data[j + 2] = dark ? Math.min(255, v + 2) : v; im.data[j + 3] = 255;
        }
      }
      ctx.putImageData(im, 0, 0);
      return c.toDataURL('image/png');
    };
    const drawBlank = () => {
      const W = 400, Hh = 300, c = document.createElement('canvas');
      c.width = W; c.height = Hh;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgb(242,242,242)';
      ctx.fillRect(0, 0, W, Hh);
      return c.toDataURL('image/png');
    };
    return {bright: draw(false), dark: draw(true), blank: drawBlank()};
  });
  return {
    brightBuf: Buffer.from(urls.bright.split(',')[1], 'base64'),
    darkBuf: Buffer.from(urls.dark.split(',')[1], 'base64'),
    blankBuf: Buffer.from(urls.blank.split(',')[1], 'base64')
  };
}

(async () => {
  const T = suite('1664_gel_and_moreopts_subcategories');
  const {p, errs, close} = await open(), h = H(p);
  const vis = sel => p.locator(sel).isVisible();

  try {
    await T.t('morewhat_step_filtering_and_spec2_guard', async () => {
      await h.newProject('M4 Step Filtering');
      T.check('moreopts_visible_on_construct', await vis('#moreOpts'), '#moreOpts visible on Construct');
      const constructInner = (await p.locator('#moreWhat').innerText()).trim();
      const constructText = (await p.locator('#moreWhat').textContent()).trim();
      T.check('construct_morewhat_only_style', constructInner === 'style' && constructText === 'style', `Construct #moreWhat: "${constructInner}"`);
      T.check('construct_style_link_visible', await vis('#moreWhat [data-more-sec="Figure style"]'), 'Figure style link visible on Construct');
      T.check('construct_window_link_filtered', (await p.locator('#moreWhat [data-more-sec="Window"]').count()) === 0, 'Window link filtered out on Construct');

      await p.locator('#moreWhat [data-more-sec="Figure style"]').click();
      await h.wait(300);
      T.check('construct_clicking_style_opens_section', await vis('#o-fs'), 'Clicking style opens Figure style');
      await p.click('#moreBtn');
      await h.wait(250);

      await h.addRun({name: 'synthetic_hplc.csv', mimeType: 'text/csv', buffer: Buffer.from(hplcCsv())});
      const hplcSpec2 = (await p.locator('#spec2').textContent()).trim();
      T.check('hplc_step_shows_peak_hint', hplcSpec2.includes('Click a peak to label it'), `HPLC #spec2: "${hplcSpec2}"`);

      await h.step('construct');
      const constructSpec2 = (await p.locator('#spec2').textContent()).trim();
      T.check('construct_spec2_no_peak_hint', !constructSpec2.includes('Click a peak to label it'), `Construct #spec2: "${constructSpec2}"`);

      await h.addRun(src('his'));
      const imacMore = (await p.locator('#moreWhat').innerText()).trim();
      T.check('imac_morewhat_links', imacMore === 'Window, peaks, axes and style', `IMAC #moreWhat: "${imacMore}"`);

      await h.addRun(src('s200'));
      const secMore = (await p.locator('#moreWhat').innerText()).trim();
      T.check('sec_morewhat_links', secMore === 'Window, peaks, size exclusion, axes and style', `SEC #moreWhat: "${secMore}"`);
      T.check('sec_morewhat_sec_button_visible', await vis('#moreWhat [data-more-sec="Size exclusion (SEC)"]'), 'SEC shortcut button visible on SEC run');
    });

    await T.t('gel_autocrop_collapse_dark_override_persistence_and_quick_mode', async () => {
      const {brightBuf, darkBuf, blankBuf} = await makeSyntheticGels(p);
      const imacStep = await p.locator('#tl [data-step^="run:"]').first().getAttribute('data-step');
      await h.step(imacStep);

      await p.setInputFiles('#gelFile', {name: 'synthetic_bright_gel.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);

      const gcropOpen1 = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const stCrop1 = (await p.locator('#st-crop').innerText()).trim();
      const sv1 = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      const foldGeom = await p.evaluate(() => {
        const sec = document.querySelector('#panel section.grp[data-for="gel"]').getBoundingClientRect();
        const lb = document.getElementById('g-labels').getBoundingClientRect();
        return lb.top - sec.top;
      });
      T.check('bright_gel_gcrop_closed_in_project', !gcropOpen1 && !(await vis('#g-cl')), `gcrop open=${gcropOpen1}`);
      T.check('bright_gel_st_crop_auto_cropped', (await vis('#st-crop')) && stCrop1.includes('auto cropped'), `#st-crop: "${stCrop1}"`);
      T.check('bright_gel_glanes_open_above_fold', (await vis('#g-labels')) && foldGeom > 0 && foldGeom < 180, `g-labels offset from gel section top: ${Math.round(foldGeom)}px`);
      T.check('bright_gel_no_localstorage_pollution', sv1 === null, `hfb-sub-gcrop: ${sv1}`);

      await p.setInputFiles('#gelFile', {name: 'synthetic_dark_gel.png', mimeType: 'image/png', buffer: darkBuf});
      await h.wait(700);
      const gcropOpenDark = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const svDark = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('dark_gel_gcrop_auto_opens', gcropOpenDark && (await vis('#g-invert')) && (await vis('#g-darkHint')), `dark gcrop open=${gcropOpenDark}`);
      T.check('dark_gel_no_localstorage_pollution', svDark === null, `dark hfb-sub-gcrop: ${svDark}`);

      await p.setInputFiles('#gelFile', {name: 'synthetic_bright_gel_2.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);
      const gcropReclosed = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      T.check('bright_gel_recollapses_gcrop', !gcropReclosed && !(await vis('#g-cl')), `reclosed gcrop open=${gcropReclosed}`);

      await p.locator('#panel details.sub[data-sub="gcrop"] > summary').click();
      await h.wait(200);
      const svManual = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('manual_open_persists_localstorage', (await vis('#g-cl')) && svManual === '1', `manual hfb-sub-gcrop: ${svManual}`);

      await p.fill('#g-labels', 'M, Lys, FT, W1, E1, E2, E3, E4, Pool');
      await p.dispatchEvent('#g-labels', 'input');
      await h.wait(350);
      T.check('manual_open_survives_rerender', await vis('#g-cl'), 'gcrop stays open across re-renders after manual open');

      await p.evaluate(() => localStorage.removeItem('hfb-sub-gcrop'));
      await p.fill('#g-labels', 'M, Lys, FT, W, E1, E2, E3, E4, Pool');
      await p.dispatchEvent('#g-labels', 'input');
      await h.wait(350);
      T.check('cleared_pref_collapses_in_project', !(await vis('#g-cl')), 'gcrop auto-collapsed before #panelSearch check');

      await p.fill('#panelSearch', 'Trim left');
      await h.wait(250);
      const svDuringSearch = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('search_trim_left_expands_gcrop', await vis('#g-cl'), '#panelSearch Trim left reveals #g-cl');
      T.check('search_trim_left_preserves_null_pref', svDuringSearch === null, `during search hfb-sub-gcrop: ${svDuringSearch}`);

      await p.fill('#panelSearch', '');
      await h.wait(250);
      const svAfterClear = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('search_clear_recollapses_gcrop', !(await vis('#g-cl')), 'clearing #panelSearch re-collapses gcrop');
      T.check('search_clear_preserves_null_pref', svAfterClear === null, `after clear hfb-sub-gcrop: ${svAfterClear}`);

      await p.setInputFiles('#gelFile', {name: 'synthetic_blank_bright_gel.png', mimeType: 'image/png', buffer: blankBuf});
      await h.wait(700);
      const stBlank = (await p.locator('#st-crop').innerText()).trim();
      const blankOpen = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const svBlank = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('uncropped_bright_gel_opens_gcrop_after_search', blankOpen && (await vis('#g-cl')) && stBlank === 'full image' && svBlank === null, `blankOpen=${blankOpen}, st="${stBlank}", sv=${svBlank}`);

      await p.setInputFiles('#gelFile', {name: 'synthetic_bright_gel_3.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);
      T.check('bright_gel_recollapses_after_uncropped_gel', !(await vis('#g-cl')), 'multi-lane bright gel re-collapses gcrop');

      await h.step(imacStep);
      await p.fill('#panelSearch', 'Window');
      await h.wait(200);
      await p.setInputFiles('#gelFile', {name: 'synthetic_midsearch_bright.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);
      await p.fill('#panelSearch', '');
      await h.wait(250);
      const midBrightOpen = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const svMidBright = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('search_before_loading_bright_gel_collapses_on_clear', !midBrightOpen && !(await vis('#g-cl')) && svMidBright === null, `midBrightOpen=${midBrightOpen}, sv=${svMidBright}`);

      await p.fill('#panelSearch', 'Trim left');
      await h.wait(200);
      await p.setInputFiles('#gelFile', {name: 'synthetic_midsearch_dark.png', mimeType: 'image/png', buffer: darkBuf});
      await h.wait(700);
      await p.fill('#panelSearch', '');
      await h.wait(250);
      const midDarkOpen = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const svMidDark = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('search_on_bright_gel_load_dark_gel_keeps_open_on_clear', midDarkOpen && (await vis('#g-invert')) && (await vis('#g-darkHint')) && svMidDark === null, `midDarkOpen=${midDarkOpen}, sv=${svMidDark}`);

      await p.setInputFiles('#gelFile', {name: 'synthetic_midsearch_trim.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);
      await p.fill('#panelSearch', 'Trim left');
      await h.wait(200);
      await p.locator('#g-cl').fill('15');
      await h.wait(400);
      const stTrimMid = (await p.locator('#st-crop').innerText()).trim();
      await p.fill('#panelSearch', '');
      await h.wait(250);
      const midTrimOpen = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const svMidTrim = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('search_trim_edit_keeps_gcrop_open_on_clear', midTrimOpen && (await vis('#g-cl')) && stTrimMid.includes('trimmed') && svMidTrim === null, `midTrimOpen=${midTrimOpen}, st="${stTrimMid}", sv=${svMidTrim}`);

      await p.click('#homeBtn');
      await h.wait(400);
      await p.click('#homeQuick');
      await h.wait(900);
      await p.setInputFiles('#gelFile', {name: 'synthetic_quick_gel.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);
      const quickOpen = await p.locator('#panel details.sub[data-sub="gcrop"]').evaluate(d => d.open);
      const svQuick = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('quick_mode_keeps_gcrop_open', quickOpen && (await vis('#g-cl')) && svQuick === null, `Quick mode gcrop open=${quickOpen}, sv=${svQuick}`);
    });

    await T.t('gbands_more_options_disclosure_search_and_reload', async () => {
      const {brightBuf} = await makeSyntheticGels(p);
      await p.click('#homeBtn');
      await h.wait(400);
      await h.newProject('M4 Bands Disclosure');
      await h.addRun(src('his'));
      const [fc] = await Promise.all([
        p.waitForEvent('filechooser'),
        p.locator('#ssGels [data-gelfor]').click()
      ]);
      await fc.setFiles({name: 'synthetic_bands_gel.png', mimeType: 'image/png', buffer: brightBuf});
      await h.wait(700);
      const runOptVal = await p.locator('#laneTable select[data-lk="assign"]').nth(1).evaluate(sel => sel.options[sel.options.length - 1].value);
      await p.locator('#laneTable select[data-lk="assign"]').nth(1).selectOption(runOptVal);
      await h.wait(250);

      const gbandsMore = '#panel details.sub[data-sub="gbands"] details.more[data-more="sub:gbands"]';
      const structure = await p.evaluate(() => {
        const sub = document.querySelector('#panel details.sub[data-sub="gbands"]');
        const more = sub && sub.querySelector('details.more[data-more="sub:gbands"]');
        const ids = ['o-targetArrow', 'o-tagShow', 'o-purRow', 'o-bandLabels'];
        const allInside = !!more && ids.every(id => { const el = document.getElementById(id); return el && more.contains(el); });
        const emptyWrappers = sub ? [...sub.querySelectorAll(':scope > .row, :scope > .checks')].filter(el => el.children.length === 0).length : -1;
        return {allInside, emptyWrappers};
      });

      T.check('primary_target_names_visible', (await vis('#o-targetName')) && (await vis('#o-taggedName')), 'Target and Tagged name inputs stay visible');
      T.check('band_styling_inside_more_options', structure.allInside, 'All 4 band styling controls reside in sub:gbands More options');
      T.check('no_empty_wrappers_in_gbands', structure.emptyWrappers === 0, `empty .row/.checks wrappers: ${structure.emptyWrappers}`);
      T.check('band_styling_starts_collapsed', !(await vis('#o-targetArrow')) && !(await vis('#o-tagShow')) && !(await vis('#o-purRow')) && !(await vis('#o-bandLabels')), 'Band styling controls start hidden at DEF');

      await p.locator(gbandsMore + ' > summary').click();
      await h.wait(200);
      T.check('clicking_more_reveals_all_four', (await vis('#o-targetArrow')) && (await vis('#o-tagShow')) && (await vis('#o-purRow')) && (await vis('#o-bandLabels')), 'All 4 controls visible when More options opened');

      await p.locator(gbandsMore + ' > summary').click();
      await h.wait(200);
      T.check('clicking_more_again_hides_all_four', !(await vis('#o-targetArrow')) && !(await vis('#o-tagShow')) && !(await vis('#o-purRow')) && !(await vis('#o-bandLabels')), 'All 4 controls hidden when closed again');

      await p.fill('#panelSearch', 'Label band sizes');
      await h.wait(250);
      T.check('search_expands_band_labels', await vis('#o-bandLabels'), '#panelSearch reveals #o-bandLabels');
      await p.fill('#panelSearch', '');
      await h.wait(250);
      T.check('search_clear_rehides_band_labels', !(await vis('#o-bandLabels')) && (await vis('#o-targetName')), 'Clearing #panelSearch restores collapsed state');

      await p.locator(gbandsMore + ' > summary').click();
      await h.wait(150);
      await p.locator('#o-purRow').check();
      await h.wait(450);
      await p.locator(gbandsMore + ' > summary').click();
      await h.wait(150);
      await p.fill('#panelSearch', 'Trim left');
      await h.wait(200);
      await p.click('#homeBtn');
      await h.wait(700);
      await p.reload();
      await h.wait(1000);
      const projCard = p.locator('#projList [data-pid]').filter({hasText: 'M4 Bands Disclosure'}).first();
      T.check('project_card_saved_after_reload', (await projCard.count()) === 1, 'Saved project card found after reload');
      await projCard.click();
      await h.wait(1000);
      if (!(await vis('#ssGels [data-gelopen]'))) {
        await p.locator('#tl [data-step^="run:"]').first().click();
        await h.wait(450);
      }
      await p.locator('#ssGels [data-gelopen]').first().click();
      await h.wait(500);
      T.check('nondefault_purrow_auto_opens_after_reload', (await vis('#o-purRow')) && (await p.locator('#o-purRow').isChecked()), '#o-purRow auto-opened via moreSync() after reload');
      const svReload = await p.evaluate(() => localStorage.getItem('hfb-sub-gcrop'));
      T.check('reload_after_midsearch_nav_keeps_gcrop_collapsed', !(await vis('#g-cl')) && svReload === null, `after mid-search reload sv=${svReload}`);
    });

    T.check('no_page_errors', errs.length === 0, errs.join(' | '));
  } finally {
    await close();
  }
  T.done();
})();
