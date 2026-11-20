"""Pre-flight capability digest and persistent Positive + Negative Board Ledger for both boards:
the Polishing Board (#222) and the Creative Direction Board.

Stops duplicate/redundant proposals BEFORE ideation or worker dispatch by:
1. Extracting a live Capability Digest directly from protein-purification-bench.html + docs/CODEMAP.md so advisers see
   what `main` already supports (constants, palettes, warnings, parsers, data structures).
2. Merging committed `docs/BOARD_LEDGER.json` with runtime `~/.ppb-board-ledger.json` (or legacy `~/.hfb-board-ledger.json`, keeping the git checkout clean
   during background manager runs while remembering rejected-on-main ideas and owner-declined pitches forever).
"""
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO_LEDGER = ROOT / 'docs' / 'BOARD_LEDGER.json'
_LEDGER_NEW, _LEDGER_OLD = Path.home() / '.ppb-board-ledger.json', Path.home() / '.hfb-board-ledger.json'
LOCAL_LEDGER = _LEDGER_NEW if _LEDGER_NEW.exists() or not _LEDGER_OLD.exists() else _LEDGER_OLD


def _read_entries(path):
    try:
        if path and Path(path).exists():
            data = json.loads(Path(path).read_text(encoding='utf-8'))
            rows = data.get('entries', data) if isinstance(data, dict) else data
            return [r for r in rows if isinstance(r, dict) and r.get('title')]
    except Exception:
        pass
    return []


def load_ledger(repo_path=None, local_path=None):
    """Merged list of ledger dicts (repo seed + local runtime additions), deduplicated by normalized title/key."""
    repo_path = REPO_LEDGER if repo_path is None else repo_path
    local_path = LOCAL_LEDGER if local_path is None else local_path
    seen, out = set(), []
    for r in _read_entries(repo_path) + _read_entries(local_path):
        sig = (str(r.get('key', '')).strip().lower(), re.sub(r'\W+', ' ', str(r.get('title', '')).lower()).strip()[:80])
        if sig[1] and sig[1] not in seen:
            seen.add(sig[1])
            out.append(r)
    return out


def record_ledger(title, kind, why='', key='', where=(), local_path=None, max_entries=400):
    """Append a rejected-on-main, owner-declined, or pitched item to the PC's runtime ledger (never dirties git)."""
    local_path = LOCAL_LEDGER if local_path is None else local_path
    t = re.sub(r'\s+', ' ', str(title or '')).strip()[:160]
    if not t or not local_path:
        return
    norm = re.sub(r'\W+', ' ', t.lower()).strip()[:80]
    rows = [r for r in _read_entries(local_path) if re.sub(r'\W+', ' ', str(r.get('title', '')).lower()).strip()[:80] != norm]
    rows.append({
        'key': str(key or f'{kind}:{int(time.time())}')[:40],
        'title': t,
        'kind': str(kind or 'rejected_board')[:30],
        'why': re.sub(r'\s+', ' ', str(why or '')).strip()[:240],
        'where': [str(w)[:80] for w in (where or ())][:5],
        'at': int(time.time()),
    })
    try:
        Path(local_path).write_text(json.dumps({'entries': rows[-max_entries:]}, indent=2) + '\n', encoding='utf-8')
    except Exception:
        pass


def ledger_for_mem(entries=None):
    """[(key, title, why)] rows ready for `mem['ledger']` in dupcheck.dup_close()."""
    rows = load_ledger() if entries is None else entries
    return [(str(r.get('key') or r.get('kind') or 'ledger'), str(r['title']), str(r.get('why') or r.get('kind') or 'recorded')) for r in rows if r.get('title')]


