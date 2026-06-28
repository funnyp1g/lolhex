/**
 * Scrape champion builds data from aramgg.com RSC payloads.
 * Stores 3-item core builds per champion, matching aramgg's exact format.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// aramgg redirects /champion/{id} to /champion-stats/{id}
const ARAMGG_RSC = (id) => `https://aramgg.com/zh-CN/champion-stats/${id}`;
const OUTPUT = path.join(__dirname, '..', 'data-export', 'champion-builds.json');

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extractBuilds(text) {
  const marker = '"builds":[';
  const idx = text.indexOf(marker);
  if (idx < 0) return null;

  let pos = idx + marker.length - 1; // point to opening [
  let depth = 1;
  let end = pos;
  for (let i = pos + 1; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  try {
    return JSON.parse(text.substring(pos, end));
  } catch (e) {
    return null;
  }
}

async function main() {
  // Get champion list from champions-stats.json
  console.log('Fetching champion list...');
  const statsText = await fetch('https://aramgg.com/data/champions-stats.json');
  const champions = JSON.parse(statsText);
  const ids = champions.map(c => c.championId);
  console.log(`Found ${ids.length} champions`);

  const allBuilds = {};
  let success = 0;
  const failed = [];

  for (let i = 0; i < ids.length; i++) {
    const cid = ids[i];
    try {
      process.stdout.write(`[${i + 1}/${ids.length}] Champion ${cid}... `);
      const text = await fetch(ARAMGG_RSC(cid), { 'RSC': '1' });
      const builds = extractBuilds(text);
      if (builds) {
        allBuilds[cid] = builds;
        const n = builds.reduce((s, b) => s + (b.coreItems || []).length, 0);
        console.log(`OK (${builds.length} builds, ${n} core)`);
        success++;
      } else {
        console.log('No builds');
        failed.push(cid);
      }
      // Small delay to be polite
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      failed.push(cid);
    }
  }

  const output = {
    scrapedAt: new Date().toISOString(),
    total: ids.length,
    success,
    failed,
    builds: allBuilds
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nDone! ${success}/${ids.length} champions. Saved to ${OUTPUT}`);
  if (failed.length) console.log('Failed:', failed);
}

main().catch(console.error);
