// scripts/convert_real_data.js
// 将 data-export/ 下的真实 CSV 数据转换为 statsDataSync 云函数可用的 JS 模块
// 输出: cloudfunctions/statsDataSync/data/real-stats.js
//
// 使用方法:
//   node scripts/convert_real_data.js
//
// 数据来源: aramgg.com 抓取 (2026-06-27)
const fs = require('fs');
const path = require('path');

const DATA_EXPORT_DIR = path.join(__dirname, '..', 'data-export');
const OUTPUT_FILE = path.join(__dirname, '..', 'cloudfunctions', 'statsDataSync', 'data', 'real-stats.js');

// CSV 解析（处理带引号和不带引号的字段）
function parseCSV(content, customHeaders) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = customHeaders || parseLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length < headers.length) continue;

    const row = {};
    headers.forEach((h, idx) => {
      const val = values[idx] || '';
      // 自动类型转换
      if (['win_rate', 'pick_rate', 'sample_size', 'num_games', 'champions_count'].includes(h)) {
        row[h] = parseFloat(val) || 0;
      } else if (['champion_id', 'augment_id', 'item_id', 'riot_id', 'stage', 'rank'].includes(h)) {
        row[h] = parseInt(val, 10) || 0;
      } else if (['tier', 'patch_version', 'updated_at'].includes(h)) {
        // 保持原样（字符串或日期）
        row[h] = val.replace(/^"|"$/g, '').trim();
      } else {
        // _id 等，去引号
        row[h] = val.replace(/^"|"$/g, '').trim();
      }
    });
    rows.push(row);
  }
  return rows;
}

function parseLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// 主流程
console.log('Reading real CSV files from:', DATA_EXPORT_DIR);

const files = {
  'champion-augments-real.csv': 'champion_augments',
  'champion-items-real.csv': 'champion_items',
  'champion-global-real.csv': 'champion_globals',
  'augment-global-real.csv': 'augment_globals',
  'augment-trios-real.csv': 'augment_trios',
  'champion-stage-performance-real.csv': 'champion_stage_performance'
};

// CSV 有特殊格式的文件，显式指定 header
const CUSTOM_HEADERS = {
  'augment-trios-real.csv': ['_id', 'augment_id_0', 'augment_id_1', 'augment_id_2', 'champion_id', 'win_rate', 'sample_size', 'tier', 'patch_version', 'updated_at']
};

const data = {};
let totalRows = 0;

for (const [filename, key] of Object.entries(files)) {
  const filepath = path.join(DATA_EXPORT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`  ⚠ ${filename} not found, skipping`);
    data[key] = [];
    continue;
  }

  const content = fs.readFileSync(filepath, 'utf8');
  const customHeaders = CUSTOM_HEADERS[filename];
  const rows = parseCSV(content, customHeaders);
  // augment_trios: 将三个独立的 augment_id_N 列合并为 augment_ids 数组
  if (filename === 'augment-trios-real.csv') {
    rows.forEach(row => {
      row.augment_ids = [row.augment_id_0, row.augment_id_1, row.augment_id_2].filter(Boolean);
      delete row.augment_id_0;
      delete row.augment_id_1;
      delete row.augment_id_2;
    });
  }
  data[key] = rows;
  totalRows += rows.length;
  console.log(`  ✓ ${filename}: ${rows.length} rows`);
}

// 生成 JS 模块
const js = `// real-stats.js — aramgg.com real champion/augment/item stats
// Auto-generated from data-export/*-real.csv
// Generated: ${new Date().toISOString()} | Total: ${totalRows} rows
// DO NOT EDIT MANUALLY — run "node scripts/convert_real_data.js" to regenerate

module.exports = ${JSON.stringify(data, null, '  '.repeat(0))};
`;

// 压缩为单行（减小文件体积）
const compressed = `// real-stats.js — aramgg.com real stats data
// Generated: ${new Date().toISOString()} | Total: ${totalRows} rows
module.exports = ${JSON.stringify(data)};
`;

fs.writeFileSync(OUTPUT_FILE, compressed, 'utf8');

const stat = fs.statSync(OUTPUT_FILE);
const sizeKB = (stat.size / 1024).toFixed(1);
console.log(`\nOutput: ${OUTPUT_FILE} (${sizeKB} KB)`);
console.log(`Total rows: ${totalRows}`);
console.log('Done!');
