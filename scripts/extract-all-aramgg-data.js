// scripts/extract-all-aramgg-data.js
// 从 aramgg.com RSC 负载中提取所有真实统计数据
// 生成云数据库可直接导入的 JSON 文件
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};
const OUTPUT_DIR = path.join(__dirname, '..', 'data-export');
const PATCH = '26.12';

// Tier 映射: T1-T5 (aramgg's internal tier) -> S/A/B/C/D
function mapTier(tierNum) {
  const map = { '1': 'S', '2': 'A', '3': 'B', '4': 'C', '5': 'D' };
  return map[tierNum] || 'C';
}

// RSC headers
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
    timeout: 15000
  });
  return res.data;
}

// 从 RSC 文本中提取所有 JSON 数组（包含特定键的对象数组）
function extractArrays(text, keyPattern) {
  const results = [];
  // 匹配 JSON 数组中包含特定键的对象
  // 使用贪婪匹配找到 {...} 对象在 [... ] 中的模式
  const regex = new RegExp(`"${keyPattern}"\\s*:\\s*"[^"]*"[^}]*\\}[^\\]]*`, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push(match[0]);
  }
  return results;
}

// 从文本中提取所有形如 [{...},{...}] 的 JSON 数组
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
          } catch (e) {
            // ignore parse errors
          }
        }
        start = -1;
      }
    }
  }
  return arrays;
}

