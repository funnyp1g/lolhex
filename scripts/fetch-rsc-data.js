// scripts/fetch-rsc-data.js - 通过 Next.js RSC 协议获取 aramgg.com 数据
const axios = require('axios');
const fs = require('fs');

async function main() {
  // Next.js App Router uses RSC content-type negotiation
  const rscHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/x-component',  // RSC content type
    'Next-Router-State-Tree': '%5B%22%22%2C%22champion-stats%22%2C%221%22%5D',
    'Next-Url': '/zh-CN/champion-stats/1',
    'RSC': '1',
  };

  const paths = [
    '/zh-CN/champion-stats/1',
    '/zh-CN',
    '/zh-CN/augments',
  ];

  for (const path of paths) {
    console.log(`\n=== Trying ${path} with RSC headers ===`);
    try {
      const res = await axios.get('https://aramgg.com' + path, {
        headers: {...rscHeaders, 'Next-Url': path},
        timeout: 15000,
        validateStatus: () => true
      });
      console.log(`  Status: ${res.status}`);
      console.log(`  Content-Type: ${res.headers['content-type']}`);
      const preview = typeof res.data === 'string' ? res.data.substring(0, 500) : JSON.stringify(res.data).substring(0, 500);
      console.log(`  Body preview: ${preview}`);

      // Check if it contains actual data
      if (typeof res.data === 'string') {
        const dataKeys = ['win_rate', 'winRate', 'pick_rate', 'pickRate', 'champion_name', 'augment_name'];
        dataKeys.forEach(k => {
          const count = (res.data.match(new RegExp(k, 'g')) || []).length;
          if (count > 0) console.log(`    "${k}" mentions: ${count}`);
        });
      }

      // If it's RSC data, save it
      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 100) {
        const filename = 'data-export/rsc-' + path.replace(/\//g, '-') + '.txt';
        fs.writeFileSync(filename, res.data);
        console.log(`  Saved to ${filename}`);
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // Also try Next.js data endpoint with _rsc query
  console.log('\n=== Trying _rsc query parameter ===');
  try {
    const res = await axios.get('https://aramgg.com/zh-CN/champion-stats/1?_rsc=1bhjk', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/x-component',
      },
      timeout: 15000,
      validateStatus: () => true
    });
    console.log(`  Status: ${res.status}, Content-Type: ${res.headers['content-type']}`);
    const preview = typeof res.data === 'string' ? res.data.substring(0, 1000) : JSON.stringify(res.data).substring(0, 1000);
    console.log(`  Body: ${preview}`);
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

main().catch(e => console.error(e));
