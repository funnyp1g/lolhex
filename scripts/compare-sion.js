// scripts/compare-sion.js - 对比 Sion 在我们数据和 aramgg.com 上的数据
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

async function main() {
  // First find Sion's ID - search through aramgg.com HTML
  console.log('=== 1. 查找亡灵战神 (Sion) 的 ID ===');

  // Try fetching the homepage HTML to find Sion's link
  const homeRes = await axios.get('https://aramgg.com/zh-CN', {
    headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 15000
  });

  // Search for 亡灵 or 赛恩 in hrefs
  const linkRegex = /\/zh-CN\/champion-stats\/(\d+)[^>]*>([^<]*亡[^<]*|[^<]*赛[^<]*)</gi;
  let sionId = null;
  let match;
  while ((match = linkRegex.exec(homeRes.data)) !== null) {
    console.log(`  Found: ID ${match[1]} -> ${match[2]}`);
    if (!sionId) sionId = match[1];
  }

  // If not found in homepage, search champion list from HTML
  if (!sionId) {
    // Try common Sion IDs
    const candidateIds = [14, 15, 16, 17];
    for (const cid of candidateIds) {
      try {
        const htmlRes = await axios.get(`https://aramgg.com/zh-CN/champion-stats/${cid}`, {
          headers: {'User-Agent': 'Mozilla/5.0'}, timeout: 10000
        });
        if (htmlRes.data.includes('亡灵') || htmlRes.data.includes('赛恩') || htmlRes.data.includes('Sion')) {
          sionId = String(cid);
          console.log(`  Found Sion: ID ${cid}`);
          break;
        }
      } catch(e) {}
    }
  }

  if (!sionId) {
    console.log('  Sion not found in HTML, checking all candidates...');
    // Check more IDs
    for (const cid of [14, 35, 36, 54, 55, 57, 75, 77, 78, 79, 98, 111, 112, 113, 114]) {
      try {
        const rscRes = await axios.get(`https://aramgg.com/zh-CN/champion-stats/${cid}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/x-component',
            'RSC': '1',
            'Next-Url': `/zh-CN/champion-stats/${cid}`,
          },
          timeout: 10000
        });
        if (rscRes.data.includes('赛恩') || rscRes.data.includes('Sion')) {
          sionId = String(cid);
          console.log(`  Found Sion via RSC: ID ${cid}`);
          break;
        }
      } catch(e) {}
    }
  }

  console.log(`\n  亡灵战神 ID = ${sionId || 'NOT FOUND'}`);

  if (!sionId) {
    console.log('  无法确定 Sion 的 ID，尝试用 ID 14');
    sionId = '14';
  }

  // ====== 2. 从 aramgg.com 获取 Sion 的真实数据 ======
  console.log(`\n=== 2. 从 aramgg.com 获取 Sion (ID=${sionId}) 的真实数据 ===`);

  const rscHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'text/x-component',
    'RSC': '1',
    'Next-Url': `/zh-CN/champion-stats/${sionId}`,
  };
  const rscRes = await axios.get(`https://aramgg.com/zh-CN/champion-stats/${sionId}`, {
    headers: rscHeaders, timeout: 20000
  });
  const text = rscRes.data;

  // Extract champion stats
  const champIdIdx = text.indexOf('"championId":"' + sionId + '"');
  console.log('  championStats position:', champIdIdx);

  // Extract augment data
  const augStart = text.indexOf('"augments":{');
  const itemsStart = text.indexOf('"items":{');
  const triosStart = text.indexOf('"augment_trios":{');

  console.log(`  augments section: ${augStart}`);
  console.log(`  items section: ${itemsStart}`);
  console.log(`  trios section: ${triosStart}`);

  // Extract first few augments
  if (augStart >= 0) {
    const augSection = text.substring(augStart + 11, augStart + 3000);
    console.log(`\n  --- Augments (first 3000 chars) ---`);
    console.log(augSection.substring(0, 1500));
  }

  // Extract first few items
  if (itemsStart >= 0) {
    const itemsSection = text.substring(itemsStart + 8, itemsStart + 5000);
    console.log(`\n  --- Items (first 2000 chars) ---`);
    console.log(itemsSection.substring(0, 2000));
  }

  // ====== 3. 对比我们的 CSV 数据 ======
  console.log(`\n=== 3. 我们的 CSV 数据 (Sion ID=${sionId}) ===`);

  const ca = parseCSV('champion-augments-real.csv');
  const ci = parseCSV('champion-items-real.csv');

  const sionAugs = ca.filter(r => r.champion_id === sionId)
    .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate));
  console.log(`\n  --- champion_augments (${sionAugs.length} 条) ---`);
  sionAugs.slice(0, 10).forEach(a => {
    console.log(`    augment_id=${a.augment_id}, win_rate=${a.win_rate}%, pick_rate=${a.pick_rate}%, games=${a.sample_size}, rank=${a.rank}, tier=${a.tier}`);
  });

  const sionItems = ci.filter(r => r.champion_id === sionId)
    .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate));
  console.log(`\n  --- champion_items (${sionItems.length} 条) ---`);
  sionItems.slice(0, 10).forEach(item => {
    console.log(`    item_id=${item.item_id}, win_rate=${item.win_rate}%, pick_rate=${item.pick_rate}%, games=${item.sample_size}, tier=${item.tier}`);
  });

  // champion global
  const cg = parseCSV('champion-global-real.csv');
  const sionGlobal = cg.find(r => r.riot_id === sionId || r._id === sionId);
  if (sionGlobal) {
    console.log(`\n  --- champion global ---`);
    console.log(`    win_rate=${sionGlobal.win_rate}%, pick_rate=${sionGlobal.pick_rate}%, games=${sionGlobal.num_games}, tier=${sionGlobal.tier}`);
  }
}

main().catch(e => console.error(e));
