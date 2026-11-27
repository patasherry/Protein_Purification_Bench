# Test suite for Protein Purification Bench

Browser tests that drive the app through its UI (clicking, typing, dropping files) and check what it displays.
They run in headless Chromium through Playwright.

Before writing or editing browser tests, read [AGENT_TIPS.md](../docs/AGENT_TIPS.md) for harness usage patterns and common traps that stall automation (hidden controls inside projects, modal states, timing limits).

## Run it

```
cd tests
npm install                        # once
npx playwright install chromium    # once
node run.js                        # run every suite against the app in repo root
ONLY=25 node run.js                # run a single suite matching a pattern using ONLY=
ONLY=gels node run.js              # run suite matching "gels"
node run.js 00_ 10_                # run specific suites passed as arguments
```

- `APP=/path/to/other.html node run.js` tests a different build.
- `ONLY=<pattern> node run.js` filters tests using a pattern or regular expression matching suite files or checks.
- `node quick.js` is the fast path before a pull request: it compares only preflight, smoke, the suites you changed and the suites mapped to the app sections your diff touches. `node quick.js --list` shows the choice. The mapping lives at the top of `quick.js`: add a line there when you add a suite or an app section.
- `node compare.js` runs all suites on your working copy and on `origin/main` baseline, writing `results/compare.md` listing regressions, fixes, and invariant failures. `BASE=<file or git ref>` sets a custom baseline. A regression is a check that passed on the baseline and fails on the new build, a check that passed on the baseline and is missing on the new build (its block threw, or its suite crashed or stopped early), or a new `:threw`, `crashed` or `time-budget` failure. A suite that exits without writing results is recorded by `run.js` as one failed check, `<suite>/crashed`.
- Test logs and screenshots go to `results/` (not committed).

After running tests, read the output of `node failures.js`, not the full logs.

## Suites

