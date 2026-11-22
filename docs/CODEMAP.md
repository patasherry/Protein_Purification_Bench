# Protein Purification Bench Code Map (`protein-purification-bench.html`)

> **Note:** The line ranges in **Sections** and symbol line numbers in **Key Functions** and **Where to Change X** are rewritten automatically after every merge that changes the app (`node tests/tools/codemap.js --write`, run by the Code map workflow), so they match `main`. On a branch of your own they drift as you edit: run `node tests/tools/codemap.js --plain` for section ranges in your working copy, or `node tests/tools/codemap.js --check` to verify `docs/CODEMAP.md` is current.

---

## Sections

| Lines | Section | Purpose |
|---|---|---|
| 1700–1763 | `helpers` | Generic string escaping, array math, tick fitting, formatting, and SVG helpers |
| 1764–1934 | `parsing: generic` | General text/CSV/TSV chromatogram parsing, header detection, and delimiter splitting |
| 1935–2036 | `parsing: ÄKTA / UNICORN` | ÄKTA exported CSV parsing for UV, gradient (%B), conductivity, pressure, and fraction logs |
| 2037–2073 | `UNICORN 7 result archive (.zip)` | Decompressing UNICORN 7 `.zip` archives and extracting binary result curves |
| 2074–2188 | `traces and runs` | Managing trace data objects, baseline correction, smoothing, and run data creation |
| 2189–2313 | `runs: windows and fractions` | Fraction boundary detection, fraction segment calculation, and time/volume windowing |
| 2314–2335 | `peak integration` | Numerical integration algorithms (Simpson/trapezoidal, Gaussian fit) between retention limits |
| 2336–2665 | `size exclusion (SEC)` | SEC molecular weight calibration, standards curve fitting ($V_e/V_0$ and $K_{av}$ vs $\log M_w$), and peak mass calculations |
| 2666–2716 | `figure: shared bits` | Common SVG chart dimensions, axis tick rendering, styles, and color definitions |
| 2717–3060 | `figure: zoom inset` | Magnified inset plot on HPLC and ÄKTA figures showing an expanded sub-window within or beside the main chart |
| 3061–3221 | `figure: HPLC overlay` | Rendering analytical HPLC overlay chromatograms with aligned peak labels and legend |
| 3222–3581 | `figure: ÄKTA run chart` | Rendering ÄKTA preparative run figures with dual Y-axes, fractions, and phase shading |
| 3582–3677 | `gels` | SDS-PAGE gel image object construction, lane assignments, and crop metadata |
| 3678–3788 | `auto crop: find the stained lanes, their spacing, and the top and bottom of the bands` | Image processing to detect stained SDS-PAGE lanes, lane spacing, and top/bottom gel bounds |
| 3789–4023 | `gel densitometry: lane profiles, bands, ladder calibration` | Lane pixel intensity profile extraction, band peak detection, and ladder $R_f$ log-MW calibration |
| 4024–4495 | `band tags and purity` | Gel band tagging, contaminant identification, known protein matching, and lane purity math |
| 4496–4838 | `composite: run with gels, and the workflow` | Rendering multi-panel purification workflow figures combining chromatograms, SDS-PAGE gel aligned lanes, parallel branches, and final yield line |
| 4839–5333 | `upstream steps: construct, expression and lysis, drawn before the first column` | Upstream purification steps (construct cassette, expression, lysis, cleavage) diagram rendering and GenBank parsing |
| 5334–5564 | `run conditions: column, buffers, flow, temperature, gradient, load, fractions` | Formatting run conditions (column model, buffer compositions, flow rate, gradient) and generating methods and results text |
| 5565–5605 | `figures` | Active figure selection and figure state getters |
| 5606–6213 | `UI` | DOM element event bindings, tab management, control synchronization, and interactive table rendering |
| 6214–6687 | `editing the workflow figure in place: click a panel for its title, arrow note, width and gel size` | On-figure interactive click handlers and floating toolbar (`#wfTool`, `#wfSelBox`) to adjust panel titles, arrow notes, widths, gel heights, and drag offsets (`wfDx`, `wfDy`) |
| 6688–6952 | `loading` | File drag-and-drop / file input handlers for chromatograms, gel images, GenBank, and PDB files |
| 6953–7115 | `protein: sequence properties and PDB structures` | Protein MW, $\varepsilon_{280}$, pI calculations from sequence, and PDB/mmCIF 3D structure domain parsing |
| 7116–7258 | `construct and expression panel` | UI controls, GenBank file loading/text pasting (`#gbPaste`), and SVG builder for construct cassette, expression host, and lysis parameters |
| 7259–7260 | `NanoDrop: protein A280 readings` | NanoDrop UV-Vis spectrum/summary parser, $A_{280}$ concentration calculations, and concentration bar charts |
| 7261–7575 | `activity assays: data model` |  |
| 7576–7673 | `SEC panel` | UI controls and calibration curve plots for size-exclusion chromatography standards |
| 7674–7683 | `collapsible panel sections (remembered), each with a one-line summary when closed` | Expand/collapse accordion panel UI state persistence in `localStorage` |
| 7684–7741 | `More options inside each section (open or closed remembered), and the settings search` | Condensed progressive disclosure sections (`details.more`), settings search filter (`#panelSearch`), and automatic expansion of non-default settings (`moreSync`) |
| 7742–7785 | `what to do next: one suggestion above the figure, with a button that takes you there` | Guided workflow suggestion bar above figures with actionable next-step buttons |
| 7786–7880 | `projects: everything in one JSON file` | Exporting workspace state to `.json` files and importing project files |
| 7881–8219 | `projects: a project per purification, saved with the page (db + assets) or in this browser` | IndexedDB (`hfb-projects`) and cloud persistence for multi-project management and asset blob storage |
| 8220–8302 | `home` | Home screen workspace project list and project creation/opening UI |
| 8303–9320 | `projects: directory, folders, preparations, explorer and file attachments` |  |
| 9321–10814 | `cloning workflow: stages, attempts and lineage` | The cloning engine: stage kinds and templates as data (`CL_KIND`, `CL_TPL`), attempts, flags, lineage and the `#clonePanel` |
| 10815–10967 | `the step timeline` | Step-by-step purification timeline editor and step metadata sheet |
| 10968–11202 | `quick fill: the lab's usual procedures, one click per step; every field stays editable` | One-click lab protocol templates (`LABQ`) populating workflow steps (IMAC, SEC, cleavage, expression, lysis) |
| 11203–11316 | `export` | Exporting figures to High-DPI PNG, SVG, and bundled ZIP archives |
| 11317–11337 | `example data` | Built-in demo chromatogram curves and gel images for instant testing |

