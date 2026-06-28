// scripts/fix-csv-types.js - 修复 CSV 中 patch_version 被识别为数字的问题
// 确保 patch_version 字段始终被引号包裹，导入时识别为字符串
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-export');

const files = [
  'champion-global-real.csv',
  'champion-augments-real.csv',
  'champion-items-real.csv',
  'augment-trios-real.csv',
  'augment-global-real.csv',
  'champion-stage-performance-real.csv',
];

files.forEach(filename => {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`SKIP: ${filename} (not found)`);
    return;
  }

  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  if (lines.length < 2) {
    console.log(`SKIP: ${filename} (empty)`);
    return;
  }

  // Find patch_version column index
  const header = lines[0].replace(/^﻿/, '').split(',');
  const patchIdx = header.indexOf('patch_version');
  const updatedIdx = header.indexOf('updated_at');
  console.log(`${filename}: patch_version at col ${patchIdx}, updated_at at col ${updatedIdx}`);

  if (patchIdx < 0) {
    console.log(`  No patch_version column, skipping`);
    return;
  }

  // Fix each data row
  const fixedLines = [lines[0]]; // header unchanged
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    // Force-string fields: _id, patch_version, updated_at, tier
    const stringCols = new Set([
      header.indexOf('_id'),
      header.indexOf('patch_version'),
      header.indexOf('updated_at'),
      header.indexOf('tier'),
      header.indexOf('rarity')
    ]);
    stringCols.forEach(colIdx => {
      if (colIdx >= 0 && colIdx < vals.length && vals[colIdx] && !vals[colIdx].startsWith('"')) {
        vals[colIdx] = `"${vals[colIdx]}"`;
      }
    });
    fixedLines.push(vals.join(','));
  }

  const newContent = fixedLines.join('\n');
  if (newContent !== content) {
    fs.writeFileSync(filepath, newContent, 'utf8');
    console.log(`  ✅ Fixed ${filename}`);
  } else {
    console.log(`  ⏭️  No changes needed`);
  }
});

console.log('\n完成！重新导入这些 CSV 即可。');

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}
