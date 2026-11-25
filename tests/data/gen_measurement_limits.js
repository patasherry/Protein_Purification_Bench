// Synthetic two-column chromatograms with one marked measurement; no lab data.
function measurementLimitCsv(marked){
  const rows = ['Time (min),UV 280 (mAU)'];
  for (let i = 0; i < 20; i++) rows.push(`${i / 10},${i === 10 ? marked : '0.02'}`);
  return rows.join('\n') + '\n';
}
module.exports = {measurementLimitCsv};
