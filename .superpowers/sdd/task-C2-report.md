# Task C2: 英雄详情增强 -- T级总览卡片 + 阶段表现

**Status:** COMPLETED
**Date:** 2026-06-27

## Changes Made

### 1. champion-detail.json
- Added `"stage-bar": "/components/stage-bar/stage-bar"` to `usingComponents`
- `tier-badge` was already registered (no change needed)

### 2. champion-detail.js

**New data fields:**
- `championTierRank` (String) -- T1-T5 tier rank from cloud function
- `championRank` (Number) -- Global rank among all champions
- `totalChampions` (Number) -- Total champions in current patch
- `stagePerformanceByAugment` (Object) -- Map of `augment_id -> { stage: { win_rate, pick_rate, sample_size } }` for stages 3/7/11/15
- `selectedAugmentId` (Number|null) -- Currently selected augment for stage performance display
- `selectedAugmentName` (String) -- Display name of selected augment

**Modified `_processDetail(data)`:**
- Added `stage_performance` to destructuring from cloud function response
- Builds `stagePerformanceByAugment` map from the `stage_performance` array (indexed by `augment_id`, then by `stage`)
- Extracts `tier_rank`, `champion_rank`, `total_champions` from the champion object
- Auto-selects the highest win-rate augment in the active rarity as the initial `selectedAugmentId`

**Modified `_filterAugments(rarity)`:**
- Now also updates `selectedAugmentId` and `selectedAugmentName` to the top augment when switching rarity tabs
- Stage performance section updates reactively when user switches tabs

### 3. champion-detail.wxml

**Tier Overview Card** (inserted after hero-rate-section, before augments section):
- Displays `tier-badge` with `mode="T"` for T1-T5 display
- Shows win rate, pick rate, and rank (#X/total) in a row
- Includes a strength bar filled to `winRateValue`% with a green-to-red gradient

**Stage Performance Section** (inserted after items section, before closing page div):
- Conditionally shown when `selectedAugmentId` exists and has stage data
- Uses `stage-bar` component to render Lv.3/7/11/15 bar chart
- Subtitle displays the selected augment name
- Section hidden when no stage data is available for the selected augment

### 4. champion-detail.wxss

Added styles for:
- `.tier-overview-card` -- Card container with card bg, radius, shadow
- `.tier-overview-main` -- Flex row for tier badge + label
- `.tier-overview-stats` / `.tier-stat-item` / `.tier-stat-value` / `.tier-stat-label` -- Stats row layout
- `.tier-strength-bar` / `.tier-strength-fill` -- Gradient strength bar (green-yellow-orange-red)
- `.section-subtitle` -- Subtitle for stage performance section

## Data Flow

```
championDetail cloud function
  -> returns { champion: { tier_rank, champion_rank, total_champions },
               stage_performance: [{ augment_id, stage, win_rate, ... }] }
  -> _processDetail() builds stagePerformanceByAugment map
  -> Auto-selects top augment from active rarity
  -> WXML renders tier-badge mode="T" + stage-bar
  -> _filterAugments() updates selection on tab switch
```

## Integration Notes

- No existing functionality was broken -- all existing data processing, tab switching, and navigation remain intact
- The stage performance section gracefully degrades: if no stage data exists for the selected augment, the section is hidden entirely
- The `stage-bar` component handles the empty-state fallback ("该维度数据采集中...")
- `winRateValue` (already computed) is reused for the tier strength bar width
- `win_rate_display` and `pick_rate_display` (already computed) are reused in the tier overview card