| File | Area | What it checks |
|---|---|---|
| `00_preflight.js` | Preflight | Repository preflight check ensuring no untracked files, stray artifacts, or disallowed edits exist before opening a PR. |
| `00_smoke.js` | Smoke | Basic smoke test: page loads, a project opens, and a chromatogram run loads, verifying harness connectivity. |
| `01_name.js` | App Name | Application branding ("Protein Purification Bench") alongside preserved backward-compatible storage keys and JSON headers. |
| `05_quick.js` | Quick-Figure | Quick-Figure mode (`#quick`): example data generation, trace dropping, SVG/PNG export without saving to project, and state clearing. |
| `10_data_truth.js` | Data Truth | Synthetic files with known answers: SEC detection, column model, flow rate, UV pathlength, fraction labels, peak volumes, pool area/mg, and NanoDrop means. |
| `11_unicorn_zip.js` | UNICORN 7 | Parses UNICORN 7 `.zip` archives, verifying fraction/injection labels, curve extraction, missing curves, and archive corruption handling. |
| `12_genbank.js` | GenBank & Construct | GenBank/SnapGene parsing across synthetic edge cases, construct sequence linking, and cloning-method-specific construct fields. |
| `14_peaks.js` | Peaks | Peak integration with known answers (isolated, separated, overlapping, sloped baseline, and valley/dip pool area) across Gaussian and trapezoidal methods. |
| `15_import_sec.js` | Import & SEC | Synthetic regression checks for SEC peak matching, UNICORN decimal commas, UV-only CSV exports, partial `.zip` curves, legacy SEC calibration units, and NanoDrop number formatting. |
| `16_nanodrop.js` | NanoDrop | NanoDrop spectrum/table parsing: protein concentration readings, unit normalization (`mg/mL`, `µg/mL`, `ng/µL`, `µg/µL`, unsupported units), $A_{260}/A_{280}$ ratio warnings, and SD/mean calculations. |
| `17_cross_format.js` | Cross-Format | Cross-format validation (comma vs period decimals, delimiter variations, quoted CSV headers/cells) ensuring identical peak retention, height, area, and integration. |
| `18_hplc_load.js` | HPLC Load | Generic HPLC CSV/text chromatogram loading in both Quick-Figure mode and project workflows, verifying headers, traces, and overlay tabs. |
| `19_assays.js` | Activity Assays | Enzyme activity assays: persistence & normalization (IndexedDB, cloud, JSON), rate/specific-activity/fold/yield engine, nonlinear Michaelis-Menten/Hill/Haldane fits, CSV/TSV UI, figure tracks/overlays/panels, and STRENDA Methods/summary output. |
| `20_science.js` | Science | Scientific arithmetic and consistency: summary table calculations (mole-based yields across tag cleavage), methods text, panel lettering, SEC elution volumes, and step reordering. |
| `21_methods.js` | Methods | Generated Materials and Methods prose, actionable gap jump buttons, and between-step volume unit formatting. |
| `22_protein.js` | Protein | Sequence property calculations (MW, $\varepsilon_{280}$, pI, tag mass presets, cleavage mass shifts, untagged defaults) verified against independent computations. |
| `23_provenance.js` | Provenance | Concentration and yield data provenance tracking (calculated UV area, measured NanoDrop, transferred, manual). |
| `24_workflow_branches.js` | Workflow Branches | Parallel purification workflow branching (`wfFrom`) across chromatography and manual steps with per-branch yields. |
| `25_gels.js` | Gels | Synthetic SDS-PAGE gel images: densitometry invariance, purity $\le 100\%$, ladder withholding, manual tags, oversized gel IndexedDB blob offloading/export, and band-prompt toast collision avoidance. |
| `26_sec_calibration.js` | SEC Calibration | SEC calibration standards: $K_{av}$ calculations, linear regression curve fitting ($\log M_w$ vs $K_{av}$), and sample peak apparent MW prediction. |
| `27_sec_mass_calculation.js` | SEC Mass & Recovery | Peak molecular weight calculations against SEC calibration curves and Beer-Lambert UV pathlength/extinction scaling in recovery calculations. |
| `28_sec_figure.js` | SEC Figure | SEC run chart and secondary MW axis: elution volume ticks, peak MW annotations matching calibration, and calibration standard curves. |
| `29_agarose.js` | Agarose Gels | Cloning agarose-gel verification: upload & restore, reversible crop/rotation/brightness/contrast, lane editor, ladder calibration, band topology, metadata, publication SVG figure, and high-res blob offloading. |
| `30_robust.js` | Robustness | Malformed inputs, 150-action fuzz test with invariants, browser/cloud save and reload round trips, and JSON export/import. |
| `31_wf_full.js` | Workflow Figure | Full chromatogram (`wfFull`) and uncropped gel (`wfGelFull`) display, panel padding, condition placeholders across viewports, and layout refit after hiding steps. |
| `32_project_ux.js` | Project UX | End-to-end project creation, navigation, step editing, and persistence user flows. |
| `40_visual.js` | Visual | Visual layout and DOM checks across desktop, tablet, and phone viewports: dark mode, panel lettering, toolbar overlap, and text contrast. |
| `41_workflow_drag_hint.js` | Workflow Drag | Drag-and-drop panel positioning in the workflow figure: positional drag indicators and reset buttons. |
| `42_figures.js` | Figures | Figure styling options reaching exported SVG and PNG, axis reordering, crowded peak/run-status label collision avoidance, SVG grouping, and screen-only furniture scoping. |
| `43_zoom_inset.js` | Zoom Inset | Magnified zoom inset on HPLC and ÄKTA figures: expanded sub-window plot inset within or beside the main chromatogram. |
| `44_panel_more.js` | UI & Panels | Side panel progressive disclosure, settings search, iOS-inspired control styling, sidebar trace wrapping, add-run menu placement, and toast dismissal. |
| `45_yield_semantic.js` | Yield & Carryover | Purification yield semantics, downstream split/all carryover allocation, legacy compatibility, and unmeasured steps. |
| `47_export_project.js` | Project Archive | Single-JSON project export/import round trips, `schemaVersion`, gel blob stripping, raw instrument file attachments, and persistence across reloads. |
| `48_empty_start.js` | Empty Start | Clean initial home/empty state behavior before any project or trace is loaded. |
| `50_export.js` | Export | Complete export coverage: SVG, high-DPI PNG, multi-figure ZIP bundles, CSV peak/data exports, and complete project JSON. |
| `60_perf.js` | Performance | Performance budgets: ensures UI rendering, file loading, and layout calculations complete within defined timing budgets. |
| `1402_cloning_engine.js` | Cloning Engine | Cloning workflow stages, attempts, lineage graph, folding/joining into purification, and selected clone synchronization. |
| `1647_project_directory.js` | Project Directory | Project directory, preparations, file explorer, and attachments management. |
| `1661`–`1666_*_subcategories.js` | Panel Subcategories | Collapsible subcategory organization across construct/protein, upstream steps, run cards, SDS-PAGE/agarose gels, and workflow summary panels. |
| `1673_home_folders.js` | Home Folders | Home screen folder organization, filtering, and project grouping. |

