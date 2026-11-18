// #1316: chromatogram labels (fraction labels, peak labels, and nested zoom-inset text) must not collide with axis ticks.
// Measured on the saved SVG via H(p).exportSvg() and H(p).svgBoxes(), never through internal globals.
const {open, H, suite, src, fits} = require('../lib/harness');
const T = suite('1316_chromatogram_overlap');

const setOpt = (p, id, v) => p.evaluate(([id, v]) => {
  const el = document.getElementById(id); if (!el) return false;
  if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
}, [id, v]);

const findOverlaps = texts => {
  const hits = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (w > 0 && h > 0 && w * h > 0.2 * Math.min(a.w * a.h, b.w * b.h)) {
        hits.push(`"${a.t}" vs "${b.t}"`);
      }
    }
  }
  return hits;
};

(async () => {
  /* 1. Usability #749 / #1316 reproduction: ÄKTA IMAC run with zoom inset on must not overlap right-axis tick "75" and fraction "T13" */
  await T.t('akta-zoom', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Chrom overlap IMAC');
      await h.addRun(src('his'));
      await h.wait(400);
      await setOpt(p, 'o-zoomInset', true);
      await h.wait(600);

      const svg = await h.exportSvg();
      const m = await h.svgBoxes(svg, '.zoom-inset-bg');
      const ov = findOverlaps(m.texts);
      T.check('akta-zoom/no-tick-overlap', ov.length === 0, ov.join(' | '));
      T.check('akta-zoom/unclipped', m.clipped.length === 0, m.clipped.map(c => c.t).join(' | '));

      /* Every label belonging to the inset must stay inside .zoom-inset-bg rather than spilling across the main right axis */
      const insetTexts = await p.evaluate(svgText => {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-9999px;top:0';
        host.innerHTML = svgText;
        document.body.appendChild(host);
        try {
          const bg = host.querySelector('.zoom-inset-bg');
          if (!bg) return {ok: false, out: ['missing .zoom-inset-bg']};
          const br = bg.getBoundingClientRect();
          const out = [...host.querySelectorAll('#zoom-inset text')].map(el => {
            const r = el.getBoundingClientRect(), t = el.textContent.trim();
            return {t, ok: !t || (r.left >= br.left - 2 && r.right <= br.right + 2 && r.top >= br.top - 2 && r.bottom <= br.bottom + 2)};
          }).filter(x => !x.ok).map(x => x.t);
          return {ok: out.length === 0, out};
        } finally {
          host.remove();
        }
      }, svg);
      T.check('akta-zoom/inset-texts-fit-box', insetTexts.ok, insetTexts.out.join(', '));
      T.check('akta-zoom/no-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* 2. Steep gradient window + integrated peak label + inward axis ticks: zero overlaps and peak label stays near peak */
  await T.t('akta-gradient-and-peaks', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await h.newProject('Chrom overlap IEX');
      await h.addRun(src('q'));
      await h.wait(400);
      await setOpt(p, 'o-ticksOut', false);
      await setOpt(p, 'o-intLabel', 've');
      /* Integrate across the main peak through UI drag on #paper svg */
      const b = await p.evaluate(() => document.querySelector('#paper svg').getBoundingClientRect());
      await p.mouse.move(b.left + b.width * 0.35, b.top + b.height * 0.5);
      await p.mouse.down();
      await p.mouse.move(b.left + b.width * 0.65, b.top + b.height * 0.5, {steps: 8});
      await p.mouse.up();
      await h.wait(400);

      await setOpt(p, 'o-zoomWinA', '8');
      await setOpt(p, 'o-zoomWinB', '22');
      await setOpt(p, 'o-zoomInset', true);
      await h.wait(600);

      const svg = await h.exportSvg();
      const m = await h.svgBoxes(svg, '.zoom-inset-bg');
      const ov = findOverlaps(m.texts);
      T.check('akta-grad/no-overlap-in-gradient-zoom', ov.length === 0, ov.join(' | '));
      T.check('akta-grad/all-texts-inside-figure', m.texts.every(t => fits(t, m.root, 2)), m.clipped.map(c => c.t).join(' | '));
      T.check('akta-grad/no-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  /* 3. HPLC overlay peak labels with inward ticks avoid axis ticks without drifting off the plot */
  await T.t('overlay-ticks', async () => {
    const {p, errs, close} = await open(), h = H(p);
    try {
      await p.click('#homeQuick');
      await h.wait(800);
      await setOpt(p, 'o-ticksOut', false);
      await setOpt(p, 'o-showPeaks', true);
      await h.wait(400);

      const svg = await h.exportSvg();
      const m = await h.svgBoxes(svg);
      const ov = findOverlaps(m.texts);
      T.check('overlay-ticks/no-overlap', ov.length === 0, ov.join(' | '));
      T.check('overlay-ticks/unclipped', m.clipped.length === 0, m.clipped.map(c => c.t).join(' | '));
      T.check('overlay-ticks/no-errors', errs.length === 0, errs.join(' | '));
    } finally { await close(); }
  });

  T.done();
})();
