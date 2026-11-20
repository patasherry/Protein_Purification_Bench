// The app under test: APP=/path/to/app.html, else the protein-purification-bench*.html in the repository root.
// Kept separate from harness.js, which starts a local server when loaded.
const fs = require('fs'); const path = require('path');
const repo = path.resolve(__dirname, '..', '..'), files = fs.readdirSync(repo);
const found = files.find(f => /^protein-purification-bench.*\.html$/.test(f)) || files.find(f => /^hplc-figure-bench.*\.html$/.test(f)) || 'protein-purification-bench.html';
module.exports = path.resolve(process.env.APP || path.join(repo, found));
