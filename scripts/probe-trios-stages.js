// scripts/probe-trios-stages.js - 检查 champion detail 中 trios 和 stage 的数据格式
const axios = require('axios');
const fs = require('fs');

const rscHeaders = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'text/x-component',
  'RSC': '1',
  'Next-Url': '/zh-CN/champion-stats/1',
};

async function main() {
  const res = await axios.get('https://aramgg.com/zh-CN/champion-stats/1', {
    headers: rscHeaders, timeout: 20000
  });
  const text = res.data;

  // Check trios format
  console.log('=== augment_trios format ===');
  const trioIdx = text.indexOf('augment_trios');
  if (trioIdx >= 0) {
    const excerpt = text.substring(trioIdx, trioIdx + 800);
    console.log(excerpt);
  }

  // Check for augment stage data
  console.log('\n=== Augment data with stage ===');
  // Find an augment entry with full data
  const augPattern = /"(\d{4})":\{[^}]+\}/g;
  let match, found = false;
  while ((match = augPattern.exec(text)) !== null) {
    const augData = match[0];
    if (augData.includes('stage') || augData.includes('perf')) {
      console.log('Found augment with stage:', augData.substring(0, 500));
      found = true;
      break;
    }
  }
  if (!found) {
    console.log('No stage data found in augment entries.');
    // Show a sample augment entry
    augPattern.lastIndex = 0;
    const firstMatch = augPattern.exec(text);
    if (firstMatch) {
      console.log('Sample augment entry:', firstMatch[0].substring(0, 300));
    }
  }

  // Search for different stage key names
  console.log('\n=== Stage-related key search ===');
  ['stage', 'perf', 'win_rate_tier', 'pick_rate_tier', 'num_games_tier'].forEach(key => {
    const count = (text.match(new RegExp(key, 'g')) || []).length;
    console.log(`  "${key}": ${count}`);
  });

  // Check the full augment object structure
  console.log('\n=== Full augment objects structure ===');
  const augStartIdx = text.indexOf('"augments":{');
  if (augStartIdx >= 0) {
    const augDataEnd = text.indexOf('},"items"', augStartIdx);
    if (augDataEnd >= 0) {
      const augSection = text.substring(augStartIdx, Math.min(augDataEnd + 100, augStartIdx + 2000));
      console.log('First 2000 chars of augments section:');
      console.log(augSection.substring(0, 2000));
    }
  }
}

main().catch(e => console.error(e));
