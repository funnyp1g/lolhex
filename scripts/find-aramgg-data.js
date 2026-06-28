// scripts/find-aramgg-data.js - 找出 aramgg.com 数据来源
const axios = require('axios');
const fs = require('fs');

const GOOGLEBOT = {'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'};
const BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};

async function main() {
  // Try various data path patterns
  console.log('=== /data/* paths with Googlebot UA ===');
  const paths = [
    '/data/statistics.json',
    '/data/statistics/overview.json',
    '/data/statistics/champions.json',
    '/data/statistics/augments.json',
    '/data/en/statistics.json',
    '/data/zh-CN/statistics.json',
    '/data/global.json',
    '/data/champions.json',
    '/data/augments.json',
  ];

  for (const p of paths) {
    try {
      const res = await axios.get('https://aramgg.com' + p, {headers: GOOGLEBOT, timeout: 8000, validateStatus: () => true});
      if (res.status === 200) {
        const preview = typeof res.data === 'string' ? res.data.substring(0, 300) : JSON.stringify(res.data).substring(0, 300);
        console.log(`  ${p} -> ${res.status}: ${preview}`);
      } else if (res.status !== 404) {
        console.log(`  ${p} -> ${res.status}`);
      }
    } catch(e) {}
  }

  // Check sitemap
  console.log('\n=== Sitemap ===');
  try {
    const sm = await axios.get('https://aramgg.com/sitemap.xml', {headers: GOOGLEBOT, timeout: 8000, validateStatus: () => true});
    console.log('sitemap.xml: ' + sm.status);
    if (sm.status === 200) console.log(sm.data.substring(0, 2000));
  } catch(e) { console.log('sitemap ERR: ' + e.message); }

  // Find Next.js data routes
  console.log('\n=== Next.js Analysis ===');
  const home = await axios.get('https://aramgg.com/zh-CN', {headers: BROWSER, timeout: 15000});

  const buildIdMatch = home.data.match(/\/([a-zA-Z0-9_-]{10,30})\/_buildManifest/);
  if (buildIdMatch) console.log('Build ID: ' + buildIdMatch[1]);

  // Look for self.__next_f or other Next.js data patterns
  const selfNext = home.data.match(/self\.__next_f[^}]*/g);
  console.log('self.__next_f patterns: ' + (selfNext ? selfNext.length : 0));
  if (selfNext) selfNext.slice(0, 3).forEach(s => console.log('  ' + s.substring(0, 100)));

  // Check champion page for data patterns
  console.log('\n=== Champion Page Deep Analysis ===');
  const champ = await axios.get('https://aramgg.com/zh-CN/champion-stats/1', {headers: BROWSER, timeout: 15000});

  // Look for any JSON-like structures that might contain data
  const jsonBlobs = champ.data.match(/\{[^{}]*"(?:win_rate|pick_rate|champion_id|augment_id|tier)"[^{}]*\}/g);
  console.log('Inline JSON with stats keys: ' + (jsonBlobs ? jsonBlobs.length : 0));
  if (jsonBlobs) jsonBlobs.slice(0, 3).forEach(j => console.log('  ' + j.substring(0, 150)));

  // Look for <script id="__NEXT_DATA__">
  const nextData = champ.data.match(/<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  console.log('__NEXT_DATA__: ' + (nextData ? 'FOUND (' + nextData[1].length + ' chars)' : 'NOT found'));

  // Check for RSC payloads
  const rscMatches = champ.data.match(/\/_next\/data\/[^"'\s]+/g) || [];
  console.log('_next/data refs: ' + rscMatches.length);
  rscMatches.slice(0, 5).forEach(r => console.log('  ' + r));

  // Download one of the main JS chunks to look for API endpoints
  const mainChunk = home.data.match(/\/_next\/static\/chunks\/[a-zA-Z0-9_-]+-g\.js/);
  if (mainChunk) {
    console.log('\n=== Main Chunk: ' + mainChunk[0] + ' ===');
    try {
      const chunkRes = await axios.get('https://aramgg.com' + mainChunk[0], {headers: BROWSER, timeout: 10000});
      const chunk = chunkRes.data;

      // Search for API/data endpoints
      const apiRefs = chunk.match(/\/api\/[^"'\s\]\[]+/gi) || [];
      const dataRefs = chunk.match(/\/data\/[^"'\s\]\[]+\.json/gi) || [];
      const fetchRefs = chunk.match(/fetch\(["'][^"']+["']\)/g) || [];
      const hostRefs = chunk.match(/https?:\/\/[a-zA-Z0-9.-]+(?:\/[^"'\s\]\[]*)?/gi) || [];
      const uniqueHosts = [...new Set(hostRefs.map(h => {
        try { return new URL(h).hostname; } catch { return h.substring(0, 50); }
      }))];

      console.log('API refs: ' + (apiRefs.length ? [...new Set(apiRefs)].slice(0,10).join(', ') : 'none'));
      console.log('Data refs: ' + (dataRefs.length ? [...new Set(dataRefs)].slice(0,10).join(', ') : 'none'));
      console.log('Unique hosts: ' + uniqueHosts.filter(h => !h.includes('aramgg.com') && !h.includes('next')).slice(0,10).join(', '));
    } catch(e) {
      console.log('Error downloading chunk: ' + e.message);
    }
  }

  // Try the aramgg.com internal API that the Next.js app might use
  console.log('\n=== Internal API attempts ===');
  const internalPaths = [
    '/api/statistics',
    '/api/champions',
    '/api/augments',
    '/api/champion/1',
    '/api/augment/1',
  ];
  for (const p of internalPaths) {
    try {
      const res = await axios.get('https://aramgg.com' + p, {
        headers: {...BROWSER, 'Accept': 'application/json'},
        timeout: 8000,
        validateStatus: () => true
      });
      if (res.status !== 404) {
        console.log(`  ${p} -> ${res.status} (${res.headers['content-type']})`);
      }
    } catch(e) {}
  }
}

main().catch(e => console.error(e));
