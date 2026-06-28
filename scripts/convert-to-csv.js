// scripts/convert-to-csv.js - 将 JSON 数组转换为 CSV 格式（微信云数据库可导入）
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-export');

const files = [
  'champion-augments-real.json',
  'augment-global-real.json',
  'champion-global-real.json',
  'champion-stage-performance-real.json',
];

function jsonToCSV(data) {
  if (!Array.isArray(data) || data.length === 0) return '';

  // 收集所有键
  const allKeys = new Set();
  data.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
  const keys = Array.from(allKeys);

  // 转义 CSV 字段（包含逗号、引号或换行的字段需要引号包裹）
  function escapeField(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // 表头 + 数据行
  const header = keys.map(escapeField).join(',');
  const rows = data.map(item => keys.map(k => escapeField(item[k])).join(','));
  return header + '\n' + rows.join('\n');
}

files.forEach(filename => {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`SKIP: ${filename} (not found)`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  if (!Array.isArray(data)) {
    console.log(`SKIP: ${filename} (not an array)`);
    return;
  }

  const csv = jsonToCSV(data);
  // 微信云数据库导入 CSV 需要 BOM 头确保中文兼容
  const bom = '﻿';
  const outFile = filename.replace('.json', '.csv');
  const outPath = path.join(DATA_DIR, outFile);
  fs.writeFileSync(outPath, bom + csv, 'utf8');
  console.log(`${filename} → ${outFile} (${data.length} 条, ${csv.split('\n')[0].split(',').length} 列)`);
});

console.log('\n完成！现在可以用 .csv 文件在云开发控制台导入。');
