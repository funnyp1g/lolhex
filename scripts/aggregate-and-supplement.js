// scripts/aggregate-and-supplement.js
// 从已有数据聚合英雄全局统计 + 从英雄详情页获取装备和组合数据
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
    timeout: 25000
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
    if (ch === '[') { if (depth === 0) start = i; depth++; }
    else if (ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { arrays.push(JSON.parse(text.substring(start, i + 1))); } catch (e) {}
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
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { objects.push(JSON.parse(text.substring(start, i + 1))); } catch (e) {}
        start = -1;
      }
    }
  }
  return objects;
}

async function main() {
  // ====== Part 1: Aggregate champion global stats from existing data ======
  console.log('=== Part 1: 聚合英雄全局统计 ===');

  const caFile = path.join(OUTPUT_DIR, 'champion-augments-real.json');
  const championAugments = JSON.parse(fs.readFileSync(caFile, 'utf8'));

  // Aggregate by champion_id
  const champStats = {};
  championAugments.forEach(ca => {
    const cid = ca.champion_id;
    if (!champStats[cid]) {
      champStats[cid] = { totalWR: 0, totalGames: 0, totalPR: 0, count: 0 };
    }
    champStats[cid].totalWR += ca.win_rate * ca.sample_size;
    champStats[cid].totalGames += ca.sample_size;
    champStats[cid].totalPR += ca.pick_rate;
    champStats[cid].count++;
  });

  const championGlobalStats = [];
  for (const [cid, stats] of Object.entries(champStats)) {
    const avgWR = stats.totalGames > 0 ? stats.totalWR / stats.totalGames : 0;
    const avgPR = stats.totalPR / stats.count;
    championGlobalStats.push({
      _id: String(cid),
      riot_id: parseInt(cid),
      win_rate: Math.round(avgWR * 100) / 100,
      pick_rate: Math.round(avgPR * 100) / 100,
      augments_count: stats.count,
      patch_version: PATCH,
      updated_at: new Date().toISOString()
    });
  }

  championGlobalStats.sort((a, b) => b.win_rate - a.win_rate);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'champion-global-real.json'),
    JSON.stringify(championGlobalStats, null, 2)
  );
  console.log(`  聚合 ${championGlobalStats.length} 个英雄全局统计`);
  console.log(`  最高胜率: ${championGlobalStats[0].win_rate}% (ID:${championGlobalStats[0].riot_id})`);
  console.log(`  最低胜率: ${championGlobalStats[championGlobalStats.length-1].win_rate}% (ID:${championGlobalStats[championGlobalStats.length-1].riot_id})`);

  // ====== Part 2: Probe champion detail page for items/trios ======
  console.log('\n=== Part 2: 探测英雄详情页数据结构 ===');
  const testChampId = championGlobalStats[0].riot_id; // highest WR champion

  console.log(`  测试英雄 ID: ${testChampId}`);
  const champRSC = await fetchRSC(`/zh-CN/champion-stats/${testChampId}`);

  const champArrays = extractJSONArrays(champRSC);
  const champObjects = extractJSONObjects(champRSC);

  console.log(`  数组: ${champArrays.length}`);
  console.log(`  对象: ${champObjects.length}`);

  // Look for arrays with item/augment trio data
  champArrays.forEach((arr, i) => {
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object') {
      const keys = Object.keys(arr[0]);
      const relevant = keys.some(k => k.match(/item|augment|trio|build|stage/i));
      if (relevant) {
        console.log(`\n  [${i}] len=${arr.length}, keys=[${keys.join(',')}]`);
        console.log(`      sample: ${JSON.stringify(arr.slice(0, 2)).substring(0, 400)}`);
      }
    }
  });

  // Look for relevant objects
  console.log('\n  相关对象:');
  const relevantKeys = ['augment', 'item', 'trio', 'stage', 'win_rate', 'build', 'core_items', 'recommended_items'];
  champObjects.forEach((obj, i) => {
    const keys = Object.keys(obj);
    const hasRelevant = keys.some(k => relevantKeys.some(rk => k.includes(rk)));
    if (hasRelevant && keys.length > 2) {
      console.log(`  [${i}] keys=[${keys.slice(0, 15).join(',')}]`);
      console.log(`      ${JSON.stringify(obj).substring(0, 400)}`);
    }
  });

  // Save raw data
  fs.writeFileSync(path.join(OUTPUT_DIR, 'champion-detail-probe.json'), JSON.stringify({
    arrays: champArrays.filter(a => Array.isArray(a) && a.length > 0 && typeof a[0] === 'object').map(a => ({
      len: a.length,
      keys: Object.keys(a[0]),
      sample: a.slice(0, 3)
    })),
    objects: champObjects.filter(o => Object.keys(o).length > 2).slice(0, 30)
  }, null, 2));

  console.log('\n探测数据已保存');
}

main().catch(e => console.error(e));
