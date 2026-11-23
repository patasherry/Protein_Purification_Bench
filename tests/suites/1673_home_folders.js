// Issue #1673: Project folders and organization controls on the app's front page.
// Verifies visible front-page toolbar (New Project, New Folder, Move, Rename, Archive, Search, Sort, List/Grid View),
// nested folders/subfolders, folder tree, breadcrumbs, visual distinction of folders vs projects, drag-and-drop,
// multi-select move and move back to top level without opening projects, persistence across reloads/reopens (local & cloud),
// and preservation of project workflow, results, attachments, and sample lineage on move/rename.
const {open, H, suite, src, fs, path, RES} = require('../lib/harness');

const checkHomeContrast = p => p.evaluate(() => {
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const rgba = s => { const m = s.match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1]; };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const bgOf = e => {
    const st = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) { st.push(c); if (c[3] >= 1) break; } }
    let c = [255, 255, 255, 1];
    if (!st.length || st[st.length - 1][3] < 1) { const dc = rgba(getComputedStyle(document.documentElement).backgroundColor); if (dc[3]) c = dc; }
    for (let i = st.length - 1; i >= 0; i--) c = over(st[i], c);
    return c;
  };
  const out = [];
  const home = document.querySelector('#home');
  if (!home) return out;
  for (const e of home.querySelectorAll('label, p, h2, h3, button, span, nav')) {
    if (!e.getClientRects().length || e.closest('svg, [hidden], dialog:not([open])')) continue;
    if (e.checkVisibility && !e.checkVisibility()) continue;
    if (e.matches(':disabled') || e.closest(':disabled, [aria-disabled=true]')) continue;
    const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (txt.length < 2) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const bg = bgOf(e), fg = over(rgba(cs.color), bg), L1 = lum(fg), L2 = lum(bg), r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (r < (big ? 3 : 4.5)) out.push(`${Math.round(r * 100) / 100}:1 "${txt.slice(0, 30)}"`);
  }
  return out;
});