def ledger_prompt_block(entries=None, focus_secs=(), cap=2200):
    """Compact negative/positive memory block filtered first to `focus_secs`, injected BEFORE advisers brainstorm."""
    rows = load_ledger() if entries is None else entries
    if not rows:
        return ''
    fset = {str(s).strip().lower() for s in (focus_secs or ()) if str(s).strip()}
    prioritized = sorted(
        rows,
        key=lambda r: (
            0 if fset and ({str(w).lower() for w in (r.get('where') or [])} & fset) else 1,
            0 if r.get('kind') in ('owner_declined', 'already_on_main') else 1,
            -(r.get('at') or 0),
        ),
    )
    lines, used = ['Permanent Board Ledger (already on `main` or explicitly declined — NEVER re-propose these):'], 0
    for r in prioritized:
        tag = 'DECLINED BY PATRICK' if r.get('kind') == 'owner_declined' else 'ALREADY ON MAIN' if r.get('kind') in ('already_on_main', 'merged') else str(r.get('kind', 'done')).upper()
        why = f' — {r["why"]}' if r.get('why') else ''
        ln = f'- [{tag}] {r["title"]}{why}'[:260]
        if used + len(ln) > cap:
            break
        lines.append(ln)
        used += len(ln) + 1
    return '\n'.join(lines) if len(lines) > 1 else ''


def capability_digest(app_text, codemap_text='', include_data_model=False, cap=2800):
    """Live machine-extracted summary of capabilities and data models already in `protein-purification-bench.html`."""
    out = ['Capabilities already built in `main` (verified from source; build BEYOND these rather than reinventing them):']
    if app_text:
        m_def = re.search(r'\bconst\s+DEF\s*=\s*\{([^}]{20,2500})\}', app_text, re.S)
        if m_def:
            keys = list(dict.fromkeys(re.findall(r'(?:^|[,{\s])([A-Za-z_]\w*)\s*:', m_def.group(1))))[:38]
            if keys:
                out.append('- Settings keys already in `DEF`/`opt`: ' + ', '.join(f'`{k}`' for k in keys))
        checks = [
            ('Okabe-Ito colorblind-safe `PAL` palette & `PRESETS` journal column widths', r'\bconst\s+PAL\b'),
            ('Dark/light CSS variables under `:root[data-theme]`', r'data-theme'),
            ('UNICORN 7 `.zip` archive (nested/Float32 XMLs), ÄKTA CSV, quoted/decimal-comma CSV & `.asc` parsers', r'UNICORN 7'),
            ('Baseline integration mode selector (`zero` / linear) & pooled-NanoDrop peak mass rescaling disclosure', r'intBase'),
            ('SEC column standards (`SEC_COLUMNS`), `Kav` / `[V0, Vt]` range warnings, flow-rate check & fit `R²`', r'SEC_COLUMNS'),
            ('SDS-PAGE auto-crop, height-proportional morphological background, 16-bit ADC saturation flags, `apparent` MW & ladder `R²`', r'bandEnergy'),
            ('Agarose Gel Studio (DNA ladder log10 calibration, lane editing, contrast/invert, adjusted pixel export)', r'ag-lane-label|agarose'),
            ('Cloning workflow engine (`CL_KIND`, `CL_TPL`, attempts, lineage, `Include Cloning` archival/restore)', r'\bCL_KIND\b'),
            ('GenBank multi-ORF detection, repressor CDS filtering, Strep/cleavable tags & Pace (1995) Cys redox disclosure', r'gbPaste|parseGenBank|GenBank'),
            ('NanoDrop `µg/µL`, multi-block TSV, `A260/A280` nucleic-acid & `A340` turbidity warnings', r'ndSamples'),
            ('IndexedDB + JSON project persistence with `pagehide` autosave, `schemaVersion`, and toast Undo on delete', r'schemaVersion'),
        ]
        built = [desc for desc, pat in checks if re.search(pat, app_text)]
        if built:
            out.extend(f'- {b}' for b in built)
    if include_data_model and codemap_text and '## Data Structures' in codemap_text:
        ds = codemap_text.split('## Data Structures', 1)[1].split('\n## ', 1)[0].strip()
        compact = []
        for ln in ds.splitlines():
            s = ln.strip()
            if s.startswith('### ') or (s.startswith('- `') and ':' in s):
                compact.append(s[:160])
            if sum(len(x) for x in compact) > 1300:
                break
        if compact:
            out.append('\nIn-memory data model available to connect across features (`docs/CODEMAP.md`):')
            out.extend(compact)
    return '\n'.join(out)[:cap]
