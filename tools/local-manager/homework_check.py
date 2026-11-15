"""Check, on the PC, that the board's homework research can reach its sources.

Run from the repository folder:  python tools/local-manager/homework_check.py
It searches PubMed and Wikipedia with a sample question and asks Gemini with Google Search, using the same code and
settings file as the manager, and prints what each one returned. It never prints the Gemini key and posts nothing.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import boardmap as bm  # noqa: E402

Q = 'How do size exclusion chromatography columns get calibrated with protein standards to estimate molecular weight?'
conf = Path.home() / '.hfb-reviewer.json'
cfg = json.loads(conf.read_text(encoding='utf-8-sig')) if conf.exists() else {}
key = cfg.get('gemini_key') or os.environ.get('GEMINI_API_KEY', '')  # the same two places the manager looks

print('Question:', Q)
kw = bm.keywords(Q)
print('Keywords:', kw)

papers = bm.pubmed(kw)
print(f'\n1. PubMed: {len(papers)} papers' + ('  <- OK' if papers else '  <- nothing: PubMed may be blocked on this PC'))
for p in papers[:3]:
    print('   -', p['title'][:100], f'({p["year"]})')

wiki = bm.wikipedia(bm.keywords(Q, 4))
print(f'\n2. Wikipedia: {len(wiki)} articles' + ('  <- OK' if wiki else '  <- nothing: Wikipedia may be blocked on this PC'))
for w in wiki[:3]:
    print('   -', w['title'])

print('\n3. Gemini with Google Search:')
if not key:
    print('   no Gemini key: neither gemini_key in', conf, 'nor the GEMINI_API_KEY environment variable')
for model in ('gemini-flash-latest', 'gemini-flash-lite-latest'):
    if not key:
        break
    body = json.dumps({'contents': [{'parts': [{'text': Q + ' Answer in two sentences.'}]}], 'tools': [{'google_search': {}}]}).encode()
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', data=body,
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            c = json.loads(r.read())['candidates'][0]
        n = len((c.get('groundingMetadata') or {}).get('groundingChunks', []))
        print(f'   {model}: answered, {n} web sources' + ('  <- OK' if n else '  <- answered without searching the web'))
        break
    except urllib.error.HTTPError as e:
        msg = e.read().decode('utf-8', 'replace')
        try:
            msg = json.loads(msg)['error']['message']
        except Exception:
            pass
        print(f'   {model}: refused, HTTP {e.code}: {msg[:200]}')
    except Exception as e:
        print(f'   {model}: failed: {str(e)[:200]}')
