// Issue #1647: Windows File Explorer-style directory system for projects
// Supports folders, nested subfolders, multiple independent protein preparations,
// tree navigation, breadcrumbs, search, sorting, list/grid views, rename, move,
// duplicate, archive, restore, drag-and-drop, attachments, and circular nesting prevention.
const {open, H, suite, fs, path, src} = require('../lib/harness');

(async () => {
  const T = suite('1647_project_directory');
  const {p, errs, close} = await open(), h = H(p);

  let hasExplorer = false;
  await T.t('explorer-navigation-and-structure', async () => {
    await h.newProject('Protein X Project');
    await h.wait(500);

    // Explorer button in project bar
    const openDirBtn = p.locator('#openDirBtn');
    hasExplorer = await openDirBtn.isVisible();
    T.check('explorer-btn-visible', hasExplorer, 'openDirBtn visible in project bar');
    if (!hasExplorer) return;

    // Click to open Project Explorer modal
    await openDirBtn.click();
    await h.wait(300);

    const modal = p.locator('#projExplorerModal');
    T.check('explorer-modal-open', await modal.isVisible(), 'Project Explorer modal is open');

    // Breadcrumbs present
    const crumbs = p.locator('#dirBreadcrumbs');
    T.check('breadcrumbs-present', await crumbs.isVisible(), 'Breadcrumbs element visible');

    // Tree navigation present
    const tree = p.locator('#dirTree');
    T.check('tree-nav-present', await tree.isVisible(), 'Tree navigation pane visible');

    // Search bar present
    const search = p.locator('#dirSearch');
    T.check('search-input-present', await search.isVisible(), 'Search input visible');

    // View toggles present (List and Grid)
    const btnList = p.locator('#dirViewList');
    const btnGrid = p.locator('#dirViewGrid');
    T.check('view-toggles-present', await btnList.isVisible() && await btnGrid.isVisible(), 'List and Grid view toggles visible');

    // Create folder "Construct A" in root
    await p.click('#dirNewFolder');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Construct A');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    // Verify "Construct A" is listed in folder view and tree
    const constructAItem = p.locator('#dirContent [data-dir-name="Construct A"]');
    T.check('construct-a-folder-created', await constructAItem.isVisible(), 'Construct A folder listed in content');

    // Enter "Construct A"
    await p.click('#dirContent [data-dir-name="Construct A"] [data-dir-open]');
    await h.wait(400);

    // Breadcrumbs updated to include Construct A
    const crumbText = await crumbs.innerText();
    T.check('breadcrumbs-updated', crumbText.includes('Construct A'), `Breadcrumbs text: ${crumbText}`);

    // Create nested subfolder "Subfolder 1" inside Construct A
    await p.click('#dirNewFolder');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Subfolder 1');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    const subfolderItem = p.locator('#dirContent [data-dir-name="Subfolder 1"]');
    T.check('nested-subfolder-created', await subfolderItem.isVisible(), 'Nested Subfolder 1 created inside Construct A');

    // Create "Prep 001" inside Construct A
    await p.click('#dirNewPrep');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Prep 001');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    // Create "Prep 002" inside Construct A
    await p.click('#dirNewPrep');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Prep 002');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    const prep1Item = p.locator('#dirContent [data-dir-name="Prep 001"]');
    const prep2Item = p.locator('#dirContent [data-dir-name="Prep 002"]');
    T.check('preps-created-in-folder', await prep1Item.isVisible() && await prep2Item.isVisible(), 'Prep 001 and Prep 002 created in Construct A');

    // Test prevent circular folder nesting
    // Attempt to move Construct A into Subfolder 1
    await p.click('#dirContent [data-dir-name="Subfolder 1"] [data-dir-open]');
    await h.wait(300);
    // Navigate back up via breadcrumbs to Root
    await p.click('#dirBreadcrumbs [data-crumb-id="root"]');
    await h.wait(400);

    // Open Move dialog for Construct A
    await p.click('#dirContent [data-dir-name="Construct A"] [data-dir-move]');
    await h.wait(200);

    // Subfolder 1 should either not be an allowed option or moving to it returns an error
    const canMoveIntoSelfOrChild = await p.evaluate(() => {
      const sel = document.querySelector('#dirMoveSelect');
      if (!sel) return true;
      const options = Array.from(sel.options).map(o => o.text);
      return options.some(t => t.includes('Subfolder 1') || t.includes('Construct A'));
    });
    T.check('circular-nesting-prevented', !canMoveIntoSelfOrChild, 'Construct A and its subfolders excluded from move destinations');
    await p.click('#dirMoveCancel');
    await h.wait(200);

    // Create "Construct B" and "Shared Files" in root
    await p.click('#dirNewFolder');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Construct B');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    await p.click('#dirNewFolder');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Shared Files');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    // Navigate into Construct B and create "Prep 001" (same name as in Construct A, independent prep)
    await p.click('#dirContent [data-dir-name="Construct B"] [data-dir-open]');
    await h.wait(400);

    await p.click('#dirNewPrep');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Prep 001');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    const bPrep1 = p.locator('#dirContent [data-dir-name="Prep 001"]');
    T.check('construct-b-prep-created', await bPrep1.isVisible(), 'Prep 001 created in Construct B without collision');

    // Close modal
    await p.click('#projExplorerClose');
    await h.wait(300);
  });
  if (!hasExplorer) { await close(); T.done(); return; }

  await T.t('independent-preparations-and-switching', async () => {
    // Open explorer, navigate to Construct A, activate Prep 001
    await p.click('#openDirBtn');
    await h.wait(300);
    await p.click('#dirBreadcrumbs [data-crumb-id="root"]');
    await h.wait(300);
    await p.click('#dirContent [data-dir-name="Construct A"] [data-dir-open]');
    await h.wait(300);

    // Activate Prep 001 in Construct A
    await p.click('#dirContent [data-dir-name="Prep 001"] [data-dir-open]');
    await h.wait(500);

    // Project bar should show active prep
    const crumbsBar = await p.$eval('#projDirCrumbs', el => el.innerText);
    T.check('active-prep-shown-in-bar', crumbsBar.includes('Prep 001'), `Active prep in bar: ${crumbsBar}`);

    // Set distinctive data for Prep 001
    await p.click('#tl [data-step="construct"]');
    await h.wait(300);
    await p.fill('#pr-name', 'Construct A - Target 1');
    await p.fill('#pr-parentConstructId', 'lineage-construct-A');
    await p.dispatchEvent('#pr-name', 'input');
    await p.dispatchEvent('#pr-parentConstructId', 'change');
    await h.wait(400);

    // Switch to Prep 002
    await p.click('#openDirBtn');
    await h.wait(300);
    await p.click('#dirContent [data-dir-name="Prep 002"] [data-dir-open]');
    await h.wait(500);

    // In Prep 002, construct name should NOT be "Construct A - Target 1"
    const p2ConstructName = await p.$eval('#pr-name', el => el.value);
    const p2Lineage = await p.$eval('#pr-parentConstructId', el => el.value);
    T.check('prep-records-independent', p2ConstructName !== 'Construct A - Target 1' && p2Lineage !== 'lineage-construct-A',
      `Prep 002 got construct: "${p2ConstructName}", lineage: "${p2Lineage}"`);

    // Switch back to Prep 001
    await p.click('#openDirBtn');
    await h.wait(300);
    await p.click('#dirContent [data-dir-name="Prep 001"] [data-dir-open]');
    await h.wait(500);

    // Verify Prep 001 state preserved
    const p1ConstructName = await p.$eval('#pr-name', el => el.value);
    const p1Lineage = await p.$eval('#pr-parentConstructId', el => el.value);
    T.check('prep-records-preserved-on-switch', p1ConstructName === 'Construct A - Target 1' && p1Lineage === 'lineage-construct-A',
      `Prep 001 restored construct: "${p1ConstructName}", lineage: "${p1Lineage}"`);
  });

  await T.t('directory-actions-duplicate-move-archive-restore', async () => {
    await p.click('#openDirBtn');
    await h.wait(300);

    // Test Duplicate on Prep 001
    await p.click('#dirContent [data-dir-name="Prep 001"] [data-dir-dup]');
    await h.wait(400);

    const dupItem = p.locator('#dirContent [data-dir-name="Prep 001 (Copy)"]');
    T.check('prep-duplicated', await dupItem.isVisible(), 'Duplicated prep visible in Construct A');

    // Test Rename: Rename "Prep 001 (Copy)" to "Prep 001 Duplicated" and verify stable ID
    const dupIdBefore = await dupItem.getAttribute('data-dir-id');
    await p.click('#dirContent [data-dir-name="Prep 001 (Copy)"] [data-dir-rename]');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Prep 001 Duplicated');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    const renamedItem = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('prep-renamed', await renamedItem.isVisible(), 'Renamed prep visible');
    const dupIdAfterRename = await renamedItem.getAttribute('data-dir-id');
    T.check('stable-id-after-rename', !!dupIdBefore && dupIdAfterRename === dupIdBefore, `ID before=${dupIdBefore}, after=${dupIdAfterRename}`);

    // Test Move: Move "Prep 001 Duplicated" to "Construct B"
    await p.click('#dirContent [data-dir-name="Prep 001 Duplicated"] [data-dir-move]');
    await h.wait(200);
    await p.selectOption('#dirMoveSelect', {label: 'Construct B'});
    await p.click('#dirMoveConfirm');
    await h.wait(400);

    // Should no longer be in Construct A
    T.check('moved-away-from-construct-a', !(await p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]').isVisible()), 'No longer in Construct A');

    // Go to Construct B via Tree Navigation and verify it is there with same stable ID
    await p.click('#dirTree .dir-tree-node:has-text("Construct B")');
    await h.wait(300);
    const movedInB = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('moved-to-construct-b', await movedInB.isVisible(), 'Prep 001 Duplicated now in Construct B via tree nav');
    const dupIdAfterMove = await movedInB.getAttribute('data-dir-id');
    T.check('stable-id-after-move', dupIdAfterMove === dupIdBefore, `ID after move=${dupIdAfterMove}`);

    // Test Sorting (Name Z-A vs A-Z)
    await p.selectOption('#dirSort', 'name-desc');
    await h.wait(200);
    const descNames = await p.evaluate(() => [...document.querySelectorAll('#dirContent [data-dir-name]')].map(e => e.getAttribute('data-dir-name')));
    await p.selectOption('#dirSort', 'name-asc');
    await h.wait(200);
    const ascNames = await p.evaluate(() => [...document.querySelectorAll('#dirContent [data-dir-name]')].map(e => e.getAttribute('data-dir-name')));
    T.check('sorting-works', descNames.length >= 2 && ascNames[0] === descNames[descNames.length - 1] && ascNames[0] !== descNames[0],
      `asc=${JSON.stringify(ascNames)}, desc=${JSON.stringify(descNames)}`);

    // Test Archive: Archive "Prep 001 Duplicated"
    await p.click('#dirContent [data-dir-name="Prep 001 Duplicated"] [data-dir-archive]');
    await h.wait(400);

    // Should disappear from normal view
    T.check('archived-hidden-from-normal-view', !(await p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]').isVisible()), 'Archived item hidden');

    // Switch to Archive View
    await p.click('#dirToggleArchive');
    await h.wait(400);

    const inArchive = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('item-visible-in-archive', await inArchive.isVisible(), 'Archived item visible in Archive view');

    // Restore item
    await p.click('#dirContent [data-dir-name="Prep 001 Duplicated"] [data-dir-restore]');
    await h.wait(400);

    // Exit Archive View
    await p.click('#dirToggleArchive');
    await h.wait(400);

    const restoredInB = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('restored-item-visible', await restoredInB.isVisible(), 'Restored item visible again in Construct B');

    // Test Uploaded File Attachment in Shared Files + Permanent Delete after Archive
    await p.click('#dirTree .dir-tree-node:has-text("Shared Files")');
    await h.wait(300);
    await p.setInputFiles('#dirFileInput', [src('his')]);
    await h.wait(400);
    const uploadedRow = p.locator('#dirContent [data-dir-type="file"]').first();
    T.check('file-attachment-uploaded', await uploadedRow.isVisible(), 'Uploaded file attachment listed in Shared Files');
    const upFileName = await uploadedRow.getAttribute('data-dir-name');

    // Test Drag-and-drop: drag uploaded file onto Construct B node in tree
    await p.evaluate(() => {
      const srcEl = document.querySelector('#dirContent [data-dir-type="file"]');
      const dstEl = [...document.querySelectorAll('#dirTree [data-folder-id]')].find(n => n.textContent.includes('Construct B'));
      if (!srcEl || !dstEl) return;
      const dt = new DataTransfer();
      dt.setData('application/json', JSON.stringify({ type: srcEl.dataset.dirType, id: srcEl.dataset.dirId }));
      dstEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dstEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await h.wait(300);
    await p.click('#dirTree .dir-tree-node:has-text("Construct B")');
    await h.wait(300);
    T.check('drag-and-drop-move-works', await p.locator(`#dirContent [data-dir-name="${upFileName}"]`).isVisible(), `Dragged ${upFileName} into Construct B`);

    // Archive and permanently delete the uploaded file
    await p.click(`#dirContent [data-dir-name="${upFileName}"] [data-dir-archive]`);
    await h.wait(300);
    await p.click('#dirToggleArchive');
    await h.wait(300);
    await p.click(`#dirContent [data-dir-name="${upFileName}"] [data-dir-del-perm]`);
    await h.wait(300);
    T.check('permanent-delete-after-archive', !(await p.locator(`#dirContent [data-dir-name="${upFileName}"]`).isVisible()), 'Archived file permanently deleted');
    await p.click('#dirToggleArchive');
    await h.wait(300);

    // Test search filtering
    await p.fill('#dirSearch', 'Duplicated');
    await h.wait(300);
    const searchResult = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('search-filtering-works', await searchResult.isVisible(), 'Search filtered to Duplicated item');
    await p.fill('#dirSearch', '');
    await h.wait(300);

    // Test List vs Grid View toggles
    await p.click('#dirViewGrid');
    await h.wait(200);
    const isGrid = await p.evaluate(() => document.querySelector('#dirContent').classList.contains('dir-grid'));
    T.check('view-toggled-to-grid', isGrid, 'Grid view class applied');

    await p.click('#dirViewList');
    await h.wait(200);
    const isList = await p.evaluate(() => document.querySelector('#dirContent').classList.contains('dir-list'));
    T.check('view-toggled-to-list', isList, 'List view class applied');

    await p.click('#projExplorerClose');
    await h.wait(300);
  });

  await T.t('round-trip-export-and-persistence', async () => {
    // Add run to active prep (Prep 001) so export has valid data and verify run isolation vs Prep 002
    await h.addRun(src('his'));
    await h.wait(300);
    const p1Runs = await p.locator('#tl [data-step^="run:"]').count();

    await p.click('#openDirBtn');
    await h.wait(300);
    await p.click('#dirTree .dir-tree-node:has-text("Construct A")');
    await h.wait(300);
    await p.click('#dirContent [data-dir-name="Prep 002"] [data-dir-open]');
    await h.wait(500);
    const p2Runs = await p.locator('#tl [data-step^="run:"]').count();
    T.check('prep-runs-isolated', p1Runs >= 1 && p2Runs === 0, `Prep 001 runs=${p1Runs}, Prep 002 runs=${p2Runs}`);

    // Switch back to Prep 001 for export
    await p.click('#openDirBtn');
    await h.wait(300);
    await p.click('#dirContent [data-dir-name="Prep 001"] [data-dir-open]');
    await h.wait(500);

    // Export project
    const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#projSave')]);
    const savePath = await dl.path();
    const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));

    T.check('export-has-directory', !!data.directory, 'Exported JSON has directory object');
    T.check('export-has-folders', Array.isArray(data.directory.folders) && data.directory.folders.some(f => f.name === 'Construct A'),
      `Folders: ${JSON.stringify(data.directory ? data.directory.folders.map(f => f.name) : [])}`);
    T.check('export-has-preps', Array.isArray(data.directory.preparations) && data.directory.preparations.length >= 3,
      `Preps: ${data.directory && data.directory.preparations ? data.directory.preparations.length : 0}`);

    // Reopen by importing the file
    await p.click('#homeBtn');
    await h.wait(500);
    await p.click('#homeQuick');
    await h.wait(1000);
    await p.setInputFiles('#projFile', savePath);
    await h.wait(2500);

    // Open Explorer
    await p.click('#openDirBtn');
    await h.wait(400);

    // Navigate to root to verify root folder hierarchy
    await p.click('#dirBreadcrumbs [data-crumb-id="root"]');
    await h.wait(400);

    // Verify folder hierarchy restored
    const constructAFolder = p.locator('#dirContent [data-dir-name="Construct A"]');
    T.check('restored-construct-a-folder', await constructAFolder.isVisible(), 'Construct A folder restored on import');

    // Open Construct A
    await p.click('#dirContent [data-dir-name="Construct A"] [data-dir-open]');
    await h.wait(400);

    const restoredPrep1 = p.locator('#dirContent [data-dir-name="Prep 001"]');
    T.check('restored-prep-1', await restoredPrep1.isVisible(), 'Prep 001 in Construct A restored on import');

    await p.click('#projExplorerClose');
    await h.wait(300);

    // Verify backward compatibility: legacy project JSON without directory loads cleanly
    const legacyData = JSON.parse(JSON.stringify(data));
    delete legacyData.directory;
    const legacyPath = savePath + '.legacy.json';
    fs.writeFileSync(legacyPath, JSON.stringify(legacyData), 'utf8');
    await p.click('#homeBtn');
    await h.wait(400);
    await p.click('#homeQuick');
    await h.wait(800);
    await p.setInputFiles('#projFile', legacyPath);
    await h.wait(2000);
    await p.click('#openDirBtn');
    await h.wait(300);
    const legacyPreps = await p.locator('#dirContent [data-dir-type="prep"]').count();
    T.check('legacy-project-compat', legacyPreps >= 1, `Legacy project initialized with ${legacyPreps} prep(s)`);
    await p.click('#projExplorerClose');
    try { fs.unlinkSync(legacyPath); } catch (e) {}
  });

  await T.t('blob-retention-qkeys-isolation-and-folder-restore', async () => {
    const {p: p2, errs: errs2, close: close2} = await open();
    const h2 = H(p2);
    try {
      await h2.newProject('Persistence Matrix Project');

      // Populate sequence (QKEYS) and a chromatogram raw file on initial Prep 001
      await p2.click('#tl [data-step="construct"]');
      await h2.wait(250);
      await p2.click('#gbGoProt');
      await h2.wait(250);
      await p2.fill('#protSeq', 'MHHHHHHWYWYWYWY');
      await p2.dispatchEvent('#protSeq', 'input');
      await p2.dispatchEvent('#protSeq', 'change');
      await h2.wait(300);
      await h2.addRun(src('his'));
      await h2.wait(400);

      // Open Explorer, duplicate Prep 001, and create nested Folder X / Subfolder Y / Fresh Prep
      await p2.click('#openDirBtn');
      await h2.wait(300);
      await p2.click('#dirContent [data-dir-type="prep"] [data-dir-dup]');
      await h2.wait(300);

      await p2.click('#dirNewFolder');
      await h2.wait(150);
      await p2.fill('#dirPromptInput', 'Folder X');
      await p2.click('#dirPromptConfirm');
      await h2.wait(300);

      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-open]');
      await h2.wait(250);

      // Upload experimental attachment in Folder X
      const ndFile = src('nd');
      const expectedBytes = fs.statSync(ndFile).size;
      await p2.setInputFiles('#dirFileInput', [ndFile]);
      await h2.wait(400);

      // Explorer upload must not pollute active prep's #rawList
      const rawCount = await p2.locator('#rawList .rawrow').count();
      T.check('explorer-upload-isolated-from-rawfiles', rawCount === 1, `Expected 1 raw file in active prep, got ${rawCount}`);

      await p2.click('#dirNewFolder');
      await h2.wait(150);
      await p2.fill('#dirPromptInput', 'Subfolder Y');
      await p2.click('#dirPromptConfirm');
      await h2.wait(300);

      await p2.click('#dirContent [data-dir-name="Subfolder Y"] [data-dir-open]');
      await h2.wait(250);

      await p2.click('#dirNewPrep');
      await h2.wait(150);
      await p2.fill('#dirPromptInput', 'Fresh Prep');
      await p2.click('#dirPromptConfirm');
      await h2.wait(300);

      // Switch to Duplicated Prep first: sequence should be copied
      await p2.click('#dirBreadcrumbs [data-crumb-id="root"]');
      await h2.wait(250);
      await p2.click('#dirContent [data-dir-name$="(Copy)"] [data-dir-open]');
      await h2.wait(400);
      const dupSeq = await p2.$eval('#protSeq', el => el.value);
      T.check('duplicated-prep-keeps-sequence', dupSeq === 'MHHHHHHWYWYWYWY', `Duplicated prep sequence: "${dupSeq}"`);

      // Switch to Fresh Prep in Subfolder Y: QKEYS sequence must be clean, and nested breadcrumbs shown in bar
      await p2.click('#openDirBtn');
      await h2.wait(250);
      await p2.click('#dirBreadcrumbs [data-crumb-id="root"]');
      await h2.wait(200);
      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-open]');
      await h2.wait(200);
      await p2.click('#dirContent [data-dir-name="Subfolder Y"] [data-dir-open]');
      await h2.wait(200);
      await p2.click('#dirContent [data-dir-name="Fresh Prep"] [data-dir-open]');
      await h2.wait(500);

      const freshSeq = await p2.$eval('#protSeq', el => el.value);
      T.check('new-prep-isolates-qkeys', freshSeq === '', `Fresh prep sequence should be empty, got "${freshSeq}"`);
      const barText = await p2.$eval('#projDirCrumbs', el => el.innerText);
      T.check('nested-crumbs-in-bar', barText.includes('Folder X') && barText.includes('Subfolder Y') && barText.includes('Fresh Prep'), `Bar text: "${barText}"`);

      // Leave workspace to flush IndexedDB save while Fresh Prep (0 runs) is active, then reopen from Home
      await p2.click('#homeBtn');
      await h2.wait(700);
      await p2.locator('#projList .pcard', {hasText: 'Persistence Matrix Project'}).click();
      await h2.wait(900);

      // Export project while active Fresh Prep has 0 runs (other preps & directory have data)
      const [expDl] = await Promise.all([p2.waitForEvent('download', {timeout: 10000}), p2.click('#projSave')]);
      const expPath = await expDl.path();
      T.check('export-works-when-active-prep-empty', !!expPath && fs.statSync(expPath).size > 100, 'Export succeeded when active prep is empty');

      // Verify uploaded attachment in Folder X still downloads from IndexedDB after reload
      await p2.click('#openDirBtn');
      await h2.wait(300);
      await p2.click('#dirBreadcrumbs [data-crumb-id="root"]');
      await h2.wait(200);
      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-open]');
      await h2.wait(250);
      const [attDl1] = await Promise.all([
        p2.waitForEvent('download', {timeout: 10000}),
        p2.click('#dirContent [data-dir-type="file"] [data-dir-open]')
      ]);
      const attSize1 = fs.statSync(await attDl1.path()).size;
      T.check('uploaded-attachment-downloads-after-reload', attSize1 === expectedBytes, `Expected ${expectedBytes} bytes, got ${attSize1}`);

      // Test archiving Folder X and restoring it preserves Subfolder Y and Fresh Prep
      await p2.click('#dirBreadcrumbs [data-crumb-id="root"]');
      await h2.wait(200);
      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-archive]');
      await h2.wait(400);
      await p2.click('#dirToggleArchive');
      await h2.wait(250);
      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-restore]');
      await h2.wait(400);
      await p2.click('#dirToggleArchive');
      await h2.wait(250);
      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-open]');
      await h2.wait(250);
      const subYRestored = await p2.locator('#dirContent [data-dir-name="Subfolder Y"]').isVisible();
      T.check('folder-restore-preserves-subtree', subYRestored, 'Subfolder Y restored intact when parent Folder X restored');

      // Switch back to initial Prep 001 and verify its raw-file blob survived saving while inactive
      await p2.click('#dirBreadcrumbs [data-crumb-id="root"]');
      await h2.wait(200);
      await p2.locator('#dirContent [data-dir-type="prep"]:not([data-dir-name$="(Copy)"]) [data-dir-open]').first().click();
      await h2.wait(500);

      await p2.click('#rawSum');
      await h2.wait(200);
      const [rawDl] = await Promise.all([
        p2.waitForEvent('download', {timeout: 10000}),
        p2.click('#rawList [data-rawdl]')
      ]);
      T.check('inactive-rawfile-blob-survives-prep-switch', fs.statSync(await rawDl.path()).size > 0, 'Inactive prep raw file downloaded cleanly');

      // Import the exported JSON and verify Explorer file attachment also survives JSON round-trip
      await p2.click('#homeBtn');
      await h2.wait(400);
      await p2.click('#homeQuick');
      await h2.wait(800);
      await p2.setInputFiles('#projFile', expPath);
      await h2.wait(2000);
      await p2.click('#openDirBtn');
      await h2.wait(300);
      await p2.click('#dirBreadcrumbs [data-crumb-id="root"]');
      await h2.wait(200);
      await p2.click('#dirContent [data-dir-name="Folder X"] [data-dir-open]');
      await h2.wait(250);
      const [attDl2] = await Promise.all([
        p2.waitForEvent('download', {timeout: 10000}),
        p2.click('#dirContent [data-dir-type="file"] [data-dir-open]')
      ]);
      const attSize2 = fs.statSync(await attDl2.path()).size;
      T.check('uploaded-attachment-survives-json-roundtrip', attSize2 === expectedBytes, `Expected ${expectedBytes} bytes after JSON import, got ${attSize2}`);
      await p2.click('#projExplorerClose');
      await h2.wait(200);

      // Verify #quickSave initializes project directory
      await p2.click('#homeBtn');
      await h2.wait(400);
      await p2.click('#homeQuick');
      await h2.wait(800);
      await p2.click('#quickSave');
      await h2.wait(500);
      const qsCrumbs = await p2.$eval('#projDirCrumbs', el => el.innerText);
      T.check('quicksave-initializes-directory', qsCrumbs.includes('Root') && qsCrumbs.includes('🧪'), `QuickSave crumbs: "${qsCrumbs}"`);

      T.check('no-page-errors-persistence-matrix', !errs2.length, errs2.join(' | '));
    } finally {
      await close2();
    }
  });

  await T.t('over-5mb-explorer-attachment-and-hollow-import', async () => {
    const {p: p3, errs: errs3, close: close3} = await open(), h3 = H(p3);
    const {p: p4, errs: errs4, close: close4} = await open(), h4 = H(p4);
    try {
      await h3.newProject('Large Attachment Project');
      await p3.click('#openDirBtn');
      await h3.wait(250);

      const bigBuf = Buffer.alloc(5557452, 0x42); // ~5.3 MB (> 5242880 bytes)
      await p3.setInputFiles('#dirFileInput', [{name: 'large_capture.bin', mimeType: 'application/octet-stream', buffer: bigBuf}]);
      await h3.wait(500);

      const upToasts = await h3.toasts();
      const fileRow3 = p3.locator('#dirContent .dir-row[data-dir-type="file"], #dirContent .dir-card[data-dir-type="file"]').first();
      const rowText3 = await fileRow3.innerText();
      const openDisabled3 = await fileRow3.locator('[data-dir-open]').isDisabled();
      T.check('explorer-5mb-upload-warns-and-badges',
        upToasts.some(t => /browser only/i.test(t) && /5 MB/i.test(t)) &&
        /Browser only \(>5 MB\)/.test(rowText3) && !openDisabled3,
        `toasts=${upToasts.join(' | ')} | row="${rowText3}" | disabled=${openDisabled3}`);

      await p3.click('#projExplorerClose');
      await h3.wait(200);

      const [expDl] = await Promise.all([p3.waitForEvent('download', {timeout: 10000}), p3.click('#projSave')]);
      await h3.wait(250);
      const saveToasts = await h3.toasts();
      const expJsonPath = await expDl.path();
      const expJson = JSON.parse(fs.readFileSync(expJsonPath, 'utf8'));
      const expFile = expJson.directory && expJson.directory.files && expJson.directory.files[0];
      T.check('explorer-5mb-export-omits-blob-and-warns',
        saveToasts.some(t => />5 MB/i.test(t) && /\.json/i.test(t)) &&
        expFile && !expFile.dataUrl && !expFile._dataUrl,
        `toasts=${saveToasts.join(' | ')}`);

      await p4.setInputFiles('#projFile', expJsonPath);
      await h4.wait(1500);
      await p4.click('#openDirBtn');
      await h4.wait(300);

      const fileRow4 = p4.locator('#dirContent .dir-row[data-dir-type="file"], #dirContent .dir-card[data-dir-type="file"]').first();
      const rowText4 = await fileRow4.innerText();
      const openBtn4 = fileRow4.locator('[data-dir-open]');
      const openDisabled4 = await openBtn4.isDisabled();
      await openBtn4.click({force: true}).catch(() => {});
      await h4.wait(250);
      const impToasts4 = await h4.toasts();

      T.check('explorer-5mb-imported-hollow-shows-badge-and-disables-open',
        /Not in \.json \(>5 MB\)/.test(rowText4) && openDisabled4 && !impToasts4.some(t => /could not read/i.test(t)),
        `row="${rowText4}" disabled=${openDisabled4} toasts=${impToasts4.join(' | ')}`);
      T.check('no-page-errors-5mb-matrix', !errs3.length && !errs4.length, [...errs3, ...errs4].join(' | '));
    } finally {
      await close3();
      await close4();
    }
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();