---

## Data Structures

### `run` (Chromatogram / Purification Step)
- `id`: Unique run ID string (e.g. `'r1'`)
- `name`: String run title (e.g. `"HisTrap FF 5 mL"`)
- `stepName`: Optional custom title string for the workflow figure panel
- `type`: String run type (`"overlay"`, `"akta"`, etc.)
- `file`: Original filename string
- `method`: Method name string
- `time`: Timestamp used for sorting runs
- `color`: Primary curve hex color (default `RUN_COLORS.uv`)
- `uvi`: Selected UV channel index
- `uvs`: Array of UV trace objects `[{ xs: Float64Array, ys: Float64Array, name: "UV1_280", unit: "mAU" }]`
- `fracs`: Fraction boundary object `{ name: "Fractions", xs: [...], xe: [...] }`
- `grad`: Gradient %B curve `{ xs: [...], ys: [...] }`
- `cond`: Conductivity curve `{ xs: [...], ys: [...] }`
- `flow`: Flow rate curve `{ xs: [...], ys: [...] }`
- `pres`: Pressure curve `{ xs: [...], ys: [...] }`
- `inj`: Injection volume / position marker
- `shade`: Fraction shading string or array of shaded retention regions `[{ a: float, b: float, col: "#hex" }]`
- `integ`: Array of peak integration region objects `[{ a: float, b: float, name: "Peak 1", area: float }]`
- `secMode`: `'auto'` or boolean indicating whether x-axis is volume/SEC-calibrated
- `secAuto`: Boolean auto-detected SEC classification
- `crop`: Retention window cropping mode (`'auto'`, `'peaks'`, etc.)
- `isStd`: Boolean indicating a calibration standard run (excluded from workflow)
- `inWf`: Boolean toggle including or excluding run from workflow figure
- `note`: Arrow note text string connecting to the next step
- `wfW`: Relative width weight in workflow row/grid layout (default `1`)
- `gelZ`: Relative gel image zoom scale in workflow (default `1`)
- `wfDx`, `wfDy`: Drag offset coordinates (SVG units) for manual panel repositioning
- `wfFrom`: Parent step ID for parallel workflow branches (points to an earlier step)
- `wfFromNote`: Note annotation on branch connector edge
- `xmin`, `xmax`, `ymin`, `ymax`: Plot axis limits
- `injX`: Retention time/volume offset for sample injection
- `injShift`: Manual x-axis shift offset
- `path`: UV cell path length in mm (default `2` or `10`)
- `mFlow`: Flow rate in mL/min
- `col`, `bufA`, `bufB`, `mGrad`, `mLoad`, `mCond`, `mTemp`: Manual run condition strings (column model, buffers, load volume, etc.)
- `mGradPh`, `mFlowPh`, `mIntegPh`, `mVol`: Step timeline phase properties
- `blobId`: Internal Cloud/IndexedDB asset reference ID for heavy curve data

### `gel` (SDS-PAGE Image & Densitometry)
- `id`: Unique integer or string ID
- `name`: Gel title string
- `src`: HTML Canvas or Image element containing raw gel image
- `crop`: Crop bounding box `{ l: float, r: float, t: float, b: float, ang: float }`
- `lanes`: Array of lane x-coordinate ratios across crop width
- `marks`: Array of detected/manual band mark objects per lane `[[{ y: float, mw: float, int: float }]]`
- `tags`: Array of band identity tags `[{ lane: int, mark: int, tag: "target"|"contam", label: string }]`
- `assign`: Map of lane index to assigned run ID or step ID
- `ladder`: Ladder preset key string (e.g. `"biorad"`, `"prplus"`)
- `ladderMsg`: Status/error string from ladder auto-calibration
- `marksManual`: Boolean indicating whether band marks were manually edited
- `_img`: Cached base64 data URL string for export/saving
- `imageId`: Asset reference ID for storage