// 从文本中提取所有形如 {...} 的 JSON 对象
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
          } catch (e) {
            // ignore
          }
        }
        start = -1;
      }
    }
  }
  return objects;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ====== 1. 从 augments 页面获取所有海克斯数据 ======
  console.log('=== [1] 获取海克斯排行数据 ===');
  const augmentsRSC = await fetchRSC('/zh-CN/augments');

  // 提取所有 JSON 数组
  const augArrays = extractJSONArrays(augmentsRSC);
  console.log(`  提取到 ${augArrays.length} 个 JSON 数组`);

  // 找到包含 top_champions 的数组
  const augmentChampionData = [];
  const augmentInfoMap = {};

  augArrays.forEach(arr => {
    if (arr.length > 0 && arr[0] && typeof arr[0] === 'object') {
      const first = arr[0];
      // 检查是否包含 champion_id + win_rate（海克斯×英雄数据）
      if ('champion_id' in first && 'win_rate' in first) {
        augmentChampionData.push(...arr);
      }
      // 检查是否包含 augment 基础信息
      if ('augment_id' in first || 'augment_name' in first) {
        arr.forEach(item => {
          if (item.augment_id && !augmentInfoMap[item.augment_id]) {
            augmentInfoMap[item.augment_id] = item;
          }
        });
      }
    }
  });

  console.log(`  海克斯×英雄数据: ${augmentChampionData.length} 条`);
  console.log(`  海克斯基础信息: ${Object.keys(augmentInfoMap).length} 个`);

  // 提取所有 JSON 对象
  const augObjects = extractJSONObjects(augmentsRSC);
  console.log(`  提取到 ${augObjects.length} 个 JSON 对象`);

  // 找包含 augment_id 和 win_rate 的对象
  const augmentStats = augObjects.filter(o => 'augment_id' in o && 'win_rate' in o && 'pick_rate' in o);
  console.log(`  海克斯全局统计: ${augmentStats.length} 个`);

  // ====== 2. 从首页获取英雄排行 ======
  console.log('\n=== [2] 获取首页英雄排行 ===');
  const homeRSC = await fetchRSC('/zh-CN');
  const homeArrays = extractJSONArrays(homeRSC);
  console.log(`  提取到 ${homeArrays.length} 个 JSON 数组`);

  // 找到包含 champion 排行数据的数组
  const championRankings = [];
  homeArrays.forEach(arr => {
    if (arr.length > 0 && arr[0] && typeof arr[0] === 'object') {
      const first = arr[0];
      if ('champion_id' in first && 'win_rate' in first && !('augment_id' in first)) {
        championRankings.push(...arr);
      }
    }
  });
  console.log(`  英雄排行数据: ${championRankings.length} 条`);

  // ====== 3. 获取英雄详情（抽样几个） ======
  console.log('\n=== [3] 获取英雄详情（抽样） ===');
  // 先获取几个英雄详情来确定数据格式
  const sampleChampions = [1, 30, 888, 555, 777];
  const championDetails = [];

  for (const cid of sampleChampions) {
    try {
      const champRSC = await fetchRSC(`/zh-CN/champion-stats/${cid}`);
      const champArrays = extractJSONArrays(champRSC);

      // 查找包含 augment_id 和 items 的数据
      champArrays.forEach(arr => {
        if (arr.length > 0 && arr[0] && typeof arr[0] === 'object') {
          const first = arr[0];
          if ('augment_id' in first && 'win_rate' in first) {
            championDetails.push({
              champion_id: cid,
              type: 'augments',
              data: arr
            });
          }
          if ('item_id' in first || ('name' in first && arr.some(i => i.win_rate))) {
            championDetails.push({
              champion_id: cid,
              type: 'items',
              data: arr
            });
          }
        }
      });
    } catch (e) {
      console.log(`  英雄 ${cid} 获取失败: ${e.message}`);
    }
  }

  console.log(`  获取到 ${championDetails.length} 个数据组`);

  // ====== 4. 生成云数据库导入文件 ======
  console.log('\n=== [4] 生成导入文件 ===');

  // 4a. champion_augments
  const championAugments = [];
  const seenCA = new Set();

  augmentChampionData.forEach(item => {
    const championId = parseInt(item.champion_id);
    const augmentId = parseInt(item.augment_id);
    const winRate = parseFloat(item.win_rate) * 100; // 小数 -> 百分比
    const pickRate = parseFloat(item.pick_rate) * 100;
    const sampleSize = parseInt(item.num_games) || 1000;
    const tier = mapTier(item.tier || '3');
    const key = `${championId}_${augmentId}`;

    if (!seenCA.has(key) && !isNaN(championId) && !isNaN(augmentId)) {
      seenCA.add(key);
      championAugments.push({
        _id: `${championId}_${augmentId}_${PATCH}`,
        champion_id: championId,
        augment_id: augmentId,
        win_rate: Math.round(winRate * 100) / 100,
        pick_rate: Math.round(pickRate * 100) / 100,
        sample_size: sampleSize,
        tier,
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      });
    }
  });

  // 4b. augment 全局统计
  const augmentGlobalStats = [];
  augmentStats.forEach(item => {
    const augmentId = parseInt(item.augment_id);
    if (!isNaN(augmentId)) {
      augmentGlobalStats.push({
        _id: String(augmentId),
        riot_id: augmentId,
        win_rate: Math.round(parseFloat(item.win_rate) * 10000) / 100,
        pick_rate: Math.round(parseFloat(item.pick_rate) * 10000) / 100,
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      });
    }
  });

  // 4c. champion 全局统计
  const championGlobalStats = [];
  championRankings.forEach(item => {
    const championId = parseInt(item.champion_id);
    if (!isNaN(championId)) {
      championGlobalStats.push({
        _id: String(championId),
        riot_id: championId,
        win_rate: Math.round(parseFloat(item.win_rate) * 10000) / 100,
        pick_rate: Math.round(parseFloat(item.pick_rate || item.pick_rate_avg || 0) * 10000) / 100,
        patch_version: PATCH,
        updated_at: new Date().toISOString()
      });
    }
  });

  // 写入文件
  const writeJSON = (filename, data) => {
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  ${filename}: ${data.length} 条`);
  };

  console.log('\n写入文件:');
  writeJSON('champion-augments-real.json', championAugments);
  writeJSON('augment-global-real.json', augmentGlobalStats);
  writeJSON('champion-global-real.json', championGlobalStats);

  // 保存原始数据供分析
  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw-augment-data.json'), JSON.stringify(augmentChampionData.slice(0, 50), null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw-champion-rankings.json'), JSON.stringify(championRankings.slice(0, 50), null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw-champion-details.json'), JSON.stringify(championDetails, null, 2));

  console.log(`\n=== 采集摘要 ===`);
  console.log(`海克斯×英雄适配: ${championAugments.length} 条（从 ${augmentChampionData.length} 条原始数据）`);
  console.log(`海克斯全局统计: ${augmentGlobalStats.length} 个`);
  console.log(`英雄全局统计: ${championGlobalStats.length} 个`);
  console.log(`\n数据导出至 data-export/ 目录`);
}

main().catch(e => console.error(e));
