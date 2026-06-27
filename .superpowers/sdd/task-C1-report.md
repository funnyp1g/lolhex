# Task C1: 首页改造 — 集成英雄排行表

**Status:** Complete

## Files Modified

### 1. `miniprogram/pages/index/index.json`
- Added `"rank-table": "/components/rank-table/rank-table"` to `usingComponents`

### 2. `miniprogram/pages/index/index.js`
- Added **rank data fields** to `data`: `rankList`, `rankLoading`, `rankError`, `rankSortBy`, `rankSortOrder`, `rankPage`, `rankHasMore`
- Added **`loadChampionRankTable()`** method: calls `cloud.getChampionRankTable()` with sort/pagination params, processes returned data (resolves icon URLs via `image.resolveImageUrl`, normalizes `win_rate`/`pick_rate` percentages, formats `sample_size`), handles pagination (appends or replaces list depending on page number)
- Added **`onRankSort(e)`**: resets page/list on sort change and reloads
- Added **`onRankLoadMore()`**: increments page and appends more data
- Added **`onRankChampionTap(e)`**: navigates to `/pages/champion-detail/champion-detail?id=<championId>`
- Modified **`loadPageData()`**: added `this.loadChampionRankTable()` to `Promise.allSettled`, widened `hasData` check to include `this.data.rankList.length > 0`

### 3. `miniprogram/pages/index/index.wxml`
- Inserted the **rank-table section** between the patch banner (`patch-card`) and the hot augments section (`热门海克斯 TOP5`)
- Binds events: `bind:click`, `bind:sort`, `bind:loadmore`

### 4. `miniprogram/pages/index/index.wxss`
- **No changes needed.** The `.section`, `.section-header`, and `.section-title` classes already exist (lines 159-175) with equivalent functionality using project design tokens (`var(--spacing-lg)`, `var(--font-size-lg)`, `var(--color-text-primary)`, etc.). Adding duplicate selectors with hardcoded values would override these and potentially disrupt the other sections on the page.

## Verification Checklist
- [x] index.json registers `rank-table` component
- [x] index.js has all 6 rank data fields
- [x] index.js has 4 new methods (`loadChampionRankTable`, `onRankSort`, `onRankLoadMore`, `onRankChampionTap`)
- [x] `loadPageData` includes `loadChampionRankTable()` in `Promise.allSettled`
- [x] `hasData` check includes `rankList.length > 0`
- [x] index.wxml has rank-table section between patch banner and hot augments
- [x] Section styles already exist in index.wxss
- [x] Image URLs processed via `image.resolveImageUrl`
- [x] Win rate / pick rate normalized (multiply by 100 if < 1)

## Dependencies
- `cloud.getChampionRankTable` -- already exists in `utils/cloud.js` (line 26)
- `rank-table` component -- already exists at `components/rank-table/rank-table`
- `image.resolveImageUrl` -- already imported at top of index.js
- `formatSampleSize` -- already imported from `utils/format`