### `prep`, `prep.btw`, `prep.manual`, and `opt`
- `prep`: Global purification pipeline object:
  - `on`: Boolean workflow mode switch
  - `construct`, `expr`, `lysis`: Booleans enabling upstream panel steps
  - `name`, `backbone`, `promoter`, `resist`: Plasmid and genetic construct parameters
  - `parentConstructId`: ID of parent construct for lineage tracking (nullable string)
  - `derivedConstructIds`: Array of derived construct IDs for branching cloning conditions
  - `constructs`: Array of construct records scaffolded for cloning lineage (`CONSTRUCT_SCHEMA`)
  - `primers`: Array of primer records scaffolded for cloning design (`PRIMER_SCHEMA`)
  - `strain`, `medium`, `cultureL`, `od`, `inducer`, `temp`, `time`, `pellet`, `indKind`: Expression host and induction conditions
  - `exStarter`, `exHarvest`, `exStore`: Extended culture and harvest notes
  - `lysMethod`, `lysBuffer`, `clarify`, `lysVol`, `lysAdd`, `lysSet`, `lysLanes`: Lysis and clarification conditions
  - `cleave`, `cleaveAfter`, `protease`, `ratio`, `clvTemp`, `clvTime`, `dialBuffer`, `mwco`, `dialVol`, `dialChanges`: Tag cleavage and dialysis parameters
  - `finConc`, `finVol`, `finRatio`, `finBuffer`, `store`: Final purified protein sample properties
  - `qcPurity`, `qcMass`, `qcActivity`: Final QC characterization notes (purity, intact mass, assay activity)
  - `gb`: Parsed GenBank cassette sequence metadata `{ feats: [...], seq: "..." }`
  - `btw`: Object mapping run IDs to inter-step transfer parameters (`prep.btw[runId]`)
  - `manual`: Array of manual/non-chromatographic purification step objects (`prep.manual`)
  - `titles`: Map of custom titles for upstream panels (`prep.titles[stepId]`)
  - `skip`: Map of skipped upstream sub-steps (`prep.skip[key]`)
  - `stepMeta`: Custom notes and metadata per step
  - `wfOff`: Map of manual drag offsets for upstream panels `{ [stepKey]: { dx, dy } }`
- `prep.btw[runId]`: Inter-step pool transfer object:
  - `how`: Transfer method (`"conc"`, `"pool"`, `"direct"`, `"dil"`, `"exch"`, `"filt"`, `"hold"`)
  - `vol`: Initial pool volume in mL
  - `vOut`: Concentrated or adjusted volume in mL
  - `conc`: Protein concentration in mg/mL
  - `mg`: Calculated total protein mass in mg
  - `yield`: Step recovery yield %
  - `note`: Free-text note string
  - `arrow`: Arrow note string for workflow figure
  - `title`: Panel title override
  - `device`: Ultrafiltration concentrator device model/filter
  - `mwco`: Molecular weight cut-off in kDa
  - `wfW`: Relative panel width weight in workflow
  - `wfDx`, `wfDy`: Drag offset coordinates (SVG units)
  - `wfFrom`, `wfFromNote`: Branch source step ID and branch edge annotation
- `prep.manual` (`man` step): Manual purification step without chromatogram (gravity column, batch binding, precipitation, dialysis, concentration):
  - `id`: Unique manual step ID string (e.g. `'m1'`)
  - `name`: Step title string
  - `kind`: Step category (`'column'`, `'batch'`, `'precip'`, `'dialysis'`, `'conc'`, `'other'`)
  - `arrow`: Arrow annotation text
  - `wfW`: Relative width weight (default `1`)
  - `gelZ`: Relative gel zoom scale (default `1`)
  - `wfDx`, `wfDy`: Drag offset coordinates
  - `wfFrom`, `wfFromNote`: Branch source step ID and branch edge annotation
  - `conc`, `vol`: Measured concentration (mg/mL) and volume (mL)
  - `resin`, `buffer`, `wash`, `elution`: Protocol buffer and resin conditions
- `opt`: Global user configuration object (initialized from `DEF`, saved in `localStorage['hplc-fig-opt']`):
  - Figure dimensions (`w`, `h`, `dpi`, `preset`), font (`font`, `fs`), palette (`palette`)
  - Integration preferences (`intMethod`, `intBase`, `intProm`, `path`, `eps`)
  - Gel display settings (`gelPos`, `gelAlign`, `gelScale`, `gelHAdj`, `laneMark`, `gelView`)
  - Publication defaults and custom standard calibrations (`secCals`, `known`)
  - Workflow figure layout: `wfLayout` (`'row'`, `'grid'`, `'stack'`), `wfW`, `wfH`, `wfGelH`, `wfLetters`, `wfGels`, `wfArrows`, `gelFrame`
  - Workflow chromatogram display: `wfFull` (draw full chromatogram over whole run instead of cropped window)
  - Final yield line: `wfYield` (display final purified yield line below workflow figure)
  - Zoom inset: `zoomInset` (enable magnified sub-window plot), `zoomInsetPos` (`'tr'`, `'tl'`, `'br'`, `'beside'`), `zoomInsetSize` (fraction of plot size)