## Usability Scopes (`tests/ux/`)

In addition to the unit and integration suites, `tests/ux/` provides end-to-end usability walkthroughs using Playwright:

```
node tests/ux/scope.js <scope_name> <output_folder>
```

Defined in `tests/ux/scopes.js`, these scopes walk simulated biochemist workflows (first visit, multi-step purification, layout adjustments and panel dragging, gel densitometry, SEC calibration, zoom insets, mobile widths, dark mode, and project persistence). Each step records visual artifacts and screen captures to detect UI regressions, overlaps, cutoffs, or unexpected horizontal scrollbars without touching production data.

For writing new automated tests or UI interaction scripts, consult [docs/AGENT_TIPS.md](../docs/AGENT_TIPS.md) for critical guidance on avoiding traps like hidden DOM nodes inside projects, tab visibility rules, and harness shortcuts.

## Developer Tools (`tests/tools/`)

- `tests/tools/codemap.js`: Inspects `protein-purification-bench.html` and outputs the current section markers and exact line ranges in Markdown table format, making it easy to refresh `docs/CODEMAP.md` as the application grows:
  ```
  node tests/tools/codemap.js
  ```

## Rules for the suites

- Drive the app only through its UI and DOM, never its internal functions.
- Element selectors live in `lib/harness.js` (or a `SEL` block at the top of a suite).
- Every check has a stable ID and a descriptive comment. A thrown error registers as a failed check rather than crashing the suite.
- User-visible numerical fixes require minimal main-failing evidence: add one UI-level synthetic case that fails on main and passes on the branch. Assert the displayed value with an appropriate tolerance or exact text when rounding is contractual, allowing domain-specific tests to define the expected semantics.

## Test data: synthetic stand-ins and PPB_PRIVATE_DATA

All files under `data/` are synthetic test inputs generated by scripts with fixed random seeds:

- `data/gen_chrom.py`: Chromatograms across supported formats, with expected values in `data/expected.json`.
- `data/gen_nd.py`: NanoDrop readings with expected values.
- `data/gen_genbank.py`: Synthetic GenBank files with edge cases.
- `data/science/gen_science.py`: SEC runs and NanoDrop inputs for the science suite.
- `data/qa/gen_qa.py`: Malformed and edge-case inputs for robustness testing.
- `data/standins/gen_standins.py`: Synthetic stand-ins for private lab files.
- `data/gen_crowded_peaks.js`: Eight closely spaced HPLC peaks whose labels cannot all fit; `42_figures.js` builds the CSV in memory, so no file is written.

Some tests were originally designed against real lab data. Those private files remain unpublished. `lib/harness.js` automatically maps private file paths to synthetic stand-ins in `data/standins/`.
To run tests against original private lab files on authorized machines, point `PPB_PRIVATE_DATA` (legacy `HFB_PRIVATE_DATA` is also accepted) to their folder:

```
PPB_PRIVATE_DATA=/path/to/private/folder node run.js
```

Never commit real chromatograms, gel photos, plasmid maps, or sequence files to this repository.