(async () => {
  const T = suite('1673_home_folders');
  const {p, errs, close} = await open(), h = H(p);

  const attachPath = path.join(RES, 'syn_protocol_note_1673.txt');
  fs.writeFileSync(attachPath, 'Synthetic purification buffer note: 50 mM Tris pH 8.0, 300 mM NaCl.\n');

  const vis = async sel => {
    const loc = p.locator(sel).first();
    return (await loc.count()) > 0 && await loc.isVisible();
  };

  let baseline = null;

  await T.t('toolbar-and-front-page-structure', async () => {
    T.check('home-visible', await vis('#home'), 'Front page #home is visible on launch');

    const tbVisible = await vis('#homeToolbar');
    T.check('toolbar-visible', tbVisible, 'Organization toolbar visible on front page');

    // Toolbar must sit above #projList
    const aboveList = tbVisible && await p.evaluate(() => {
      const tb = document.querySelector('#homeToolbar'), pl = document.querySelector('#projList');
      if (!tb || !pl) return false;
      return tb.getBoundingClientRect().bottom <= pl.getBoundingClientRect().top + 4;
    });
    T.check('toolbar-above-projects', aboveList, 'Toolbar sits above project list');

    // All 8 requested controls must be clearly visible on the front page
    const controls = await p.evaluate(() => {
      const ok = el => !!(el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
      const tb = document.querySelector('#homeToolbar');
      if (!tb) return {};
      const byText = rx => [...tb.querySelectorAll('button, label, select, input')].find(e => ok(e) && rx.test((e.innerText || e.value || e.getAttribute('aria-label') || e.placeholder || '').trim()));
      return {
        newProj: !!byText(/^New Project$/i),
        newFolder: !!byText(/^New Folder$/i),
        move: !!byText(/^Move$/i),
        rename: !!byText(/^Rename$/i),
        archive: !!byText(/^Archive/i),
        search: !!tb.querySelector('input[type="search"]') && ok(tb.querySelector('input[type="search"]')),
        sort: !!tb.querySelector('select#homeSort') && ok(tb.querySelector('select#homeSort')),
        listView: !!byText(/^List$/i),
        gridView: !!byText(/^Grid$/i)
      };
    });
    T.check('toolbar-has-all-8-controls',
      !!(controls.newProj && controls.newFolder && controls.move && controls.rename && controls.archive && controls.search && controls.sort && controls.listView && controls.gridView),
      JSON.stringify(controls));

    T.check('folder-tree-visible', await vis('#homeTree'), 'Folder tree visible on front page');
    T.check('breadcrumbs-visible', await vis('#homeBreadcrumbs'), 'Breadcrumbs visible on front page');
    T.check('main-area-visible', await vis('#projList'), 'Main folder contents area visible on front page');
  });

  await T.t('seed-projects-remain-at-top-level', async () => {
    // Create a rich project with cloning lineage, construct lineage, Explorer attachment, run, pool, NanoDrop, and raw file
    await h.newProject('Kinase Prep Alpha', 'cloning');
    if (await vis('#clonePanel [data-tpl="ath"]')) {
      await p.click('#clonePanel [data-tpl="ath"]');
      await h.wait(300);
    }
    await h.step('construct');
    await h.gb(src('gb'));
    if (await vis('#pr-parentConstructId')) {
      await p.fill('#pr-parentConstructId', 'c0-wt-nadk');
      await p.dispatchEvent('#pr-parentConstructId', 'change');
      await h.wait(200);
    }
    if (await vis('#openDirBtn')) {
      await p.click('#openDirBtn');
      await h.wait(200);
      await p.setInputFiles('#dirFileInput', attachPath);
      await h.wait(300);
      await p.click('#projExplorerClose');
      await h.wait(200);
    }
    await h.addRun(src('his'));
    await h.pool('T1-T6');
    await p.setInputFiles('#file', src('ndSpec'));
    await h.wait(700);
    await h.step('figure');
    await h.wait(500);

    baseline = {
      sum: await h.sumTable(),
      peaks: await h.peakTable(),
      methods: await h.methods(),
      svgCount: (await h.svgTexts()).length,
      rawText: (await vis('#rawSum')) ? await p.locator('#rawSum').innerText() : '',
      parentConstruct: ''
    };
    await h.step('construct');
    baseline.parentConstruct = (await vis('#pr-parentConstructId')) ? await p.locator('#pr-parentConstructId').inputValue() : '';
    await h.step('clone:setup');
    baseline.lineage = (await vis('#clonePanel .cl-lin')) ? await p.locator('#clonePanel .cl-lin').innerText() : '';

    // Return to front page and create two more projects
    await p.click('#homeBtn');
    await h.wait(500);
    await h.newProject('Kinase Prep Beta');
    await p.click('#homeBtn');
    await h.wait(500);
    await h.newProject('Control GFP Prep');
    await p.click('#homeBtn');
    await h.wait(500);

    const topProjects = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('existing-projects-at-top-level',
      topProjects.includes('Kinase Prep Alpha') && topProjects.includes('Kinase Prep Beta') && topProjects.includes('Control GFP Prep'),
      JSON.stringify(topProjects));
  });

  await T.t('folders-subfolders-visual-distinction-and-navigation', async () => {
    if (!(await vis('#homeNewFolder'))) {
      T.check('create-folders', false, '#homeNewFolder missing');
      return;
    }

    // Create top-level folder "Kinase Study"
    await p.click('#homeNewFolder');
    await h.wait(200);
    await p.fill('#homePromptInput', 'Kinase Study');
    await p.click('#homePromptConfirm');
    await h.wait(300);

    // Create second top-level folder "Controls"
    await p.click('#homeNewFolder');
    await h.wait(200);
    await p.fill('#homePromptInput', 'Controls');
    await p.click('#homePromptConfirm');
    await h.wait(300);

    const folderNames = await p.$$eval('#projList .fcard .fn', els => els.map(e => e.textContent.trim()));
    T.check('create-folders', folderNames.includes('Kinase Study') && folderNames.includes('Controls'), JSON.stringify(folderNames));

    // Verify folders are visually distinct from projects (computed styles + distinct badge/icon)
    const distinct = await p.evaluate(() => {
      const f = document.querySelector('#projList .fcard'), pr = document.querySelector('#projList .pcard');
      if (!f || !pr) return {ok: false, why: 'missing fcard or pcard'};
      const fs = getComputedStyle(f), ps = getComputedStyle(pr);
      const styleDiff = fs.backgroundColor !== ps.backgroundColor || fs.borderLeftWidth !== ps.borderLeftWidth || fs.borderLeftColor !== ps.borderLeftColor;
      const fBadge = (f.querySelector('.home-kind-badge') || {}).textContent || '';
      const pBadge = (pr.querySelector('.home-kind-badge') || {}).textContent || '';
      const hasFolderIcon = !!f.querySelector('svg');
      return {ok: styleDiff && /Folder/i.test(fBadge) && /Project/i.test(pBadge) && hasFolderIcon, fsBg: fs.backgroundColor, psBg: ps.backgroundColor, fsBw: fs.borderLeftWidth, psBw: ps.borderLeftWidth, fBadge, pBadge};
    });
    T.check('folders-visually-distinct-from-projects', distinct.ok, JSON.stringify(distinct));

    // Contrast check on #home in light and dark themes
    const lightBad = await checkHomeContrast(p);
    await p.emulateMedia({colorScheme: 'dark'});
    await h.wait(150);
    const darkBad = await checkHomeContrast(p);
    await p.emulateMedia({colorScheme: 'light'});
    await h.wait(150);
    T.check('home-contrast-light-and-dark', !lightBad.length && !darkBad.length, `light=${lightBad.join(', ')} dark=${darkBad.join(', ')}`);

    // Clicking folder navigates into it (staying on #home, NOT opening a project workspace)
    await p.locator('#projList .fcard', {hasText: 'Kinase Study'}).click();
    await h.wait(300);
    const stillHome = await vis('#home') && !(await p.evaluate(() => document.body.classList.contains('proj')));
    const crumbTxt = await p.locator('#homeBreadcrumbs').innerText();
    T.check('open-folder-updates-breadcrumbs', stillHome && /Kinase Study/.test(crumbTxt), crumbTxt);

    // Create subfolder "Active-Site Mutants" inside "Kinase Study"
    await p.click('#homeNewFolder');
    await h.wait(200);
    await p.fill('#homePromptInput', 'Active-Site Mutants');
    await p.click('#homePromptConfirm');
    await h.wait(300);

    const subNames = await p.$$eval('#projList .fcard .fn', els => els.map(e => e.textContent.trim()));
    T.check('create-subfolder', subNames.includes('Active-Site Mutants'), JSON.stringify(subNames));

    // Verify subfolder appears in folder tree and clicking it navigates deeper
    await p.locator('#homeTree [data-folder-id]', {hasText: 'Active-Site Mutants'}).click();
    await h.wait(300);
    const deepCrumbs = await p.locator('#homeBreadcrumbs').innerText();
    T.check('tree-and-nested-breadcrumbs', /Kinase Study/.test(deepCrumbs) && /Active-Site Mutants/.test(deepCrumbs), deepCrumbs);

    // Prevent circular folder nesting: return to top level, select "Kinase Study", click Move -> "Active-Site Mutants" and "Kinase Study" must not be allowed targets
    await p.click('#homeBreadcrumbs [data-crumb-id="root"]');
    await h.wait(300);
    await p.locator('#projList .fcard', {hasText: 'Kinase Study'}).locator('input.home-cb').check();
    await p.click('#homeMove');
    await h.wait(200);
    const circularBlocked = await p.evaluate(() => {
      const sel = document.querySelector('#homeMoveSelect');
      if (!sel) return false;
      const opts = [...sel.options].map(o => o.textContent);
      return !opts.some(t => /Kinase Study|Active-Site Mutants/.test(t));
    });
    T.check('circular-folder-nesting-prevented', circularBlocked, 'Folder and its descendants excluded from move targets');
    await p.click('#homeMoveCancel');
    await p.click('#homeSelClear');
    await h.wait(200);

    // New Project button in toolbar focuses #npName
    await p.click('#homeNewProj');
    await h.wait(150);
    const focusedId = await p.evaluate(() => document.activeElement && document.activeElement.id);
    T.check('new-project-toolbar-btn-focuses-input', focusedId === 'npName', `activeElement=${focusedId}`);
  });

  await T.t('drag-and-drop-multi-move-and-move-to-top-level', async () => {
    if (!(await vis('#homeToolbar'))) {
      T.check('drag-project-into-folder-removed-from-root', false, 'Toolbar missing');
      return;
    }

    // 1. Drag "Control GFP Prep" into "Controls" folder card without opening the project
    await p.locator('#projList .pcard', {hasText: 'Control GFP Prep'}).dragTo(p.locator('#projList .fcard', {hasText: 'Controls'}));
    await h.wait(350);

    const topAfterDrag = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('drag-project-into-folder-removed-from-root', !topAfterDrag.includes('Control GFP Prep'), JSON.stringify(topAfterDrag));

    await p.locator('#homeTree [data-folder-id]', {hasText: 'Controls'}).click();
    await h.wait(250);
    const controlsProjs = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('drag-project-into-folder-present-in-target', controlsProjs.includes('Control GFP Prep'), JSON.stringify(controlsProjs));

    // Drag "Control GFP Prep" back to Top level via tree node without opening it, then put it back into Controls
    await p.locator('#projList .pcard', {hasText: 'Control GFP Prep'}).dragTo(p.locator('#homeTree [data-folder-id="root"]'));
    await h.wait(300);
    await p.click('#homeBreadcrumbs [data-crumb-id="root"]');
    await h.wait(250);
    const topAfterDragBack = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('drag-project-back-to-top-level', topAfterDragBack.includes('Control GFP Prep'), JSON.stringify(topAfterDragBack));
    await p.locator('#projList .pcard', {hasText: 'Control GFP Prep'}).dragTo(p.locator('#projList .fcard', {hasText: 'Controls'}));
    await h.wait(300);

    // 2. Select multiple projects ("Kinase Prep Alpha" and "Kinase Prep Beta") and Move both into subfolder "Active-Site Mutants" without opening them
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Alpha'}).locator('input.home-cb').check();
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Beta'}).locator('input.home-cb').check();
    await p.click('#homeMove');
    await h.wait(200);
    const subId = await p.evaluate(() => {
      const sel = document.querySelector('#homeMoveSelect');
      const opt = sel && [...sel.options].find(o => /Active-Site Mutants/.test(o.textContent));
      return opt ? opt.value : '';
    });
    if (subId) await p.selectOption('#homeMoveSelect', subId);
    await p.click('#homeMoveConfirm');
    await h.wait(350);

    const topAfterMulti = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    await p.locator('#homeTree [data-folder-id]', {hasText: 'Active-Site Mutants'}).click();
    await h.wait(250);
    const mutProjs = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('multi-select-move-projects',
      !topAfterMulti.length && mutProjs.includes('Kinase Prep Alpha') && mutProjs.includes('Kinase Prep Beta'),
      `top=${JSON.stringify(topAfterMulti)}, sub=${JSON.stringify(mutProjs)}`);

    // 3. Move "Kinase Prep Beta" back to the top level via Move dialog without opening it
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Beta'}).locator('input.home-cb').check();
    await p.click('#homeMove');
    await h.wait(200);
    await p.selectOption('#homeMoveSelect', 'root');
    await p.click('#homeMoveConfirm');
    await h.wait(350);

    await p.click('#homeBreadcrumbs [data-crumb-id="root"]');
    await h.wait(250);
    const topRestored = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('move-project-back-to-top-level', topRestored.includes('Kinase Prep Beta'), JSON.stringify(topRestored));
  });

  await T.t('rename-archive-search-sort-and-view-modes', async () => {
    if (!(await vis('#homeToolbar'))) {
      T.check('rename-items-without-opening', false, 'Toolbar missing');
      return;
    }

    // Rename folder "Controls" -> "Control Runs"
    await p.locator('#projList .fcard', {hasText: 'Controls'}).locator('input.home-cb').check();
    await p.click('#homeRename');
    await h.wait(200);
    await p.fill('#homePromptInput', 'Control Runs');
    await p.click('#homePromptConfirm');
    await h.wait(300);

    // Navigate into Active-Site Mutants and rename "Kinase Prep Alpha" -> "Kinase Prep Alpha v2" without opening it
    await p.locator('#homeTree [data-folder-id]', {hasText: 'Active-Site Mutants'}).click();
    await h.wait(250);
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Alpha'}).locator('input.home-cb').check();
    await p.click('#homeRename');
    await h.wait(200);
    await p.fill('#homePromptInput', 'Kinase Prep Alpha v2');
    await p.click('#homePromptConfirm');
    await h.wait(350);

    const stillOnHome = await vis('#home') && !(await p.evaluate(() => document.body.classList.contains('proj')));
    const renamedProjs = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    await p.click('#homeBreadcrumbs [data-crumb-id="root"]');
    await h.wait(250);
    const renamedFolders = await p.$$eval('#projList .fcard .fn', els => els.map(e => e.textContent.trim()));
    T.check('rename-items-without-opening',
      stillOnHome && renamedProjs.includes('Kinase Prep Alpha v2') && renamedFolders.includes('Control Runs'),
      `folders=${JSON.stringify(renamedFolders)}, projs=${JSON.stringify(renamedProjs)}`);

    // Search across nested folders from top level
    await p.fill('#homeSearch', 'Alpha v2');
    await h.wait(250);
    const searchHits = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('search-finds-nested-project', searchHits.length === 1 && searchHits[0] === 'Kinase Prep Alpha v2', JSON.stringify(searchHits));
    await p.fill('#homeSearch', '');
    await h.wait(200);

    // Sort folders at top level ("Control Runs", "Kinase Study")
    await p.selectOption('#homeSort', 'name-asc');
    await h.wait(200);
    const ascFolders = await p.$$eval('#projList .fcard .fn', els => els.map(e => e.textContent.trim()));
    await p.selectOption('#homeSort', 'name-desc');
    await h.wait(200);
    const descFolders = await p.$$eval('#projList .fcard .fn', els => els.map(e => e.textContent.trim()));
    T.check('sort-reorders-items',
      ascFolders[0] === 'Control Runs' && descFolders[0] === 'Kinase Study',
      `asc=${JSON.stringify(ascFolders)}, desc=${JSON.stringify(descFolders)}`);

    // List / Grid View toggle
    await p.click('#homeViewGrid');
    await h.wait(200);
    const gridState = await p.evaluate(() => {
      const pl = document.querySelector('#projList'), gb = document.querySelector('#homeViewGrid'), lb = document.querySelector('#homeViewList');
      const cols = pl ? getComputedStyle(pl).gridTemplateColumns.split(' ').length : 0;
      return {isGridClass: pl && pl.classList.contains('home-grid'), cols, gPressed: gb && gb.getAttribute('aria-pressed'), lPressed: lb && lb.getAttribute('aria-pressed')};
    });
    T.check('grid-view-layout', !!(gridState.isGridClass && gridState.cols >= 2 && gridState.gPressed === 'true' && gridState.lPressed === 'false'), JSON.stringify(gridState));

    await p.click('#homeViewList');
    await h.wait(200);
    const listState = await p.evaluate(() => {
      const pl = document.querySelector('#projList'), lb = document.querySelector('#homeViewList');
      return {isListClass: pl && pl.classList.contains('home-list'), lPressed: lb && lb.getAttribute('aria-pressed')};
    });
    T.check('list-view-layout', !!(listState.isListClass && listState.lPressed === 'true'), JSON.stringify(listState));

    // Archive and Restore a project via toolbar without opening it
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Beta'}).locator('input.home-cb').check();
    await p.click('#homeArchive');
    await h.wait(300);
    const afterArchive = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('archive-hides-project', !afterArchive.includes('Kinase Prep Beta'), JSON.stringify(afterArchive));

    // Open Archive view and restore "Kinase Prep Beta"
    await p.click('#homeTree [data-folder-id="__archive__"]');
    await h.wait(250);
    const inArchive = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Beta'}).locator('input.home-cb').check();
    await p.click('#homeRestore');
    await h.wait(300);
    await p.click('#homeBreadcrumbs [data-crumb-id="root"]');
    await h.wait(250);
    const afterRestore = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
    T.check('archive-restore-project', inArchive.includes('Kinase Prep Beta') && afterRestore.includes('Kinase Prep Beta'), `arch=${JSON.stringify(inArchive)}, restored=${JSON.stringify(afterRestore)}`);
  });

  await T.t('persistence-and-unchanged-project-data', async () => {
    if (!(await vis('#homeToolbar'))) {
      T.check('folder-structure-persists-on-reopen', false, 'Toolbar missing');
      return;
    }

    // Switch to Grid view, reload the app, and verify complete folder structure & placements persist
    await p.click('#homeViewGrid');
    await h.wait(250);
    await p.reload();
    await h.wait(900);

    const gridRestored = await p.evaluate(() => {
      const pl = document.querySelector('#projList');
      return !!(pl && pl.classList.contains('home-grid'));
    });
    const rootFolders = await p.$$eval('#projList .fcard .fn', els => els.map(e => e.textContent.trim()));
    const rootProjs = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));

    await p.locator('#homeTree [data-folder-id]', {hasText: 'Active-Site Mutants'}).click();
    await h.wait(300);
    const nestedProjs = await p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));

    T.check('folder-structure-persists-on-reopen',
      gridRestored && rootFolders.includes('Kinase Study') && rootFolders.includes('Control Runs') && rootProjs.includes('Kinase Prep Beta') && nestedProjs.includes('Kinase Prep Alpha v2'),
      JSON.stringify({gridRestored, rootFolders, rootProjs, nestedProjs}));

    // Open the moved & renamed project ("Kinase Prep Alpha v2") and verify zero alteration to workflow, results, attachments, or lineage
    await p.locator('#projList .pcard', {hasText: 'Kinase Prep Alpha v2'}).click();
    await h.wait(1500);

    const projNameVal = await p.locator('#projName').inputValue();
    await h.step('figure');
    await h.wait(500);
    const afterSum = await h.sumTable();
    const afterPeaks = await h.peakTable();
    const afterMethods = await h.methods();
    const afterSvgCount = (await h.svgTexts()).length;
    const afterRawText = (await vis('#rawSum')) ? await p.locator('#rawSum').innerText() : '';
    await h.step('construct');
    const afterParentConstruct = (await vis('#pr-parentConstructId')) ? await p.locator('#pr-parentConstructId').inputValue() : '';
    await h.step('clone:setup');
    const afterLineage = (await vis('#clonePanel .cl-lin')) ? await p.locator('#clonePanel .cl-lin').innerText() : '';

    let hasExplorerFile = true;
    if (await vis('#openDirBtn')) {
      await p.click('#openDirBtn');
      await h.wait(250);
      const dirFiles = await p.$$eval('#dirContent [data-dir-type="file"]', els => els.map(e => e.dataset.dirName || ''));
      hasExplorerFile = dirFiles.includes('syn_protocol_note_1673.txt');
      await p.click('#projExplorerClose');
      await h.wait(150);
    }

    const normLineage = s => String(s || '').replace(/^Cloning lineage:.*$/m, 'Cloning lineage');
    T.check('moved-renamed-project-preserves-workflow-results-attachments-lineage',
      projNameVal === 'Kinase Prep Alpha v2' &&
      JSON.stringify(afterSum) === JSON.stringify(baseline.sum) &&
      JSON.stringify(afterPeaks) === JSON.stringify(baseline.peaks) &&
      afterMethods === baseline.methods &&
      afterSvgCount === baseline.svgCount &&
      afterRawText === baseline.rawText &&
      afterParentConstruct === baseline.parentConstruct &&
      hasExplorerFile &&
      normLineage(afterLineage) === normLineage(baseline.lineage),
      JSON.stringify({projNameVal, sumEq: JSON.stringify(afterSum) === JSON.stringify(baseline.sum), peaksEq: JSON.stringify(afterPeaks) === JSON.stringify(baseline.peaks), methEq: afterMethods === baseline.methods, rawEq: afterRawText === baseline.rawText, parentEq: afterParentConstruct === baseline.parentConstruct, hasExplorerFile, linEq: normLineage(afterLineage) === normLineage(baseline.lineage)}));
  });

  await T.t('cloud-mode-persistence-and-mobile-layout', async () => {
    const c1 = await open({cloud: true});
    try {
      const ch1 = H(c1.p);
      await ch1.newProject('Cloud Enzyme Prep');
      await c1.p.click('#homeBtn');
      await ch1.wait(500);
      if (await c1.p.locator('#homeNewFolder').count() > 0 && await c1.p.locator('#homeNewFolder').isVisible()) {
        await c1.p.click('#homeNewFolder');
        await ch1.wait(200);
        await c1.p.fill('#homePromptInput', 'Cloud Folder');
        await c1.p.click('#homePromptConfirm');
        await ch1.wait(300);
        await c1.p.locator('#projList .pcard', {hasText: 'Cloud Enzyme Prep'}).dragTo(c1.p.locator('#projList .fcard', {hasText: 'Cloud Folder'}));
        await ch1.wait(400);
      }
      if (c1.errs.length) errs.push(...c1.errs);
    } finally {
      await c1.close();
    }

    const c2 = await open({cloud: true});
    try {
      const ch2 = H(c2.p);
      await ch2.wait(600);
      const hasCloudFolder = (await c2.p.locator('#projList .fcard .fn', {hasText: 'Cloud Folder'}).count()) > 0;
      let cloudProjInside = false;
      if (hasCloudFolder) {
        await c2.p.locator('#projList .fcard', {hasText: 'Cloud Folder'}).click();
        await ch2.wait(300);
        const inside = await c2.p.$$eval('#projList .pcard .pn', els => els.map(e => e.textContent.trim()));
        cloudProjInside = inside.includes('Cloud Enzyme Prep');
      }
      T.check('cloud-folder-structure-persists', hasCloudFolder && cloudProjInside, JSON.stringify({hasCloudFolder, cloudProjInside}));
      if (c2.errs.length) errs.push(...c2.errs);
    } finally {
      await c2.close();
    }

    const m = await open({width: 390, height: 844, isMobile: true});
    try {
      const mh = H(m.p);
      await mh.wait(400);
      T.check('mobile-front-page-fits-width', !(await mh.hScroll()), 'No horizontal scroll on 390px phone screen');
      if (m.errs.length) errs.push(...m.errs);
    } finally {
      await m.close();
    }
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
