// README labels must be words the user can find in the app (#1806). Two README forms name a control: a bold label followed
// by its element id, **Label** (`#id`), and a bold quoted button name, **"Label"**. Each one must appear in the app's page,
// or a user searching the UI for the README's words concludes the feature is missing.
const {open, suite, ROOT, path, fs} = require('../lib/harness');
(async () => { const T = suite('51_readme_labels'), {p, errs, close} = await open();
  const md = fs.readFileSync(path.join(ROOT, '..', 'README.md'), 'utf8');
  const withId = [...md.matchAll(/\*\*"?([^*"]+?)"?\*\*\s*\(`#([\w-]+)`/g)].map(m => ({label: m[1].trim(), id: m[2]}));
  const quoted = [...new Set([...md.matchAll(/\*\*"([^*"]+)"\*\*/g)].map(m => m[1].trim()))];
  /* the whole document's text (hidden panels and the strings the script writes into controls included), plus placeholder, aria-label, title and value attributes */
  const page = await p.evaluate(() => (document.documentElement.textContent + ' ' + [...document.querySelectorAll('[placeholder],[aria-label],[title],input[value]')]
    .map(e => ['placeholder', 'aria-label', 'title', 'value'].map(a => e.getAttribute(a) || '').join(' ')).join(' ')).replace(/\s+/g, ' '));
  const norm = s => s.replace(/\s+/g, ' ');

  await T.t('labels-with-ids', async () => {
    T.check('found labelled controls in README', withId.length >= 5, `${withId.length} found`);
    const ids = await p.evaluate(list => list.filter(id => !document.getElementById(id)), withId.map(x => x.id));
    for (const {label, id} of withId) {
      T.check(`label "${label}" (#${id}) is in the app`, page.includes(norm(label)), 'README label not found in the app');
      T.check(`#${id} exists`, !ids.includes(id), 'no element with this id');
    }
  });

  await T.t('quoted-button-names', async () => {
    T.check('found quoted button names in README', quoted.length >= 5, `${quoted.length} found`);
    for (const q of quoted) T.check(`button "${q}" is in the app`, page.includes(norm(q)), 'README name not found in the app');
  });

  T.check('no-page-errors', !errs.length, errs.join(' | '));
  await close(); T.done(); process.exit(0);
})();
