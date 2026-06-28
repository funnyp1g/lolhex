/**
 * Enrich builds: resolve starting/situational item names to IDs + icons.
 * Uses ITEM_CN_MAP + coreItems data as name→ID lookup.
 */
const fs = require('fs');
const path = require('path');

const BUILDS_PATH = path.join(__dirname, '..', 'data-export', 'champion-builds.json');
const DD_VERSION = '16.13.1';
const DD_ICON = (id) => id ? `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}/img/item/${id}.png` : '';

// Load ITEM_CN_MAP
const itemCnModule = require('../cloudfunctions/patchBaseData/data/item-cn-map');
const ITEM_MAP = itemCnModule.ITEM_CN_MAP || itemCnModule;

// Build reverse lookup: Chinese name → item ID
// Priority: coreItems from aramgg (verified) > ITEM_CN_MAP
const nameToId = {};

// First pass: ITEM_CN_MAP as base
for (const [idStr, info] of Object.entries(ITEM_MAP)) {
  const nameZh = info.name_zh;
  if (nameZh) nameToId[nameZh] = parseInt(idStr);
}
console.log(`ITEM_CN_MAP: ${Object.keys(nameToId).length} mappings`);

// Load builds
const buildsData = JSON.parse(fs.readFileSync(BUILDS_PATH, 'utf-8'));
const builds = buildsData.builds || {};

// Second pass: coreItems OVERRIDE (aramgg's own names→IDs are authoritative)
for (const buildList of Object.values(builds)) {
  for (const build of buildList) {
    for (const ci of (build.coreItems || [])) {
      const ids = ci.itemIds || [];
      const names = ci.itemNames || [];
      for (let i = 0; i < Math.min(ids.length, names.length); i++) {
        if (names[i]) nameToId[names[i]] = ids[i]; // Override ITEM_CN_MAP
      }
    }
  }
}
console.log(`After core items (overrides): ${Object.keys(nameToId).length} mappings`);

// Helper: resolve a name (string) or fix an already-object with id=0
function resolveItem(item) {
  if (typeof item === 'string') {
    const id = nameToId[item] || 0;
    return { id, name: item, icon_url: DD_ICON(id) };
  }
  // Already an object
  if (item && typeof item === 'object') {
    const name = item.name || '';
    if (item.id && item.id > 0) return item; // Already resolved
    const id = nameToId[name] || 0;
    return { id, name, icon_url: DD_ICON(id) };
  }
  return { id: 0, name: String(item || ''), icon_url: '' };
}

// Enrich
let resolvedStart = 0, unresolvedStart = 0;
let resolvedSit = 0, unresolvedSit = 0;
const unresolvedNames = new Set();

for (const buildList of Object.values(builds)) {
  for (const build of buildList) {
    build.startingItems = (build.startingItems || []).map(item => {
      const r = resolveItem(item);
      if (r.id > 0) resolvedStart++; else { unresolvedStart++; unresolvedNames.add(r.name); }
      return r;
    });
    build.situationalItems = (build.situationalItems || []).map(item => {
      const r = resolveItem(item);
      if (r.id > 0) resolvedSit++; else { unresolvedSit++; unresolvedNames.add(r.name); }
      return r;
    });
  }
}

console.log(`Starting: ${resolvedStart} resolved, ${unresolvedStart} unresolved`);
console.log(`Situational: ${resolvedSit} resolved, ${unresolvedSit} unresolved`);
if (unresolvedNames.size) {
  console.log(`Unresolved (${unresolvedNames.size}):`, [...unresolvedNames].sort().slice(0, 30));
}

fs.writeFileSync(BUILDS_PATH, JSON.stringify(buildsData, null, 2), 'utf-8');
console.log(`Saved: ${BUILDS_PATH}`);
