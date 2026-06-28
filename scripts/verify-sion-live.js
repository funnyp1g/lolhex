// scripts/verify-sion-live.js - 精确对比 Sion 的 aramgg.com 实时数据 vs 我们的 CSV
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-export');

function parseCSV(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const headerLine = lines[0].replace(/^﻿/, '');
  const headers = headerLine.split(',');
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

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

function extractJSONObjectsInText(text) {
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
  const SION_ID = '14';

  // ====== 1. Fetch Sion's real data from aramgg.com ======
  console.log('=== aramgg.com Sion (ID=14) 实时数据 ===\n');

  const rscHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'text/x-component',
    'RSC': '1',
    'Next-Url': `/zh-CN/champion-stats/${SION_ID}`,
  };
  const res = await axios.get(`https://aramgg.com/zh-CN/champion-stats/${SION_ID}`, {
    headers: rscHeaders, timeout: 20000
  });
  const objs = extractJSONObjectsInText(res.data);

  // Find champion stats
  const champStatsObj = objs.find(o => o.championStats && o.championStats.winRate);
  if (champStatsObj) {
    const cs = champStatsObj.championStats;
    console.log(`全局统计: winRate=${(cs.winRate*100).toFixed(2)}%, pickRate=${(cs.pickRate*100).toFixed(2)}%, games=${cs.numGames}, tier=${cs.tier}`);
  }

  // Find augments data (the REAL one, not i18n)
  let liveAugs = {};
  for (const obj of objs) {
    if (obj.augments && typeof obj.augments === 'object') {
      const keys = Object.keys(obj.augments);
      // i18n messages have keys like "title", "combosTitle", etc.
      // Real augment data has numeric keys like "1004", "1007", etc.
      if (keys.length > 3 && /^\d+$/.test(keys[0])) {
        liveAugs = obj.augments;
        break;
      }
    }
  }

  console.log(`\n海克斯数量 (aramgg实时): ${Object.keys(liveAugs).length}`);
  const liveAugSorted = Object.entries(liveAugs)
    .map(([id, data]) => ({ augment_id: id, ...data }))
    .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate));

  console.log('\nTOP 10 海克斯 (aramgg.com 实时):');
  liveAugSorted.slice(0, 10).forEach((a, i) => {
    console.log(`  ${i+1}. ID ${a.augment_id}: WR=${(parseFloat(a.win_rate)*100).toFixed(2)}%, PR=${(parseFloat(a.pick_rate)*100).toFixed(2)}%, games=${a.num_games}, rank=${a.rank}, tier=${a.tier}`);
  });

  // Find items data
  let liveItems = {};
  for (const obj of objs) {
    if (obj.items && typeof obj.items === 'object') {
      const keys = Object.keys(obj.items);
      if (keys.length > 3 && /^\d+$/.test(keys[0])) {
        liveItems = obj.items;
        break;
      }
    }
  }

  console.log(`\n装备数量 (aramgg实时): ${Object.keys(liveItems).length}`);
  const liveItemsSorted = Object.entries(liveItems)
    .map(([id, data]) => ({ item_id: id, ...data }))
    .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate));

  console.log('\nTOP 10 装备 (aramgg.com 实时):');
  liveItemsSorted.slice(0, 10).forEach((it, i) => {
    console.log(`  ${i+1}. ID ${it.item_id}: WR=${(parseFloat(it.win_rate)*100).toFixed(2)}%, PR=${(parseFloat(it.pick_rate)*100).toFixed(2)}%, games=${it.num_games}`);
  });

  // ====== 2. Our CSV data ======
  console.log('\n\n=== 我们的 CSV 数据 (Sion ID=14) ===\n');

  const ca = parseCSV('champion-augments-real.csv');
  const ci = parseCSV('champion-items-real.csv');
  const cg = parseCSV('champion-global-real.csv');

  const ourAugs = ca.filter(r => r.champion_id === SION_ID)
    .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate));
  console.log(`海克斯数量: ${ourAugs.length}`);
  console.log('TOP 10 海克斯:');
  ourAugs.slice(0, 10).forEach((a, i) => {
    console.log(`  ${i+1}. ID ${a.augment_id}: WR=${a.win_rate}%, PR=${a.pick_rate}%, games=${a.sample_size}, rank=${a.rank}`);
  });

  const ourItems = ci.filter(r => r.champion_id === SION_ID)
    .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate));
  console.log(`\n装备数量: ${ourItems.length}`);
  console.log('TOP 10 装备:');
  ourItems.slice(0, 10).forEach((it, i) => {
    console.log(`  ${i+1}. ID ${it.item_id}: WR=${it.win_rate}%, PR=${it.pick_rate}%, games=${it.sample_size}`);
  });

  const ourGlobal = cg.find(r => r.riot_id === SION_ID || r._id === SION_ID);
  if (ourGlobal) {
    console.log(`\n全局: WR=${ourGlobal.win_rate}%, PR=${ourGlobal.pick_rate}%, games=${ourGlobal.num_games}`);
  }

  // ====== 3. Detailed comparison ======
  console.log('\n\n=== 逐项对比 ===\n');

  // Compare augment ranking order
  console.log('海克斯排名对比 (按WR排序):');
  console.log('排名  | aramgg ID (WR)        | 我们的 ID (WR)        | 匹配?');
  console.log('------|----------------------|----------------------|------');
  for (let i = 0; i < 10; i++) {
    const live = liveAugSorted[i];
    const our = ourAugs[i];
    const liveWR = live ? (parseFloat(live.win_rate)*100).toFixed(2) + '%' : 'N/A';
    const ourWR = our ? our.win_rate + '%' : 'N/A';
    const match = live && our && live.augment_id === our.augment_id ? '✅' : '❌';
    console.log(`  ${String(i+1).padStart(2)}   | ${(live?.augment_id||'N/A').padEnd(6)} ${liveWR.padEnd(10)} | ${(our?.augment_id||'N/A').padEnd(6)} ${ourWR.padEnd(10)} | ${match}`);
  }

  console.log('\n装备排名对比 (按WR排序):');
  console.log('排名  | aramgg ID (WR)        | 我们的 ID (WR)        | 匹配?');
  console.log('------|----------------------|----------------------|------');
  for (let i = 0; i < 10; i++) {
    const live = liveItemsSorted[i];
    const our = ourItems[i];
    const liveWR = live ? (parseFloat(live.win_rate)*100).toFixed(2) + '%' : 'N/A';
    const ourWR = our ? our.win_rate + '%' : 'N/A';
    const match = live && our && live.item_id === our.item_id ? '✅' : '❌';
    console.log(`  ${String(i+1).padStart(2)}   | ${(live?.item_id||'N/A').padEnd(6)} ${liveWR.padEnd(10)} | ${(our?.item_id||'N/A').padEnd(6)} ${ourWR.padEnd(10)} | ${match}`);
  }
}

main().catch(e => console.error(e));
