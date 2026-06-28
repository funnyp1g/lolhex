// scripts/fetch-all-champions.js
// 从 aramgg.com 拉取所有 170 个英雄的完整数据（英雄视角）
// 包括：全局统计、海克斯适配、装备推荐、三海克斯组合
// 用法：node scripts/fetch-all-champions.js
// 输出：data-export/ 目录下的 CSV 文件

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'data-export');
const PATCH = '26.12';
const CONCURRENT = 3;
const DELAY = 200;

// 常见英雄 ID（从 aramgg.com 首页或 HTML 提取）
const CHAMPION_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 48, 50, 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
  67, 68, 69, 72, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 89, 90, 91,
  92, 96, 98, 99, 101, 102, 103, 104, 105, 106, 107, 110, 111, 112, 113, 114, 115,
  117, 119, 120, 121, 122, 126, 127, 131, 133, 134, 136, 141, 142, 143, 145, 147,
  150, 154, 157, 161, 163, 164, 166, 200, 201, 202, 203, 221, 222, 223, 233, 234,
  235, 236, 238, 240, 245, 246, 254, 266, 267, 268, 350, 360, 412, 420, 421, 427,
  429, 432, 497, 498, 516, 517, 518, 523, 526, 555, 711, 777, 799, 800, 804, 805,
  875, 876, 887, 888, 893, 895, 897, 901, 902, 904, 910, 950
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rscHeaders(path) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/x-component',
    'RSC': '1',
    'Next-Url': path,
  };
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

function mapTier(tierStr) {
  const map = { '1': 'S', '2': 'A', '3': 'B', '4': 'C', '5': 'D' };
  return map[String(tierStr)] || 'B';
}

async function fetchChampionDetail(championId) {
  const path = `/zh-CN/champion-stats/${championId}`;
  const rsc = await fetchRSC(path);
  const objects = extractJSONObjects(rsc);
  const arrays = extractJSONArrays(rsc);

  return { championId, objects, arrays, rsc };
}

async function fetchRSC(path) {
  const res = await axios.get('https://aramgg.com' + path, {
    headers: rscHeaders(path),
    timeout: 20000
  });
  return res.data;
}

