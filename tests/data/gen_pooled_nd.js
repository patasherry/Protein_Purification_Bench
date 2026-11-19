// Synthetic two-peak UNICORN run: F13-F16 pools only the peak at 14 mL.
// The concentrated sample is 1 mg/mL; at 0.5 mL its mass is 0.5 mg.
function pooledNdRun(){
  const lines = ['Chrom.1,,Chrom.1,', 'UV 1_280,,Fraction,', 'ml,mAU,ml,Fraction'];
  for (let i = 0; i <= 400; i++) {
    const x = i * 0.05;
    const y = 100 * Math.exp(-0.5 * Math.pow((x - 4) / 0.5, 2)) + 200 * Math.exp(-0.5 * Math.pow((x - 14) / 0.5, 2));
    const fx = i <= 20 ? i.toFixed(3) : '';
    const fl = i < 20 ? `"F${i + 1}"` : i === 20 ? '"Waste"' : '';
    lines.push(`${x.toFixed(3)},${y.toFixed(4)},${fx},${fl}`);
  }
  return lines.join('\n');
}
const pooledNdReading = () => 'Sample Name,Protein (mg/mL),A280,Sample Type\nSynthetic pool,1.0,1.0,1 Abs = 1 mg/mL\n';
module.exports = {pooledNdRun, pooledNdReading};
if (require.main === module) process.stdout.write(pooledNdRun());
