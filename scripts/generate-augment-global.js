// scripts/generate-augment-global.js - 从 champion×augment 数据聚合 augment 全局统计
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-export');
const PATCH = '26.12';

function parseCSV(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  // Skip BOM
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
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'; i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function mapTier(num) {
  const map = { '1': 'S', '2': 'A', '3': 'B', '4': 'C', '5': 'D' };
  return map[String(num)] || 'B';
}

function main() {
  const championAugments = parseCSV('champion-augments-real.csv');
  console.log(`读取 ${championAugments.length} 条 champion×augment 数据`);

  // Aggregate by augment_id
  const augStats = {};
  championAugments.forEach(ca => {
    const aid = ca.augment_id;
    if (!aid) return;
    if (!augStats[aid]) {
      augStats[aid] = { totalWR: 0, totalGames: 0, totalPR: 0, count: 0 };
    }
    const wr = parseFloat(ca.win_rate) || 0;
    const games = parseInt(ca.sample_size) || 100;
    const pr = parseFloat(ca.pick_rate) || 0;
    augStats[aid].totalWR += wr * games;
    augStats[aid].totalGames += games;
    augStats[aid].totalPR += pr;
    augStats[aid].count++;
  });

  // Generate augment global stats
  const augmentGlobalStats = [];
  for (const [aid, stats] of Object.entries(augStats)) {
    const avgWR = stats.totalGames > 0 ? stats.totalWR / stats.totalGames : 0;
    const avgPR = stats.totalPR / stats.count;
    augmentGlobalStats.push({
      _id: String(aid),
      riot_id: parseInt(aid),
      win_rate: Math.round(avgWR * 100) / 100,
      pick_rate: Math.round(avgPR * 100) / 100,
      champions_count: stats.count,
      tier: mapTier(Math.round(avgWR / 5)), // approximate tier mapping
      patch_version: PATCH,
      updated_at: new Date().toISOString()
    });
  }

  augmentGlobalStats.sort((a, b) => b.win_rate - a.win_rate);

  // Write CSV
  const allKeys = ['_id', 'riot_id', 'win_rate', 'pick_rate', 'champions_count', 'tier', 'patch_version', 'updated_at'];
  function escapeField(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
  const header = allKeys.map(escapeField).join(',');
  const rows = augmentGlobalStats.map(d => allKeys.map(k => escapeField(d[k])).join(','));
  const csv = '﻿' + header + '\n' + rows.join('\n');
  fs.writeFileSync(path.join(DATA_DIR, 'augment-global-real.csv'), csv, 'utf8');
  console.log(`augment-global-real.csv: ${augmentGlobalStats.length} 条`);

  // Show top augments
  console.log('\n=== Top 10 augments ===');
  augmentGlobalStats.slice(0, 10).forEach(a => {
    console.log(`  ${a.riot_id}: ${a.win_rate}% (${a.champions_count} champs)`);
  });
}

main();
