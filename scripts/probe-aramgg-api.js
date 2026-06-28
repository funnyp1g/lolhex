// scripts/probe-aramgg-api.js - 探测 aramgg.com 的 API 端点
const axios = require('axios');
const fs = require('fs');

async function main() {
  const headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};

  // Try various API patterns
  const apiPaths = [
    '/api/v1/champions',
    '/api/champions',
    '/api/stats',
    '/api/aram/champions',
    '/api/aram_mayhem/champions',
    '/api/v1/aram/champions',
    '/zh-CN/api/champions',
    '/_next/data/0ppbkkqnpa6/zh-CN/champion-stats/1.json',
    '/zh-CN/champion-stats/1?format=json',
  ];

  console.log('=== 探测 API 端点 ===');
  for (const path of apiPaths) {
    try {
      const url = 'https://aramgg.com' + path;
      const res = await axios.get(url, { headers, timeout: 8000, validateStatus: () => true });
      const preview = typeof res.data === 'string' ? res.data.substring(0, 150) : JSON.stringify(res.data).substring(0, 150);
      console.log(`  ${path} → ${res.status} ${res.headers['content-type']?.substring(0,40) || '?'} | ${preview}`);
    } catch (e) {
      console.log(`  ${path} → ERR: ${e.message}`);
    }
  }

  // Check robots.txt and sitemap
  console.log('\n=== robots.txt / sitemap ===');
  try {
    const robots = await axios.get('https://aramgg.com/robots.txt', { headers, timeout: 8000 });
    console.log(robots.data.substring(0, 500));
  } catch (e) {
    console.log('robots.txt: ' + e.message);
  }

  // Check what JS chunks are being loaded
  console.log('\n=== JS Chunks ===');
  const home = await axios.get('https://aramgg.com/zh-CN', { headers, timeout: 15000 });
  const jsFiles = home.data.match(/\/_next\/static\/chunks\/[^"'\s]+\.js/g) || [];
  const unique = [...new Set(jsFiles)];
  console.log(`Found ${unique.length} unique JS files`);
  unique.slice(0, 10).forEach(f => console.log(`  ${f}`));

  // Look for any API-like URLs in the HTML
  const apiUrls = home.data.match(/https?:\/\/[^"'\s<>]*api[^"'\s<>]*/gi) || [];
  console.log(`\nAPI URLs in HTML: ${apiUrls.length}`);
  apiUrls.slice(0, 5).forEach(u => console.log(`  ${u}`));

  // Look for fetch/XHR patterns
  const fetchPatterns = home.data.match(/fetch\(["'][^"']*["']\)/g) || [];
  console.log(`\nfetch() calls: ${fetchPatterns.length}`);
  fetchPatterns.slice(0, 5).forEach(f => console.log(`  ${f}`));

  // Check if data is in a different Next.js data format
  const nextDataMatches = home.data.match(/\/_next\/data\/[^"'\s]+/g) || [];
  console.log(`\n_next/data paths: ${nextDataMatches.length}`);
  nextDataMatches.slice(0, 5).forEach(f => console.log(`  ${f}`));

  // Try to find the build ID
  const buildIdMatch = home.data.match(/\/_next\/static\/([^/]+)\/_buildManifest/);
  if (buildIdMatch) console.log(`\nBuild ID: ${buildIdMatch[1]}`);

  // Look for inline JSON data structures
  const inlineJson = home.data.match(/\{[^}]*"win_rate"[^}]*\}/g) || [];
  console.log(`\nInline win_rate patterns: ${inlineJson.length}`);
}

main().catch(e => console.error(e));
