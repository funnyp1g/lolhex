// scripts/final-extract-data.js
// 从 aramgg.com 提取完整真实数据并生成云数据库导入文件
// 策略：HTML提取ID顺序 + RSC提取数据块 → 按位置匹配
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
        const objStr = text.substring(start, i + 1);
        if (objStr.length > 10 && objStr.length < 100000) {
          try { objects.push(JSON.parse(objStr)); } catch (e) {}
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

// Stage mapping: aramgg uses 1-5, we use 3/7/11/15
const STAGE_MAP = { '1': 3, '2': 7, '3': 11, '4': 15, '5': 18 };

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ====== Step 1: Get augment IDs from HTML ======
  console.log('=== Step 1: 获取海克斯 ID 列表 ===');
  const htmlRes = await axios.get('https://aramgg.com/zh-CN/augments', {
    headers: BROWSER, timeout: 15000
  });
  const html = htmlRes.data;
  const augIdRegex = /\/zh-CN\/augments\/(\d+)/g;
  const augmentIds = [];
  let match;
  while ((match = augIdRegex.exec(html)) !== null) {
    const id = parseInt(match[1]);
    if (!augmentIds.includes(id)) augmentIds.push(id);
  }
  console.log(`  提取到 ${augmentIds.length} 个海克斯 ID（按页面顺序）`);

  // ====== Step 2: Get augment data blocks from RSC ======
  console.log('\n=== Step 2: 获取海克斯数据块 ===');
  const augRSC = await fetchRSC('/zh-CN/augments');
  const augObjects = extractJSONObjects(augRSC);
  const augDataBlocks = augObjects.filter(o => o.top_champions && o.win_rate);
  console.log(`  提取到 ${augDataBlocks.length} 个数据块`);

  if (augDataBlocks.length !== augmentIds.length) {
    console.log(`  ⚠️ 数量不匹配: ${augDataBlocks.length} blocks vs ${augmentIds.length} IDs, 使用较小值`);
  }

  // ====== Step 3: Match augment IDs with data blocks by position ======
  console.log('\n=== Step 3: 匹配并生成数据 ===');
  const count = Math.min(augDataBlocks.length, augmentIds.length);

  const championAugments = [];
  const championStagePerformance = [];
  const augmentGlobalStats = [];
  const seenCA = new Set();

  for (let i = 0; i < count; i++) {
    const augmentId = augmentIds[i];
    const block = augDataBlocks[i];

    // Augment global stats
    augmentGlobalStats.push({
      _id: String(augmentId),
      riot_id: augmentId,
      win_rate: Math.round(parseFloat(block.win_rate) * 10000) / 100,
      pick_rate: Math.round(parseFloat(block.pick_rate) * 10000) / 100,
      num_games: parseInt(block.num_games) || 0,
      tier: mapTier(block.tier),
      patch_version: PATCH,
      updated_at: new Date().toISOString()
    });

    // Champion × Augment (from top_champions)
    const topChamps = block.top_champions || [];
    topChamps.forEach(champ => {
      const championId = parseInt(champ.champion_id);
      const wr = parseFloat(champ.win_rate) * 100;
      const pr = parseFloat(champ.pick_rate) * 100;
      const games = parseInt(champ.num_games) || 1000;
      const key = `${championId}_${augmentId}`;

      if (!seenCA.has(key) && !isNaN(championId)) {
        seenCA.add(key);
        championAugments.push({
          _id: `${championId}_${augmentId}_${PATCH}`,
          champion_id: championId,
          augment_id: augmentId,
          win_rate: Math.round(wr * 100) / 100,
          pick_rate: Math.round(pr * 100) / 100,
          sample_size: games,
          rank: parseInt(champ.champion_rank) || 0,
          tier: mapTier(champ.tier),
          patch_version: PATCH,
          updated_at: new Date().toISOString()
        });
      }
    });

    // Stage performance
    const stageStats = block.augment_stage_stats || [];
    stageStats.forEach(stage => {
      const stageLevel = STAGE_MAP[stage.augment_stage] || parseInt(stage.augment_stage) * 3;
      const stageWR = parseFloat(stage.win_rate) * 100;
      const stageGames = parseInt(stage.num_games) || 100;

      championStagePerformance.push({
        _id: `${augmentId}_${stageLevel}_global_${PATCH}`,
        champion_id: null, // global augment stage performance
        augment_id: augmentId,
        stage: stageLevel,
        win_rate: Math.round(stageWR * 100) / 100,
        sample_size: stageGames,
        tier: mapTier(stage.tier),
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      });
    });
  }

  // ====== Step 4: Champion ranking from homepage HTML ======
  console.log('\n=== Step 4: 英雄排行 ===');
  const homeHtml = await axios.get('https://aramgg.com/zh-CN', {
    headers: BROWSER, timeout: 15000
  });

  // Extract champion data from homepage
  const homeObjects = extractJSONObjects(homeHtml.data);
  const championStats = [];

  // Look for champion data objects in HTML
  homeObjects.forEach(obj => {
    if (obj.championId || obj.champion_id) {
      championStats.push(obj);
    }
  });

  // Also extract from arrays in homepage HTML
  const homeArrays2 = [];
  {
    const text = homeHtml.data;
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
          try { homeArrays2.push(JSON.parse(text.substring(start, i + 1))); } catch (e) {}
          start = -1;
        }
      }
    }
  }

  // Find arrays with champion ranking data (typically arrays of objects with championId)
  const championRankings = [];
  homeArrays2.forEach(arr => {
    if (Array.isArray(arr) && arr.length > 10 && arr[0] && typeof arr[0] === 'object') {
      if ('championId' in arr[0]) {
        championRankings.push(...arr);
      }
    }
  });

  console.log(`  HTML对象含championId: ${championStats.length}`);
  console.log(`  数组中的英雄排行: ${championRankings.length}`);

  // Save raw data for inspection
  if (championRankings.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'raw-champion-rankings.json'), JSON.stringify(championRankings.slice(0, 10), null, 2));
    console.log('  示例排行数据已保存');
  }

  // ====== Step 5: Write output files ======
  console.log('\n=== Step 5: 写入输出文件 ===');
  const writeJSON = (filename, data) => {
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  ${filename}: ${data.length} 条`);
  };

  writeJSON('champion-augments-real.json', championAugments);
  writeJSON('augment-global-real.json', augmentGlobalStats);
  writeJSON('champion-stage-performance-real.json', championStagePerformance);

  if (championRankings.length > 0) {
    const champGlobal = championRankings.map(c => ({
      _id: String(c.championId),
      riot_id: c.championId,
      win_rate: c.winRate ? Math.round(parseFloat(c.winRate) * 10000) / 100 : 0,
      pick_rate: c.pickRate ? Math.round(parseFloat(c.pickRate) * 10000) / 100 : 0,
      patch_version: PATCH,
      updated_at: new Date().toISOString()
    }));
    writeJSON('champion-global-real.json', champGlobal);
  }

  console.log(`\n=== 采集摘要 ===`);
  console.log(`海克斯×英雄适配: ${championAugments.length} 条`);
  console.log(`海克斯全局统计: ${augmentGlobalStats.length} 条`);
  console.log(`阶段表现: ${championStagePerformance.length} 条`);
  console.log(`\n导出至: ${OUTPUT_DIR}`);
}

main().catch(e => console.error(e));
