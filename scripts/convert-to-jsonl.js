// scripts/convert-to-jsonl.js - 将 JSON 数组转换为微信云数据库可导入的 JSON Lines 格式
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-export');

const files = [
  'champion-augments-real.json',
  'augment-global-real.json',
  'champion-global-real.json',
  'champion-stage-performance-real.json',
];

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

  // JSON Lines: 每行一个 JSON 对象
  const jsonl = data.map(item => JSON.stringify(item)).join('\n');
  const outFile = filename.replace('.json', '.jsonl');
  const outPath = path.join(DATA_DIR, outFile);
  fs.writeFileSync(outPath, jsonl, 'utf8');
  console.log(`${filename} → ${outFile} (${data.length} 条)`);
});

console.log('\n完成！现在可以用 .jsonl 文件在云开发控制台导入。');