- `ndSamples`: Array of NanoDrop spectrum/concentration readings:
  - `[{ id, name, conc, a280, a260, r280_260, runId, pool, spec: { wl: [...], abs: [...] }, specId }]`

### `prep.cloning` (Cloning workflow engine, section `cloning workflow: stages, attempts and lineage`)
- `type`: `''` (not specified, every project saved before #1402), `'cloning'` or `'expression'`
- `tpl`: key of `CL_TPL` (`ath`, `hifi`, `pcr`, `custom`) or `''`
- `stages`: ordered array of `{id: 's3', kind, name, skip, at: [...]}`, where `kind` is a key of `CL_KIND`
- `stages[].at`: attempts, `{id: 'a4', st, from, f: {...}, ck: {...}}`. `st` is a key of `CL_ST`, `from` is the id of the attempt it comes from, `f` holds the typed field values (plus `_d` date, `_op` operator, `_dev` deviations, `_n` notes) and `ck` the ticked checklist items
- `ext`: `{src, ver, note}`, where the plasmid came from when cloning was not recorded here
- **To add a stage or a field, edit data only.** `CL_KIND[kind]` holds `t` (title), `from` (stage kinds an attempt may come from), `fromMsg` and `need` (what a completed attempt must have), `ck` (checklist), `ref` (reference lines), `f` (fields as `key:Label:type:extra`) and `rule` (returns a flag text or `''`). `CL_TPL[key].s` lists a template's stage kinds, optionally as `[kind, 'Name']`. The engine (`clPanelHtml`, `clSteps`, `clFlags`, `clLineage`, `canonCloning`) needs no change for that.
- Step keys are `clone:setup` and `clone:<stage id>`. The panel is `#clonePanel`, shown on cloning steps and, for the plasmid-source record, on the Transformation step.

### `construct` and `primer` (Cloning Lineage & Design Schemas)
- `CONSTRUCT_SCHEMA` / `makeConstruct(props)`:
  - `id`: Unique construct string ID (e.g. `'c1'`)
  - `name`: Construct name string (e.g. `"pET28-SUMO-NADK"`)
  - `target`: Target protein or project name
  - `insertName`: Gene or insert identifier
  - `sourceOrganism`: Source organism string
  - `templateType`: Template type (`'genomic'`, `'cDNA'`, `'plasmid'`, `'synthetic'`)
  - `templateId`: Template identifier / accession
  - `insertSeq`: Insert sequence string
  - `vectorName`, `backbone`: Vector model and backbone string
  - `vectorSeq`: Vector nucleotide sequence
  - `promoter`: Promoter string (`'T7'`, `'tac'`, etc.)
  - `tag`, `cleavageSite`, `fusionPartner`: Affinity tag, protease site, fusion partner
  - `resist`, `ori`: Selection marker and replication origin
  - `method`: Cloning methodology (`'restriction'`, `'gibson'`, `'golden_gate'`, `'custom'`, etc.)
  - `expectedLength`, `orientation`, `readingFrame`: Structural design metrics
  - `notes`: Design notes string
  - `parentConstructId`: ID of parent construct for lineage tracking (nullable string)
  - `derivedConstructIds`: Array of derived construct IDs for branching conditions
  - `primers`: Array of primer IDs used in construct assembly
  - `clones`, `selectedCloneId`: Colony clone records and selected clone ID for expression handoff
- `PRIMER_SCHEMA` / `makePrimer(props)`:
  - `id`: Unique primer string ID (e.g. `'pr1'`)
  - `name`: Primer designation string
  - `orientation`: Forward or reverse orientation (`'fwd'`, `'rev'`)
  - `seq`: Full nucleotide sequence string (5' to 3')
  - `bindingSeq`: Template-hybridizing nucleotide sequence
  - `addedSeq5`: Added 5' sequence (restriction site, homology overlap, etc.)
  - `feature`: Annotation for restriction site, overlap, or mutation
  - `tm`: Calculated melting temperature (°C)
  - `gc`: GC content percentage
  - `expectedAmplicon`: Expected amplicon length (bp)
  - `constructId`: Intended target construct ID
  - `vendor`, `grade`, `stockConc`, `workingConc`, `notes`: Synthesis metadata and stock parameters

### Project JSON Format
Saved `.json` files or IndexedDB records:
```json
{
  "app": "HPLC Figure Bench",
  "version": 1,
  "saved": "2026-11-01T00:00:00.000Z",
  "cur": "workflow",
  "opt": { ... },
  "prep": { ... },
  "runs": [ { "id": "r1", "name": "...", "uvs": [...], "blobId": "..." } ],
  "traces": [ ... ],
  "gels": [ { "id": 1, "name": "...", "image": "data:image/png;base64,...", "crop": { ... }, "marks": [ ... ] } ],
  "struct": null,
  "nanodrop": [ { "id": 1, "name": "...", "conc": 1.25, "spec": { ... } } ]
}
```

---

## Key Functions

| Function | Line | Purpose | Reads | Called By |
|---|---|---|---|---|
| `parseText` | Line 1842 | Parses raw ASCII/CSV/TSV chromatogram data lines into numeric series | Raw text string | `loadFiles`, `addParsed` |
| `parseGenBank` | Line 5027 | Parses GenBank text to extract CDS features, tags, and amino acid sequences | GenBank file text | `loadGenBank` |
| `loadGenBankText` | Line 7127 | Validates and processes GenBank text from file import or paste box (`#gbPaste`) | GenBank text string | `loadGenBank`, `#gbPasteGo` listener |
| `parseStructure` | Line 7030 | Parses PDB or mmCIF structure file into protein entities and chain metadata | PDB/CIF file text | `loadStructFile` |
| `parseNanoDrop` | Line 7365 | Parses NanoDrop exported spectra CSV/TSV or concentration summary tables | File text string | `loadFiles` |
| `looksNanoDrop` | Line 7341 | Checks if text file content matches NanoDrop export header signatures | File text string | `loadFiles` |
| `fracSegments` | Line 2190 | Splits fraction boundaries into continuous baseline time/volume segments | `run` object | `buildRunPlainSVG`, `laneTarget` |
| `procFull` | Line 2570 | Processes raw run UV data, subtracts baseline, and computes peak integration | `run` object | `autoIntegrate`, `renderIntTable`, `buildRunPlainSVG` |
| `runAuto` | Line 2212 | Auto-detects run type, units, fraction tables, and chromatography conditions | `run` object | `addParsed`, `loadFiles`, `buildRunPlainSVG` |
| `runCondLines` | Line 5446 | Formats run conditions (column, buffer, flow, gradient) into formatted text lines | `run` object | `methodsText` |
| `guessColumn` | Line 5375 | Heuristically identifies column model and dimensions from run title or labels | `run` object / string | `runCondLines` |
| `guessGradient` | Line 5391 | Parses gradient step changes (%B, CV, or flow rate) from run data | `run` object | `runCondLines` |
| `poolRows` | Line 2607 | Computes pooled fraction volumes, $A_{280}$, and total protein amounts | `run` object | `sumRows`, `methodsText`, `ncLines` |
| `poolMeas` | Line 2591 | Calculates peak area, height, and concentration for a pooled fraction region | `run` object, pool region | `poolRows`, `methodsText`, `ncLines` |
| `massOf` | Line 2459 | Calculates protein mass (mg) from integrated peak area or $A_{280}$ absorbance | Area, $A_{280}$, $\varepsilon$, MW | `poolMeas`, `sumRows` |
| `integRows` | Line 2578 | Builds peak integration table rows for UI display | `run` object | `renderIntTable` |
| `autoIntegrate` | Line 2623 | Automatically detects and integrates UV baseline peaks above prominence threshold | `run` object | `addParsed`, `procFull` |
| `integrateRegion` | Line 2326 | Numerically integrates peak area between retention bounds $a$ and $b$ | $x$-array, $y$-array, $a$, $b$, baseline mode | `procFull`, `autoIntegrate` |
| `secCalFor` | Line 2393 | Retrieves active SEC standard calibration curve for a run | `run` object | `buildRunPlainSVG`, `activeCal` |
| `activeCal` | Line 7578 | Gets currently active SEC calibration curve for the SEC panel | `opt`, `runs` | `renderSec` |
| `zoomWindow` | Line 2864 | Computes the zoomed-in sub-window retention boundaries ($a$, $b$) | `lo`, `hi`, user bounds | `zoomCompose`, `buildRunFig` |
| `zoomCompose` | Line 2949 | Assembles composite SVG with the main plot and magnified inset plot | Main SVG, inset builder, window | `buildRunFig`, `buildOverlaySVG` |
| `buildRunFig` | Line 4762 | Generates full SVG for single chromatogram run, supporting zoom inset | `run` object | `buildWorkflow`, `buildFig` |
| `buildRunPlainSVG` | Line 3245 | Core SVG generator for chromatogram curves, axes, fractions, and full run mode (`wfFull`) | `run` object, options | `buildRunFig`, `composeRuns` |
| `autoCrop` | Line 3679 | Auto-detects SDS-PAGE gel lane boundaries, vertical bounds, and crop box | `gel` object | `processGel`, `addGelFiles` |
| `detectBands` | Line 3869 | Finds band peaks in a gel lane intensity profile curve | `gel`, lane index, sensitivity | `gelBands`, `processGel` |
| `ladderResid` | Line 3956 | Calculates ladder fit residual error for gel $R_f$ calibration | `gel` object | `autoLadder`, `calib` |
| `autoLadder` | Line 4211 | Matches gel ladder lane bands against reference ladder size standard values | `gel` object | `processGel`, `renderLaneTable` |
| `calib` | Line 3972 | Calibrates molecular weight $\log(M_w)$ vs $R_f$ migration curve for gel | `gel` object | `gelBands`, `lanePurity` |
| `gelBands` | Line 3988 | Returns list of detected gel bands with assigned MW and integrated intensity | `gel` object | `renderBandTable`, `composeRuns` |
| `lanePurity` | Line 4163 | Calculates relative densitometric purity percentage of target gel lane bands | `gel`, lane index | `renderBandTable`, `sumRows` |
| `bandSnap` | Line 4011 | Saves state snapshot of gel tags/marks for undo history | `gel` object | UI event listeners |
| `bandUndo` | Line 4012 | Restores previous gel marks/tags state from undo stack | `gel` object | UI event listener |
| `autoContrast` | Line 4245 | Auto-adjusts display contrast/brightness levels for gel image view | `gel` object | `processGel`, UI event listener |
| `wfFromOf` | Line 4929 | Resolves parent step ID for parallel workflow branches | `run` or step object | `wfParents`, `wfBranches` |
| `wfFromNoteOf` | Line 4930 | Resolves branch edge note annotation text | `run` or step object | `composeRuns` |
| `wfParents` | Line 4932 | Maps each step index to its parent step index in branching workflow | Step list | `composeRuns`, `wfBranches`, `wfFigList` |
| `wfBranches` | Line 4934 | Computes all linear paths from start to terminal leaves for parallel branches | Step list | `finalYields`, `composeRuns` |
| `wfFigList` | Line 4946 | Reorders workflow panels so parallel branches stay grouped contiguously | Step list | `composeRuns`, `renderWfTool` |
| `wfItem` | Line 6215 | Resolves panel metadata (run, nc, man, prep) for workflow click-to-edit | Step ID | `renderWfTool`, `wfSet` |
| `wfSet` | Line 6220 | Updates panel properties (title, arrow note, width, gel zoom, drag offsets `wfDx`/`wfDy`) | Panel item, field, value | `#wfTool` listeners |
| `renderWfTool` | Line 6227 | Positions and renders floating panel editor toolbar (`#wfTool`) and selection box (`#wfSelBox`) | Active selection `wfSel` | Click handlers, `render` |
| `constructModel` | Line 5164 | Generates translated protein sequence model from genetic construct cassette | `prep.gb`, `opt.protSeq` | `seqMass`, `buildPrepSVG`, `yieldLine` |
| `stepList` | Line 10835 | Builds ordered list of purification steps across workflow pipeline | `runs`, `gels`, `prep` | `renderSteps`, `stepStatus`, `renderNext` |
| `applyQuick` | Line 11046 | Applies lab protocol template (`LABQ`) to populate workflow steps and conditions | Quick template ID | UI event listener |
| `manSentence` | Line 5362 | Formats written methods sentence for a manual workflow step | Step object | `methodsText` |
| `btwSentence` | Line 5355 | Formats written methods sentence for inter-step transfers | Transfer object | `methodsText` |
| `ndForm` | Line 7453 | Determines active protein form and extinction coefficient for NanoDrop sample | Run / sample object | `ndEpsFor`, `renderND` |
| `ndEpsFor` | Line 7454 | Calculates molar extinction coefficient $\varepsilon_{280}$ for a protein form | Run ID / protein form | `ndConc`, `renderND` |
| `cleanSeq` | Line 6962 | Cleans amino acid sequence string (removes whitespace and digits) | Sequence string | `seqMass`, `seqA280`, `seqPI` |
| `seqMass` | Line 6963 | Calculates molecular weight (Da) from amino acid sequence | Sequence string | `constructModel`, `protForms` |
| `seqA280` | Line 6967 | Calculates extinction coefficient $\varepsilon_{280}$ ($\text{M}^{-1}\text{cm}^{-1}$) from sequence | Sequence string | `constructModel`, `protForms` |
| `seqPI` | Line 6970 | Estimates theoretical isoelectric point (pI) from protein sequence | Sequence string | `renderProt` |
| `ndStats` | Line 7478 | Calculates mean, SD, and CV% for NanoDrop sample replicate measurements | Samples array | `renderND` |
| `sumRows` | Line 6451 | Generates purification summary table rows across all workflow steps | `runs`, `gels`, `prep`, `opt` | `renderSumTable`, `finalYield`, `methodsText` |
| `finalYield` | Line 4768 | Calculates final recovery amount (mg, mg/L, mg/g cells) for a workflow branch | Workflow branch path | `finalYields`, `methodsText` |
| `finalYields` | Line 4785 | Computes per-branch final yields across all parallel workflow branches | `wfBranches()` | `yieldLine`, `methodsText` |
| `yieldLine` | Line 4791 | Renders final yield text annotation line beneath the workflow figure SVG | Rendered SVG result | `buildWorkflow` |
| `methodsText` | Line 5461 | Generates full written Materials and Methods and Results text paragraphs | `runs`, `gels`, `prep`, `opt` | UI event listener |
| `renderSumTable` | Line 6527 | Renders purification yield and recovery summary HTML table | `sumRows()` | `render` |
| `renderBandTable` | Line 6072 | Renders gel densitometry and band purity HTML table | `gel`, `gelBands()` | `render` |
| `renderIntTable` | Line 6579 | Renders peak integration details HTML table | `run`, `integRows()` | `render` |
| `moreSync` | Line 7702 | Expands More options disclosures when any enclosed setting differs from default | `opt`, `DEF` | `syncControls`, `openProject` |
| `grpStatus` | Line 7731 | Updates one-line status summary labels on closed panel section headers | `opt` object | `render`, `syncControls` |
| `projectData` | Line 7788 | Packs current workspace state into exportable project JSON structure | `runs`, `gels`, `prep`, `opt` | `openProject`, `projSave` listener |
| `openProject` | Line 7834 | Loads project JSON object into current workspace state | Project data JSON | `projFile` listener, `importAsProject` |
| `importAsProject` | Line 7872 | Opens saved project file as a new isolated project in workspace | Project data JSON | `projFile` listener |
| `storeInit` | Line 7893 | Initializes IndexedDB (`hfb-projects`) or Cloud storage backends | Window environment | `storeLoad`, `saveOne`, `storeDelete`, `renderHome` |
| `packCloud` | Line 7949 | Packs project state and uploads heavy asset blobs to cloud storage | Workspace snapshot | `packFor`, `saveOne` |
| `unpackCloud` | Line 8075 | Downloads cloud asset blobs and restores full project state | Cloud project state | `storeLoad` |
| `saveOne` | Line 8152 | Saves project state to IndexedDB or Cloud database store | Project ID, snapshot | `flushSave` |
| `storeLoad` | Line 8178 | Loads project state from IndexedDB or Cloud database store | Project ID | `openStoredProject` |
| `storeDelete` | Line 8188 | Deletes project record from IndexedDB or Cloud database store | Project ID | UI event listener |
| `render` | Line 5647 | Master UI render routine updating figures and active panels | Global app state | Event listeners, `openProject` |
| `buildWorkflow` | Line 4808 | Generates multi-panel composite figure SVG (runs + gel lanes + yield line) | `runs`, `gels`, `prep` | `buildFig`, `render` |
| `buildStepFig` | Line 11184 | Generates step timeline diagram SVG | `stepList()` | `renderSteps` |
| `buildConcFig` | Line 7541 | Generates NanoDrop $A_{280}$ concentration bar chart SVG | `ndSamples` | `buildNDSVG` |
| `buildNDSVG` | Line 7544 | Generates full NanoDrop panel SVG (spectra or bar chart) | `ndSamples` | `renderND` |
| `buildPrepSVG` | Line 5215 | Generates construct / expression / lysis panel SVG diagram | `prep` state | `renderPrep` |
| `buildStructSVG` | Line 7224 | Generates PDB protein structure domain diagram SVG | `struct` state | `renderProt` |
| `renderList` | Line 5762 | Renders sidebar list of loaded runs, gels, and traces | `runs`, `gels`, `traces` | `render` |
| `syncControls` | Line 5971 | Synchronizes HTML input controls with `opt` settings state | `opt` object | `render`, `openProject` |
| `renderHome` | Line 8224 | Renders home screen project workspace cards list | `storeList()` | `showHome` |
| `renderSteps` | Line 10906 | Renders step timeline HTML controls and SVG diagram | `stepList()` | `render` |
| `renderStepSheet` | Line 10916 | Renders step detail editor sheet in UI | Selected step | `selectStep`, `render` |
| `renderND` | Line 7493 | Renders NanoDrop data table, stats, and spectrum SVG | `ndSamples` | `render` |
| `renderSec` | Line 7585 | Renders SEC calibration standards panel and curve SVG | `secCals`, `runs` | `render` |
| `renderPrep` | Line 7145 | Renders construct / expression panel HTML controls and SVG | `prep` state | `render` |
| `renderNext` | Line 7780 | Renders next suggested action banner above figure | `nextStep()` | `render` |
| `downloads` | Line 11205 | Triggers browser file download of SVG, PNG, or JSON | Content blob, filename | Export event listeners |
| `toPng` | Line 11245 | Renders SVG string onto HTML canvas and exports High-DPI PNG | SVG string, DPI/scale | Export event listeners |
| `zip` | Line 11264 | Creates ZIP archive containing exported figure files | Files map | Export event listeners |
| `saveFile` | Line 11208 | Triggers browser file download for text or binary content | Filename, content | `projSave`, export listeners |

---

## Where to Change X

| Task | Functions / Objects to Edit | Location / Notes |
|---|---|---|
| **Add a new import format** | `loadFiles` (Line 6820), `addParsed` (Line 6922), Section `parsing` | Add parsing logic in `parsing: generic` or `parsing: ÄKTA` section |
| **Add a new figure option** | `DEF` (Line 1626), `syncControls` (Line 5971), `onOpt` (Line 6015), `buildRunPlainSVG` / `buildWorkflow` | Register default in `DEF`, bind UI control in `syncControls`, apply in SVG build functions |
| **Modify zoom inset behavior** | `zoomWindow` (Line 2864), `zoomCompose` (Line 2949), `buildRunFig` (Line 4762) | Adjust magnification, inset placement (`tr`, `tl`, `br`, `beside`), or connector line drawing in `figure: zoom inset` |
| **Adjust workflow full chromatograms** | `buildRunPlainSVG` (Line 3245), `opt.wfFull` | Edit x-axis windowing condition (`opt.wfFull && ov.nest`) under `figure: ÄKTA run chart` |
| **Modify workflow panel dragging** | `wfItem` (Line 6215), `wfSet` (Line 6220), `renderWfTool` (Line 6227), `#wfTool`, `#wfSelBox` | Adjust floating toolbar, drag delta calculations, or offset reset logic under `editing the workflow figure in place` |
| **Modify parallel workflow branching** | `wfFromOf` (Line 4929), `wfParents` (Line 4932), `wfBranches` (Line 4934), `composeRuns` (Line 4526) | Adjust branch topology, connector arrows, or branch grouping under `composite: run with gels, and the workflow` |
| **Update GenBank parsing or text pasting** | `parseGenBank` (Line 5027), `loadGenBankText` (Line 7127), `#gbPaste` | Edit feature/CDS extraction or paste box handling in `upstream steps` and `construct and expression panel` |
| **Modify side panel or More options** | `ADV` (Line 7686), `moreSync` (Line 7702), `grpStatus` (Line 7731), `#panelSearch` (Line 7705) | Edit progressive disclosure IDs in `ADV` or search behavior in `More options inside each section` |
| **Modify yield reporting & calculation** | `finalYield` (Line 4768), `finalYields` (Line 4785), `yieldLine` (Line 4791), `methodsText` (Line 5461) | Adjust recovery calculation, per-culture/per-gram cell basis, or yield line rendering under `composite` and `run conditions` |
| **Add a new column in summary table** | `sumRows` (Line 6451), `renderSumTable` (Line 6527) | Add field calculation in `sumRows` and HTML table header/cell in `renderSumTable` |
| **Add a new methods sentence** | `methodsText` (Line 5461), `runCondLines` (Line 5446), `manSentence` (Line 5362), `btwSentence` (Line 5355) | Edit sentence builders under `run conditions` section |
| **Add a new gel ladder preset** | `LADDERS` (Line 1676), `#g-preset` dropdown (Line 1683) | Add ladder entry with reference band sizes to `LADDERS` constant |
| **Add a new host contaminant protein** | `KNOWN_DEFAULT` (Line 1644) | Add protein entry `{ name, kda, kind: 'contam', ctx, src }` to `KNOWN_DEFAULT` array |
| **Modify peak integration math** | `integrateRegion` (Line 2326), `procFull` (Line 2570), `autoIntegrate` (Line 2623) | Edit baseline fitting or numerical integration algorithms under `peak integration` |
| **Modify SEC calibration fit** | `secCalFor` (Line 2393), `renderSec` (Line 7585), `onSec` (Line 7640) | Edit linear/polynomial calibration regression fitting in `size exclusion (SEC)` section |
| **Modify gel band auto-detection** | `detectBands` (Line 3869), `autoCrop` (Line 3679), `autoLadder` (Line 4211) | Adjust sensitivity thresholds or peak picking in `gel densitometry` section |
| **Modify lane purity calculation** | `lanePurity` (Line 4163), `renderBandTable` (Line 6072) | Adjust band background subtraction or total intensity normalization in `band tags and purity` |
| **Add a new NanoDrop file format** | `parseNanoDrop` (Line 7365), `looksNanoDrop` (Line 7341), `addNanoDrop` (Line 7424) | Add header recognition and row parsing under `NanoDrop: protein A280 readings` |
| **Modify step timeline / templates** | `LABQ` (Line 10973), `applyQuick` (Line 11046), `stepList` (Line 10835) | Edit protocol step templates in `quick fill` section |
| **Add field to project export JSON** | `projectData` (Line 7788), `openProject` (Line 7834), `packCloud` (Line 7949), `unpackCloud` (Line 8075) | Update export serializer and import deserializer under `projects` |
| **Modify figure SVG export (PNG/ZIP)** | `toPng` (Line 11245), `zip` (Line 11264), `downloads` (Line 11205), `saveFile` (Line 11208) | Update canvas rendering, resolution scaling, or archive creation in `export` section |
| **Modify construct / expression SVG** | `buildPrepSVG` (Line 5215), `constructSVG` (Line 5266), `ncSVG` (Line 5239) | Edit vector layout in `construct and expression panel` section |
| **Modify IndexedDB / Cloud storage** | `storeInit` (Line 7893), `saveOne` (Line 8152), `storeLoad` (Line 8178), `storeDelete` (Line 8188) | Edit storage drivers under `projects: browser & cloud storage` section |
| **Modify home screen project list** | `renderHome` (Line 8224), `openStoredProject` (Line 8265) | Edit workspace card rendering under `home` section |
| **Modify "What to do next" guidance** | `renderNext` (Line 7780), `nextStep` (Line 7750) | Edit step recommendation rules under `what to do next` section |
| **Modify figure preset dimensions** | `PRESETS` (Line 1669) | Update width, height, font size, line weight in `PRESETS` constant |
| **Add a new UI panel or tab** | `render` (Line 5647), `syncControls` (Line 5971), Section `collapsible panel sections` | Add HTML panel markup and bind rendering update in `UI` section |
