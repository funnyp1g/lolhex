// scripts/probe-aramgg.js - 分析 aramgg.com 页面结构，确定数据提取方式
const axios = require('axios');
const fs = require('fs');

async function main() {
  const headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html'};

  // Check homepage
  console.log('=== 分析首页 ===');
  const home = await axios.get('https://aramgg.com/zh-CN', { headers, timeout: 15000 });

  const patterns = ['__NEXT_DATA__', 'application/ld+json', 'window.__DATA__', 'window.__NUXT__', 'window.__INITIAL_STATE__'];
  patterns.forEach(p => {
    const idx = home.data.indexOf(p);
    console.log(`  ${p}: ${idx >= 0 ? 'FOUND at ' + idx : 'not found'}`);
  });

  // Look for any script tag with id
  const scriptIds = home.data.match(/<script[^>]*id="([^"]*)"[^>]*>/g);
  console.log(`  Script tags with id: ${(scriptIds || []).join(', ')}`);

  fs.writeFileSync('data-export/homepage-head.html', home.data.substring(0, 3000));

  // Check champion detail page
  console.log('\n=== 分析英雄详情页 (ID=1) ===');
  const champ = await axios.get('https://aramgg.com/zh-CN/champion-stats/1', { headers, timeout: 15000 });

  patterns.forEach(p => {
    const idx = champ.data.indexOf(p);
    console.log(`  ${p}: ${idx >= 0 ? 'FOUND at ' + idx : 'not found'}`);
  });

  const winRateMatches = champ.data.match(/"win_rate"/g);
  console.log(`  "win_rate" mentions: ${winRateMatches ? winRateMatches.length : 0}`);

  const augmentMatches = champ.data.match(/"augment_id"|"augment_name"|"augment"/g);
  console.log(`  augment mentions: ${augmentMatches ? augmentMatches.length : 0}`);

  // Check for API endpoints in the page
  const apiMatches = champ.data.match(/https?:\/\/[^"'\s]*api[^"'\s]*/gi) || [];
  console.log(`  API URLs found: ${apiMatches.length > 0 ? apiMatches.slice(0, 5).join(', ') : 'none'}`);

  // Check for embedded JSON data blocks
  const jsonScripts = champ.data.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi);
  console.log(`  application/json scripts: ${jsonScripts ? jsonScripts.length : 0}`);
  if (jsonScripts) {
    jsonScripts.forEach((s, i) => {
      console.log(`    [${i}]: ${s.substring(0, 200)}...`);
    });
  }

  fs.writeFileSync('data-export/champion-page-head.html', champ.data.substring(0, 5000));

  // Check augment page
  console.log('\n=== 分析海克斯详情页 ===');
  const aug = await axios.get('https://aramgg.com/zh-CN/augments', { headers, timeout: 15000 });
  console.log(`  Page size: ${aug.data.length} chars`);

  // Look for data structures
  const dataAttrs = aug.data.match(/data-[\w-]+="[^"]*"/gi) || [];
  console.log(`  data-* attrs (first 5): ${dataAttrs.slice(0, 5).join(', ')}`);

  console.log('\n=== 完成 ===');
  console.log('页面片段已保存到 data-export/');
}

main().catch(e => console.error(e));
