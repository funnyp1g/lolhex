// scripts/fetch-detailed-data.js
// 从 aramgg.com 的各个详情页提取带 ID 的结构化数据
// 策略：hero-stats 页面的 RSC 包含该英雄关联的所有 augment ID
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};
const OUTPUT_DIR = path.join(__dirname, '..', 'data-export');
const PATCH = '26.12';

function rscHeaders(path) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/x-component',
    'RSC': '1',
    'Next-Url': path,
  };
}

async function fetchRSC(path) {
  const res = await axios.get('https://aramgg.com' + path, {
    headers: rscHeaders(path),
    timeout: 30000
  });
  return res.data;
}

// Extract all JSON arrays that contain objects with specific keys
function extractJSONArrays(text) {
  const arrays = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        const arrStr = text.substring(start, i + 1);
        if (arrStr.length > 10 && arrStr.length < 500000) {
          try {
            const parsed = JSON.parse(arrStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              arrays.push(parsed);
            }
          } catch (e) {}
        }
        start = -1;
      }
    }
  }
  return arrays;
}

// Extract all JSON objects
function extractJSONObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const objStr = text.substring(start, i + 1);
        if (objStr.length > 10 && objStr.length < 100000) {
          try {
            const parsed = JSON.parse(objStr);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              objects.push(parsed);
            }
          } catch (e) {}
        }
        start = -1;
      }
    }
  }
  return objects;
}

// count keys in objects
function analyzeObjects(objects, label) {
  const keyCounts = {};
  objects.forEach(obj => {
    Object.keys(obj).forEach(k => {
      keyCounts[k] = (keyCounts[k] || 0) + 1;
    });
  });
  const sorted = Object.entries(keyCounts).sort((a, b) => b[1] - a[1]);
  console.log(`  ${label}: ${objects.length} objects, top keys: ${sorted.slice(0, 20).map(([k,v]) => `${k}(${v})`).join(', ')}`);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ====== 1. Champion detail page ======
  console.log('=== [1] 英雄详情页 (ID=1) ===');
  const champRSC = await fetchRSC('/zh-CN/champion-stats/1');
  const champObjects = extractJSONObjects(champRSC);
  analyzeObjects(champObjects, 'Champion objects');

  // Find objects with augment info
  const champAugObjects = champObjects.filter(o => 'augment_id' in o && 'win_rate' in o);
  console.log(`  含 augment_id + win_rate 的对象: ${champAugObjects.length}`);
  if (champAugObjects.length > 0) {
    console.log(`  示例: ${JSON.stringify(champAugObjects[0]).substring(0, 300)}`);
  }

  // Also search in arrays
  const champArrays = extractJSONArrays(champRSC);
  console.log(`  数组: ${champArrays.length} 个`);
  champArrays.forEach((arr, i) => {
    if (arr.length > 0 && typeof arr[0] === 'object') {
      const keys = Object.keys(arr[0]);
      console.log(`    [${i}] len=${arr.length}, keys=[${keys.slice(0, 10).join(',')}]`);
    }
  });

  // ====== 2. Augments page: find mapping between augment data blocks and augment IDs ======
  console.log('\n=== [2] 海克斯列表页 ===');
  const augRSC = await fetchRSC('/zh-CN/augments');

  // Search for augment_name pattern
  const augNameIdx = augRSC.indexOf('augment_name');
  const augIdIdx = augRSC.indexOf('augment_id');
  console.log(`  'augment_name' found at: ${augNameIdx}`);
  console.log(`  'augment_id' found at: ${augIdIdx}`);

  // Get context around augment_name
  if (augNameIdx >= 0) {
    const ctx = augRSC.substring(Math.max(0, augNameIdx - 200), Math.min(augRSC.length, augNameIdx + 400));
    console.log(`  Context: ${ctx.substring(0, 600)}`);
  }

  // Look for augment IDs in the page
  const augObjects = extractJSONObjects(augRSC);
  analyzeObjects(augObjects, 'Augment objects');

  const augWithId = augObjects.filter(o => 'augment_id' in o || 'id' in o || 'augment_name' in o);
  console.log(`  含 augment 信息的对象: ${augWithId.length}`);
  if (augWithId.length > 0) {
    augWithId.slice(0, 5).forEach(o => {
      console.log(`    ${JSON.stringify(o).substring(0, 200)}`);
    });
  }

  // ====== 3. Try augment detail page ======
  console.log('\n=== [3] 海克斯详情页 ===');
  const augDetailRSC = await fetchRSC('/zh-CN/augments/8472'); // try a common augment ID
  const augDetailObjects = extractJSONObjects(augDetailRSC);
  analyzeObjects(augDetailObjects, 'Augment detail objects');

  const detailAugs = augDetailObjects.filter(o => 'augment_id' in o || 'augment_name' in o);
  console.log(`  含 augment 信息的对象: ${detailAugs.length}`);
  detailAugs.slice(0, 5).forEach(o => console.log(`    ${JSON.stringify(o).substring(0, 300)}`));

  // ====== 4. Save all raw data for deeper analysis ======
  fs.writeFileSync(path.join(OUTPUT_DIR, 'champion-1-objects.json'), JSON.stringify(champObjects, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'augments-objects.json'), JSON.stringify(augObjects.slice(0, 100), null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'augment-detail-objects.json'), JSON.stringify(detailAugs, null, 2));

  console.log('\n原始数据已保存，开始深度分析...');
}

main().catch(e => console.error(e));
