// Synthetic UNICORN 280 nm run with one peak at 14 mL and 1 mL fractions (F1 starts at 0), written
// with the x axis in mL or in µL (the same run, x and fraction marks times 1000). Pooling F13-F16 must
// give the same volume, area and mg either way (#1566).
function unitRun(unit){
  const k = unit === 'µL' ? 1000 : 1, u = unit === 'µL' ? 'µl' : 'ml', d = k === 1 ? 3 : 0;
  const lines = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', `${u},mAU,${u},Fraction`];
  for (let i = 0; i <= 400; i++) {
    const x = i * 0.05;
    const y = 200 * Math.exp(-0.5 * Math.pow((x - 14) / 0.5, 2));
    const fx = i <= 20 ? (i * k).toFixed(d) : '';
    const fl = i < 20 ? `"F${i + 1}"` : i === 20 ? '"Waste"' : '';
    lines.push(`${(x * k).toFixed(d)},${y.toFixed(4)},${fx},${fl}`);
  }
  return lines.join('\n');
}
module.exports = {unitRun};
if (require.main === module) process.stdout.write(unitRun(process.argv[2] === 'uL' ? 'µL' : 'mL'));
