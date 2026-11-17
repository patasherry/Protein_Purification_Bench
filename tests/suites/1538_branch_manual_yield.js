// #1538: manual purification steps on a parallel branch (wfFrom) must compute Step yield (%) against their parent step, not the preceding sibling branch.
const {open, H, suite, src, DATA, fs, path} = require('../lib/harness');

(async () => {
  const T = suite('1538_branch_manual_yield');
  await T.t('manual_step_branch_yield', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Branch manual step yield');
      await h.gb(src('gb'));
      await h.addRun(src('his')); await h.pool('T1-T6'); // Step 1: IMAC (~3.14 mg)
      await h.addRun(path.join(DATA, 'science/sec_inject2.csv')); await h.suggest(); // Step 2: SEC on Branch A (~0.19 mg)

      const runsTl = (await h.timeline()).filter(x => x.k.startsWith('run:'));
      const imacId = runsTl[0].k.slice(4);

      // Add a manual purification step after SEC, then branch it from Step 1 (IMAC)
      await h.step(runsTl[1].k);
      await p.click('#tl [data-addmenu]');
      await p.click('#tl [data-addstep="man:batch"]');
      await h.wait(400);

      await p.selectOption('#ssFrom', imacId);
      await h.wait(300);
      await p.fill('#man-vol', '1.0'); await p.dispatchEvent('#man-vol', 'change');
      await p.fill('#man-conc', '1.57'); await p.dispatchEvent('#man-conc', 'change');
      await h.wait(400);

      await h.step('figure');
      await h.wait(500);

      const tb = await h.sumTable(), hd = tb[0] || [];
      const syc = hd.indexOf('Step yield (%)'), ylc = hd.indexOf('Yield (%)');
      const manRow = tb.slice(1).find(r => /Batch binding/.test(r[0] || ''));
      const stepY = manRow ? parseFloat(manRow[syc]) : NaN;
      const yld = manRow ? parseFloat(manRow[ylc]) : NaN;

      T.check('manual row rendered in summary table', !!manRow && syc >= 0 && ylc >= 0, JSON.stringify(tb));
      T.check('manual branch step yield is 50% of IMAC parent (not >800% of sibling SEC)', Math.abs(stepY - 50) <= 1 && Math.abs(yld - 50) <= 1, JSON.stringify(manRow));

      const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 10000}), p.click('#sumCsv')]);
      const csv = fs.readFileSync(await dl.path(), 'utf8');
      const csvMan = csv.split(/\r?\n/).find(l => /Batch binding/.test(l)) || '';
      T.check('summary CSV manual step yield matches 50.0%', /,50\.0,50\.0,/.test(csvMan), csvMan);
      T.check('no page errors', !errs.length, errs.join(' | '));
    } finally {
      await close();
    }
  });
  T.done();
})();
