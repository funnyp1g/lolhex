// scripts/probe-aramgg-data.js - 探测 aramgg.com 的 /data/*.json 数据文件
const axios = require('axios');
const fs = require('fs');

async function main() {
  const headers = {'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)'};

  // Try common data JSON paths
  const dataPaths = [
    '/data/champions.json',
    '/data/champion-stats.json',
    '/data/augments.json',
    '/data/items.json',
    '/data/stats.json',
    '/data/aram.json',
    '/data/aram-mayhem.json',
    '/data/aram_mayhem.json',
    '/data/champion-augments.json',
    '/data/global-stats.json',
    '/data/overview.json',
    '/data/summary.json',
    '/data/zh-CN/champions.json',
    '/data/zh-CN/augments.json',
    '/data/en/champions.json',
    '/data/en/augments.json',
    '/data/patch.json',
    '/data/patches.json',
    '/data/meta.json',
    '/data/index.json',
    '/data/manifest.json',
  ];

  console.log('=== 探测 /data/*.json 文件 ===');
  for (const path of dataPaths) {
    try {
      const url = 'https://aramgg.com' + path;
      const res = await axios.get(url, { headers, timeout: 8000, validateStatus: () => true });
      if (res.status === 200) {
        const preview = typeof res.data === 'string' ? res.data.substring(0, 200) : JSON.stringify(res.data).substring(0, 200);
        console.log(`  ✅ ${path} → ${res.status} | ${preview}`);
        // Save the full data if it's JSON
        if (typeof res.data === 'object' || res.data.trim().startsWith('{') || res.data.trim().startsWith('[')) {
          const filename = 'data-export/aramgg-' + path.replace(/\//g, '-').replace(/^-/, '');
          fs.writeFileSync(filename, typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2));
          console.log(`    Saved to ${filename}`);
        }
      } else if (res.status === 404) {
        // skip
      } else {
        console.log(`  ❓ ${path} → ${res.status}`);
      }
    } catch (e) {
      // silent
    }
  }

  // Also try to list the /data/ directory
  console.log('\n=== 尝试 /data/ 目录 ===');
  try {
    const res = await axios.get('https://aramgg.com/data/', { headers, timeout: 8000, validateStatus: () => true });
    console.log(`  status: ${res.status}, type: ${res.headers['content-type']}`);
    console.log(`  body: ${res.data?.substring?.(0, 1000) || JSON.stringify(res.data).substring(0, 1000)}`);
  } catch (e) {
    console.log(`  ERR: ${e.message}`);
  }

  // Check what JS files reference
  console.log('\n=== 检查 JS 文件中的 API/数据引用 ===');
  const home = await axios.get('https://aramgg.com/zh-CN', { headers, timeout: 15000 });
  const jsFileMatch = home.data.match(/\/_next\/static\/chunks\/[a-zA-Z0-9_-]+\.js/g) || [];
  const uniqueJs = [...new Set(jsFileMatch)];

  // Pick a few JS files that might contain data fetching logic
  const dataFiles = uniqueJs.filter(f => f.includes('0ppbkkqnpa6-g') || uniqueJs.indexOf(f) < 3);
  for (const jsFile of dataFiles) {
    try {
      const jsRes = await axios.get('https://aramgg.com' + jsFile, { headers, timeout: 8000, validateStatus: () => true });
      if (jsRes.status === 200 && typeof jsRes.data === 'string') {
        // Search for API/data paths in the JS
        const dataRefs = jsRes.data.match(/\/data\/[^"'\s\]\[]+\.json/gi) || [];
        const apiRefs = jsRes.data.match(/\/api\/[^"'\s\]\[]+/gi) || [];
        const fetchRefs = jsRes.data.match(/fetch\(["'][^"']+["']\)/g) || [];
        if (dataRefs.length || apiRefs.length) {
          console.log(`  ${jsFile}:`);
          [...new Set(dataRefs)].slice(0, 10).forEach(r => console.log(`    data: ${r}`));
          [...new Set(apiRefs)].slice(0, 10).forEach(r => console.log(`    api: ${r}`));
          [...new Set(fetchRefs)].slice(0, 5).forEach(r => console.log(`    fetch: ${r}`));
        }
      }
    } catch (e) {}
  }
}

main().catch(e => console.error(e));
