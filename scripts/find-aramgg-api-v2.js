// scripts/find-aramgg-api-v2.js - 通过分析 JS chunk 找到真正的 API 端点
const axios = require('axios');
const fs = require('fs');

const BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};

async function main() {
  // Get homepage to find JS chunks
  const home = await axios.get('https://aramgg.com/zh-CN', {headers: BROWSER, timeout: 15000});
  const html = home.data;

  // Find all JS chunk URLs
  const chunkPattern = /\/_next\/static\/chunks\/[a-zA-Z0-9_-]+\.js/g;
  const allChunks = [...new Set(html.match(chunkPattern) || [])];
  console.log(`Found ${allChunks.length} unique JS chunks`);

  // Download each chunk and search for API/data patterns
  const apiPatterns = [];
  const seenPatterns = new Set();

  for (const chunkUrl of allChunks.slice(0, 20)) { // limit to first 20
    try {
      const fullUrl = 'https://aramgg.com' + chunkUrl;
      const res = await axios.get(fullUrl, {headers: BROWSER, timeout: 10000});
      const code = res.data;

      // Search for various patterns
      const patterns = [
        {regex: /\/api\/[a-zA-Z0-9_\/?=&%-]+/g, label: 'api-path'},
        {regex: /\/data\/[a-zA-Z0-9_\/.-]+\.json/g, label: 'data-json'},
        {regex: /https?:\/\/[a-zA-Z0-9.-]+\/api\/[a-zA-Z0-9_\/?=&%-]+/g, label: 'full-api-url'},
        {regex: /fetch\(["'][^"']*["']\)/g, label: 'fetch'},
        {regex: /baseURL\s*[:=]\s*["'][^"']*["']/g, label: 'baseURL'},
        {regex: /API_URL\s*[:=]\s*["'][^"']*["']/g, label: 'API_URL'},
      ];

      patterns.forEach(({regex, label}) => {
        const matches = code.match(regex) || [];
        matches.forEach(m => {
          if (!seenPatterns.has(m)) {
            seenPatterns.add(m);
            apiPatterns.push({label, value: m, chunk: chunkUrl.split('/').pop()});
          }
        });
      });
    } catch (e) {
      // skip failed downloads
    }
  }

  // Print unique findings
  console.log(`\n=== API/Data Patterns Found ===`);

  // Group by label
  const grouped = {};
  apiPatterns.forEach(p => {
    if (!grouped[p.label]) grouped[p.label] = [];
    grouped[p.label].push(p.value);
  });

  for (const [label, values] of Object.entries(grouped)) {
    const unique = [...new Set(values)];
    console.log(`\n${label} (${unique.length}):`);
    unique.slice(0, 15).forEach(v => console.log(`  ${v}`));
  }

  // Also try specific API calls
  console.log('\n=== Trying API Endpoints ===');
  const apis = [
    'https://aramgg.com/api/statistics?type=champions',
    'https://aramgg.com/api/statistics?type=augments',
    'https://aramgg.com/api/statistics?type=all',
    'https://aramgg.com/api/champions/list',
    'https://aramgg.com/api/augments/list',
    'https://aramgg.com/api/v1/champions',
    'https://aramgg.com/api/v1/augments',
    'https://aramgg.com/api/data/champions',
    'https://aramgg.com/api/data/augments',
    'https://aramgg.com/api/data/statistics',
  ];

  for (const api of apis) {
    try {
      const res = await axios.get(api, {
        headers: {...BROWSER, 'Accept': 'application/json, */*', 'X-Requested-With': 'XMLHttpRequest'},
        timeout: 8000,
        validateStatus: () => true
      });
      if (res.status !== 404) {
        const contentType = res.headers['content-type'] || '';
        const preview = typeof res.data === 'string' ? res.data.substring(0, 200) : JSON.stringify(res.data).substring(0, 200);
        console.log(`  ${api} -> ${res.status} [${contentType.split(';')[0]}] ${preview}`);
      }
    } catch (e) {
      // skip
    }
  }
}

main().catch(e => console.error(e));
