// Issue #1647: Windows File Explorer-style directory system for projects
// Supports folders, nested subfolders, multiple independent protein preparations,
// tree navigation, breadcrumbs, search, sorting, list/grid views, rename, move,
// duplicate, archive, restore, drag-and-drop, attachments, and circular nesting prevention.
const {open, H, suite, fs, path, src} = require('../lib/harness');

(async () => {
  const T = suite('1647_project_directory');
  const {p, errs, close} = await open(), h = H(p);

  await T.t('explorer-navigation-and-structure', async () => {
    await h.newProject('Protein X Project');
    await h.wait(500);

    // Explorer button in project bar
    const openDirBtn = p.locator('#openDirBtn');
    T.check('explorer-btn-visible', await openDirBtn.isVisible(), 'openDirBtn visible in project bar');

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

    // Test Rename: Rename "Prep 001 (Copy)" to "Prep 001 Duplicated"
    await p.click('#dirContent [data-dir-name="Prep 001 (Copy)"] [data-dir-rename]');
    await h.wait(200);
    await p.fill('#dirPromptInput', 'Prep 001 Duplicated');
    await p.click('#dirPromptConfirm');
    await h.wait(400);

    const renamedItem = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('prep-renamed', await renamedItem.isVisible(), 'Renamed prep visible');

    // Test Move: Move "Prep 001 Duplicated" to "Construct B"
    await p.click('#dirContent [data-dir-name="Prep 001 Duplicated"] [data-dir-move]');
    await h.wait(200);
    await p.selectOption('#dirMoveSelect', {label: 'Construct B'});
    await p.click('#dirMoveConfirm');
    await h.wait(400);

    // Should no longer be in Construct A
    T.check('moved-away-from-construct-a', !(await p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]').isVisible()), 'No longer in Construct A');

    // Go to Construct B and verify it is there
    await p.click('#dirBreadcrumbs [data-crumb-id="root"]');
    await h.wait(300);
    await p.click('#dirContent [data-dir-name="Construct B"] [data-dir-open]');
    await h.wait(300);
    const movedInB = p.locator('#dirContent [data-dir-name="Prep 001 Duplicated"]');
    T.check('moved-to-construct-b', await movedInB.isVisible(), 'Prep 001 Duplicated now in Construct B');

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
    // Add run to active prep so export has valid data
    await h.addRun(src('his'));
    await h.wait(300);

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
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close();
  T.done();
})();
