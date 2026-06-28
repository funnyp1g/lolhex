// scripts/extract-aramgg-rsc.js - 提取 aramgg.com RSC payload 中的真实数据
const axios = require('axios');
const fs = require('fs');

const BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'};

async function main() {
  // Fetch the champion detail page
  console.log('=== 提取英雄详情页 RSC 数据 ===');
  const champ = await axios.get('https://aramgg.com/zh-CN/champion-stats/1', {headers: BROWSER, timeout: 15000});
  const html = champ.data;

  // Extract all self.__next_f.push() payloads
  const pushPattern = /self\.__next_f\.push\((\[.*?\]\)\s*);?\s*(?:<\/script>)?/gs;
  const pushes = [];
  let match;
  while ((match = pushPattern.exec(html)) !== null) {
    pushes.push(match[1]);
  }

  console.log(`Found ${pushes.length} RSC pushes`);

  // Try a broader pattern - everything between self.__next_f.push([1," and "])
  const dataPattern = /self\.__next_f\.push\(\[1,"([^"]*(?:\\.[^"]*)*)"\]\)/g;
  const dataPushes = [];
  while ((match = dataPattern.exec(html)) !== null) {
    dataPushes.push(match[1]);
  }
  console.log(`Found ${dataPushes.length} data pushes with [1,"... pattern`);

  if (dataPushes.length > 0) {
    // Save all data pushes for analysis
    fs.writeFileSync('data-export/rsc-pushes.json', JSON.stringify(dataPushes, null, 2));
    console.log('Saved to data-export/rsc-pushes.json');

    // Look for champion/augment data patterns in the pushes
    let fullData = dataPushes.join('\n');
    console.log(`Total data size: ${fullData.length} chars`);

    // Search for known keys
    const keys = ['win_rate', 'winRate', 'pick_rate', 'pickRate', 'champion', 'augment', 'tier', 'sample_size', 'sampleSize'];
    keys.forEach(k => {
      const count = (fullData.match(new RegExp(k, 'gi')) || []).length;
      if (count > 0) console.log(`  "${k}" mentions: ${count}`);
    });

    // Try to find JSON structures
    const jsonPattern = /\{[^}]{10,500}\}/g;
    const jsonBlobs = [];
    while ((match = jsonPattern.exec(fullData)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        jsonBlobs.push(parsed);
      } catch {}
    }
    console.log(`Parsable JSON blobs: ${jsonBlobs.length}`);
    if (jsonBlobs.length > 0) {
      fs.writeFileSync('data-export/rsc-json-blobs.json', JSON.stringify(jsonBlobs.slice(0, 50), null, 2));
      console.log('First 50 blobs saved to data-export/rsc-json-blobs.json');
    }
  }

  // Also check the homepage for champion table data
  console.log('\n=== 提取首页 RSC 数据 ===');
  const home = await axios.get('https://aramgg.com/zh-CN', {headers: BROWSER, timeout: 15000});
  const homeHtml = home.data;

  const homePushes = [];
  const homePattern = /self\.__next_f\.push\(\[1,"([^"]*(?:\\.[^"]*)*)"\]\)/g;
  while ((match = homePattern.exec(homeHtml)) !== null) {
    homePushes.push(match[1]);
  }
  console.log(`Homepage data pushes: ${homePushes.length}`);

  if (homePushes.length > 0) {
    let homeData = homePushes.join('\n');
    console.log(`Total homepage data: ${homeData.length} chars`);

    const keys = ['win_rate', 'winRate', 'pick_rate', 'pickRate', 'champion', 'augment', 'tier'];
    keys.forEach(k => {
      const count = (homeData.match(new RegExp(k, 'gi')) || []).length;
      if (count > 0) console.log(`  "${k}" mentions: ${count}`);
    });

    // Save homepage data
    fs.writeFileSync('data-export/homepage-rsc-pushes.json', JSON.stringify(homePushes, null, 2));
    console.log('Saved to data-export/homepage-rsc-pushes.json');
  }
}

main().catch(e => console.error(e));
