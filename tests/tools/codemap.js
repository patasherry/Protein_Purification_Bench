#!/usr/bin/env node
/**
 * codemap.js - Scan hplc-figure-bench(WF1.13).html for section markers and symbol definitions.
 *
 * Usage:
 *   node tests/tools/codemap.js [--plain] [--write] [--check] [path/to/app.html]
 *   --write updates section ranges and function/symbol line numbers in docs/CODEMAP.md in place.
 *   --check exits 1 if docs/CODEMAP.md is out of date with the HTML file.
 */

const fs = require('fs');
const path = require('path');

// Locate the HTML file
const defaultPaths = [
  path.resolve(__dirname, '../../hplc-figure-bench(WF1.13).html'),
  path.resolve(process.cwd(), 'hplc-figure-bench(WF1.13).html'),
  path.resolve(__dirname, '../hplc-figure-bench(WF1.13).html')
];

let appPath = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!appPath) {
  appPath = defaultPaths.find(p => fs.existsSync(p));
}

if (!appPath || !fs.existsSync(appPath)) {
  console.error('Error: Could not find hplc-figure-bench(WF1.13).html');
  process.exit(1);
}

const content = fs.readFileSync(appPath, 'utf8');
const lines = content.split('\n');

const markerRegex = /\/\*\s*----------\s*(.*?)\s*----------\s*\*\//;
const sections = [];
const symLine = new Map();

lines.forEach((line, index) => {
  const ln = index + 1;
  const match = line.match(markerRegex);
  if (match) {
    sections.push({
      startLine: ln,
      name: match[1].trim(),
      raw: line.trim()
    });
  }
  for (const m of line.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!symLine.has(m[1])) symLine.set(m[1], ln);
  }
  for (const m of line.matchAll(/(?:^|[;,]\s*|\b(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    if (!symLine.has(m[1])) symLine.set(m[1], ln);
  }
  for (const m of line.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    if (!symLine.has(m[1])) symLine.set(m[1], ln);
  }
  for (const m of line.matchAll(/\bid="([^"]+)"/g)) {
    if (!symLine.has('#' + m[1])) symLine.set('#' + m[1], ln);
  }
  for (const m of line.matchAll(/\$\('(#[^"']+)'\)/g)) {
    if (!symLine.has(m[1] + ':js')) symLine.set(m[1] + ':js', ln);
  }
});

const resolveSym = s => s.startsWith('#') ? (symLine.get(s + ':js') || symLine.get(s)) : symLine.get(s);

// Determine end line for each section (last section ends on the line before </script>)
let scriptEndLine = lines.length;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('</script>')) {
    scriptEndLine = i;
    break;
  }
}

for (let i = 0; i < sections.length; i++) {
  sections[i].endLine = i < sections.length - 1 ? sections[i + 1].startLine - 1 : scriptEndLine;
}

const isWrite = process.argv.includes('--write');
const isCheck = process.argv.includes('--check');
const isTable = !process.argv.includes('--plain');

// --write / --check: bring the line ranges and symbol line numbers in docs/CODEMAP.md up to date in place.
if (isWrite || isCheck) {
  const mapPath = path.resolve(__dirname, '../../docs/CODEMAP.md');
  const rawDoc = fs.readFileSync(mapPath, 'utf8');
  const doc = rawDoc.split('\n');
  const head = doc.findIndex(l => /^\|\s*Lines\s*\|\s*Section\s*\|/.test(l));
  if (head < 0) { console.error('Error: no "| Lines | Section |" table in docs/CODEMAP.md'); process.exit(1); }
  let end = head + 2; while (end < doc.length && /^\|/.test(doc[end])) end++;
  const purpose = {};
  doc.slice(head + 2, end).forEach(l => { const m = /^\|[^|]*\|\s*`(.*?)`\s*\|(.*)\|\s*$/.exec(l); if (m) purpose[m[1]] = m[2].trim(); });
  const rows = sections.map(s => `| ${s.startLine}–${s.endLine} | \`${s.name}\` | ${purpose[s.name] || ''} |`);
  let next = doc.slice(0, head + 2).concat(rows, doc.slice(end)).join('\n');

  // Update "| `fn` | Line NNNN |" in Key Functions
  next = next.replace(/^(\|\s*`([^`]+)`\s*\|\s*Line\s+)(\d+)(\s*\|)/gm, (full, pre, sym, oldLn, post) => {
    const ln = resolveSym(sym);
    return ln ? `${pre}${ln}${post}` : full;
  });

  // Update "`sym` (Line NNNN)" or "`#id` dropdown (Line NNNN)" in Where to Change X
  next = next.replace(/(`([^`]+)`(?:\s+\w+)?\s*\(Line\s+)(\d+)(\))/g, (full, pre, sym, oldLn, post) => {
    const ln = resolveSym(sym);
    return ln ? `${pre}${ln}${post}` : full;
  });

  if (isCheck) {
    if (next === rawDoc) {
      console.log('docs/CODEMAP.md is up to date');
      process.exit(0);
    }
    console.error('docs/CODEMAP.md is out of date. Run: node tests/tools/codemap.js --write');
    process.exit(1);
  }

  if (next === rawDoc) { console.log('docs/CODEMAP.md is up to date'); process.exit(0); }
  fs.writeFileSync(mapPath, next);
  console.log(`docs/CODEMAP.md updated: ${rows.length} sections and symbol line numbers`);
  process.exit(0);
}

if (isTable) {
  console.log('| Lines | Section | Purpose |');
  console.log('|---|---|---|');
  sections.forEach(s => {
    console.log(`| ${s.startLine}–${s.endLine} | \`${s.name}\` | |`);
  });
} else {
  sections.forEach(s => {
    console.log(`${s.startLine}-${s.endLine}: ${s.name}`);
  });
}
