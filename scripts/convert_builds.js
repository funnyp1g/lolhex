/**
 * Convert scraped champion-builds.json into a JS module for the cloud function.
 * Strips unnecessary fields to minimize file size.
 */
const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'data-export', 'champion-builds.json');
const OUTPUT = path.join(__dirname, '..', 'cloudfunctions', 'championDetail', 'data', 'champion-builds.js');

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));

const builds = raw.builds || {};
const minimized = {};

let totalBuilds = 0;
let totalCore = 0;

for (const [champId, buildList] of Object.entries(builds)) {
  minimized[champId] = buildList.map(b => ({
    tags: b.tags || [],
    games: b.games || 0,
    winRate: b.winRate || 0,
    pickRate: b.pickRate || 0,
    coreItems: (b.coreItems || []).map(ci => ({
      itemIds: ci.itemIds || [],
      itemNames: ci.itemNames || [],
      winRate: ci.winRate || 0
    })),
    startingItems: b.startingItems || [],
    situationalItems: b.situationalItems || []
  }));
  totalBuilds += buildList.length;
  totalCore += buildList.reduce((s, b) => s + (b.coreItems || []).length, 0);
}

const js = `// aramgg.com champion builds data (auto-generated from RSC payloads)
// Scraped: ${raw.scrapedAt || 'unknown'} | ${raw.success}/${raw.total} champions
module.exports = ${JSON.stringify(minimized, null, 2)};
`;

fs.writeFileSync(OUTPUT, js, 'utf-8');
const size = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
console.log(`Converted: ${Object.keys(minimized).length} champions, ${totalBuilds} builds, ${totalCore} core items`);
console.log(`Output: ${OUTPUT} (${size} KB)`);
if (raw.failed && raw.failed.length) {
  console.log(`Failed IDs: ${raw.failed.join(', ')}`);
}