function parseChampionData(championId, objects, arrays) {
  const result = {
    championId,
    stats: null,
    augments: {},
    items: [],
    trios: [],
    stagePerformance: []
  };

  // Find champion stats object
  for (const obj of objects) {
    // Champion stats: {championId, championStats: {winRate, pickRate, tier, numGames}}
    if (obj.championStats && obj.championStats.championId) {
      result.stats = {
        champion_id: championId,
        win_rate: Math.round(obj.championStats.winRate * 10000) / 100,
        pick_rate: Math.round(obj.championStats.pickRate * 10000) / 100,
        num_games: obj.championStats.numGames,
        tier: mapTier(obj.championStats.tier),
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      };
    }

    // Augments data: {augments: {"augId": {tier, rank, win_rate, num_games, pick_rate, ...}}, ...}
    if (obj.augments && typeof obj.augments === 'object' && !result.augments) {
      // Only take the first such object (there might be duplicates)
    }
    if (obj.augments && typeof obj.augments === 'object' && Object.keys(obj.augments).length > 1) {
      result.augments = obj.augments;
    }

    // Items data: might be in various formats
    if (obj.items && typeof obj.items === 'object' && Object.keys(obj.items).length > 1) {
      result.items = obj.items;
    }

    // Augment trios
    if (obj.augment_trios) {
      if (Array.isArray(obj.augment_trios)) {
        result.trios = obj.augment_trios;
      } else if (typeof obj.augment_trios === 'object') {
        result.trios = obj.augment_trios;
      }
    }

    // Stage performance within augments
    if (obj.augments && typeof obj.augments === 'object') {
      for (const [augId, augData] of Object.entries(obj.augments)) {
        if (augData && typeof augData === 'object' && augData.augment_stage_stats) {
          // stage data is embedded in each augment entry
        }
      }
    }
  }

  return result;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`=== 从 aramgg.com 采集 ${CHAMPION_IDS.length} 个英雄的完整数据 ===\n`);

  const championGlobalStats = [];
  const championAugments = [];
  const championItems = [];
  const augmentTrios = [];
  const stagePerformance = [];
  const seenCA = new Set();
  const seenCI = new Set();
  const seenAT = new Set();
  const seenSP = new Set();

  let success = 0, fail = 0;

  for (let i = 0; i < CHAMPION_IDS.length; i += CONCURRENT) {
    const batch = CHAMPION_IDS.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      batch.map(async (cid) => {
        await sleep(Math.random() * DELAY);
        try {
          const data = await fetchChampionDetail(cid);
          return { ...data, ok: true };
        } catch (e) {
          return { championId: cid, ok: false, error: e.message };
        }
      })
    );

    for (const r of results) {
      const idx = CHAMPION_IDS.indexOf(r.championId);
      if (r.ok) {
        success++;
        process.stdout.write(`  [${idx + 1}/${CHAMPION_IDS.length}] ID ${r.championId} ✅\n`);
      } else {
        fail++;
        process.stdout.write(`  [${idx + 1}/${CHAMPION_IDS.length}] ID ${r.championId} ❌ ${r.error}\n`);
        continue;
      }

      const objs = r.objects;
      const arrs = r.arrays;

      // ---- Extract champion stats ----
      for (const obj of objs) {
        if (obj.championStats && obj.championStats.championId && obj.championStats.winRate !== undefined) {
          const cs = obj.championStats;
          championGlobalStats.push({
            _id: String(r.championId),
            riot_id: r.championId,
            win_rate: Math.round(cs.winRate * 10000) / 100,
            pick_rate: Math.round((cs.pickRate || 0) * 10000) / 100,
            num_games: cs.numGames || 0,
            tier: mapTier(cs.tier),
            patch_version: PATCH,
            updated_at: new Date().toISOString()
          });
          break; // only need one stats object per champion
        }
      }

      // ---- Extract augment data (英雄×海克斯) ----
      for (const obj of objs) {
        if (obj.augments && typeof obj.augments === 'object' && Object.keys(obj.augments).length > 3) {
          for (const [augIdStr, augData] of Object.entries(obj.augments)) {
            if (!augData || typeof augData !== 'object') continue;
            const augmentId = parseInt(augIdStr);
            if (isNaN(augmentId)) continue;

            const wr = parseFloat(augData.win_rate);
            const pr = parseFloat(augData.pick_rate);
            const games = parseInt(augData.num_games) || 100;
            if (isNaN(wr)) continue;

            const key = `${r.championId}_${augmentId}`;
            if (!seenCA.has(key)) {
              seenCA.add(key);
              championAugments.push({
                _id: `${r.championId}_${augmentId}_${PATCH}`,
                champion_id: r.championId,
                augment_id: augmentId,
                win_rate: Math.round(wr * 10000) / 100,
                pick_rate: Math.round(pr * 10000) / 100,
                sample_size: games,
                rank: parseInt(augData.rank) || 0,
                tier: mapTier(augData.tier),
                patch_version: PATCH,
                updated_at: new Date().toISOString()
              });
            }

            // Extract stage performance from augment entry
            if (augData.augment_stage_stats && Array.isArray(augData.augment_stage_stats)) {
              augData.augment_stage_stats.forEach(stage => {
                const stageLevel = { '1': 3, '2': 7, '3': 11, '4': 15 }[stage.augment_stage] || 3;
                const spKey = `${r.championId}_${augmentId}_${stageLevel}`;
                if (!seenSP.has(spKey)) {
                  seenSP.add(spKey);
                  stagePerformance.push({
                    _id: `${r.championId}_${augmentId}_${stageLevel}_${PATCH}`,
                    champion_id: r.championId,
                    augment_id: augmentId,
                    stage: stageLevel,
                    win_rate: Math.round(parseFloat(stage.win_rate) * 10000) / 100,
                    sample_size: parseInt(stage.num_games) || 50,
                    tier: mapTier(stage.tier),
                    patch_version: PATCH,
                    updated_at: new Date().toISOString()
                  });
                }
              });
            }
          }
          break; // only process the main augments object once
        }
      }

      // ---- Extract items data ----
      for (const obj of objs) {
        if (obj.items && typeof obj.items === 'object' && Object.keys(obj.items).length > 1) {
          for (const [itemIdStr, itemData] of Object.entries(obj.items)) {
            if (!itemData || typeof itemData !== 'object') continue;
            const itemId = parseInt(itemIdStr);
            if (isNaN(itemId)) continue;

            const wr = parseFloat(itemData.win_rate);
            const pr = parseFloat(itemData.pick_rate);
            if (isNaN(wr)) continue;

            const key = `${r.championId}_${itemId}`;
            if (!seenCI.has(key)) {
              seenCI.add(key);
              championItems.push({
                _id: `${r.championId}_${itemId}_${PATCH}`,
                champion_id: r.championId,
                item_id: itemId,
                win_rate: Math.round(wr * 10000) / 100,
                pick_rate: Math.round(pr * 10000) / 100,
                sample_size: parseInt(itemData.num_games) || 100,
                tier: mapTier(itemData.tier),
                patch_version: PATCH,
                updated_at: new Date().toISOString()
              });
            }
          }
          break;
        }
      }

      // ---- Extract augment trios (keys are "augId1:augId2:augId3") ----
      for (const obj of objs) {
        if (obj.augment_trios && typeof obj.augment_trios === 'object') {
          for (const [trioKey, trioData] of Object.entries(obj.augment_trios)) {
            if (!trioData || typeof trioData !== 'object') continue;
            const idStrs = trioKey.split(':');
            if (idStrs.length !== 3) continue;
            const ids = idStrs.map(Number).filter(n => !isNaN(n));
            if (ids.length !== 3) continue;
            const sorted = [...ids].sort((a, b) => a - b);
            const key = `${sorted.join('_')}_${r.championId}`;
            if (!seenAT.has(key)) {
              seenAT.add(key);
              augmentTrios.push({
                _id: `${sorted.join('_')}_${r.championId}_${PATCH}`,
                augment_ids: sorted,
                champion_id: r.championId,
                win_rate: 0, // aramgg trios use win_rate_tier (tier rank) instead of actual win_rate
                sample_size: parseInt(trioData.num_games) || 50,
                tier: mapTier(trioData.win_rate_tier),
                patch_version: PATCH,
                updated_at: new Date().toISOString()
              });
            }
          }
          break;
        }
      }
    }

    if (i + CONCURRENT < CHAMPION_IDS.length) await sleep(DELAY);
  }

  console.log(`\n完成: ${success} 成功, ${fail} 失败`);

  // ---- Write output files ----
  console.log('\n=== 生成 CSV 文件 ===');

  function writeCSV(filename, data) {
    if (data.length === 0) { console.log(`  ${filename}: 0 条 (跳过)`); return; }
    const allKeys = new Set();
    data.forEach(d => Object.keys(d).forEach(k => allKeys.add(k)));
    const keys = Array.from(allKeys);

    function escapeField(val) {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }

    const header = keys.map(escapeField).join(',');
    const rows = data.map(d => keys.map(k => escapeField(d[k])).join(','));
    const csv = '﻿' + header + '\n' + rows.join('\n');
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, csv, 'utf8');
    console.log(`  ${filename}: ${data.length} 条, ${keys.length} 列`);
  }

  writeCSV('champion-global-real.csv', championGlobalStats);
  writeCSV('champion-augments-real.csv', championAugments);
  writeCSV('champion-items-real.csv', championItems);
  writeCSV('augment-trios-real.csv', augmentTrios);
  writeCSV('champion-stage-performance-real.csv', stagePerformance);

  console.log(`\n=== 采集摘要 ===`);
  console.log(`英雄全局统计: ${championGlobalStats.length}`);
  console.log(`英雄×海克斯: ${championAugments.length}`);
  console.log(`英雄×装备: ${championItems.length}`);
  console.log(`三海克斯组合: ${augmentTrios.length}`);
  console.log(`阶段表现: ${stagePerformance.length}`);
  console.log(`\nCSV 文件已导出至: ${OUTPUT_DIR}`);
}

main().catch(e => console.error(e));
