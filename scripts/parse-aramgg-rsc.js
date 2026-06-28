// scripts/parse-aramgg-rsc.js - 解析 Next.js RSC 负载，提取真实数据
// Next.js RSC 格式：每行一个 chunk，格式为 <id>:<type><data>
// 类型: I[chunks,"export"] = client reference, "string", {json}, [...]
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};
const OUTPUT_DIR = path.join(__dirname, '..', 'data-export');
const PATCH = '26.12';

// 从 RSC 文本中提取所有 JSON 数据块
function parseRSCLines(text) {
  const chunks = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 匹配行格式: ID:VALUE
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) continue;

    const id = trimmed.substring(0, colonIdx);
    const value = trimmed.substring(colonIdx + 1);

    // 跳过纯数字 ID（这些是 chunk 标识符）
    if (!/^\d+$/.test(id)) continue;

    chunks.push({id: parseInt(id), value});
  }

  return chunks;
}

// 解析单个 RSC 值
function parseRSCValue(value) {
  if (!value || value === 'null' || value === '$undefined') return undefined;

  // 字符串: "escaped string"
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.substring(1, value.lastIndexOf('"'));
    }
  }

  // 数组: [...]
  if (value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // 对象: {...}
  if (value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Client reference: I[chunks,"export"]
  if (value.startsWith('I[')) {
    return { __type: 'client_ref', value };
  }

  // Template literal: T...
  if (value.startsWith('T')) {
    return { __type: 'template', value };
  }

  // Other (like "$Sreact.fragment", "$Wf", "$L5", etc.)
  return { __type: 'symbol', value };
}

// 递归搜索包含特定键的嵌套对象/数组
function findDataWithKeys(obj, targetKeys, results, path = '') {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => findDataWithKeys(item, targetKeys, results, `${path}[${i}]`));
    return;
  }

  // Check if this object has any target keys
  const hasTargetKeys = targetKeys.some(k => k in obj);
  if (hasTargetKeys) {
    results.push({path, data: obj});
  }

  // Recurse into children (limit depth)
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !path.includes(key)) {
      findDataWithKeys(val, targetKeys, results, `${path}.${key}`);
    }
  }
}

// 递归搜索包含特定值的字符串
function searchStrings(obj, patterns, results, path = '') {
  if (!obj) return;

  if (typeof obj === 'string') {
    for (const p of patterns) {
      if (obj.includes(p)) {
        results.push({path, value: obj.substring(0, 200)});
        break;
      }
    }
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => searchStrings(item, patterns, results, `${path}[${i}]`));
  } else if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !path.includes(key)) {
        searchStrings(val, patterns, results, `${path}.${key}`);
      }
    }
  }
}

async function fetchRSC(path) {
  const rscHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/x-component',
    'RSC': '1',
  };
  const res = await axios.get('https://aramgg.com' + path, {
    headers: {...rscHeaders, 'Next-Url': path},
    timeout: 15000
  });
  return res.data;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. 获取海克斯排行页（augments）- 包含最多数据
  console.log('=== [1/3] 获取海克斯排行页数据 ===');
  const augmentsRSC = await fetchRSC('/zh-CN/augments');
  const augChunks = parseRSCLines(augmentsRSC);
  console.log(`  解析出 ${augChunks.length} 个 chunks`);

  // 解析所有 chunk 的 value
  const augParsed = augChunks.map(c => ({id: c.id, value: parseRSCValue(c.value)}));
  const augJSON = augParsed.filter(c => c.value && typeof c.value === 'object' && !c.value.__type);

  // 搜索包含 win_rate 的对象
  const augDataTargets = [];
  augJSON.forEach(c => {
    findDataWithKeys(c.value, ['win_rate', 'winRate', 'pick_rate', 'pickRate', 'augment_id', 'augment_name', 'champion_id'], augDataTargets, `chunk_${c.id}`);
  });

  console.log(`  找到 ${augDataTargets.length} 个包含统计数据的节点`);
  augDataTargets.forEach(t => {
    const keys = Object.keys(t.data).slice(0, 10);
    const sample = JSON.stringify(t.data).substring(0, 300);
    console.log(`    ${t.path}: keys=[${keys.join(',')}] | ${sample}`);
  });

  // Save augments data
  fs.writeFileSync(path.join(OUTPUT_DIR, 'aramgg-augments-rsc.json'), JSON.stringify(augDataTargets, null, 2));
  console.log(`  已保存到 data-export/aramgg-augments-rsc.json`);

  // 2. 获取首页 (champion ranking)
  console.log('\n=== [2/3] 获取首页排行数据 ===');
  const homeRSC = await fetchRSC('/zh-CN');
  const homeChunks = parseRSCLines(homeRSC);
  console.log(`  解析出 ${homeChunks.length} 个 chunks`);

  const homeParsed = homeChunks.map(c => ({id: c.id, value: parseRSCValue(c.value)}));
  const homeJSON = homeParsed.filter(c => c.value && typeof c.value === 'object' && !c.value.__type);

  const homeDataTargets = [];
  homeJSON.forEach(c => {
    findDataWithKeys(c.value, ['winRate', 'pickRate', 'championId', 'championName', 'tier', 'rank'], homeDataTargets, `chunk_${c.id}`);
  });

  console.log(`  找到 ${homeDataTargets.length} 个包含统计数据的节点`);
  homeDataTargets.forEach(t => {
    const keys = Object.keys(t.data).slice(0, 15);
    const sample = JSON.stringify(t.data).substring(0, 500);
    console.log(`    ${t.path}: keys=[${keys.join(',')}] | ${sample}`);
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'aramgg-homepage-rsc.json'), JSON.stringify(homeDataTargets, null, 2));
  console.log(`  已保存到 data-export/aramgg-homepage-rsc.json`);

  // 3. 获取一个英雄详情页
  console.log('\n=== [3/3] 获取英雄详情数据 (ID=1) ===');
  const champRSC = await fetchRSC('/zh-CN/champion-stats/1');
  const champChunks = parseRSCLines(champRSC);
  console.log(`  解析出 ${champChunks.length} 个 chunks`);

  const champParsed = champChunks.map(c => ({id: c.id, value: parseRSCValue(c.value)}));
  const champJSON = champParsed.filter(c => c.value && typeof c.value === 'object' && !c.value.__type);

  const champDataTargets = [];
  champJSON.forEach(c => {
    findDataWithKeys(c.value, ['win_rate', 'winRate', 'pick_rate', 'pickRate', 'augment', 'champion', 'item', 'stage'], champDataTargets, `chunk_${c.id}`);
  });

  console.log(`  找到 ${champDataTargets.length} 个包含统计数据的节点`);
  champDataTargets.forEach(t => {
    const keys = Object.keys(t.data).slice(0, 15);
    const sample = JSON.stringify(t.data).substring(0, 500);
    console.log(`    ${t.path}: keys=[${keys.join(',')}] | ${sample}`);
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'aramgg-champion-rsc.json'), JSON.stringify(champDataTargets, null, 2));
  console.log(`  已保存到 data-export/aramgg-champion-rsc.json`);

  console.log('\n=== 完成 ===');
  console.log('数据已导出到 data-export/ 目录');
}

main().catch(e => console.error(e));
