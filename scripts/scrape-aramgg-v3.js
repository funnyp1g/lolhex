// scripts/scrape-aramgg-v3.js - 多策略提取 aramgg.com 真实数据
// 策略A: 从 HTML 提取 augment/champion ID 链接
// 策略B: 从 RSC 提取统计数据并关联 ID
// 策略C: 从 homepage RSC 提取 champion 排行（含 championId）
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
    timeout: 20000
  });
  return res.data;
}

function extractJSONArrays(text) {
  const arrays = [];
  let depth = 0, start = -1, inString = false, escape = false;

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
            if (Array.isArray(parsed) && parsed.length > 0) arrays.push(parsed);
          } catch (e) {}
        }
        start = -1;
      }
    }
  }
  return arrays;
}

function extractJSONObjects(text) {
  const objects = [];
  let depth = 0, start = -1, inString = false, escape = false;

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

function mapTier(tierNum) {
  const map = { '1': 'S', '2': 'A', '3': 'B', '4': 'C', '5': 'D' };
  return map[tierNum] || 'C';
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ====== Strategy A: Extract champion ranking from homepage RSC ======
  console.log('=== [A] 首页英雄排行 ===');
  const homeRSC = await fetchRSC('/zh-CN');
  const homeArrays = extractJSONArrays(homeRSC);
  const homeObjects = extractJSONObjects(homeRSC);

  // Find arrays/objects with champion data
  const championRankData = [];

  // Check arrays
  homeArrays.forEach(arr => {
    if (arr.length > 10 && arr[0] && typeof arr[0] === 'object') {
      const keys = Object.keys(arr[0]);
      // Homepage champion ranking typically has: championId, championName, winRate, pickRate, tier
      if (keys.includes('championId') || keys.includes('champion_id')) {
        championRankData.push({type: 'array', data: arr, keys});
      }
    }
  });

  // Check objects
  homeObjects.forEach(obj => {
    if (obj.champion_ranking || obj.championRanking || (obj.data && Array.isArray(obj.data) && obj.data.length > 10)) {
      championRankData.push({type: 'object', data: obj, keys: Object.keys(obj)});
    }
  });

  console.log(`  排行数据组: ${championRankData.length}`);
  championRankData.forEach((d, i) => {
    const preview = JSON.stringify(d.data).substring(0, 300);
    console.log(`  [${i}] type=${d.type}, keys=${d.keys?.slice(0,15).join(',')}`);
    console.log(`      preview: ${preview}`);
  });

  // Save raw home data for deeper analysis
  fs.writeFileSync(path.join(OUTPUT_DIR, 'homepage-arrays.json'), JSON.stringify(homeArrays.map(a => ({len: a.length, keys: a[0] ? Object.keys(a[0]) : [], sample: a.slice(0, 3)})), null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'homepage-objects.json'), JSON.stringify(homeObjects.filter(o => Object.keys(o).length > 5).slice(0, 30), null, 2));

  // ====== Strategy B: Extract augment data with IDs from augments RSC ======
  console.log('\n=== [B] 海克斯排行 ===');
  const augRSC = await fetchRSC('/zh-CN/augments');
  const augObjects = extractJSONObjects(augRSC);

  // Find objects with top_champions (these are per-augment data blocks)
  const augDataBlocks = augObjects.filter(o => o.top_champions && o.win_rate);
  console.log(`  数据块: ${augDataBlocks.length}`);

  // ALSO: look for the augment ID mapping in the RSC
  // The augment IDs might be in a separate list that corresponds 1:1 with data blocks
  // Search for augment name patterns in the raw text
  const augmentNames = [];
  const nameRegex = /"augment_name"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = nameRegex.exec(augRSC)) !== null) {
    augmentNames.push(match[1]);
  }
  console.log(`  augment_name 出现: ${augmentNames.length}`);

  // Search for augment_id in raw text
  const idRegex = /"augment_id"\s*:\s*(\d+)/g;
  const augmentIds = [];
  while ((match = idRegex.exec(augRSC)) !== null) {
    augmentIds.push(parseInt(match[1]));
  }
  console.log(`  augment_id 出现: ${augmentIds.length}`);

  // Search for any numeric ID patterns near augment data
  const numIdRegex = /"id"\s*:\s*(\d{3,6})/g;
  const numericIds = [];
  while ((match = numIdRegex.exec(augRSC)) !== null) {
    numericIds.push(parseInt(match[1]));
  }
  console.log(`  数字 ID (3-6位): ${[...new Set(numericIds)].length} 个唯一值`);

  // Save data blocks
  const processedBlocks = augDataBlocks.map(block => ({
    tier: block.tier,
    win_rate: block.win_rate,
    pick_rate: block.pick_rate,
    num_games: block.num_games,
    num_win_games: block.num_win_games,
    top_champions_count: block.top_champions?.length || 0,
    stage_stats: block.augment_stage_stats?.length || 0
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'augment-blocks.json'), JSON.stringify(processedBlocks, null, 2));

  console.log(`\n  数据块摘要:`);
  console.log(`    第一个 block: ${JSON.stringify(processedBlocks[0])}`);
  console.log(`    最后一个 block: ${JSON.stringify(processedBlocks[processedBlocks.length - 1])}`);

  // ====== Strategy C: Get augment IDs from HTML page links ======
  console.log('\n=== [C] HTML 页面提取 ===');
  const htmlRes = await axios.get('https://aramgg.com/zh-CN/augments', {
    headers: BROWSER,
    timeout: 15000
  });
  const html = htmlRes.data;

  // Extract augment links: /zh-CN/augments/{id}
  const augLinkRegex = /\/zh-CN\/augments\/(\d+)/g;
  const htmlAugIds = [];
  while ((match = augLinkRegex.exec(html)) !== null) {
    htmlAugIds.push(parseInt(match[1]));
  }
  console.log(`  从 HTML 提取海克斯 ID: ${[...new Set(htmlAugIds)].length} 个`);

  // Also get champion links
  const champLinkRegex = /\/zh-CN\/champion-stats\/(\d+)/g;
  const htmlChampIds = [];
  while ((match = champLinkRegex.exec(html)) !== null) {
    htmlChampIds.push(parseInt(match[1]));
  }
  console.log(`  从 HTML 提取英雄 ID: ${[...new Set(htmlChampIds)].length} 个`);

  // Save IDs
  fs.writeFileSync(path.join(OUTPUT_DIR, 'augment-ids-from-html.json'), JSON.stringify([...new Set(htmlAugIds)], null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'champion-ids-from-html.json'), JSON.stringify([...new Set(htmlChampIds)], null, 2));

  console.log('\n=== 完成 ===');
}

main().catch(e => console.error(e));
