// scripts/extract-homepage-data.js - 从 aramgg.com 首页提取英雄排行数据
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

function mapTier(tierNum) {
  const map = { '1': 'S', '2': 'A', '3': 'B', '4': 'C', '5': 'D' };
  return map[tierNum] || 'C';
}

async function main() {
  console.log('=== 从首页提取英雄排行 ===');

  // First try RSC
  console.log('\n--- 首页 RSC ---');
  const rsc = await fetchRSC('/zh-CN');
  const rscArrays = extractJSONArrays(rsc);
  const rscObjects = extractJSONObjects(rsc);

  console.log(`RSC 数组: ${rscArrays.length}`);
  console.log(`RSC 对象: ${rscObjects.length}`);

  // Look for champion ranking data
  const rankingArrays = [];
  rscArrays.forEach(arr => {
    if (Array.isArray(arr) && arr.length > 10 && arr[0] && typeof arr[0] === 'object') {
      const keys = Object.keys(arr[0]);
      console.log(`  数组 len=${arr.length}, keys=[${keys.join(',')}]`);
      if (keys.some(k => k.match(/champion|win|pick|tier|rank/i))) {
        rankingArrays.push({keys, count: arr.length, sample: arr.slice(0, 3)});
      }
    }
  });

  console.log(`\n排行相关数组: ${rankingArrays.length}`);
  rankingArrays.forEach((r, i) => {
    console.log(`  [${i}] count=${r.count}, keys=[${r.keys.join(',')}]`);
    console.log(`      sample: ${JSON.stringify(r.sample).substring(0, 300)}`);
  });

  // Look for champion data in objects
  const champObjects = rscObjects.filter(o => o.championId || o.champion_id || (o.data && Array.isArray(o.data)));
  console.log(`\n英雄相关对象: ${champObjects.length}`);
  champObjects.slice(0, 10).forEach((o, i) => {
    console.log(`  [${i}] keys=[${Object.keys(o).slice(0,10).join(',')}]`);
    if (o.champions) console.log(`      champions count: ${o.champions.length}`);
    if (o.data && Array.isArray(o.data)) console.log(`      data count: ${o.data.length}`);
  });

  // Also try regular HTML
  console.log('\n--- 首页 HTML ---');
  const htmlRes = await axios.get('https://aramgg.com/zh-CN', {
    headers: {'User-Agent': 'Mozilla/5.0'},
    timeout: 15000
  });
  const htmlArrays = extractJSONArrays(htmlRes.data);
  console.log(`HTML 数组: ${htmlArrays.length}`);

  const htmlRankingArrays = [];
  htmlArrays.forEach(arr => {
    if (Array.isArray(arr) && arr.length > 10 && arr[0] && typeof arr[0] === 'object') {
      const keys = Object.keys(arr[0]);
      if (keys.some(k => k.match(/champion|win/i))) {
        htmlRankingArrays.push({keys, count: arr.length, sample: arr.slice(0, 3)});
      }
    }
  });

  console.log(`HTML 排行数组: ${htmlRankingArrays.length}`);
  htmlRankingArrays.forEach((r, i) => {
    console.log(`  [${i}] count=${r.count}, keys=[${r.keys.join(',')}]`);
    console.log(`      sample: ${JSON.stringify(r.sample).substring(0, 300)}`);
  });

  // Save all RSC data for analysis
  fs.writeFileSync(path.join(OUTPUT_DIR, 'homepage-analysis.json'), JSON.stringify({
    rsc_ranking_arrays: rankingArrays,
    rsc_champ_objects: champObjects.slice(0, 5),
    html_ranking_arrays: htmlRankingArrays
  }, null, 2));

  console.log('\n分析数据已保存');
}

main().catch(e => console.error(e));
