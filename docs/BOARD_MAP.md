# Map of the project for the Polishing and Creative boards

The Polishing board (#222) walks these domains one per meeting, least recently visited first, for code-grounded bug, unit, parser and geometry checks. The Creative Direction board pairs two domains at a time to pitch cross-step workflow ideas before any code is written. At the end of a meeting the advisers set one outside research question each, answered before the next meeting.

Edit this page freely. A domain is a `## ` heading. The `Code:` line names sections of the app exactly as `docs/CODEMAP.md` does, in backticks. The rest is read as plain text by the advisers. Keep each domain short: every word here goes into every meeting on that domain.

## Instrument files and import
- Covers: reading ÄKTA and UNICORN exports (CSV, the UNICORN 7 .zip), generic HPLC CSVs, quoted and odd CSVs, telling curves and runs apart, loading several files at once.
- Code: `parsing: generic`, `UNICORN 7 result archive (.zip)`, `loading`
- Tests: 11_unicorn_zip, 15_import_sec, 17_cross_format, 18_hplc_load, 47_export_project, 30_robust
- Worth exploring: exports from other instruments and software versions (UNICORN 5 and 6, Agilent OpenLAB, Shimadzu LabSolutions, Waters Empower, Bio-Rad NGC), multi-wavelength diode-array tables, fraction and injection log alignment, and very long runs.
- Outside knowledge that helps: published descriptions of chromatography result formats, instrument manuals, what labs commonly export.

## Chromatogram analysis: peaks, pooling and yield
- Covers: baselines, peak detection and integration, pooled fractions, carry-over between columns, enzyme activity assays, yield through the purification.
- Code: `peak integration`, `traces and runs`, `activity assays: data model`, `activity assays: calculation engine`, `run conditions: column, buffers, flow, temperature, gradient, load, fractions`
- Tests: 14_peaks, 19_assays, 45_yield_semantic, 20_science
- Worth exploring: asymmetric or tailing peaks, shoulder resolution, how pooled fraction boundaries interact with dead volume between UV cell and fraction collector, mAU against AU pathlength scaling, and yield when a sample is split across parallel columns or reloaded.
- Outside knowledge that helps: chromatography textbooks and vendor handbooks (Cytiva's Protein Purification Handbook series), how other software integrates peaks.

## Size exclusion: calibration and mass
- Covers: SEC column calibration from standards, Kav, apparent molecular weight and oligomeric state, the SEC figure.
- Code: `run conditions: column, buffers, flow, temperature, gradient, load, fractions`, `size exclusion (SEC)`, `SEC panel`
- Tests: 15_import_sec, 26_sec_calibration, 27_sec_mass_calculation, 28_sec_figure
- Worth exploring: calibration standards for common preparative and analytical columns (Superdex 75 Increase, Superdex 200 Increase, Superose 6), Stokes radius vs globular mass assumptions for elongated or disordered proteins, oligomeric stoichiometry calls, and temperature/viscosity effects.
- Outside knowledge that helps: column manuals, published calibration practice, SEC-MALS comparisons.

## SDS-PAGE gels and densitometry
- Covers: gel images, auto crop, lane profiles, band detection, ladder calibration, purity per lane, band tags.
- Code: `gels`, `gel densitometry: lane profiles, bands, ladder calibration`, `band tags and purity`
- Tests: 25_gels, 1664_gel_and_moreopts_subcategories
- Worth exploring: stain-specific dye binding differences (Coomassie vs Stain-Free Trp-dependent intensity vs silver stain), closely spaced doublet bands, skewed rotation/crop edge cases, and mapping gel lane purity directly to pooled chromatographic fractions.
- Outside knowledge that helps: densitometry guidance in methods papers, ImageJ and Image Lab practice, ladder datasheets.

## Protein and sequence
- Covers: sequence properties (mass, extinction coefficient, pI), tags and their removal, GenBank import, PDB structures.
- Code: `construct and expression panel`, `protein: sequence properties and PDB structures`
- Tests: 12_genbank, 22_protein, 1661_construct_protein_subcategories
- Worth exploring: exact protease cleavage site scars (TEV, HRV 3C, thrombin, SUMO, factor Xa) and pre- vs post-cleavage mass/extinction shifts, cofactor or ligand absorbance contributions, average vs monoisotopic intact mass, and multi-chain complexes.
- Outside knowledge that helps: ExPASy ProtParam's method and its published basis (Pace et al. 1995), tag and protease datasheets.

## Upstream: cloning, expression and lysis
- Covers: the cloning workflow (stages, attempts, lineage), construct, transformation, expression, lysis, agarose gels.
- Code: `construct and expression panel`, `cloning workflow: stages, attempts and lineage`
- Tests: 12_genbank, 1402_cloning_engine, 29_agarose, 1662_upstream_steps_subcategories, 1665_agarose_gel_subcategories
- Worth exploring: linking construct variants (mutants, truncations, solubility tags) cleanly into comparative expression/solubility screens, induction and harvest metadata that explain yield differences, and restriction/colony-PCR expected fragment checks.
- Outside knowledge that helps: NEB protocols (Q5, KLD, HiFi), electronic lab notebook practice, MIQE-style reporting ideas.

## Figures: HPLC overlay, run chart and the workflow figure
- Covers: what the saved figures look like, labels and their collisions, the zoom inset, the composite workflow figure, journal sizes.
- Code: `figure: shared bits`, `figure: HPLC overlay`, `figure: ÄKTA run chart`, `composite: run with gels, and the workflow`
- Tests: 42_figures, 43_zoom_inset, 31_wf_full, 24_workflow_branches, 40_visual, 1666_workflow_summary_subcategories
- Worth exploring: journal figure geometry rules (single/double column widths, minimum font size after scaling, stroke weights), multi-trace normalization or offset stacking for crowded overlays, legend vs direct trace labelling, and composite workflow alignment with many steps.
- Outside knowledge that helps: author guidelines from journals Patrick might publish in, data-visualization research on overlays.

## Methods text and provenance
- Covers: the written Methods paragraph, the gaps it names, where each number came from.
- Code: `run conditions: column, buffers, flow, temperature, gradient, load, fractions`, `the step timeline`
- Tests: 21_methods, 23_provenance, 19_assays, 31_wf_full, 1663_run_card_subcategories
- Worth exploring: tracing every reported yield, concentration and purity figure back to its raw measurement, journal reproducibility checklists (STAR Methods, Nature reporting summaries), and concise buffer/gradient phrasing across multi-step preps.
- Outside knowledge that helps: published Methods sections from structural biology papers, journal reporting checklists.

## Projects, storage, export and old files
- Covers: projects saved in the browser, export and import of project files, settings, keeping old files loading.
- Code: `projects: a project per purification, saved with the page (db + assets) or in this browser`, `projects: everything in one JSON file`, `projects: directory, folders, preparations, explorer and file attachments`, `export`, `home`
- Tests: 47_export_project, 50_export, 48_empty_start, 32_project_ux, 1647_project_directory, 1673_home_folders
- Worth exploring: IndexedDB quota pressure with many high-bit-depth gel TIFFs, round-trip fidelity of every field across export/import, archival bundles for supplement deposits, and legacy file upgrade paths.
- Outside knowledge that helps: IndexedDB quotas in current browsers, file-format versioning practice.

## Concentration and NanoDrop
- Covers: NanoDrop readings, A280, concentration and units through the workflow.
- Code: `NanoDrop: protein A280 readings`
- Tests: 16_nanodrop
- Worth exploring: baseline offset / scatter correction trends across full UV spectra, linking replicate spread into concentration uncertainty, buffer blank mismatches (imidazole or nucleotide absorbance at 280 nm), and ultrafiltration concentrator recovery tracking.
- Outside knowledge that helps: Thermo NanoDrop documentation, published guidance on A280 accuracy.

## Usability and layout
- Covers: the step timeline, panels and their summaries, the "what to do next" hint, phones and small screens, keyboard use.
- Code: `UI`, `the step timeline`, `collapsible panel sections (remembered), each with a one-line summary when closed`, `what to do next: one suggestion above the figure, with a button that takes you there`
- Tests: 40_visual, 44_panel_more, 41_workflow_drag_hint
- Worth exploring: friction when moving from raw dropped files to a finished multi-step figure, keyboard shortcuts and table navigation, progressive disclosure so advanced controls never crowd everyday tasks, and narrow-viewport layout safety.
- Outside knowledge that helps: usability research on scientific software, WCAG guidance.

## Speed and robustness
- Covers: large files, many runs, slow steps, odd input that should not break the app.
- Code: `loading`, `traces and runs`
- Tests: 60_perf, 30_robust, 10_data_truth
- Worth exploring: downsampling vs exact data fidelity on very dense chromatograms, memory footprint with multiple 16-bit gel images in one project, and graceful recovery from malformed or truncated exports.
- Outside knowledge that helps: browser performance practice for large SVGs and canvases.
