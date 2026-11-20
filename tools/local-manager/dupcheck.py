"""The Direction board's duplicate prefilter (word overlap + canonical biochemical/UI concepts + code symbol targets).
Pure functions, no network, no config: tested by test_dup.py. manager.py imports words, dup_close, and within_round_dup."""
import re

STOP = set('a an the and or of to in on for with by from is are be it its this that as at into not no do does add make use show fix'.split())

# Canonical domain concepts: catches identical work phrased in different scientific or code words
# (e.g. "Flag Kav outside 0 to 1" == #1455 "Warn when SEC elution volume falls outside void-to-total range").
CONCEPT_GROUPS = {
    'concept_sec_kav_bounds': (r'\bkav\b', r'partition\s+coeff', r'void[- ]to[- ]total', r'void\s+volume', r'total\s+volume', r'\bv0\b.*\bvt\b'),
    'concept_colorblind_palette': (r'okabe', r'\bwong\b', r'color[- ]?blind', r'colour[- ]?blind', r'accessible\s+(?:color|colour|palette)'),
    'concept_r2_fit': (r'r[- ]?squared', r'\br2\b', r'r²', r'goodness[- ]of[- ]fit', r'coefficient\s+of\s+determination'),
    'concept_ug_ul_unit': (r'ug\s*/\s*ul', r'µg\s*/\s*µl', r'microgram[- ]per[- ]microlit'),
    'concept_nd_turbidity': (r'\ba340\b', r'turbidit', r'light[- ]scatter'),
    'concept_nd_ratio': (r'a?260\s*/\s*a?280', r'a?280\s*/\s*a?260', r'nucleic\s+acid\s+contamin'),
    'concept_gel_saturation': (r'saturat\w+\s+band', r'band\s+saturat', r'adc\s+clip', r'pixel\s+saturat', r'overexpos\w+\s+band'),
    'concept_gel_background': (r'smil\w+\s+(?:gel|lane)', r'morpholog\w+\s+(?:background|open)', r'rolling[- ]ball'),
    'concept_unload_save': (r'pagehide', r'beforeunload', r'unsaved\s+project'),
    'concept_schema_version': (r'schemaversion', r'schema\s+version', r'format\s+version\w*\s+json'),
    'concept_decimal_comma': (r'decimal\s+comma', r'european\s+decimal', r'semicolon[- ]delimited\s+csv'),
    'concept_multi_orf': (r'multiple\s+(?:orf|cds)', r'several\s+orfs', r'cds\s+feature\s+count'),
    'concept_cys_redox': (r'reduced[- ]cysteine', r'cystine', r'disulfide\s+assumption', r'epsmode'),
    'concept_baseline_mode': (r'baseline\s+integration\s+mode', r'overlapping\s+peaks?\s+baseline'),
    'concept_cloning_archive': (r'include\s+cloning', r'cloning\s+stage\s+archival', r'remove\s+cloning\s+from\s+this\s+workflow'),
}

DOMAIN_NOUNS = {'sec', 'gel', 'gels', 'sds', 'agarose', 'nanodrop', 'unicorn', 'akta', 'hplc', 'chromatogram',
                'cloning', 'construct', 'genbank', 'methods', 'palette', 'svg', 'zoom', 'inset', 'project', 'export'}


def words(t):
    return {w for w in re.findall(r'[a-z0-9]+', str(t).lower().replace('-', ' ')) if len(w) > 2 and w not in STOP}


def concepts(t):
    low = str(t or '').lower()
    return {cid for cid, pats in CONCEPT_GROUPS.items() if any(re.search(p, low) for p in pats)}


def code_targets(t):
    s = str(t or '')
    bt = {m.lower() for m in re.findall(r'`([A-Za-z_][A-Za-z0-9_]{3,})`', s)}
    ids = {'#' + m.lower() for m in re.findall(r'(?<![\w/&])#([A-Za-z][A-Za-z0-9_-]{3,})\b', s)
           if not re.match(r'^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$', m, re.I)}
    return bt | ids


def dup_close(p, mem):
    """Candidates worth a closer look: word overlap >= 0.45, shared canonical domain concepts, shared code targets,
    or any open issue the proposal cites as #N. Returns (close, best score)."""
    ptxt = p.get('title', '') + ' ' + p.get('change', '')
    pw, pcon, ptarg = words(ptxt), concepts(ptxt), code_targets(ptxt + ' ' + str(p.get('evidence', '')))
    if not pw:
        return [], 0
    titles = mem.get('titles', {})
    pool = ([(k, t) for k, t in mem.get('merged', [])]
            + [(k, t) for k, t in mem.get('open', [])]
            + [(k, f'{t} ({f})') for k, t, f in mem.get('ideas', []) if f != 'open']
            + [(k, f'{t} ({why})') for k, t, why in mem.get('ledger', [])])
    ov = lambda t: len(pw & words(t)) / max(1, min(len(pw), len(words(t))))
    scored = []
    for k, t in pool:
        raw_sc = max(ov(t), ov(titles[k])) if k in titles else ov(t)
        ct = (titles.get(k, '') + ' ' + t)
        ccon = concepts(ct) if pcon else set()
        ctarg = code_targets(ct) if ptarg else set()
        shared_dom = bool((pw & words(ct) & DOMAIN_NOUNS) or raw_sc >= 0.15)
        boost = 0.52 if (pcon & ccon and shared_dom) else (0.46 if (ptarg & ctarg and raw_sc >= 0.25) else 0.0)
        scored.append((max(raw_sc, boost), raw_sc, k, t))
    scored.sort(reverse=True)
    seen = set()
    close = []
    for sc, _, k, t in scored:
        if sc >= 0.45 and k not in seen:
            seen.add(k); close.append((k, t))
            if len(close) >= 6:
                break
    cited = {'#' + n for n in re.findall(r'#(\d+)', ' '.join(str(p.get(f, '')) for f in ('evidence', 'why')))}
    for sc, _, k, t in scored:
        if k in cited and k in titles and k not in seen:
            seen.add(k); close.append((k, t))
    return close, (scored[0][0] if scored else 0)


def within_round_dup(cand, existing_props):
    """Return matching proposal title if `cand` repeats an earlier proposal generated in the same board round, else None."""
    ct = cand.get('title', '') + ' ' + cand.get('change', '')
    cw, ccon = words(ct), concepts(ct)
    cwhere = {str(w).lower() for w in (cand.get('where') or [])}
    if not cw:
        return None
    for e in existing_props or []:
        et = e.get('title', '') + ' ' + e.get('change', '')
        ew, econ = words(et), concepts(et)
        ewhere = {str(w).lower() for w in (e.get('where') or [])}
        ov_title = len(words(cand.get('title', '')) & words(e.get('title', ''))) / max(1, min(len(words(cand.get('title', ''))), len(words(e.get('title', '')))))
        ov_all = len(cw & ew) / max(1, min(len(cw), len(ew)))
        if ov_title >= 0.55 or ov_all >= 0.50:
            return e.get('title', e.get('id', 'earlier proposal'))
        if (ccon & econ) and ((cwhere & ewhere) or (cw & ew & DOMAIN_NOUNS)):
            return e.get('title', e.get('id', 'earlier proposal'))
    return None
